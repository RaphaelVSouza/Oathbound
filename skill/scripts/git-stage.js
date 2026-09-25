#!/usr/bin/env node
// Adaptador de CLI para preparar arquivos, hunks ou linhas via git.js.
const { options, one } = require('./cli-options');
const { stage } = require('./git');

async function main(argv) {
  const o = options(argv, ['-d', '-f', '--hunks', '--lines'], ['--list', '--all']);
  const dir = one(o, '-d'), requested = one(o, '-f');
  const modes = Number(!!o['--list']) + Number(!!o['--all']) + Number(!!o['--hunks']) + Number(!!o['--lines']);
  if (!dir || !requested || modes !== 1) throw Error('uso: node git-stage.js -d repo -f arquivo (--list | --all | --hunks 1,3 | --lines 2,5)');

  let mode = 'all';
  let hunks, lines;
  if (o['--list']) mode = 'list';
  else if (o['--hunks']) { mode = 'hunks'; hunks = one(o, '--hunks').split(',').map(Number); }
  else if (o['--lines']) { mode = 'lines'; lines = one(o, '--lines').split(',').map(Number); }

  const res = await stage(dir, requested, { mode, hunks, lines });
  if (mode === 'all') {
    console.log(`preparado: ${res.file} (arquivo inteiro)`);
  } else if (mode === 'list') {
    res.hunks.forEach((h, i) => {
      console.log(`hunk ${i + 1}: ${h.header}`);
      h.lines.forEach(line => console.log(`  linha ${line.id}: ${line.text.slice(0, 180)}`));
    });
  } else {
    const selector = mode === 'hunks' ? 'hunks' : 'lines';
    console.log(`preparado: ${res.file} ${selector}=${res.numbers.join(',')}`);
  }
}

main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exitCode = 2; });
