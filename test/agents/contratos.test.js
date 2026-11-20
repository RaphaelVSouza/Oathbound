'use strict';
// Offline test (zero cost) of the checkers. Run: node test/agents/contratos.test.js
const assert = require('node:assert');
const { verificarContrato, lerStream } = require('./contratos.js');

const bons = {
  scout: 'ANSWER: command X\nEVIDENCE:\n  - a.md:24 — excerpt\nGAPS: none',
  scholar: 'ANSWER: yes\nSOURCES: https://code.claude.com/docs/x — section\nGAPS: none',
  assayer: 'No issues.\nCOVERAGE: complete\nGAPS: none',
  sentinel: 'No security vulnerabilities found in scope.\nGAPS: none',
  scribe: 'MODE: release\nFILES: a.md — created\nPENDING: none',
  smith: 'FILES: a — change\nACCEPTANCE: cmd → ok\nNOTE: none',
  breaker: 'STATUS: PASS\nENVIRONMENT: x\nFLOW: y\nCONSOLE: clean\nNETWORK: not captured\nEVIDENCE: none',
};
for (const [ag, txt] of Object.entries(bons)) {
  assert.deepStrictEqual(verificarContrato(ag, txt), [], `${ag} should comply`);
}

// Valid variations.
assert.deepStrictEqual(verificarContrato('scout', 'ANSWER: not found\nGAPS: none'), []);
assert.deepStrictEqual(verificarContrato('assayer',
  'a/b.py:42: 🔴 bug: error. fix it.\nc.py:7: ❓ question: intent?\ntotals: 1🔴 0🟡 1❓\nCOVERAGE: complete\nGAPS: none'), []);
assert.deepStrictEqual(verificarContrato('assayer',
  'No issues.\nCOVERAGE: partial\nGAPS: reviewed a.py. b.py remains pending due to missing access.'), []);
assert.deepStrictEqual(verificarContrato('sentinel',
  'x/y.py:10: 🟡 MEDIUM [CWE-682]: text. Fix it.\ntotals: 0🔴 0🟠 1🟡 0🔵\nGAPS: none'), []);
assert.deepStrictEqual(verificarContrato('sentinel',
  'No security vulnerabilities found in scope.\nGAPS: servico.py:10 calls a control whose configuration was not provided.'), []);

// The count must match verdicts and request size.
const lote = { totalAfirmacoes: 2 };
const conferido = [
  'ANSWER: checked both claims.',
  'EVIDENCE:',
  '1. CONFIRMED — Publishes status in app.js:10.',
  '2. INCONCLUSIVE — Environment configuration is missing.',
  'TOTALS: 1 confirmed, 0 refuted, 1 inconclusive',
  'GAPS: environment configuration.',
].join('\n');
assert.deepStrictEqual(verificarContrato('scout', conferido, lote), []);
assert.ok(verificarContrato('scout', conferido, { totalAfirmacoes: 3 }).length > 0);
assert.ok(verificarContrato('scout', conferido.replace('2. INCONCLUSIVE', '1. INCONCLUSIVE'), lote).length > 0);
assert.ok(verificarContrato('scout', conferido.replace('0 refuted, 1 inconclusive', '1 refuted, 0 inconclusive'), lote).length > 0);

const coleta = {
  usos: [
    { name: 'mcp__playwright__browser_console_messages', id: 'console' },
    { name: 'mcp__playwright__browser_network_requests', id: 'rede' },
  ],
  resultados: [
    { id: 'console', erro: false },
    { id: 'rede', erro: true },
  ],
};
assert.deepStrictEqual(verificarContrato('breaker', bons.breaker, coleta), []);
assert.deepStrictEqual(verificarContrato('breaker', bons.breaker, { usos: [], resultados: [] }),
  ['CONSOLE clean requires successful collection']);
assert.deepStrictEqual(verificarContrato('breaker', bons.breaker.replace('NETWORK: not captured', 'NETWORK: clean'), coleta),
  ['NETWORK clean requires successful collection']);

// Violations must fail.
assert.ok(verificarContrato('assayer', 'Found a problem in the code.').length > 0, 'prose is not a finding');
assert.ok(verificarContrato('assayer', 'a.py:1: 🔴 bug: x. y.\nCOVERAGE: complete\nGAPS: none').length > 0, 'finding without totals');
assert.ok(verificarContrato('assayer', 'Summary:\n' + bons.assayer).length > 0, 'prose before No issues');
assert.ok(verificarContrato('assayer', 'No issues.\nCOVERAGE: partial').length > 0, 'partial coverage without gaps');
assert.ok(verificarContrato('assayer', bons.assayer.replace('complete', 'partial')).length > 0, 'partial coverage requires a concrete gap');
assert.ok(verificarContrato('sentinel', 'a.py:1: 🔴 CRITICAL: without CWE. x\ntotals: 1\nGAPS: none').length > 0, 'without CWE');
assert.deepStrictEqual(verificarContrato('sentinel', 'No security vulnerabilities found in scope.'), ['GAPS']);
assert.ok(verificarContrato('scout', 'Answer: x').length > 0);
assert.ok(verificarContrato('scholar', 'ANSWER: x\nSOURCES: none\nGAPS: x').length > 0, 'without URL');
assert.ok(verificarContrato('breaker', 'STATUS: OK\nENVIRONMENT: x').length > 0);
assert.ok(verificarContrato('inexistente', 'x').length > 0);
assert.ok(verificarContrato('smith', '').length === 3, 'empty fails all 3 items');

// Stream-json reader.
const stream = [
  '{"type":"system","subtype":"init"}',
  '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"a","limit":50}}]}}',
  '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","is_error":true,"content":"denied"}]}}',
  '{"type":"assistant","message":{"content":[{"type":"text","text":"draft"}]}}',
  'line that is not JSON',
  '{"type":"result","result":"final text","total_cost_usd":0.0123}',
].join('\n');
const s = lerStream(stream);
assert.strictEqual(s.texto, 'final text');
assert.strictEqual(s.custo, 0.0123);
assert.strictEqual(s.usos.length, 1);
assert.strictEqual(s.usos[0].input.limit, 50);
assert.strictEqual(s.resultados[0].erro, true);
assert.strictEqual(lerStream('{"type":"assistant","message":{"content":[{"type":"text","text":"only this"}]}}').texto, 'only this');

console.log('ok: contracts');
