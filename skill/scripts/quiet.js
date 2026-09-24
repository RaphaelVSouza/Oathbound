#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { options, one } = require('./cli-options');
const { run } = require('./process-runner');
(async () => {
  const o = options(process.argv.slice(2), ['-l', '-n', '-p', '-t']);
  if (!o._.length) throw Error('uso: node quiet.js [-l log] [-n linhas] [-p regex] [-t segundos] -- comando args...');
  const log = one(o, '-l') || path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'govkit-quiet-')), 'output.log');
  const max = Number(one(o, '-n', '60')), timeout = Number(one(o, '-t', '600'));
  if (!Number.isInteger(max) || max < 1 || !Number.isInteger(timeout) || timeout < 1) throw Error('limites inválidos');
  fs.mkdirSync(path.dirname(log), { recursive: true });
  const stream = fs.createWriteStream(log);
  const started = Date.now();
  const shell = process.platform === 'win32' && /^(npm|npx|pnpm|yarn)(\.cmd)?$/i.test(o._[0]);
  const r = await run(o._[0], o._.slice(1), { timeout, shell, capture: false, onData: chunk => stream.write(chunk) });
  await new Promise(resolve => stream.end(resolve));
  const lines = fs.readFileSync(log, 'utf8').split(/\r?\n/);
  const elapsed = Math.floor((Date.now() - started) / 1000);
  if (r.code === 0) {
    console.log(lines.filter(x => x.trim()).slice(-5).join('\n'));
    console.log(`── ok exit=0 ${elapsed}s linhas=${lines.length} log=${log}`);
  } else {
    const pattern = `(^|[^a-z])(fail(ed|ure)?|error|exception|assert|expected|received|timeout|timed out|panic|traceback|✘|✖|×)([^a-z]|$)${one(o, '-p') ? `|${one(o, '-p')}` : ''}`;
    const re = new RegExp(pattern, 'i');
    const selected = [];
    for (let i = 0; i < lines.length && selected.length < max; i++) if (re.test(lines[i])) {
      for (let j = i; j < Math.min(i + 4, lines.length) && selected.length < max; j++) selected.push(`${j + 1}:${lines[j]}`);
      i += 3;
    }
    console.log(`── FALHA exit=${r.code} ${elapsed}s linhas=${lines.length} log=${log}`);
    console.log(`── trecho (máx ${max} linhas):\n${selected.join('\n')}`);
    console.log(`── últimas 10 linhas:\n${lines.slice(-10).join('\n')}`);
  }
  process.exitCode = r.code;
})().catch(e => { console.error(e.message); process.exitCode = 2; });
