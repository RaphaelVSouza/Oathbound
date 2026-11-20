'use strict';
const assert = require('assert');
const path = require('path');
const { resumir, formatar } = require(path.join(__dirname, '..', '..', 'claude', 'hooks', 'audit-resumo.js'));
const R = [
  { ts: '2026-11-01T10:00:00Z', agente: 'scout', agent_id: 'a1', sessao: 's1', ferramenta: 'Read' },
  { ts: '2026-11-02T10:00:00Z', agente: 'scout', agent_id: 'a1', sessao: 's1', ferramenta: 'Grep' },
  // Denied call: two lines (global hook call + guard denial).
  { ts: '2026-11-02T11:00:00Z', agente: 'assayer', agent_id: 'a2', sessao: 's1', ferramenta: 'Bash' },
  { ts: '2026-11-02T11:00:00Z', agente: 'assayer', agent_id: 'a2', sessao: 's1', ferramenta: 'Bash', bloqueado: true, motivo: 'redirection' },
  { ts: '2026-12-01T10:00:00Z', agente: 'scout', agent_id: 'a3', sessao: 's2', ferramenta: 'Read' },
  { ts: 'lixo', agente: 'x', ferramenta: 'Read' },
];
const r = resumir(R);
assert.deepStrictEqual(Object.keys(r).sort(), ['2026-11', '2026-12']);
assert.strictEqual(r['2026-11'].scout.chamadas, 2);
assert.strictEqual(r['2026-11'].scout.execucoes, 1);
assert.strictEqual(r['2026-11'].assayer.chamadas, 1, 'denial does not count as an extra call');
assert.strictEqual(r['2026-11'].assayer.ferramentas.Bash, 1);
assert.strictEqual(r['2026-11'].assayer.bloqueios, 1);
assert.strictEqual(r['2026-11'].assayer.taxa_bloqueio, 1);
assert.strictEqual(r['2026-11'].assayer.orfas, 0);
// Orphan denial (no call line) counts as a call; rate never exceeds 1; tool appears.
const O = resumir([
  { ts: '2026-11-03T10:00:00Z', agente: 'sentinel', agent_id: 'b1', ferramenta: 'Bash', alvo: 'touch x', bloqueado: true, motivo: 'm' },
  { ts: '2026-11-03T10:00:01Z', agente: 'sentinel', agent_id: 'b1', ferramenta: 'Read', alvo: 'f', erro: 'payload_grande' },
]);
assert.strictEqual(O['2026-11'].sentinel.orfas, 1);
assert.strictEqual(O['2026-11'].sentinel.chamadas, 2);
assert.strictEqual(O['2026-11'].sentinel.ferramentas.Bash, 1);
assert.strictEqual(O['2026-11'].sentinel.taxa_bloqueio, 0.5);
assert.strictEqual(O['2026-11'].sentinel.erros, 1);
assert.deepStrictEqual(Object.keys(resumir(R, '2026-12')), ['2026-12']);
assert.ok(formatar(r).includes('block x1: redirection'));
assert.strictEqual(formatar({}), 'no records\n');
console.log('ok audit-resumo');
