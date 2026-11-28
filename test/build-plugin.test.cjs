'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildPlugin, copySkillsForRunner } = require('../tools/build-plugin.cjs');
const { bumpVersion, parseCliArgs } = require('../tools/bump-version.cjs');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
function fixtureDir(label) {
  const dir = path.join(ROOT, '.scratch', label + randomUUID());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
const AGY_ALLOWED_FIELDS = new Set([
  'name',
  'description',
  'logo',
  'suggestedPrompts',
  'displayName',
  'version',
  'author',
  'homepage',
  'repository',
  'license',
  'disabled',
]);

test('fails the claude build when the native hook binary is missing', t => {
  const tmp = fixtureDir('plugin-nonative-');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const saved = process.env.OATHBOUND_NATIVE_BIN;
  const fake = path.join(tmp, 'missing-bin');
  const { findNativeHookBinary } = require('../tools/build-plugin.cjs');
  t.after(() => { if (saved === undefined) delete process.env.OATHBOUND_NATIVE_BIN; else process.env.OATHBOUND_NATIVE_BIN = saved; });
  process.env.OATHBOUND_NATIVE_BIN = fake;
  assert.throws(() => findNativeHookBinary(tmp), /Native hook binary not found/);
});

test('names the packaged native binary from the source binary extension, not the host', t => {
  const tmp = fixtureDir('plugin-native-name-');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const saved = process.env.OATHBOUND_NATIVE_BIN;
  t.after(() => { if (saved === undefined) delete process.env.OATHBOUND_NATIVE_BIN; else process.env.OATHBOUND_NATIVE_BIN = saved; });
  const cases = [
    { source: 'fake-hook.exe', present: 'oathbound-hook.exe', absent: 'oathbound-hook' },
    { source: 'fake-hook', present: 'oathbound-hook', absent: 'oathbound-hook.exe' }
  ];
  for (const c of cases) {
    const fake = path.join(tmp, c.source);
    fs.writeFileSync(fake, 'fake');
    process.env.OATHBOUND_NATIVE_BIN = fake;
    const out = buildPlugin('claude', path.join(tmp, 'out-' + c.source));
    assert.equal(fs.existsSync(path.join(out, 'native', 'bin', c.present)), true);
    assert.equal(fs.existsSync(path.join(out, 'native', 'bin', c.absent)), false);
  }
});

function withNativeBin(t, value) {
  const saved = process.env.OATHBOUND_NATIVE_BIN;
  t.after(() => { if (saved === undefined) delete process.env.OATHBOUND_NATIVE_BIN; else process.env.OATHBOUND_NATIVE_BIN = saved; });
  process.env.OATHBOUND_NATIVE_BIN = value;
}

test('rejects unsupported runners, including prototype keys, with the usage error and creates nothing', t => {
  const tmp = fixtureDir('plugin-runner-');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  for (const runner of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'unknown']) {
    const dest = path.join(tmp, runner.replace(/\W/g, '_'));
    assert.throws(() => buildPlugin(runner, dest), /Usage:/, runner);
    assert.equal(fs.existsSync(dest), false, runner);
  }
  assert.deepEqual(fs.readdirSync(tmp), []);
});

test('claude resolves the native binary before creating the destination', t => {
  const tmp = fixtureDir('plugin-preflight-');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  // Isolated copy of the builder: its source root has no native/ fallback, so the lookup is deterministic.
  const fakeRoot = path.join(tmp, 'root');
  fs.mkdirSync(path.join(fakeRoot, 'tools'), { recursive: true });
  for (const file of ['build-plugin.cjs', 'skill-selection.cjs']) {
    fs.copyFileSync(path.join(ROOT, 'tools', file), path.join(fakeRoot, 'tools', file));
  }
  withNativeBin(t, path.join(tmp, 'missing-bin'));
  const isolated = require(path.join(fakeRoot, 'tools', 'build-plugin.cjs'));

  const fresh = path.join(fakeRoot, 'fresh');
  assert.throws(() => isolated.buildPlugin('claude', fresh), /Native hook binary not found/);
  assert.equal(fs.existsSync(fresh), false);

  const existing = path.join(fakeRoot, 'existing');
  fs.mkdirSync(existing);
  fs.writeFileSync(path.join(existing, 'keep.txt'), 'keep');
  assert.throws(() => isolated.buildPlugin('claude', existing), /Native hook binary not found/);
  assert.deepEqual(fs.readdirSync(existing), ['keep.txt']);
  assert.equal(fs.readFileSync(path.join(existing, 'keep.txt'), 'utf8'), 'keep');
});

