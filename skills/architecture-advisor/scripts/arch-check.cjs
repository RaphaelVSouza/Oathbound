#!/usr/bin/env node
'use strict';

// arch-check: mechanical support for the architecture-advisor skill.
// Native Node APIs only (no dependencies). Reads the files you name; writes only
// what `render -o` asks for. No network, no execution of project code.
//
//   validate FILE         check the view JSON (or a generated .html) and print the ranking
//   sensitivity FILE      show which weight or score change flips the leader
//   render FILE -o OUT    inject the JSON into the HTML template with safe escaping
//   adr-next [DIR]        next ADR number; reports gaps, duplicates and Proposed ADRs
//
// FILE may be "-" (stdin). Exit code: 0 ok, 1 problems found, 2 usage or I/O error.

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const KINDS = ['client', 'service', 'db', 'queue', 'external'];
const REVERSAL = ['low', 'medium', 'high'];
const CONFIDENCE = ['high', 'medium', 'low'];
const MAX_NODES = 12;
const EPS = 1e-9;
const BLOCK_SRC = '(<script\\s+type="application/json"\\s+id="arch-data"\\s*>)([\\s\\S]*?)(</script>)';
const TAG_RE = /<\s*\/?[A-Za-z!]/;
const URL_RE = /^https?:\/\/\S+$/i;

class ArchError extends Error {}

// ---------------------------------------------------------------- loading

function extractBlock(html) {
  const found = [...html.matchAll(new RegExp(BLOCK_SRC, 'g'))];
  if (found.length !== 1) {
    throw new ArchError('expected exactly one <script type="application/json" id="arch-data"> block, found ' + found.length);
  }
  return found[0][2];
}

function loadData(file) {
  let text;
  try {
    text = fs.readFileSync(file === '-' ? 0 : file, 'utf8');
  } catch (e) {
    throw new ArchError('cannot read ' + file + ': ' + (e.code || e.message));
  }
  if (file !== '-' && /\.html?$/i.test(file)) text = extractBlock(text);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new ArchError('invalid JSON: ' + e.message);
  }
}

// ---------------------------------------------------------------- validation

const isText = x => typeof x === 'string' && x.trim() !== '';
const isNum = x => typeof x === 'number' && Number.isFinite(x);
const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);

function* walkStrings(obj, where) {
  if (typeof obj === 'string') yield [where, obj];
  else if (Array.isArray(obj)) for (let i = 0; i < obj.length; i++) yield* walkStrings(obj[i], where + '[' + i + ']');
  else if (isObj(obj)) for (const k of Object.keys(obj)) yield* walkStrings(obj[k], where ? where + '.' + k : k);
}

function fmtNum(x) {
  return Number.isInteger(x) ? String(x) : x.toFixed(2);
}

