const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { run } = require('../skill/scripts/process-runner');
const {
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
} = require('../skill/scripts/git');
const { ROLES } = require('../skill/scripts/roles');

/** Helper to create an isolated git repo in os.tmpdir() */
async function createIsolatedRepo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-test-git-'));
  t.after(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  });

  await run('git', ['-C', dir, 'init', '-b', 'main']);
  await run('git', ['-C', dir, 'config', 'user.name', 'GovKit Test']);
  await run('git', ['-C', dir, 'config', 'user.email', 'test@govkit.local']);
  return dir;
}

test('globMatch matches patterns correctly', () => {
  assert.equal(globMatch('src/index.js', 'src/*'), true);
  assert.equal(globMatch('src/index.js', 'src/*.js'), true);
  assert.equal(globMatch('docs/README.md', 'src/*'), false);
  assert.equal(globMatch('foo/bar.txt', '*/*'), true);
  assert.equal(globMatch('src/deep/nested/file.js', 'src/**'), true);
});

test('findFiles finds files matching patterns via fs.globSync', () => {
  const files = findFiles(path.resolve(__dirname, '..'), 'test/*.test.js');
  assert.ok(files.length >= 4);
  assert.ok(files.some(f => f.includes('git.test.js')));
});

test('stage: mode all stages entire untracked file', async t => {
  const repo = await createIsolatedRepo(t);
  const filePath = path.join(repo, 'hello.txt');
  fs.writeFileSync(filePath, 'hello world\n', 'utf8');

  const res = await stage(repo, 'hello.txt', { mode: 'all' });
  assert.equal(res.file, 'hello.txt');
  assert.equal(res.mode, 'all');

  const staged = await git(repo, 'diff', '--cached', '--name-only');
  assert.equal(staged, 'hello.txt');
});

test('stage: scope guard rejects files outside scope', async t => {
  const repo = await createIsolatedRepo(t);
  const filePath = path.join(repo, 'secret.txt');
  fs.writeFileSync(filePath, 'content\n', 'utf8');

  await assert.rejects(
    async () => {
      await stage(repo, 'secret.txt', {
        mode: 'all',
        scopes: ['public/*'],
        agent: ROLES.committer
      });
    },
    new RegExp(`fora do escopo do ${ROLES.committer}`)
  );
});

test('stage: mode list returns structured hunks and lines', async t => {
  const repo = await createIsolatedRepo(t);
  const filePath = path.join(repo, 'doc.txt');
  fs.writeFileSync(filePath, 'line 1\nline 2\n', 'utf8');
  await run('git', ['-C', repo, 'add', 'doc.txt']);
  await run('git', ['-C', repo, 'commit', '-m', 'initial']);

  // Modify file
  fs.writeFileSync(filePath, 'line 1 modified\nline 2\nline 3 added\n', 'utf8');

  const res = await stage(repo, 'doc.txt', { mode: 'list' });
  assert.equal(res.file, 'doc.txt');
  assert.equal(res.mode, 'list');
  assert.ok(Array.isArray(res.hunks));
  assert.ok(res.hunks.length > 0);

  const hunk = res.hunks[0];
  assert.ok(hunk.id === 1);
  assert.ok(hunk.header.startsWith('@@'));
  assert.ok(Array.isArray(hunk.lines));
  assert.ok(hunk.lines.some(l => l.text.includes('line 1 modified')));
});

test('stage: mode lines selectively stages specific line', async t => {
  const repo = await createIsolatedRepo(t);
  const filePath = path.join(repo, 'code.js');
  fs.writeFileSync(filePath, 'const a = 1;\nconst b = 2;\n', 'utf8');
  await run('git', ['-C', repo, 'add', 'code.js']);
  await run('git', ['-C', repo, 'commit', '-m', 'base']);

  // Modify both lines
  fs.writeFileSync(filePath, 'const a = 10;\nconst b = 20;\n', 'utf8');

  // List lines first to discover line IDs
  const listRes = await stage(repo, 'code.js', { mode: 'list' });
  const addedLines = listRes.hunks.flatMap(h => h.lines).filter(l => l.text.startsWith('+'));
  assert.equal(addedLines.length, 2);

  // Stage only the first change (const a = 10)
  const lineToStage = addedLines[0].id;
  const stageRes = await stage(repo, 'code.js', { mode: 'lines', lines: [lineToStage] });
  assert.equal(stageRes.mode, 'lines');
  assert.deepEqual(stageRes.numbers, [lineToStage]);

  const cachedDiff = await git(repo, 'diff', '--cached');
  assert.ok(cachedDiff.includes('+const a = 10;'));
  assert.ok(!cachedDiff.includes('+const b = 20;'));
});

