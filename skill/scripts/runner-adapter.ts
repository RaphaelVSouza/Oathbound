const fs = require('node:fs');
const path = require('node:path');

const { readEnv } = require('./env.ts');

const BUILTIN_RUNNERS: string[] = ['opencode', 'claude', 'codex', 'agy', 'generic'];

interface RunnerDisplay {
  push(chunk: string): string;
  flush(rawStdout: string): string;
}

interface PrepareAgentOpts {
  agentFile: string;
  agent: string;
  others?: any[];
  feedback?: string;
  scopes?: string[];
  readonly?: boolean;
}

interface PrepareAgentResult {
  tempAgent?: string;
  promptPrefix?: string;
  cleanup?: () => any;
}

interface BuildCommandOpts {
  root?: string;
  agent: string;
  agentFile: string;
  tempAgent?: string;
  model?: string;
  effort?: string;
  message: string;
  session?: string;
  tag: string;
  promptPrefix?: string;
  readonly?: boolean;
  scopes?: string[];
}

interface BuildCommandResult {
  command: string;
  args: string[];
  env?: Record<string, string>;
  input?: string;
}

interface ResolveSessionOpts {
  root?: string;
  tag: string;
  sessionInput?: string;
  runResult?: any;
}

interface ParsedOutput {
  text: string;
  session: string;
  usage: any;
}

interface RunnerAdapter {
  name: string;
  resolveAgentFile(opts: { root?: string; agent: string; agentDir?: string }): string;
  prepareAgent(opts: PrepareAgentOpts): PrepareAgentResult;
  buildCommand(opts: BuildCommandOpts): BuildCommandResult;
  resolveSession(opts: ResolveSessionOpts): Promise<string>;
  parseOutput?: (output: any) => ParsedOutput;
  createDisplay?: () => RunnerDisplay;
}

const feedbackPrompts: Record<string, string> = {
  status: 'Responda somente com: etapa atual, progresso observável, próximo passo e estimativa apenas se tiver base factual. Não execute ações.',
  bloqueios: 'Responda somente com: bloqueios atuais, evidência de cada um e decisão necessária do oathkeeper. Se não houver, diga nenhum. Não execute ações.',
  evidencias: 'Responda somente com: comandos ou fontes já consultados nesta sessão, resultados observados e lacunas. Não execute ações.',
  entrega: 'Resuma o trabalho feito nesta sessão, arquivos afetados, evidências de aceite e pendências. Não execute ações.'
};

const defaultParseOutput = (output: any): ParsedOutput => ({
  text: typeof output === 'object' && output !== null ? output.stdout || '' : String(output || ''),
  session: '',
  usage: null
});

const defaultCreateDisplay = (): RunnerDisplay => ({
  push: (chunk: string) => chunk,
  flush: () => ''
});

/**
 * Validates that an object satisfies the RunnerAdapter contract.
 *
 * Não altera o objeto recebido: devolve um novo objeto com os padrões de
 * `parseOutput` e `createDisplay` preenchidos quando ausentes.
 */
function validateAdapter(adapter: any): RunnerAdapter {
  if (!adapter || typeof adapter !== 'object') throw Error('adapter inválido: deve ser um objeto');
  if (typeof adapter.name !== 'string' || !adapter.name.trim()) throw Error('adapter inválido: propriedade name obrigatória');
  if (typeof adapter.buildCommand !== 'function') throw Error(`adapter '${adapter.name}' inválido: buildCommand deve ser função`);
  if (typeof adapter.prepareAgent !== 'function') throw Error(`adapter '${adapter.name}' inválido: prepareAgent deve ser função`);
  if (typeof adapter.resolveAgentFile !== 'function') throw Error(`adapter '${adapter.name}' inválido: resolveAgentFile deve ser função`);
  if (typeof adapter.resolveSession !== 'function') throw Error(`adapter '${adapter.name}' inválido: resolveSession deve ser função`);
  if (adapter.parseOutput !== undefined && typeof adapter.parseOutput !== 'function') {
    throw Error(`adapter '${adapter.name}' inválido: parseOutput deve ser função`);
  }
  if (adapter.createDisplay !== undefined && typeof adapter.createDisplay !== 'function') {
    throw Error(`adapter '${adapter.name}' inválido: createDisplay deve ser função`);
  }
  return {
    ...adapter,
    parseOutput: adapter.parseOutput || defaultParseOutput,
    createDisplay: adapter.createDisplay || defaultCreateDisplay
  };
}

