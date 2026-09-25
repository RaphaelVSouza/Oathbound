const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { getRunnerAdapter, validateAdapter, BUILTIN_RUNNERS } = require('../skill/scripts/runner-adapter');
const { runSession, dsRun } = require('../skill/scripts/run');

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
    assert.equal(typeof adapter.parseOutput, 'function');
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
  assert.throws(
    () => validateAdapter({ name: 'x', buildCommand: () => {}, prepareAgent: () => {}, resolveAgentFile: () => {}, resolveSession: () => {}, parseOutput: 'invalido' }),
    /parseOutput deve ser função/
  );
});

test('runner-adapter: erro descritivo ao buscar runner inexistente', () => {
  assert.throws(() => getRunnerAdapter('runner-fantasma-inexistente'), /runner não encontrado ou inválido/);
});

test('runner-adapter: carrega adapter customizado via caminho de arquivo', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-test-custom-runner-'));
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
    agent: 'smith',
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
    agent: 'surveyor',
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
    agent: 'assayer',
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
    agent: 'surveyor',
    message: 'analise Z',
    readonly: true
  });

  assert.equal(cmd.command, 'agy');
  assert.ok(cmd.args.includes('-p'));
  assert.ok(cmd.args.includes('--dangerously-skip-permissions'));
  assert.ok(cmd.args.includes('--mode'));
  assert.ok(cmd.args.includes('plan'));
});

test('runner generic: buildCommand respeita OATHBOUND_GENERIC_CMD', () => {
  const adapter = getRunnerAdapter('generic');
  const prev = process.env.OATHBOUND_GENERIC_CMD;
  try {
    process.env.OATHBOUND_GENERIC_CMD = 'my-custom-cli --flag';
    const cmd = adapter.buildCommand({
      root: '.',
      agent: 'smith',
      message: 'task test'
    });
    assert.equal(cmd.command, 'my-custom-cli');
    assert.ok(cmd.args.includes('--flag'));
  } finally {
    if (prev !== undefined) process.env.OATHBOUND_GENERIC_CMD = prev;
    else delete process.env.OATHBOUND_GENERIC_CMD;
  }
});

test('runner generic: buildCommand respeita OATHBOUND_GENERIC_CMD com aspas e espacos', () => {
  const adapter = getRunnerAdapter('generic');
  const prev = process.env.OATHBOUND_GENERIC_CMD;
  try {
    process.env.OATHBOUND_GENERIC_CMD = '"C:\\Program Files\\My CLI\\cli.exe" --option "valor com espaco"';
    const cmd = adapter.buildCommand({
      root: '.',
      agent: 'smith',
      message: 'task test'
    });
    assert.equal(cmd.command, 'C:\\Program Files\\My CLI\\cli.exe');
    assert.ok(cmd.args.includes('--option'));
    assert.ok(cmd.args.includes('valor com espaco'));
  } finally {
    if (prev !== undefined) process.env.OATHBOUND_GENERIC_CMD = prev;
    else delete process.env.OATHBOUND_GENERIC_CMD;
  }
});

test('runner claude: buildCommand repassa --effort quando fornecido', () => {
  const adapter = getRunnerAdapter('claude');
  const cmd = adapter.buildCommand({
    root: '.',
    agent: 'smith',
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
    agent: 'assayer',
    effort: 'medium',
    message: 'test'
  });
  assert.ok(cmd.args.includes('--effort'));
  assert.ok(cmd.args.includes('medium'));
});

