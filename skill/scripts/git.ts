const fs = require('node:fs');
const path = require('node:path');
const { run } = require('./process-runner.ts');
const { ROLES } = require('./roles.ts');

interface DiffLine {
  id: number;
  text: string;
}

interface DiffHunk {
  id: number;
  header: string;
  lines: DiffLine[];
  text?: string;
}

interface StageOptions {
  mode: 'all' | 'list' | 'hunks' | 'lines';
  hunks?: number[];
  lines?: number[];
  scopes?: string[];
  agent?: string;
}

interface StageResult {
  file: string;
  mode: string;
  hunks?: DiffHunk[];
  numbers?: number[];
}

interface CommitOptions {
  scopes?: string[];
  agent?: string;
  timeout?: number;
}

interface CommitResult {
  hash: string;
  title: string;
  output: string;
}

/** Run Git in root and return trimmed stdout; throw when Git exits unsuccessfully. */
async function git(root: string, ...args: string[]): Promise<string> {
  const r = await run('git', ['-C', root, ...args]);
  if (r.code) throw Error(r.stderr.trim() || `git ${args[0]} falhou`);
  return r.stdout.trim();
}

/** Match a repository path against a glob supporting * and ?.
 * Uses native path.matchesGlob (Node 24 LTS).
 */
function globMatch(name: string, pattern: string): boolean {
  const normalized = name.replaceAll('\\', '/');
  return path.matchesGlob(normalized, pattern) || (pattern.endsWith('/*') && path.matchesGlob(normalized, pattern + '*'));
}

/** Find files matching a glob pattern relative to a directory using native fs.globSync.
 * @param {string} dir
 * @param {string} [pattern='**\/*']
 * @returns {string[]}
 */
function findFiles(dir: string, pattern: string = '**/*'): string[] {
  return fs.globSync(pattern, { cwd: dir }).map((p: string) => p.replaceAll('\\', '/'));
}

/** Resolve a directory to its worktree root and absolute Git directory. */
async function repoPaths(dir: string): Promise<{ root: string; gitDir: string }> {
  return {
    root: await git(dir, 'rev-parse', '--show-toplevel'),
    gitDir: await git(dir, 'rev-parse', '--absolute-git-dir')
  };
}

/** Capture opaque worktree hashes and index entries for later comparison. */
async function snapshot(root: string): Promise<Map<string, string>> {
  const r = await run('git', ['-C', root, 'status', '--porcelain=v1', '-z', '-uall'], { maxCapture: 67108864 });
  if (r.code) throw Error(r.stderr);
  const parts = r.stdout.split('\0'), names: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (!entry) continue;
    const xy = entry.slice(0, 2);
    names.push(entry.slice(3).replaceAll('\\', '/'));
    if (xy.includes('R') || xy.includes('C')) i++;
  }
  if (!names.length) return new Map();

  const files = names.filter(name => {
    try { return fs.statSync(path.join(root, name)).isFile(); } catch { return false; }
  });
  const batch = files.filter(name => !name.includes('\n') && !name.startsWith('"'));
  const single = files.filter(name => !batch.includes(name));
  const hashes = new Map<string, string>();
  if (batch.length) {
    const h = await run('git', ['-C', root, 'hash-object', '--stdin-paths'], { input: batch.join('\n') + '\n', maxCapture: 67108864 });
    if (h.code) throw Error(h.stderr.trim() || 'git hash-object falhou');
    const lines = h.stdout.split('\n').map(x => x.trim()).filter(Boolean);
    if (lines.length !== batch.length) throw Error(`git hash-object devolveu ${lines.length} hashes para ${batch.length} arquivos`);
    batch.forEach((name, i) => hashes.set(name, lines[i]));
  }
  for (const name of single) {
    const h = await run('git', ['-C', root, 'hash-object', '--', name]);
    if (h.code) throw Error(h.stderr.trim() || `git hash-object falhou: ${name}`);
    hashes.set(name, h.stdout.trim());
  }

  const staged = await run('git', ['-C', root, 'ls-files', '--stage', '-z'], { maxCapture: 67108864 });
  if (staged.code) throw Error(staged.stderr.trim() || 'git ls-files falhou');
  const index = new Map<string, string>();
  for (const entry of staged.stdout.split('\0')) {
    const tab = entry.indexOf('\t');
    if (tab < 0) continue;
    const name = entry.slice(tab + 1);
    index.set(name, `${index.get(name) || ''}${entry.slice(0, tab)};`);
  }

  const result = new Map<string, string>();
  for (const name of names) result.set(name, `${hashes.get(name) || 'DELETED'}\t${index.get(name) || ''}`);
  return result;
}