/**
 * Resolves a runner adapter by name or file path.
 */
function getRunnerAdapter(nameOrPath: string = 'opencode', root: string = process.cwd()): RunnerAdapter {
  const runnerKey = (nameOrPath || 'opencode').trim();

  // 1. Built-in runner by name
  if (BUILTIN_RUNNERS.includes(runnerKey)) {
    const builtinFile = path.join(__dirname, 'runners', `${runnerKey}.ts`);
    if (fs.existsSync(builtinFile)) {
      const mod = require(builtinFile);
      return validateAdapter(mod.adapter || mod);
    }
  }

  // 2. Custom runner by file path or module name
  const candidatePaths = [
    path.isAbsolute(runnerKey) ? runnerKey : path.resolve(root, runnerKey),
    path.isAbsolute(runnerKey) ? runnerKey : path.resolve(process.cwd(), runnerKey),
    runnerKey
  ];

  for (const candidate of candidatePaths) {
    try {
      const resolved = require.resolve(candidate, { paths: [root, process.cwd(), __dirname] });
      const mod = require(resolved);
      return validateAdapter(mod.adapter || mod);
    } catch {}
  }

  throw Error(`runner não encontrado ou inválido: '${runnerKey}'`);
}

/**
 * Extracts pure instructional Markdown from an agent file, stripping YAML frontmatter if present.
 */
function extractInstructions(agentFile: string): string {
  if (!agentFile || !fs.existsSync(agentFile)) return '';
  const raw = fs.readFileSync(agentFile, 'utf8');
  if (raw.startsWith('---')) {
    const end = raw.indexOf('\n---', 3);
    if (end !== -1) {
      return raw.slice(end + 4).trim();
    }
  }
  return raw.trim();
}

/**
 * Resolves the path to an agent markdown file based on runner conventions and candidate directories.
 */
function resolveAgentPath({ root = process.cwd(), agent, agentDir = '', runner = '' }: {
  root?: string;
  agent: string;
  agentDir?: string;
  runner?: string;
}): string {
  if (!agent) return '';
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const runnerKey = (runner || '').toLowerCase();

  const candidateDirs = [
    agentDir,
    readEnv('AGENT_DIR')
  ];

  if (runnerKey === 'claude') {
    if (root) candidateDirs.push(path.join(root, '.claude', 'agents'));
    if (home) candidateDirs.push(path.join(home, '.claude', 'agents'));
  } else if (runnerKey === 'agy') {
    if (root) candidateDirs.push(path.join(root, '.agents', 'agents'));
    if (home) candidateDirs.push(path.join(home, '.gemini', 'antigravity-cli', 'agents'));
  } else if (runnerKey === 'opencode') {
    if (root) candidateDirs.push(path.join(root, '.opencode', 'agents'));
    if (home) candidateDirs.push(path.join(home, '.config', 'opencode', 'agents'));
  } else if (runnerKey === 'codex') {
    if (root) candidateDirs.push(path.join(root, '.codex', 'agents'));
    if (home) candidateDirs.push(path.join(home, '.codex', 'agents'));
  }

  if (root) {
    candidateDirs.push(
      path.join(root, '.opencode', 'agents'),
      path.join(root, '.claude', 'agents'),
      path.join(root, '.agents', 'agents'),
      path.join(root, 'guild')
    );
  }
  if (home) {
    candidateDirs.push(
      path.join(home, '.config', 'opencode', 'agents'),
      path.join(home, '.claude', 'agents'),
      path.join(home, '.gemini', 'antigravity-cli', 'agents')
    );
  }

  for (const dir of candidateDirs.filter(Boolean)) {
    const file = path.join(dir, `${agent}.md`);
    if (fs.existsSync(file)) return file;
  }

  return '';
}

module.exports = {
  getRunnerAdapter,
  validateAdapter,
  feedbackPrompts,
  extractInstructions,
  resolveAgentPath,
  BUILTIN_RUNNERS
};
