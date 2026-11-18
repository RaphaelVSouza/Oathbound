// Keep runtime validation first: this installer relies on Node's native TypeScript stripping.
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 24) {
  console.error(`Oathbound installer requires Node.js >= 24; found ${process.versions.node}.`);
  process.exit(1);
}

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const LEGACY_IDS = [
  'oathkeeper', 'mimic', 'tracker', 'herald', 'notary',
  'paladino', 'artesao', 'patrulheiro', 'inquisidor', 'sentinela',
  'mago', 'cacador', 'sabio', 'bardo', 'escriba', 'docs', 'qa'
];

const ALLOWED_RUNNERS = ['all', 'claude', 'agy'];

function sha256(content: Buffer | string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function printContentDiff(relative: string, current: Buffer | string, next: Buffer | string): void {
  const currentBuf = Buffer.isBuffer(current) ? current : Buffer.from(current);
  const nextBuf = Buffer.isBuffer(next) ? next : Buffer.from(next);
  const currentText = currentBuf.toString('utf8');
  const nextText = nextBuf.toString('utf8');
  if (currentText === nextText) return;
  const before = currentText.replace(/\r\n/g, '\n').split('\n');
  const after = nextText.replace(/\r\n/g, '\n').split('\n');
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  if (start === before.length && start === after.length) {
    console.log(`    diff ${relative}: line endings differ`);
    return;
  }
  console.log(`    diff ${relative} (lines ${start + 1}-${endBefore} -> ${start + 1}-${endAfter}):`);
  for (const line of before.slice(start, endBefore)) console.log(`    -${line}`);
  for (const line of after.slice(start, endAfter)) console.log(`    +${line}`);
}

function walkFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

interface InstallOptions {
  project?: string;
  global?: boolean;
  runner?: 'all' | 'claude' | 'agy';
  upgrade?: boolean;
  statusline?: boolean;
  auditDocs?: boolean;
  dedupeSkills?: boolean;
  root?: string;
  homeDir?: string;
  sourceRoot?: string;
}

function parseArgs(args: string[]): InstallOptions {
  const options: InstallOptions = {
    runner: 'all',
    upgrade: false,
    statusline: false,
    auditDocs: false,
    dedupeSkills: true,
    global: false
  };

  let projectSpecified = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--project') {
      if (!args[i + 1]) throw new Error('Missing value for --project');
      options.project = path.resolve(args[++i]);
      projectSpecified = true;
    } else if (arg.startsWith('--project=')) {
      options.project = path.resolve(arg.slice('--project='.length));
      projectSpecified = true;
    } else if (arg === '--global') {
      options.global = true;
    } else if (arg === '--runner') {
      if (!args[i + 1]) throw new Error('Missing value for --runner');
      const val = args[++i].toLowerCase();
      if (['opencode', 'codex', 'generic'].includes(val) || !ALLOWED_RUNNERS.includes(val)) {
        throw new Error(`Unsupported runner: ${val}`);
      }
      options.runner = val as any;
    } else if (arg.startsWith('--runner=')) {
      const val = arg.slice('--runner='.length).toLowerCase();
      if (['opencode', 'codex', 'generic'].includes(val) || !ALLOWED_RUNNERS.includes(val)) {
        throw new Error(`Unsupported runner: ${val}`);
      }
      options.runner = val as any;
    } else if (arg === '--upgrade') {
      options.upgrade = true;
    } else if (arg === '--statusline') {
      options.statusline = true;
    } else if (arg === '--audit-docs') {
      options.auditDocs = true;
    } else if (arg === '--no-dedupe-skills') {
      options.dedupeSkills = false;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node tools/install.ts [--project <dir> | --global] [--runner <all|claude|agy>] [--upgrade] [--statusline] [--audit-docs] [--no-dedupe-skills]');
      process.exit(0);
    } else {
      throw new Error(`Unknown or incomplete option: ${arg}`);
    }
  }

  if (options.global && projectSpecified) {
    throw new Error('--global and --project cannot be combined.');
  }

  if (options.global && options.auditDocs) {
    throw new Error('--audit-docs is only available for project installations.');
  }

  if (!projectSpecified && !options.global) {
    options.project = process.cwd();
  }

  return options;
}