function validate(data) {
  const errs = [];
  const warns = [];
  const E = (where, msg) => errs.push(where + ': ' + msg);
  const W = (where, msg) => warns.push(where + ': ' + msg);

  if (!isObj(data)) {
    E('root', 'the JSON must be an object');
    return { errs, warns };
  }
  if (data.example) E('example', 'remove "example": true; otherwise the file still presents itself as fictional example data');
  for (const key of ['project', 'decision']) if (!isText(data[key])) E(key, 'required text');
  if (!isText(data.date) || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) W('date', 'use YYYY-MM-DD');
  if (!CONFIDENCE.includes(data.confidence)) W('confidence', 'use high, medium or low');
  for (const key of ['triggers', 'assumptions']) {
    const v = data[key];
    if (!Array.isArray(v) || !v.every(isText)) E(key, 'must be a list of texts');
    else if (v.length === 0) W(key, 'empty list (the skill asks for re-evaluation triggers and open assumptions)');
  }

  // drivers
  let drivers = data.drivers;
  const driverIds = [];
  if (!Array.isArray(drivers) || drivers.length === 0) {
    E('drivers', 'required non-empty list');
    drivers = [];
  }
  drivers.forEach((d, i) => {
    const where = 'drivers[' + i + ']';
    if (!isObj(d)) return E(where, 'must be an object');
    if (!isText(d.id)) E(where + '.id', 'required text');
    else if (driverIds.includes(d.id)) E(where + '.id', 'repeated id "' + d.id + '"');
    else driverIds.push(d.id);
    if (!isText(d.name)) E(where + '.name', 'required text');
    if (!isText(d.scenario)) E(where + '.scenario', 'measurable scenario required');
    else if (!/\d/.test(d.scenario)) W(where + '.scenario', 'scenario without a number; a quality attribute without a number is an opinion');
    if (!isNum(d.weight) || d.weight < 0) E(where + '.weight', 'number greater than or equal to 0');
  });
  const weightsOk = drivers.length > 0 && drivers.every(d => isObj(d) && isNum(d.weight));
  if (weightsOk) {
    const sum = drivers.reduce((a, d) => a + d.weight, 0);
    if (Math.abs(sum - 100) > 1e-6) E('drivers', 'weights sum to ' + fmtNum(sum) + ', must sum to 100');
  }

  // candidates
  let cands = data.candidates;
  if (!Array.isArray(cands) || cands.length === 0) {
    E('candidates', 'required non-empty list');
    cands = [];
  } else if (cands.length === 1) {
    W('candidates', 'a single alternative: comparison and sensitivity do not apply');
  }
  const candIds = [];
  let recommended = 0;
  let nUrl = 0;
  let nAssumption = 0;
  cands.forEach((c, i) => {
    let where = 'candidates[' + i + ']';
    if (!isObj(c)) return E(where, 'must be an object');
    if (!isText(c.id)) E(where + '.id', 'required text');
    else if (candIds.includes(c.id)) E(where + '.id', 'repeated id "' + c.id + '"');
    else candIds.push(c.id);
    where = 'candidates[' + (isText(c.id) ? c.id : i) + ']';
    if (!isText(c.name)) E(where + '.name', 'required text');
    if (!isText(c.summary)) W(where + '.summary', 'empty summary');
    if (typeof c.recommended !== 'boolean') E(where + '.recommended', 'must be true or false');
    else if (c.recommended) recommended++;
    if (!REVERSAL.includes(c.reversal)) E(where + '.reversal', 'use low, medium or high');
    for (const key of ['mustBeTrue', 'risks']) {
      const v = c[key];
      if (!Array.isArray(v) || !v.every(isText)) E(where + '.' + key, 'must be a list of texts');
      else if (v.length === 0) W(where + '.' + key, 'empty list');
    }

    let scores = c.scores;
    if (!isObj(scores)) {
      E(where + '.scores', 'required object');
      scores = {};
    }
    for (const did of driverIds) if (!(did in scores)) E(where + '.scores', 'missing score for driver "' + did + '"');
    for (const did of Object.keys(scores)) {
      const sw = where + '.scores.' + did;
      if (!driverIds.includes(did)) { E(sw, 'unknown driver'); continue; }
      const sc = scores[did];
      if (!isObj(sc)) { E(sw, 'must be an object with score, why and source'); continue; }
      if (!isNum(sc.score) || sc.score < 1 || sc.score > 5) E(sw + '.score', 'number from 1 to 5');
      else if (!Number.isInteger(sc.score)) W(sw + '.score', 'use an integer score');
      if (!isText(sc.why)) E(sw + '.why', 'a score without justification does not count');
      if (isText(sc.source) && URL_RE.test(sc.source.trim())) nUrl++;
      else if (isText(sc.source) && sc.source.trim().toLowerCase() === 'assumption') nAssumption++;
      else E(sw + '.source', 'use an http(s) URL or the word "assumption"');
    }

    // diagram
    const dg = c.diagram;
    if (!isObj(dg) || !Array.isArray(dg.nodes) || !Array.isArray(dg.edges)) {
      return E(where + '.diagram', 'object with nodes and edges lists');
    }
    const nodeIds = [];
    const cells = new Map();
    if (dg.nodes.length > MAX_NODES) W(where + '.diagram', dg.nodes.length + ' nodes; above ~' + MAX_NODES + ' the diagram becomes unreadable');
    dg.nodes.forEach((n, j) => {
      const nw = where + '.diagram.nodes[' + j + ']';
      if (!isObj(n)) return E(nw, 'must be an object');
      if (!isText(n.id)) E(nw + '.id', 'required text');
      else if (nodeIds.includes(n.id)) E(nw + '.id', 'repeated id "' + n.id + '"');
      else nodeIds.push(n.id);
      if (!isText(n.label)) E(nw + '.label', 'required text');
      else if (n.label.length > 28) W(nw + '.label', 'long label (' + n.label.length + ' characters); prefer up to ~28');
      if (!KINDS.includes(n.kind)) E(nw + '.kind', 'use ' + KINDS.join(', '));
      if (!isText(n.group)) W(nw + '.group', 'no group: the node sits outside any boundary');
      if (!Number.isInteger(n.col) || n.col < 0 || !Number.isInteger(n.row) || n.row < 0) {
        E(nw, 'col and row must be integers greater than or equal to 0');
      } else {
        const key = n.col + ',' + n.row;
        if (cells.has(key)) E(nw, 'node lands in the same cell (col ' + n.col + ', row ' + n.row + ') as "' + cells.get(key) + '" and overlaps it');
        else cells.set(key, n.id);
      }
    });
    const seenEdges = new Set();
    dg.edges.forEach((e, j) => {
      const ew = where + '.diagram.edges[' + j + ']';
      if (!isObj(e)) return E(ew, 'must be an object');
      for (const end of ['from', 'to']) if (!nodeIds.includes(e[end])) E(ew + '.' + end, 'node "' + e[end] + '" does not exist in nodes');
      if (e.from === e.to) W(ew, 'a link from a node to itself is not drawn');
      if ('async' in e && typeof e.async !== 'boolean') E(ew + '.async', 'must be true or false');
      if ('label' in e && typeof e.label !== 'string') E(ew + '.label', 'must be text');
      else if (typeof e.label === 'string' && e.label.length > 40) W(ew + '.label', 'long label (' + e.label.length + ' characters); prefer up to ~40');
      const pair = e.from + '->' + e.to;
      if (seenEdges.has(pair)) W(ew, 'repeated link ' + pair + ' (the lines overlap)');
      seenEdges.add(pair);
    });
  });

  if (cands.length && recommended !== 1) E('candidates', 'exactly one alternative must have recommended: true (found ' + recommended + ')');
  if (candIds.includes('current') && !drivers.some(d => isObj(d) && /transition/i.test(String(d.name || '')))) {
    W('drivers', 'there is a "current" alternative but no transition cost and risk driver; the matrix will tend to favor change');
  }
  if (nUrl + nAssumption > 0 && nUrl === 0) W('scores', 'every score is an assumption, with no source; was the research (Phase 3) done?');

  let shown = 0;
  for (const [where, s] of walkStrings(data, '')) {
    if (TAG_RE.test(s)) {
      if (shown < 5) W(where, 'looks like HTML markup; all text must be plain (the template shows it as text, but check that was intended)');
      shown++;
    }
  }
  if (shown > 5) warns.push('(' + (shown - 5) + ' more texts with markup)');

  if (!errs.length) {
    const leaders = leadersOf(totalsOf(data));
    const rec = cands.filter(c => c.recommended).map(c => c.id);
    if (rec.length && leaders.join() !== rec.slice().sort().join()) {
      W('candidates', 'at current weights the leader is "' + namesOf(data, leaders).join(', ') + '", not the recommended "' + namesOf(data, rec).join(', ') + '"; the decision is sensitive to the weights');
    }
  }
  return { errs, warns };
}

