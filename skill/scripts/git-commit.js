#!/usr/bin/env node
// Adaptador de CLI para criar commits autorizados via git.js.
const { options, one } = require('./cli-options');
const { commit } = require('./git');
const { ROLES } = require('./roles');

async function main(argv) {
  const o = options(argv, ['-d', '-m']);
  const dir = one(o, '-d'), messages = o['-m'] || [];
  if (!dir || !messages.length || o._.length) throw Error('uso: node git-commit.js -d repo -m titulo [-m corpo]');
  if (process.env.OATHBOUND_AGENT !== ROLES.committer) throw Error(`git-commit.js exige sessão ${ROLES.committer} via run.js`);

  const res = await commit(dir, messages);
  console.log(`${res.hash} ${res.title}\n${res.output}`);
}

main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exitCode = 2; });
