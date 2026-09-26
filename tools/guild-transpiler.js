const fs = require('node:fs');
const path = require('node:path');

const SUPPORTED_RUNNERS = ['opencode', 'claude', 'agy', 'codex', 'generic'];
const NATIVE_AGENT_RUNNERS = ['opencode', 'claude', 'agy'];

/**
 * Extracts frontmatter and body from a markdown string.
 * @param {string} content
 * @returns {{ frontmatter: Record<string, any>, rawFrontmatter: string, body: string }}
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, rawFrontmatter: '', body: content };
  }

  const rawFrontmatter = match[1];
  const body = match[2];
  const frontmatter = {};

  const lines = rawFrontmatter.split(/\r?\n/);
  let currentKey = null;
  let currentSubKey = null;
  let inPermission = false;
  let currentPermSection = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = line.search(/\S/);

    if (indent === 0) {
      inPermission = false;
      currentPermSection = null;
      currentKey = null;
      currentSubKey = null;

      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        const val = line.slice(colonIdx + 1).trim();
        if (key === 'permission') {
          inPermission = true;
          frontmatter.permission = {};
        } else {
          frontmatter[key] = parseYamlScalar(val);
          currentKey = key;
        }
      }
    } else if (inPermission && indent >= 2) {
      if (indent === 2) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const sectionKey = line.slice(0, colonIdx).trim();
          const val = line.slice(colonIdx + 1).trim();
          if (val) {
            frontmatter.permission[sectionKey] = parseYamlScalar(val);
            currentPermSection = null;
          } else {
            frontmatter.permission[sectionKey] = {};
            currentPermSection = sectionKey;
          }
        }
      } else if (indent >= 4 && currentPermSection) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const ruleKey = line.slice(0, colonIdx).trim().replace(/^["']|["']$/g, '');
          const ruleVal = line.slice(colonIdx + 1).trim();
          if (typeof frontmatter.permission[currentPermSection] === 'object') {
            frontmatter.permission[currentPermSection][ruleKey] = parseYamlScalar(ruleVal);
          }
        }
      }
    }
  }

  return { frontmatter, rawFrontmatter, body };
}

/**
 * Parses scalar YAML values.
 * @param {string} val
 * @returns {any}
 */