// ---------------------------------------------------------------- calculation

function matrix(data) {
  const ids = data.candidates.map(c => c.id);
  const rows = {};
  for (const c of data.candidates) rows[c.id] = data.drivers.map(d => Number(c.scores[d.id].score));
  return { ids, rows };
}

function totalOf(weights, row) {
  const sw = weights.reduce((a, b) => a + b, 0);
  return sw ? weights.reduce((a, w, i) => a + w * row[i], 0) / sw : 0;
}

function totalsOf(data, weights) {
  const { ids, rows } = matrix(data);
  const w = weights || data.drivers.map(d => Number(d.weight));
  const out = {};
  for (const id of ids) out[id] = totalOf(w, rows[id]);
  return out;
}

function leadersOf(totals) {
  const top = Math.max(...Object.values(totals));
  return Object.keys(totals).filter(c => top - totals[c] <= EPS).sort();
}

function namesOf(data, ids) {
  const by = new Map(data.candidates.map(c => [c.id, c.name]));
  return ids.map(i => by.get(i));
}

function rankingLines(data) {
  const totals = totalsOf(data);
  const order = data.candidates.slice().sort((a, b) => totals[b.id] - totals[a.id]);
  return order.map((c, i) => '  ' + (i + 1) + '. ' + c.name + '  ' + totals[c.id].toFixed(2) + (c.recommended ? '  (recommended)' : ''));
}

