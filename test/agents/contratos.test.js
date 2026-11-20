'use strict';
// Teste offline (custo zero) dos verificadores. Rode: node test/agents/contratos.test.js
const assert = require('node:assert');
const { verificarContrato, lerStream } = require('./contratos.js');

const bons = {
  scout: 'RESPOSTA: comando X\nEVIDÊNCIA:\n  - a.md:24 — trecho\nLACUNAS: nenhuma',
  scholar: 'RESPOSTA: sim\nFONTES: https://code.claude.com/docs/x — seção\nLACUNAS: nenhuma',
  assayer: 'No issues.\nCOBERTURA: completa\nLACUNAS: nenhuma',
  sentinel: 'No security vulnerabilities found in scope.\nLACUNAS: nenhuma',
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
  'a/b.py:42: 🔴 bug: erro. corrija.\nc.py:7: ❓ question: intenção?\ntotals: 1🔴 0🟡 1❓\nCOBERTURA: completa\nLACUNAS: nenhuma'), []);
assert.deepStrictEqual(verificarContrato('assayer',
  'No issues.\nCOBERTURA: parcial\nLACUNAS: revisei a.py. b.py ficou pendente por falta de acesso.'), []);
assert.deepStrictEqual(verificarContrato('sentinel',
  'x/y.py:10: 🟡 MEDIUM [CWE-682]: texto. Corrija.\ntotals: 0🔴 0🟠 1🟡 0🔵\nLACUNAS: nenhuma'), []);
assert.deepStrictEqual(verificarContrato('sentinel',
  'No security vulnerabilities found in scope.\nLACUNAS: servico.py:10 chama um controle cuja configuração não foi fornecida.'), []);

// A contagem deve corresponder aos vereditos e ao tamanho do pedido.
const lote = { totalAfirmacoes: 2 };
const conferido = [
  'RESPOSTA: conferi as duas afirmações.',
  'EVIDÊNCIAS:',
  '1. CONFIRMADA — Publica o status em app.js:10.',
  '2. INCONCLUSIVA — Falta configuração do ambiente.',
  'TOTAIS: 1 confirmadas, 0 refutadas, 1 inconclusivas',
  'LACUNAS: configuração do ambiente.',
].join('\n');
assert.deepStrictEqual(verificarContrato('scout', conferido, lote), []);
assert.ok(verificarContrato('scout', conferido, { totalAfirmacoes: 3 }).length > 0);
assert.ok(verificarContrato('scout', conferido.replace('2. INCONCLUSIVA', '1. INCONCLUSIVA'), lote).length > 0);
assert.ok(verificarContrato('scout', conferido.replace('0 refutadas, 1 inconclusivas', '1 refutadas, 0 inconclusivas'), lote).length > 0);

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
assert.deepStrictEqual(verificarContrato('tester', bons.tester, coleta), []);
assert.deepStrictEqual(verificarContrato('tester', bons.tester, { usos: [], resultados: [] }),
  ['CONSOLE limpo exige coleta bem-sucedida']);
assert.deepStrictEqual(verificarContrato('tester', bons.tester.replace('NETWORK: não capturado', 'NETWORK: limpo'), coleta),
  ['NETWORK limpo exige coleta bem-sucedida']);

// Violações devem falhar.
assert.ok(verificarContrato('assayer', 'Achei um problema no código.').length > 0, 'prosa não é achado');
assert.ok(verificarContrato('assayer', 'a.py:1: 🔴 bug: x. y.\nCOBERTURA: completa\nLACUNAS: nenhuma').length > 0, 'achado sem totals');
assert.ok(verificarContrato('assayer', 'Resumo:\n' + bons.assayer).length > 0, 'prosa antes de No issues');
assert.ok(verificarContrato('assayer', 'No issues.\nCOBERTURA: parcial').length > 0, 'cobertura parcial sem lacunas');
assert.ok(verificarContrato('assayer', bons.assayer.replace('completa', 'parcial')).length > 0, 'cobertura parcial exige lacuna concreta');
assert.ok(verificarContrato('sentinel', 'a.py:1: 🔴 CRITICAL: sem CWE. x\ntotals: 1\nLACUNAS: nenhuma').length > 0, 'sem CWE');
assert.deepStrictEqual(verificarContrato('sentinel', 'No security vulnerabilities found in scope.'), ['LACUNAS']);
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