function parseYamlScalar(val) {
  if (!val) return '';
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (/^-?\d+$/.test(val)) return parseInt(val, 10);
  if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
  return val.replace(/^["']|["']$/g, '');
}

/**
 * Determines Claude Code tool whitelist based on OpenCode permissions.
 * @param {Record<string, any>} [permission={}]
 * @returns {string[]}
 */
function determineClaudeTools(permission = {}) {
  const tools = ['Read', 'Grep', 'Glob'];

  let hasEdit = false;
  if (permission.edit) {
    if (permission.edit === 'allow') hasEdit = true;
    else if (typeof permission.edit === 'object') {
      hasEdit = Object.values(permission.edit).some(v => v === 'allow');
    }
  }

  // Qualquer allow no mapa bash concede a ferramenta `Bash` no Claude. O arquivo
  // de subagente do Claude só aceita nomes de ferramenta, sem escopo de comando:
  // o `"*": deny` com comandos nomeados restringe no OpenCode, mas no Claude a
  // lista vale pelo prompt do agente e pela auditoria de escopo do Git. Negar
  // `Bash` aqui quebrava oathkeeper (delegação), archivist (commit) e o git de
  // leitura de assayer/warden/scribe.
  let hasBash = false;
  if (permission.bash) {
    if (permission.bash === 'allow') hasBash = true;
    else if (typeof permission.bash === 'object') {
      hasBash = Object.values(permission.bash).some(v => v === 'allow');
    }
  }

  let hasWeb = false;
  if (permission.webfetch === 'allow' || permission.websearch === 'allow') {
    hasWeb = true;
  }

  if (hasEdit) { tools.push('Edit'); tools.push('Write'); }
  if (hasBash) tools.push('Bash');
  if (hasWeb) tools.push('WebFetch');

  return tools;
}

/** Translate canonical OpenCode permissions into Claude CLI allow/deny rules. */
function determineClaudePermissions(permission = {}) {
  const allow = [];
  const deny = [];
  const add = (target, rule) => { if (!target.includes(rule)) target.push(rule); };
  if (permission.read === 'allow' || Object.values(permission.read || {}).includes('allow')) add(allow, 'Read');
  if (permission.glob === 'allow') add(allow, 'Glob');
  if (permission.grep === 'allow') add(allow, 'Grep');
  if (permission.webfetch === 'allow') add(allow, 'WebFetch');
  if (permission.websearch === 'allow') add(allow, 'WebSearch');
  // Claude denies win over allows. OpenCode's "*": deny is a default, not a
  // Claude deny-all: emit only named allows in that case. Edit denies cannot
  // be represented here, so only positive globs become CLI rules.
  const bash = permission.bash || {};
  if (bash === 'allow' || bash['*'] === 'allow') add(allow, 'Bash');
  if (typeof bash === 'object') for (const [pattern, decision] of Object.entries(bash)) {
    if (pattern === '*') continue;
    if (decision === 'allow' && bash['*'] !== 'allow') add(allow, `Bash(${pattern.replace(/\*$/, ' *')})`);
    if (decision === 'deny') add(deny, `Bash(${pattern})`);
  }
  const edit = permission.edit || {};
  if (edit === 'allow') { add(allow, 'Edit'); add(allow, 'Write'); }
  if (typeof edit === 'object') for (const [glob, decision] of Object.entries(edit)) {
    if (decision !== 'allow') continue;
    for (const tool of ['Edit', 'Write']) add(allow, glob === '*' ? tool : `${tool}(${glob})`);
  }
  return { allow, deny };
}

/**
 * Transpiles an agent for Claude Code (.claude/agents/*.md).
 * @param {string} name
 * @param {{ frontmatter: Record<string, any>, body: string, rawContent: string }} parsed
 * @returns {string}
 */
function transpileForClaude(name, parsed) {
  const { frontmatter, body } = parsed;
  const description = frontmatter.description || `Agent ${name}`;
  const tools = determineClaudeTools(frontmatter.permission);

  const lines = [
    '---',
    `name: ${name}`,
    `description: ${description.replace(/\r?\n/g, ' ')}`,
    'tools:'
  ];

  for (const t of tools) {
    lines.push(`  - ${t}`);
  }

  if (frontmatter.model) {
    lines.push(`model: ${frontmatter.model}`);
  }

  lines.push('---', '', body.trim(), '');
  return lines.join('\n');
}

/**
 * Transpiles an agent for Antigravity CLI (.agents/agents/*.md).
 * @param {string} name
 * @param {{ frontmatter: Record<string, any>, body: string, rawContent: string }} parsed
 * @returns {string}
 */
function transpileForAgy(name, parsed) {
  const { frontmatter, body } = parsed;
  const description = frontmatter.description || `Agent ${name}`;

  const lines = [
    '---',
    `name: ${name}`,
    `description: ${description.replace(/\r?\n/g, ' ')}`
  ];

  if (frontmatter.model) {
    lines.push(`model: ${frontmatter.model}`);
  }

  lines.push('---', '', body.trim(), '');
  return lines.join('\n');
}

/**
 * Transpiles an agent for OpenCode (pass-through of canonical format).
 * @param {string} _name
 * @param {{ rawContent: string }} parsed
 * @returns {string}
 */
function transpileForOpenCode(_name, parsed) {
  return parsed.rawContent;
}

/**
 * Transpiles an agent's content for a target runner.
 * @param {string} name
 * @param {string} rawContent
 * @param {string} runner
 * @returns {string}
 */
function transpileAgent(name, rawContent, runner) {
  const parsed = parseFrontmatter(rawContent);
  const parsedWithRaw = { ...parsed, rawContent };

  switch (runner.toLowerCase()) {
    case 'opencode':
      return transpileForOpenCode(name, parsedWithRaw);
    case 'claude':
      return transpileForClaude(name, parsedWithRaw);
    case 'agy':
      return transpileForAgy(name, parsedWithRaw);
    case 'codex':
    case 'generic':
      throw Error(`Runner '${runner}' não utiliza arquivos de agentes nativos. Opera via AGENTS.md e skills.`);
    default:
      throw Error(`Runner não suportado para transpilação: '${runner}'`);
  }
}

/**
 * Resolves the native agent directory for a runner.
 * @param {string} targetRoot
 * @param {string} runner
 * @param {boolean} [isGlobal=false]
 * @returns {string|null}
 */
function getNativeAgentDir(targetRoot, runner, isGlobal = false) {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const runnerKey = runner.toLowerCase();

  switch (runnerKey) {
    case 'opencode':
      return isGlobal
        ? path.join(home, '.config', 'opencode', 'agents')
        : path.join(targetRoot, '.opencode', 'agents');
    case 'claude':
      return isGlobal
        ? path.join(home, '.claude', 'agents')
        : path.join(targetRoot, '.claude', 'agents');
    case 'agy':
      return isGlobal
        ? path.join(home, '.gemini', 'antigravity-cli', 'agents')
        : path.join(targetRoot, '.agents', 'agents');
    case 'codex':
    case 'generic':
      return null;
    default:
      return null;
  }
}

/**
 * Transpiles all agent files from source to destination for one or all runners.
 * @param {object} options
 * @param {string} [options.sourceDir]
 * @param {string} [options.targetRoot]
 * @param {string} [options.runner='all']
 * @param {boolean} [options.isGlobal=false]
 * @param {boolean} [options.force=false]
 * @param {function} [options.logger]
 * @returns {{ results: Array<{ runner: string, count: number, targetDir: string|null, skipped: boolean }> }}
 */
function transpileAll({
  sourceDir = path.join(__dirname, '..', 'guild'),
  targetRoot = process.cwd(),
  runner = 'all',
  isGlobal = false,
  force = false,
  logger = () => {}
} = {}) {
  if (!fs.existsSync(sourceDir)) {
    throw Error(`Diretório de agentes canônicos não encontrado: ${sourceDir}`);
  }

  const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.md'));
  if (files.length === 0) {
    throw Error(`Nenhum arquivo de agente .md encontrado em: ${sourceDir}`);
  }

  const runnerKeys = runner.toLowerCase() === 'all'
    ? NATIVE_AGENT_RUNNERS
    : [runner.toLowerCase()];

  const results = [];

  for (const rKey of runnerKeys) {
    if (!NATIVE_AGENT_RUNNERS.includes(rKey)) {
      logger(`[agent-transpiler] Runner '${rKey}' não utiliza pasta de agentes nativos (opera via AGENTS.md e skills).`);
      results.push({ runner: rKey, count: 0, targetDir: null, skipped: true });
      continue;
    }

    const targetDir = getNativeAgentDir(targetRoot, rKey, isGlobal);
    if (!targetDir) {
      results.push({ runner: rKey, count: 0, targetDir: null, skipped: true });
      continue;
    }

    fs.mkdirSync(targetDir, { recursive: true });

    let written = 0;
    const permissions = {};
    for (const file of files) {
      const agentName = path.basename(file, '.md');
      const srcFile = path.join(sourceDir, file);
      const destFile = path.join(targetDir, file);

      const raw = fs.readFileSync(srcFile, 'utf8');
      if (rKey === 'claude') permissions[agentName] = determineClaudePermissions(parseFrontmatter(raw).frontmatter.permission);
      if (fs.existsSync(destFile) && !force) {
        // Skip existing without force
        continue;
      }

      const transpiled = transpileAgent(agentName, raw, rKey);
      fs.writeFileSync(destFile, transpiled, 'utf8');
      written++;
    }

    if (rKey === 'claude') {
      const permissionsFile = path.join(targetDir, 'oathbound-permissions.json');
      if (!fs.existsSync(permissionsFile) || force) fs.writeFileSync(permissionsFile, JSON.stringify(permissions, null, 2) + '\n');
    }

    logger(`[agent-transpiler] Runner '${rKey}': ${written}/${files.length} agentes gravados em ${targetDir}`);
    results.push({ runner: rKey, count: written, targetDir, skipped: false });
  }

  return { results };
}

// CLI entrypoint
if (require.main === module) {
  const args = process.argv.slice(2);
  let sourceDir = path.join(__dirname, '..', 'guild');
  let targetRoot = process.cwd();
  let runner = 'all';
  let isGlobal = false;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--source' && args[i + 1]) { sourceDir = path.resolve(args[++i]); }
    else if (a === '--target' && args[i + 1]) { targetRoot = path.resolve(args[++i]); }
    else if (a === '--runner' && args[i + 1]) { runner = args[++i]; }
    else if (a === '--global') { isGlobal = true; }
    else if (a === '--force') { force = true; }
    else if (a === '-h' || a === '--help') {
      console.log('Uso: node tools/guild-transpiler.js [opções]');
      console.log('');
      console.log('Opções:');
      console.log('  --source <dir>    Diretório dos agentes canônicos (padrão: guild)');
      console.log('  --target <dir>    Raiz do projeto de destino (padrão: cwd)');
      console.log('  --runner <name>   Runner alvo: all, opencode, claude, agy, codex, generic (padrão: all)');
      console.log('  --global          Instalar nos diretórios globais do usuário (~/.claude, ~/.config, etc.)');
      console.log('  --force           Sobrescrever arquivos existentes');
      console.log('  -h, --help        Exibir esta ajuda');
      process.exit(0);
    }
  }

  try {
    transpileAll({ sourceDir, targetRoot, runner, isGlobal, force, logger: console.log });
  } catch (err) {
    console.error(`Erro: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  SUPPORTED_RUNNERS,
  NATIVE_AGENT_RUNNERS,
  parseFrontmatter,
  determineClaudeTools,
  determineClaudePermissions,
  transpileForClaude,
  transpileForAgy,
  transpileForOpenCode,
  transpileAgent,
  getNativeAgentDir,
  transpileAll
};
