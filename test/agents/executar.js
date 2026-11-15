#!/usr/bin/env node
'use strict';
// Suíte de regressão dos subagentes. GASTA COTA (haiku, teto por caso): rode só quando
// um agente, hook ou regra de permissão mudar, e registre o resultado no commit.
//
//   node test/agents/executar.js --listar
//   node test/agents/executar.js                  # todos os casos
//   node test/agents/executar.js --agente sentinel
//   node test/agents/executar.js --caso scout-segredo
//   node test/agents/executar.js --repeticoes 3   # mede variação do modelo
//
// Variáveis: AGENT_TEST_REPO (padrão: OATHBOUND_TEST_REPO ou raiz do repo), CLAUDE_BIN (padrão: claude),
// AGENT_TEST_BUDGET_USD (padrão 0.30 por caso), AGENT_TEST_MODEL (padrão haiku).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { CASOS } = require('./casos.js');
const { lerStream } = require('./contratos.js');

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

if (args.includes('--listar')) {
  for (const c of CASOS) console.log(`${c.id}\t${c.agente}`);
  process.exit(0);
}

const REPO = process.env.AGENT_TEST_REPO || process.env.OATHBOUND_TEST_REPO || path.resolve(__dirname, '..', '..');
const BIN = process.env.CLAUDE_BIN || 'claude';
const ORCAMENTO = process.env.AGENT_TEST_BUDGET_USD || '0.30';
const MODELO = process.env.AGENT_TEST_MODEL || 'haiku';
const filtroAgente = opt('--agente');
const filtroCaso = opt('--caso');
const casos = CASOS.filter((c) => (!filtroAgente || c.agente === filtroAgente) && (!filtroCaso || c.id === filtroCaso));
if (!casos.length) { console.error('nenhum caso selecionado'); process.exit(2); }
const repeticoes = Math.max(1, parseInt(opt('--repeticoes') || '1', 10) || 1);
const fila = [];
for (const c of casos) for (let i = 1; i <= repeticoes; i++) fila.push({ caso: c, rodada: i });

const resultados = [];
for (const { caso, rodada } of fila) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-reg-'));
  const ctx = { repo: REPO, tmp, texto: '', usos: [], resultados: [], extra: {} };
  const linha = { caso: caso.id, rodada, agente: caso.agente, ok: false, falhas: [], custo: null };
  try {
    if (caso.prep) caso.prep(ctx);
    // Falha de ambiente (ex.: MCP ainda conectando) não é regressão: repete até 3 vezes.
    let custoTotal = 0;
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      const r = spawnSync(BIN, [
        '-p', caso.prompt(ctx), ...(caso.agente ? ['--agent', caso.agente] : []), '--model', MODELO,
        '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
        '--max-budget-usd', ORCAMENTO, '--permission-mode', 'auto',
        ...(caso.args || []),
      ], { cwd: REPO, encoding: 'utf8', timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
      if (r.error) throw r.error;
      Object.assign(ctx, lerStream(r.stdout));
      custoTotal += ctx.custo || 0;
      linha.tentativas = tentativa;
      if (!(caso.infra && caso.infra(ctx))) break;
      linha.infra = true;
    }
    linha.custo = custoTotal;
    if (caso.infra && caso.infra(ctx)) {
      linha.inconclusivo = true;
      linha.falhas.push('INCONCLUSIVO: falha de ambiente persistiu em 3 tentativas');
    }
    for (const [nome, fn] of linha.inconclusivo ? [] : caso.checks) {
      let res;
      try { res = fn(ctx); } catch (e) { res = `erro na checagem: ${e.message}`; }
      if (res !== true) linha.falhas.push(`${nome}: ${res === false ? 'falhou' : res}`);
    }
    linha.ok = linha.falhas.length === 0;
    if (!linha.ok) {
      linha.ferramentas = ctx.usos.map((u) => u.name);
      linha.saida = String(ctx.texto).slice(0, 600);
    }
  } catch (e) {
    linha.falhas.push(`execução: ${e.message}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  resultados.push(linha);
  const rotulo = linha.ok ? 'PASS' : (linha.inconclusivo ? 'INCONC' : 'FAIL');
  console.log(`${rotulo}  ${caso.id}${repeticoes > 1 ? ` #${rodada}` : ''}${linha.tentativas > 1 ? ` (${linha.tentativas} tentativas)` : ''}${linha.custo != null ? `  ($${linha.custo.toFixed(4)})` : ''}`);
  for (const f of linha.falhas) console.log(`      - ${f}`);
}

const total = resultados.reduce((s, r) => s + (r.custo || 0), 0);
const falhos = resultados.filter((r) => !r.ok).length;
if (repeticoes > 1) {
  console.log('\ntaxa de aprovação por caso:');
  for (const c of casos) {
    const rs = resultados.filter((r) => r.caso === c.id);
    console.log(`  ${c.id}: ${rs.filter((r) => r.ok).length}/${rs.length}`);
  }
}
console.log(`\n${resultados.length - falhos}/${resultados.length} execuções passaram; custo total $${total.toFixed(4)}; modelo ${MODELO}`);

const dir = path.join(os.homedir(), '.claude', 'state');
fs.mkdirSync(dir, { recursive: true });
const relatorio = path.join(dir, `regressao-agentes-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(relatorio, JSON.stringify({ data: new Date().toISOString(), modelo: MODELO, resultados }, null, 2));
console.log(`relatório: ${relatorio}`);
process.exit(falhos ? 1 : 0);
