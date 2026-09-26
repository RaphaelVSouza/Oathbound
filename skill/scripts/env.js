/**
 * Lê uma variável de ambiente pública do kit com prefixo `OATHBOUND_`.
 * @param {string} name Nome sem prefixo (ex.: `RUNNER`, `MODEL`).
 * @returns {string|undefined}
 */
function readEnv(name) {
  return process.env[`OATHBOUND_${name}`];
}

module.exports = { readEnv };
