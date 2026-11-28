'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const test = require('node:test');

const URI = 'ui://oathbound-statusline/footer';
const STATE = 'com.openai/codex-statusline-state';

test('slow audit reads retry once, serve snapshot fields, and recover on the next poll', { timeout: 10_000 }, async t => {
  const dir = path.resolve(__dirname, '..', '.scratch', `codex-statusline-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  const log = path.join(dir, 'agent-audit.jsonl');
  fs.writeFileSync(log, JSON.stringify({
    ferramenta: 'SubagentStart', agent_id: 'smith-1', agente: 'smith', sessao_id: 'thread',
  }) + '\n');
  const preload = path.join(dir, 'slow-audit.cjs');
  fs.writeFileSync(preload, `
    const fs = require('node:fs');
    const { setTimeout: delay } = require('node:timers/promises');
    const log = ${JSON.stringify(log)};
    const open = fs.promises.open;
    const openSync = fs.openSync;
    let calls = 0;
    fs.promises.open = async (file, ...args) => {
      if (file === log && ++calls <= 3) await delay(1200);
      return open(file, ...args);
    };
    fs.openSync = (file, ...args) => {
      if (file === log && ++calls <= 3) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1200);
      return openSync(file, ...args);
    };
  `);
  const child = spawn(process.execPath, ['--require', preload, path.resolve(__dirname, '../codex/statusline.cjs')], {
    env: { ...process.env, AGENT_AUDIT_DIR: dir },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const closed = once(child, 'close');
  t.after(async () => {
    child.kill();
    await closed;
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  });
  const output = readline.createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const state = { thread: {
    id: 'thread', model: { display_name: 'Model' }, usage: { context: { used_percentage: 28 } },
  } };
  child.stdin.write('{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}\n');
  assert.equal(JSON.parse((await output.next()).value).id, 0);
  async function poll(id) {
    const started = performance.now();
    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0', id, method: 'resources/read', params: { uri: URI, _meta: { [STATE]: state } },
    }) + '\n');
    const reply = JSON.parse((await output.next()).value);
    assert.equal(reply.id, id);
    assert.ok(performance.now() - started < 1000, 'reply missed the Codex poll deadline');
    return reply.result.contents[0].text;
  }
  const fallback = await poll(1);
  assert.match(fallback, /Model.*ctx 72% left/);
  assert.doesNotMatch(fallback, /smith/);
  assert.match(await poll(2), /smith/);
  assert.match(await poll(3), /Model.*ctx 72% left.*smith/);
  child.stdin.end();
});

test('Codex discovers the Oathbound footer and polls live subagent roles', { timeout: 10_000 }, async t => {
  const dir = path.resolve(__dirname, '..', '.scratch', `codex-statusline-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  const log = path.join(dir, 'agent-audit.jsonl');
  const child = spawn(process.execPath, [path.resolve(__dirname, '../codex/statusline.cjs')], {
    env: (({ OATHBOUND_STATUSLINE_ICONS, ...rest }) => ({ ...rest, AGENT_AUDIT_DIR: dir }))(process.env),
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const exit = once(child, 'exit');
  t.after(async () => {
    child.kill();
    await exit;
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  });
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

  async function footer(threadId, { cwd, used = 28, color } = {}) {
    const state = {
      thread: {
        id: threadId,
        model: { display_name: 'Test Model', reasoning_level: 'high' },
        workspace: { cwd },
        usage: { context: { used_percentage: used } },
      },
    };
    const { contents: [resource] } = await request('resources/read', { uri: URI, _meta: { [STATE]: state } });
    assert.equal(resource.uri, URI);
    assert.equal(resource.mimeType, 'application/json');
    const tree = JSON.parse(resource.text);
    assert.deepEqual(tree.props, { gap: 1, wrap: 'nowrap' });
    if (color) {
      const context = tree.children.find(item => item.children?.[0]?.startsWith('[ctx '));
      assert.equal(context.props.color, color);
    }
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
  assert.equal(await footer('thread-123-a'), '[OB] [Test Model (high)] [ctx 72% left]');

  fs.writeFileSync(log + '.1', event('SubagentStart', 'smith-1', 'oathbound:smith'));
  fs.writeFileSync(log,
    '{bad json "thread-123-a"\n' +
    event('SubagentStart', 'smith-1', 'oathbound:smith') +
    event('SubagentStart', 'scout-1', 'scout') +
    event('SubagentStart', 'scholar-1', 'scholar', 'thread-123-b'));
  assert.match(await footer('thread-123-a'), /\[> smith, > scout\]/);
  assert.doesNotMatch(await footer('thread-123-a'), /scholar|smith.*smith/);
  assert.match(await footer('thread-123-b'), /\[> scholar\]/);
  assert.doesNotMatch(await footer('thread-123-b'), /smith|scout/);

  fs.appendFileSync(log, event('SubagentStop', 'smith-1', 'smith').trimEnd());
  assert.match(await footer('thread-123-a'), /> smith/);
  fs.appendFileSync(log, '\n');
  assert.doesNotMatch(await footer('thread-123-a'), /smith/);
  for (const role of ['assayer', 'sentinel', 'scribe', 'breaker']) {
    fs.appendFileSync(log, event('SubagentStart', role, role));
  }
  assert.match(await footer('thread-123-a'), /\[> scout, > assayer, > sentinel, > scribe, \+1\]/);

  const project = path.join(dir, 'project');
  fs.mkdirSync(path.join(project, 'nested'), { recursive: true });
  execFileSync('git', ['init', '--quiet', '--initial-branch=footer-test', project]);
  const ts = new Date(Date.now() - 12_000).toISOString();
  fs.appendFileSync(log,
    JSON.stringify({ ferramenta: 'SubagentStart', agent_id: 'timed', agente: 'smith', sessao_id: 'thread-c', ts }) + '\n' +
    JSON.stringify({ bloqueado: true, sessao_id: 'thread-c', ts }) + '\n' +
    JSON.stringify({ bloqueado: true, sessao_id: 'thread-d', ts: new Date(Date.now() - 120_000).toISOString() }) + '\n');
  const withWorkspace = await footer('thread-c', { cwd: path.join(project, 'nested'), used: 82, color: 'yellow' });
  assert.match(withWorkspace, /\[project\/footer-test\] .*\[ctx 18% left\] \[! hook blocked\] \[> smith \d+s\]/);
  assert.doesNotMatch(await footer('thread-d', { cwd: dir, color: 'status-usage' }), /hook blocked|smith/);

  child.stdin.end();
  assert.deepEqual(await exit, [0, null]);
});

test('Codex footer shows tokens, quota, cost and /compact only from reported data', { timeout: 10_000 }, async t => {
  const child = spawn(process.execPath, [path.resolve(__dirname, '../codex/statusline.cjs')], {
    env: (({ OATHBOUND_STATUSLINE_ICONS, ...rest }) => rest)(process.env),
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  t.after(() => child.kill());
  const output = readline.createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  let id = 0;
  const call = async (method, params) => {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) + '\n');
    return JSON.parse((await output.next()).value).result;
  };
  const render = async state => {
    const { contents: [resource] } = await call('resources/read', { uri: URI, _meta: { [STATE]: state } });
    return JSON.parse(resource.text).children.map(i => typeof i === 'string' ? i : i.children.join('')).join(' ');
  };
  await call('initialize', { protocolVersion: '2025-06-18' });
  const future = Math.floor(Date.now() / 1000) + 3600;
  const full = await render({
    thread: {
      id: 'metrics',
      model: { display_name: 'M' },
      usage: {
        context: { used_percentage: 90 },
        total: { total_input_tokens: 15500, output_tokens: 1_200_000 },
        cost: { total_cost_usd: 1.234 },
      },
    },
    account: { rate_limits: [{
      primary_limit: { used_percent: 20, window_minutes: 300, resets_at: future },
      secondary_limit: { used_percent: 95, window_minutes: 10080, resets_at: future },
    }] },
  });
  assert.equal(full, '[OB] [M] [ctx 10% left] [in 15.5k out 1.2M] [5h 80% left] [wk 5% left] [$1.23] [! /compact]');

  const bare = await render({
    thread: { id: 'bare', model: { display_name: 'M' }, usage: { context: { used_percentage: 10 }, total: { total_input_tokens: -5, output_tokens: 0 } } },
    account: { rate_limits: [{ primary_limit: { used_percent: 10, window_minutes: 300, resets_at: 1 } }] },
  });
  assert.doesNotMatch(bare, /in |5h|wk|\$|compact/);
  child.stdin.end();
});

test('Codex footer honors OATHBOUND_STATUSLINE_ICONS', { timeout: 10_000 }, async t => {
  for (const [set, brand] of [['ascii', 'OB'], ['unicode', '◆'], ['oathbound', ''], ['nerd', ''], ['bogus', 'OB']]) {
    const child = spawn(process.execPath, [path.resolve(__dirname, '../codex/statusline.cjs')], {
      env: { ...process.env, OATHBOUND_STATUSLINE_ICONS: set },
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    t.after(() => child.kill());
    const output = readline.createInterface({ input: child.stdout })[Symbol.asyncIterator]();
    const call = async (id, method, params) => {
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      return JSON.parse((await output.next()).value).result;
    };
    await call(1, 'initialize', { protocolVersion: '2025-06-18' });
    child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    const { contents: [resource] } = await call(2, 'resources/read', {
      uri: URI,
      _meta: { [STATE]: { thread: { id: 'icons', model: { display_name: 'M' } } } },
    });
    assert.equal(JSON.parse(resource.text).children[0].children[0], '[' + brand + ']', set);
    child.stdin.end();
  }
});
