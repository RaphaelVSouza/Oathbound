const fs = require('node:fs');
const path = require('node:path');
const { run } = require('./process-runner');

/** Run Git in root and return trimmed stdout; throw when Git exits unsuccessfully.
 * @param {string} root
 * @param {...string} args
 * @returns {Promise<string>}
 */
async function git(root, ...args) {
  const r = await run('git', ['-C', root, ...args]);
  if (r.code) throw Error(r.stderr.trim() || `git ${args[0]} falhou`);
  return r.stdout.trim();
}

/** Match a repository path against a glob supporting * and ?.
 * Uses path.matchesGlob when available (Node 22 LTS).
 * @param {string} name
 * @param {string} pattern
 * @returns {boolean}
 */
function globMatch(name, pattern) {
  const normalized = name.replaceAll('\\', '/');
  if (typeof path.matchesGlob === 'function') {
    return path.matchesGlob(normalized, pattern) || (pattern.endsWith('/*') && path.matchesGlob(normalized, pattern + '*'));
  }
  const re = '^' + pattern.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
  return new RegExp(re).test(normalized);
}

/** Find files matching a glob pattern relative to a directory using fs.globSync.
 * @param {string} dir
 * @param {string} [pattern='**\/*']
 * @returns {string[]}
 */
function findFiles(dir, pattern = '**/*') {
  if (typeof fs.globSync === 'function') {
    return fs.globSync(pattern, { cwd: dir }).map(p => p.replaceAll('\\', '/'));
  }
  return [];
}

/** Resolve a directory to its worktree root and absolute Git directory.
 * @param {string} dir
 * @returns {Promise<{root: string, gitDir: string}>}
 */
async function repoPaths(dir) {
  return {
    root: await git(dir, 'rev-parse', '--show-toplevel'),
    gitDir: await git(dir, 'rev-parse', '--absolute-git-dir')
  };
}

/** Capture opaque worktree hashes and index entries for later comparison.
 * @param {string} root
 * @returns {Promise<Map<string, string>>}
 */
async function snapshot(root) {
  const r = await run('git', ['-C', root, 'status', '--porcelain=v1', '-z', '-uall'], { maxCapture: 67108864 });
  if (r.code) throw Error(r.stderr);
  const parts = r.stdout.split('\0'), result = new Map();
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (!entry) continue;
    const xy = entry.slice(0, 2);
    const name = entry.slice(3).replaceAll('\\', '/');
    if (xy.includes('R') || xy.includes('C')) i++;
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

/** Compare two snapshots and include paths touched by commits between them.
 * @param {Map<string, string>} before
 * @param {Map<string, string>} after
 * @param {string[]} committed
 * @returns {string[]}
 */
function changedPaths(before, after, committed = []) {
  const committedSet = new Set(committed);
  return [...new Set([...before.keys(), ...after.keys(), ...committedSet])]
    .filter(file => committedSet.has(file) || before.get(file) !== after.get(file)).sort();
}

/** Return HEAD's object id, or an empty string when the repository has no resolvable HEAD.
 * @param {string} root
 * @returns {Promise<string>}
 */
async function head(root) {
  const r = await run('git', ['-C', root, 'rev-parse', '--verify', 'HEAD']);
  return r.code ? '' : r.stdout.trim();
}

/** List unique paths committed between two HEAD values.
 * @param {string} root
 * @param {string} before
 * @param {string} after
 * @returns {Promise<string[]>}
 */
async function committedPaths(root, before, after) {
  if (!after || before === after) return [];
  const args = before
    ? ['log', '--format=', '--name-only', '-z', `${before}..${after}`]
    : ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '-z', after];
  const r = await run('git', ['-C', root, ...args], { maxCapture: 67108864 });
  if (r.code) throw Error(r.stderr.trim() || 'falha ao consultar caminhos dos commits');
  return [...new Set(r.stdout.split('\0').map(x => x.trim()).filter(Boolean))];
}

