'use strict';

const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '..');

function buildPlugin(runner, destination) {
  if (!['claude', 'agy'].includes(runner) || !destination) {
    throw new Error('Uso: node tools/build-plugin.cjs <claude|agy> <diretório-novo>');
  }
  const out = path.resolve(destination);
  const parent = fs.realpathSync(path.dirname(out));
  const relative = path.relative(fs.realpathSync(source), parent);
  if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('O destino deve estar dentro do repositório e ser um diretório novo.');
  }
  fs.mkdirSync(out, { recursive: false });
  const copy = (from, to) => fs.cpSync(path.join(source, from), path.join(out, to), { recursive: true, errorOnExist: true, force: false });
  const write = (file, value) => {
    const full = path.join(out, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  };
  copy('skills', 'skills');
  const version = fs.readFileSync(path.join(source, 'VERSION'), 'utf8').trim();
  const loadManifest = (relPath) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(source, relPath), 'utf8'));
    manifest.version = version;
    delete manifest.agents;
    delete manifest.skills;
    return manifest;
  };
  if (runner === 'claude') {
    const manifest = loadManifest('.claude-plugin/plugin.json');
    write('.claude-plugin/plugin.json', manifest);
    fs.mkdirSync(path.join(out, 'agents'));
    for (const name of fs.readdirSync(path.join(source, 'claude/agents')).filter(name => name.endsWith('.md'))) {
      const content = fs.readFileSync(path.join(source, 'claude/agents', name), 'utf8')
        .replace(/command: "node __HOME__\/\.claude\/hooks\/([^"/]+)"/g, (_, script) => `command: 'node "\${CLAUDE_PLUGIN_ROOT}/hooks/${script}"'`);
      if (content.includes('__HOME__')) throw new Error(`Placeholder não resolvido: ${name}`);
      fs.writeFileSync(path.join(out, 'agents', name), content, { flag: 'wx' });
    }
    copy('claude/hooks', 'hooks');
    const hooks = JSON.parse(fs.readFileSync(path.join(source, 'claude/settings.json'), 'utf8')).hooks;
    for (const group of hooks.PreToolUse) for (const hook of group.hooks) {
      hook.command = hook.command.replace('node __HOME__/.claude/hooks/agent-audit.js', 'node "${CLAUDE_PLUGIN_ROOT}/hooks/agent-audit.js"');
    }
    write('hooks/hooks.json', { hooks });
  } else {
    const manifest = loadManifest('.antigravity-plugin/plugin.json');
    delete manifest.hooks;
    write('.antigravity-plugin/plugin.json', manifest);
    copy('agy/config/agents', 'agents');
    copy('agy/config/GEMINI.md', 'rules/AGENTS.md');
    copy('assets', 'assets');
    fs.mkdirSync(path.join(out, 'scripts'));
    copy('agy/antigravity-cli/rtk-hook.js', 'scripts/rtk-hook.js');
    const hooks = JSON.parse(fs.readFileSync(path.join(source, 'agy/config/hooks.json'), 'utf8'));
    for (const handler of hooks['rtk-rewrite'].PreToolUse.flatMap(group => group.hooks)) {
      handler.command = 'node ./scripts/rtk-hook.js';
    }
    write('hooks.json', hooks);
  }
  return out;
}

if (require.main === module) {
  try { console.log(buildPlugin(process.argv[2], process.argv[3])); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { buildPlugin };