function mergeClaudeSettings(existing: any, incoming: any, enableStatusline: boolean, homePosix: string): any {
  const result = { ...(existing || {}) };

  // Permissions merge
  result.permissions = { ...(result.permissions || {}) };
  const incomingPerms = incoming?.permissions || {};
  for (const type of ['allow', 'deny', 'ask']) {
    const existingList = Array.isArray(result.permissions[type]) ? result.permissions[type] : [];
    const incomingList = Array.isArray(incomingPerms[type]) ? incomingPerms[type] : [];
    result.permissions[type] = Array.from(new Set([...existingList, ...incomingList]));
  }

  // Hooks merge
  result.hooks = { ...(result.hooks || {}) };
  const incomingHooks = incoming?.hooks || {};
  for (const event of Object.keys(incomingHooks)) {
    const existingEventHooks = Array.isArray(result.hooks[event]) ? [...result.hooks[event]] : [];
    const incomingEventHooks = Array.isArray(incomingHooks[event]) ? incomingHooks[event] : [];

    for (const inHookItem of incomingEventHooks) {
      const matchIdx = existingEventHooks.findIndex((h: any) => h.matcher === inHookItem.matcher);
      if (matchIdx === -1) {
        existingEventHooks.push(JSON.parse(JSON.stringify(inHookItem)));
      } else {
        const targetSubHooks = Array.isArray(existingEventHooks[matchIdx].hooks)
          ? [...existingEventHooks[matchIdx].hooks]
          : [];
        const inSubHooks = Array.isArray(inHookItem.hooks) ? inHookItem.hooks : [];
        for (const sub of inSubHooks) {
          if (!targetSubHooks.some((sh: any) => sh.command === sub.command)) {
            targetSubHooks.push(sub);
          }
        }
        existingEventHooks[matchIdx] = {
          ...existingEventHooks[matchIdx],
          hooks: targetSubHooks
        };
      }
    }
    result.hooks[event] = existingEventHooks;
  }

  // skillOverrides merge
  result.skillOverrides = {
    ...(result.skillOverrides || {}),
    ...(incoming?.skillOverrides || {})
  };

  // statusLine
  if (enableStatusline && !result.statusLine) {
    result.statusLine = {
      type: 'command',
      command: 'npx -y ccstatusline@latest',
      padding: 0
    };
  }

  return result;
}

function getEnabledPluginKeys(ep: any): string[] {
  if (!ep) return [];
  if (Array.isArray(ep)) {
    return ep.filter((item: any) => typeof item === 'string');
  }
  if (typeof ep === 'object') {
    return Object.keys(ep).filter(key => Boolean(ep[key]));
  }
  return [];
}

function applySkillOverrides(skillOverrides: Record<string, string>, plugins: string[], skills: Iterable<string>): void {
  for (const plug of plugins) {
    for (const s of skills) {
      skillOverrides[`${plug}:${s}`] = 'off';
      if (plug.includes('@')) {
        const prefix = plug.split('@')[0];
        if (prefix) {
          skillOverrides[`${prefix}:${s}`] = 'off';
        }
      }
    }
  }
}

function rewriteHookCommands(obj: any, replacementCommand?: string, homePosix?: string): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => rewriteHookCommands(item, replacementCommand, homePosix));
  }
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'command' && typeof value === 'string') {
      if (replacementCommand && (value.includes('rtk-hook.js') || value.includes('antigravity-cli'))) {
        result[key] = replacementCommand;
      } else if (homePosix && value.includes('__HOME__')) {
        result[key] = value.replaceAll('__HOME__', homePosix);
      } else {
        result[key] = value;
      }
    } else {
      result[key] = rewriteHookCommands(value, replacementCommand, homePosix);
    }
  }
  return result;
}

function escapeJsonString(val: string): string {
  return JSON.stringify(val).slice(1, -1);
}

function readExistingJson(filePath: string, fallback: any): any {
  if (!fs.existsSync(filePath)) return fallback;
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (raw === '') return fallback;
  try {
    return JSON.parse(raw);
  } catch (err: any) {
    throw new Error(`Invalid JSON in existing file ${filePath}: ${err.message}`);
  }
}

