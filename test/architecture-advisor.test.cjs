'use strict';

// Tests for skills/architecture-advisor/scripts/arch-check.cjs and its HTML template.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SKILL = path.join(ROOT, 'skills', 'architecture-advisor');
const TEMPLATE = path.join(SKILL, 'assets', 'architecture-view.html');
const ac = require(path.join(SKILL, 'scripts', 'arch-check.cjs'));

const clone = x => JSON.parse(JSON.stringify(x));
const readTemplate = () => fs.readFileSync(TEMPLATE, 'utf8');
function exampleData() {
  const data = ac.loadData(TEMPLATE);
  assert.equal(data.example, true);
  delete data.example;
  return data;
}
function run(...argv) {
  const out = [];
  const err = [];
  const code = ac.main(argv, { out: s => out.push(s), err: s => err.push(s) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}
function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-check-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const errsOf = data => ac.validate(data).errs.join('\n');

test('the template example is flagged only for "example": true', () => {
  const { errs } = ac.validate(ac.loadData(TEMPLATE));
  assert.equal(errs.length, 1);
  assert.match(errs[0], /^example/);
});

test('the template without "example" validates clean and warns about assumption-only scores', () => {
  const { errs, warns } = ac.validate(exampleData());
  assert.deepEqual(errs, []);
  assert.ok(warns.some(w => /assumption/.test(w)));
});

test('validation rules', () => {
  const mutate = fn => { const d = exampleData(); fn(d); return errsOf(d); };
  assert.match(mutate(d => { d.drivers[0].weight = 31; }), /sum to 101/);
  assert.match(mutate(d => { delete d.candidates[0].scores.q3; }), /missing score for driver "q3"/);
  assert.match(mutate(d => { d.candidates[1].scores.q1.score = 6; }), /number from 1 to 5/);
  assert.match(mutate(d => { d.candidates[1].scores.q2.why = ' '; }), /does not count/);
  assert.match(mutate(d => { d.candidates[1].scores.q3.source = 'maybe'; }), /http\(s\) URL/);
  assert.match(mutate(d => { d.candidates[0].scores.q1.source = 'javascript:alert(1)'; }), /http\(s\) URL/);
  assert.match(mutate(d => { d.candidates[1].recommended = true; }), /exactly one/);
  assert.match(mutate(d => { d.candidates[0].recommended = false; }), /exactly one/);
  assert.match(mutate(d => { d.candidates[0].diagram.edges[0].to = 'xxx'; }), /node "xxx" does not exist/);
  assert.match(mutate(d => {
    const n = d.candidates[0].diagram.nodes;
    n[2].col = n[1].col; n[2].row = n[1].row;
  }), /same cell/);
  assert.match(mutate(d => { d.candidates[0].diagram.nodes[0].kind = 'cloud'; }), /kind/);
  assert.match(mutate(d => { d.candidates[0].reversal = 'baixo'; }), /low, medium or high/);
});

test('warnings: "current" without a transition driver, and a recommended alternative that is not the leader', () => {
  const d = exampleData();
  d.candidates[0].id = 'current';
  assert.match(ac.validate(d).warns.join('\n'), /transition cost/);
  const e = exampleData();
  e.candidates[0].recommended = false;
  e.candidates[1].recommended = true;
  assert.match(ac.validate(e).warns.join('\n'), /not the recommended/);
});

test('a "<" in a measurable scenario is not flagged as markup', () => {
  assert.equal(ac.validate(exampleData()).warns.filter(w => /markup/.test(w)).length, 0);
  const d = exampleData();
  d.candidates[0].summary = '<img src=x onerror=alert(1)>';
  assert.ok(ac.validate(d).warns.some(w => /markup/.test(w)));
});

test('CLI exit codes: invalid JSON is 2, validation errors are 1, a good file is 0', t => {
  const dir = tmpDir(t);
  const bad = path.join(dir, 'bad.json');
  fs.writeFileSync(bad, '{ nope');
  const r = run('validate', bad);
  assert.equal(r.code, 2);
  assert.match(r.err, /invalid JSON/);
  const weights = path.join(dir, 'weights.json');
  const d = exampleData();
  d.drivers[0].weight = 99;
  fs.writeFileSync(weights, JSON.stringify(d));
  assert.equal(run('validate', weights).code, 1);
  const good = path.join(dir, 'good.json');
  fs.writeFileSync(good, JSON.stringify(exampleData()));
  const ok = run('validate', good);
  assert.equal(ok.code, 0);
  assert.match(ok.out, /Ranking/);
  assert.equal(run('nope').code, 2);
});

// ---- sensitivity ----

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bruteLeaders(data, idx, step = 0.05) {
  const { ids, rows } = ac.matrix(data);
  const w0 = data.drivers.map(d => Number(d.weight));
  const seen = new Set();
  for (let x = 0; x <= 100 + 1e-9; x += step) {
    const w = w0.slice();
    w[idx] = x;
    const tot = {};
    for (const id of ids) tot[id] = ac.totalOf(w, rows[id]);
    const lead = ac.leadersOf(tot);
    if (lead.length === 1) seen.add(lead.join()); // exact ties at a flip point are not intervals
  }
  return seen;
}

function checkSweep(data) {
  for (let idx = 0; idx < data.drivers.length; idx++) {
    const segs = ac.weightSweep(data, idx);
    const reported = new Set(segs.filter(s => s.lead.length === 1).map(s => s.lead.join()));
    const wide = new Set(segs.filter(s => s.hi - s.lo >= 0.2 && s.lead.length === 1).map(s => s.lead.join()));
    const brute = bruteLeaders(data, idx);
    for (const l of wide) assert.ok(brute.has(l), 'reported but not found by brute force: ' + l);
    for (const l of brute) assert.ok(reported.has(l), 'found by brute force but not reported: ' + l);
  }
}

test('weight sweep matches brute force on the template', () => {
  checkSweep(exampleData());
});

test('weight sweep matches brute force on 60 random datasets', () => {
  const rnd = mulberry32(7);
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  for (let n = 0; n < 60; n++) {
    const nd = int(2, 5);
    const nc = int(2, 4);
    const raw = Array.from({ length: nd }, () => int(1, 10));
    const total = raw.reduce((a, b) => a + b, 0);
    const w = raw.map(r => Math.round(1e4 * 100 * r / total) / 1e4);
    w[nd - 1] = Math.round(1e4 * (100 - w.slice(0, -1).reduce((a, b) => a + b, 0))) / 1e4;
    const data = {
      drivers: w.map((weight, i) => ({ id: 'd' + i, name: 'D' + i, weight })),
      candidates: Array.from({ length: nc }, (_, k) => ({
        id: 'c' + k, name: 'C' + k, recommended: k === 0,
        scores: Object.fromEntries(Array.from({ length: nd }, (_, i) => ['d' + i, { score: int(1, 5) }]))
      }))
    };
    checkSweep(data);
  }
});

test('a known flip point: A and B tie when the weight of q1 reaches 50', () => {
  const data = {
    drivers: [{ id: 'q1', name: 'Q1', weight: 50 }, { id: 'q2', name: 'Q2', weight: 50 }],
    candidates: [
      { id: 'a', name: 'A', recommended: true, scores: { q1: { score: 5 }, q2: { score: 1 } } },
      { id: 'b', name: 'B', recommended: false, scores: { q1: { score: 1 }, q2: { score: 5 } } }
    ]
  };
  const segs = ac.weightSweep(data, 0);
  assert.equal(segs.length, 2);
  assert.ok(Math.abs(segs[0].hi - 50) < 1e-9);
  assert.deepEqual(segs[0].lead, ['b']);
  assert.deepEqual(segs[1].lead, ['a']);
});

test('sensitivity verdicts: fragile, robust and tie', () => {
  const d = exampleData();
  assert.match(ac.sensitivityReport(d).join('\n'), /Verdict:/);
  const robust = clone(d);
  for (const c of robust.candidates.slice(1)) for (const s of Object.values(c.scores)) s.score = 1;
  assert.match(ac.sensitivityReport(robust).join('\n'), /robust/);
  const tie = clone(d);
  for (const c of tie.candidates) for (const s of Object.values(c.scores)) s.score = 3;
  assert.match(ac.sensitivityReport(tie).join('\n'), /Tie at the top/);
});

test('sensitivity refuses invalid data', t => {
  const dir = tmpDir(t);
  const file = path.join(dir, 'ex.json');
  fs.writeFileSync(file, JSON.stringify(ac.loadData(TEMPLATE))); // still has "example"
  const r = run('sensitivity', file);
  assert.equal(r.code, 1);
  assert.match(r.out, /Fix the errors/);
});

// ---- render ----

test('render keeps hostile text inert and round-trips the data', () => {
  const d = exampleData();
  const hostile = '</script><script>window.__x=1</script> <!-- <script> "quotes" \\ backslash   ação 😀';
  d.project = hostile;
  d.candidates[0].summary = hostile;
  d.candidates[0].diagram.edges[0].label = hostile;
  const template = readTemplate();
  const html = ac.renderHtml(template, d);
  assert.deepEqual(JSON.parse(ac.extractBlock(html)), d);
  assert.equal(html.split('</script>').length, template.split('</script>').length);
  assert.equal(html.includes('<script>window'), false);
});

test('render writes the file, creates parent folders and the output validates', t => {
  const dir = tmpDir(t);
  const src = path.join(dir, 'view.json');
  const out = path.join(dir, 'sub', 'view.html');
  fs.writeFileSync(src, JSON.stringify(exampleData()));
  const r = run('render', src, '-o', out);
  assert.equal(r.code, 0, r.out + r.err);
  assert.equal(run('validate', out).code, 0);
  assert.deepEqual(JSON.parse(ac.extractBlock(fs.readFileSync(out, 'utf8'))), exampleData());
});

test('render refuses "example", invalid data and overwriting the template', t => {
  const dir = tmpDir(t);
  const example = path.join(dir, 'example.json');
  fs.writeFileSync(example, JSON.stringify(ac.loadData(TEMPLATE)));
  const out = path.join(dir, 'o.html');
  assert.equal(run('render', example, '-o', out).code, 1);
  assert.equal(fs.existsSync(out), false);
  const ok = path.join(dir, 'ok.json');
  fs.writeFileSync(ok, JSON.stringify(exampleData()));
  const r = run('render', ok, '-o', TEMPLATE);
  assert.equal(r.code, 2);
  assert.match(r.err, /template itself/);
  assert.equal(run('render', ok).code, 2);
});

test('render needs exactly one data block in the template', () => {
  assert.throws(() => ac.renderHtml('<html></html>', exampleData()), ac.ArchError);
});

test('the template ships valid example data and no external references', () => {
  const html = readTemplate();
  assert.equal(/\bsrc=["']?https?:/i.test(html) || /\bhref=["']?https?:/i.test(html), false);
  assert.equal(html.includes('default-src \'none\''), true);
});

// ---- adr-next ----

function makeAdrs(dir, files) {
  const folder = path.join(dir, 'docs', 'adr');
  fs.mkdirSync(folder, { recursive: true });
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(folder, name), body);
}

test('adr-next reports the next number, gaps, duplicates and statuses', t => {
  const dir = tmpDir(t);
  makeAdrs(dir, {
    '0001-a.md': '---\nstatus: Accepted # note\n---\n',
    '0002-b.md': '- Status: Superseded by ADR-0005\n',
    '0003-c.md': 'status: Proposed\n',
    '0003-c2.md': 'status: Rejected\n',
    '0006-d.md': 'no status here\n',
    'adr-template.md': 'x', 'README.md': 'x', 'como-escrever-adr.md': 'x'
  });
  const { lines, problems } = ac.adrReport(dir);
  const text = lines.join('\n');
  assert.equal(problems, true);
  assert.match(text, /Next number: 0007/);
  assert.match(text, /Gaps.*0004, 0005/);
  assert.match(text, /repeated/);
  assert.match(text, /adr-template\.md/);
  assert.doesNotMatch(text, /README/);
  assert.match(text, /accepted 1/);
  assert.match(text, /proposed 1/);
  assert.match(text, /superseded 1/);
  assert.match(text, /no-status 1/);
});

test('adr-next without a folder, with an explicit folder, and its exit code', t => {
  const empty = tmpDir(t);
  assert.match(ac.adrReport(empty).lines.join('\n'), /0001/);
  const other = tmpDir(t);
  fs.mkdirSync(path.join(other, 'decisions'));
  fs.writeFileSync(path.join(other, 'decisions', '012-x.md'), 'x');
  assert.match(ac.adrReport(other, 'decisions').lines.join('\n'), /Next number: 013/);
  assert.throws(() => ac.adrReport(other, 'missing'), ac.ArchError);
  const dup = tmpDir(t);
  makeAdrs(dup, { '0001-a.md': 'x', '0001-b.md': 'x' });
  assert.equal(run('adr-next', '--root', dup).code, 1);
});

// ---- packaging contract of the skill ----

test('the skill follows the portable layout: name matches the folder, references one level deep', () => {
  const skill = fs.readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: architecture-advisor\n/);
  for (const rel of skill.match(/`(?:references|assets|scripts)\/[^`\s]+`/g).map(s => s.slice(1, -1))) {
    assert.ok(fs.existsSync(path.join(SKILL, rel)), 'SKILL.md cites a missing file: ' + rel);
    assert.equal(rel.split('/').length, 2, 'must be one directory level deep: ' + rel);
  }
});
