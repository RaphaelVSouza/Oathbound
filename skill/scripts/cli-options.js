/**
 * Parse the short option names used by the kit's CLI wrappers.
 * Values are arrays so repeated flags such as -s and -m retain their order.
 * @param {string[]} argv
 * @param {string[]} values Options requiring a value.
 * @param {string[]} [flags] Boolean options.
 * @returns {Record<string, string[]|boolean> & {_: string[]}}
 */
function options(argv, values, flags = []) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { out._.push(...argv.slice(i + 1)); break; }
    if (values.includes(a)) {
      if (!argv[i + 1]) throw Error(`falta valor para ${a}`);
      (out[a] ||= []).push(argv[++i]);
    } else if (flags.includes(a)) out[a] = true;
    else throw Error(`opção inválida: ${a}`);
  }
  return out;
}

/** @param {Record<string, any>} parsed @param {string} key @param {string} [fallback] @returns {string} */
const one = (parsed, key, fallback = '') => parsed[key]?.at(-1) ?? fallback;

module.exports = { options, one };
