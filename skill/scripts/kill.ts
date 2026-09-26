#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { repoPaths } = require('./git.ts');
const { alive, killTree } = require('./process-runner.ts');
const { stateDir } = require('./roles.ts');

async function killRegistered(root: string, mode: string = '-l', quiet: boolean = false): Promise<void> {
  const { gitDir } = await repoPaths(root);
  const base = path.join(stateDir(gitDir), 'procs');
  if (!fs.existsSync(base)) return;
  for (const tag of fs.readdirSync(base)) {
    const dir = path.join(base, tag);
    if (!fs.statSync(dir).isDirectory()) continue;
    const ownerFile = path.join(dir, '.owner');
    const owner = fs.existsSync(ownerFile) ? Number(fs.readFileSync(ownerFile, 'utf8')) : 0;
    const files = fs.readdirSync(dir).filter(x => /^\d+$/.test(x));
    if (mode === '-l') {
      if (!quiet) console.log(`${tag} dono=${owner} ${alive(owner) ? 'vivo' : 'morto'}`);
      for (const file of files) if (!quiet) console.log(`  pid=${file} ${fs.readFileSync(path.join(dir, file), 'utf8').slice(0, 100)}`);
      continue;
    }
    if (mode !== '--all' && mode !== tag && !(mode === '--orphans' && !alive(owner))) continue;
    for (const file of files) {
      await killTree(Number(file));
      if (!quiet) console.error(`── oathbound kill: ${tag} pid=${file} encerrado`);
      fs.rmSync(path.join(dir, file), { force: true });
    }
    fs.rmSync(ownerFile, { force: true });
    fs.rmdirSync(dir);
  }
}

if (require.main === module) (async () => {
  const args = process.argv.slice(2), di = args.indexOf('-d');
  const root = di >= 0 ? args.splice(di, 2)[1] : '.';
  const qi = args.indexOf('-q'), quiet = qi >= 0;
  if (quiet) args.splice(qi, 1);
  await killRegistered(root, args[0] || '-l', quiet);
})().catch(e => { console.error(e.message); process.exitCode = 2; });

module.exports = { killRegistered };