test('claude build with a valid binary refuses an existing destination and preserves its contents', t => {
  const tmp = fixtureDir('plugin-exists-');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const fake = path.join(tmp, 'fake-hook');
  fs.writeFileSync(fake, 'fake');
  withNativeBin(t, fake);
  const existing = path.join(tmp, 'existing');
  fs.mkdirSync(existing);
  fs.writeFileSync(path.join(existing, 'keep.txt'), 'keep');
  assert.throws(() => buildPlugin('claude', existing), /EEXIST/);
  assert.deepEqual(fs.readdirSync(existing), ['keep.txt']);
  assert.equal(fs.readFileSync(path.join(existing, 'keep.txt'), 'utf8'), 'keep');
});

test('packages the claude native binary with mode 0o755', { skip: process.platform === 'win32' && 'POSIX file modes are not observable on Windows' }, t => {
  const tmp = fixtureDir('plugin-mode-');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const fake = path.join(tmp, 'fake-hook');
  fs.writeFileSync(fake, 'fake', { mode: 0o600 });
  withNativeBin(t, fake);
  const out = buildPlugin('claude', path.join(tmp, 'out'));
  assert.equal(fs.statSync(path.join(out, 'native', 'bin', 'oathbound-hook')).mode & 0o777, 0o755);
});

test('agy and codex builds succeed without a native binary and omit native/bin', t => {
  const tmp = fixtureDir('plugin-agy-codex-');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const saved = process.env.OATHBOUND_NATIVE_BIN;
  t.after(() => { if (saved === undefined) delete process.env.OATHBOUND_NATIVE_BIN; else process.env.OATHBOUND_NATIVE_BIN = saved; });
  process.env.OATHBOUND_NATIVE_BIN = path.join(tmp, 'missing-bin');
  for (const runner of ['agy', 'codex']) {
    const out = buildPlugin(runner, path.join(tmp, runner));
    assert.equal(fs.existsSync(path.join(out, 'native', 'bin')), false);
  }
});

