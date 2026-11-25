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
  'mimic', 'tracker', 'herald', 'notary',
  'paladino', 'artesao', 'patrulheiro', 'inquisidor', 'sentinela',
  'mago', 'cacador', 'sabio', 'bardo', 'escriba', 'docs', 'qa'
];

const ALLOWED_RUNNERS = ['all', 'claude', 'agy', 'codex'];
const SKILL_RUNNER_OVERRIDE_RE = /^SKILL\.(claude|agy|codex)\.md$/;

function collectSkillFilesForRunner(skillDir: string, runner: 'claude' | 'agy' | 'codex'): Array<{ rel: string; full: string }> {
  const overrideName = `SKILL.${runner}.md`;
  const hasOverride = fs.existsSync(path.join(skillDir, overrideName));
  const result: Array<{ rel: string; full: string }> = [];
  for (const full of walkFiles(skillDir)) {
    const relInside = path.relative(skillDir, full).split(path.sep).join('/');
    if (relInside === overrideName) {
      result.push({ rel: 'SKILL.md', full });
      continue;
    }
    if (SKILL_RUNNER_OVERRIDE_RE.test(relInside)) continue;
    if (runner !== 'codex' && relInside === 'agents/openai.yaml') continue;
    if (hasOverride && relInside === 'SKILL.md') continue;
    result.push({ rel: relInside, full });
  }
  return result;
}

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
  runner?: 'all' | 'claude' | 'agy' | 'codex';
  upgrade?: boolean;
  statusline?: boolean;
  auditDocs?: boolean;
  dedupeSkills?: boolean;
  hooksOnly?: boolean;
  prune?: boolean;
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
    hooksOnly: false,
    prune: false,
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
      if (!ALLOWED_RUNNERS.includes(val)) {
        throw new Error(`Unsupported runner: ${val}`);
      }
      options.runner = val as any;
    } else if (arg.startsWith('--runner=')) {
      const val = arg.slice('--runner='.length).toLowerCase();
      if (!ALLOWED_RUNNERS.includes(val)) {
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
    } else if (arg === '--hooks-only') {
      options.hooksOnly = true;
    } else if (arg === '--prune') {
      options.prune = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node tools/install.ts [--project <dir> | --global] [--runner <all|claude|agy|codex>] [--upgrade] [--statusline] [--audit-docs] [--no-dedupe-skills] [--hooks-only] [--prune]');
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
  if (options.global && options.statusline) {
    throw new Error('--statusline is only available for project installations.');
  }
  if (!options.global && options.prune) {
    throw new Error('--prune is only available for global installations.');
  }

  if (!projectSpecified && !options.global) {
    options.project = process.cwd();
  }

  return options;
}

function mergeHookEvents(existingHooksInput: any, incomingHooksInput: any): Record<string, any[]> {
  const merged: Record<string, any[]> = { ...(existingHooksInput || {}) };
  const incomingHooks = incomingHooksInput || {};
  for (const event of Object.keys(incomingHooks)) {
    const existingEventHooks = Array.isArray(merged[event]) ? [...merged[event]] : [];
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
    merged[event] = existingEventHooks;
  }
  return merged;
}

const LEGACY_OATHBOUND_JS_HOOK_RE = /(?:^|\s|["'])[^\s"']*[\\/](agent-audit|readonly-guard|read-size-guard|destructive-guard)\.js(?:["']|\s|$)/i;

function migrateLegacyOathboundHooks(
  config: any,
  replacements: Record<string, string | null>
): { changed: boolean; config: any } {
  if (!config || typeof config !== 'object' || !config.hooks || typeof config.hooks !== 'object') {
    return { changed: false, config };
  }
  let changed = false;
  const nextHooks: Record<string, any> = { ...config.hooks };
  for (const [event, groups] of Object.entries(nextHooks)) {
    if (!Array.isArray(groups)) continue;
    const updatedGroups: any[] = [];
    for (const entry of groups) {
      if (!entry || !Array.isArray(entry.hooks)) {
        updatedGroups.push(entry);
        continue;
      }
      const nextSubHooks: any[] = [];
      const seenCommands = new Set<string>();
      for (const hook of entry.hooks) {
        const cmd = hook?.command;
        const match = typeof cmd === 'string' ? LEGACY_OATHBOUND_JS_HOOK_RE.exec(cmd) : null;
        if (!match) {
          if (typeof cmd !== 'string' || !seenCommands.has(cmd)) {
            if (typeof cmd === 'string') seenCommands.add(cmd);
            nextSubHooks.push(hook);
          } else {
            changed = true;
          }
          continue;
        }
        changed = true;
        const legacyName = match[1].toLowerCase();
        const replacement = Object.hasOwn(replacements, legacyName) ? replacements[legacyName] : null;
        if (replacement && !seenCommands.has(replacement)) {
          seenCommands.add(replacement);
          nextSubHooks.push({ ...hook, command: replacement });
        }
      }
      if (nextSubHooks.length > 0 || entry.hooks.length === 0) {
        updatedGroups.push({ ...entry, hooks: nextSubHooks });
      }
    }
    nextHooks[event] = updatedGroups;
  }
  if (!changed) return { changed: false, config };
  return { changed: true, config: { ...config, hooks: nextHooks } };
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
  result.hooks = mergeHookEvents(result.hooks, incoming?.hooks);

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

function escapeJsonString(val: string): string {
  return JSON.stringify(val).slice(1, -1);
}

function escapeClaudeHookPath(value: string): string {
  return value.replace(/["`$\\]/g, '\\$&');
}

function nativeHookBinName(): string {
  return process.platform === 'win32' ? 'oathbound-hook.exe' : 'oathbound-hook';
}

function findNativeHookBinary(sourceRoot: string): string {
  if (process.env.OATHBOUND_NATIVE_BIN && fs.existsSync(process.env.OATHBOUND_NATIVE_BIN)) {
    return process.env.OATHBOUND_NATIVE_BIN;
  }
  const ext = process.platform === 'win32' ? '.exe' : '';
  const platformName = `oathbound-hook-${process.platform}-${process.arch}${ext}`;
  const candidates = [
    path.join(sourceRoot, 'native', 'bin', platformName),
    path.join(sourceRoot, 'native', 'oathbound-hook', 'target', 'release', `oathbound-hook${ext}`)
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Native oathbound-hook binary not found (${platformName}). Build with "cargo build --release --manifest-path native/oathbound-hook/Cargo.toml" or set OATHBOUND_NATIVE_BIN.`
  );
}

const reviewAgentGuards = {
  Bash: ['readonly-guard', 'read-size-guard'],
  Read: ['read-size-guard']
};
const claudeAgentGuards: Record<string, Record<string, string[]>> = {
  'assayer.md': reviewAgentGuards,
  'sentinel.md': reviewAgentGuards,
  'scout.md': { Read: ['read-size-guard'] },
  'scribe.md': { Bash: ['destructive-guard'] },
  'smith.md': { 'Bash|PowerShell': ['destructive-guard'] }
};

function renderClaudeAgent(raw: string, file: string, hookPath: string): string {
  let content = raw;
  const binName = nativeHookBinName();
  if (Object.hasOwn(claudeAgentGuards, file)) {
    const groups = Object.entries(claudeAgentGuards[file]).flatMap(([matcher, subcommands]) => [
      `    - matcher: "${matcher}"`,
      '      hooks:',
      ...subcommands.flatMap(sub => [
        '        - type: command',
        `          command: '"${hookPath.replaceAll("'", "''")}/${binName}" ${sub}'`
      ])
    ]);
    const hooks = ['hooks:', '  PreToolUse:', ...groups].join('\n');
    content = raw.replace(/^(---\r?\n[\s\S]*?)(?=^---\r?$)/m, (_, header) => `${header}${hooks}\n`);
  }
  return file === 'oathkeeper.md' ? content.replaceAll('oathbound:', '') : content;
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

function removeLegacyAgyRtkHooks(config: any): void {
  for (const group of [config, config.hooks, config['rtk-rewrite']]) {
    if (!Array.isArray(group?.PreToolUse)) continue;
    group.PreToolUse = group.PreToolUse.flatMap((entry: any) => {
      if (!Array.isArray(entry?.hooks)) return [entry];
      const hooks = entry.hooks.filter((hook: any) => {
        const command = hook?.command;
        return typeof command !== 'string' ||
          !(command.trim() === 'rtk hook agy' ||
            /(?:^|[\\/])oathbound-hook(?:\.exe)?"?\s+rtk-hook\s*$/i.test(command));
      });
      return hooks.length === 0 && entry.hooks.length > 0 ? [] : [{ ...entry, hooks }];
    });
  }
}

function moveFolderSafely(srcDir: string, destDir: string): void {
  if (!fs.lstatSync(srcDir, { throwIfNoEntry: false })) return;
  const parent = path.dirname(destDir);
  fs.mkdirSync(parent, { recursive: true });
  if (!fs.lstatSync(parent).isDirectory()) throw new Error(`Invalid skill backup directory: ${parent}`);
  const destination = fs.lstatSync(destDir, { throwIfNoEntry: false })
    ? path.join(fs.mkdtempSync(path.join(parent, '.local-backup-')), path.basename(destDir))
    : destDir;
  fs.renameSync(srcDir, destination);
}

function install(options: InstallOptions) {
  const isGlobal = Boolean(options.global);
  const runner = options.runner || 'all';
  if (!ALLOWED_RUNNERS.includes(runner)) {
    throw new Error(`Unsupported runner: ${runner}`);
  }
  if (isGlobal && options.auditDocs) {
    throw new Error('--audit-docs is only available for project installations.');
  }
  if (isGlobal && options.statusline) {
    throw new Error('--statusline is only available for project installations.');
  }

  const sourceRoot = path.resolve(options.sourceRoot || path.join(__dirname, '..'));
  const targetRoot = path.resolve(
    options.root || (isGlobal ? (options.homeDir || os.homedir()) : (options.project || process.cwd()))
  );
  const userHome = path.resolve(options.homeDir || (isGlobal ? targetRoot : os.homedir()));
  const targetPosix = targetRoot.split(path.sep).join('/');

  const claudeHomePosix = targetPosix;
  const claudeHookPath = escapeClaudeHookPath(claudeHomePosix);

  const manifestRelPath = runner === 'codex'
    ? '.oathbound/codex-manifest.json'
    : isGlobal ? '.oathbound/global-manifest.json' : '.oathbound/manifest.json';
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
  // Earlier manifests could attribute preserved local files to the package.
  if (oldManifest?.schema === 2 && Array.isArray(oldManifest.files)) {
    for (const f of oldManifest.files) {
      oldFilesMap.set(f.path, f.sha256);
    }
  }

  const legacyRemovals: string[] = [];
  // Plan legacy agent cleanup for --upgrade.
  if (options.upgrade && runner !== 'codex') {
    const legacyDirs = isGlobal ? [
      ...(runner !== 'agy' ? [path.join(targetRoot, '.claude', 'agents')] : []),
      ...(runner !== 'claude' ? [path.join(targetRoot, '.gemini', 'config', 'agents')] : [])
    ] : [
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
            legacyRemovals.push(legacyFile);
          }
        }
      }
    }
  }

  // Skill deduplication
  const skillsSourceDir = path.join(sourceRoot, 'skills');
  const agyExclusiveSkillsDir = path.join(sourceRoot, 'agy', 'config', 'skills');
  const claudeExclusiveSkillsDir = path.join(sourceRoot, 'claude', 'skills');
  const listSkillDirs = (dir: string) => (fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true })
        .filter((d: any) => d.isDirectory())
        .map((d: any) => d.name)
    : []);
  const availableSkills = listSkillDirs(skillsSourceDir);
  const availableAgyExclusiveSkills = listSkillDirs(agyExclusiveSkillsDir);
  const availableClaudeExclusiveSkills = listSkillDirs(claudeExclusiveSkillsDir);

  const dedupeActive = options.dedupeSkills !== false;
  const skipProjectClaudeSkills = new Set<string>();
  const skipProjectAgySkills = new Set<string>();
  const disabledSkillsForAgy = new Set<string>(['_disabled']);
  const skillMoves: Array<[string, string]> = [];

  if (dedupeActive && runner !== 'codex') {
    if (!isGlobal) {
      for (const skill of availableSkills) {
        const inClaudeGlobal = fs.existsSync(path.join(userHome, '.claude', 'skills', skill));
        const inAgyGlobal = fs.existsSync(path.join(userHome, '.gemini', 'config', 'skills', skill));

        if (inClaudeGlobal || inAgyGlobal) {
          if (inClaudeGlobal && runner !== 'agy') {
            skipProjectClaudeSkills.add(skill);
            const looseClaude = path.join(targetRoot, '.claude', 'skills', skill);
            skillMoves.push([looseClaude, path.join(targetRoot, '.claude', 'skills', '_disabled', skill)]);
          }
          if (inAgyGlobal && runner === 'agy') {
            skipProjectAgySkills.add(skill);
            const looseAgy = path.join(targetRoot, '.agents', 'skills', skill);
            skillMoves.push([looseAgy, path.join(targetRoot, '.agents', 'skills', '_disabled', skill)]);
            disabledSkillsForAgy.add(skill);
          }
        }
      }

      if (runner === 'claude' || runner === 'all') {
        for (const skill of availableClaudeExclusiveSkills) {
          if (fs.existsSync(path.join(userHome, '.claude', 'skills', skill))) {
            skipProjectClaudeSkills.add(skill);
            const looseClaude = path.join(targetRoot, '.claude', 'skills', skill);
            skillMoves.push([looseClaude, path.join(targetRoot, '.claude', 'skills', '_disabled', skill)]);
          }
        }
      }

      if (runner === 'agy' || runner === 'all') {
        for (const skill of availableAgyExclusiveSkills) {
          if (fs.existsSync(path.join(userHome, '.gemini', 'config', 'skills', skill))) {
            skipProjectAgySkills.add(skill);
            const looseAgy = path.join(targetRoot, '.agents', 'skills', skill);
            skillMoves.push([looseAgy, path.join(targetRoot, '.agents', 'skills', '_disabled', skill)]);
            disabledSkillsForAgy.add(skill);
          }
        }
      }

      // For project runner all: disable .agents/skills duplicates when installed in .claude/skills
      if (runner === 'all') {
        for (const skill of availableSkills) {
          skipProjectAgySkills.add(skill);
          disabledSkillsForAgy.add(skill);
          const looseAgy = path.join(targetRoot, '.agents', 'skills', skill);
          skillMoves.push([looseAgy, path.join(targetRoot, '.agents', 'skills', '_disabled', skill)]);
        }
      }
    }
  }

  const plannedFiles = new Map<string, { content: Buffer | string; isMerge?: boolean }>();

  if (runner === 'codex') {
    if (isGlobal) {
      plannedFiles.set('.codex/oathkeeper.config.toml', {
        content: fs.readFileSync(path.join(sourceRoot, 'codex', 'oathkeeper.config.toml'))
      });
      const nativeHookSrc = findNativeHookBinary(sourceRoot);
      const nativeBinName = nativeHookBinName();
      plannedFiles.set(`.codex/hooks/${nativeBinName}`, { content: fs.readFileSync(nativeHookSrc) });

      const codexHooksTemplatePath = path.join(sourceRoot, 'codex', 'hooks.json');
      if (fs.existsSync(codexHooksTemplatePath)) {
        const codexHookBin = `"${claudeHookPath}/.codex/hooks/${nativeBinName}"`;
        const templateHooks = JSON.parse(fs.readFileSync(codexHooksTemplatePath, 'utf8'));
        for (const groups of Object.values(templateHooks.hooks || {}) as any[]) {
          if (!Array.isArray(groups)) continue;
          for (const entry of groups) {
            if (!Array.isArray(entry?.hooks)) continue;
            for (const hook of entry.hooks) {
              if (typeof hook?.command === 'string' && hook.command.startsWith('oathbound-hook ')) {
                hook.command = `${codexHookBin} ${hook.command.slice('oathbound-hook '.length)}`;
              }
            }
          }
        }
        const destCodexHooksPath = path.join(targetRoot, '.codex', 'hooks.json');
        const existingCodexHooks = readExistingJson(destCodexHooksPath, {});
        const migrated = migrateLegacyOathboundHooks(existingCodexHooks, {
          'agent-audit': null,
          'readonly-guard': null,
          'read-size-guard': null,
          'destructive-guard': `${codexHookBin} destructive-guard`
        });
        const mergedCodexHooks = {
          ...migrated.config,
          hooks: mergeHookEvents(migrated.config?.hooks, templateHooks.hooks)
        };
        plannedFiles.set('.codex/hooks.json', {
          content: JSON.stringify(mergedCodexHooks, null, 2) + '\n',
          isMerge: true
        });
      }
    }
    const agentsDir = path.join(sourceRoot, 'codex', 'agents');
    for (const file of fs.readdirSync(agentsDir).filter(file => file.endsWith('.toml'))) {
      plannedFiles.set(`.codex/agents/${file}`, { content: fs.readFileSync(path.join(agentsDir, file)) });
    }
  }

  // --- Runner Claude ---
  if (runner === 'all' || runner === 'claude') {
    const hookDir = isGlobal ? '.oathbound/claude-hooks' : '.claude/hooks';
    const claudePluginInstalled = isGlobal && fs.existsSync(path.join(targetRoot, '.claude', 'plugins', 'cache', 'oathbound'));
    const skipGlobalClaudePluginAssets = isGlobal && (Boolean(options.hooksOnly) || claudePluginInstalled);
    const agentsDir = path.join(sourceRoot, 'claude', 'agents');
    if (!skipGlobalClaudePluginAssets && fs.existsSync(agentsDir)) {
      for (const file of fs.readdirSync(agentsDir)) {
        if (file.endsWith('.md')) {
          const raw = fs.readFileSync(path.join(agentsDir, file), 'utf8');
          const processed = renderClaudeAgent(raw, file, `${claudeHookPath}/${hookDir}`);
          plannedFiles.set(`.claude/agents/${file}`, { content: processed });
        }
      }
    }
    const nativeHookSrc = findNativeHookBinary(sourceRoot);
    const nativeBinName = nativeHookBinName();
    plannedFiles.set(`${hookDir}/${nativeBinName}`, { content: fs.readFileSync(nativeHookSrc) });
    const hooksDir = path.join(sourceRoot, 'claude', 'hooks');
    if (!isGlobal && fs.existsSync(hooksDir)) {
      for (const file of fs.readdirSync(hooksDir)) {
        if (file.endsWith('.js')) {
          plannedFiles.set(`${hookDir}/${file}`, { content: fs.readFileSync(path.join(hooksDir, file)) });
        }
      }
    }
    if (!skipGlobalClaudePluginAssets) {
      for (const [baseDir, skillList] of [
        [skillsSourceDir, availableSkills],
        [claudeExclusiveSkillsDir, availableClaudeExclusiveSkills],
      ] as Array<[string, string[]]>) {
        for (const skill of skillList) {
          if (!isGlobal && skipProjectClaudeSkills.has(skill)) continue;
          const skillDir = path.join(baseDir, skill);
          for (const { rel, full } of collectSkillFilesForRunner(skillDir, 'claude')) {
            plannedFiles.set(`.claude/skills/${skill}/${rel}`, { content: fs.readFileSync(full) });
          }
        }
      }
    }
    if (isGlobal && options.upgrade) {
      const destSettingsPath = path.join(targetRoot, '.claude', 'settings.json');
      if (fs.existsSync(destSettingsPath)) {
        const raw = fs.readFileSync(destSettingsPath, 'utf8').trim();
        let existingSettings: any = null;
        if (raw.startsWith('{')) {
          try { existingSettings = JSON.parse(raw); } catch (_) { existingSettings = null; }
        }
        if (existingSettings) {
          const hookCmd = `"${claudeHookPath}/${hookDir}/${nativeBinName}"`;
          const migrated = migrateLegacyOathboundHooks(existingSettings, {
            'agent-audit': `${hookCmd} agent-audit`,
            'readonly-guard': `${hookCmd} readonly-guard`,
            'read-size-guard': `${hookCmd} read-size-guard`,
            'destructive-guard': `${hookCmd} destructive-guard`
          });
          if (migrated.changed) {
            plannedFiles.set('.claude/settings.json', {
              content: JSON.stringify(migrated.config, null, 2) + '\n',
              isMerge: true
            });
          }
        }
      }
    }
    if (!isGlobal) {
      const incomingSettingsPath = path.join(sourceRoot, 'claude', 'settings.json');
      let incomingSettings: any = {};
      if (fs.existsSync(incomingSettingsPath)) {
        let raw = fs.readFileSync(incomingSettingsPath, 'utf8').replaceAll('__HOME__', () => escapeJsonString(claudeHookPath));
        if (nativeBinName !== 'oathbound-hook') {
          raw = raw.replaceAll('/.claude/hooks/oathbound-hook\\"', `/.claude/hooks/${nativeBinName}\\"`);
        }
        try { incomingSettings = JSON.parse(raw); } catch (_) {}
      }
      const destSettingsPath = path.join(targetRoot, '.claude', 'settings.json');
      const existingSettings: any = readExistingJson(destSettingsPath, {});
      const mergedClaude = mergeClaudeSettings(existingSettings, incomingSettings, Boolean(options.statusline), claudeHomePosix);

      plannedFiles.set('.claude/settings.json', {
        content: JSON.stringify(mergedClaude, null, 2) + '\n',
        isMerge: true
      });
    }
  }

  // --- Runner Agy ---
  if (runner === 'all' || runner === 'agy') {
    const agyPluginInstalled = isGlobal && fs.existsSync(path.join(targetRoot, '.gemini', 'config', 'plugins', 'oathbound'));
    const skipGlobalAgyPluginAssets = isGlobal && (Boolean(options.hooksOnly) || agyPluginInstalled);
    const agentDir = isGlobal ? '.gemini/config/agents' : '.agents/agents';
    const agyAgentsDir = path.join(sourceRoot, 'agy', 'config', 'agents');
    if (!skipGlobalAgyPluginAssets && fs.existsSync(agyAgentsDir)) {
      for (const file of fs.readdirSync(agyAgentsDir)) {
        if (file.endsWith('.md')) {
          const raw = fs.readFileSync(path.join(agyAgentsDir, file), 'utf8');
          const processed = raw.replaceAll('__HOME__', targetPosix);
          plannedFiles.set(`${agentDir}/${file}`, { content: processed });
        }
      }
    }
    const agySkillDir = isGlobal ? '.gemini/config/skills' : '.agents/skills';
    if (!skipGlobalAgyPluginAssets) {
      for (const [baseDir, skillList] of [
        [skillsSourceDir, availableSkills],
        [agyExclusiveSkillsDir, availableAgyExclusiveSkills],
      ] as Array<[string, string[]]>) {
        for (const skill of skillList) {
          if (!isGlobal && skipProjectAgySkills.has(skill)) continue;
          const skillDir = path.join(baseDir, skill);
          for (const { rel, full } of collectSkillFilesForRunner(skillDir, 'agy')) {
            plannedFiles.set(`${agySkillDir}/${skill}/${rel}`, { content: fs.readFileSync(full) });
          }
        }
      }
    }
    if (!isGlobal) {
      const incomingHooksPath = path.join(sourceRoot, 'agy', 'config', 'hooks.json');
      const incomingHooks = readExistingJson(incomingHooksPath, {});
      const destHooksPath = path.join(targetRoot, '.agents', 'hooks.json');
      const existingHooks: any = readExistingJson(destHooksPath, {});
      removeLegacyAgyRtkHooks(existingHooks);
      const mergedHooks = mergeDeep(existingHooks, incomingHooks);
      plannedFiles.set('.agents/hooks.json', {
        content: JSON.stringify(mergedHooks, null, 2) + '\n',
        isMerge: true
      });

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

  // For project --audit-docs: copy tools/audit-docs.{ts,core.ts,sources.ts} and create a neutral audit-docs.config.js
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

  // Apply changes and build the new manifest
  for (const [from, to] of skillMoves) moveFolderSafely(from, to);
  for (const file of legacyRemovals) fs.unlinkSync(file);
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

  let pruneResult: { removed: string[]; kept: string[]; skipped: string[] } | undefined;
  if (isGlobal) {
    const { pruneOldVersions } = require('./prune-old-versions.cjs');
    if (options.prune) {
      pruneResult = pruneOldVersions({ keep: manifestData.version, home: targetRoot, apply: true });
    } else if (options.upgrade) {
      const pendingPrune = pruneOldVersions({ keep: manifestData.version, home: targetRoot, apply: false });
      if (pendingPrune.removed.length > 0) {
        console.log(`Old versions eligible for pruning (${pendingPrune.removed.length}): run \`node tools/prune-old-versions.cjs --apply\` or pass \`--prune\`.`);
      }
    }
  }

  return {
    targetRoot,
    manifestPath: manifestFullPath,
    manifest: manifestData,
    installedFiles,
    ...(pruneResult ? { prune: pruneResult } : {})
  };
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = install(options);
    console.log(`Oathbound successfully installed in: ${result.targetRoot}`);
    console.log(`Manifest generated at: ${result.manifestPath}`);
    if (options.global && options.runner === 'codex') {
      console.log('Codex hooks updated in .codex/hooks.json. Run /hooks in Codex CLI to trust them.');
    }
    if (result.prune) {
      console.log(`Pruned ${result.prune.removed.length} old version(s).`);
      for (const item of result.prune.removed) console.log(`  ${item}`);
    }
  } catch (err: any) {
    console.error(`Installation error: ${err.message}`);
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
