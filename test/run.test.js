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
} = require('../skill/scripts/run');
const { ROLES } = require('../skill/scripts/roles');

/** Helper to create isolated directory */
function createTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-test-dsrun-'));
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
    /uso: node run\.js/
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

test('runSession: reconstroi UTF-8 dividido entre chunks no stdout capturado', async (t) => {
  const dir = createTempDir(t);
  const { run } = require('../skill/scripts/process-runner');
  await run('git', ['-C', dir, 'init']);
  await run('git', ['-C', dir, 'config', 'user.email', 'test@test.com']);
  await run('git', ['-C', dir, 'config', 'user.name', 'Test']);

  const script = [
    "const b = Buffer.from('ação');",
    'process.stdout.write(b.subarray(0, 2));',
    "setTimeout(() => process.stdout.write(b.subarray(2)), 50);"
  ].join('\n');

  const customRunner = {
    name: 'utf8-runner',
    resolveAgentFile: () => '',
    prepareAgent: () => ({ promptPrefix: '' }),
    buildCommand: () => ({ command: 'node', args: ['-e', script] }),
    resolveSession: async () => ''
  };

  const res = await runSession({
    repo: dir,
    runner: customRunner,
    readonly: true,
    message: 'test prompt',
    output: false
  });

  assert.equal(res.stdout, 'ação');
});

test('runSession: agente committer grava claim com glob=* (modo commit)', async (t) => {
  const dir = createTempDir(t);
  const { run } = require('../skill/scripts/process-runner');
  await run('git', ['-C', dir, 'init']);
  await run('git', ['-C', dir, 'config', 'user.email', 'test@test.com']);
  await run('git', ['-C', dir, 'config', 'user.name', 'Test']);

  let claimContent = '';
  const customRunner = {
    name: 'claim-inspector',
    resolveAgentFile: () => '',
    prepareAgent: () => ({ promptPrefix: '' }),
    buildCommand: ({ root }) => {
      const claimDir = path.join(root, '.git', 'oathbound', 'claims');
      const [file] = fs.readdirSync(claimDir).filter(x => x.endsWith('.claim'));
      claimContent = fs.readFileSync(path.join(claimDir, file), 'utf8');
      return { command: 'node', args: ['-e', 'console.log("ok")'] };
    },
    resolveSession: async () => ''
  };

  await runSession({
    repo: dir,
    runner: customRunner,
    readonly: false,
    scopes: ['src/*'],
    agent: ROLES.committer,
    message: 'test prompt',
    output: false
  });

  assert.ok(claimContent.includes('glob=*'));
  assert.ok(claimContent.includes(`agent=${ROLES.committer}`));
});

test('guarda: run.js nao acopla exibicao a nome de runner codex/agy', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'skill', 'scripts', 'run.js'), 'utf8');
  assert.ok(
    !/runner\.name\s*===\s*'(codex|agy)'/.test(src),
    'exibição deve usar display.push/display.flush do adapter, não runner.name'
  );
});

test('guarda: skill/scripts nao usa literais de papel/estado fora de roles.js', () => {
  const scriptsDir = path.join(__dirname, '..', 'skill', 'scripts');
  const literalRe = /'(smith|assayer|archivist|oathbound)'/;

  function walk(dir) {
    let out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out = out.concat(walk(full));
      else if (entry.name.endsWith('.js')) out.push(full);
    }
    return out;
  }

  const offenders = walk(scriptsDir)
    .filter(file => path.basename(file) !== 'roles.js')
    .filter(file => literalRe.test(fs.readFileSync(file, 'utf8')));

  assert.deepEqual(offenders, [], 'use ROLES/stateDir de roles.js em vez de literais de papel/estado');
});

test('readEnv: OATHBOUND_ tem prioridade sobre GOVKIT_', () => {
  const { readEnv } = require('../skill/scripts/env');
  const prevCurrent = process.env.OATHBOUND_RUNNER;
  const prevLegacy = process.env.GOVKIT_RUNNER;
  try {
    process.env.OATHBOUND_RUNNER = 'novo';
    process.env.GOVKIT_RUNNER = 'antigo';
    assert.equal(readEnv('RUNNER'), 'novo');
  } finally {
    if (prevCurrent !== undefined) process.env.OATHBOUND_RUNNER = prevCurrent; else delete process.env.OATHBOUND_RUNNER;
    if (prevLegacy !== undefined) process.env.GOVKIT_RUNNER = prevLegacy; else delete process.env.GOVKIT_RUNNER;
  }
});

