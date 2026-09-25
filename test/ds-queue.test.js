const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { queue } = require('../skill/scripts/ds-queue');
const { run } = require('../skill/scripts/process-runner');

test('ds-queue: valida presenca de argumentos obrigatorios (-d, -A, -s, issues)', async () => {
  await assert.rejects(
    () => queue([]),
    /uso: node ds-queue.js -d repo -A aceite.txt -s glob -- issue.md/
  );
  await assert.rejects(
    () => queue(['-d', '.']),
    /uso: node ds-queue.js -d repo -A aceite.txt -s glob -- issue.md/
  );
  await assert.rejects(
    () => queue(['-d', '.', '-A', 'arquivo-inexistente.txt', '-s', 'src/*']),
    /uso: node ds-queue.js -d repo -A aceite.txt -s glob -- issue.md/
  );
});

test('ds-queue: rejeita issue inexistente', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'govkit-test-queue-'));
  t.after(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  await run('git', ['-C', dir, 'init']);
  await run('git', ['-C', dir, 'config', 'user.email', 'test@test.com']);
  await run('git', ['-C', dir, 'config', 'user.name', 'Test']);

  const accept = path.join(dir, 'aceite.txt');
  fs.writeFileSync(accept, 'criterios de aceite');

  await assert.rejects(
    () => queue(['-d', dir, '-A', accept, '-s', 'src/*', '--', 'docs/tickets/999.md']),
    /issue ausente: docs\/tickets\/999.md/
  );
});

test('ds-queue: pula issue que ja consta como revisada (checkpoint)', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'govkit-test-queue-cp-'));
  t.after(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  await run('git', ['-C', dir, 'init']);
  await run('git', ['-C', dir, 'config', 'user.email', 'test@test.com']);
  await run('git', ['-C', dir, 'config', 'user.name', 'Test']);

  const accept = path.join(dir, 'aceite.txt');
  fs.writeFileSync(accept, 'criterios');

  const ticketDir = path.join(dir, 'docs', 'tickets');
  fs.mkdirSync(ticketDir, { recursive: true });
  const ticket = path.join(ticketDir, '001.md');
  fs.writeFileSync(ticket, '# Ticket 001');

  // Set checkpoint as 'revisada' in git state dir
  const stateDir = path.join(dir, '.git', 'ds-queue', 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'docs-001'), 'revisada');

  const code = await queue(['-d', dir, '-A', accept, '-s', 'src/*', '--', 'docs/tickets/001.md']);
  assert.equal(code, 0);
});
