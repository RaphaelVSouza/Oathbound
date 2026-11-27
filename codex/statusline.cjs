'use strict';

const fs = require('node:fs/promises');
const { execFile } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const git = require('node:util').promisify(execFile);

const SERVER = 'oathbound-statusline';
const URI = 'ui://oathbound-statusline/footer';
const STATE = 'com.openai/codex-statusline-state';
const MAX_AUDIT_BYTES = 1024 * 1024;
const MAX_AGENTS = 4;
const LOW_CONTEXT_PERCENT = 20;
const COMPACT_PERCENT = 15;
const BLOCK_WARNING_MS = 60_000;
const LOOKUP_TIMEOUT_MS = 300;
const LOOKUP_ATTEMPTS = 2;
const TOOL = {
  name: 'statusline',
  title: 'Oathbound',
  description: 'Show the Oathbound footer and active subagent roles.',
  inputSchema: { type: 'object', properties: {} },
  _meta: { 'openai/ui': { entrypoints: [{ type: 'statusline', resourceUri: URI }] } },
};
const RESOURCE = { name: 'footer', uri: URI, mimeType: 'application/json' };
const ROLES = ['smith', 'scholar', 'scribe', 'breaker', 'assayer', 'sentinel', 'scout'];
// Icon sets mirror the native hook (ADR-0019). Each row: seven roles, then the fallback and brand.
const ICON_SETS = {
  unicode: { roles: ['⚒', '◇', '✎', '⚡', '✓', '⬟', '⌖'], other: '•', brand: '◆' },
  nerd: {
    roles: ['\uf0e3', '\uf02d', '\uf040', '\uf0e7', '\uf24e', '\uf132', '\uf14e'],
    other: '\uf219', brand: '\uf219',
  },
  oathbound: {
    roles: ['\uef04', '\uef02', '\uef03', '\uef07', '\uef05', '\uef06', '\uef01'],
    other: '\uef00', brand: '\uef00',
  },
  ascii: { roles: ROLES.map(() => '>'), other: '>', brand: '*' },
};
const ICONS = ICON_SETS[String(process.env.OATHBOUND_STATUSLINE_ICONS || '').trim().toLowerCase()] || ICON_SETS.unicode;
const GLYPHS = new Map(ROLES.map((role, index) => [role, ICONS.roles[index]]));

async function readAuditTail(filename, signal) {
  let file;
  try {
    signal.throwIfAborted();
    file = await fs.open(filename, 'r');
    signal.throwIfAborted();
    const stats = await file.stat();
    if (!stats.isFile()) return '';
    // Read one extra byte to check whether the retained tail begins at a record boundary.
    const offset = Math.max(0, stats.size - MAX_AUDIT_BYTES - 1);
    const buffer = Buffer.allocUnsafe(stats.size - offset);
    signal.throwIfAborted();
    const { bytesRead } = await file.read(buffer, 0, buffer.length, offset);
    signal.throwIfAborted();
    const bytes = buffer.subarray(0, bytesRead);
    const start = offset > 0 ? bytes.indexOf(10) + 1 : 0;
    const end = bytes.lastIndexOf(10);
    return end >= start ? bytes.toString('utf8', start, end) : '';
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  } finally {
    if (file) await file.close();
  }
}

async function readThreadAudit(threadId, now, signal) {
  const active = new Map();
  let recentBlock = false;
  if (typeof threadId !== 'string' || !threadId) return { active, recentBlock };
  const directory = process.env.AGENT_AUDIT_DIR ||
    path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'state');
  const filename = path.join(directory, 'agent-audit.jsonl');
  const sessionKey = JSON.stringify(threadId);
  for (const suffix of ['.2', '.1', '']) {
    const tail = await readAuditTail(filename + suffix, signal);
    for (const line of tail.split('\n')) {
      if (!line.includes(sessionKey)) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event?.sessao_id !== threadId) continue;
      const startedAt = Date.parse(event.ts);
      if (event.bloqueado === true && startedAt <= now && now - startedAt < BLOCK_WARNING_MS) recentBlock = true;
      if (typeof event.agent_id !== 'string' || !event.agent_id) continue;
      if (event.ferramenta === 'SubagentStop') active.delete(event.agent_id);
      if (event.ferramenta === 'SubagentStart') {
        const role = typeof event.agente === 'string' ? event.agente.split(':').at(-1) : '';
        active.set(event.agent_id, {
          role: /^[a-z0-9_-]{1,24}$/i.test(role) ? role : 'agent',
          startedAt: active.get(event.agent_id)?.startedAt ?? (Number.isFinite(startedAt) ? startedAt : undefined),
        });
      }
    }
  }
  return { active, recentBlock };
}

function label(value) {
  return typeof value === 'string'
    ? Array.from(value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '').trim()).slice(0, 48).join('')
    : '';
}

function tokens(count) {
  if (count >= 1e6) return `${(count / 1e6).toFixed(1)}M`;
  if (count >= 1e3) return `${(count / 1e3).toFixed(1)}k`;
  return String(Math.trunc(count));
}