test('generates isolated plugins with agents and portable hooks without overwriting the destination', t => {
  const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  const tmp = fixtureDir('plugin-test-');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  for (const runner of ['claude', 'agy']) {
    const out = buildPlugin(runner, path.join(tmp, runner));
    assert.equal(fs.readdirSync(path.join(out, 'agents')).length, 8);
    assert.equal(fs.readdirSync(path.join(out, 'skills')).length, runner === 'agy' ? 15 : 14);
    const commitSkill = fs.readFileSync(path.join(out, 'skills/git-commiter/SKILL.md'), 'utf8');
    assert.match(commitSkill, /^description: .*when the user asks to commit changes/m);
    assert.doesNotMatch(commitSkill, /^disable-model-invocation:\s*true\s*$/m);
    const aliasSkill = fs.readFileSync(path.join(out, 'skills/setup-alias/SKILL.md'), 'utf8');
    assert.match(aliasSkill, /^disable-model-invocation: true\r?$/m);
    assert.ok(aliasSkill.includes(runner === 'agy' ? 'agy --agent oathkeeper' : 'claude --agent oathbound:oathkeeper'));
    assert.equal(fs.existsSync(path.join(out, 'skills/agents-md-builder/SKILL.md')), runner === 'agy');
    assert.deepEqual(
      fs.readFileSync(path.join(out, 'skills/create-adr/SKILL.md')),
      fs.readFileSync(path.join(ROOT, 'skills/create-adr/SKILL.md'))
    );
    assert.equal(fs.existsSync(path.join(out, 'AGENTS.md')), false);
    assert.throws(() => buildPlugin(runner, out), /EEXIST/);
    if (runner === 'claude') {
      const manifest = JSON.parse(fs.readFileSync(path.join(out, '.claude-plugin', 'plugin.json'), 'utf8'));
      assert.equal(manifest.version, version);
      const marketplace = JSON.parse(fs.readFileSync(path.join(out, '.claude-plugin', 'marketplace.json'), 'utf8'));
      assert.deepEqual(marketplace, JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8')));
      assert.equal(marketplace.plugins[0].source, './');
      assert.equal(
        fs.readFileSync(path.join(out, 'workflows', 'revisao-arquitetura.js'), 'utf8'),
        fs.readFileSync(path.join(ROOT, 'workflows', 'revisao-arquitetura.js'), 'utf8')
      );
      const agent = fs.readFileSync(path.join(out, 'agents', 'assayer.md'), 'utf8');
      assert.doesNotMatch(agent, /^hooks:/m);
      assert.equal(agent, fs.readFileSync(path.join(ROOT, 'claude', 'agents', 'assayer.md'), 'utf8'));
      assert.doesNotMatch(agent, /__HOME__/);
      const orchestrator = fs.readFileSync(path.join(out, 'agents', 'oathkeeper.md'), 'utf8');
      assert.match(orchestrator, /^tools: Agent\(oathbound:scout,/m);
      assert.equal(orchestrator, fs.readFileSync(path.join(ROOT, 'claude/agents/oathkeeper.md'), 'utf8'));
      const hooks = JSON.parse(fs.readFileSync(path.join(out, 'hooks', 'hooks.json'), 'utf8'));
      const sourceHooks = JSON.parse(fs.readFileSync(path.join(ROOT, 'hooks', 'hooks.json'), 'utf8'));
      assert.deepEqual(hooks, sourceHooks);
      assert.equal(hooks.hooks.PreToolUse.length, 1);
      assert.match(hooks.hooks.PreToolUse[0].hooks[0].command, /oathbound-hook.*plugin-agent-guard/);
      assert.equal(fs.existsSync(path.join(out, 'claude/hooks/redigir.js')), true);
      const nativeName = process.platform === 'win32' ? 'oathbound-hook.exe' : 'oathbound-hook';
      assert.equal(fs.existsSync(path.join(out, 'native', 'bin', nativeName)), true);
    } else {
      const manifest = JSON.parse(fs.readFileSync(path.join(out, '.antigravity-plugin', 'plugin.json'), 'utf8'));
      assert.equal(manifest.version, version);
      assert.equal(fs.existsSync(path.join(out, 'hooks.json')), false);
      assert.equal(fs.existsSync(path.join(out, 'rules')), false);
      assert.equal(fs.existsSync(path.join(out, 'workflows')), false);
      const orchestrator = fs.readFileSync(path.join(out, 'agents', 'oathkeeper.md'), 'utf8');
      assert.match(orchestrator, /^mainAgent: true$/m);
      assert.match(orchestrator, /^subagent: false$/m);
      assert.equal(orchestrator, fs.readFileSync(path.join(ROOT, 'agy/config/agents/oathkeeper.md'), 'utf8'));
      assert.equal(
        fs.readFileSync(path.join(out, 'assets', 'logo.svg'), 'utf8'),
        fs.readFileSync(path.join(ROOT, 'assets', 'logo.svg'), 'utf8')
      );
    }
  }
  assert.throws(() => buildPlugin('agy', path.resolve(tmp, '..', '..', '..', 'outside')), /inside the repository/);
});

test('generates a Codex marketplace with a portable plugin and complete skills', t => {
  const tmp = fixtureDir('codex-test-');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const out = buildPlugin('codex', path.join(tmp, 'codex'));
  const marketplace = JSON.parse(fs.readFileSync(path.join(out, '.agents/plugins/marketplace.json'), 'utf8'));
  assert.equal(marketplace.name, 'oathbound-local');
  const [entry] = marketplace.plugins;
  assert.deepEqual(entry.source, { source: 'local', path: './plugins/oathbound' });
  const plugin = path.resolve(out, entry.source.path);
  const manifest = JSON.parse(fs.readFileSync(path.join(plugin, 'plugin.json'), 'utf8'));
  assert.equal(manifest.name, entry.name);
  assert.equal(manifest.version, fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim());
  assert.equal(fs.existsSync(path.join(plugin, 'mcp.json')), false);
  assert.equal(fs.existsSync(path.join(plugin, '.codex-plugin')), false);
  assert.equal(fs.existsSync(path.join(plugin, 'statusline.cjs')), false);
  const skills = path.join(plugin, 'skills');
  assert.deepEqual(fs.readdirSync(skills).sort(), [
    'api-contract-design',
    'architecture-advisor',
    'create-adr',
    'create-spec',
    'diagnosing-bugs',
    'git-commiter',
    'grill-me',
    'incident-postmortem',
    'migration',
    'refactor-safely',
    'setup-alias',
    'surgical-patch',
    'test-strategy'
  ]);
  assert.match(fs.readFileSync(path.join(skills, 'setup-alias/SKILL.md'), 'utf8'), /codex --profile oathkeeper/);
  assert.match(fs.readFileSync(path.join(skills, 'setup-alias/agents/openai.yaml'), 'utf8'), /allow_implicit_invocation: false/);
  assert.match(fs.readFileSync(path.join(skills, 'git-commiter/agents/openai.yaml'), 'utf8'), /allow_implicit_invocation: true/);
  assert.deepEqual(fs.readFileSync(path.join(out, 'setup/oathkeeper.config.toml')),
    fs.readFileSync(path.join(ROOT, 'codex/oathkeeper.config.toml')));
  assert.deepEqual(fs.readFileSync(path.join(out, 'setup/statusline.cjs')),
    fs.readFileSync(path.join(ROOT, 'codex/statusline.cjs')));
  assert.deepEqual(fs.readdirSync(path.join(out, 'setup/agents')).sort(),
    ['assayer', 'breaker', 'scholar', 'scout', 'scribe', 'sentinel', 'smith'].map(name => name + '.toml'));
  const { verificar } = require('./agents/sincronia.js');
  const contracts = require('./agents/regras-comuns.json');
  for (const role of Object.keys(contracts.regras)) {
    const profile = fs.readFileSync(path.join(out, 'setup/agents', role + '.toml'), 'utf8');
    assert.match(profile, new RegExp('^name = "' + role + '"', 'm'));
    assert.deepEqual(verificar(profile, role, contracts, 'codex'), []);
  }
  assert.deepEqual(fs.readFileSync(path.join(out, 'setup/hooks.json')), fs.readFileSync(path.join(ROOT, 'codex/hooks.json')));
  for (const file of fs.readdirSync(path.join(ROOT, 'skills'), { recursive: true, withFileTypes: true })) {
    if (!file.isFile()) continue;
    const original = path.join(file.parentPath, file.name);
    const rel = path.relative(path.join(ROOT, 'skills'), original);
    if (/^SKILL\.(claude|agy|codex)\.md$/.test(file.name)) {
      assert.equal(fs.existsSync(path.join(skills, rel)), false, `Override must not leak: ${rel}`);
      continue;
    }
    const override = path.join(file.parentPath, 'SKILL.codex.md');
    const expected = file.name === 'SKILL.md' && fs.existsSync(override) ? override : original;
    assert.deepEqual(fs.readFileSync(path.join(skills, rel)), fs.readFileSync(expected));
  }
  assert.deepEqual(fs.readdirSync(plugin).sort(), ['plugin.json', 'skills']);
  assert.throws(() => buildPlugin('codex', out), /EEXIST/);
});

test('plugin manifests match VERSION and contain only fields supported by Antigravity', () => {
  const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  const agyManifest = JSON.parse(fs.readFileSync(path.join(ROOT, '.antigravity-plugin', 'plugin.json'), 'utf8'));
  const claudeManifest = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(agyManifest.version, version);
  assert.equal(claudeManifest.version, version);
  assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, 'codex/plugin.json'), 'utf8')).version, version);
  for (const key of Object.keys(agyManifest)) {
    assert.equal(AGY_ALLOWED_FIELDS.has(key), true, `Unsupported field in .antigravity-plugin/plugin.json: ${key}`);
  }
});

