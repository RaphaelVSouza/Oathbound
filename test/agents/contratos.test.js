'use strict';
// Teste offline (custo zero) dos verificadores. Rode: node test/agents/contratos.test.js
const assert = require('node:assert');
const { verificarContrato, lerStream } = require('./contratos.js');

const bons = {
  scout: 'RESPOSTA: comando X\nEVIDÊNCIA:\n  - a.md:24 — trecho\nLACUNAS: nenhuma',
  scholar: 'RESPOSTA: sim\nFONTES: https://code.claude.com/docs/x — seção\nLACUNAS: nenhuma',
  assayer: 'No issues.',
  sentinel: 'No security vulnerabilities found in scope.',
  scribe: 'MODO: release\nARQUIVOS: a.md — criado\nPENDÊNCIAS: nenhuma',
  smith: 'ARQUIVOS: a — mudança\nACEITE: cmd → ok\nNOTA: nenhuma',
  tester: 'STATUS: PASS\nAMBIENTE: x\nFLUXO: y\nCONSOLE: limpo\nNETWORK: não capturado\nEVIDÊNCIA: nenhuma',
};
for (const [ag, txt] of Object.entries(bons)) {
  assert.deepStrictEqual(verificarContrato(ag, txt), [], `${ag} deveria cumprir`);
}

// Variações válidas.
assert.deepStrictEqual(verificarContrato('scout', 'RESPOSTA: não encontrado\nLACUNAS: nenhuma'), []);
assert.deepStrictEqual(verificarContrato('assayer',
  'a/b.py:42: 🔴 bug: erro. corrija.\nc.py:7: ❓ question: intenção?\ntotals: 1🔴 0🟡 1❓'), []);
assert.deepStrictEqual(verificarContrato('sentinel',
  'x/y.py:10: 🟡 MEDIUM [CWE-682]: texto. Corrija.\ntotals: 0🔴 0🟠 1🟡 0🔵'), []);

// Violações devem falhar.
assert.ok(verificarContrato('assayer', 'Achei um problema no código.').length > 0, 'prosa não é achado');
assert.ok(verificarContrato('assayer', 'a.py:1: 🔴 bug: x. y.').length > 0, 'achado sem totals');
assert.ok(verificarContrato('assayer', 'Resumo:\nNo issues.').length > 0, 'prosa antes de No issues');
assert.ok(verificarContrato('sentinel', 'a.py:1: 🔴 CRITICAL: sem CWE. x\ntotals: 1').length > 0, 'sem CWE');
assert.ok(verificarContrato('scout', 'Resposta: x').length > 0);
assert.ok(verificarContrato('scholar', 'RESPOSTA: x\nFONTES: nenhuma\nLACUNAS: x').length > 0, 'sem URL');
assert.ok(verificarContrato('tester', 'STATUS: OK\nAMBIENTE: x').length > 0);
assert.ok(verificarContrato('inexistente', 'x').length > 0);
assert.ok(verificarContrato('smith', '').length === 3, 'vazio falha nos 3 itens');

// Leitor de stream-json.
const stream = [
  '{"type":"system","subtype":"init"}',
  '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"a","limit":50}}]}}',
  '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","is_error":true,"content":"negado"}]}}',
  '{"type":"assistant","message":{"content":[{"type":"text","text":"rascunho"}]}}',
  'linha que não é json',
  '{"type":"result","result":"texto final","total_cost_usd":0.0123}',
].join('\n');
const s = lerStream(stream);
assert.strictEqual(s.texto, 'texto final');
assert.strictEqual(s.custo, 0.0123);
assert.strictEqual(s.usos.length, 1);
assert.strictEqual(s.usos[0].input.limit, 50);
assert.strictEqual(s.resultados[0].erro, true);
assert.strictEqual(lerStream('{"type":"assistant","message":{"content":[{"type":"text","text":"so isto"}]}}').texto, 'so isto');

console.log('ok: contratos');
