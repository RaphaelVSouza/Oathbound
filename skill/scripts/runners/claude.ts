const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { extractInstructions, resolveAgentPath } = require('../runner-adapter.ts');

const sessionMap = new Map<string, string>();

function isClaudeAgentFile(agentFile: string): boolean {
  if (!agentFile) return false;
  const normalized = path.resolve(agentFile);
  return /[\\/]\.claude[\\/]agents([\\/]|$)/.test(normalized);
}

const claudeAdapter = {
  name: 'claude',

  resolveAgentFile({ root, agent, agentDir }: { root?: string; agent: string; agentDir?: string }) {
    return resolveAgentPath({ root, agent, agentDir, runner: 'claude' });
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
    const command = 'claude';
    const isClaudeNative = isClaudeAgentFile(agentFile);

    let fullMessage: string;
    if (isClaudeNative) {
      fullMessage = [promptPrefix, message].filter(Boolean).join('\n\n');
    } else {
      const pureBody = extractInstructions(agentFile);
      const instructions = pureBody
        ? `[PAPEL DO AGENTE (${agent})]\n${pureBody}\n`
        : `[PAPEL DO AGENTE: ${agent}]\n`;
      fullMessage = [instructions, promptPrefix, message].filter(Boolean).join('\n\n');
    }

    const args = ['-p', fullMessage, '--dangerously-skip-permissions'];

    const activeSession = session || (tag ? (sessionMap.get(tag) || crypto.randomUUID()) : crypto.randomUUID());
    if (tag && !session) sessionMap.set(tag, activeSession);

    if (session) {
      args.push('--resume', session);
    } else {
      args.push('--session-id', activeSession);
    }

    if (isClaudeNative && agent) {
      args.push('--agent', agent);
    }

    if (model) args.push('--model', model);
    if (effort) args.push('--effort', effort);
    if (readonly) args.push('--tools', 'Read,Grep,Glob');

    return { command, args };
  },

  parseOutput(output: any) {
    const raw = typeof output === 'object' && output !== null ? output.stdout || '' : String(output || '');
    return {
      text: raw,
      session: '',
      usage: null
    };
  },

  async resolveSession({ root, tag, sessionInput, runResult }: any) {
    if (sessionInput) return sessionInput;
    if (tag && sessionMap.has(tag)) {
      const sid = sessionMap.get(tag)!;
      sessionMap.delete(tag);
      return sid;
    }
    return '';
  }
};

module.exports = {
  adapter: claudeAdapter
};
