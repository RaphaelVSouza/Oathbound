const fs = require('node:fs');
const path = require('node:path');
const { run } = require('./process-runner');

/** Run Git in root and return trimmed stdout; throw when Git exits unsuccessfully. @param {string} root @param {...string} args @returns {Promise<string>} */
async function git(root, ...args) {
  const r = await run('git', ['-C', root, ...args]);
  if (r.code) throw Error(r.stderr.trim() || `git ${args[0]} falhou`);
  return r.stdout.trim();
}

/** Match a repository path against a glob supporting * and ?. @param {string} name @param {string} pattern @returns {boolean} */
function globMatch(name, pattern) {
  const re = '^' + pattern.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
  return new RegExp(re).test(name.replaceAll('\\', '/'));
}

/** Capture opaque worktree hashes and index entries for later comparison. @param {string} root @returns {Promise<Map<string, string>>} */
async function snapshot(root) {
  const r = await run('git', ['-C', root, 'status', '--porcelain=v1', '-z', '-uall'], { maxCapture: 67108864 });
  if (r.code) throw Error(r.stderr);
  const parts = r.stdout.split('\0'), result = new Map();
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (!entry) continue;
    const xy = entry.slice(0, 2);
    const name = entry.slice(3).replaceAll('\\', '/');
    if (xy.includes('R') || xy.includes('C')) i++; // git -z: nome de origem segue o destino
    const file = path.join(root, name);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      const h = await run('git', ['-C', root, 'hash-object', '--', name]);
      result.set(name, h.stdout.trim());
    } else result.set(name, 'DELETED');
    const staged = await run('git', ['-C', root, 'ls-files', '--stage', '-z', '--', name]);
    if (staged.code) throw Error(staged.stderr.trim() || `git ls-files falhou: ${name}`);
    result.set(name, `${result.get(name)}\t${staged.stdout}`);
  }
  return result;
}

/** Compare two snapshots and include paths touched by commits between them. @param {Map<string, string>} before @param {Map<string, string>} after @param {string[]} committed @returns {string[]} */
function changedPaths(before, after, committed = []) {
  const committedSet = new Set(committed);
  return [...new Set([...before.keys(), ...after.keys(), ...committedSet])]
    .filter(file => committedSet.has(file) || before.get(file) !== after.get(file)).sort();
}

/** Return HEAD's object id, or an empty string when the repository has no resolvable HEAD. @param {string} root @returns {Promise<string>} */
async function head(root) {
  const r = await run('git', ['-C', root, 'rev-parse', '--verify', 'HEAD']);
  return r.code ? '' : r.stdout.trim();
}

/** List unique paths committed between two HEAD values. @param {string} root @param {string} before @param {string} after @returns {Promise<string[]>} */
async function committedPaths(root, before, after) {
  if (!after || before === after) return [];
  const args = before
    ? ['log', '--format=', '--name-only', '-z', `${before}..${after}`]
    : ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '-z', after];
  const r = await run('git', ['-C', root, ...args], { maxCapture: 67108864 });
  if (r.code) throw Error(r.stderr.trim() || 'falha ao consultar caminhos dos commits');
  return [...new Set(r.stdout.split('\0').map(x => x.trim()).filter(Boolean))];
}

/** Resolve a directory to its worktree root and absolute Git directory. @param {string} dir @returns {Promise<{root: string, gitDir: string}>} */
async function repoPaths(dir) {
  return { root: await git(dir, 'rev-parse', '--show-toplevel'),
    gitDir: await git(dir, 'rev-parse', '--absolute-git-dir') };
}

module.exports = { git, globMatch, snapshot, changedPaths, head, committedPaths, repoPaths };