test('runner claude: buildCommand gera session-id ou repassa --resume', async () => {
  const adapter = getRunnerAdapter('claude');
  const claudeAgentFile = path.resolve('/fake/project/.claude/agents/smith.md');
  const newCmd = adapter.buildCommand({
    root: '.',
    agent: 'smith',
    agentFile: claudeAgentFile,
    message: 'nova sessao',
    tag: 'tag-new-1'
  });
  assert.ok(newCmd.args.includes('--session-id'));
  assert.ok(newCmd.args.includes('--agent'));
  assert.ok(newCmd.args.includes('smith'));
  const promptArg = newCmd.args[newCmd.args.indexOf('-p') + 1];
  assert.ok(!promptArg.includes('[PAPEL DO AGENTE'), 'não deve duplicar instruções no prompt quando agente está em .claude/agents');

  const sid = await adapter.resolveSession({ root: '.', tag: 'tag-new-1', sessionInput: '' });
  assert.match(sid, /^[0-9a-fA-F-]{36}$/);

  const resCmd = adapter.buildCommand({ root: '.', agent: 'smith', message: 'retoma', session: 'my-session-uuid' });
  assert.ok(resCmd.args.includes('--resume'));
  assert.ok(resCmd.args.includes('my-session-uuid'));
});

test('runner claude: buildCommand não repassa --agent e injeta instruções no prompt quando fora de .claude/agents', (t) => {
  const adapter = getRunnerAdapter('claude');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-claude-test-'));
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  const nonClaudeAgentFile = path.join(dir, 'smith.md');
  fs.writeFileSync(nonClaudeAgentFile, 'Corpo das instrucoes do agente');

  const cmd = adapter.buildCommand({
    root: '.',
    agent: 'smith',
    agentFile: nonClaudeAgentFile,
    message: 'minha tarefa'
  });
  assert.ok(!cmd.args.includes('--agent'), 'não deve repassar --agent quando arquivo está fora de .claude/agents');
  const promptArg = cmd.args[cmd.args.indexOf('-p') + 1];
  assert.ok(promptArg.includes('[PAPEL DO AGENTE (smith)]'), 'deve incluir papel do agente no prompt como fallback');
  assert.ok(promptArg.includes('Corpo das instrucoes do agente'));
});

test('runner codex: buildCommand isola sandbox em readonly e suporta resume na ordem correta', () => {
  const adapter = getRunnerAdapter('codex');
  const readonlyCmd = adapter.buildCommand({ root: 'D:/repo', agent: 'assayer', message: 'leitura', readonly: true });
  assert.ok(readonlyCmd.args.includes('-s'));
  assert.ok(readonlyCmd.args.includes('read-only'));
  assert.ok(!readonlyCmd.args.includes('-a'));
  assert.ok(!readonlyCmd.args.includes('never'));
  assert.ok(!readonlyCmd.args.includes('--dangerously-bypass-approvals-and-sandbox'));

  const resumeCmd = adapter.buildCommand({ root: 'D:/repo', agent: 'smith', message: 'retomada', session: 'sess-abc-123', readonly: true });
  assert.equal(resumeCmd.args[0], 'exec');
  const sIdx = resumeCmd.args.indexOf('-s');
  const resumeIdx = resumeCmd.args.indexOf('resume');
  assert.ok(sIdx !== -1 && sIdx < resumeIdx, '-s deve vir antes de resume');
  assert.equal(resumeCmd.args[resumeIdx + 1], 'sess-abc-123');
  assert.ok(!resumeCmd.args.includes('-a'));
});

test('runner codex: resolveSession extrai thread_id de JSON e retorna vazio na ausencia', async () => {
  const adapter = getRunnerAdapter('codex');
  const stdout = '{"type":"thread.started","thread_id":"th-real-001"}\n{"type":"msg"}';
  const sid = await adapter.resolveSession({ root: '.', tag: 't1', sessionInput: '', runResult: { stdout } });
  assert.equal(sid, 'th-real-001');

  const empty = await adapter.resolveSession({ root: '.', tag: 't2', sessionInput: '', runResult: { stdout: 'erro de conexao' } });
  assert.equal(empty, '');
});

test('runner agy: resolveSession extrai conversation_id de JSON e retorna vazio na ausencia', async () => {
  const adapter = getRunnerAdapter('agy');
  const stdout = '{"conversation_id":"conv-xyz-789","status":"SUCCESS"}';
  const sid = await adapter.resolveSession({ root: '.', tag: 't1', sessionInput: '', runResult: { stdout } });
  assert.equal(sid, 'conv-xyz-789');

  const empty = await adapter.resolveSession({ root: '.', tag: 't2', sessionInput: '', runResult: { stdout: 'falha' } });
  assert.equal(empty, '');
});