// Leaders while the weight of driver `idx` moves from 0 to 100 (others fixed); same math as the Tradeoffs tab.
function weightSweep(data, idx) {
  const { ids, rows } = matrix(data);
  const w = data.drivers.map(d => Number(d.weight));
  const rest = w.reduce((a, b) => a + b, 0) - w[idx];
  const base = {};
  for (const c of ids) base[c] = w.reduce((a, wj, j) => (j === idx ? a : a + wj * rows[c][j]), 0);
  const cuts = new Set([0, 100]);
  for (let a = 0; a < ids.length; a++) {
    for (let b = a + 1; b < ids.length; b++) {
      const den = rows[ids[a]][idx] - rows[ids[b]][idx];
      if (den) {
        const x = -(base[ids[a]] - base[ids[b]]) / den;
        if (x > 0 && x < 100) cuts.add(x);
      }
    }
  }
  const pts = [...cuts].sort((p, q) => p - q);
  const segs = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const lo = pts[k];
    const hi = pts[k + 1];
    const mid = (lo + hi) / 2;
    const tot = {};
    for (const c of ids) tot[c] = rest + mid > 0 ? (base[c] + mid * rows[c][idx]) / (rest + mid) : 0;
    const lead = leadersOf(tot);
    const last = segs[segs.length - 1];
    if (last && last.lead.join() === lead.join()) last.hi = hi;
    else segs.push({ lo, hi, lead });
  }
  return segs;
}

function rangeText(lo, hi) {
  if (lo <= 0 && hi >= 100) return 'any weight';
  if (lo <= 0) return 'weight below ' + hi.toFixed(1);
  if (hi >= 100) return 'weight above ' + lo.toFixed(1);
  return 'weight between ' + lo.toFixed(1) + ' and ' + hi.toFixed(1);
}

function sensitivityReport(data) {
  const { ids, rows } = matrix(data);
  const base = leadersOf(totalsOf(data));
  const lines = ['Ranking (current weights, scale 0-5):', ...rankingLines(data)];
  const totals = Object.values(totalsOf(data)).sort((a, b) => b - a);
  if (totals.length > 1) lines.push('Margin between 1st and 2nd: ' + (totals[0] - totals[1]).toFixed(2));
  if (base.length > 1) lines.push('Tie at the top: ' + namesOf(data, base).join(', '));
  let flips = 0;

  lines.push('', 'Weights (one at a time, 0 to 100, others fixed):');
  data.drivers.forEach((d, idx) => {
    const others = weightSweep(data, idx).filter(s => s.lead.join() !== base.join());
    if (!others.length) {
      lines.push('- ' + d.name + ' (weight ' + fmtNum(d.weight) + '): the leader does not change');
      return;
    }
    flips++;
    const parts = others.map(s => rangeText(s.lo, s.hi) + ': ' + namesOf(data, s.lead).join(' / '));
    lines.push('- ' + d.name + ' (weight ' + fmtNum(d.weight) + '): the leader changes at ' + parts.join('; '));
  });

  lines.push('', 'Scores (one at a time, ±1):');
  const found = [];
  const w = data.drivers.map(d => Number(d.weight));
  for (const c of data.candidates) {
    data.drivers.forEach((d, j) => {
      for (const delta of [-1, 1]) {
        const s = rows[c.id][j] + delta;
        if (s < 1 || s > 5) continue;
        const alt = {};
        for (const id of ids) alt[id] = id === c.id ? rows[id].map((v, k) => (k === j ? s : v)) : rows[id];
        const tot = {};
        for (const id of ids) tot[id] = totalOf(w, alt[id]);
        const lead = leadersOf(tot);
        if (lead.join() !== base.join()) {
          const verb = lead.length > 1 ? 'ties the top between' : 'changes the leader to';
          found.push(c.name + ' × ' + d.name + ': score ' + rows[c.id][j] + ' → ' + s + ' ' + verb + ' ' + namesOf(data, lead).join(' / '));
        }
      }
    });
  }
  flips += found.length;
  if (!found.length) lines.push('- no ±1 change to a single score flips the leader');
  for (const f of found.slice(0, 10)) lines.push('- ' + f);
  if (found.length > 10) lines.push('- (' + (found.length - 10) + ' more)');

  lines.push('');
  if (ids.length < 2) lines.push('Single alternative: sensitivity does not apply.');
  else if (flips) lines.push('Verdict: fragile. ' + flips + ' simple change(s) flip the leader; say so in the recommendation and lower the confidence.');
  else lines.push('Verdict: robust to a change in one weight (0-100) or one score (±1). This does not cover errors in several scores at once.');
  return lines;
}

// ---------------------------------------------------------------- render

