'use strict';
// Teste do verificador de sincronia, sem cota. Roda: node test/agents/sincronia.test.js
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

const REGRA = 'Segredos: nunca leia `.env`.';
const cfgPath = path.join(tmp, 'regras.json');
fs.writeFileSync(cfgPath, JSON.stringify({ proibido: ['GIT_CONFIG_GLOBAL'], regras: { smith: [REGRA] } }));

// verificar: falta e proibido
assert.deepStrictEqual(verificar('nada', 'smith', { regras: { smith: [REGRA] } }).map((p) => p.tipo), ['falta']);
assert.deepStrictEqual(verificar(`- ${REGRA}\n$env:GIT_CONFIG_GLOBAL`, 'smith', { regras: { smith: [REGRA] }, proibido: ['GIT_CONFIG_GLOBAL'] }).map((p) => p.tipo), ['proibido']);
// quebra de linha e \n escapado não contam como diferença
assert.strictEqual(norm('a\\nb   c\nd'), 'a b c d');
assert.deepStrictEqual(verificar('Segredos: nunca\nleia `.env`.', 'smith', { regras: { smith: [REGRA] } }), []);

// inserir: md com Recibo, md sem Recibo, toml multilinha, toml uma linha
assert.match(inserir('corpo\n\nRecibo:\n```x```\n', '.md', REGRA), /- Segredos[^\n]*\n\nRecibo:/);
assert.match(inserir('corpo\n', '.md', REGRA), /corpo\n\n- Segredos/);
const tomlMulti = 'name = "smith"\ndeveloper_instructions = """\ncorpo\n"""\n';
assert.match(inserir(tomlMulti, '.toml', REGRA), /corpo\n\n- Segredos[^\n]*\n"""/);
const tomlLinha = 'name = "a"\ndeveloper_instructions = "corpo"\n';
assert.match(inserir(tomlLinha, '.toml', REGRA), /corpo\\n\\n- Segredos[^\n]*"\n$/);

// executar: ausente, divergência, aplicar e idempotência
const pClaude = path.join(process.env.CLAUDE_AGENTS_DIR, 'smith.md');
const pCodex = path.join(process.env.CODEX_AGENTS_DIR, 'smith.toml');
fs.writeFileSync(pClaude, `- ${REGRA}\n`);
let rel = executar({ cfgPath });
assert.deepStrictEqual(rel.map((r) => `${r.cli}:${r.tipo}`), ['codex:ausente', 'gemini:ausente']);

fs.writeFileSync(pCodex, tomlMulti);
fs.writeFileSync(path.join(process.env.GEMINI_AGENTS_DIR, 'smith.md'), 'corpo $env:GIT_CONFIG_GLOBAL\n');
rel = executar({ cfgPath });
assert.deepStrictEqual(rel.map((r) => `${r.cli}:${r.tipo}`).sort(), ['codex:falta', 'gemini:falta', 'gemini:proibido']);

rel = executar({ cfgPath, aplicar: true });
assert.deepStrictEqual(rel.map((r) => `${r.cli}:${r.tipo}`), ['gemini:proibido'], 'aplicar não remove proibido');
const antes = fs.readFileSync(pCodex, 'utf8');
executar({ cfgPath, aplicar: true });
assert.strictEqual(fs.readFileSync(pCodex, 'utf8'), antes, 'aplicar é idempotente');

// O agente documental tem nomes diferentes no Claude e nas outras CLIs.
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

// Regra diferenciada por CLI
const regraCli = { claude: 'Gate: usa hook.', default: 'Gate: pede ok.' };
assert.strictEqual(resolverRegra(regraCli, 'claude'), 'Gate: usa hook.');
assert.strictEqual(resolverRegra(regraCli, 'gemini'), 'Gate: pede ok.');
assert.strictEqual(resolverRegra(REGRA, 'claude'), REGRA);
assert.deepStrictEqual(verificar('- Gate: usa hook.\n', 'smith', { regras: { smith: [regraCli] } }, 'claude'), []);
assert.deepStrictEqual(verificar('- Gate: usa hook.\n', 'smith', { regras: { smith: [regraCli] } }, 'codex').map((p) => p.tipo), ['falta']);
assert.deepStrictEqual(verificar('- Gate: pede ok.\n', 'smith', { regras: { smith: [regraCli] } }, 'codex'), []);

fs.writeFileSync(cfgPath, JSON.stringify({ regras: { smith: [regraCli] } }));
fs.writeFileSync(path.join(process.env.CLAUDE_AGENTS_DIR, 'smith.md'), '- Gate: usa hook.\n');
fs.writeFileSync(path.join(process.env.CODEX_AGENTS_DIR, 'smith.toml'), tomlMulti);
fs.writeFileSync(path.join(process.env.GEMINI_AGENTS_DIR, 'smith.md'), '- Gate: pede ok.\n');
assert.deepStrictEqual(executar({ cfgPath }).map(({ cli, agente, tipo }) => ({ cli, agente, tipo })), [
  { cli: 'codex', agente: 'smith', tipo: 'falta' },
]);
assert.deepStrictEqual(executar({ cfgPath, aplicar: true }), []);
assert.match(fs.readFileSync(path.join(process.env.CODEX_AGENTS_DIR, 'smith.toml'), 'utf8'), /- Gate: pede ok\./);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('ok sincronia.test');
