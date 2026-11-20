'use strict';
// Test the synchronization checker, without quota. Run: node test/agents/sincronia.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sincronia-'));
const mk = (n) => { const d = path.join(tmp, n); fs.mkdirSync(d); return d; };
process.env.CLAUDE_AGENTS_DIR = mk('claude');
process.env.CODEX_AGENTS_DIR = mk('codex');
process.env.GEMINI_AGENTS_DIR = mk('gemini');
const { executar, verificar, inserir, norm, resolverRegra } = require('./sincronia.js');

const REGRA = 'Secrets: never read `.env`.';
const cfgPath = path.join(tmp, 'regras.json');
fs.writeFileSync(cfgPath, JSON.stringify({ proibido: ['GIT_CONFIG_GLOBAL'], regras: { smith: [REGRA] } }));

// verificar: missing and prohibited
assert.deepStrictEqual(verificar('nothing', 'smith', { regras: { smith: [REGRA] } }).map((p) => p.tipo), ['falta']);
assert.deepStrictEqual(verificar(`- ${REGRA}\n$env:GIT_CONFIG_GLOBAL`, 'smith', { regras: { smith: [REGRA] }, proibido: ['GIT_CONFIG_GLOBAL'] }).map((p) => p.tipo), ['proibido']);
// Line breaks and escaped \n do not count as differences.
assert.strictEqual(norm('a\\nb   c\nd'), 'a b c d');
assert.deepStrictEqual(verificar('Secrets: never\nread `.env`.', 'smith', { regras: { smith: [REGRA] } }), []);

// inserir: Markdown with Receipt, Markdown without Receipt, multiline TOML, single-line TOML
assert.match(inserir('body\n\nReceipt:\n```x```\n', '.md', REGRA), /- Secrets[^\n]*\n\nReceipt:/);
assert.match(inserir('body\n', '.md', REGRA), /body\n\n- Secrets/);
const tomlMulti = 'name = "smith"\ndeveloper_instructions = """\nbody\n"""\n';
assert.match(inserir(tomlMulti, '.toml', REGRA), /body\n\n- Secrets[^\n]*\n"""/);
const tomlLinha = 'name = "a"\ndeveloper_instructions = "body"\n';
assert.match(inserir(tomlLinha, '.toml', REGRA), /body\\n\\n- Secrets[^\n]*"\n$/);

// executar: missing, divergence, apply, and idempotence
const pClaude = path.join(process.env.CLAUDE_AGENTS_DIR, 'smith.md');
const pCodex = path.join(process.env.CODEX_AGENTS_DIR, 'smith.toml');
fs.writeFileSync(pClaude, `- ${REGRA}\n`);
let rel = executar({ cfgPath });
assert.deepStrictEqual(rel.map((r) => `${r.cli}:${r.tipo}`), ['codex:ausente', 'gemini:ausente']);

fs.writeFileSync(pCodex, tomlMulti);
fs.writeFileSync(path.join(process.env.GEMINI_AGENTS_DIR, 'smith.md'), 'body $env:GIT_CONFIG_GLOBAL\n');
rel = executar({ cfgPath });
assert.deepStrictEqual(rel.map((r) => `${r.cli}:${r.tipo}`).sort(), ['codex:falta', 'gemini:falta', 'gemini:proibido']);

rel = executar({ cfgPath, aplicar: true });
assert.deepStrictEqual(rel.map((r) => `${r.cli}:${r.tipo}`), ['gemini:proibido'], 'aplicar does not remove prohibited content');
const antes = fs.readFileSync(pCodex, 'utf8');
executar({ cfgPath, aplicar: true });
assert.strictEqual(fs.readFileSync(pCodex, 'utf8'), antes, 'aplicar is idempotent');

// The documentation agent has different names in Claude and the other CLIs.
fs.writeFileSync(cfgPath, JSON.stringify({
  nomes: { codex: { scribe: 'docs' }, gemini: { scribe: 'docs' } },
  regras: { scribe: [REGRA] },
}));
fs.writeFileSync(path.join(process.env.CLAUDE_AGENTS_DIR, 'scribe.md'), `- ${REGRA}\n`);
fs.writeFileSync(path.join(process.env.CODEX_AGENTS_DIR, 'docs.toml'), tomlMulti);
fs.writeFileSync(path.join(process.env.GEMINI_AGENTS_DIR, 'docs.md'), `- ${REGRA}\n`);
assert.deepStrictEqual(executar({ cfgPath }).map(({ cli, agente, tipo }) => ({ cli, agente, tipo })), [
  { cli: 'codex', agente: 'scribe', tipo: 'falta' },
]);
assert.deepStrictEqual(executar({ cfgPath, aplicar: true }), []);

// CLI-specific rule
const regraCli = { claude: 'Gate: uses hook.', default: 'Gate: requests OK.' };
assert.strictEqual(resolverRegra(regraCli, 'claude'), 'Gate: uses hook.');
assert.strictEqual(resolverRegra(regraCli, 'gemini'), 'Gate: requests OK.');
assert.strictEqual(resolverRegra(REGRA, 'claude'), REGRA);
assert.deepStrictEqual(verificar('- Gate: uses hook.\n', 'smith', { regras: { smith: [regraCli] } }, 'claude'), []);
assert.deepStrictEqual(verificar('- Gate: uses hook.\n', 'smith', { regras: { smith: [regraCli] } }, 'codex').map((p) => p.tipo), ['falta']);
assert.deepStrictEqual(verificar('- Gate: requests OK.\n', 'smith', { regras: { smith: [regraCli] } }, 'codex'), []);

fs.writeFileSync(cfgPath, JSON.stringify({ regras: { smith: [regraCli] } }));
fs.writeFileSync(path.join(process.env.CLAUDE_AGENTS_DIR, 'smith.md'), '- Gate: uses hook.\n');
fs.writeFileSync(path.join(process.env.CODEX_AGENTS_DIR, 'smith.toml'), tomlMulti);
fs.writeFileSync(path.join(process.env.GEMINI_AGENTS_DIR, 'smith.md'), '- Gate: requests OK.\n');
assert.deepStrictEqual(executar({ cfgPath }).map(({ cli, agente, tipo }) => ({ cli, agente, tipo })), [
  { cli: 'codex', agente: 'smith', tipo: 'falta' },
]);
assert.deepStrictEqual(executar({ cfgPath, aplicar: true }), []);
assert.match(fs.readFileSync(path.join(process.env.CODEX_AGENTS_DIR, 'smith.toml'), 'utf8'), /- Gate: requests OK\./);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('ok synchronization.test');
