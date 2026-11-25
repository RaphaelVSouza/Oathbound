'use strict';
// Offline test (zero cost) of the ADR-0010 contract checkers. Run: node test/agents/contratos.test.js
const assert = require('node:assert');
const { verificarContrato, lerStream } = require('./contratos.js');

const env = (agent, extra = '') =>
  `AGENT: ${agent}\nSCOPE: src/ @ HEAD${extra}\nSTATUS: DONE\nCONFIDENCE: HIGH`;

const bons = {
  scout: `${env('scout')}\nANSWER: command X\nEVIDENCE:\n  - a.md:24 — excerpt\nGAPS: none`,
  scholar: `${env('scholar', ' (accessed 2026-11-24)')}\nANSWER: yes\nSOURCES: https://code.claude.com/docs/x — section; accessed 2026-11-24\nGAPS: none`,
  assayer: `${env('assayer')}\nNo issues.\nCOVERAGE: complete\nGAPS: none`,
  sentinel: `${env('sentinel')}\nNo findings in scope.\nCOVERAGE: complete\nGAPS: none`,
  scribe: `${env('scribe')}\nMODE: release\nFILES: a.md — created\nGAPS: none`,
  smith: `${env('smith')}\nFILES: a — change\nACCEPTANCE: cmd -> ok\nGAPS: none`,
  breaker: `${env('breaker')}\nRESULT: PASS\nENVIRONMENT: x\nFLOW: y\nCONSOLE: clean\nNETWORK: not captured\nEVIDENCE: none\nGAPS: none`,
};
for (const [ag, txt] of Object.entries(bons)) {
  assert.deepStrictEqual(verificarContrato(ag, txt), [], `${ag} should comply`);
}

// Valid variations.
assert.deepStrictEqual(verificarContrato('scout', `${env('scout')}\nANSWER: not found\nGAPS: none`), []);
assert.deepStrictEqual(verificarContrato('assayer',
  `${env('assayer')}\na/b.py:42: BUG [HIGH]: error. fix it.\na/c.py:9: BUG [HIGH] [handoff:sentinel]: auth gap. delegate.\nc.py:7: QUESTION: intent?\ntotals: 2 BUG, 0 RISK, 0 NIT, 1 QUESTION\nCOVERAGE: complete\nGAPS: none`), []);
assert.deepStrictEqual(verificarContrato('assayer',
  `AGENT: assayer\nSCOPE: a.py\nSTATUS: PARTIAL\nCONFIDENCE: MEDIUM\nNo issues.\nCOVERAGE: partial\nGAPS: reviewed a.py. b.py remains pending due to missing access.`), []);
assert.deepStrictEqual(verificarContrato('sentinel', [
  env('sentinel'),
  'x/y.py:10: HIGH [CWE-862] [CONFIRMED]',
  'CONDITION: req.params.id -> deleteRecord(id); missing ownership check',
  'IMPACT: Cross-account record deletion (Integrity/Confidentiality)',
  'FIX: Enforce req.user.id === record.ownerId before deletion',
  'EVIDENCE: await db.records.delete({ where: { id: req.params.id } });',
  'SCORE: CVSS-B 4.0 CVSS:4.0/AV:N/AC:L/AT:N/PR:L/UI:N/VC:N/VI:H/VA:N/SC:N/SI:N/SA:N 7.1',
  'totals: 0 CRITICAL, 1 HIGH, 0 MEDIUM, 0 LOW',
  'COVERAGE: complete',
  'GAPS: none',
].join('\n')), []);
assert.deepStrictEqual(verificarContrato('sentinel', [
  env('sentinel'),
  'x/y.py:10: MEDIUM [CWE-639] [LIKELY]',
  'CONDITION: user_id query param -> fetchProfile',
  'IMPACT: Unauthorized profile read',
  'FIX: Derive identity from session token',
  'EVIDENCE: const p = fetchProfile(req.query.user_id);',
  'SCORE: not scored',
  'totals: 0 CRITICAL, 0 HIGH, 1 MEDIUM, 0 LOW',
  'COVERAGE: complete',
  'GAPS: none',
].join('\n')), []);
assert.deepStrictEqual(verificarContrato('sentinel',
  `AGENT: sentinel\nSCOPE: servico.py\nSTATUS: PARTIAL\nCONFIDENCE: MEDIUM\nNo findings in scope.\nCOVERAGE: partial\nGAPS: servico.py:10 calls a control whose configuration was not provided.`), []);
