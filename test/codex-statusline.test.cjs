'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const test = require('node:test');

const URI = 'ui://oathbound-statusline/footer';
const STATE = 'com.openai/codex-statusline-state';

test('Codex discovers the Oathbound footer and polls live subagent roles', { timeout: 10_000 }, async t => {
  const dir = path.resolve(__dirname, '..', '.scratch', `codex-statusline-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const log = path.join(dir, 'agent-audit.jsonl');
  const child = spawn(process.execPath, [path.resolve(__dirname, '../codex/statusline.cjs')], {
    env: { ...process.env, AGENT_AUDIT_DIR: dir },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const exit = once(child, 'exit');
  t.after(() => child.kill());
  const output = readline.createInterface({ input: child.stdout })[Symbol.asyncIterator]();

  let id = 0;
  async function request(method, params) {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) + '\n');
    const response = JSON.parse((await output.next()).value);
    assert.equal(response.id, id);
    assert.equal(response.jsonrpc, '2.0');
    assert.equal(response.error, undefined);
    return response.result;
  }

  async function footer(threadId) {
    const state = {
      thread: {
        id: threadId,
        model: { display_name: 'Test Model', reasoning_level: 'high' },
        usage: { context: { used_percentage: 28 } },
      },
    };
    const { contents: [resource] } = await request('resources/read', { uri: URI, _meta: { [STATE]: state } });
    assert.equal(resource.uri, URI);
    assert.equal(resource.mimeType, 'application/json');
    const tree = JSON.parse(resource.text);
    assert.deepEqual(tree.props, { gap: 1, wrap: 'nowrap' });
    return tree.children.map(item => typeof item === 'string' ? item : item.children.join('')).join(' ');
  }

  function event(ferramenta, agent_id, agente, sessao_id = 'thread-123-a') {
    return JSON.stringify({ ferramenta, agent_id, agente, sessao_id }) + '\n';
  }

  await request('initialize', { protocolVersion: '2025-06-18' });
  child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
  const { tools: [tool] } = await request('tools/list');
  assert.equal(tool.title, 'Oathbound');
  assert.deepEqual(tool._meta['openai/ui'].entrypoints, [{ type: 'statusline', resourceUri: URI }]);
  assert.equal(await footer('thread-123-a'), '◆ Oathbound | Test Model (high) | ctx 72% left');

  fs.writeFileSync(log + '.1', event('SubagentStart', 'smith-1', 'oathbound:smith'));
  fs.writeFileSync(log,
    '{bad json "thread-123-a"\n' +
    event('SubagentStart', 'smith-1', 'oathbound:smith') +
    event('SubagentStart', 'scout-1', 'scout') +
    event('SubagentStart', 'scholar-1', 'scholar', 'thread-123-b'));
  assert.match(await footer('thread-123-a'), /⚒ smith · ⌖ scout/);
  assert.doesNotMatch(await footer('thread-123-a'), /scholar|smith.*smith/);
  assert.match(await footer('thread-123-b'), /◇ scholar/);
  assert.doesNotMatch(await footer('thread-123-b'), /smith|scout/);

  fs.appendFileSync(log, event('SubagentStop', 'smith-1', 'smith').trimEnd());
  assert.match(await footer('thread-123-a'), /⚒ smith/);
  fs.appendFileSync(log, '\n');
  assert.doesNotMatch(await footer('thread-123-a'), /smith/);
  for (const role of ['assayer', 'sentinel', 'scribe', 'breaker']) {
    fs.appendFileSync(log, event('SubagentStart', role, role));
  }
  assert.match(await footer('thread-123-a'), /⌖ scout · ✓ assayer · ⬟ sentinel · ✎ scribe · \+1/);

  child.stdin.end();
  assert.deepEqual(await exit, [0, null]);
});
