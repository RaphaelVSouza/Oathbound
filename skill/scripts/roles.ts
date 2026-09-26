const path = require('node:path');

interface Roles {
  orchestrator: string;
  documenter: string;
  implementer: string;
  reviewer: string;
  committer: string;
}

/** Nomes canônicos dos papéis de agente usados pelo pacote. Fonte única para evitar literais espalhados. */
const ROLES: Readonly<Roles> = Object.freeze({
  orchestrator: 'oathkeeper',
  documenter: 'herald',
  implementer: 'smith',
  reviewer: 'assayer',
  committer: 'archivist'
});

/** Nome do diretório de estado (claims, filas, banco de governança) dentro do gitDir. */
const STATE_DIR_NAME = 'oathbound';

/** Nome do banco de dados transacional dentro do diretório de estado. */
const DB_FILE_NAME = 'oathbound.db';

/**
 * Caminho do diretório de estado dentro do gitDir do repositório.
 */
function stateDir(gitDir: string): string {
  return path.join(gitDir, STATE_DIR_NAME);
}

module.exports = { ROLES, STATE_DIR_NAME, DB_FILE_NAME, stateDir };