test('architecture review limits execution to four read-only agents', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'workflows', 'revisao-arquitetura.js'), 'utf8');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const run = new AsyncFunction('args', 'phase', 'pipeline', 'agent', source.replace('export const meta', 'const meta'));
  const calls = [];
  const phases = [];
  const pipeline = (items, task) => Promise.all(items.map(task));
  const agent = async (prompt, options) => {
    calls.push({ prompt, ...options });
    return options.label;
  };

  assert.match(await run(undefined, () => {}, pipeline, agent), /Provide the decision/);
  assert.equal(calls.length, 0);
  const result = await run({ modulos: ['src'] }, title => phases.push(title), pipeline, agent);
  assert.equal(result, 'Verification and synthesis');
  assert.equal(phases.length, 2);
  assert.equal(calls.length, 4);
  for (const call of calls) assert.deepEqual(call.tools, ['Read', 'Glob', 'Grep']);
  assert.match(calls[3].prompt, /Contracts.*Operations.*Migration/);
});

test('bumpVersion updates VERSION and manifests and rejects invalid versions', t => {
  const tmp = fixtureDir('bump-test-');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  fs.mkdirSync(path.join(tmp, '.antigravity-plugin'));
  fs.mkdirSync(path.join(tmp, '.claude-plugin'));
  fs.mkdirSync(path.join(tmp, 'codex'));
  fs.copyFileSync(path.join(ROOT, 'codex/plugin.json'), path.join(tmp, 'codex/plugin.json'));
  fs.writeFileSync(path.join(tmp, 'VERSION'), '0.1.0\n');
  fs.writeFileSync(path.join(tmp, '.antigravity-plugin', 'plugin.json'), '{"name":"oathbound","version":"0.1.0"}\n');
  fs.writeFileSync(path.join(tmp, '.claude-plugin', 'plugin.json'), '{"name":"oathbound","version":"0.1.0"}\n');

  assert.throws(() => bumpVersion('invalida', tmp), /Usage:/);
  const updated = bumpVersion('1.2.3-rc.1', tmp);
  assert.deepEqual(updated, ['VERSION', '.antigravity-plugin/plugin.json', '.claude-plugin/plugin.json', 'codex/plugin.json']);
  assert.equal(fs.readFileSync(path.join(tmp, 'VERSION'), 'utf8').trim(), '1.2.3-rc.1');
  assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, '.antigravity-plugin', 'plugin.json'), 'utf8')).version, '1.2.3-rc.1');
  assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, '.claude-plugin', 'plugin.json'), 'utf8')).version, '1.2.3-rc.1');
  assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, 'codex/plugin.json'), 'utf8')).version, '1.2.3-rc.1');
});

