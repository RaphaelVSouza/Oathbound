const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { parseArgs, upgradeGlobal } = require('../tools/upgrade-global.ts');

test('upgrade-global parseArgs handles flags and rejects invalid options', () => {
  assert.deepEqual(parseArgs([]), { runner: 'all', buildHook: false, noPrune: false });
  assert.deepEqual(parseArgs(['--runner', 'codex', '--build-hook', '--no-prune']), {
    runner: 'codex',
    buildHook: true,
    noPrune: true
  });
  assert.throws(() => parseArgs(['--runner', 'invalid']), /Unsupported runner/);
  assert.throws(() => parseArgs(['--unknown']), /Unknown or incomplete option/);
});

test('upgradeGlobal builds marketplaces, updates installed CLIs, runs install, and prunes old versions', t => {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-ug-src-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-ug-home-'));
  t.after(() => {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });

  fs.writeFileSync(path.join(sourceRoot, 'VERSION'), '0.50.0-alpha.56\n');
  const oldMarketplace = path.join(home, '.oathbound', 'marketplaces', 'oathbound-0.50.0-alpha.55');
  fs.mkdirSync(oldMarketplace, { recursive: true });

  const builtCalls: Array<{ runner: string; dest: string }> = [];
  const executedCommands: string[] = [];
  const installCalls: any[] = [];

  const result = upgradeGlobal(
    { runner: 'all', home, sourceRoot },
    {
      findNativeHookBinary: () => path.join(sourceRoot, 'native-stub'),
      buildPlugin: (runner: 'claude' | 'agy' | 'codex', dest: string) => {
        builtCalls.push({ runner, dest });
        fs.mkdirSync(dest, { recursive: true });
        fs.writeFileSync(path.join(dest, `${runner}.marker`), 'ok');
        return dest;
      },
      resolveCli: (runner: 'claude' | 'agy' | 'codex') => (runner === 'agy' ? null : `${runner}-cli`),
      runCommand: (bin: string, args: string[]) => {
        executedCommands.push(`${bin} ${args.join(' ')}`);
        return { ok: true, stdout: '', stderr: '', status: 0 };
      },
      install: (opts: any) => {
        installCalls.push(opts);
        return { targetRoot: opts.homeDir, manifest: { version: '0.50.0-alpha.56', files: [] } };
      }
    }
  );

  assert.equal(result.version, '0.50.0-alpha.56');
  assert.deepEqual(builtCalls.map(c => c.runner), ['claude', 'agy', 'codex']);
  assert.equal(fs.existsSync(path.join(result.marketplaceRoot, 'claude', 'claude.marker')), true);
  assert.equal(fs.existsSync(path.join(result.marketplaceRoot, 'codex', 'codex.marker')), true);
  assert.deepEqual(fs.readdirSync(path.join(sourceRoot, '.scratch')), []);

  assert.equal(result.plugins.find((p: any) => p.runner === 'claude').status, 'updated');
  assert.equal(result.plugins.find((p: any) => p.runner === 'agy').status, 'skipped');
  assert.equal(result.plugins.find((p: any) => p.runner === 'codex').status, 'updated');

  assert.ok(executedCommands.some(c => c.startsWith('claude-cli plugin install oathbound@oathbound')));
  assert.ok(executedCommands.some(c => c.startsWith('codex-cli plugin add oathbound@oathbound-local')));

  assert.deepEqual(
    installCalls.map(c => c.runner),
    ['all', 'codex']
  );

  // Old 0.50.0-alpha.55 marketplace dir was pruned after new 0.50.0-alpha.56 was created.
  assert.equal(fs.existsSync(oldMarketplace), false);
  assert.equal(fs.existsSync(result.marketplaceRoot), true);
  assert.equal(result.prune?.removed.length, 1);
});
