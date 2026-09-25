const fs = require('node:fs');
const path = require('node:path');

const { extractInstructions } = require('../runner-adapter');

const codexAdapter = {
  name: 'codex',

  resolveAgentFile({ root, agent, agentDir }) {
    const dir = agentDir || process.env.GOVKIT_AGENT_DIR || path.join(root, '.opencode', 'agents');
    const file = path.join(dir, `${agent}.md`);
    return fs.existsSync(file) ? file : '';
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
    const args = ['exec', fullMessage, '--dangerously-bypass-approvals-and-sandbox', '-C', root];

    if (model) args.push('-m', model);
    if (readonly) args.push('-s', 'read-only');

    return { command, args };
  },

  async resolveSession({ root, tag, sessionInput, runResult }) {
    return sessionInput || tag;
  }
};

module.exports = {
  adapter: codexAdapter
};
