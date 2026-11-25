'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');

const SERVER = 'oathbound-statusline';
const URI = 'ui://oathbound-statusline/footer';
const STATE = 'com.openai/codex-statusline-state';
const MAX_AUDIT_BYTES = 1024 * 1024;
const MAX_AGENTS = 4;
const TOOL = {
  name: 'statusline',
  title: 'Oathbound',
  description: 'Show the Oathbound footer and active subagent roles.',
  inputSchema: { type: 'object', properties: {} },
  _meta: { 'openai/ui': { entrypoints: [{ type: 'statusline', resourceUri: URI }] } },
};
const RESOURCE = { name: 'footer', uri: URI, mimeType: 'application/json' };
const GLYPHS = new Map([
  ['smith', '⚒'], ['scholar', '◇'], ['scribe', '✎'], ['breaker', '⚡'],
  ['assayer', '✓'], ['sentinel', '⬟'], ['scout', '⌖'],
]);

function readAuditTail(filename) {
  let fd;
  try {
    fd = fs.openSync(filename, 'r');
    const stats = fs.fstatSync(fd);
    if (!stats.isFile()) return '';
    // Read one extra byte to check whether the retained tail begins at a record boundary.
    const offset = Math.max(0, stats.size - MAX_AUDIT_BYTES - 1);
    const buffer = Buffer.allocUnsafe(stats.size - offset);
    const count = fs.readSync(fd, buffer, 0, buffer.length, offset);
    const bytes = buffer.subarray(0, count);
    const start = offset > 0 ? bytes.indexOf(10) + 1 : 0;
    const end = bytes.lastIndexOf(10);
    return end >= start ? bytes.toString('utf8', start, end) : '';
  } catch {
    return '';
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function activeAgents(threadId) {
  const active = new Map();
  if (typeof threadId !== 'string' || !threadId) return active;
  const directory = process.env.AGENT_AUDIT_DIR ||
    path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'state');
  const filename = path.join(directory, 'agent-audit.jsonl');
  const sessionKey = JSON.stringify(threadId);
  for (const suffix of ['.2', '.1', '']) {
    for (const line of readAuditTail(filename + suffix).split('\n')) {
      if (!line.includes(sessionKey)) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event?.sessao_id !== threadId || typeof event.agent_id !== 'string' || !event.agent_id) continue;
      if (event.ferramenta === 'SubagentStop') active.delete(event.agent_id);
      if (event.ferramenta === 'SubagentStart') {
        const role = typeof event.agente === 'string' ? event.agente.split(':').at(-1) : '';
        active.set(event.agent_id, /^[a-z0-9_-]{1,24}$/i.test(role) ? role : 'agent');
      }
    }
  }
  return active;
}

function label(value) {
  return typeof value === 'string'
    ? Array.from(value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '').trim()).slice(0, 48).join('')
    : '';
}

function render(state) {
  const thread = state?.thread;
  const active = activeAgents(thread?.id);
  const agents = Array.from(active.values()).slice(0, MAX_AGENTS)
    .map(role => `${GLYPHS.get(role) || '•'} ${role}`);
  if (active.size > MAX_AGENTS) agents.push(`+${active.size - MAX_AGENTS}`);

  const color = (text, name) => ({ type: 'text', props: { color: name }, children: [text] });
  const items = [{ type: 'bold', children: ['◆ Oathbound'] }];
  if (agents.length) items.push(color(agents.join(' · '), 'status-state'));
  const model = label(thread?.model?.display_name);
  const effort = label(thread?.model?.reasoning_level);
  if (model) items.push(color(effort ? `${model} (${effort})` : model, 'status-model'));
  const used = thread?.usage?.context?.used_percentage;
  if (Number.isFinite(used)) {
    const remaining = Math.round(100 - Math.min(100, Math.max(0, used)));
    items.push(color(`ctx ${remaining}% left`, 'status-usage'));
  }
  return {
    type: 'row',
    props: { gap: 1, wrap: 'nowrap' },
    children: items.flatMap((item, index) => index ? ['|', item] : [item]),
  };
}

function respond(method, params) {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: '2025-06-18',
        capabilities: { resources: {}, tools: {} },
        serverInfo: { name: SERVER, version: '1.0.0' },
      };
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: [TOOL] };
    case 'tools/call':
      if (params?.name !== TOOL.name) throw new RpcError(-32602, 'Unknown tool');
      return { content: [{ type: 'text', text: URI }] };
    case 'resources/list':
      return { resources: [RESOURCE] };
    case 'resources/templates/list':
      return { resourceTemplates: [] };
    case 'resources/read':
      if (params?.uri !== URI) throw new RpcError(-32602, 'Unknown resource URI');
      return { contents: [{ uri: URI, mimeType: RESOURCE.mimeType, text: JSON.stringify(render(params._meta?.[STATE])) }] };
    default:
      throw new RpcError(-32601, 'Method not found');
  }
}

class RpcError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function handle(line) {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    return { id: null, error: { code: -32700, message: 'Parse error' } };
  }
  if (request?.jsonrpc !== '2.0' || typeof request.method !== 'string') {
    return { id: null, error: { code: -32600, message: 'Invalid request' } };
  }
  if (!Object.hasOwn(request, 'id')) return undefined;
  const { id, method, params } = request;
  try {
    return { id, result: respond(method, params) };
  } catch (error) {
    return { id, error: error instanceof RpcError
      ? { code: error.code, message: error.message }
      : { code: -32603, message: 'Internal error' } };
  }
}

readline.createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', line => {
  const reply = handle(line);
  if (reply) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...reply }) + '\n');
});