// Remaining percent of the rate-limit window lasting `minutes`; expired or absent windows are omitted.
function quotaLeft(snapshots, minutes, now) {
  if (!Array.isArray(snapshots)) return undefined;
  for (const snapshot of snapshots) {
    for (const window of [snapshot?.primary_limit, snapshot?.secondary_limit]) {
      if (window?.window_minutes !== minutes || !Number.isFinite(window.used_percent)) continue;
      if (Number.isFinite(window.resets_at) && window.resets_at * 1000 <= now) continue;
      return Math.round(100 - Math.min(100, Math.max(0, window.used_percent)));
    }
  }
  return undefined;
}

async function workspaceLabel(cwd, directory, signal) {
  if (!cwd) return '';
  const options = { cwd, signal, maxBuffer: 4096, windowsHide: true };
  const [root, ref] = await Promise.allSettled([
    git('git', ['rev-parse', '--show-toplevel'], options),
    git('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], options),
  ]);
  if (root.status !== 'fulfilled') return directory;
  const project = label(path.basename(root.value.stdout.trim())) || directory;
  const branch = ref.status === 'fulfilled' ? label(ref.value.stdout) :
    ref.reason.code === 1 ? 'detached HEAD' : '';
  return [project, branch].filter(Boolean).join(' · ');
}

async function lookupWithRetry(lookup, fallback) {
  for (let attempt = 0; attempt < LOOKUP_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    let timer;
    try {
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Footer lookup timed out')), LOOKUP_TIMEOUT_MS);
      });
      return await Promise.race([lookup(controller.signal), deadline]);
    } catch {
      // Give transient audit or Git stalls one more chance within the host's read deadline.
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  return fallback;
}

async function render(state) {
  const thread = state?.thread;
  const now = Date.now();
  const candidate = thread?.workspace?.cwd;
  const cwd = typeof candidate === 'string' && path.isAbsolute(candidate) ? candidate : undefined;
  const directory = cwd ? label(path.basename(cwd)) : '';
  const [{ active, recentBlock }, workspace] = await Promise.all([
    lookupWithRetry(signal => readThreadAudit(thread?.id, now, signal), { active: new Map(), recentBlock: false }),
    lookupWithRetry(signal => workspaceLabel(cwd, directory, signal), directory),
  ]);
  const agents = Array.from(active.values()).slice(0, MAX_AGENTS)
    .map(({ role, startedAt }) => {
      const duration = startedAt === undefined ? '' : ` ${Math.max(0, Math.floor((now - startedAt) / 1000))}s`;
      return `${GLYPHS.get(role) || ICONS.other} ${role}${duration}`;
    });
  if (active.size > MAX_AGENTS) agents.push(`+${active.size - MAX_AGENTS}`);

  const color = (text, name) => ({ type: 'text', props: { color: name }, children: [text] });
  const items = [{ type: 'bold', children: [`${ICONS.brand} Oathbound`] }];
  if (workspace) items.push(color(workspace, 'status-path'));
  const model = label(thread?.model?.display_name);
  const effort = label(thread?.model?.reasoning_level);
  if (model) items.push(color(effort ? `${model} (${effort})` : model, 'status-model'));
  const used = thread?.usage?.context?.used_percentage;
  if (Number.isFinite(used)) {
    const remaining = Math.round(100 - Math.min(100, Math.max(0, used)));
    items.push(color(`ctx ${remaining}% left`, remaining <= LOW_CONTEXT_PERCENT ? 'yellow' : 'status-usage'));
  }
  const total = thread?.usage?.total;
  const input = Number.isFinite(total?.total_input_tokens) ? Math.max(0, total.total_input_tokens) : 0;
  const output = Number.isFinite(total?.output_tokens) ? Math.max(0, total.output_tokens) : 0;
  if (input > 0 || output > 0) items.push(color(`in ${tokens(input)} out ${tokens(output)}`, 'status-usage'));
  for (const [name, minutes] of [['5h', 300], ['wk', 10080]]) {
    const left = quotaLeft(state?.account?.rate_limits, minutes, now);
    if (left !== undefined) items.push(color(`${name} ${left}% left`, left <= LOW_CONTEXT_PERCENT ? 'yellow' : 'status-limit'));
  }
  const cost = thread?.usage?.cost?.total_cost_usd;
  if (Number.isFinite(cost) && cost >= 0) items.push(color(`$${cost.toFixed(2)}`, 'status-usage'));
  if (Number.isFinite(used) && 100 - Math.min(100, Math.max(0, used)) <= COMPACT_PERCENT) {
    items.push(color('/compact', 'yellow'));
  }
  if (recentBlock) items.push(color('hook blocked', 'yellow'));
  if (agents.length) items.push(color(agents.join(' · '), 'status-state'));
  return {
    type: 'row',
    props: { gap: 1, wrap: 'nowrap' },
    children: items.flatMap((item, index) => index ? ['|', item] : [item]),
  };
}

async function respond(method, params) {
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
      return { contents: [{ uri: URI, mimeType: RESOURCE.mimeType, text: JSON.stringify(await render(params._meta?.[STATE])) }] };
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

async function handle(line) {
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
    return { id, result: await respond(method, params) };
  } catch (error) {
    return { id, error: error instanceof RpcError
      ? { code: error.code, message: error.message }
      : { code: -32603, message: 'Internal error' } };
  }
}

readline.createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', async line => {
  const reply = await handle(line);
  if (reply) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...reply }) + '\n');
});