assert.deepStrictEqual(verificarContrato('breaker',
  `AGENT: breaker\nSCOPE: http://localhost:3000\nSTATUS: BLOCKED\nCONFIDENCE: HIGH\nRESULT: none\nENVIRONMENT: x\nFLOW: not run\nCONSOLE: not captured\nNETWORK: not captured\nEVIDENCE: .scratch/breaker/fail.png\nGAPS: missing credentials`), []);

// The count must match verdicts and request size.
const lote = { totalAfirmacoes: 2 };
const conferido = [
  env('scout'),
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
assert.ok(verificarContrato('assayer', `${env('assayer')}\nFound a problem in the code.`).length > 0, 'prose is not a finding');
assert.ok(verificarContrato('assayer', `${env('assayer')}\na.py:1: BUG: missing severity\ntotals: 1 BUG, 0 RISK, 0 NIT, 0 QUESTION\nCOVERAGE: complete\nGAPS: none`).length > 0, 'BUG without severity');
assert.ok(verificarContrato('assayer', `${env('assayer')}\na.py:1: BUG [HIGH]: x. y.\nCOVERAGE: complete\nGAPS: none`).length > 0, 'finding without totals');
assert.ok(verificarContrato('assayer', `${env('assayer')}\na.py:1: 🔴 bug: x. y.\ntotals: 1🔴\nCOVERAGE: complete\nGAPS: none`).length > 0, 'emoji markers rejected');
assert.ok(verificarContrato('assayer', 'Summary:\n' + bons.assayer).length > 0, 'prose before envelope');
assert.ok(verificarContrato('assayer', `${env('assayer')}\nNo issues.\nCOVERAGE: partial`).length > 0, 'partial coverage without gaps');
assert.ok(verificarContrato('assayer', bons.assayer.replace('complete', 'partial')).length > 0, 'partial coverage requires a concrete gap');
assert.ok(verificarContrato('assayer', bons.assayer.replace('STATUS: DONE', 'STATUS: PARTIAL')).length > 0, 'PARTIAL status requires partial coverage and concrete gap');
assert.ok(verificarContrato('sentinel', `${env('sentinel')}\na.py:1: CRITICAL: without CWE. x\ntotals: 1\nGAPS: none`).length > 0, 'without CWE');
assert.ok(verificarContrato('sentinel', `${env('sentinel')}\nx/y.py:10: HIGH [CWE-285] [CONFIRMED]\nCONDITION: c\nIMPACT: i\nFIX: f\nEVIDENCE: e\nSCORE: not scored\ntotals: 0 CRITICAL, 1 HIGH, 0 MEDIUM, 0 LOW\nCOVERAGE: complete\nGAPS: none`).length > 0, 'CWE-285 discouraged mapping rejected');
assert.ok(verificarContrato('sentinel', `${env('sentinel')}\nNo security vulnerabilities found in scope.\nCOVERAGE: complete\nGAPS: none`).length > 0, 'legacy absence claim rejected');
assert.ok(verificarContrato('sentinel', `${env('sentinel')}\nNo findings in scope.`).length > 0, 'missing COVERAGE and GAPS');
assert.ok(verificarContrato('smith', `${env('smith')}\nFILES: a\nACCEPTANCE: ok\nNOTE: x`).length > 0, 'legacy NOTE rejected');
assert.ok(verificarContrato('scribe', `${env('scribe')}\nMODE: spec\nFILES: a\nPENDING: x`).length > 0, 'legacy PENDING rejected');
assert.ok(verificarContrato('scout', 'Answer: x').length > 0);
assert.ok(verificarContrato('scholar', `${env('scholar')}\nANSWER: x\nSOURCES: none\nGAPS: x`).length > 0, 'without URL');
assert.ok(verificarContrato('breaker', `${env('breaker')}\nRESULT: none\nENVIRONMENT: x\nFLOW: y\nCONSOLE: clean\nNETWORK: clean\nEVIDENCE: none\nGAPS: none`).length > 0, 'DONE requires PASS or FAIL');
assert.ok(verificarContrato('breaker', bons.breaker.replace('STATUS: DONE', 'STATUS: BLOCKED')).length > 0, 'BLOCKED requires RESULT: none and concrete gap');
assert.ok(verificarContrato('inexistente', 'x').length > 0);
assert.ok(verificarContrato('smith', '').length >= 6, 'empty fails envelope and body checks');

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
