const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { extractInstructions, resolveAgentPath } = require('../runner-adapter.ts');

const sessionMap = new Map<string, string>();
let warnedMissingPermissions = false;

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

  buildCommand({ root, agent, agentFile, model, effort, message, session, tag, promptPrefix, readonly, scopes = [] }: any) {
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

    const permissionsFile = isClaudeNative ? path.join(path.dirname(agentFile), 'oathbound-permissions.json') : '';
    const permissions = permissionsFile && fs.existsSync(permissionsFile)
      ? JSON.parse(fs.readFileSync(permissionsFile, 'utf8'))[agent]
      : null;
    const args = ['-p', fullMessage];
    if (permissions) {
      const allow: string[] = [...permissions.allow];
      if (readonly) {
        const readBash = /^Bash\(git (?:status|diff|show|log|ls-files|rev-parse)(?: |\))/;
        allow.splice(0, allow.length, ...allow.filter(rule =>
          ['Read', 'Grep', 'Glob'].includes(rule) || readBash.test(rule)));
      } else if (scopes.length) {
        const canEdit = allow.some(rule => rule === 'Edit' || rule === 'Write' || rule.startsWith('Edit(') || rule.startsWith('Write('));
        allow.splice(0, allow.length, ...allow.filter(rule => rule !== 'Edit' && rule !== 'Write'));
        if (canEdit) for (const scope of scopes) {
          allow.push(`Edit(${scope})`, `Write(${scope})`);
        }
      }
      args.push('--permission-mode', 'dontAsk', '--allowedTools', [...new Set(allow)].join(','));
      if (permissions.deny.length) args.push('--disallowedTools', permissions.deny.join(','));
    } else {
      if (!warnedMissingPermissions) {
        console.error('permissões do agente indisponíveis; rodando sem restrição de comandos');
        warnedMissingPermissions = true;
      }
      args.push('--dangerously-skip-permissions');
    }

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
    if (readonly) {
      const allowed = args[args.indexOf('--allowedTools') + 1] || '';
      args.push('--tools', allowed.includes('Bash(') ? 'Read,Grep,Glob,Bash' : 'Read,Grep,Glob');
    }

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
