const warned = new Set();

/**
 * Lê uma variável de ambiente pública do kit, preferindo o prefixo novo `OATHBOUND_`.
 * Mantém compatibilidade de uma versão com o prefixo legado `GOVKIT_`: quando a
 * variável nova está ausente e a antiga existe, devolve o valor antigo e escreve
 * um único aviso em stderr por nome.
 * @param {string} name Nome sem prefixo (ex.: `RUNNER`, `MODEL`).
 * @returns {string|undefined}
 */
function readEnv(name) {
  const current = process.env[`OATHBOUND_${name}`];
  if (current !== undefined) return current;

  const legacy = process.env[`GOVKIT_${name}`];
  if (legacy === undefined) return undefined;

  if (!warned.has(name)) {
    warned.add(name);
    process.stderr.write(`GOVKIT_${name} está obsoleta; use OATHBOUND_${name}\n`);
  }
  return legacy;
}

module.exports = { readEnv };
