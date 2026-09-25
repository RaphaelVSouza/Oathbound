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

test('ds-queue: processa issue com runner emitindo saida estruturada JSONL sem falhar no reviewer (codigo 6)', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'govkit-test-queue-codex-'));
  t.after(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  await run('git', ['-C', dir, 'init']);
  await run('git', ['-C', dir, 'config', 'user.email', 'test@test.com']);
  await run('git', ['-C', dir, 'config', 'user.name', 'Test']);

  const accept = path.join(dir, 'aceite.txt');
  fs.writeFileSync(accept, 'criterios de aceite');

  const ticketDir = path.join(dir, 'docs', 'tickets');
  fs.mkdirSync(ticketDir, { recursive: true });
  const ticket = path.join(ticketDir, '002.md');
  fs.writeFileSync(ticket, '# Ticket 002: Implementar feature');

  const mockRunnerPath = path.join(dir, 'mock-codex-runner.js');
  const codexScript = `
    const codex = require(${JSON.stringify(path.resolve(__dirname, '../skill/scripts/runners/codex'))}).adapter;
    module.exports = {
      name: 'mock-codex',
      resolveAgentFile: () => '',
      prepareAgent: () => ({ promptPrefix: '' }),
      buildCommand({ agent }) {
        if (agent === 'ds-reviewer') {
          const s = [
            'console.log(JSON.stringify({ type: "thread.started", thread_id: "th-rev-999" }));',
            'console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "No issues." } }));'
          ].join('\\n');
          return { command: 'node', args: ['-e', s] };
        }
        const s = [
          'const fs = require("node:fs");',
          'fs.mkdirSync("src", { recursive: true });',
          'fs.writeFileSync("src/feature.js", "export const ok = true;\\\\n");',
          'console.log(JSON.stringify({ type: "thread.started", thread_id: "th-run-111" }));',
          'console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "ACEITE: feature implementada" } }));'
        ].join('\\n');
        return { command: 'node', args: ['-e', s] };
      },
      parseOutput: codex.parseOutput,
      resolveSession: codex.resolveSession
    };
  `;
  fs.writeFileSync(mockRunnerPath, codexScript, 'utf8');

  const code = await queue([
    '-d', dir,
    '-A', accept,
    '-s', 'src/*',
    '-u', mockRunnerPath,
    '--',
    'docs/tickets/002.md'
  ]);

  assert.equal(code, 0, 'fila deve concluir com sucesso (codigo 0) e casar recibo No issues. do reviewer');

  const stateDir = path.join(dir, '.git', 'ds-queue', 'state');
  const stage = fs.readFileSync(path.join(stateDir, 'docs-002'), 'utf8').trim();
  assert.equal(stage, 'revisada', 'estagio final deve ser revisada');
});

