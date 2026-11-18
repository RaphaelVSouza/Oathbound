const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
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
  assert.throws(() => parseArgs(['--runner', 'codex']), /Unsupported runner: codex/);
  assert.throws(() => parseArgs(['--runner', 'generic']), /Unsupported runner: generic/);

  assert.throws(() => parseArgs(['--global', '--project', '.']), /--global and --project cannot be combined/);
  assert.throws(() => parseArgs(['--global', '--audit-docs']), /--audit-docs is only available for project installations/);

  const parsedNoDedupe = parseArgs(['--no-dedupe-skills']);
  assert.equal(parsedNoDedupe.dedupeSkills, false);
});

test('instalação --global para runner all configura claude e agy sem symlinks e sem __HOME__', t => {
  const globalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-global-test-'));
  t.after(() => fs.rmSync(globalRoot, { recursive: true, force: true }));

  // Pré-popula configurações de usuário para testar merge não-destrutivo
  const claudeSettings = path.join(globalRoot, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(claudeSettings), { recursive: true });
  fs.writeFileSync(claudeSettings, JSON.stringify({
    userCustomKey: 'keep-me',
    permissions: { allow: ['custom_tool'] }
  }, null, 2));

  const agyHooks = path.join(globalRoot, '.gemini', 'config', 'hooks.json');
  fs.mkdirSync(path.dirname(agyHooks), { recursive: true });
  fs.writeFileSync(agyHooks, JSON.stringify({
    customUserHook: true
  }, null, 2));

  const agySettings = path.join(globalRoot, '.gemini', 'antigravity-cli', 'settings.json');
  fs.mkdirSync(path.dirname(agySettings), { recursive: true });
  fs.writeFileSync(agySettings, JSON.stringify({
    trustedWorkspaces: ['/workspace/project-demo']
  }, null, 2));

  const res = install({
    root: globalRoot,
    homeDir: globalRoot,
    global: true,
    runner: 'all',
    statusline: true
  });

  assert.ok(fs.existsSync(res.manifestPath));
  assert.equal(res.manifestPath.endsWith('global-manifest.json'), true);

  // Verifica arquivos Claude
  assert.ok(fs.existsSync(path.join(globalRoot, '.claude', 'CLAUDE.md')));
  assert.ok(fs.existsSync(path.join(globalRoot, '.claude', 'RTK.md')));
  assert.ok(fs.existsSync(path.join(globalRoot, '.claude', 'agents', 'assayer.md')));
  assert.ok(fs.existsSync(path.join(globalRoot, '.claude', 'skills', 'surgical-patch', 'SKILL.md')));

  // Merge não-destrutivo em .claude/settings.json
  const updatedClaudeSettings = JSON.parse(fs.readFileSync(claudeSettings, 'utf8'));
  assert.equal(updatedClaudeSettings.userCustomKey, 'keep-me');
  assert.ok(updatedClaudeSettings.permissions.allow.includes('custom_tool'));
  assert.ok(updatedClaudeSettings.statusLine);
  assert.equal(updatedClaudeSettings.statusLine.command, 'npx -y ccstatusline@latest');
  assert.equal(updatedClaudeSettings.statusLine.padding, 0);

  // Verifica arquivos Gemini / Agy
  assert.equal(fs.readFileSync(path.join(globalRoot, '.gemini', 'GEMINI.md'), 'utf8'),
    fs.readFileSync(path.join(__dirname, '..', 'agy', 'config', 'GEMINI.md'), 'utf8'));
  assert.equal(fs.existsSync(path.join(globalRoot, '.gemini', 'config', 'GEMINI.md')), false);
  assert.ok(fs.existsSync(path.join(globalRoot, '.gemini', 'antigravity-cli', 'rtk-hook.js')));
  assert.ok(fs.existsSync(path.join(globalRoot, '.gemini', 'antigravity-cli', 'statusline.js')));
  assert.ok(fs.existsSync(path.join(globalRoot, '.gemini', 'config', 'skills.json')));

  // Merge não-destrutivo em hooks e settings agy
  const updatedAgyHooks = JSON.parse(fs.readFileSync(agyHooks, 'utf8'));
  assert.equal(updatedAgyHooks.customUserHook, true);

  const updatedAgySettings = JSON.parse(fs.readFileSync(agySettings, 'utf8'));
  assert.deepEqual(updatedAgySettings.trustedWorkspaces, ['/workspace/project-demo']);
  assert.ok(updatedAgySettings.statusLine);

  // Nenhuma ocorrência de __HOME__ em arquivos texto e zero symlinks
  const allFiles = walkAllFiles(globalRoot);
  for (const f of allFiles) {
    const stat = fs.lstatSync(f);
    assert.equal(stat.isSymbolicLink(), false, `Não pode ser symlink: ${f}`);

    if (f.endsWith('.md') || f.endsWith('.json') || f.endsWith('.js')) {
      const content = fs.readFileSync(f, 'utf8');
      assert.equal(content.includes('__HOME__'), false, `__HOME__ não substituído em: ${f}`);
    }
  }

  // Validação do manifesto SHA-256
  const manifest = JSON.parse(fs.readFileSync(res.manifestPath, 'utf8'));
  for (const fileRecord of manifest.files) {
    const full = path.join(globalRoot, ...fileRecord.path.split('/'));
    assert.ok(fs.existsSync(full), `Arquivo do manifesto deve existir: ${full}`);
    assert.equal(sha256(fs.readFileSync(full)), fileRecord.sha256, `SHA-256 deve bater para: ${fileRecord.path}`);
  }
});

