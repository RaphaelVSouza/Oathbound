const path = require('node:path');
const fs = require('node:fs');

/** Nomes canônicos dos papéis de agente usados pelo pacote. Fonte única para evitar literais espalhados. */
const ROLES = Object.freeze({ implementer: 'smith', reviewer: 'assayer', committer: 'archivist' });

/** Nome do diretório de estado (claims, filas, banco de governança) dentro do gitDir. */
const STATE_DIR_NAME = 'oathbound';

/** Nome do banco de dados transacional dentro do diretório de estado. */
const DB_FILE_NAME = 'oathbound.db';

let stateMigrationWarned = false;

/**
 * Migra o diretório de estado legado `ds-queue` para `oathbound` e o banco
 * `governance.db` para `oathbound.db`, uma única vez, quando o diretório novo
 * ainda não existe. Escreve um aviso em stderr. Se os dois diretórios existirem,
 * mantém `oathbound` e avisa que o legado ficou para trás.
 * @param {string} gitDir
 */
function migrateLegacyStateDir(gitDir) {
  const legacyDir = path.join(gitDir, 'ds-queue');
  const currentDir = path.join(gitDir, STATE_DIR_NAME);
  if (stateMigrationWarned || !fs.existsSync(legacyDir)) return;
  stateMigrationWarned = true;

  if (fs.existsSync(currentDir)) {
    process.stderr.write(`diretório de estado legado ${legacyDir} ignorado; usando ${currentDir}\n`);
    return;
  }

  fs.renameSync(legacyDir, currentDir);
  const legacyDb = path.join(currentDir, 'governance.db');
  if (fs.existsSync(legacyDb)) {
    fs.renameSync(legacyDb, path.join(currentDir, DB_FILE_NAME));
  }
  process.stderr.write(`diretório de estado legado ${legacyDir} migrado para ${currentDir}\n`);
}

/**
 * Caminho do diretório de estado dentro do gitDir do repositório.
 * @param {string} gitDir
 * @returns {string}
 */
function stateDir(gitDir) {
  migrateLegacyStateDir(gitDir);
  return path.join(gitDir, STATE_DIR_NAME);
}

module.exports = { ROLES, STATE_DIR_NAME, DB_FILE_NAME, stateDir };
