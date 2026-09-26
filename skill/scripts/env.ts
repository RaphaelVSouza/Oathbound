/**
 * Lê uma variável de ambiente pública do kit com prefixo `OATHBOUND_`.
 */
function readEnv(name: string): string | undefined {
  return process.env[`OATHBOUND_${name}`];
}

module.exports = { readEnv };
