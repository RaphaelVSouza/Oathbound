const path = require('node:path');

/** Nomes canônicos dos papéis de agente usados pelo pacote. Fonte única para evitar literais espalhados. */
const ROLES = Object.freeze({ implementer: 'ds-runner', reviewer: 'ds-reviewer', committer: 'ds-committer' });

/** Nome do diretório de estado (claims, filas, banco de governança) dentro do gitDir. */
const STATE_DIR_NAME = 'ds-queue';

/**
 * Caminho do diretório de estado dentro do gitDir do repositório.
 * @param {string} gitDir
 * @returns {string}
 */
function stateDir(gitDir) {
  return path.join(gitDir, STATE_DIR_NAME);
}

module.exports = { ROLES, STATE_DIR_NAME, stateDir };
