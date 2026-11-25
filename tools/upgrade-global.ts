// Global Oathbound updater: builds plugins, reinstalls CLI plugins, runs install.ts, and prunes old versions.
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 24) {
  console.error(`Oathbound global updater requires Node.js >= 24; found ${process.versions.node}.`);
  process.exit(1);
}

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { buildPlugin, findNativeHookBinary } = require('./build-plugin.cjs');
const { install } = require('./install.ts');
const { pruneOldVersions } = require('./prune-old-versions.cjs');

type RunnerName = 'claude' | 'agy' | 'codex';
type RunnerOption = 'all' | RunnerName;

interface UpgradeOptions {
  runner: RunnerOption;
  buildHook: boolean;
  noPrune: boolean;
  home?: string;
  sourceRoot?: string;
}

interface CliRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  status: number;
}

interface UpgradeDeps {
  buildPlugin?: (runner: RunnerName, destination: string) => string;
  findNativeHookBinary?: (sourceRoot?: string) => string;
  install?: (options: any) => any;
  pruneOldVersions?: (options: { keep: string; home?: string; apply?: boolean }) => {
    removed: string[];
    kept: string[];
    skipped: string[];
  };
  resolveCli?: (name: RunnerName, home: string) => string | null;
  runCommand?: (bin: string, args: string[], cwd: string, allowFailure?: boolean) => CliRunResult;
}

interface RunnerPluginStatus {
  runner: RunnerName;
  status: 'updated' | 'skipped';
  reason?: string;
  commands?: string[];
}

const ALLOWED_RUNNERS: RunnerOption[] = ['all', 'claude', 'agy', 'codex'];

function parseArgs(argv: string[]): UpgradeOptions {
  const options: UpgradeOptions = {
    runner: 'all',
    buildHook: false,
    noPrune: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--runner') {
      const value = argv[++i];
      if (!value || value.startsWith('-')) throw new Error('Missing value for --runner');
      const normalized = value.toLowerCase() as RunnerOption;
      if (!ALLOWED_RUNNERS.includes(normalized)) throw new Error(`Unsupported runner: ${value}`);
      options.runner = normalized;
    } else if (arg.startsWith('--runner=')) {
      const value = arg.slice('--runner='.length).toLowerCase() as RunnerOption;
      if (!ALLOWED_RUNNERS.includes(value)) throw new Error(`Unsupported runner: ${value}`);
      options.runner = value;
    } else if (arg === '--build-hook') {
      options.buildHook = true;
    } else if (arg === '--no-prune') {
      options.noPrune = true;
    } else if (arg === '--home') {
      const value = argv[++i];
      if (!value || value.startsWith('-')) throw new Error('Missing value for --home');
      options.home = path.resolve(value);
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node tools/upgrade-global.ts [--runner <all|claude|agy|codex>] [--build-hook] [--no-prune] [--home <dir>]');
      process.exit(0);
    } else {
      throw new Error(`Unknown or incomplete option: ${arg}`);
    }
  }

  return options;
}

