const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  runSession,
  dsRun,
  overlap,
  mutex,
  temporaryAgent,
  feedbackAgent
} = require('../skill/scripts/ds-run');

/** Helper to create isolated directory */
function createTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'govkit-test-dsrun-'));
  t.after(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  });
  return dir;
}

test('overlap: detecta sobreposicao de prefixos e globs', () => {
  assert.equal(overlap('src/*', 'src/app.js'), true);
  assert.equal(overlap('src/app.js', 'src/*'), true);
  assert.equal(overlap('src/*', 'docs/*'), false);
  assert.equal(overlap('tools/audit-*', 'tools/*'), true);
  assert.equal(overlap('skill/scripts/*', 'skill/references/*'), false);
});

test('mutex: protege execucao exclusiva e libera trava', async t => {
  const dir = createTempDir(t);
  let ran = false;

  const result = await mutex(dir, async () => {
    ran = true;
    assert.ok(fs.existsSync(path.join(dir, 'mutex')));
    assert.equal(fs.readFileSync(path.join(dir, 'mutex', 'pid'), 'utf8'), String(process.pid));
    return 42;
  });

  assert.equal(ran, true);
  assert.equal(result, 42);
  assert.ok(!fs.existsSync(path.join(dir, 'mutex')));
});

test('feedbackAgent: bloqueia permissoes de escrita e shell', t => {
  const dir = createTempDir(t);
  const agentFile = path.join(dir, 'agent.md');
  const agentContent = [
    '---',
    'permissions:',
    '  edit:',
    '    "src/*": allow',
    '  bash:',
    '    "git *": allow',
    '---'
  ].join('\n');
  fs.writeFileSync(agentFile, agentContent, 'utf8');

  const generated = feedbackAgent(agentFile, 'agent');
  t.after(() => {
    try { fs.rmSync(generated, { force: true }); } catch {}
  });

  assert.ok(fs.existsSync(generated));
  const generatedContent = fs.readFileSync(generated, 'utf8');
  assert.ok(generatedContent.includes('edit: deny'));
  assert.ok(generatedContent.includes('bash: deny'));
  assert.ok(!generatedContent.includes('src/*: allow'));
});

test('temporaryAgent: injeta bloqueios de outros agentes ativos', t => {
  const dir = createTempDir(t);
  const agentFile = path.join(dir, 'agent.md');
  const agentContent = [
    '---',
    'permissions:',
    '  edit:',
    '    "src/*": allow',
    '---'
  ].join('\n');
  fs.writeFileSync(agentFile, agentContent, 'utf8');

  const others = [{ glob: 'docs/*', label: 'other-agent' }];
  const generated = temporaryAgent(agentFile, 'agent', others);
  t.after(() => {
    try { fs.rmSync(generated, { force: true }); } catch {}
  });

  assert.ok(fs.existsSync(generated));
  const content = fs.readFileSync(generated, 'utf8');
  assert.ok(content.includes('"docs/*": deny'));
});

test('runSession: valida parametros obrigatorios e regras de escopo', async () => {
  await assert.rejects(
    async () => { await runSession({}); },
    /repositório obrigatório/
  );

  await assert.rejects(
    async () => { await runSession({ repo: '.', readonly: false, scopes: [] }); },
    /modo de edição exige ao menos um escopo/
  );

  await assert.rejects(
    async () => { await runSession({ repo: '.', readonly: true, scopes: ['src/*'] }); },
    /modo somente leitura proíbe escopos/
  );

  await assert.rejects(
    async () => { await runSession({ repo: '.', readonly: true, feedback: 'status' }); },
    /uso de feedback: sessão obrigatória/
  );
});

test('dsRun: adaptador CLI valida sintaxe e opcoes legadas', async () => {
  await assert.rejects(
    async () => { await dsRun(['--opcao-inexistente']); },
    /opção inválida/
  );

  await assert.rejects(
    async () => { await dsRun(['-d', '.', '-R', '-s', 'src/*']); },
    /uso: node ds-run\.js/
  );

  await assert.rejects(
    async () => { await dsRun(['-d', '.', '-R', '-e']); },
    /falta valor para -e/
  );
});

test('runSession: captura sessao antecipadamente e extrai parsed.text e telemetria', async (t) => {
  const dir = createTempDir(t);
  const { run } = require('../skill/scripts/process-runner');
  await run('git', ['-C', dir, 'init']);
  await run('git', ['-C', dir, 'config', 'user.email', 'test@test.com']);
  await run('git', ['-C', dir, 'config', 'user.name', 'Test']);

  const script = [
    'console.log(JSON.stringify({ type: "thread.started", thread_id: "early-th-999" }));',
    'for (let i = 0; i < 50; i++) console.log("linha repetitiva " + i);',
    'console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Mensagem final limpa." } }));',
    'console.log(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 100, output_tokens: 20 } }));'
  ].join('\n');

  const customRunner = {
    name: 'codex',
    resolveAgentFile: () => '',
    prepareAgent: () => ({ promptPrefix: '' }),
    buildCommand: () => ({
      command: 'node',
      args: ['-e', script]
    }),
    parseOutput: require('../skill/scripts/runners/codex').adapter.parseOutput,
    resolveSession: async () => ''
  };

  const res = await runSession({
    repo: dir,
    runner: customRunner,
    readonly: true,
    message: 'test prompt',
    output: false
  });

  assert.equal(res.session, 'early-th-999');
  assert.equal(res.stdout, 'Mensagem final limpa.');
  assert.deepEqual(res.usage, { input_tokens: 100, output_tokens: 20 });
  assert.ok(res.receipt.includes('sessao=early-th-999'));
  assert.ok(res.receipt.includes('telemetria: in=100 out=20'));
});