test('bumpVersion --commit and --tag creates a Git commit and tag and rejects duplicate tags', t => {
  const tmp = fixtureDir('bump-git-test-');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const git = (args) => execFileSync('git', args, { cwd: tmp, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(['init']);
  git(['config', 'user.name', 'Test User']);
  git(['config', 'user.email', 'test@example.com']);

  fs.mkdirSync(path.join(tmp, '.antigravity-plugin'));
  fs.mkdirSync(path.join(tmp, '.claude-plugin'));
  fs.mkdirSync(path.join(tmp, 'codex'));
  fs.copyFileSync(path.join(ROOT, 'codex/plugin.json'), path.join(tmp, 'codex/plugin.json'));
  fs.writeFileSync(path.join(tmp, 'VERSION'), '0.1.0\n');
  fs.writeFileSync(path.join(tmp, '.antigravity-plugin', 'plugin.json'), '{"name":"oathbound","version":"0.1.0"}\n');
  fs.writeFileSync(path.join(tmp, '.claude-plugin', 'plugin.json'), '{"name":"oathbound","version":"0.1.0"}\n');
  git(['add', '.']);
  git(['commit', '-m', 'init']);

  const parsed = parseCliArgs(['0.2.0-alpha.1', '--tag']);
  assert.deepEqual(parsed, { version: '0.2.0-alpha.1', options: { commit: true, tag: true } });

  bumpVersion(parsed.version, tmp, parsed.options);
  assert.equal(git(['log', '-1', '--pretty=%s']), 'chore(release): v0.2.0-alpha.1');
  assert.equal(git(['tag', '--list', 'v0.2.0-alpha.1']), 'v0.2.0-alpha.1');
  assert.throws(() => bumpVersion('0.2.0-alpha.1', tmp, { tag: true }), /Git tag already exists: v0.2.0-alpha.1/);
});

test('buildPlugin resolves SKILL.<runner>.md to SKILL.md without leaking overrides', t => {
  const tmp = fixtureDir('skill-override-test-');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const cases = [
    { runner: 'claude', relSkill: 'skills/grill-me/SKILL.md', expected: 'skills/grill-me/SKILL.claude.md', dir: 'skills/grill-me', entries: ['SKILL.md'] },
    { runner: 'agy', relSkill: 'skills/grill-me/SKILL.md', expected: 'skills/grill-me/SKILL.agy.md', dir: 'skills/grill-me', entries: ['SKILL.md'] },
    { runner: 'codex', relSkill: 'plugins/oathbound/skills/grill-me/SKILL.md', expected: 'skills/grill-me/SKILL.codex.md', dir: 'plugins/oathbound/skills/grill-me', entries: ['agents', 'SKILL.md'] }
  ];
  for (const c of cases) {
    const out = buildPlugin(c.runner, path.join(tmp, c.runner));
    assert.deepEqual(
      fs.readFileSync(path.join(out, c.relSkill)),
      fs.readFileSync(path.join(ROOT, c.expected))
    );
    assert.deepEqual(fs.readdirSync(path.join(out, c.dir)).sort(), [...c.entries].sort());
  }
});

test('copySkillsForRunner isolates runner-exclusive skill directories across agy, claude, and codex', t => {
  const tmp = fixtureDir('exclusive-skills-test-');
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const sourceRoot = path.join(tmp, 'src');
  const writeSkill = (relParts, content) => {
    const file = path.join(sourceRoot, ...relParts, 'SKILL.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  writeSkill(['skills', 'shared-skill'], '# shared\n');
  writeSkill(['agy', 'config', 'skills', 'agy-only'], '# agy\n');
  writeSkill(['claude', 'skills', 'claude-only'], '# claude\n');
  writeSkill(['codex', 'skills', 'codex-only'], '# codex\n');

  const expectedByRunner = {
    agy: ['agy-only', 'shared-skill'],
    claude: ['claude-only', 'shared-skill'],
    codex: ['codex-only', 'shared-skill']
  };
  for (const [runner, expected] of Object.entries(expectedByRunner)) {
    const dest = path.join(tmp, `out-${runner}`);
    copySkillsForRunner(runner, dest, sourceRoot);
    assert.deepEqual(fs.readdirSync(dest).sort(), expected);
  }
});
