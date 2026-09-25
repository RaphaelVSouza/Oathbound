const fs = require('node:fs');
const path = require('node:path');

const { extractInstructions } = require('../runner-adapter');

const agyAdapter = {
  name: 'agy',

  resolveAgentFile({ root, agent, agentDir }) {
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const candidateDirs = [
      agentDir,
      process.env.GOVKIT_AGENT_DIR,
      root ? path.join(root, '.agents', 'agents') : '',
      home ? path.join(home, '.gemini', 'antigravity-cli', 'agents') : '',
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
    const command = 'agy';
    const pureBody = extractInstructions(agentFile);
    const instructions = pureBody
      ? `[PAPEL DO AGENTE (${agent})]\n${pureBody}\n`
      : `[PAPEL DO AGENTE: ${agent}]\n`;

    const fullMessage = [instructions, promptPrefix, message].filter(Boolean).join('\n\n');
    const args = ['-p', fullMessage, '--dangerously-skip-permissions'];

    if (model) args.push('--model', model);
    if (effort) args.push('--effort', effort);
    if (session) args.push('--conversation', session);
    if (readonly) args.push('--mode', 'plan');
    if (agent) args.push('--agent', agent);

    return { command, args };
  },

  async resolveSession({ root, tag, sessionInput, runResult }) {
    if (sessionInput) return sessionInput;
    try {
      const home = process.env.USERPROFILE || process.env.HOME || '';
      const brainDir = path.join(home, '.gemini', 'antigravity-cli', 'brain');
      if (fs.existsSync(brainDir)) {
        const entries = fs.readdirSync(brainDir, { withFileTypes: true })
          .filter(e => e.isDirectory() && /^[0-9a-fA-F-]{36}$/.test(e.name))
          .map(e => ({ name: e.name, time: fs.statSync(path.join(brainDir, e.name)).mtimeMs }))
          .sort((a, b) => b.time - a.time);
        if (entries.length && (Date.now() - entries[0].time) < 600000) {
          return entries[0].name;
        }
      }
    } catch {}
    return sessionInput || tag;
  }
};

module.exports = {
  adapter: agyAdapter
};
