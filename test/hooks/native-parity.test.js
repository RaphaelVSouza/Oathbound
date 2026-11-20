'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DEFAULT_BIN = path.resolve(
  __dirname,
  '..',
  '..',
  'native',
  'oathbound-hook',
  'target',
  'release',
  process.platform === 'win32' ? 'oathbound-hook.exe' : 'oathbound-hook'
);
const BIN = process.env.OATHBOUND_HOOK_BIN || DEFAULT_BIN;

function runHook(subcmd, input, env = process.env) {
  return spawnSync(BIN, [subcmd], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    env,
  });
}

test('native hook: plugin-agent-guard aplica guards por agent_type', { skip: !fs.existsSync(BIN) }, () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-native-test-'));
  const env = { ...process.env, AGENT_AUDIT_DIR: tmpDir };
  try {
    const read151 = { agent_id: 'a1', tool_name: 'Read', tool_input: { limit: 151 } };
    for (const agente of ['assayer', 'sentinel', 'scout']) {
      const deny = runHook('plugin-agent-guard', { ...read151, agent_type: `oathbound:${agente}` }, env);
      assert.equal(deny.status, 0);
      const out = JSON.parse(deny.stdout);
      assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
      assert.match(out.hookSpecificOutput.permissionDecisionReason, /151/);

      const allow = runHook(
        'plugin-agent-guard',
        { ...read151, agent_type: `oathbound:${agente}`, tool_input: { limit: 150 } },
        env
      );
      assert.equal(allow.status, 0);
      assert.equal(allow.stdout, '');
    }

    const commit = { agent_id: 'a2', tool_name: 'Bash', tool_input: { command: 'git commit -m x' } };
    for (const agente of ['smith', 'scribe']) {
      const deny = runHook('plugin-agent-guard', { ...commit, agent_type: `oathbound:${agente}` }, env);
      const out = JSON.parse(deny.stdout);
      assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
      assert.match(out.hookSpecificOutput.permissionDecisionReason, /commit/);

      const allow = runHook(
        'plugin-agent-guard',
        { ...commit, agent_type: `oathbound:${agente}`, tool_input: { command: 'git status' } },
        env
      );
      assert.equal(allow.stdout, '');
    }

    const assayerCommit = runHook('plugin-agent-guard', { ...commit, agent_type: 'oathbound:assayer' }, env);
    assert.match(JSON.parse(assayerCommit.stdout).hookSpecificOutput.permissionDecisionReason, /leitura/);

    const other = runHook('plugin-agent-guard', { ...read151, agent_type: 'outro:scout' }, env);
    assert.equal(other.stdout, '');

    const invalid = runHook('plugin-agent-guard', '{not-json', env);
    assert.equal(JSON.parse(invalid.stdout).hookSpecificOutput.permissionDecision, 'deny');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('native hook: agent-audit grava linha JSONL sem stdout', { skip: !fs.existsSync(BIN) }, () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-native-audit-'));
  const env = { ...process.env, AGENT_AUDIT_DIR: tmpDir };
  try {
    const res = runHook(
      'agent-audit',
      {
        agent_id: 'sub-42',
        agent_type: 'oathbound:scout',
        session_id: 'abcdef123456',
        tool_name: 'Read',
        tool_use_id: 'tu-99',
      },
      env
    );
    assert.equal(res.status, 0);
    assert.equal(res.stdout, '');
    const lines = fs.readFileSync(path.join(tmpDir, 'agent-audit.jsonl'), 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    const rec = JSON.parse(lines[0]);
    assert.equal(rec.agent_id, 'sub-42');
    assert.equal(rec.agente, 'oathbound:scout');
    assert.equal(rec.sessao, 'abcdef12');
    assert.equal(rec.ferramenta, 'Read');
    assert.equal(rec.tool_use_id, 'tu-99');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('hooks Codex registram ciclo de vida e bloqueiam apenas o comando avaliado', { skip: !fs.existsSync(BIN) }, t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-codex-audit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = { ...process.env, AGENT_AUDIT_DIR: dir };
  const events = ['SubagentStart', 'SubagentStop'];
  for (const event of events) {
    const result = runHook('codex-agent-audit', {
      hook_event_name: event, agent_id: 'sub-42', agent_type: 'scout', session_id: 'parent',
    }, env);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
  }
  const records = fs.readFileSync(path.join(dir, 'agent-audit.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(records.map(record => record.agent_id), ['sub-42', 'sub-42']);
  assert.deepEqual(records.map(record => record.ferramenta), events);
  const bash = command => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });
  const allowed = runHook('destructive-guard', bash('git status'), env);
  assert.equal(allowed.status, 0);
  assert.equal(allowed.stdout, '');
  const denied = runHook('destructive-guard', bash('git commit -m x'), env);
  assert.equal(JSON.parse(denied.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('native hook: statusline formata workspace, vcs, modelo, contexto, quota e subagentes', { skip: !fs.existsSync(BIN) }, () => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const payload = {
    workspace: { current_dir: repoRoot },
    vcs: { branch: 'main', dirty: true },
    model: { display_name: 'Gemini 2.5 Pro (High)', effort: 'high' },
    context_window: {
      used_percentage: 55,
      context_window_size: 200000,
      current_usage: { input_tokens: 20000, cache_read_input_tokens: 80000, output_tokens: 10000 },
    },
    quota: {
      'gemini-5h': { remaining_fraction: 0.82, reset_in_seconds: 5400 },
      'gemini-weekly': { remaining_fraction: 0.35 },
    },
    subagents: [
      { name: 'scout', status: 'running' },
      { name: 'smith', status: 'done' },
    ],
  };

  const rustRes = runHook('statusline', payload);
  assert.equal(rustRes.status, 0);
  assert.match(rustRes.stdout, /2\.5 Pro/);
  assert.match(rustRes.stdout, /55%/);
  assert.match(rustRes.stdout, /main/);
  assert.match(rustRes.stdout, /scout/);
});