/**
 * @typedef {{ id: number, text: string }} DiffLine
 * @typedef {{ id: number, header: string, lines: DiffLine[] }} DiffHunk
 * @typedef {{ mode: 'all'|'list'|'hunks'|'lines', hunks?: number[], lines?: number[], scopes?: string[], agent?: string }} StageOptions
 * @typedef {{ file: string, mode: string, hunks?: DiffHunk[], numbers?: number[] }} StageResult
 */

/** Stage an entire file, list hunks, or selectively stage hunks/lines into the Git index.
 * @param {string} dir
 * @param {string} requested
 * @param {StageOptions} opts
 * @returns {Promise<StageResult>}
 */
async function stage(dir, requested, opts = {}) {
  const { root } = await repoPaths(dir);
  const absolute = path.resolve(root, requested);
  const relative = path.relative(path.resolve(root), absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw Error('arquivo fora do repositório');
  }
  const file = relative.replaceAll('\\', '/');
  const agent = opts.agent !== undefined ? opts.agent : process.env.GOVKIT_AGENT;
  let scopes = opts.scopes;
  if (!scopes && agent === 'ds-committer') {
    scopes = JSON.parse(process.env.GOVKIT_SCOPES || '[]');
  }
  if (agent === 'ds-committer' || (scopes && scopes.length > 0)) {
    if (scopes && !scopes.some(scope => globMatch(file, scope))) {
      throw Error(`fora do escopo${agent ? ` do ${agent}` : ''}: ${file}`);
    }
  }

  const mode = opts.mode;
  if (!['all', 'list', 'hunks', 'lines'].includes(mode)) {
    throw Error('modo inválido para stage: escolha all, list, hunks ou lines');
  }

  const literal = `:(literal)${file}`;
  if (mode === 'all') {
    const r = await run('git', ['-C', root, 'add', '--', literal]);
    if (r.code) throw Error(r.stderr.trim() || 'git add falhou');
    return { file, mode: 'all' };
  }

  const r = await run('git', ['-C', root, 'diff', '--no-ext-diff', '--unified=0', '--', literal], { maxCapture: 67108864 });
  if (r.code) throw Error(r.stderr.trim() || 'git diff falhou');
  const starts = [...r.stdout.matchAll(/^@@ /gm)].map(m => m.index);
  if (!starts.length) throw Error(`sem hunks de texto não preparados: ${file}; para arquivo inteiro use --all`);
  const header = r.stdout.slice(0, starts[0]);
  const rawHunkTexts = starts.map((start, i) => r.stdout.slice(start, starts[i + 1] ?? r.stdout.length));

  let lineNumber = 0;
  const parsedHunks = rawHunkTexts.map((h, i) => {
    const rawLines = h.split('\n').slice(1, -1);
    const lines = rawLines.map(line => ({ id: /^[+-]/.test(line) ? ++lineNumber : 0, text: line }));
    return { id: i + 1, header: h.split('\n')[0], text: h, lines };
  });

  if (mode === 'list') {
    return {
      file,
      mode: 'list',
      hunks: parsedHunks.map(h => ({
        id: h.id,
        header: h.header,
        lines: h.lines.filter(l => l.id > 0)
      }))
    };
  }

  if (mode === 'hunks') {
    const numbers = opts.hunks || [];
    if (!numbers.length || numbers.some(n => !Number.isInteger(n) || n < 1 || n > parsedHunks.length) || new Set(numbers).size !== numbers.length) {
      throw Error('lista de seleção inválida');
    }
    const patch = header + numbers.sort((a, b) => a - b).map(n => parsedHunks[n - 1].text).join('');
    const applied = await run('git', ['-C', root, 'apply', '--cached', '--unidiff-zero', '-'], { input: patch });
    if (applied.code) throw Error(applied.stderr.trim() || 'git apply --cached falhou');
    return { file, mode: 'hunks', numbers };
  }

  // mode === 'lines'
  const numbers = opts.lines || [];
  if (!numbers.length || numbers.some(n => !Number.isInteger(n) || n < 1 || n > lineNumber) || new Set(numbers).size !== numbers.length) {
    throw Error('lista de seleção inválida');
  }
  if (r.stdout.includes('\\ No newline at end of file')) throw Error('hunk sem newline final: use --hunks ou --all');

  const chosen = new Set(numbers);
  const selected = [];
  parsedHunks.forEach(h => {
    const [first] = h.text.split('\n').slice(0, -1);
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
    h.lines.forEach(l => {
      if (!l.text) return;
      if (l.text.startsWith('-')) removed.push(l);
      else if (l.text.startsWith('+')) added.push(l);
      else { flush(); picked.push(l.text); }
    });
    flush();
    if (!picked.some(line => /^[+-]/.test(line))) return;
    const oldCount = picked.filter(line => !line.startsWith('+')).length;
    const newCount = picked.filter(line => !line.startsWith('-')).length;
    selected.push(`@@ -${match[1]},${oldCount} +${match[2]},${newCount} @@${match[3]}\n${picked.join('\n')}\n`);
  });
  const patch = header + selected.join('');
  const applied = await run('git', ['-C', root, 'apply', '--cached', '--unidiff-zero', '-'], { input: patch });
  if (applied.code) throw Error(applied.stderr.trim() || 'git apply --cached falhou');
  return { file, mode: 'lines', numbers };
}