test('instalação global preserva GEMINI.md existente e arquivo no caminho antigo', t => {
  const globalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-gemini-test-'));
  t.after(() => fs.rmSync(globalRoot, { recursive: true, force: true }));
  const current = path.join(globalRoot, '.gemini', 'GEMINI.md');
  const old = path.join(globalRoot, '.gemini', 'config', 'GEMINI.md');
  fs.mkdirSync(path.dirname(old), { recursive: true });
  fs.writeFileSync(current, 'instruções existentes\n');
  fs.writeFileSync(old, 'edições no caminho antigo\n');
  install({ root: globalRoot, homeDir: globalRoot, global: true, runner: 'agy', upgrade: true });
  assert.equal(fs.readFileSync(current, 'utf8'), 'instruções existentes\n');
  assert.equal(fs.readFileSync(old, 'utf8'), 'edições no caminho antigo\n');
});

test('instalação --project cria estrutura do projeto e audit-docs sem symlinks', t => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-proj-test-'));
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-home-test-'));
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

  assert.ok(fs.existsSync(path.join(projectRoot, '.claude', 'agents', 'assayer.md')));
  assert.ok(fs.existsSync(path.join(projectRoot, '.agents', 'rtk-hook.js')));
  assert.ok(fs.existsSync(path.join(projectRoot, '.agents', 'hooks.json')));
  assert.ok(fs.existsSync(path.join(projectRoot, '.agents', 'skills.json')));

  // Audit docs copiado
  assert.ok(fs.existsSync(path.join(projectRoot, 'tools', 'audit-docs.ts')));
  assert.ok(fs.existsSync(path.join(projectRoot, 'tools', 'audit-docs.core.ts')));
  const auditDocsConfigPath = path.join(projectRoot, 'tools', 'audit-docs.config.js');
  assert.ok(fs.existsSync(auditDocsConfigPath));
  const auditDocsConfigContent = fs.readFileSync(auditDocsConfigPath, 'utf8');
  assert.equal(auditDocsConfigContent.includes('caipora'), false);
  assert.equal(auditDocsConfigContent.includes('oathbound.dev'), false);

  // Verifica que os hooks do agy apontam para .agents/rtk-hook.js do projeto
  const hooks = JSON.parse(fs.readFileSync(path.join(projectRoot, '.agents', 'hooks.json'), 'utf8'));
  const rawHooksText = JSON.stringify(hooks);
  assert.ok(rawHooksText.includes('.agents/rtk-hook.js'));
  const preToolUse = hooks['rtk-rewrite']?.PreToolUse || hooks.hooks?.PreToolUse || hooks.PreToolUse || [];
  const hookMatcher = preToolUse.find((m: any) => m.matcher === 'run_command' || m.matcher === '*');
  assert.ok(hookMatcher);
  assert.ok(hookMatcher.hooks.some((h: any) => h.command.includes('.agents/rtk-hook.js')));

  // Zero symlinks
  for (const f of walkAllFiles(projectRoot)) {
    assert.equal(fs.lstatSync(f).isSymbolicLink(), false);
  }
});

