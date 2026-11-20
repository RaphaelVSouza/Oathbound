'use strict';
// Cost report test: fixtures in a temporary directory via CUSTO_HOME.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI = path.join(__dirname, 'custo.js');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'custo-'));
const PROMPT = 'SEGREDO_PROMPT_XYZ';
const RESPOSTA = 'SEGREDO_RESPOSTA_ABC';
const CWD = 'C:\\pasta_privada_do_usuario';

const jl = (...ls) => ls.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n';
const asst = (id, model, usage, ts, extra = {}) => ({
  type: 'assistant', timestamp: ts, cwd: CWD, requestId: 'req_' + id, ...extra,
  message: { id, model, content: [{ type: 'text', text: RESPOSTA }], usage },
});

const dirP = path.join(home, 'projects', 'projA');
const sessao = 'aaaaaaaa-1111-2222-3333-444444444444';
fs.mkdirSync(path.join(dirP, sessao, 'subagents'), { recursive: true });

fs.writeFileSync(path.join(dirP, sessao + '.jsonl'), jl(
  { type: 'user', timestamp: '2026-10-05T10:00:00Z', cwd: CWD, message: { role: 'user', content: PROMPT } },
  // streamed m1: first occurrence partial, latest wins
  asst('m1', 'claude-sonnet-5-5', { input_tokens: 1, output_tokens: 5 }, '2026-10-05T10:00:01Z'),
  asst('m1', 'claude-sonnet-5-5', {
    input_tokens: 1000000, output_tokens: 100000, cache_read_input_tokens: 2000000,
    cache_creation_input_tokens: 700000,
    cache_creation: { ephemeral_5m_input_tokens: 500000, ephemeral_1h_input_tokens: 200000 },
  }, '2026-10-05T10:00:02Z'),
  // no cache_creation object: everything counts as 5m; invalid timestamp
  asst('m2', 'claude-sonnet-5-5', { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 400000 }, 'lixo'),
  '{ corrupt line',
  asst('m3', 'claude-foo-1', { input_tokens: 1000, output_tokens: 2000 }, '2026-10-06T00:00:00Z'),
  asst('m4', '<synthetic>', { input_tokens: 999, output_tokens: 999 }, '2026-10-06T00:00:00Z'),
  { type: 'assistant', timestamp: '2026-10-06T00:00:00Z', message: { id: 'm5', model: 'claude-sonnet-5-5', content: [] } },
  // subagent marked by isSidechain in the main file; 11K prompt, Haiku low tier
  asst('s2', 'claude-haiku-5-5', { input_tokens: 10000, output_tokens: 1000 }, '2026-10-07T00:00:00Z', { isSidechain: true }),
));

fs.writeFileSync(path.join(dirP, sessao, 'subagents', 'agent-x.jsonl'), jl(
  // prompt 50000 + 40000 + 20000 = 110000 > 100K: high tier
  asst('s1', 'claude-haiku-5-5', {
    input_tokens: 50000, output_tokens: 10000, cache_read_input_tokens: 40000,
    cache_creation_input_tokens: 20000,
    cache_creation: { ephemeral_5m_input_tokens: 20000, ephemeral_1h_input_tokens: 0 },
  }, '2026-10-07T00:00:01Z', { isSidechain: true }),
));

function rodar(...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { env: { ...process.env, CUSTO_HOME: home }, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  return r.stdout;
}
const perto = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

// Hand-calculated values (US$ per million tokens)
const m1 = 1e6 * 2 / 1e6 + 1e5 * 10 / 1e6 + 2e6 * 0.10 / 1e6 + 5e5 * 2.5 / 1e6 + 2e5 * 4 / 1e6; // 5,25
const m2 = 4e5 * 2.5 / 1e6; // 1,00
const s1 = 5e4 * 0.5 / 1e6 + 1e4 * 2.5 / 1e6 + 4e4 * 0.005 / 1e6 + 2e4 * 0.625 / 1e6; // 0,0627
const s2 = 1e4 * 0.1 / 1e6 + 1e3 * 0.5 / 1e6; // 0,0015
const hipot = (5e4 * 2 + 1e4 * 10 + 4e4 * 0.1 + 2e4 * 2.5 + 1e4 * 2 + 1e3 * 10) / 1e6; // subagents at Sonnet prices
perto(m1, 5.25);

try {
  const j = JSON.parse(rodar('--json'));
  perto(j.total.usd, m1 + m2 + s1 + s2);
  assert.strictEqual(j.total.mensagens, 4);
  assert.strictEqual(j.linhas_ilegiveis, 1);

  const achar = (mes, modelo, origem) => j.linhas.find((l) => l.mes === mes && l.modelo === modelo && l.origem === origem);
  const p = achar('2026-10', 'claude-sonnet-5-5', 'principal');
  assert.strictEqual(p.mensagens, 1); // duplicate counted once
  assert.strictEqual(p.input, 1000000);
  assert.strictEqual(p.cache_write, 700000);
  perto(p.usd, m1);
  perto(achar('no date', 'claude-sonnet-5-5', 'principal').usd, m2);
  assert.ok(!j.linhas.some((l) => /^\d{4}-\d{2}$/.test(l.mes) === false && l.mes !== 'no date'));

  const sub = achar('2026-10', 'claude-haiku-5-5', 'subagente');
  assert.strictEqual(sub.mensagens, 2);
  perto(sub.usd, s1 + s2);
  assert.strictEqual(j.haiku_faixa_alta.mensagens, 1);

  assert.deepStrictEqual(j.sem_preco.map((s) => [s.modelo, s.mensagens, s.input, s.output]), [['claude-foo-1', 1, 1000, 2000]]);

  const c = j.contrafactual_subagentes;
  assert.strictEqual(c.modelo_principal_predominante, 'claude-sonnet-5-5');
  perto(c.usd_contrafactual, hipot);
  perto(c.diferenca_usd, hipot - (s1 + s2));

  const lido = 2040000;
  const criado = 700000 + 400000 + 20000;
  const novo = 1000000 + 50000 + 10000;
  perto(j.razao_cache_hit, lido / (lido + criado + novo));
  perto(j.decomposicao_pct.cache_write, ((5e5 * 2.5 + 2e5 * 4 + 4e5 * 2.5 + 2e4 * 0.625) / 1e6 / j.total.usd) * 100);
  assert.strictEqual(j.sessoes[0].sessao, 'aaaaaaaa');

  // month filter excludes "no date"
  const jm = JSON.parse(rodar('2026-10', '--json'));
  perto(jm.total.usd, m1 + s1 + s2);
  // session filter
  assert.strictEqual(JSON.parse(rodar('--sessao', 'bbbb', '--json')).total.mensagens, 0);
  assert.strictEqual(JSON.parse(rodar('--sessao', 'aaaa', '--json')).total.mensagens, 4);

  // privacy: no prompt, response, or paths
  const txt = rodar();
  assert.ok(txt.includes('Unpriced') && txt.includes('WARNING') && txt.includes('Subagents priced at the predominant main model rate'));
  for (const saida of [txt, JSON.stringify(j)]) {
    for (const proibido of [PROMPT, RESPOSTA, CWD, home, sessao, 'req_']) {
      assert.ok(!saida.includes(proibido), `leaked: ${proibido}`);
    }
  }
  console.log('ok: custo');
} finally {
  fs.rmSync(home, { recursive: true, force: true });
}