function defaultRunCommand(bin: string, args: string[], cwd: string, allowFailure = false): CliRunResult {
  try {
    const stdout = execFileSync(bin, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return { ok: true, stdout: stdout || '', stderr: '', status: 0 };
  } catch (err: any) {
    const status = typeof err.status === 'number' ? err.status : 1;
    const stdout = err.stdout ? String(err.stdout) : '';
    const stderr = err.stderr ? String(err.stderr) : (err.message || '');
    if (allowFailure) {
      return { ok: false, stdout, stderr, status };
    }
    throw new Error(`Command failed (${bin} ${args.join(' ')}): ${stderr || stdout || `exit ${status}`}`);
  }
}

function defaultResolveCli(name: RunnerName, home: string): string | null {
  const isWin = process.platform === 'win32';
  const locator = isWin ? 'where.exe' : 'which';
  const probe = defaultRunCommand(locator, [name], process.cwd(), true);
  if (probe.ok) {
    const first = probe.stdout.split(/\r?\n/).map(line => line.trim()).find(Boolean);
    if (first && fs.existsSync(first)) return first;
  }
  if (!isWin) return null;

  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const candidates: Record<RunnerName, string[]> = {
    claude: [path.join(home, '.local', 'bin', 'claude.exe')],
    agy: [path.join(localAppData, 'agy', 'bin', 'agy.exe')],
    codex: [path.join(localAppData, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe')]
  };
  for (const candidate of candidates[name]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function selectedRunners(runner: RunnerOption): RunnerName[] {
  return runner === 'all' ? ['claude', 'agy', 'codex'] : [runner];
}

function updateCliPlugin(
  runner: RunnerName,
  cliBin: string,
  marketplaceDir: string,
  cwd: string,
  runCmd: (bin: string, args: string[], cwd: string, allowFailure?: boolean) => CliRunResult
): string[] {
  const executed: string[] = [];
  const invoke = (args: string[], allowFailure = false) => {
    executed.push(`${cliBin} ${args.join(' ')}`);
    return runCmd(cliBin, args, cwd, allowFailure);
  };

  if (runner === 'claude') {
    const claudeDir = path.join(marketplaceDir, 'claude');
    invoke(['plugin', 'validate', claudeDir]);
    invoke(['plugin', 'uninstall', 'oathbound@oathbound'], true);
    invoke(['plugin', 'marketplace', 'remove', 'oathbound'], true);
    invoke(['plugin', 'marketplace', 'add', claudeDir]);
    invoke(['plugin', 'install', 'oathbound@oathbound']);
  } else if (runner === 'agy') {
    const agyDir = path.join(marketplaceDir, 'agy');
    invoke(['plugin', 'validate', agyDir]);
    invoke(['plugin', 'uninstall', 'oathbound'], true);
    invoke(['plugin', 'install', agyDir]);
  } else {
    const codexDir = path.join(marketplaceDir, 'codex');
    invoke(['plugin', 'remove', 'oathbound@oathbound-local'], true);
    invoke(['plugin', 'marketplace', 'remove', 'oathbound-local'], true);
    invoke(['plugin', 'marketplace', 'add', codexDir]);
    invoke(['plugin', 'add', 'oathbound@oathbound-local']);
  }
  return executed;
}

/**
 * Upgrade Oathbound globally across selected CLIs: build packages, reinstall plugins,
 * run `install.ts --global --upgrade`, and optionally prune old version directories.
 */
function upgradeGlobal(options: Partial<UpgradeOptions> = {}, deps: UpgradeDeps = {}) {
  const sourceRoot = path.resolve(options.sourceRoot || path.resolve(__dirname, '..'));
  const home = path.resolve(options.home || os.homedir());
  const runner: RunnerOption = options.runner || 'all';
  const runners = selectedRunners(runner);

  const runCmd = deps.runCommand || defaultRunCommand;
  const resolveCli = deps.resolveCli || defaultResolveCli;
  const buildFn = deps.buildPlugin || buildPlugin;
  const findHookFn = deps.findNativeHookBinary || findNativeHookBinary;
  const installFn = deps.install || install;
  const pruneFn = deps.pruneOldVersions || pruneOldVersions;

  if (options.buildHook) {
    runCmd('cargo', ['build', '--locked', '--release', '--manifest-path', 'native/oathbound-hook/Cargo.toml'], sourceRoot);
  }

  if (runners.includes('claude') || runners.includes('codex')) {
    findHookFn(sourceRoot);
  }

  const version = fs.readFileSync(path.join(sourceRoot, 'VERSION'), 'utf8').trim();
  const stageRoot = path.join(sourceRoot, '.scratch', `upgrade-global-${process.pid}-${Date.now()}`);
  const marketplaceRoot = path.join(home, '.oathbound', 'marketplaces', `oathbound-${version}`);

  const pluginStatuses: RunnerPluginStatus[] = [];

  try {
    fs.mkdirSync(stageRoot, { recursive: true });
    for (const r of runners) {
      buildFn(r, path.join(stageRoot, r));
    }

    fs.mkdirSync(path.dirname(marketplaceRoot), { recursive: true });
    for (const r of runners) {
      const targetSubdir = path.join(marketplaceRoot, r);
      fs.rmSync(targetSubdir, { recursive: true, force: true });
      fs.cpSync(path.join(stageRoot, r), targetSubdir, { recursive: true });
    }

    for (const r of runners) {
      const cliBin = resolveCli(r, home);
      if (!cliBin) {
        pluginStatuses.push({ runner: r, status: 'skipped', reason: `${r} CLI not found` });
        continue;
      }
      const commands = updateCliPlugin(r, cliBin, marketplaceRoot, sourceRoot, runCmd);
      pluginStatuses.push({ runner: r, status: 'updated', commands });
    }
  } finally {
    fs.rmSync(stageRoot, { recursive: true, force: true });
  }

  const installResults: any[] = [];
  const hasClaude = runners.includes('claude');
  const hasAgy = runners.includes('agy');
  if (hasClaude || hasAgy) {
    const installRunner = hasClaude && hasAgy ? 'all' : (hasClaude ? 'claude' : 'agy');
    installResults.push(installFn({
      global: true,
      runner: installRunner,
      upgrade: true,
      homeDir: home,
      sourceRoot
    }));
  }
  if (runners.includes('codex')) {
    installResults.push(installFn({
      global: true,
      runner: 'codex',
      upgrade: true,
      homeDir: home,
      sourceRoot
    }));
  }

  const pruneResult = options.noPrune
    ? null
    : pruneFn({ keep: version, home, apply: true });

  return {
    version,
    marketplaceRoot,
    plugins: pluginStatuses,
    installs: installResults,
    prune: pruneResult
  };
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = upgradeGlobal(options);
    console.log(`Oathbound ${result.version} upgraded globally from ${result.marketplaceRoot}`);
    for (const item of result.plugins) {
      if (item.status === 'updated') {
        console.log(`  [${item.runner}] plugin updated`);
      } else {
        console.log(`  [${item.runner}] skipped (${item.reason})`);
      }
    }
    if (result.plugins.some(p => p.runner === 'codex' && p.status === 'updated')) {
      console.log('Codex hooks updated in .codex/hooks.json. Run /hooks in Codex CLI to trust them.');
    }
    if (result.prune) {
      console.log(`Pruned ${result.prune.removed.length} old version(s).`);
      for (const removed of result.prune.removed) console.log(`  ${removed}`);
      for (const skipped of result.prune.skipped) console.log(`  Skipped: ${skipped}`);
    }
  } catch (err: any) {
    console.error(`Global upgrade error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { parseArgs, upgradeGlobal, defaultResolveCli, selectedRunners };
