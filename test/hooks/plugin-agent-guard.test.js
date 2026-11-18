'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { avaliar } = require('../../claude/hooks/plugin-agent-guard.js');

test('aplica os guards conforme o identificador do agente de plugin', () => {
  const read = { tool_name: 'Read', tool_input: { limit: 151 } };
  for (const agente of ['assayer', 'sentinel', 'scout']) {
    assert.match(avaliar({ ...read, agent_type: `oathbound:${agente}` }), /151/);
    assert.equal(avaliar({ ...read, agent_type: `oathbound:${agente}`, tool_input: { limit: 150 } }), null);
  }
  const shell = { tool_name: 'Bash', tool_input: { command: 'git commit' } };
  for (const agente of ['smith', 'scribe']) {
    assert.match(avaliar({ ...shell, agent_type: `oathbound:${agente}` }), /commit/);
    assert.equal(avaliar({ ...shell, agent_type: `oathbound:${agente}`, tool_input: { command: 'git status' } }), null);
  }
  assert.match(avaliar({ ...shell, agent_type: 'oathbound:assayer' }), /leitura/);
  assert.equal(avaliar({ ...read, agent_type: 'outro:scout' }), null);
  assert.equal(avaliar({ ...read, agent_type: 'scout' }), null);
  assert.equal(avaliar(read), null);
});
