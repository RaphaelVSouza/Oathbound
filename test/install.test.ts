const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
function fixtureDir(label: string): string {
  const dir = path.join(__dirname, '..', '.scratch', label + randomUUID());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
const { install, parseArgs, sha256, LEGACY_IDS } = require('../tools/install.ts');

function walkAllFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkAllFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

test('parseArgs valida runners permitidos e rejeita opções inválidas ou conflitantes', () => {
  assert.equal(parseArgs(['--runner', 'all']).runner, 'all');
  assert.equal(parseArgs(['--runner', 'claude']).runner, 'claude');
  assert.equal(parseArgs(['--runner', 'agy']).runner, 'agy');

  assert.throws(() => parseArgs(['--runner', 'opencode']), /Unsupported runner: opencode/);
  assert.equal(parseArgs(['--runner', 'codex']).runner, 'codex');
  assert.throws(() => parseArgs(['--runner', 'generic']), /Unsupported runner: generic/);

  assert.throws(() => parseArgs(['--global', '--project', '.']), /--global and --project cannot be combined/);
  assert.throws(() => parseArgs(['--global', '--audit-docs']), /--audit-docs is only available for project installations/);

  const parsedNoDedupe = parseArgs(['--no-dedupe-skills']);
  assert.equal(parsedNoDedupe.dedupeSkills, false);
});

test('Codex instala sete agentes e preserva edição local no upgrade', t => {
  const root = fixtureDir('codex-install-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const options = { root, runner: 'codex' as const };
  const first = install(options);
  assert.equal(first.manifest.files.length, 7);
  assert.deepEqual(install(options).manifest.files, first.manifest.files);
  const scout = path.join(root, '.codex/agents/scout.toml');
  fs.appendFileSync(scout, '\n# alteração local\n');
  assert.deepEqual(install({ ...options, upgrade: true }).manifest.preservedFiles, ['.codex/agents/scout.toml']);
  assert.match(fs.readFileSync(scout, 'utf8'), /alteração local/);
  assert.equal(fs.existsSync(path.join(root, '.claude')), false);
  assert.equal(fs.existsSync(path.join(root, '.codex/oathkeeper.config.toml')), false);
  const previousProfile = path.join(root, '.codex/oathbound.config.toml');
  const customProfile = '# perfil anterior personalizado\n';
  fs.writeFileSync(previousProfile, customProfile);
  const globalInstall = install({ ...options, global: true, upgrade: true });
  assert.equal(fs.readFileSync(previousProfile, 'utf8'), customProfile);
  assert.ok(globalInstall.manifest.files.some(file => file.path === '.codex/oathkeeper.config.toml'));
});

test('instalação global inclui agentes, skills, guards e manifesto sem tocar settings', t => {
  const root = fixtureDir('global-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const settings = [
    '.claude/CLAUDE.md', '.claude/settings.json', '.gemini/GEMINI.md',
    '.gemini/config/GEMINI.md', '.gemini/config/hooks.json',
    '.gemini/config/skills.json', '.gemini/antigravity-cli/settings.json'
  ];
  for (const file of settings) {
    const full = path.join(root, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, 'conteúdo local\n');
  }

  for (const runner of ['claude', 'agy', 'all']) {
    const result = install({ root, global: true, runner, upgrade: true });
    const prefixes = [
      ...(runner === 'agy' ? [] : ['.claude/agents/', '.claude/skills/', '.oathbound/claude-hooks/']),
      ...(runner === 'claude' ? [] : ['.gemini/config/agents/', '.gemini/config/skills/'])
    ];
    for (const prefix of prefixes) {
      assert.ok(result.manifest.files.some((file: any) => file.path.startsWith(prefix)));
    }
    for (const file of result.manifest.files) {
      assert.ok(prefixes.some(prefix => file.path.startsWith(prefix)), file.path);
      const full = path.join(root, file.path);
      assert.equal(fs.lstatSync(full).isSymbolicLink(), false);
      assert.equal(sha256(fs.readFileSync(full)), file.sha256);
      assert.doesNotMatch(fs.readFileSync(full, 'utf8'), /__HOME__/);
    }
  }
  for (const file of settings) {
    assert.equal(fs.readFileSync(path.join(root, file), 'utf8'), 'conteúdo local\n');
  }
  const binName = process.platform === 'win32' ? 'oathbound-hook.exe' : 'oathbound-hook';
  const skillFileCount = walkAllFiles(path.join(__dirname, '..', 'skills'))
    .filter(f => !/^SKILL\.(claude|agy|codex)\.md$/.test(path.basename(f))).length;
  assert.equal(walkAllFiles(root).length, settings.length + 16 + 1 + skillFileCount * 2 + 1);
  assert.deepEqual(
    fs.readFileSync(path.join(root, '.claude/skills/grill-me/SKILL.md')),
    fs.readFileSync(path.join(__dirname, '..', 'skills/grill-me/SKILL.claude.md'))
  );
  assert.deepEqual(
    fs.readFileSync(path.join(root, '.gemini/config/skills/grill-me/SKILL.md')),
    fs.readFileSync(path.join(__dirname, '..', 'skills/grill-me/SKILL.agy.md'))
  );
  assert.equal(fs.existsSync(path.join(root, '.claude/skills/grill-me/SKILL.agy.md')), false);
  assert.equal(fs.existsSync(path.join(root, '.gemini/config/skills/grill-me/SKILL.claude.md')), false);
  const smith = fs.readFileSync(path.join(root, '.claude/agents/smith.md'), 'utf8');
  const guard = path.join(root, `.oathbound/claude-hooks/${binName}`);
  assert.ok(smith.includes(`command: '"${guard.split(path.sep).join('/')}" destructive-guard'`));
  assert.ok(fs.existsSync(guard));
  assert.throws(() => install({ root, global: true, statusline: true }), /--statusline/);
});

test('instalação --project cria estrutura do projeto e audit-docs sem symlinks', t => {
  const projectRoot = fixtureDir('oathbound project test-');
  const fakeHome = fixtureDir('oathbound-home-test-');
  t.after(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  const res = install({
    root: projectRoot,
    homeDir: fakeHome,
    project: projectRoot,
    runner: 'all',
    auditDocs: true
  });

  assert.ok(fs.existsSync(res.manifestPath));
  assert.equal(res.manifestPath.endsWith('manifest.json'), true);

  const binName = process.platform === 'win32' ? 'oathbound-hook.exe' : 'oathbound-hook';
  assert.ok(fs.existsSync(path.join(projectRoot, '.claude', 'agents', 'assayer.md')));
  assert.equal(fs.existsSync(path.join(projectRoot, '.agents', binName)), false);
  assert.ok(fs.existsSync(path.join(projectRoot, '.agents', 'hooks.json')));
  assert.ok(fs.existsSync(path.join(projectRoot, '.agents', 'skills.json')));

  // Audit docs copiado
  assert.ok(fs.existsSync(path.join(projectRoot, 'tools', 'audit-docs.ts')));
  assert.ok(fs.existsSync(path.join(projectRoot, 'tools', 'audit-docs.core.ts')));
  const smith = fs.readFileSync(path.join(projectRoot, '.claude', 'agents', 'smith.md'), 'utf8');
  assert.ok(smith.includes(`command: '"${projectRoot.split(path.sep).join('/')}/.claude/hooks/${binName}" destructive-guard'`));
  const orchestrator = fs.readFileSync(path.join(projectRoot, '.claude', 'agents', 'oathkeeper.md'), 'utf8');
  assert.match(orchestrator, /^tools: Agent\(scout,/m);
  const auditDocsConfigPath = path.join(projectRoot, 'tools', 'audit-docs.config.js');
  assert.ok(fs.existsSync(auditDocsConfigPath));
  const auditDocsConfigContent = fs.readFileSync(auditDocsConfigPath, 'utf8');
  assert.equal(auditDocsConfigContent.includes('caipora'), false);
  assert.equal(auditDocsConfigContent.includes('oathbound.dev'), false);

  const hooks = JSON.parse(fs.readFileSync(path.join(projectRoot, '.agents', 'hooks.json'), 'utf8'));
  assert.equal(hooks['rtk-rewrite'].PreToolUse[0].hooks[0].command, 'rtk hook antigravity');
  const hookPath = path.join(projectRoot, '.agents', 'hooks.json');
  const localHook = { type: 'command', command: 'local-hook' };
  hooks['rtk-rewrite'].PreToolUse[0].hooks = [
    { type: 'command', command: `"C:/project/.agents/${binName}" rtk-hook` },
    localHook,
  ];
  hooks.hooks = { PreToolUse: [{ matcher: 'Bash|PowerShell', hooks: [
    { type: 'command', command: 'rtk hook agy' },
  ] }] };
  fs.writeFileSync(hookPath, JSON.stringify(hooks));
  install({ project: projectRoot, homeDir: fakeHome, runner: 'agy', upgrade: true });
  const upgradedHooks = JSON.parse(fs.readFileSync(hookPath, 'utf8'));
  assert.deepEqual(upgradedHooks.hooks.PreToolUse, []);
  assert.deepEqual(upgradedHooks['rtk-rewrite'].PreToolUse[0].hooks.map((hook: any) => hook.command),
    [localHook.command, 'rtk hook antigravity']);

  // Zero symlinks
  for (const f of walkAllFiles(projectRoot)) {
    assert.equal(fs.lstatSync(f).isSymbolicLink(), false);
  }
});

test('--upgrade preserva edições locais e limpa agentes legados não modificados', t => {
  const projectRoot = fixtureDir('oathbound-upgrade-test-');
  const fakeHome = fixtureDir('oathbound-home-test-');
  t.after(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  // Primeira instalação
  install({
    root: projectRoot,
    homeDir: fakeHome,
    project: projectRoot,
    runner: 'claude'
  });

  const agentPath = path.join(projectRoot, '.claude', 'agents', 'assayer.md');
  assert.ok(fs.existsSync(agentPath));
  const userEdit = '# Custom Assayer Content\n';
  fs.writeFileSync(agentPath, userEdit);

  // Registra um legado gerenciado e deixa outro sob controle local.
  const legacyPath = path.join(projectRoot, '.claude', 'agents', 'mimic.md');
  fs.writeFileSync(legacyPath, '# Legacy Mimic\n');
  const localLegacy = path.join(projectRoot, '.claude', 'agents', 'qa.md');
  fs.writeFileSync(localLegacy, '# Local QA\n');
  const manifestPath = path.join(projectRoot, '.oathbound', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.files.push({ path: '.claude/agents/mimic.md', sha256: sha256(fs.readFileSync(legacyPath)) });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));

  // Segunda instalação com --upgrade
  install({
    root: projectRoot,
    homeDir: fakeHome,
    project: projectRoot,
    runner: 'claude',
    upgrade: true
  });

  // Verifica que a edição local do usuário foi preservada
  assert.equal(fs.readFileSync(agentPath, 'utf8'), userEdit);

  // Verifica que o agente legado não modificado foi limpo
  assert.equal(fs.existsSync(legacyPath), false);
  assert.equal(fs.readFileSync(localLegacy, 'utf8'), '# Local QA\n');
});

test('deduplicação de skills no --project move cópias soltas pré-existentes para _disabled e atualiza skills.json', t => {
  const projectRoot = fixtureDir('oathbound-dedupe-proj-');
  const fakeHome = fixtureDir('oathbound-dedupe-home-');
  t.after(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  // Global já possui a skill surgical-patch
  const globalSkill = path.join(fakeHome, '.claude', 'skills', 'surgical-patch', 'SKILL.md');
  fs.mkdirSync(path.dirname(globalSkill), { recursive: true });
  fs.writeFileSync(globalSkill, '# Global surgical-patch\n');

  // Projeto já possuía cópia local solta
  const looseProjectSkill = path.join(projectRoot, '.claude', 'skills', 'surgical-patch', 'SKILL.md');
  fs.mkdirSync(path.dirname(looseProjectSkill), { recursive: true });
  fs.writeFileSync(looseProjectSkill, '# Local loose edit\n');

  install({
    root: projectRoot,
    homeDir: fakeHome,
    project: projectRoot,
    runner: 'all'
  });

  // A cópia solta deve ter sido movida para _disabled sem perda de conteúdo
  const disabledSkill = path.join(projectRoot, '.claude', 'skills', '_disabled', 'surgical-patch', 'SKILL.md');
  assert.ok(fs.existsSync(disabledSkill));
  assert.equal(fs.readFileSync(disabledSkill, 'utf8'), '# Local loose edit\n');
  assert.equal(fs.existsSync(looseProjectSkill), false);

  // .agents/skills.json deve excluir _disabled e surgical-patch
  const skillsConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, '.agents', 'skills.json'), 'utf8'));
  assert.ok(skillsConfig.exclude.includes('_disabled'));
  assert.ok(skillsConfig.exclude.includes('surgical-patch'));
});

test('preservação: preserva arquivo pré-existente antes do manifesto que difere do template', t => {
  const projectRoot = fixtureDir('oathbound-preexist-test-');
  const fakeHome = fixtureDir('oathbound-home-test-');
  t.after(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  // Cria um arquivo no projeto antes de qualquer instalação (sem manifesto pré-existente)
  const agentPath = path.join(projectRoot, '.claude', 'agents', 'assayer.md');
  fs.mkdirSync(path.dirname(agentPath), { recursive: true });
  const preExistingContent = '# Pre-existing assayer prior to manifest\n';
  fs.writeFileSync(agentPath, preExistingContent);

  const res = install({
    root: projectRoot,
    homeDir: fakeHome,
    project: projectRoot,
    runner: 'claude'
  });

  // Deve ter preservado o conteúdo pré-existente
  assert.equal(fs.readFileSync(agentPath, 'utf8'), preExistingContent);

  // A personalização não entra na lista de arquivos gerenciados.
  const manifest = JSON.parse(fs.readFileSync(res.manifestPath, 'utf8'));
  const record = manifest.files.find((f: any) => f.path === '.claude/agents/assayer.md');
  assert.equal(record, undefined);
  assert.ok(manifest.preservedFiles.includes('.claude/agents/assayer.md'));
  install({ root: projectRoot, homeDir: fakeHome, runner: 'claude', upgrade: true });
  assert.equal(fs.readFileSync(agentPath, 'utf8'), preExistingContent);
});

test('deduplicação preserva a pasta inteira em caso de colisão', t => {
  const projectRoot = fixtureDir('oathbound-collision-proj-');
  const fakeHome = fixtureDir('oathbound-collision-home-');
  t.after(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  const globalSkill = path.join(fakeHome, '.claude', 'skills', 'surgical-patch', 'SKILL.md');
  fs.mkdirSync(path.dirname(globalSkill), { recursive: true });
  fs.writeFileSync(globalSkill, '# Global surgical-patch\n');

  const disabledSkill = path.join(projectRoot, '.claude', 'skills', '_disabled', 'surgical-patch', 'SKILL.md');
  fs.mkdirSync(path.dirname(disabledSkill), { recursive: true });
  fs.writeFileSync(disabledSkill, '# Previous disabled content\n');

  const looseSkill = path.join(projectRoot, '.claude', 'skills', 'surgical-patch', 'SKILL.md');
  fs.mkdirSync(path.dirname(looseSkill), { recursive: true });
  fs.writeFileSync(looseSkill, '# New local loose content\n');

  install({
    root: projectRoot,
    homeDir: fakeHome,
    project: projectRoot,
    runner: 'all'
  });

  assert.equal(fs.readFileSync(disabledSkill, 'utf8'), '# Previous disabled content\n');
  const disabledDir = path.dirname(path.dirname(disabledSkill));
  const backupDir = fs.readdirSync(disabledDir).find((name: string) => name.startsWith('.local-backup-'));
  assert.ok(backupDir);
  const backupSkill = path.join(disabledDir, backupDir, 'surgical-patch', 'SKILL.md');
  assert.equal(fs.readFileSync(backupSkill, 'utf8'), '# New local loose content\n');
});

test('readExistingJson lança erro claro quando settings.json existente contém JSON inválido, preservando o arquivo sem sobrescrever', t => {
  const projectRoot = fixtureDir('oathbound-invalid-json-');
  const fakeHome = fixtureDir('oathbound-invalid-home-');
  t.after(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  const settingsPath = path.join(projectRoot, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  const corruptContent = '{\n  "broken": unquoted_value\n';
  fs.writeFileSync(settingsPath, corruptContent);
  const relativeSkill = path.join('.claude', 'skills', 'surgical-patch', 'SKILL.md');
  const localSkill = path.join(projectRoot, relativeSkill);
  const globalSkill = path.join(fakeHome, relativeSkill);
  for (const file of [localSkill, globalSkill]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'fixture');
  }

  assert.throws(
    () => {
      install({
        root: projectRoot,
        homeDir: fakeHome,
        project: projectRoot,
        runner: 'claude'
      });
    },
    (err: any) => {
      assert.ok(err.message.includes('Invalid JSON in existing file'));
      assert.ok(err.message.includes('settings.json'));
      return true;
    }
  );

  assert.equal(fs.readFileSync(settingsPath, 'utf8'), corruptContent);
  assert.equal(fs.readFileSync(localSkill, 'utf8'), 'fixture');
});