test('readEnv: fallback GOVKIT_ funciona e avisa uma vez em stderr', () => {
  const { readEnv } = require('../skill/scripts/env');
  const prevCurrent = process.env.OATHBOUND_SCOPES;
  const prevLegacy = process.env.GOVKIT_SCOPES;
  const writes = [];
  const original = process.stderr.write;
  try {
    delete process.env.OATHBOUND_SCOPES;
    process.env.GOVKIT_SCOPES = 'legado';
    process.stderr.write = chunk => { writes.push(String(chunk)); return true; };

    assert.equal(readEnv('SCOPES'), 'legado');
    assert.equal(readEnv('SCOPES'), 'legado');

    assert.equal(writes.length, 1);
    assert.ok(writes[0].includes('GOVKIT_SCOPES está obsoleta; use OATHBOUND_SCOPES'));
  } finally {
    process.stderr.write = original;
    if (prevCurrent !== undefined) process.env.OATHBOUND_SCOPES = prevCurrent; else delete process.env.OATHBOUND_SCOPES;
    if (prevLegacy !== undefined) process.env.GOVKIT_SCOPES = prevLegacy; else delete process.env.GOVKIT_SCOPES;
  }
});

test('stateDir: migra .git/ds-queue para .git/oathbound com governance.db para oathbound.db', (t) => {
  const { stateDir } = require('../skill/scripts/roles');
  const dir = createTempDir(t);
  const legacy = path.join(dir, 'ds-queue');
  fs.mkdirSync(legacy, { recursive: true });
  fs.writeFileSync(path.join(legacy, 'governance.db'), 'conteudo');
  fs.writeFileSync(path.join(legacy, 'governance.db-wal'), 'wal');
  fs.writeFileSync(path.join(legacy, 'governance.db-shm'), 'shm');

  const resolved = stateDir(dir);

  assert.equal(resolved, path.join(dir, 'oathbound'));
  assert.ok(fs.existsSync(path.join(dir, 'oathbound')));
  assert.ok(fs.existsSync(path.join(dir, 'oathbound', 'oathbound.db')));
  assert.ok(fs.existsSync(path.join(dir, 'oathbound', 'oathbound.db-wal')));
  assert.ok(fs.existsSync(path.join(dir, 'oathbound', 'oathbound.db-shm')));
  assert.ok(!fs.existsSync(path.join(legacy)));
});

test('stateDir: dois gitDirs diferentes no mesmo processo migram ambos', (t) => {
  const { stateDir } = require('../skill/scripts/roles');
  const dirA = createTempDir(t);
  const dirB = createTempDir(t);
  for (const dir of [dirA, dirB]) {
    const legacy = path.join(dir, 'ds-queue');
    fs.mkdirSync(legacy, { recursive: true });
    fs.writeFileSync(path.join(legacy, 'governance.db'), 'conteudo');
  }

  stateDir(dirA);
  stateDir(dirB);

  assert.ok(fs.existsSync(path.join(dirA, 'oathbound')));
  assert.ok(fs.existsSync(path.join(dirB, 'oathbound')));
  assert.ok(!fs.existsSync(path.join(dirA, 'ds-queue')));
  assert.ok(!fs.existsSync(path.join(dirB, 'ds-queue')));
});

test('stateDir: com ambos os diretorios, usa oathbound e preserva o legado', (t) => {
  const { stateDir } = require('../skill/scripts/roles');
  const dir = createTempDir(t);
  fs.mkdirSync(path.join(dir, 'ds-queue'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'oathbound'), { recursive: true });

  const resolved = stateDir(dir);

  assert.equal(resolved, path.join(dir, 'oathbound'));
  assert.ok(fs.existsSync(path.join(dir, 'ds-queue')));
});


