const fs = require('node:fs');
const path = require('node:path');

const { extractInstructions, resolveAgentPath } = require('../runner-adapter.ts');
const { readEnv } = require('../env.ts');

function parseCommandLine(cmdLine: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < cmdLine.length; i++) {
    const char = cmdLine[i];
    if (inQuotes) {
      if (char === quoteChar) {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuotes = true;
      quoteChar = char;
    } else if (/\s/.test(char)) {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current.length > 0) {
    args.push(current);
  }
  return args;
}

const genericAdapter = {
  name: 'generic',

  resolveAgentFile({ root, agent, agentDir }: { root?: string; agent: string; agentDir?: string }) {
    return resolveAgentPath({ root, agent, agentDir, runner: 'generic' });
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

  buildCommand({ root, agent, agentFile, model, message, session, tag, promptPrefix, readonly }: any) {
    const genericCmd = readEnv('GENERIC_CMD');
    const pureBody = extractInstructions(agentFile);
    const instructions = pureBody
      ? `[PAPEL DO AGENTE (${agent})]\n${pureBody}\n`
      : `[PAPEL DO AGENTE: ${agent}]\n`;

    const fullMessage = [instructions, promptPrefix, message].filter(Boolean).join('\n\n');

    if (genericCmd) {
      const parts = parseCommandLine(genericCmd);
      const command = parts[0];
      const args = [...parts.slice(1), fullMessage];
      return { command, args };
    }

    const command = 'node';
    const args = ['-e', 'process.stdout.write(process.argv[1])', fullMessage];
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
    return sessionInput || tag;
  }
};

module.exports = {
  adapter: genericAdapter
};