test('runners: resolveAgentFile localiza agentes em suas pastas nativas', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-test-agent-dir-'));
  t.after(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  const claudeAgentDir = path.join(dir, '.claude', 'agents');
  fs.mkdirSync(claudeAgentDir, { recursive: true });
  fs.writeFileSync(path.join(claudeAgentDir, 'smith.md'), '---\nname: smith\n---\nCorpo Claude');

  const agyAgentDir = path.join(dir, '.agents', 'agents');
  fs.mkdirSync(agyAgentDir, { recursive: true });
  fs.writeFileSync(path.join(agyAgentDir, 'smith.md'), '---\nname: smith\n---\nCorpo AGY');

  const claude = getRunnerAdapter('claude');
  const resolvedClaude = claude.resolveAgentFile({ root: dir, agent: 'smith' });
  assert.equal(resolvedClaude, path.join(claudeAgentDir, 'smith.md'));

  const agy = getRunnerAdapter('agy');
  const resolvedAgy = agy.resolveAgentFile({ root: dir, agent: 'smith' });
  assert.equal(resolvedAgy, path.join(agyAgentDir, 'smith.md'));
});

test('runner codex: parseOutput extrai text, session e usage de stream JSONL', () => {
  const adapter = getRunnerAdapter('codex');
  const jsonl = [
    '{"type":"thread.started","thread_id":"th-001"}',
    '{"type":"turn.started"}',
    '{"type":"item.completed","item":{"type":"agent_message","text":"No issues."}}',
    '{"type":"turn.completed","usage":{"input_tokens":1500,"cached_input_tokens":1200,"output_tokens":45}}'
  ].join('\n');

  const parsed = adapter.parseOutput(jsonl);
  assert.equal(parsed.session, 'th-001');
  assert.equal(parsed.text, 'No issues.');
  assert.deepEqual(parsed.usage, { input_tokens: 1500, cached_input_tokens: 1200, output_tokens: 45 });
});

test('runner codex: parseOutput acumula multiplas mensagens de agente e faz fallback em texto cru', () => {
  const adapter = getRunnerAdapter('codex');
  const jsonlMulti = [
    '{"type":"item.completed","item":{"type":"agent_message","text":"Primeira parte."}}',
    '{"type":"item.completed","item":{"type":"agent_message","text":"Segunda parte."}}'
  ].join('\n');

  const parsedMulti = adapter.parseOutput(jsonlMulti);
  assert.equal(parsedMulti.text, 'Primeira parte.\n\nSegunda parte.');

  const fallback = adapter.parseOutput('Saída em texto simples sem JSON');
  assert.equal(fallback.text, 'Saída em texto simples sem JSON');
  assert.equal(fallback.session, '');
  assert.equal(fallback.usage, null);
});

test('runner agy: parseOutput extrai text, session e usage de JSON e JSONL', () => {
  const adapter = getRunnerAdapter('agy');
  const jsonSingle = JSON.stringify({
    conversation_id: 'conv-agy-123',
    response: 'No issues.',
    usage: { prompt_tokens: 200, completion_tokens: 30 }
  });

  const parsedSingle = adapter.parseOutput(jsonSingle);
  assert.equal(parsedSingle.session, 'conv-agy-123');
  assert.equal(parsedSingle.text, 'No issues.');
  assert.deepEqual(parsedSingle.usage, { prompt_tokens: 200, completion_tokens: 30 });

  const jsonl = '{"conversation_id":"conv-stream","text":"Resultado do stream"}\n';
  const parsedStream = adapter.parseOutput(jsonl);
  assert.equal(parsedStream.session, 'conv-stream');
  assert.equal(parsedStream.text, 'Resultado do stream');
});

test('runner claude, opencode e generic: parseOutput repassam texto cru', () => {
  for (const name of ['claude', 'opencode', 'generic']) {
    const adapter = getRunnerAdapter(name);
    const parsed = adapter.parseOutput('saida de teste');
    assert.equal(parsed.text, 'saida de teste');
    assert.equal(parsed.session, '');
    assert.equal(parsed.usage, null);
  }
});