test('--upgrade preserva edições locais e limpa agentes legados não modificados', t => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-upgrade-test-'));
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-home-test-'));
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
  const legacyPath = path.join(projectRoot, '.claude', 'agents', 'oathkeeper.md');
  fs.writeFileSync(legacyPath, '# Legacy Oathkeeper\n');
  const localLegacy = path.join(projectRoot, '.claude', 'agents', 'qa.md');
  fs.writeFileSync(localLegacy, '# Local QA\n');
  const manifestPath = path.join(projectRoot, '.oathbound', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.files.push({ path: '.claude/agents/oathkeeper.md', sha256: sha256(fs.readFileSync(legacyPath)) });
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
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-dedupe-proj-'));
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-dedupe-home-'));
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

test('deduplicação no --global desativa conflito em skillOverrides quando plugin habilitado como array ou objeto', t => {
  const globalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-dedupe-global-'));
  t.after(() => fs.rmSync(globalRoot, { recursive: true, force: true }));

  // Claude settings com plugin habilitado como objeto (formato real do Claude Code)
  const claudeSettings = path.join(globalRoot, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(claudeSettings), { recursive: true });
  fs.writeFileSync(claudeSettings, JSON.stringify({
    enabledPlugins: { 'oathbound@oathbound': true }
  }, null, 2));

  install({
    root: globalRoot,
    homeDir: globalRoot,
    global: true,
    runner: 'all'
  });

  const updatedSettings = JSON.parse(fs.readFileSync(claudeSettings, 'utf8'));
  assert.ok(updatedSettings.skillOverrides);
  assert.equal(updatedSettings.skillOverrides['oathbound@oathbound:surgical-patch'], 'off');
  assert.equal(updatedSettings.skillOverrides['oathbound:surgical-patch'], 'off');

  const geminiSkills = JSON.parse(fs.readFileSync(path.join(globalRoot, '.gemini', 'config', 'skills.json'), 'utf8'));
  assert.ok(geminiSkills.exclude.includes('_disabled'));

  // Claude settings com plugin habilitado como array
  const globalRootArray = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-dedupe-array-'));
  t.after(() => fs.rmSync(globalRootArray, { recursive: true, force: true }));

  const claudeSettingsArray = path.join(globalRootArray, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(claudeSettingsArray), { recursive: true });
  fs.writeFileSync(claudeSettingsArray, JSON.stringify({
    enabledPlugins: ['oathbound@oathbound']
  }, null, 2));

  install({
    root: globalRootArray,
    homeDir: globalRootArray,
    global: true,
    runner: 'all'
  });

  const updatedSettingsArray = JSON.parse(fs.readFileSync(claudeSettingsArray, 'utf8'));
  assert.ok(updatedSettingsArray.skillOverrides);
  assert.equal(updatedSettingsArray.skillOverrides['oathbound@oathbound:surgical-patch'], 'off');
  assert.equal(updatedSettingsArray.skillOverrides['oathbound:surgical-patch'], 'off');
});

test('preservação: preserva arquivo pré-existente antes do manifesto que difere do template', t => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-preexist-test-'));
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-home-test-'));
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

test('moveFolderSafely preserva cópia local como SKILL.md.local-backup em colisão com conteúdo diferente', t => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-collision-proj-'));
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-collision-home-'));
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
  const backupSkill = path.join(projectRoot, '.claude', 'skills', '_disabled', 'surgical-patch', 'SKILL.md.local-backup');
  assert.ok(fs.existsSync(backupSkill), 'SKILL.md.local-backup deve existir');
  assert.equal(fs.readFileSync(backupSkill, 'utf8'), '# New local loose content\n');
});

test('readExistingJson lança erro claro quando settings.json existente contém JSON inválido, preservando o arquivo sem sobrescrever', t => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-invalid-json-'));
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-invalid-home-'));
  t.after(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  const settingsPath = path.join(projectRoot, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  const corruptContent = '{\n  "broken": unquoted_value\n';
  fs.writeFileSync(settingsPath, corruptContent);

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
});
