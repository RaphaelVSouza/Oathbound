#!/usr/bin/env node
const { run } = require('./lib');
(async () => {
  const [seconds, ...rest] = process.argv.slice(2);
  const args = rest[0] === '--' ? rest.slice(1) : rest;
  if (!Number.isInteger(Number(seconds)) || Number(seconds) <= 0 || !args.length) throw Error('uso: node tree-timeout.js <segundos> -- comando args...');
  const shell = process.platform === 'win32' && /^(npm|npx|pnpm|yarn)(\.cmd)?$/i.test(args[0]);
  const r = await run(args[0], args.slice(1), { timeout: Number(seconds), output: 'inherit', shell });
  process.exitCode = r.code;
})().catch(e => { console.error(e.message); process.exitCode = 2; });
