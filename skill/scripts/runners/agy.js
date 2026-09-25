const fs = require('node:fs');
const path = require('node:path');

const { extractInstructions, resolveAgentPath } = require('../runner-adapter');

const agyAdapter = {
  name: 'agy',

  resolveAgentFile({ root, agent, agentDir }) {
    return resolveAgentPath({ root, agent, agentDir, runner: 'agy' });
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

  async resolveSession({ root, tag, sessionInput, runResult }) {
    if (sessionInput) return sessionInput;
    if (!runResult || !runResult.stdout) return '';
    try {
      const data = JSON.parse(runResult.stdout.trim());
      if (data.conversation_id) return data.conversation_id;
    } catch {
      const match = runResult.stdout.match(/"conversation_id"\s*:\s*"([0-9a-fA-F-]+)"/);
      if (match) return match[1];
    }
    return '';
  }
};

module.exports = {
  adapter: agyAdapter
};