/** Compare two snapshots and include paths touched by commits between them. */
function changedPaths(before: Map<string, string>, after: Map<string, string>, committed: string[] = []): string[] {
  const committedSet = new Set(committed);
  return [...new Set([...before.keys(), ...after.keys(), ...committedSet])]
    .filter(file => committedSet.has(file) || before.get(file) !== after.get(file)).sort();
}

/** Return HEAD's object id, or an empty string when the repository has no resolvable HEAD. */
async function head(root: string): Promise<string> {
  const r = await run('git', ['-C', root, 'rev-parse', '--verify', 'HEAD']);
  return r.code ? '' : r.stdout.trim();
}

/** List unique paths committed between two HEAD values. */
async function committedPaths(root: string, before: string, after: string): Promise<string[]> {
  if (!after || before === after) return [];
  const args = before
    ? ['log', '--format=', '--name-only', '-z', `${before}..${after}`]
    : ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '-z', after];
  const r = await run('git', ['-C', root, ...args], { maxCapture: 67108864 });
  if (r.code) throw Error(r.stderr.trim() || 'falha ao consultar caminhos dos commits');
  return [...new Set(r.stdout.split('\0').map(x => x.trim()).filter(Boolean))];
}

/** Stage an entire file, list hunks, or selectively stage hunks/lines into the Git index. */
async function stage(dir: string, requested: string, opts: StageOptions = { mode: 'all' }): Promise<StageResult> {
  const { root } = await repoPaths(dir);
  const absolute = path.resolve(root, requested);
  const relative = path.relative(path.resolve(root), absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw Error('arquivo fora do repositório');
  }
  const file = relative.replaceAll('\\', '/');
  const agent = opts.agent !== undefined ? opts.agent : process.env.OATHBOUND_AGENT;
  let scopes = opts.scopes;
  if (!scopes && agent === ROLES.committer) {
    scopes = JSON.parse(process.env.OATHBOUND_SCOPES || '[]');
  }
  if (agent === ROLES.committer || (scopes && scopes.length > 0)) {
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
  const selected: string[] = [];
  parsedHunks.forEach(h => {
    const [first] = h.text.split('\n').slice(0, -1);
    const match = first.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
    if (!match) throw Error(`cabeçalho de hunk inválido: ${first}`);
    const picked: string[] = [];
    let removed: DiffLine[] = [], added: DiffLine[] = [];
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

/** Verify scopes, check staged changes, and create a Git commit. */
async function commit(dir: string, messages: string[], opts: CommitOptions = {}): Promise<CommitResult> {
  if (!Array.isArray(messages) || !messages.length) throw Error('título do commit obrigatório');
  const agent = opts.agent !== undefined ? opts.agent : process.env.OATHBOUND_AGENT;
  let scopes = opts.scopes;
  if (!scopes && agent === ROLES.committer) {
    scopes = JSON.parse(process.env.OATHBOUND_SCOPES || '[]');
  }
  if (agent === ROLES.committer) {
    if (!scopes || !scopes.length) throw Error(`git-commit.js exige sessão ${ROLES.committer} com escopo via run.js`);
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
