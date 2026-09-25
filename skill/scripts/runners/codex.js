const fs = require('node:fs');
const path = require('node:path');

const { extractInstructions } = require('../runner-adapter');

const codexAdapter = {
  name: 'codex',

  resolveAgentFile({ root, agent, agentDir }) {
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const candidateDirs = [
      agentDir,
      process.env.GOVKIT_AGENT_DIR,
      root ? path.join(root, '.codex', 'agents') : '',
      home ? path.join(home, '.codex', 'agents') : '',
      root ? path.join(root, '.opencode', 'agents') : '',
      root ? path.join(root, '.claude', 'agents') : '',
      root ? path.join(root, '.agents', 'agents') : '',
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

  buildCommand({ root, agent, agentFile, model, message, session, tag, promptPrefix, readonly }) {
    const command = 'codex';
    const pureBody = extractInstructions(agentFile);
    const instructions = pureBody
      ? `[PAPEL DO AGENTE (${agent})]\n${pureBody}\n`
      : `[PAPEL DO AGENTE: ${agent}]\n`;

    const fullMessage = [instructions, promptPrefix, message].filter(Boolean).join('\n\n');

    let args;
    if (session) {
      args = ['exec', 'resume', session, fullMessage];
    } else {
      args = ['exec', fullMessage];
    }

    if (readonly) {
      args.push('-s', 'read-only', '-a', 'never');
    } else {
      args.push('--dangerously-bypass-approvals-and-sandbox');
    }

    if (root && !session) args.push('-C', root);
    if (model) args.push('-m', model);

    return { command, args };
  },

  async resolveSession({ root, tag, sessionInput, runResult }) {
    if (sessionInput) return sessionInput;
    try {
      const home = process.env.USERPROFILE || process.env.HOME || '';
      const indexPath = path.join(home, '.codex', 'session_index.jsonl');
      if (fs.existsSync(indexPath)) {
        const lines = fs.readFileSync(indexPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
        if (lines.length) {
          const last = JSON.parse(lines[lines.length - 1]);
          if (last?.id) return last.id;
        }
      }
    } catch {}
    return sessionInput || tag;
  }
};

module.exports = {
  adapter: codexAdapter
};
