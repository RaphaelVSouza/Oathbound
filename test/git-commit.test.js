const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { run } = require('../skill/scripts/process-runner');
const { ROLES } = require('../skill/scripts/roles');

/** Helper to create an isolated git repo in os.tmpdir() */
async function createIsolatedRepo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-test-git-commit-'));
  t.after(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  });

  await run('git', ['-C', dir, 'init', '-b', 'main']);
  await run('git', ['-C', dir, 'config', 'user.name', 'GovKit Test']);
  await run('git', ['-C', dir, 'config', 'user.email', 'test@test.com']);
  return dir;
}

test('git-commit.js: recusa quando OATHBOUND_AGENT nao e o committer', async t => {
  const repo = await createIsolatedRepo(t);
  fs.writeFileSync(path.join(repo, 'app.js'), 'console.log(1);\n', 'utf8');
  await run('git', ['-C', repo, 'add', 'app.js']);

  const script = path.join(__dirname, '..', 'skill', 'scripts', 'git-commit.js');
  const res = await run('node', [script, '-d', repo, '-m', 'feat: teste'], {
    env: { ...process.env, OATHBOUND_AGENT: 'papel-errado' }
  });

  assert.equal(res.code, 2);
  assert.ok(res.stderr.includes(`exige sessão ${ROLES.committer}`));
});
