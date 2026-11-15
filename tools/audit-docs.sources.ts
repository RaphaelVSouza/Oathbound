'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * @typedef {{ name: string, isDir: boolean, isFile: boolean }} SourceEntry
 * @typedef {{ ok: boolean, actual?: string|null }} CaseResult
 * @typedef {object} AuditSource
 * @property {string} label
 * @property {(rels: string[]) => void} preload
 * @property {(rel: string) => boolean} exists
 * @property {(rel: string) => boolean} isDir
 * @property {(rel: string) => boolean} isFile
 * @property {(rel: string) => CaseResult} exactCase
 * @property {(relDir: string) => SourceEntry[]} list
 * @property {(rel: string) => number} size
 * @property {(rel: string) => Buffer|undefined} read
 */

/** @param {string} repoRoot @returns {AuditSource} */
function createFsSource(repoRoot) {
  const dirCache = new Map();

  function readDirNames(relDir) {
    if (dirCache.has(relDir)) return dirCache.get(relDir);
    let names = null;
    try {
      names = fs.readdirSync(path.join(repoRoot, relDir));
    } catch (e) {
      names = null;
    }
    dirCache.set(relDir, names);
    return names;
  }

  return {
    label: 'working tree',
    preload() {},
    exists(rel) {
      return fs.existsSync(path.join(repoRoot, rel));
    },
    isDir(rel) {
      try {
        return fs.statSync(path.join(repoRoot, rel)).isDirectory();
      } catch (e) {
        return false;
      }
    },
    isFile(rel) {
      try {
        return fs.statSync(path.join(repoRoot, rel)).isFile();
      } catch (e) {
        return false;
      }
    },
    // Confere a caixa exata segmento a segmento (Windows/macOS aceitam caixa errada; Linux e GitHub não).
    exactCase(rel) {
      if (rel === '') return { ok: true };
      const parts = rel.split('/');
      let dir = '';
      const actual = [];
      let ok = true;
      for (const part of parts) {
        const names = readDirNames(dir);
        if (!names) return { ok: false, actual: null };
        if (names.indexOf(part) !== -1) {
          actual.push(part);
        } else {
          const lower = part.toLowerCase();
          const found = names.find(n => n.toLowerCase() === lower);
          if (!found) return { ok: false, actual: null };
          actual.push(found);
          ok = false;
        }
        dir = actual.join('/');
      }
      return { ok: ok, actual: actual.join('/') };
    },
    list(relDir) {
      const out = [];
      let entries;
      try {
        entries = fs.readdirSync(path.join(repoRoot, relDir), { withFileTypes: true });
      } catch (e) {
        return out;
      }
      for (const e of entries) {
        if (e.isSymbolicLink()) continue;
        out.push({ name: e.name, isDir: e.isDirectory(), isFile: e.isFile() });
      }
      return out;
    },
    size(rel) {
      return fs.statSync(path.join(repoRoot, rel)).size;
    },
    read(rel) {
      return fs.readFileSync(path.join(repoRoot, rel));
    }
  };
}

/**
 * @param {(args: string[], input?: string) => Buffer} git
 * @returns {AuditSource}
 */
function createIndexSource(git) {
  // Modo 100644/100755 = arquivo; 120000 = symlink e 160000 = submódulo são ignorados.
  const raw = git(['ls-files', '-s', '-z']).toString('utf8');
  const files = new Map();       // rel -> sha
  const lowerFiles = new Map();  // lower -> rel
  const dirs = new Set(['']);
  const lowerDirs = new Map([['', '']]);
  const children = new Map();    // dir -> Map(name -> isDir)

  function addChild(dir, name, isDir) {
    if (!children.has(dir)) children.set(dir, new Map());
    const m = children.get(dir);
    if (!m.has(name) || isDir) m.set(name, isDir);
  }

  for (const rec of raw.split('\0')) {
    if (!rec) continue;
    const tab = rec.indexOf('\t');
    const meta = rec.slice(0, tab).split(' ');
    const rel = rec.slice(tab + 1);
    const mode = meta[0];
    const sha = meta[1];
    const stage = meta[2];
    if (stage !== '0') continue;
    if (mode !== '100644' && mode !== '100755') continue;
    files.set(rel, sha);
    lowerFiles.set(rel.toLowerCase(), rel);
    const parts = rel.split('/');
    for (let i = 1; i < parts.length; i++) {
      const d = parts.slice(0, i).join('/');
      dirs.add(d);
      lowerDirs.set(d.toLowerCase(), d);
    }
    for (let i = 0; i < parts.length; i++) {
      const parent = parts.slice(0, i).join('/');
      addChild(parent, parts[i], i < parts.length - 1);
    }
  }

  const contentCache = new Map();

  function preload(rels) {
    const pending = rels.filter(r => files.has(r) && !contentCache.has(r));
    if (pending.length === 0) return;
    const input = pending.map(r => files.get(r)).join('\n') + '\n';
    const out = git(['cat-file', '--batch'], input);
    let pos = 0;
    for (const rel of pending) {
      const nl = out.indexOf(0x0a, pos);
      const header = out.slice(pos, nl).toString('utf8').split(' ');
      const size = parseInt(header[2], 10);
      const start = nl + 1;
      contentCache.set(rel, out.slice(start, start + size));
      pos = start + size + 1;
    }
  }

  function resolveInsensitive(rel) {
    const lower = rel.toLowerCase();
    return lowerFiles.get(lower) || lowerDirs.get(lower) || null;
  }

  return {
    label: 'índice do git',
    preload: preload,
    exists(rel) {
      return files.has(rel) || dirs.has(rel) || resolveInsensitive(rel) !== null;
    },
    isDir(rel) {
      return dirs.has(rel);
    },
    isFile(rel) {
      return files.has(rel);
    },
    exactCase(rel) {
      if (files.has(rel) || dirs.has(rel)) return { ok: true, actual: rel };
      const actual = resolveInsensitive(rel);
      return actual === null ? { ok: false, actual: null } : { ok: false, actual: actual };
    },
    list(relDir) {
      const m = children.get(relDir);
      if (!m) return [];
      return Array.from(m.entries()).map(([name, isDir]) => ({ name: name, isDir: isDir, isFile: !isDir }));
    },
    size(rel) {
      preload([rel]);
      const buf = contentCache.get(rel);
      return buf ? buf.length : 0;
    },
    read(rel) {
      preload([rel]);
      return contentCache.get(rel);
    }
  };
}

/**
 * Select a source whose relative paths are rooted at repoRoot.
 * @param {{ staged: boolean, repoRoot: string, git: (args: string[], input?: string) => Buffer }} options
 * @returns {AuditSource}
 */
function createSource({ staged, repoRoot, git }) {
  return staged ? createIndexSource(git) : createFsSource(repoRoot);
}

module.exports = { createSource };