function mergeDeep(target: any, source: any): any {
  const output = { ...(target || {}) };
  if (!source || typeof source !== 'object') return output;
  for (const [key, val] of Object.entries(source)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      output[key] = mergeDeep(output[key], val);
    } else if (Array.isArray(val)) {
      if (Array.isArray(output[key])) {
        const combined = [...output[key]];
        for (const item of val) {
          if (item && item.matcher) {
            const existingIdx = combined.findIndex((x: any) => x && x.matcher === item.matcher);
            if (existingIdx !== -1) {
              combined[existingIdx] = mergeDeep(combined[existingIdx], item);
            } else {
              combined.push(item);
            }
          } else if (item && item.command) {
            const already = combined.some((x: any) => x && x.command === item.command);
            if (!already) combined.push(item);
          } else if (!combined.includes(item)) {
            combined.push(item);
          }
        }
        output[key] = combined;
      } else {
        output[key] = [...val];
      }
    } else if (!(key in output)) {
      output[key] = val;
    }
  }
  return output;
}

function mergeHooksJson(existing: any, incoming: any, hookCommandOverride?: string, homePosix?: string): any {
  const rewrittenIncoming = rewriteHookCommands(incoming, hookCommandOverride, homePosix);
  return mergeDeep(existing, rewrittenIncoming);
}

