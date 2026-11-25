'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pruneOldVersions, compareVersions, parseCliArgs } = require('../tools/prune-old-versions.cjs');

const CACHE = '.claude/plugins/cache/oathbound/oathbound';
const MARKET = '.oathbound/marketplaces';

function makeHome(entries) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-'));
  for (const rel of entries) {
    fs.mkdirSync(path.join(home, rel), { recursive: true });
    fs.writeFileSync(path.join(home, rel, 'marker.txt'), 'x');
  }
  return home;
}

const exists = (home, rel) => fs.existsSync(path.join(home, rel));

test('compareVersions orders pre-releases numerically and ranks a release above its pre-releases', () => {
  assert.equal(compareVersions('0.50.0-alpha.9', '0.50.0-alpha.10'), -1);
  assert.equal(compareVersions('0.50.0-alpha.53', '0.50.0-alpha.53'), 0);
  assert.equal(compareVersions('0.50.0', '0.50.0-alpha.53'), 1);
  assert.equal(compareVersions('0.51.0-alpha.1', '0.50.0'), 1);
});

test('dry run lists old versions and removes nothing', () => {
  const home = makeHome([`${CACHE}/0.50.0-alpha.50`, `${CACHE}/0.50.0-alpha.53`]);
  const result = pruneOldVersions({ keep: '0.50.0-alpha.53', home });
  assert.equal(result.removed.length, 1);
  assert.ok(result.removed[0].endsWith('0.50.0-alpha.50'));
  assert.ok(exists(home, `${CACHE}/0.50.0-alpha.50`));
});

test('apply removes older versions in every root and keeps the current one', () => {
  const home = makeHome([
    `${CACHE}/0.50.0-alpha.43`, `${CACHE}/0.50.0-alpha.53`,
    `${MARKET}/oathbound-0.50.0-alpha.49`, `${MARKET}/oathbound-0.50.0-alpha.53`,
    '.oathbound/downloads/0.50.0-alpha.52', '.oathbound/downloads/0.50.0-alpha.53',
  ]);
  const result = pruneOldVersions({ keep: '0.50.0-alpha.53', home, apply: true });
  assert.equal(result.removed.length, 3);
  assert.ok(!exists(home, `${CACHE}/0.50.0-alpha.43`));
  assert.ok(!exists(home, `${MARKET}/oathbound-0.50.0-alpha.49`));
  assert.ok(!exists(home, '.oathbound/downloads/0.50.0-alpha.52'));
  assert.ok(exists(home, `${CACHE}/0.50.0-alpha.53/marker.txt`));
  assert.ok(exists(home, `${MARKET}/oathbound-0.50.0-alpha.53/marker.txt`));
});

test('a root without the kept version is left untouched', () => {
  const home = makeHome([`${CACHE}/0.50.0-alpha.48`, `${CACHE}/0.50.0-alpha.50`]);
  const result = pruneOldVersions({ keep: '0.50.0-alpha.53', home, apply: true });
  assert.equal(result.removed.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.ok(exists(home, `${CACHE}/0.50.0-alpha.48`));
  assert.ok(exists(home, `${CACHE}/0.50.0-alpha.50`));
});

test('newer versions, unrelated names and plain files are never removed', () => {
  const home = makeHome([`${CACHE}/0.50.0-alpha.53`, `${CACHE}/0.50.0-alpha.60`, `${CACHE}/custom`]);
  fs.writeFileSync(path.join(home, CACHE, '0.50.0-alpha.1'), 'not a directory');
  const result = pruneOldVersions({ keep: '0.50.0-alpha.53', home, apply: true });
  assert.equal(result.removed.length, 0);
  assert.ok(exists(home, `${CACHE}/0.50.0-alpha.60`));
  assert.ok(exists(home, `${CACHE}/custom`));
  assert.ok(exists(home, `${CACHE}/0.50.0-alpha.1`));
});

test('a directory still named in a CLI config file is kept, whatever the path style', () => {
  const home = makeHome([
    `${MARKET}/oathbound-0.50.0-alpha.48`, `${MARKET}/oathbound-0.50.0-alpha.49`,
    `${MARKET}/oathbound-0.50.0-alpha.5`, `${MARKET}/oathbound-0.50.0-alpha.53`,
  ]);
  const plugins = path.join(home, '.claude/plugins');
  fs.mkdirSync(plugins, { recursive: true });
  const old48 = path.join(home, MARKET, 'oathbound-0.50.0-alpha.48', 'claude');
  fs.writeFileSync(path.join(plugins, 'known_marketplaces.json'), JSON.stringify({ installLocation: old48 }));
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  const old49 = path.join(home, MARKET, 'oathbound-0.50.0-alpha.49').replace(/\\/g, '/');
  fs.writeFileSync(path.join(home, '.codex/config.toml'), `source = '${old49}'\n`);
  const result = pruneOldVersions({ keep: '0.50.0-alpha.53', home, apply: true });
  assert.ok(exists(home, `${MARKET}/oathbound-0.50.0-alpha.48`));
  assert.ok(exists(home, `${MARKET}/oathbound-0.50.0-alpha.49`));
  assert.equal(result.skipped.filter(item => item.includes('still referenced')).length, 2);
  // `alpha.5` is a prefix of `alpha.53` but nothing names it, so it is removed.
  assert.ok(!exists(home, `${MARKET}/oathbound-0.50.0-alpha.5`));
});

test('rejects an invalid version and unknown arguments', () => {
  assert.throws(() => pruneOldVersions({ keep: '../x', home: os.tmpdir() }), /Usage/);
  assert.throws(() => parseCliArgs(['--force']), /Unknown argument/);
  assert.throws(() => parseCliArgs(['--keep']), /Missing value/);
  assert.deepEqual(parseCliArgs(['--keep', '1.2.3', '--apply']), { keep: '1.2.3', home: '', apply: true });
});
