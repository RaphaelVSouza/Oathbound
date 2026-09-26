const fs = require('node:fs');
const path = require('node:path');

const { extractInstructions, resolveAgentPath } = require('../runner-adapter.ts');

const agyAdapter = {
  name: 'agy',

  resolveAgentFile({ root, agent, agentDir }: { root?: string; agent: string; agentDir?: string }) {
    return resolveAgentPath({ root, agent, agentDir, runner: 'agy' });
  },

  prepareAgent({ agentFile, agent, others = [], feedback = '', scopes = [], readonly = false }: any) {
    const guards: string[] = [];
    if (readonly) {
      guards.push('[MODO: SOMENTE LEITURA — Não modifique arquivos nem execute operações de escrita/commit no repositório]');
    } else if (scopes.length) {
      guards.push(`[ESCOPO AUTORIZADO — Edite APENAS arquivos que casem com: ${scopes.join(', ')}. É estritamente proibido tocar em outros arquivos]`);
    }
    if (others.length) {
      guards.push(`[EM USO POR OUTROS AGENTES — Não edite: ${others.map((x: any) => `${x.glob} (${x.label})`).join('; ')}]`);
    }

    return {
      promptPrefix: guards.join('\n')
    };
  },

  buildCommand({ root, agent, agentFile, model, effort, message, session, tag, promptPrefix, readonly }: any) {
    const command = 'agy';
    const pureBody = extractInstructions(agentFile);
    const instructions = pureBody
      ? `[PAPEL DO AGENTE (${agent})]\n${pureBody}\n`
      : `[PAPEL DO AGENTE: ${agent}]\n`;

    const fullMessage = [instructions, promptPrefix, message].filter(Boolean).join('\n\n');
    const args = ['-p', fullMessage, '--dangerously-skip-permissions', '--output-format', 'json'];

    if (model) args.push('--model', model);
    if (effort) args.push('--effort', effort);
    if (session) args.push('--conversation', session);
    if (readonly) args.push('--mode', 'plan');
    if (agent) args.push('--agent', agent);

    return { command, args };
  },

  parseOutput(output: any) {
    const raw = typeof output === 'object' && output !== null ? output.stdout || '' : String(output || '');
    let session = '';
    let usage = null;
    let text = '';

    const trimmed = raw.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const data = JSON.parse(trimmed);
        session = data.conversation_id || data.session_id || data.id || '';
        usage = data.usage || data.stats || null;
        if (typeof data.response === 'string') text = data.response;
        else if (typeof data.text === 'string') text = data.text;
        else if (typeof data.content === 'string') text = data.content;
        else if (typeof data.message === 'string') text = data.message;
        else if (data.message && typeof data.message.content === 'string') text = data.message.content;
        else if (typeof data.output === 'string') text = data.output;
      } catch {}
    }

    if (!text) {
      const lines = raw.split(/\r?\n/);
      const texts: string[] = [];
      for (const line of lines) {
        const lTrim = line.trim();
        if (!lTrim.startsWith('{') || !lTrim.endsWith('}')) continue;
        try {
          const ev = JSON.parse(lTrim);
          if (!session) {
            session = ev.conversation_id || ev.session_id || ev.id || '';
          }
          if (!usage && (ev.usage || ev.stats)) {
            usage = ev.usage || ev.stats || null;
          }
          const msg = ev.response ?? ev.text ?? ev.content ?? ev.message?.content ?? (typeof ev.message === 'string' ? ev.message : null);
          if (typeof msg === 'string') texts.push(msg);
        } catch {}
      }
      if (texts.length) text = texts.join('\n\n');
    }

    if (!session) {
      const match = raw.match(/"conversation_id"\s*:\s*"([0-9a-fA-F-]+)"/);
      if (match) session = match[1];
    }

    return {
      text: text || raw,
      session,
      usage
    };
  },

  async resolveSession({ root, tag, sessionInput, runResult }: any) {
    if (sessionInput) return sessionInput;
    if (!runResult || !runResult.stdout) return '';
    return agyAdapter.parseOutput(runResult.stdout).session || '';
  },

  createDisplay() {
    return {
      push() {
        return '';
      },
      flush(rawStdout: string) {
        if (!rawStdout) return '';
        const { text } = agyAdapter.parseOutput(rawStdout);
        return text ? text + '\n' : '';
      }
    };
  }
};

module.exports = {
  adapter: agyAdapter
};