function moveFolderSafely(srcDir: string, destDir: string): void {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(path.dirname(destDir), { recursive: true });
  if (fs.existsSync(destDir)) {
    const files = walkFiles(srcDir);
    for (const file of files) {
      const rel = path.relative(srcDir, file);
      const target = path.join(destDir, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (!fs.existsSync(target)) {
        fs.renameSync(file, target);
      } else if (sha256(fs.readFileSync(file)) !== sha256(fs.readFileSync(target))) {
        let backupTarget = `${target}.local-backup`;
        if (fs.existsSync(backupTarget)) {
          backupTarget = `${target}.local-backup-${Date.now()}`;
        }
        fs.renameSync(file, backupTarget);
      }
    }
    try {
      fs.rmSync(srcDir, { recursive: true, force: true });
    } catch (_) {}
  } else {
    fs.renameSync(srcDir, destDir);
  }
}

function install(options: InstallOptions) {
  const isGlobal = Boolean(options.global);
  const runner = options.runner || 'all';
  if (['opencode', 'codex', 'generic'].includes(runner) || !ALLOWED_RUNNERS.includes(runner)) {
    throw new Error(`Unsupported runner: ${runner}`);
  }
  if (isGlobal && options.auditDocs) {
    throw new Error('--audit-docs is only available for project installations.');
  }

  const sourceRoot = path.resolve(options.sourceRoot || path.join(__dirname, '..'));
  const targetRoot = path.resolve(
    options.root || (isGlobal ? (options.homeDir || os.homedir()) : (options.project || process.cwd()))
  );
  const userHome = path.resolve(options.homeDir || (isGlobal ? targetRoot : os.homedir()));
  const targetPosix = targetRoot.split(path.sep).join('/');
  const homePosix = userHome.split(path.sep).join('/');
  const claudeHomePosix = targetPosix;

  const manifestRelPath = isGlobal ? '.oathbound/global-manifest.json' : '.oathbound/manifest.json';
  const manifestFullPath = path.join(targetRoot, manifestRelPath);

  let oldManifest: { schema?: number; files?: Array<{ path: string; sha256: string }> } | null = null;
  if (fs.existsSync(manifestFullPath)) {
    try {
      oldManifest = JSON.parse(fs.readFileSync(manifestFullPath, 'utf8'));
    } catch (_) {
      oldManifest = null;
    }
  }

  const oldFilesMap = new Map<string, string>();
  // Manifests anteriores podiam atribuir ao pacote arquivos locais preservados.
  if (oldManifest?.schema === 2 && Array.isArray(oldManifest.files)) {
    for (const f of oldManifest.files) {
      oldFilesMap.set(f.path, f.sha256);
    }
  }

  // Limpeza de agentes legados em --upgrade
  if (options.upgrade) {
    const legacyDirs = [
      path.join(targetRoot, '.claude', 'agents'),
      path.join(targetRoot, '.agents', 'agents'),
      path.join(targetRoot, '.gemini', 'config', 'agents'),
      path.join(targetRoot, '.opencode', 'agents'),
      path.join(targetRoot, '.codex', 'agents')
    ];
    for (const dir of legacyDirs) {
      if (!fs.existsSync(dir)) continue;
      for (const legacyId of LEGACY_IDS) {
        const legacyFile = path.join(dir, `${legacyId}.md`);
        if (fs.existsSync(legacyFile)) {
          const rel = path.relative(targetRoot, legacyFile).split(path.sep).join('/');
          const currentBuf = fs.readFileSync(legacyFile);
          const currentHash = sha256(currentBuf);
          const oldHash = oldFilesMap.get(rel);
          if (oldHash === currentHash) {
            try {
              fs.unlinkSync(legacyFile);
            } catch (_) {}
          }
        }
      }
    }
  }

  // Deduplicação de skills
  const skillsSourceDir = path.join(sourceRoot, 'skills');
  const availableSkills = fs.existsSync(skillsSourceDir)
    ? fs.readdirSync(skillsSourceDir, { withFileTypes: true })
        .filter((d: any) => d.isDirectory())
        .map((d: any) => d.name)
    : [];

  const dedupeActive = options.dedupeSkills !== false;
  const skipProjectClaudeSkills = new Set<string>();
  const skipProjectAgySkills = new Set<string>();
  const disabledSkillsForAgy = new Set<string>(['_disabled']);
  const claudeOverridesToDisable: string[] = [];

  if (dedupeActive) {
    if (!isGlobal) {
      for (const skill of availableSkills) {
        const inClaudeGlobal = fs.existsSync(path.join(userHome, '.claude', 'skills', skill));
        const inAgyGlobal = fs.existsSync(path.join(userHome, '.gemini', 'config', 'skills', skill));

        if (inClaudeGlobal || inAgyGlobal) {
          if (inClaudeGlobal) {
            skipProjectClaudeSkills.add(skill);
            const looseClaude = path.join(targetRoot, '.claude', 'skills', skill);
            if (fs.existsSync(looseClaude)) {
              moveFolderSafely(looseClaude, path.join(targetRoot, '.claude', 'skills', '_disabled', skill));
            }
            claudeOverridesToDisable.push(skill);
          }
          if (inAgyGlobal) {
            skipProjectAgySkills.add(skill);
            const looseAgy = path.join(targetRoot, '.agents', 'skills', skill);
            if (fs.existsSync(looseAgy)) {
              moveFolderSafely(looseAgy, path.join(targetRoot, '.agents', 'skills', '_disabled', skill));
            }
            disabledSkillsForAgy.add(skill);
          }
        }
      }

      // Se runner all no projeto: se instalou em .claude/skills, desativa duplicata no .agents/skills
      if (runner === 'all') {
        for (const skill of availableSkills) {
          skipProjectAgySkills.add(skill);
          disabledSkillsForAgy.add(skill);
          const looseAgy = path.join(targetRoot, '.agents', 'skills', skill);
          if (fs.existsSync(looseAgy)) {
            moveFolderSafely(looseAgy, path.join(targetRoot, '.agents', 'skills', '_disabled', skill));
          }
        }
      }
    } else {
      // Global dedupe: se enabledPlugins existir no claude, desativa em skillOverrides
      const claudeSettingsPath = path.join(targetRoot, '.claude', 'settings.json');
      if (fs.existsSync(claudeSettingsPath)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf8'));
          const plugs = getEnabledPluginKeys(parsed.enabledPlugins);
          if (plugs.length > 0) {
            for (const skill of availableSkills) {
              claudeOverridesToDisable.push(skill);
            }
          }
        } catch (_) {}
      }
    }
  }

  const plannedFiles = new Map<string, { content: Buffer | string; isMerge?: boolean }>();

  // --- Runner Claude ---
  if (runner === 'all' || runner === 'claude') {
    if (isGlobal) {
      const claudeMd = path.join(sourceRoot, 'claude', 'CLAUDE.md');
      if (fs.existsSync(claudeMd)) {
        plannedFiles.set('.claude/CLAUDE.md', { content: fs.readFileSync(claudeMd) });
      }
      const rtkMd = path.join(sourceRoot, 'claude', 'RTK.md');
      if (fs.existsSync(rtkMd)) {
        plannedFiles.set('.claude/RTK.md', { content: fs.readFileSync(rtkMd) });
      }
      const agentsDir = path.join(sourceRoot, 'claude', 'agents');
      if (fs.existsSync(agentsDir)) {
        for (const file of fs.readdirSync(agentsDir)) {
          if (file.endsWith('.md')) {
            const raw = fs.readFileSync(path.join(agentsDir, file), 'utf8');
            const processed = raw.replaceAll('__HOME__', claudeHomePosix);
            plannedFiles.set(`.claude/agents/${file}`, { content: processed });
          }
        }
      }
      const hooksDir = path.join(sourceRoot, 'claude', 'hooks');
      if (fs.existsSync(hooksDir)) {
        for (const file of fs.readdirSync(hooksDir)) {
          if (file.endsWith('.js')) {
            plannedFiles.set(`.claude/hooks/${file}`, { content: fs.readFileSync(path.join(hooksDir, file)) });
          }
        }
      }
      for (const skill of availableSkills) {
        const skillDir = path.join(skillsSourceDir, skill);
        for (const full of walkFiles(skillDir)) {
          const relInside = path.relative(skillDir, full).split(path.sep).join('/');
          plannedFiles.set(`.claude/skills/${skill}/${relInside}`, { content: fs.readFileSync(full) });
        }
      }

      // Settings.json Claude
      const incomingSettingsPath = path.join(sourceRoot, 'claude', 'settings.json');
      let incomingSettings: any = {};
      if (fs.existsSync(incomingSettingsPath)) {
        const raw = fs.readFileSync(incomingSettingsPath, 'utf8').replaceAll('__HOME__', escapeJsonString(claudeHomePosix));
        try { incomingSettings = JSON.parse(raw); } catch (_) {}
      }
      const destSettingsPath = path.join(targetRoot, '.claude', 'settings.json');
      const existingSettings: any = readExistingJson(destSettingsPath, {});
      const mergedClaude = mergeClaudeSettings(existingSettings, incomingSettings, Boolean(options.statusline), claudeHomePosix);

      const existingPlugs = getEnabledPluginKeys(existingSettings.enabledPlugins);
      if (claudeOverridesToDisable.length > 0 && existingPlugs.length > 0) {
        mergedClaude.skillOverrides = mergedClaude.skillOverrides || {};
        applySkillOverrides(mergedClaude.skillOverrides, existingPlugs, claudeOverridesToDisable);
      }

      plannedFiles.set('.claude/settings.json', {
        content: JSON.stringify(mergedClaude, null, 2) + '\n',
        isMerge: true
      });
    } else {
      // Projeto Claude
      const agentsDir = path.join(sourceRoot, 'claude', 'agents');
      if (fs.existsSync(agentsDir)) {
        for (const file of fs.readdirSync(agentsDir)) {
          if (file.endsWith('.md')) {
            const raw = fs.readFileSync(path.join(agentsDir, file), 'utf8');
            const processed = raw.replaceAll('__HOME__', claudeHomePosix);
            plannedFiles.set(`.claude/agents/${file}`, { content: processed });
          }
        }
      }
      const hooksDir = path.join(sourceRoot, 'claude', 'hooks');
      if (fs.existsSync(hooksDir)) {
        for (const file of fs.readdirSync(hooksDir)) {
          if (file.endsWith('.js')) {
            plannedFiles.set(`.claude/hooks/${file}`, { content: fs.readFileSync(path.join(hooksDir, file)) });
          }
        }
      }
      for (const skill of availableSkills) {
        if (skipProjectClaudeSkills.has(skill)) continue;
        const skillDir = path.join(skillsSourceDir, skill);
        for (const full of walkFiles(skillDir)) {
          const relInside = path.relative(skillDir, full).split(path.sep).join('/');
          plannedFiles.set(`.claude/skills/${skill}/${relInside}`, { content: fs.readFileSync(full) });
        }
      }

      const incomingSettingsPath = path.join(sourceRoot, 'claude', 'settings.json');
      let incomingSettings: any = {};
      if (fs.existsSync(incomingSettingsPath)) {
        const raw = fs.readFileSync(incomingSettingsPath, 'utf8').replaceAll('__HOME__', escapeJsonString(claudeHomePosix));
        try { incomingSettings = JSON.parse(raw); } catch (_) {}
      }
      const destSettingsPath = path.join(targetRoot, '.claude', 'settings.json');
      const existingSettings: any = readExistingJson(destSettingsPath, {});
      const mergedClaude = mergeClaudeSettings(existingSettings, incomingSettings, Boolean(options.statusline), claudeHomePosix);

      // Atualiza skillOverrides se plugins habilitados
      const pluginsList = getEnabledPluginKeys(existingSettings.enabledPlugins);
      const incomingPlugs = getEnabledPluginKeys(incomingSettings.enabledPlugins);
      const effectivePlugins = pluginsList.length > 0 ? pluginsList : incomingPlugs;

      if (claudeOverridesToDisable.length > 0 && effectivePlugins.length > 0) {
        mergedClaude.skillOverrides = mergedClaude.skillOverrides || {};
        applySkillOverrides(mergedClaude.skillOverrides, effectivePlugins, claudeOverridesToDisable);
      }

      plannedFiles.set('.claude/settings.json', {
        content: JSON.stringify(mergedClaude, null, 2) + '\n',
        isMerge: true
      });
    }
  }

  // --- Runner Agy ---
  if (runner === 'all' || runner === 'agy') {
    if (isGlobal) {
      const geminiMd = path.join(sourceRoot, 'agy', 'config', 'GEMINI.md');
      if (fs.existsSync(geminiMd)) {
        plannedFiles.set('.gemini/GEMINI.md', { content: fs.readFileSync(geminiMd) });
      }
      const mcpConfig = path.join(sourceRoot, 'agy', 'config', 'mcp_config.json');
      if (fs.existsSync(mcpConfig)) {
        plannedFiles.set('.gemini/config/mcp_config.json', { content: fs.readFileSync(mcpConfig) });
      }
      const agyAgentsDir = path.join(sourceRoot, 'agy', 'config', 'agents');
      if (fs.existsSync(agyAgentsDir)) {
        for (const file of fs.readdirSync(agyAgentsDir)) {
          if (file.endsWith('.md')) {
            const raw = fs.readFileSync(path.join(agyAgentsDir, file), 'utf8');
            const processed = raw.replaceAll('__HOME__', homePosix);
            plannedFiles.set(`.gemini/config/agents/${file}`, { content: processed });
          }
        }
      }
      for (const skill of availableSkills) {
        const skillDir = path.join(skillsSourceDir, skill);
        for (const full of walkFiles(skillDir)) {
          const relInside = path.relative(skillDir, full).split(path.sep).join('/');
          plannedFiles.set(`.gemini/config/skills/${skill}/${relInside}`, { content: fs.readFileSync(full) });
        }
      }

      // Hooks.json global
      const incomingHooksPath = path.join(sourceRoot, 'agy', 'config', 'hooks.json');
      let incomingHooks: any = {
        hooks: {
          PreToolUse: [
            { matcher: 'Bash|PowerShell', hooks: [{ type: 'command', command: 'rtk hook agy' }] },
            { matcher: '*', hooks: [{ type: 'command', command: `node ${homePosix}/.gemini/antigravity-cli/rtk-hook.js` }] }
          ]
        }
      };
      if (fs.existsSync(incomingHooksPath)) {
        const raw = fs.readFileSync(incomingHooksPath, 'utf8').replaceAll('__HOME__', escapeJsonString(homePosix));
        try { incomingHooks = JSON.parse(raw); } catch (_) {}
      }
      const destHooksPath = path.join(targetRoot, '.gemini', 'config', 'hooks.json');
      const existingHooks: any = readExistingJson(destHooksPath, {});
      const mergedHooks = mergeHooksJson(existingHooks, incomingHooks, undefined, homePosix);
      plannedFiles.set('.gemini/config/hooks.json', {
        content: JSON.stringify(mergedHooks, null, 2) + '\n',
        isMerge: true
      });

      // Scripts agy
      const rtkHookSrc = path.join(sourceRoot, 'agy', 'antigravity-cli', 'rtk-hook.js');
      const rtkHookContent = fs.existsSync(rtkHookSrc) ? fs.readFileSync(rtkHookSrc) : '// rtk-hook.js\n';
      plannedFiles.set('.gemini/antigravity-cli/rtk-hook.js', { content: rtkHookContent });

      const statuslineSrc = path.join(sourceRoot, 'agy', 'antigravity-cli', 'statusline.js');
      const statuslineContent = fs.existsSync(statuslineSrc) ? fs.readFileSync(statuslineSrc) : '// statusline.js\n';
      plannedFiles.set('.gemini/antigravity-cli/statusline.js', { content: statuslineContent });

      // Settings.json Agy global
      const agySettingsPath = path.join(targetRoot, '.gemini', 'antigravity-cli', 'settings.json');
      const existingAgySettings: any = readExistingJson(agySettingsPath, {});
      const mergedAgySettings = { ...existingAgySettings };
      if (options.statusline && !mergedAgySettings.statusLine) {
        const agySettingsSrc = path.join(sourceRoot, 'agy', 'antigravity-cli', 'settings.json');
        let incomingAgySettings: any = null;
        if (fs.existsSync(agySettingsSrc)) {
          try {
            const raw = fs.readFileSync(agySettingsSrc, 'utf8').replaceAll('__HOME__', escapeJsonString(homePosix));
            incomingAgySettings = JSON.parse(raw);
          } catch (_) {}
        }
        if (incomingAgySettings?.statusLine) {
          mergedAgySettings.statusLine = incomingAgySettings.statusLine;
        } else {
          mergedAgySettings.statusLine = {
            type: 'command',
            command: `node ${homePosix}/.gemini/antigravity-cli/statusline.js`
          };
        }
      }
      plannedFiles.set('.gemini/antigravity-cli/settings.json', {
        content: JSON.stringify(mergedAgySettings, null, 2) + '\n',
        isMerge: true
      });

      // skills.json global
      const geminiSkillsJsonPath = path.join(targetRoot, '.gemini', 'config', 'skills.json');
      const existingGeminiSkills: any = readExistingJson(geminiSkillsJsonPath, { exclude: ['_disabled'] });
      const existingGeminiExclude = Array.isArray(existingGeminiSkills.exclude) ? existingGeminiSkills.exclude : [];
      existingGeminiSkills.exclude = Array.from(new Set([...existingGeminiExclude, '_disabled']));
      plannedFiles.set('.gemini/config/skills.json', {
        content: JSON.stringify(existingGeminiSkills, null, 2) + '\n',
        isMerge: true
      });
    } else {
      // Projeto Agy
      const agyAgentsDir = path.join(sourceRoot, 'agy', 'config', 'agents');
      if (fs.existsSync(agyAgentsDir)) {
        for (const file of fs.readdirSync(agyAgentsDir)) {
          if (file.endsWith('.md')) {
            const raw = fs.readFileSync(path.join(agyAgentsDir, file), 'utf8');
            const processed = raw.replaceAll('__HOME__', targetPosix);
            plannedFiles.set(`.agents/agents/${file}`, { content: processed });
          }
        }
      }
      const rtkHookSrc = path.join(sourceRoot, 'agy', 'antigravity-cli', 'rtk-hook.js');
      const rtkHookContent = fs.existsSync(rtkHookSrc) ? fs.readFileSync(rtkHookSrc) : '// rtk-hook.js\n';
      plannedFiles.set('.agents/rtk-hook.js', { content: rtkHookContent });

      // Merge em .agents/hooks.json apontando para node <projectPosix>/.agents/rtk-hook.js
      const hookCommand = `node ${targetPosix}/.agents/rtk-hook.js`;
      const incomingHooksPath = path.join(sourceRoot, 'agy', 'config', 'hooks.json');
      let incomingHooks: any = {
        hooks: {
          PreToolUse: [
            { matcher: 'Bash|PowerShell', hooks: [{ type: 'command', command: 'rtk hook agy' }] },
            { matcher: '*', hooks: [{ type: 'command', command: hookCommand }] }
          ]
        }
      };
      if (fs.existsSync(incomingHooksPath)) {
        const raw = fs.readFileSync(incomingHooksPath, 'utf8').replaceAll('__HOME__', escapeJsonString(targetPosix));
        try { incomingHooks = JSON.parse(raw); } catch (_) {}
      }
      const destHooksPath = path.join(targetRoot, '.agents', 'hooks.json');
      const existingHooks: any = readExistingJson(destHooksPath, {});
      const mergedHooks = mergeHooksJson(existingHooks, incomingHooks, hookCommand);
      plannedFiles.set('.agents/hooks.json', {
        content: JSON.stringify(mergedHooks, null, 2) + '\n',
        isMerge: true
      });

      for (const skill of availableSkills) {
        if (skipProjectAgySkills.has(skill)) continue;
        const skillDir = path.join(skillsSourceDir, skill);
        for (const full of walkFiles(skillDir)) {
          const relInside = path.relative(skillDir, full).split(path.sep).join('/');
          plannedFiles.set(`.agents/skills/${skill}/${relInside}`, { content: fs.readFileSync(full) });
        }
      }

      // .agents/skills.json
      const agentsSkillsJsonPath = path.join(targetRoot, '.agents', 'skills.json');
      const existingAgentsSkills: any = readExistingJson(agentsSkillsJsonPath, { exclude: ['_disabled'] });
      const existingAgentsExclude = Array.isArray(existingAgentsSkills.exclude) ? existingAgentsSkills.exclude : [];
      existingAgentsSkills.exclude = Array.from(new Set([
        ...existingAgentsExclude,
        ...Array.from(disabledSkillsForAgy)
      ]));
      plannedFiles.set('.agents/skills.json', {
        content: JSON.stringify(existingAgentsSkills, null, 2) + '\n',
        isMerge: true
      });
    }
  }

  // Se --audit-docs no projeto: copia tools/audit-docs.{ts,core.ts,sources.ts} e configura audit-docs.config.js neutro
  if (!isGlobal && options.auditDocs) {
    const auditDocFiles = ['audit-docs.ts', 'audit-docs.core.ts', 'audit-docs.sources.ts'];
    for (const f of auditDocFiles) {
      const srcFile = path.join(sourceRoot, 'tools', f);
      if (fs.existsSync(srcFile)) {
        plannedFiles.set(`tools/${f}`, { content: fs.readFileSync(srcFile) });
      }
    }
    const cleanConfigContent = `'use strict';\n\nmodule.exports = {\n  rootDocs: ['README.md', 'CONTRIBUTING.md', 'AGENTS.md', 'CHANGELOG.md'],\n  docs: [\n    { path: 'docs', recursive: true, lineNumberRefs: 'allow' }\n  ],\n  lineRefAllowlist: ['CHANGELOG.md']\n};\n`;
    plannedFiles.set('tools/audit-docs.config.js', { content: cleanConfigContent });
  }

  // Aplicação das mudanças e construção do novo manifesto
  const newManifestFiles: Array<{ path: string; sha256: string }> = [];
  const preservedFiles: string[] = [];
  const installedFiles: string[] = [];

  for (const [relPath, item] of plannedFiles) {
    const fullPath = path.join(targetRoot, ...relPath.split('/'));
    const newContentBuf = Buffer.isBuffer(item.content) ? item.content : Buffer.from(item.content, 'utf8');

    if (fs.existsSync(fullPath) && !item.isMerge) {
      const currentBuf = fs.readFileSync(fullPath);
      const currentHash = sha256(currentBuf);
      const newHash = sha256(newContentBuf);
      const oldRecordedHash = oldFilesMap.get(relPath);

      if (currentHash !== newHash) {
        printContentDiff(relPath, currentBuf, newContentBuf);
        if (currentHash !== oldRecordedHash) {
          preservedFiles.push(relPath);
          continue;
        }
        if (!options.upgrade) {
          newManifestFiles.push({ path: relPath, sha256: currentHash });
          continue;
        }
      }
    }

    if (fs.existsSync(fullPath) && item.isMerge && options.upgrade) {
      const currentBuf = fs.readFileSync(fullPath);
      if (sha256(currentBuf) !== sha256(newContentBuf)) {
        printContentDiff(relPath, currentBuf, newContentBuf);
      }
    }

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, newContentBuf);
    newManifestFiles.push({ path: relPath, sha256: sha256(newContentBuf) });
    installedFiles.push(fullPath);
  }

  const manifestData = {
    schema: 2,
    version: fs.readFileSync(path.join(sourceRoot, 'VERSION'), 'utf8').trim(),
    timestamp: new Date().toISOString(),
    files: newManifestFiles.sort((a, b) => a.path.localeCompare(b.path)),
    preservedFiles: preservedFiles.sort()
  };

  fs.mkdirSync(path.dirname(manifestFullPath), { recursive: true });
  fs.writeFileSync(manifestFullPath, JSON.stringify(manifestData, null, 2) + '\n');

  return {
    targetRoot,
    manifestPath: manifestFullPath,
    manifest: manifestData,
    installedFiles
  };
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = install(options);
    console.log(`Oathbound instalado com sucesso em: ${result.targetRoot}`);
    console.log(`Manifesto gerado em: ${result.manifestPath}`);
  } catch (err: any) {
    console.error(`Erro na instalação: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  install,
  parseArgs,
  sha256,
  LEGACY_IDS,
  readExistingJson,
  escapeJsonString
};
