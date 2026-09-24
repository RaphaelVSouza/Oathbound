#!/usr/bin/env node
// Cria commit somente com caminhos staged autorizados pelo ds-run.
const { options, one, run, repoPaths, globMatch } = require('./lib');

async function main(argv) {
  const o = options(argv, ['-d', '-m']);
  const dir = one(o, '-d'), messages = o['-m'] || [];
  if (!dir || !messages.length || o._.length) throw Error('uso: node git-commit.js -d repo -m titulo [-m corpo]');
  if (process.env.GOVKIT_AGENT !== 'ds-committer') throw Error('git-commit.js exige sessão ds-committer via ds-run.js');
  const scopes = JSON.parse(process.env.GOVKIT_SCOPES || '[]');
  if (!scopes.length) throw Error('escopo vazio');
  const { root } = await repoPaths(dir);
  const conflicts = await run('git', ['-C', root, 'diff', '--name-only', '--diff-filter=U', '-z']);
  if (conflicts.code || conflicts.stdout) throw Error('conflitos não resolvidos ou falha ao consultar o índice');
  const staged = await run('git', ['-C', root, 'diff', '--cached', '--name-only', '-z'], { maxCapture: 67108864 });
  if (staged.code) throw Error(staged.stderr.trim() || 'falha ao consultar o índice');
  const paths = staged.stdout.split('\0').filter(Boolean);
  if (!paths.length) throw Error('nenhuma mudança preparada');
  const outside = paths.filter(file => !scopes.some(scope => globMatch(file, scope)));
  if (outside.length) throw Error(`índice contém arquivos fora do escopo: ${outside.join(', ')}`);
  const check = await run('git', ['-C', root, 'diff', '--cached', '--check']);
  if (check.code) throw Error(check.stdout.trim() || check.stderr.trim() || 'git diff --cached --check falhou');
  const commit = await run('git', ['-C', root, 'commit', ...messages.flatMap(message => ['-m', message])], { timeout: 300 });
  if (commit.code) throw Error(commit.stderr.trim() || commit.stdout.trim() || 'git commit falhou');
  const hash = await run('git', ['-C', root, 'rev-parse', '--short', 'HEAD']);
  console.log(`${hash.stdout.trim()} ${messages[0]}\n${commit.stdout.trim()}`);
}

main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exitCode = 2; });
