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

test('parseArgs validates allowed runners and rejects invalid or conflicting options', () => {
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

test('Codex installs seven agents and preserves local edits during upgrade', t => {
  const root = fixtureDir('codex-install-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const options = { root, runner: 'codex' as const };
  const first = install(options);
  assert.equal(first.manifest.files.length, 7);
  assert.deepEqual(install(options).manifest.files, first.manifest.files);
  const scout = path.join(root, '.codex/agents/scout.toml');
  fs.appendFileSync(scout, '\n# local change\n');
  assert.deepEqual(install({ ...options, upgrade: true }).manifest.preservedFiles, ['.codex/agents/scout.toml']);
  assert.match(fs.readFileSync(scout, 'utf8'), /local change/);
  assert.equal(fs.existsSync(path.join(root, '.claude')), false);
  assert.equal(fs.existsSync(path.join(root, '.codex/oathkeeper.config.toml')), false);
  const previousProfile = path.join(root, '.codex/oathbound.config.toml');
  const customProfile = '# perfil anterior personalizado\n';
  fs.writeFileSync(previousProfile, customProfile);
  const globalInstall = install({ ...options, global: true, upgrade: true });
  assert.equal(fs.readFileSync(previousProfile, 'utf8'), customProfile);
  assert.ok(globalInstall.manifest.files.some(file => file.path === '.codex/oathkeeper.config.toml'));
  const profilePath = path.join(root, '.codex/oathkeeper.config.toml');
  const profile = fs.readFileSync(profilePath, 'utf8');
  assert.match(profile, /### Adaptive selection/);
  const customized = profile + '\n# Local model selection remains binding\n';
  fs.writeFileSync(profilePath, customized);
  const upgraded = install({ ...options, global: true, upgrade: true });
  assert.ok(upgraded.manifest.preservedFiles.includes('.codex/oathkeeper.config.toml'));
  assert.equal(fs.readFileSync(profilePath, 'utf8'), customized);
});

test('global installation includes agents, skills, guards, and manifest without touching settings', t => {
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
    fs.writeFileSync(full, 'local content\n');
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
    assert.equal(fs.readFileSync(path.join(root, file), 'utf8'), 'local content\n');
  }
  const binName = process.platform === 'win32' ? 'oathbound-hook.exe' : 'oathbound-hook';
  const skillFileCount = walkAllFiles(path.join(__dirname, '..', 'skills'))
    .filter(f => !/^SKILL\.(claude|agy|codex)\.md$/.test(path.basename(f)) && !f.endsWith(`${path.sep}agents${path.sep}openai.yaml`)).length;
  const agyExclusiveSkillFileCount = walkAllFiles(path.join(__dirname, '..', 'agy', 'config', 'skills')).length;
  assert.equal(walkAllFiles(root).length, settings.length + 16 + 1 + skillFileCount * 2 + agyExclusiveSkillFileCount + 1);
  assert.equal(fs.existsSync(path.join(root, '.gemini/config/skills/agents-md-builder/SKILL.md')), true);
  assert.equal(fs.existsSync(path.join(root, '.claude/skills/agents-md-builder')), false);
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

test('--project installation creates project structure and audit-docs without symlinks', t => {
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

  // Audit docs copied
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

test('--upgrade preserves local edits and cleans unmodified legacy agents', t => {
  const projectRoot = fixtureDir('oathbound-upgrade-test-');
  const fakeHome = fixtureDir('oathbound-home-test-');
  t.after(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  // First installation
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

  // Registers one managed legacy agent and leaves another under local control.
  const legacyPath = path.join(projectRoot, '.claude', 'agents', 'mimic.md');
  fs.writeFileSync(legacyPath, '# Legacy Mimic\n');
  const localLegacy = path.join(projectRoot, '.claude', 'agents', 'qa.md');
  fs.writeFileSync(localLegacy, '# Local QA\n');
  const manifestPath = path.join(projectRoot, '.oathbound', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.files.push({ path: '.claude/agents/mimic.md', sha256: sha256(fs.readFileSync(legacyPath)) });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));

  // Second installation with --upgrade
  install({
    root: projectRoot,
    homeDir: fakeHome,
    project: projectRoot,
    runner: 'claude',
    upgrade: true
  });

  // Checks that the user local edit was preserved
  assert.equal(fs.readFileSync(agentPath, 'utf8'), userEdit);

  // Checks that the unmodified legacy agent was cleaned up
  assert.equal(fs.existsSync(legacyPath), false);
  assert.equal(fs.readFileSync(localLegacy, 'utf8'), '# Local QA\n');
});

test('skill deduplication in --project moves existing loose copies to _disabled and updates skills.json', t => {
  const projectRoot = fixtureDir('oathbound-dedupe-proj-');
  const fakeHome = fixtureDir('oathbound-dedupe-home-');
  t.after(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  // Global already has the surgical-patch skill
  const globalSkill = path.join(fakeHome, '.claude', 'skills', 'surgical-patch', 'SKILL.md');
  fs.mkdirSync(path.dirname(globalSkill), { recursive: true });
  fs.writeFileSync(globalSkill, '# Global surgical-patch\n');

  // Project already had a loose local copy
  const looseProjectSkill = path.join(projectRoot, '.claude', 'skills', 'surgical-patch', 'SKILL.md');
  fs.mkdirSync(path.dirname(looseProjectSkill), { recursive: true });
  fs.writeFileSync(looseProjectSkill, '# Local loose edit\n');

  install({
    root: projectRoot,
    homeDir: fakeHome,
    project: projectRoot,
    runner: 'all'
  });

  // The loose copy must have moved to _disabled without losing content
  const disabledSkill = path.join(projectRoot, '.claude', 'skills', '_disabled', 'surgical-patch', 'SKILL.md');
  assert.ok(fs.existsSync(disabledSkill));
  assert.equal(fs.readFileSync(disabledSkill, 'utf8'), '# Local loose edit\n');
  assert.equal(fs.existsSync(looseProjectSkill), false);

  // .agents/skills.json must exclude _disabled and surgical-patch
  const skillsConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, '.agents', 'skills.json'), 'utf8'));
  assert.ok(skillsConfig.exclude.includes('_disabled'));
  assert.ok(skillsConfig.exclude.includes('surgical-patch'));
});

test('preservation: preserves a pre-manifest file that differs from the template', t => {
  const projectRoot = fixtureDir('oathbound-preexist-test-');
  const fakeHome = fixtureDir('oathbound-home-test-');
  t.after(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  // Creates a project file before any installation (no existing manifest)
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

  // Must have preserved existing content
  assert.equal(fs.readFileSync(agentPath, 'utf8'), preExistingContent);

  // Customization is not listed among managed files.
  const manifest = JSON.parse(fs.readFileSync(res.manifestPath, 'utf8'));
  const record = manifest.files.find((f: any) => f.path === '.claude/agents/assayer.md');
  assert.equal(record, undefined);
  assert.ok(manifest.preservedFiles.includes('.claude/agents/assayer.md'));
  install({ root: projectRoot, homeDir: fakeHome, runner: 'claude', upgrade: true });
  assert.equal(fs.readFileSync(agentPath, 'utf8'), preExistingContent);
});

test('deduplication preserves the entire directory on collision', t => {
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

test('readExistingJson throws a clear error for invalid existing settings.json and preserves the file without overwriting', t => {
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

test('installs claude-exclusive skills from claude/skills and deduplicates against global ~/.claude/skills', t => {
  const sourceRoot = fixtureDir('claude-exclusive-src-');
  const projectRoot = fixtureDir('claude-exclusive-proj-');
  const fakeHome = fixtureDir('claude-exclusive-home-');
  t.after(() => {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  fs.writeFileSync(path.join(sourceRoot, 'VERSION'), '0.0.0-test\n');
  const ext = process.platform === 'win32' ? '.exe' : '';
  const binName = `oathbound-hook-${process.platform}-${process.arch}${ext}`;
  const hookBin = path.join(sourceRoot, 'native', 'bin', binName);
  fs.mkdirSync(path.dirname(hookBin), { recursive: true });
  fs.writeFileSync(hookBin, 'stub');

  const claudeOnlySkill = path.join(sourceRoot, 'claude', 'skills', 'claude-only', 'SKILL.md');
  fs.mkdirSync(path.dirname(claudeOnlySkill), { recursive: true });
  fs.writeFileSync(claudeOnlySkill, '# Claude Only\n');

  const claudeAlsoGlobal = path.join(sourceRoot, 'claude', 'skills', 'claude-dedup', 'SKILL.md');
  fs.mkdirSync(path.dirname(claudeAlsoGlobal), { recursive: true });
  fs.writeFileSync(claudeAlsoGlobal, '# Claude Dedup\n');

  const globalExisting = path.join(fakeHome, '.claude', 'skills', 'claude-dedup', 'SKILL.md');
  fs.mkdirSync(path.dirname(globalExisting), { recursive: true });
  fs.writeFileSync(globalExisting, '# Global Copy\n');

  install({
    root: projectRoot,
    homeDir: fakeHome,
    project: projectRoot,
    runner: 'claude',
    sourceRoot
  });

  assert.equal(fs.existsSync(path.join(projectRoot, '.claude', 'skills', 'claude-only', 'SKILL.md')), true);
  assert.equal(fs.existsSync(path.join(projectRoot, '.claude', 'skills', 'claude-dedup', 'SKILL.md')), false);
});

test('--global skips loose agents and skills when plugin exists or --hooks-only is set', t => {
  const root = fixtureDir('oathbound-hooks-only-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.mkdirSync(path.join(root, '.claude', 'plugins', 'cache', 'oathbound'), { recursive: true });
  fs.mkdirSync(path.join(root, '.gemini', 'config', 'plugins', 'oathbound'), { recursive: true });

  const res = install({ root, global: true, runner: 'all', upgrade: true });
  const binName = process.platform === 'win32' ? 'oathbound-hook.exe' : 'oathbound-hook';

  assert.equal(fs.existsSync(path.join(root, '.oathbound', 'claude-hooks', binName)), true);
  assert.equal(fs.existsSync(path.join(root, '.claude', 'agents')), false);
  assert.equal(fs.existsSync(path.join(root, '.claude', 'skills')), false);
  assert.equal(fs.existsSync(path.join(root, '.gemini', 'config', 'agents')), false);
  assert.equal(fs.existsSync(path.join(root, '.gemini', 'config', 'skills')), false);
  assert.equal(res.manifest.files.length, 1);

  const root2 = fixtureDir('oathbound-hooks-flag-');
  t.after(() => fs.rmSync(root2, { recursive: true, force: true }));
  const res2 = install({ root: root2, global: true, runner: 'claude', hooksOnly: true });
  assert.equal(fs.existsSync(path.join(root2, '.oathbound', 'claude-hooks', binName)), true);
  assert.equal(fs.existsSync(path.join(root2, '.claude', 'agents')), false);
  assert.equal(fs.existsSync(path.join(root2, '.claude', 'skills')), false);
  assert.equal(res2.manifest.files.length, 1);
});

test('--global --upgrade migrates legacy Oathbound JS hooks in Claude and Codex while preserving other hooks', t => {
  const root = fixtureDir('oathbound-migrate-hooks-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const binName = process.platform === 'win32' ? 'oathbound-hook.exe' : 'oathbound-hook';
  const rootPosix = root.split(path.sep).join('/');

  // Claude legacy settings.json
  const claudeSettingsPath = path.join(root, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(claudeSettingsPath), { recursive: true });
  fs.writeFileSync(claudeSettingsPath, JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: 'Bash|PowerShell', hooks: [{ type: 'command', command: 'rtk hook claude' }] },
        { matcher: '*', hooks: [
          { type: 'command', command: `node ${rootPosix}/.claude/hooks/agent-audit.js`, timeout: 5 },
          { type: 'command', command: 'custom-user-hook' }
        ] }
      ]
    }
  }, null, 2));

  install({ root, global: true, runner: 'claude', upgrade: true, hooksOnly: true });
  const migratedClaude = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf8'));
  assert.deepEqual(
    migratedClaude.hooks.PreToolUse.flatMap((g: any) => g.hooks.map((h: any) => h.command)),
    ['rtk hook claude', `"${rootPosix}/.oathbound/claude-hooks/${binName}" agent-audit`, 'custom-user-hook']
  );

  // Codex legacy hooks.json
  const codexHooksPath = path.join(root, '.codex', 'hooks.json');
  fs.mkdirSync(path.dirname(codexHooksPath), { recursive: true });
  fs.writeFileSync(codexHooksPath, JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: '*', hooks: [
          { type: 'command', command: `node ${rootPosix}/.codex/hooks/agent-audit.js`, timeout: 5 },
          { type: 'command', command: `node ${rootPosix}/.codex/hooks/readonly-guard.js`, timeout: 5 },
          { type: 'command', command: 'custom-codex-hook' }
        ] },
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'rtk hook codex' }] }
      ]
    }
  }, null, 2));

  install({ root, global: true, runner: 'codex', upgrade: true });
  assert.equal(fs.existsSync(path.join(root, '.codex', 'hooks', binName)), true);
  const migratedCodex = JSON.parse(fs.readFileSync(codexHooksPath, 'utf8'));
  const codexBin = `"${rootPosix}/.codex/hooks/${binName}"`;
  assert.equal(migratedCodex.hooks.SubagentStart[0].hooks[0].command, `${codexBin} codex-agent-audit`);
  assert.equal(migratedCodex.hooks.SubagentStop[0].hooks[0].command, `${codexBin} codex-agent-audit`);
  assert.deepEqual(
    migratedCodex.hooks.PreToolUse.flatMap((g: any) => g.hooks.map((h: any) => h.command)),
    ['custom-codex-hook', 'rtk hook codex', `${codexBin} destructive-guard`]
  );
});
