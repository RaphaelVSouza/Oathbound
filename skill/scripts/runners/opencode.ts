const fs = require('node:fs');
const path = require('node:path');
const { run } = require('../process-runner.ts');
const { resolveAgentPath } = require('../runner-adapter.ts');
const { readEnv } = require('../env.ts');

function temporaryAgent(file: string, name: string, others: any[]): string {
  const src = fs.readFileSync(file, 'utf8');
  if (!/^  edit:$/m.test(src)) return '';
  const lines = src.split('\n'), result: string[] = [];
  let inside = false;
  for (const line of lines) {
    if (inside && !/^    /.test(line)) {
      for (const g of others) result.push(`    ${JSON.stringify(g.glob)}: deny`, `    ${JSON.stringify(g.glob + '*')}: deny`);
      inside = false;
    }
    result.push(line);
    if (line === '  edit:') inside = true;
  }
  const target = path.join(path.dirname(file), `${name}-lk${process.pid}.md`);
  fs.writeFileSync(target, result.join('\n'));
  return target;
}

function feedbackAgent(file: string, name: string): string {
  const lines = fs.readFileSync(file, 'utf8').split('\n'), result: string[] = [];
  let skip = false, foundEdit = false, foundBash = false;
  for (const line of lines) {
    if (skip && /^    /.test(line)) continue;
    skip = false;
    if (/^  (edit|bash):/.test(line)) {
      if (line.startsWith('  edit:')) foundEdit = true; else foundBash = true;
      result.push(line.startsWith('  edit:') ? '  edit: deny' : '  bash: deny');
      skip = true;
    } else result.push(line);
  }
  if (!foundEdit || !foundBash) throw Error(`permissões edit/bash ausentes: ${file}`);
  const target = path.join(path.dirname(file), `${name}-fb${process.pid}.md`);
  fs.writeFileSync(target, result.join('\n'));
  return target;
}

const opencodeAdapter = {
  name: 'opencode',

  resolveAgentFile({ root, agent, agentDir }: { root?: string; agent: string; agentDir?: string }) {
    return resolveAgentPath({ root, agent, agentDir, runner: 'opencode' }) || path.join(agentDir || readEnv('AGENT_DIR') || path.join(root || '.', '.opencode', 'agents'), `${agent}.md`);
  },

  prepareAgent({ agentFile, agent, others = [], feedback = '', scopes = [], readonly = false }: any) {
    if (!fs.existsSync(agentFile)) throw Error(`agente ausente: ${agentFile}`);
    const normalizedContent = fs.readFileSync(agentFile, 'utf8').replace(/\r\n/g, '\n');
    if (readonly && !feedback && !/^  edit:\s*(deny$|\n\s*"\*":\s*deny)/m.test(normalizedContent)) {
      throw Error(`modo somente leitura exige edit: deny no agente: ${agent}`);
    }

    let tempAgent = '';
    if (feedback) {
      tempAgent = feedbackAgent(agentFile, agent);
    } else if (others.length) {
      tempAgent = temporaryAgent(agentFile, agent, others);
    }

    let promptPrefix = '';
    if (others.length) {
      promptPrefix = `Em uso por outros agentes — só leitura, não edite: ${others.map((x: any) => `${x.glob} (${x.label})`).join('; ')}`;
    }

    return {
      tempAgent,
      promptPrefix,
      cleanup: () => {
        if (tempAgent && fs.existsSync(tempAgent)) {
          try { fs.rmSync(tempAgent, { force: true }); } catch {}
        }
      }
    };
  },

  buildCommand({ root, agent, tempAgent, model, message, session, tag, promptPrefix }: any) {
    const fullMessage = promptPrefix ? `${message}\n${promptPrefix}` : message;
    const command = 'opencode';
    const chosenModel = model || readEnv('MODEL');
    const args = [
      'run', '--standalone',
      ...(session ? ['--session', session] : ['--title', tag]),
      '--agent', tempAgent ? path.basename(tempAgent, '.md') : agent,
      ...(chosenModel ? ['-m', chosenModel] : []),
      fullMessage
    ];
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
    try {
      const list = await run('opencode', ['session', 'list', '-n', '50'], { cwd: root });
      return list.stdout.split(/\r?\n/).find((x: string) => x.split('\t')[1] === tag)?.split('\t')[0] || '';
    } catch {
      return '';
    }
  }
};

module.exports = {
  adapter: opencodeAdapter,
  temporaryAgent,
  feedbackAgent
};
