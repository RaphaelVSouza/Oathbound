const { parseArgs } = require('node:util');

/**
 * Parse the short and long option names used by the kit's CLI wrappers via node:util.parseArgs.
 * Values are arrays so repeated flags such as -s and -m retain their order.
 * @param {string[]} argv
 * @param {string[]} values Options requiring a value.
 * @param {string[]} [flags] Boolean options.
 * @returns {Record<string, string[]|boolean> & {_: string[]}}
 */
function options(argv, values, flags = []) {
  const optionsConfig = {};
  const mapKey = {};

  for (const v of values) {
    const raw = v.replace(/^-+/, '');
    const isShort = !v.startsWith('--') && raw.length === 1;
    optionsConfig[raw] = {
      type: 'string',
      multiple: true,
      ...(isShort ? { short: raw } : {})
    };
    mapKey[raw] = v;
  }
  for (const f of flags) {
    const raw = f.replace(/^-+/, '');
    const isShort = !f.startsWith('--') && raw.length === 1;
    optionsConfig[raw] = {
      type: 'boolean',
      ...(isShort ? { short: raw } : {})
    };
    mapKey[raw] = f;
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: optionsConfig,
      allowPositionals: true,
      strict: true
    });
  } catch (err) {
    if (err.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') {
      const opt = err.message.match(/Option '([^', ]+)/)?.[1] || 'opção';
      throw Error(`falta valor para ${opt}`);
    }
    if (err.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
      const match = err.message.match(/Unknown option '([^']+)'/);
      throw Error(`opção inválida: ${match ? match[1] : err.message}`);
    }
    throw err;
  }

  const out = { _: parsed.positionals };
  for (const [key, val] of Object.entries(parsed.values)) {
    out[mapKey[key] || key] = val;
  }
  return out;
}

/** @param {Record<string, any>} parsed @param {string} key @param {string} [fallback] @returns {string} */
const one = (parsed, key, fallback = '') => parsed[key]?.at(-1) ?? fallback;

module.exports = { options, one, parseArgs };