test('commit: creates commit and enforces scopes', async t => {
  const repo = await createIsolatedRepo(t);
  const filePath = path.join(repo, 'src', 'app.js');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(filePath, 'console.log(1);\n', 'utf8');

  await stage(repo, 'src/app.js', { mode: 'all' });

  // Rejection if staged file is outside scope
  await assert.rejects(
    async () => {
      await commit(repo, ['feat: should fail'], {
        scopes: ['docs/*'],
        agent: ROLES.committer
      });
    },
    /índice contém arquivos fora do escopo/
  );

  // Success when in scope
  const res = await commit(repo, ['feat: add app', 'body text'], {
    scopes: ['src/*'],
    agent: ROLES.committer
  });

  assert.ok(res.hash.length > 0);
  assert.equal(res.title, 'feat: add app');

  const log = await git(repo, 'log', '-1', '--oneline');
  assert.ok(log.includes('feat: add app'));
});

test('commit: rejeita quando agente e committer e nao ha escopos', async t => {
  const repo = await createIsolatedRepo(t);
  const filePath = path.join(repo, 'src', 'app.js');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(filePath, 'console.log(1);\n', 'utf8');
  await stage(repo, 'src/app.js', { mode: 'all' });

  await assert.rejects(
    async () => {
      await commit(repo, ['feat: sem escopo'], {
        scopes: [],
        agent: ROLES.committer
      });
    },
    /exige sessão .* com escopo/
  );
});

test('snapshot, changedPaths, head, committedPaths state tracking', async t => {
  const repo = await createIsolatedRepo(t);
  const snap1 = await snapshot(repo);
  const head1 = await head(repo);
  assert.equal(head1, '');

  const file = path.join(repo, 'test.txt');
  fs.writeFileSync(file, 'v1\n', 'utf8');

  const snap2 = await snapshot(repo);
  const changed = changedPaths(snap1, snap2);
  assert.deepEqual(changed, ['test.txt']);

  await stage(repo, 'test.txt', { mode: 'all' });
  await commit(repo, ['initial commit']);

  const head2 = await head(repo);
  assert.ok(head2.length > 0);

  const committed = await committedPaths(repo, head1, head2);
  assert.deepEqual(committed, ['test.txt']);
});

test('snapshot: detecta mudança só no índice, no worktree, remoção e renomeação', async t => {
  const repo = await createIsolatedRepo(t);
  for (const name of ['a.txt', 'b.txt', 'c.txt', 'd.txt']) fs.writeFileSync(path.join(repo, name), `${name}\n`);
  await run('git', ['-C', repo, 'add', '.']);
  await run('git', ['-C', repo, 'commit', '-m', 'base']);

  fs.writeFileSync(path.join(repo, 'a.txt'), 'a2\n');
  fs.writeFileSync(path.join(repo, 'b.txt'), 'b2\n');
  await run('git', ['-C', repo, 'add', 'b.txt']);
  const before = await snapshot(repo);

  // a.txt: só o índice muda (worktree igual); b.txt: só o worktree muda (índice igual).
  await run('git', ['-C', repo, 'add', 'a.txt']);
  fs.writeFileSync(path.join(repo, 'b.txt'), 'b3\n');
  fs.rmSync(path.join(repo, 'c.txt'));
  await run('git', ['-C', repo, 'mv', 'd.txt', 'e.txt']);
  const after = await snapshot(repo);

  assert.deepEqual(changedPaths(before, after), ['a.txt', 'b.txt', 'c.txt', 'e.txt']);
  assert.match(after.get('c.txt'), /^DELETED\t/);
});

test('snapshot: nomes com espaço, acento e caracteres de glob são tratados literalmente', async t => {
  const repo = await createIsolatedRepo(t);
  const names = ['com espaço.txt', 'ação.txt', 'src/[x].txt'];
  // O Windows proíbe *, ? e aspas em nomes de arquivo.
  if (process.platform !== 'win32') names.push('src/a*b?.txt', '"aspas".txt');
  fs.mkdirSync(path.join(repo, 'src'));
  for (const name of names) fs.writeFileSync(path.join(repo, name), 'v1\n');
  const before = await snapshot(repo);
  assert.deepEqual([...before.keys()].sort(), [...names].sort());

  for (const name of names) fs.writeFileSync(path.join(repo, name), 'v2\n');
  const after = await snapshot(repo);
  assert.deepEqual(changedPaths(before, after), [...names].sort());
  for (const name of names) assert.notEqual(before.get(name), after.get(name));
});

test('snapshot: hash do worktree bate com git hash-object por arquivo', async t => {
  const repo = await createIsolatedRepo(t);
  for (let i = 0; i < 50; i++) fs.writeFileSync(path.join(repo, `f${i}.txt`), `conteudo ${i}\n`);
  const snap = await snapshot(repo);
  assert.equal(snap.size, 50);
  for (const name of ['f0.txt', 'f25.txt', 'f49.txt']) {
    const single = await git(repo, 'hash-object', '--', name);
    assert.equal(snap.get(name).split('\t')[0], single);
  }
});
