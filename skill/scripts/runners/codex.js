const fs = require('node:fs');
const path = require('node:path');

const { extractInstructions, resolveAgentPath } = require('../runner-adapter');

const codexAdapter = {
  name: 'codex',

  resolveAgentFile({ root, agent, agentDir }) {
    return resolveAgentPath({ root, agent, agentDir, runner: 'codex' });
  },

  prepareAgent({ agentFile, agent, others = [], feedback = '', scopes = [], readonly = false }) {
    const guards = [];
    if (readonly) {
      guards.push('[MODO: SOMENTE LEITURA — Não modifique arquivos nem execute operações de escrita/commit no repositório]');
    } else if (scopes.length) {
      guards.push(`[ESCOPO AUTORIZADO — Edite APENAS arquivos que casem com: ${scopes.join(', ')}. É estritamente proibido tocar em outros arquivos]`);
    }
    if (others.length) {
      guards.push(`[EM USO POR OUTROS AGENTES — Não edite: ${others.map(x => `${x.glob} (${x.label})`).join('; ')}]`);
    }

    return {
      promptPrefix: guards.join('\n')
    };
  },

  buildCommand({ root, agent, agentFile, model, message, session, tag, promptPrefix, readonly }) {
    const command = 'codex';
    const pureBody = extractInstructions(agentFile);
    const instructions = pureBody
      ? `[PAPEL DO AGENTE (${agent})]\n${pureBody}\n`
      : `[PAPEL DO AGENTE: ${agent}]\n`;

    const fullMessage = [instructions, promptPrefix, message].filter(Boolean).join('\n\n');

    const args = ['exec'];
    if (readonly) {
      args.push('-s', 'read-only');
    } else {
      args.push('--dangerously-bypass-approvals-and-sandbox');
    }

    if (root) args.push('-C', root);
    if (model) args.push('-m', model);
    args.push('--json');

    if (session) {
      args.push('resume', session, fullMessage);
    } else {
      args.push(fullMessage);
    }

    return { command, args };
  },

  parseOutput(output) {
    const raw = typeof output === 'object' && output !== null ? output.stdout || '' : String(output || '');
    let session = '';
    let usage = null;
    const texts = [];

    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) continue;
      try {
        const ev = JSON.parse(trimmed);
        if (!session) {
          if (ev.type === 'thread.started' && (ev.thread_id || ev.id)) session = ev.thread_id || ev.id;
          else if (ev.thread_id) session = ev.thread_id;
          else if (ev.conversation_id) session = ev.conversation_id;
        }
        if (!usage && (ev.usage || (ev.type === 'turn.completed' && ev.usage))) {
          usage = ev.usage || null;
        }

        if (ev.item && (ev.item.type === 'agent_message' || ev.item.type === 'message') && typeof ev.item.text === 'string') {
          texts.push(ev.item.text);
        } else if (ev.type === 'agent_message' && typeof ev.text === 'string') {
          texts.push(ev.text);
        } else if (Array.isArray(ev.item?.content)) {
          for (const part of ev.item.content) {
            if (typeof part === 'string') texts.push(part);
            else if (part && typeof part.text === 'string') texts.push(part.text);
          }
        }
      } catch {}
    }

    const text = texts.length > 0 ? texts.join('\n\n') : raw;
    return { text, session, usage };
  },

  async resolveSession({ root, tag, sessionInput, runResult }) {
    if (sessionInput) return sessionInput;
    if (!runResult || !runResult.stdout) return '';
    return codexAdapter.parseOutput(runResult.stdout).session || '';
  }
};

module.exports = {
  adapter: codexAdapter
};
