'use strict';

const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '..');
const SKILL_RUNNER_OVERRIDE_RE = /^SKILL\.(claude|agy|codex)\.md$/;

function copySkillsFromDir(skillsSrc, runner, destDir) {
  if (!fs.existsSync(skillsSrc)) return;
  const overrideName = `SKILL.${runner}.md`;
  for (const entry of fs.readdirSync(skillsSrc, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillSrc = path.join(skillsSrc, entry.name);
    const skillDest = path.join(destDir, entry.name);
    const hasOverride = fs.existsSync(path.join(skillSrc, overrideName));
    const walk = (dir) => {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) {
          walk(full);
          continue;
        }
        const rel = path.relative(skillSrc, full).split(path.sep).join('/');
        let targetRel = rel;
        if (rel === overrideName) {
          targetRel = 'SKILL.md';
        } else if (SKILL_RUNNER_OVERRIDE_RE.test(rel)) {
          continue;
        } else if (runner !== 'codex' && rel === 'agents/openai.yaml') {
          continue;
        } else if (hasOverride && rel === 'SKILL.md') {
          continue;
        }
        const targetFull = path.join(skillDest, ...targetRel.split('/'));
        fs.mkdirSync(path.dirname(targetFull), { recursive: true });
        fs.copyFileSync(full, targetFull, fs.constants.COPYFILE_EXCL);
      }
    };
    walk(skillSrc);
  }
}

const RUNNER_EXCLUSIVE_SKILL_DIRS = {
  agy: ['agy', 'config', 'skills'],
  claude: ['claude', 'skills'],
  codex: ['codex', 'skills'],
};

function copySkillsForRunner(runner, destDir, sourceRoot = source) {
  copySkillsFromDir(path.join(sourceRoot, 'skills'), runner, destDir);
  const exclusiveParts = RUNNER_EXCLUSIVE_SKILL_DIRS[runner];
  if (exclusiveParts) {
    copySkillsFromDir(path.join(sourceRoot, ...exclusiveParts), runner, destDir);
  }
}

// Same lookup order as findNativeHookBinary in tools/install.ts.
function findNativeHookBinary(sourceRoot = source) {
  if (process.env.OATHBOUND_NATIVE_BIN && fs.existsSync(process.env.OATHBOUND_NATIVE_BIN)) {
    return process.env.OATHBOUND_NATIVE_BIN;
  }
  const ext = process.platform === 'win32' ? '.exe' : '';
  const candidates = [
    path.join(sourceRoot, 'native', 'bin', `oathbound-hook-${process.platform}-${process.arch}${ext}`),
    path.join(sourceRoot, 'native', 'oathbound-hook', 'target', 'release', `oathbound-hook${ext}`),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    'Native hook binary not found. Set OATHBOUND_NATIVE_BIN, add native/bin/oathbound-hook-<platform>-<arch>, ' +
    'or run `cargo build --release` in native/oathbound-hook. Checked: ' + candidates.join(', ')
  );
}

function buildPlugin(runner, destination) {
  if (!['claude', 'agy', 'codex'].includes(runner) || !destination) {
    throw new Error('Usage: node tools/build-plugin.cjs <claude|agy|codex> <new-directory>');
  }
  const out = path.resolve(destination);
  const parent = fs.realpathSync(path.dirname(out));
  const relative = path.relative(fs.realpathSync(source), parent);
  if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('The destination must be a new directory inside the repository.');
  }
  const nativeBin = runner === 'claude' ? findNativeHookBinary() : null;
  fs.mkdirSync(out, { recursive: false });
  const copy = (from, to) => fs.cpSync(path.join(source, from), path.join(out, to), { recursive: true, errorOnExist: true, force: false });
  const write = (file, value) => {
    const full = path.join(out, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  };
  const version = fs.readFileSync(path.join(source, 'VERSION'), 'utf8').trim();
  const loadManifest = (relPath) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(source, relPath), 'utf8'));
    manifest.version = version;
    delete manifest.agents;
    delete manifest.skills;
    return manifest;
  };
  if (runner === 'codex') {
    write('plugins/oathbound/plugin.json', loadManifest('codex/plugin.json'));
    copySkillsForRunner('codex', path.join(out, 'plugins/oathbound/skills'));
    copy('codex/oathkeeper.config.toml', 'setup/oathkeeper.config.toml');
    copy('codex/agents', 'setup/agents');
    copy('codex/hooks.json', 'setup/hooks.json');
    write('.agents/plugins/marketplace.json', JSON.parse(fs.readFileSync(path.join(source, 'codex/marketplace.json'), 'utf8')));
    return out;
  }
  copySkillsForRunner(runner, path.join(out, 'skills'));
  if (runner === 'claude') {
    const manifest = loadManifest('.claude-plugin/plugin.json');
    write('.claude-plugin/plugin.json', manifest);
    write('.claude-plugin/marketplace.json', JSON.parse(fs.readFileSync(path.join(source, '.claude-plugin/marketplace.json'), 'utf8')));
    copy('claude/agents', 'agents');
    copy('workflows', 'workflows');
    copy('claude/hooks', 'claude/hooks');
    copy('hooks', 'hooks');
    // Name from the source binary, not the build host, so cross-built targets keep the right suffix.
    const nativeDest = path.join(out, 'native', 'bin', path.extname(nativeBin).toLowerCase() === '.exe' ? 'oathbound-hook.exe' : 'oathbound-hook');
    fs.mkdirSync(path.dirname(nativeDest), { recursive: true });
    fs.copyFileSync(nativeBin, nativeDest);
    fs.chmodSync(nativeDest, 0o755);
  } else {
    const manifest = loadManifest('.antigravity-plugin/plugin.json');
    write('.antigravity-plugin/plugin.json', manifest);
    copy('agy/config/agents', 'agents');
    copy('assets', 'assets');
  }
  return out;
}

if (require.main === module) {
  try { console.log(buildPlugin(process.argv[2], process.argv[3])); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { buildPlugin, findNativeHookBinary, copySkillsForRunner, RUNNER_EXCLUSIVE_SKILL_DIRS };
