'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const MANIFESTS = [
  '.antigravity-plugin/plugin.json',
  '.claude-plugin/plugin.json',
  'codex/plugin.json',
];

function runGit(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * Atualiza VERSION e os manifestos de plugin para a versão informada.
 * Opcionalmente cria commit e tag anotada `v<semver>` no Git.
 * @param {string} nextVersion Versão SemVer (ex.: 0.50.0-alpha.5).
 * @param {string} [rootDir] Diretório raiz do repositório.
 * @param {{ commit?: boolean, tag?: boolean }} [options] Opções Git.
 * @returns {string[]} Caminhos relativos atualizados.
 */
function bumpVersion(nextVersion, rootDir = path.resolve(__dirname, '..'), options = {}) {
  if (!nextVersion || !SEMVER_RE.test(nextVersion)) {
    throw new Error('Uso: node tools/bump-version.cjs <semver> [--commit] [--tag]');
  }
  const shouldTag = Boolean(options.tag);
  const shouldCommit = Boolean(options.commit) || shouldTag;
  const tagName = `v${nextVersion}`;

  if (shouldTag) {
    const existing = runGit(['tag', '--list', tagName], rootDir);
    if (existing === tagName) {
      throw new Error(`Tag Git já existe: ${tagName}`);
    }
  }

  const updated = [];
  fs.writeFileSync(path.join(rootDir, 'VERSION'), `${nextVersion}\n`, 'utf8');
  updated.push('VERSION');

  for (const rel of MANIFESTS) {
    const full = path.join(rootDir, rel);
    const data = JSON.parse(fs.readFileSync(full, 'utf8'));
    data.version = nextVersion;
    fs.writeFileSync(full, JSON.stringify(data, null, 2) + '\n', 'utf8');
    updated.push(rel);
  }

  if (shouldCommit) {
    runGit(['add', ...updated], rootDir);
    runGit(['commit', '-m', `chore(release): ${tagName}`, '--', ...updated], rootDir);
  }
  if (shouldTag) {
    runGit(['tag', '-a', tagName, '-m', tagName], rootDir);
  }

  return updated;
}

function parseCliArgs(argv) {
  let version = '';
  const options = { commit: false, tag: false };
  for (const arg of argv) {
    if (arg === '--commit') {
      options.commit = true;
    } else if (arg === '--tag') {
      options.tag = true;
      options.commit = true;
    } else if (arg.startsWith('-')) {
      throw new Error(`Opção desconhecida: ${arg}`);
    } else if (!version) {
      version = arg;
    } else {
      throw new Error(`Argumento inesperado: ${arg}`);
    }
  }
  return { version, options };
}

if (require.main === module) {
  try {
    const { version, options } = parseCliArgs(process.argv.slice(2));
    const updated = bumpVersion(version, path.resolve(__dirname, '..'), options);
    const extras = [options.commit ? 'commit' : '', options.tag ? `tag v${version}` : ''].filter(Boolean);
    const suffix = extras.length > 0 ? ` (${extras.join(' + ')})` : '';
    console.log(`Versão atualizada em: ${updated.join(', ')}${suffix}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { bumpVersion, parseCliArgs, SEMVER_RE };
