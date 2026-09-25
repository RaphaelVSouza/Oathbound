const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { getRunnerAdapter, validateAdapter, BUILTIN_RUNNERS } = require('../skill/scripts/runner-adapter');
const { runSession, dsRun } = require('../skill/scripts/ds-run');

test('runner-adapter: exporta lista de runners embutidos', () => {
  assert.deepEqual(BUILTIN_RUNNERS, ['opencode', 'claude', 'codex', 'agy', 'generic']);
});

test('runner-adapter: carrega e valida todos os runners embutidos', () => {
  for (const name of BUILTIN_RUNNERS) {
    const adapter = getRunnerAdapter(name);
    assert.equal(adapter.name, name);
    assert.equal(typeof adapter.buildCommand, 'function');
    assert.equal(typeof adapter.prepareAgent, 'function');
    assert.equal(typeof adapter.resolveAgentFile, 'function');
    assert.equal(typeof adapter.resolveSession, 'function');
  }
});

test('runner-adapter: validação rejeita objetos incompletos ou inválidos', () => {
  assert.throws(() => validateAdapter(null), /adapter inválido: deve ser um objeto/);
  assert.throws(() => validateAdapter({}), /propriedade name obrigatória/);
  assert.throws(() => validateAdapter({ name: 'x' }), /buildCommand deve ser função/);
  assert.throws(() => validateAdapter({ name: 'x', buildCommand: () => {} }), /prepareAgent deve ser função/);
  assert.throws(
    () => validateAdapter({ name: 'x', buildCommand: () => {}, prepareAgent: () => {} }),
    /resolveAgentFile deve ser função/
  );
  assert.throws(
    () => validateAdapter({ name: 'x', buildCommand: () => {}, prepareAgent: () => {}, resolveAgentFile: () => {} }),
    /resolveSession deve ser função/
  );
});

test('runner-adapter: erro descritivo ao buscar runner inexistente', () => {
  assert.throws(() => getRunnerAdapter('runner-fantasma-inexistente'), /runner não encontrado ou inválido/);
});

test('runner-adapter: carrega adapter customizado via caminho de arquivo', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'govkit-test-custom-runner-'));
  t.after(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  const customFile = path.join(dir, 'my-runner.js');
  const code = `
    module.exports = {
      name: 'custom-mock',
      resolveAgentFile: () => 'mock.md',
      prepareAgent: () => ({ promptPrefix: 'mock' }),
      buildCommand: () => ({ command: 'node', args: ['-v'] }),
      resolveSession: async () => 'mock-session-1'
    };
  `;
  fs.writeFileSync(customFile, code, 'utf8');

  const loaded = getRunnerAdapter(customFile);
  assert.equal(loaded.name, 'custom-mock');
  assert.equal(loaded.resolveAgentFile(), 'mock.md');
});

test('runner opencode: buildCommand monta flags esperadas', () => {
  const adapter = getRunnerAdapter('opencode');
  const cmd = adapter.buildCommand({
    root: '.',
    agent: 'ds-runner',
    model: 'test-model',
    message: 'hello',
    session: 'sess-123',
    tag: 'tag-1'
  });

  assert.equal(cmd.command, 'opencode');
  assert.ok(cmd.args.includes('run'));
  assert.ok(cmd.args.includes('--standalone'));
  assert.ok(cmd.args.includes('--session'));
  assert.ok(cmd.args.includes('sess-123'));
  assert.ok(cmd.args.includes('-m'));
  assert.ok(cmd.args.includes('test-model'));
  assert.ok(cmd.args.includes('hello'));
});

test('runner claude: buildCommand inclui -p e restringe tools em readonly', () => {
  const adapter = getRunnerAdapter('claude');
  const prep = adapter.prepareAgent({ readonly: true, scopes: [] });
  assert.ok(prep.promptPrefix.includes('SOMENTE LEITURA'));

  const cmd = adapter.buildCommand({
    root: '.',
    agent: 'ds-explorer',
    message: 'pesquise X',
    promptPrefix: prep.promptPrefix,
    readonly: true
  });

  assert.equal(cmd.command, 'claude');
  assert.ok(cmd.args.includes('-p'));
  assert.ok(cmd.args.includes('--dangerously-skip-permissions'));
  assert.ok(cmd.args.includes('--tools'));
  assert.ok(cmd.args.includes('Read,Grep,Glob'));
});

test('runner codex: buildCommand inclui exec e sandbox read-only em readonly', () => {
  const adapter = getRunnerAdapter('codex');
  const cmd = adapter.buildCommand({
    root: 'D:/repo',
    agent: 'ds-reviewer',
    message: 'revise Y',
    readonly: true
  });

  assert.equal(cmd.command, 'codex');
  assert.equal(cmd.args[0], 'exec');
  assert.ok(cmd.args.includes('-C'));
  assert.ok(cmd.args.includes('D:/repo'));
  assert.ok(cmd.args.includes('-s'));
  assert.ok(cmd.args.includes('read-only'));
});

test('runner agy: buildCommand inclui -p e mode plan em readonly', () => {
  const adapter = getRunnerAdapter('agy');
  const cmd = adapter.buildCommand({
    root: '.',
    agent: 'ds-explorer',
    message: 'analise Z',
    readonly: true
  });

  assert.equal(cmd.command, 'agy');
  assert.ok(cmd.args.includes('-p'));
  assert.ok(cmd.args.includes('--dangerously-skip-permissions'));
  assert.ok(cmd.args.includes('--mode'));
  assert.ok(cmd.args.includes('plan'));
});

test('runner generic: buildCommand respeita GOVKIT_GENERIC_CMD', () => {
  const adapter = getRunnerAdapter('generic');
  const prev = process.env.GOVKIT_GENERIC_CMD;
  try {
    process.env.GOVKIT_GENERIC_CMD = 'my-custom-cli --flag';
    const cmd = adapter.buildCommand({
      root: '.',
      agent: 'ds-runner',
      message: 'task test'
    });
    assert.equal(cmd.command, 'my-custom-cli');
    assert.ok(cmd.args.includes('--flag'));
  } finally {
    if (prev !== undefined) process.env.GOVKIT_GENERIC_CMD = prev;
    else delete process.env.GOVKIT_GENERIC_CMD;
  }
});

test('runner claude: buildCommand repassa --effort quando fornecido', () => {
  const adapter = getRunnerAdapter('claude');
  const cmd = adapter.buildCommand({
    root: '.',
    agent: 'ds-runner',
    effort: 'high',
    message: 'test'
  });
  assert.ok(cmd.args.includes('--effort'));
  assert.ok(cmd.args.includes('high'));
});

test('runner agy: buildCommand repassa --effort quando fornecido', () => {
  const adapter = getRunnerAdapter('agy');
  const cmd = adapter.buildCommand({
    root: '.',
    agent: 'ds-reviewer',
    effort: 'medium',
    message: 'test'
  });
  assert.ok(cmd.args.includes('--effort'));
  assert.ok(cmd.args.includes('medium'));
});