test('runner agy: createDisplay().flush devolve texto cru quando saida nao e JSON', () => {
  const adapter = getRunnerAdapter('agy');
  const display = adapter.createDisplay();
  assert.equal(display.push('qualquer coisa'), '');
  assert.equal(display.flush('Error: unknown flag'), 'Error: unknown flag\n');
});

test('runner agy: createDisplay().flush devolve so o texto da resposta em JSON valido', () => {
  const adapter = getRunnerAdapter('agy');
  const display = adapter.createDisplay();
  const rawStdout = JSON.stringify({ conversation_id: 'conv-1', response: 'No issues.' });
  assert.equal(display.flush(rawStdout), 'No issues.\n');
});

test('runner agy: createDisplay().flush devolve vazio quando nao ha saida', () => {
  const adapter = getRunnerAdapter('agy');
  const display = adapter.createDisplay();
  assert.equal(display.flush(''), '');
});

test('runner codex: createDisplay().push devolve so o texto de agent_message; linha nao-JSON passa inalterada', () => {
  const adapter = getRunnerAdapter('codex');
  const display = adapter.createDisplay();
  const chunk = [
    '{"type":"thread.started","thread_id":"th-001"}',
    'linha crua sem json',
    '{"item":{"type":"agent_message","text":"Resposta do agente."}}',
    ''
  ].join('\n');

  const out = display.push(chunk);
  assert.ok(!out.includes('thread.started'));
  assert.ok(out.includes('linha crua sem json'));
  assert.ok(out.includes('Resposta do agente.'));
});

test('runner codex: createDisplay trata linha JSON dividida entre dois chunks', () => {
  const adapter = getRunnerAdapter('codex');
  const display = adapter.createDisplay();
  const full = '{"item":{"type":"agent_message","text":"Dividida entre chunks."}}\n';
  const mid = Math.floor(full.length / 2);

  const out1 = display.push(full.slice(0, mid));
  assert.equal(out1, '');

  const out2 = display.push(full.slice(mid));
  assert.equal(out2, 'Dividida entre chunks.\n');
});

test('runner codex: createDisplay().flush exibe resto do buffer se nao for JSON', () => {
  const adapter = getRunnerAdapter('codex');
  const display = adapter.createDisplay();
  display.push('texto parcial sem quebra de linha');
  assert.equal(display.flush(), 'texto parcial sem quebra de linha\n');

  const display2 = adapter.createDisplay();
  display2.push('{"type":"turn.completed"}');
  assert.equal(display2.flush(), '');
});

test('runner customizado com nome diferente de codex reusa createDisplay do codex e exibe o mesmo resultado', () => {
  const codex = getRunnerAdapter('codex');
  const custom = validateAdapter({
    name: 'meu-runner-jsonl',
    resolveAgentFile: () => 'mock.md',
    prepareAgent: () => ({}),
    buildCommand: () => ({ command: 'node', args: ['-v'] }),
    resolveSession: async () => '',
    createDisplay: codex.createDisplay
  });

  const chunk = '{"item":{"type":"agent_message","text":"Ola de runner customizado."}}\n';
  const displayCodex = codex.createDisplay();
  const displayCustom = custom.createDisplay();

  assert.equal(displayCustom.push(chunk), displayCodex.push(chunk));
});

test('validateAdapter: nao altera o objeto original ao preencher padroes', () => {
  const original = {
    name: 'sem-defaults',
    resolveAgentFile: () => '',
    prepareAgent: () => ({}),
    buildCommand: () => ({ command: 'node', args: [] }),
    resolveSession: async () => ''
  };

  const validated = validateAdapter(original);

  assert.equal(original.parseOutput, undefined);
  assert.equal(original.createDisplay, undefined);
  assert.equal(typeof validated.parseOutput, 'function');
  assert.equal(typeof validated.createDisplay, 'function');
  assert.notEqual(validated, original);
});


