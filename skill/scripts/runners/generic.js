const fs = require('node:fs');
const path = require('node:path');

const { extractInstructions } = require('../runner-adapter');

const genericAdapter = {
  name: 'generic',

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
    const genericCmd = process.env.GOVKIT_GENERIC_CMD;
    const pureBody = extractInstructions(agentFile);
    const instructions = pureBody
      ? `[PAPEL DO AGENTE (${agent})]\n${pureBody}\n`
      : `[PAPEL DO AGENTE: ${agent}]\n`;

    const fullMessage = [instructions, promptPrefix, message].filter(Boolean).join('\n\n');

    if (genericCmd) {
      const parts = genericCmd.split(/\s+/);
      const command = parts[0];
      const args = [...parts.slice(1), fullMessage];
      return { command, args };
    }

    const command = 'node';
    const args = ['-e', 'process.stdout.write(process.argv[1])', fullMessage];
    return { command, args };
  },

  async resolveSession({ root, tag, sessionInput, runResult }) {
    return sessionInput || tag;
  }
};

module.exports = {
  adapter: genericAdapter
};
