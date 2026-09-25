const fs = require('node:fs');
const path = require('node:path');

const crypto = require('node:crypto');
const { extractInstructions } = require('../runner-adapter');

const sessionMap = new Map();

const claudeAdapter = {
  name: 'claude',

  resolveAgentFile({ root, agent, agentDir }) {
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const candidateDirs = [
      agentDir,
      process.env.GOVKIT_AGENT_DIR,
      root ? path.join(root, '.claude', 'agents') : '',
      home ? path.join(home, '.claude', 'agents') : '',
      root ? path.join(root, '.opencode', 'agents') : '',
      root ? path.join(root, 'adapters', 'opencode', 'agents') : ''
    ].filter(Boolean);
    for (const dir of candidateDirs) {
      const file = path.join(dir, `${agent}.md`);
      if (fs.existsSync(file)) return file;
    }
    return '';
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

  buildCommand({ root, agent, agentFile, model, effort, message, session, tag, promptPrefix, readonly }) {
    const command = 'claude';
    const pureBody = extractInstructions(agentFile);
    const instructions = pureBody
      ? `[PAPEL DO AGENTE (${agent})]\n${pureBody}\n`
      : `[PAPEL DO AGENTE: ${agent}]\n`;

    const fullMessage = [instructions, promptPrefix, message].filter(Boolean).join('\n\n');
    const args = ['-p', fullMessage, '--dangerously-skip-permissions'];

    const activeSession = session || (tag ? (sessionMap.get(tag) || crypto.randomUUID()) : crypto.randomUUID());
    if (tag && !session) sessionMap.set(tag, activeSession);

    if (session) {
      args.push('--resume', session);
    } else {
      args.push('--session-id', activeSession);
    }

    if (model) args.push('--model', model);
    if (effort) args.push('--effort', effort);
    if (readonly) args.push('--tools', 'Read,Grep,Glob');

    return { command, args };
  },

  async resolveSession({ root, tag, sessionInput, runResult }) {
    if (sessionInput) return sessionInput;
    if (tag && sessionMap.has(tag)) {
      const sid = sessionMap.get(tag);
      sessionMap.delete(tag);
      return sid;
    }
    return tag;
  }
};

module.exports = {
  adapter: claudeAdapter
};
