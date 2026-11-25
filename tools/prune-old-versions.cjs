'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SEMVER = '\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?';
const SEMVER_RE = new RegExp(`^${SEMVER}$`);

// Version directories left behind by reinstalls, relative to the home directory.
// `prefix` is the part of the directory name before the version.
const ROOTS = [
  { dir: '.oathbound/marketplaces', prefix: 'oathbound-' },
  { dir: '.oathbound/downloads', prefix: '' },
  { dir: '.claude/plugins/cache/oathbound/oathbound', prefix: '' },
  { dir: '.codex/plugins/cache/oathbound-local/oathbound', prefix: '' },
];

function compareIdentifiers(a, b) {
  const numA = /^\d+$/.test(a);
  const numB = /^\d+$/.test(b);
  if (numA && numB) return Math.sign(Number(a) - Number(b));
  if (numA) return -1;
  if (numB) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Compare two SemVer strings. Returns -1, 0 or 1. A release outranks its pre-releases. */
function compareVersions(a, b) {
  const [coreA, preA] = a.split(/-(.+)/);
  const [coreB, preB] = b.split(/-(.+)/);
  const numsA = coreA.split('.').map(Number);
  const numsB = coreB.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (numsA[i] !== numsB[i]) return numsA[i] < numsB[i] ? -1 : 1;
  }
  if (!preA && !preB) return 0;
  if (!preA) return 1;
  if (!preB) return -1;
  const idsA = preA.split('.');
  const idsB = preB.split('.');
  for (let i = 0; i < Math.max(idsA.length, idsB.length); i += 1) {
    if (idsA[i] === undefined) return -1;
    if (idsB[i] === undefined) return 1;
    const cmp = compareIdentifiers(idsA[i], idsB[i]);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Remove version directories older than `keep` from the known install locations.
 * A root is skipped when its `keep` directory is missing, so the last copy is never removed.
 * Only real directories named `<prefix><semver>` are touched; symlinks are skipped.
 * @param {{ keep: string, home?: string, apply?: boolean }} options
 * @returns {{ removed: string[], kept: string[], skipped: string[] }}
 */
function pruneOldVersions({ keep, home = os.homedir(), apply = false }) {
  if (!keep || !SEMVER_RE.test(keep)) {
    throw new Error('Usage: node tools/prune-old-versions.cjs [--keep <semver>] [--home <dir>] [--apply]');
  }
  const result = { removed: [], kept: [], skipped: [] };

  for (const { dir, prefix } of ROOTS) {
    const root = path.join(home, dir);
    if (!fs.existsSync(root)) continue;
    const keepPath = path.join(root, `${prefix}${keep}`);
    if (!fs.existsSync(keepPath)) {
      result.skipped.push(`${root}: ${prefix}${keep} not found, nothing removed`);
      continue;
    }
    const nameRe = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(${SEMVER})$`);
    for (const entry of fs.readdirSync(root).sort()) {
      const match = nameRe.exec(entry);
      if (!match) continue;
      const full = path.join(root, entry);
      if (match[1] === keep) {
        result.kept.push(full);
        continue;
      }
      if (compareVersions(match[1], keep) > 0) {
        result.skipped.push(`${full}: newer than ${keep}`);
        continue;
      }
      const stat = fs.lstatSync(full);
      if (!stat.isDirectory() || stat.isSymbolicLink() || !isInside(root, full)) {
        result.skipped.push(`${full}: not a plain directory`);
        continue;
      }
      if (apply) fs.rmSync(full, { recursive: true, force: true });
      result.removed.push(full);
    }
  }
  return result;
}

function parseCliArgs(argv) {
  const options = { keep: '', home: '', apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--keep' || arg === '--home') {
      const value = argv[i + 1];
      if (!value || value.startsWith('-')) throw new Error(`Missing value for ${arg}`);
      options[arg.slice(2)] = value;
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

if (require.main === module) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    const keep = options.keep
      || fs.readFileSync(path.resolve(__dirname, '..', 'VERSION'), 'utf8').trim();
    const result = pruneOldVersions({ keep, home: options.home || os.homedir(), apply: options.apply });
    const verb = options.apply ? 'Removed' : 'Would remove (dry run, pass --apply)';
    console.log(`Keeping ${keep}`);
    console.log(`${verb}: ${result.removed.length}`);
    for (const item of result.removed) console.log(`  ${item}`);
    for (const item of result.skipped) console.log(`Skipped: ${item}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { pruneOldVersions, compareVersions, parseCliArgs, ROOTS };
