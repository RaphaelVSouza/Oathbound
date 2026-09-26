const { parseArgs } = require('node:util');

interface CliOptionConfig {
  type: 'string' | 'boolean';
  multiple?: boolean;
  short?: string;
}

type ParsedCliOptions = Record<string, string[] | boolean | undefined> & {
  _: string[];
};

/**
 * Parse the short and long option names used by the kit's CLI wrappers via node:util.parseArgs.
 * Values are arrays so repeated flags such as -s and -m retain their order.
 */
function options(argv: string[], values: string[], flags: string[] = []): ParsedCliOptions {
  const optionsConfig: Record<string, CliOptionConfig> = {};
  const mapKey: Record<string, string> = {};

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

  let parsed: any;
  try {
    parsed = parseArgs({
      args: argv,
      options: optionsConfig,
      allowPositionals: true,
      strict: true
    });
  } catch (err: any) {
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

  const out: ParsedCliOptions = { _: parsed.positionals };
  for (const [key, val] of Object.entries(parsed.values)) {
    out[mapKey[key] || key] = val as string[] | boolean;
  }
  return out;
}

const one = (parsed: Record<string, any>, key: string, fallback: string = ''): string =>
  parsed[key]?.at(-1) ?? fallback;

module.exports = { options, one, parseArgs };