/**
 * @typedef {{ scopes?: string[], agent?: string, timeout?: number }} CommitOptions
 * @typedef {{ hash: string, title: string, output: string }} CommitResult
 */

/** Verify scopes, check staged changes, and create a Git commit.
 * @param {string} dir
 * @param {string[]} messages
 * @param {CommitOptions} opts
 * @returns {Promise<CommitResult>}
 */
async function commit(dir, messages, opts = {}) {
  if (!Array.isArray(messages) || !messages.length) throw Error('título do commit obrigatório');
  const agent = opts.agent !== undefined ? opts.agent : process.env.GOVKIT_AGENT;
  let scopes = opts.scopes;
  if (!scopes && agent === 'ds-committer') {
    scopes = JSON.parse(process.env.GOVKIT_SCOPES || '[]');
  }
  if (agent === 'ds-committer') {
    if (!scopes || !scopes.length) throw Error('git-commit.js exige sessão ds-committer com escopo via ds-run.js');
  }

  const { root } = await repoPaths(dir);
  const conflicts = await run('git', ['-C', root, 'diff', '--name-only', '--diff-filter=U', '-z']);
  if (conflicts.code || conflicts.stdout) throw Error('conflitos não resolvidos ou falha ao consultar o índice');

  const staged = await run('git', ['-C', root, 'diff', '--cached', '--name-only', '-z'], { maxCapture: 67108864 });
  if (staged.code) throw Error(staged.stderr.trim() || 'falha ao consultar o índice');
  const paths = staged.stdout.split('\0').filter(Boolean);
  if (!paths.length) throw Error('nenhuma mudança preparada');

  if (scopes && scopes.length > 0) {
    const outside = paths.filter(file => !scopes.some(scope => globMatch(file, scope)));
    if (outside.length) throw Error(`índice contém arquivos fora do escopo: ${outside.join(', ')}`);
  }

  const check = await run('git', ['-C', root, 'diff', '--cached', '--check']);
  if (check.code) throw Error(check.stdout.trim() || check.stderr.trim() || 'git diff --cached --check falhou');

  const commitRes = await run('git', ['-C', root, 'commit', ...messages.flatMap(m => ['-m', m])], { timeout: opts.timeout || 300 });
  if (commitRes.code) throw Error(commitRes.stderr.trim() || commitRes.stdout.trim() || 'git commit falhou');

  const hash = await run('git', ['-C', root, 'rev-parse', '--short', 'HEAD']);
  return { hash: hash.stdout.trim(), title: messages[0], output: commitRes.stdout.trim() };
}

module.exports = {
  git,
  globMatch,
  findFiles,
  repoPaths,
  snapshot,
  changedPaths,
  head,
  committedPaths,
  stage,
  commit
};