function renderHtml(templateText, data) {
  extractBlock(templateText); // guarantees a single block
  const payload = JSON.stringify(data, null, 2).replace(/</g, '\\u003c');
  const out = templateText.replace(new RegExp(BLOCK_SRC), (m, open, _body, close) => open + '\n' + payload + '\n' + close);
  try {
    assert.deepEqual(JSON.parse(extractBlock(out)), data);
  } catch (e) {
    throw new ArchError('internal failure: the written JSON does not match the original');
  }
  return out;
}

// ---------------------------------------------------------------- ADR

const ADR_DIRS = ['docs/adr', 'docs/adrs', 'docs/decisions', 'docs/architecture/decisions', 'doc/adr', 'architecture/decisions', 'adr', 'adrs'];
const ADR_NAME = /^(\d+)[-_](.+)\.md$/i;
const STATUS_RE = /^\s*(?:[-*]\s*)?\**status\**\s*[:=]\s*\**\s*(.+?)\s*$/i;

function adrStatus(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return null; }
  for (const line of text.split(/\r?\n/).slice(0, 40)) {
    const m = STATUS_RE.exec(line);
    if (m) {
      const value = m[1].replace(/\s+#.*$/, '').replace(/^[\s*`_]+|[\s*`_]+$/g, '');
      return value || null;
    }
  }
  return null;
}

function adrReport(root, directory) {
  let folder = null;
  if (directory) {
    folder = path.resolve(root, directory);
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw new ArchError('folder not found: ' + folder);
  } else {
    for (const cand of ADR_DIRS) {
      const p = path.resolve(root, cand);
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) { folder = p; break; }
    }
  }
  if (!folder) {
    return { lines: ['No ADR folder found (looked for: ' + ADR_DIRS.join(', ') + ').', 'Next number: 0001. Suggestion: docs/adr/0001-<title-in-kebab-case>.md'], problems: false };
  }
  const names = new Map();
  const widths = [];
  const ignored = [];
  for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.md') continue;
    const m = ADR_NAME.exec(entry.name);
    if (m) {
      const n = parseInt(m[1], 10);
      widths.push(m[1].length);
      if (!names.has(n)) names.set(n, []);
      names.get(n).push(path.join(folder, entry.name));
    } else if (entry.name.toLowerCase() !== 'readme.md') {
      ignored.push(entry.name);
    }
  }
  const pad = (n, w) => String(n).padStart(w, '0');
  const width = widths.length ? Math.max(...widths) : 4;
  const lines = ['Folder: ' + folder, 'Numbered ADRs: ' + [...names.values()].reduce((a, v) => a + v.length, 0)];
  if (new Set(widths).size > 1) lines.push('Warning: mixed numbering widths; using ' + width + ' digits.');
  const top = names.size ? Math.max(...names.keys()) : 0;
  lines.push('Last number: ' + (top ? pad(top, width) : 'none'));
  lines.push('Next number: ' + pad(top + 1, width) + ' (never reuse one, not even a rejected ADR\'s). Suggestion: ' + path.basename(folder) + '/' + pad(top + 1, width) + '-<title-in-kebab-case>.md');
  let problems = false;
  for (const [n, ps] of [...names.entries()].sort((a, b) => a[0] - b[0])) {
    if (ps.length > 1) {
      problems = true;
      lines.push('PROBLEM: number ' + pad(n, width) + ' repeated in ' + ps.map(p => path.basename(p)).join(', '));
    }
  }
  const gaps = [];
  for (let n = 1; n <= top; n++) if (!names.has(n)) gaps.push(pad(n, width));
  if (gaps.length) lines.push('Gaps (may be intentional): ' + gaps.join(', '));
  if (ignored.length) lines.push('Outside the NNNN-title.md pattern (ignored): ' + ignored.join(', '));
  const status = new Map();
  const proposed = [];
  for (const n of [...names.keys()].sort((a, b) => a - b)) {
    for (const p of names.get(n)) {
      const st = adrStatus(p);
      const key = (st || 'no-status').split(/\s+/)[0].toLowerCase().replace(/:$/, '');
      status.set(key, (status.get(key) || 0) + 1);
      if (key === 'proposed') proposed.push(path.basename(p));
    }
  }
  if (status.size) lines.push('Status: ' + [...status.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => k + ' ' + v).join(', '));
  if (proposed.length) lines.push('Still Proposed (check none was forgotten): ' + proposed.join(', '));
  return { lines, problems };
}

// ---------------------------------------------------------------- CLI

