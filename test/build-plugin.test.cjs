'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildPlugin } = require('../tools/build-plugin.cjs');
const { bumpVersion, parseCliArgs } = require('../tools/bump-version.cjs');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
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
  'disabled',
]);

test('gera plugins isolados com agentes, hooks portáteis e sem sobrescrever destino', t => {
  const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  const base = path.join(ROOT, '.scratch');
  fs.mkdirSync(base, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(base, 'plugin-test-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  for (const runner of ['claude', 'agy']) {
    const out = buildPlugin(runner, path.join(tmp, runner));
    assert.equal(fs.readdirSync(path.join(out, 'agents')).length, 8);
    assert.equal(fs.readdirSync(path.join(out, 'skills')).length, 6);
    assert.equal(fs.existsSync(path.join(out, 'AGENTS.md')), false);
    assert.throws(() => buildPlugin(runner, out), /EEXIST/);
    if (runner === 'claude') {
      const manifest = JSON.parse(fs.readFileSync(path.join(out, '.claude-plugin', 'plugin.json'), 'utf8'));
      assert.equal(manifest.version, version);
      const agent = fs.readFileSync(path.join(out, 'agents', 'assayer.md'), 'utf8');
      assert.match(agent, /\$\{CLAUDE_PLUGIN_ROOT\}\/claude\/hooks\/readonly-guard\.js/);
      assert.doesNotMatch(agent, /__HOME__/);
      const orchestrator = fs.readFileSync(path.join(out, 'agents', 'orquestrador.md'), 'utf8');
      assert.match(orchestrator, /^tools: Agent\(oathbound:scout,/m);
      const hooks = JSON.parse(fs.readFileSync(path.join(out, 'hooks', 'hooks.json'), 'utf8'));
      const sourceHooks = JSON.parse(fs.readFileSync(path.join(ROOT, 'hooks', 'hooks.json'), 'utf8'));
      assert.deepEqual(hooks, sourceHooks);
      assert.equal(fs.existsSync(path.join(out, 'claude/hooks/agent-audit.js')), true);
    } else {
      const manifest = JSON.parse(fs.readFileSync(path.join(out, '.antigravity-plugin', 'plugin.json'), 'utf8'));
      assert.equal(manifest.version, version);
      const hooks = JSON.parse(fs.readFileSync(path.join(out, 'hooks.json'), 'utf8'));
      assert.equal(hooks['rtk-rewrite'].PreToolUse[0].hooks[0].command, 'node ./scripts/rtk-hook.js');
      assert.equal(Object.hasOwn(hooks['rtk-rewrite'], 'Stop'), false);
      assert.equal(
        fs.readFileSync(path.join(out, 'rules', 'AGENTS.md'), 'utf8'),
        fs.readFileSync(path.join(ROOT, 'agy', 'config', 'GEMINI.md'), 'utf8')
      );
      assert.equal(
        fs.readFileSync(path.join(out, 'assets', 'logo.svg'), 'utf8'),
        fs.readFileSync(path.join(ROOT, 'assets', 'logo.svg'), 'utf8')
      );
    }
  }
  assert.throws(() => buildPlugin('agy', path.resolve(tmp, '..', '..', '..', 'outside')), /dentro do repositório/);
});

test('manifestos de plugin sincronizados com VERSION e apenas campos suportados no Antigravity', () => {
  const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  const agyManifest = JSON.parse(fs.readFileSync(path.join(ROOT, '.antigravity-plugin', 'plugin.json'), 'utf8'));
  const claudeManifest = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(agyManifest.version, version);
  assert.equal(claudeManifest.version, version);
  for (const key of Object.keys(agyManifest)) {
    assert.equal(AGY_ALLOWED_FIELDS.has(key), true, `Campo não suportado no .antigravity-plugin/plugin.json: ${key}`);
  }
});

test('bumpVersion atualiza VERSION e ambos os manifestos e rejeita versão inválida', t => {
  const base = path.join(ROOT, '.scratch');
  fs.mkdirSync(base, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(base, 'bump-test-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  fs.mkdirSync(path.join(tmp, '.antigravity-plugin'));
  fs.mkdirSync(path.join(tmp, '.claude-plugin'));
  fs.writeFileSync(path.join(tmp, 'VERSION'), '0.1.0\n');
  fs.writeFileSync(path.join(tmp, '.antigravity-plugin', 'plugin.json'), '{"name":"oathbound","version":"0.1.0"}\n');
  fs.writeFileSync(path.join(tmp, '.claude-plugin', 'plugin.json'), '{"name":"oathbound","version":"0.1.0"}\n');

  assert.throws(() => bumpVersion('invalida', tmp), /Uso:/);
  const updated = bumpVersion('1.2.3-rc.1', tmp);
  assert.deepEqual(updated, ['VERSION', '.antigravity-plugin/plugin.json', '.claude-plugin/plugin.json']);
  assert.equal(fs.readFileSync(path.join(tmp, 'VERSION'), 'utf8').trim(), '1.2.3-rc.1');
  assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, '.antigravity-plugin', 'plugin.json'), 'utf8')).version, '1.2.3-rc.1');
  assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, '.claude-plugin', 'plugin.json'), 'utf8')).version, '1.2.3-rc.1');
});

test('bumpVersion --commit e --tag cria commit e tag no Git e rejeita tag duplicada', t => {
  const base = path.join(ROOT, '.scratch');
  fs.mkdirSync(base, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(base, 'bump-git-test-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const git = (args) => execFileSync('git', args, { cwd: tmp, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(['init']);
  git(['config', 'user.name', 'Test User']);
  git(['config', 'user.email', 'test@example.com']);

  fs.mkdirSync(path.join(tmp, '.antigravity-plugin'));
  fs.mkdirSync(path.join(tmp, '.claude-plugin'));
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
  assert.throws(() => bumpVersion('0.2.0-alpha.1', tmp, { tag: true }), /Tag Git já existe: v0.2.0-alpha.1/);
});
