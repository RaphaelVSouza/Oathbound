#!/usr/bin/env node
// Prepara um arquivo inteiro ou hunks numerados do diff worktree -> índice.
const path = require('node:path');
const { options, one } = require('./cli-options');
const { run } = require('./process-runner');
const { repoPaths, globMatch } = require('./git-state');

async function main(argv) {
  const o = options(argv, ['-d', '-f', '--hunks', '--lines'], ['--list', '--all']);
  const dir = one(o, '-d'), requested = one(o, '-f');
  const modes = Number(!!o['--list']) + Number(!!o['--all']) + Number(!!o['--hunks']) + Number(!!o['--lines']);
  if (!dir || !requested || modes !== 1) throw Error('uso: node git-stage.js -d repo -f arquivo (--list | --all | --hunks 1,3 | --lines 2,5)');
  const { root } = await repoPaths(dir);
  const absolute = path.resolve(root, requested);
  const relative = path.relative(path.resolve(root), absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw Error('arquivo fora do repositório');
  const file = relative.replaceAll('\\', '/');
  if (process.env.GOVKIT_AGENT === 'ds-committer') {
    const scopes = JSON.parse(process.env.GOVKIT_SCOPES || '[]');
    if (!scopes.some(scope => globMatch(file, scope))) throw Error(`fora do escopo do ds-committer: ${file}`);
  }
  const literal = `:(literal)${file}`;
  if (o['--all']) {
    const r = await run('git', ['-C', root, 'add', '--', literal]);
    if (r.code) throw Error(r.stderr.trim() || 'git add falhou');
    console.log(`preparado: ${file} (arquivo inteiro)`);
    return;
  }
  const r = await run('git', ['-C', root, 'diff', '--no-ext-diff', '--unified=0', '--', literal], { maxCapture: 67108864 });
  if (r.code) throw Error(r.stderr.trim() || 'git diff falhou');
  const starts = [...r.stdout.matchAll(/^@@ /gm)].map(m => m.index);
  if (!starts.length) throw Error(`sem hunks de texto não preparados: ${file}; para arquivo inteiro use --all`);
  const header = r.stdout.slice(0, starts[0]);
  const hunks = starts.map((start, i) => r.stdout.slice(start, starts[i + 1] ?? r.stdout.length));
  let lineNumber = 0;
  const lineIds = hunks.map(hunk => hunk.split('\n').slice(1, -1).map(line => /^[+-]/.test(line) ? ++lineNumber : 0));
  if (o['--list']) {
    hunks.forEach((h, i) => {
      const lines = h.split('\n').slice(1, -1);
      console.log(`hunk ${i + 1}: ${h.split('\n')[0]}`);
      lines.forEach((line, j) => { if (lineIds[i][j]) console.log(`  linha ${lineIds[i][j]}: ${line.slice(0, 180)}`); });
    });
    return;
  }
  const selector = o['--hunks'] ? '--hunks' : '--lines';
  const numbers = one(o, selector).split(',').map(Number);
  const limit = selector === '--hunks' ? hunks.length : lineNumber;
  if (!numbers.length || numbers.some(n => !Number.isInteger(n) || n < 1 || n > limit) || new Set(numbers).size !== numbers.length) throw Error('lista de seleção inválida');
  const chosen = new Set(numbers);
  let patch;
  if (selector === '--hunks') patch = header + numbers.sort((a, b) => a - b).map(n => hunks[n - 1]).join('');
  else {
    if (r.stdout.includes('\\ No newline at end of file')) throw Error('hunk sem newline final: use --hunks ou --all');
    const selected = [];
    hunks.forEach((hunk, i) => {
      const [first, ...body] = hunk.split('\n').slice(0, -1);
      const match = first.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
      if (!match) throw Error(`cabeçalho de hunk inválido: ${first}`);
      const picked = [];
      let removed = [], added = [];
      const flush = () => {
        for (let j = 0; j < Math.max(removed.length, added.length); j++) {
          const oldLine = removed[j], newLine = added[j];
          if (oldLine) picked.push(chosen.has(oldLine.id) ? oldLine.text : ` ${oldLine.text.slice(1)}`);
          if (newLine && chosen.has(newLine.id)) picked.push(newLine.text);
        }
        removed = []; added = [];
      };
      body.forEach((line, j) => {
        if (!line) return;
        if (line.startsWith('-')) removed.push({ text: line, id: lineIds[i][j] });
        else if (line.startsWith('+')) added.push({ text: line, id: lineIds[i][j] });
        else { flush(); picked.push(line); }
      });
      flush();
      if (!picked.some(line => /^[+-]/.test(line))) return;
      const oldCount = picked.filter(line => !line.startsWith('+')).length;
      const newCount = picked.filter(line => !line.startsWith('-')).length;
      selected.push(`@@ -${match[1]},${oldCount} +${match[2]},${newCount} @@${match[3]}\n${picked.join('\n')}\n`);
    });
    patch = header + selected.join('');
  }
  const applied = await run('git', ['-C', root, 'apply', '--cached', '--unidiff-zero', '-'], { input: patch });
  if (applied.code) throw Error(applied.stderr.trim() || 'git apply --cached falhou');
  console.log(`preparado: ${file} ${selector.slice(2)}=${numbers.join(',')}`);
}

main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exitCode = 2; });