const USAGE = [
  'usage: arch-check.cjs <command> [options]',
  '  validate FILE                 check the view JSON (or a generated .html) and print the ranking',
  '  sensitivity FILE              show which weight or score change flips the leader',
  '  render FILE -o OUT [--template T]   write the HTML (template default: ../assets/architecture-view.html)',
  '  adr-next [DIR] [--root R]     next ADR number; gaps, duplicates, Proposed ADRs',
  'FILE may be "-" for stdin. Exit: 0 ok, 1 problems, 2 usage or I/O error.'
].join('\n');

function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o' || a === '--output' || a === '--template' || a === '--root') {
      if (i + 1 >= argv.length) throw new ArchError('missing value for ' + a);
      out.flags[a === '-o' ? '--output' : a] = argv[++i];
    } else if (a.startsWith('-') && a !== '-') {
      throw new ArchError('unknown option: ' + a);
    } else {
      out._.push(a);
    }
  }
  return out;
}

function main(argv, io) {
  const out = io && io.out ? io.out : s => process.stdout.write(s + '\n');
  const err = io && io.err ? io.err : s => process.stderr.write(s + '\n');
  const print = lines => lines.forEach(l => out(l));
  try {
    const args = parseArgs(argv);
    const cmd = args._[0];
    const file = args._[1];
    if (!cmd || cmd === 'help') { print(USAGE.split('\n')); return cmd ? 0 : 2; }

    if (cmd === 'validate') {
      if (!file) throw new ArchError('validate needs a FILE');
      const data = loadData(file);
      const { errs, warns } = validate(data);
      print(errs.map(e => 'ERROR ' + e));
      print(warns.map(w => 'WARN  ' + w));
      out('Result: ' + errs.length + ' error(s), ' + warns.length + ' warning(s)');
      if (!errs.length) {
        const all = data.candidates.flatMap(c => Object.values(c.scores));
        const urls = all.filter(s => URL_RE.test(s.source.trim())).length;
        out('Scores with a source (URL): ' + urls + ' of ' + all.length + '; assumption: ' + (all.length - urls));
        out('Ranking (current weights, scale 0-5):');
        print(rankingLines(data));
      }
      return errs.length ? 1 : 0;
    }

    if (cmd === 'sensitivity') {
      if (!file) throw new ArchError('sensitivity needs a FILE');
      const data = loadData(file);
      const { errs } = validate(data);
      if (errs.length) {
        print(errs.map(e => 'ERROR ' + e));
        out('Fix the errors before running the sensitivity analysis.');
        return 1;
      }
      print(sensitivityReport(data));
      return 0;
    }

    if (cmd === 'render') {
      if (!file) throw new ArchError('render needs a FILE');
      const output = args.flags['--output'];
      if (!output) throw new ArchError('render needs -o OUT');
      const data = loadData(file);
      const { errs, warns } = validate(data);
      print(warns.map(w => 'WARN  ' + w));
      if (errs.length) {
        print(errs.map(e => 'ERROR ' + e));
        out('Nothing was written: fix the errors.');
        return 1;
      }
      const template = args.flags['--template'] ? path.resolve(args.flags['--template']) : path.resolve(__dirname, '..', 'assets', 'architecture-view.html');
      let templateText;
      try { templateText = fs.readFileSync(template, 'utf8'); } catch (e) { throw new ArchError('cannot read the template ' + template + ': ' + (e.code || e.message)); }
      const dest = path.resolve(output);
      if (dest === template) throw new ArchError('the output cannot be the template itself; write to another file');
      const html = renderHtml(templateText, data);
      try {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const tmp = path.join(path.dirname(dest), '.arch-' + process.pid + '-' + Date.now() + '.tmp');
        fs.writeFileSync(tmp, html, 'utf8');
        fs.renameSync(tmp, dest);
      } catch (e) {
        throw new ArchError('cannot write ' + dest + ': ' + (e.code || e.message));
      }
      out('Written: ' + output + ' (' + Buffer.byteLength(html, 'utf8') + ' bytes)');
      return 0;
    }

    if (cmd === 'adr-next') {
      const { lines, problems } = adrReport(args.flags['--root'] || '.', args._[1]);
      print(lines);
      return problems ? 1 : 0;
    }

    throw new ArchError('unknown command: ' + cmd + '\n' + USAGE);
  } catch (e) {
    if (e instanceof ArchError) { err('error: ' + e.message); return 2; }
    throw e;
  }
}

module.exports = {
  ArchError, extractBlock, loadData, validate, totalsOf, leadersOf, matrix, totalOf, weightSweep,
  sensitivityReport, rankingLines, renderHtml, adrReport, main
};

if (require.main === module) process.exitCode = main(process.argv.slice(2));
