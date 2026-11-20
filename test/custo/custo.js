#!/usr/bin/env node
'use strict';
// Dollar cost report from Claude Code transcripts.
// Read-only; offline; no dependencies.
// Usage: node custo.js [YYYY-MM] [--json] [--sessao <id-prefix>]
// Output: never includes prompt text or paths; only session ID (8 chars) and project name.
// Errors: invalid options exit with code 2; unexpected failures exit with code 1.

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const HOME = process.env.CUSTO_HOME || path.join(os.homedir(), '.claude');
const PRECOS = JSON.parse(fs.readFileSync(path.join(__dirname, 'precos.json'), 'utf8'));
const SEM_DATA = 'no date';

function listarJsonl(dir) {
  const out = [];
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listarJsonl(p));
    else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
  }
  return out.sort();
}

// Position determines project and session: projects/<proj>/<session>.jsonl or projects/<proj>/<session>/subagents/*.jsonl
function identificar(arquivo, raiz) {
  const partes = path.relative(raiz, arquivo).split(path.sep);
  return {
    projeto: partes[0],
    sessao: partes[1].replace(/\.jsonl$/, ''),
    emSubagents: partes.includes('subagents'),
  };
}

function mesDe(ts) {
  if (typeof ts !== 'string') return SEM_DATA;
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return SEM_DATA;
  return new Date(t).toISOString().slice(0, 7);
}

function achaPreco(modelo) {
  const m = PRECOS.modelos;
  if (m[modelo]) return m[modelo];
  const chave = Object.keys(m).find((k) => modelo.startsWith(k + '-'));
  return chave ? m[chave] : null;
}

function extrairTokens(usage) {
  const n = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
  const cc = usage.cache_creation;
  let w5 = 0;
  let w1 = 0;
  if (cc && typeof cc === 'object' && (cc.ephemeral_5m_input_tokens !== undefined || cc.ephemeral_1h_input_tokens !== undefined)) {
    w5 = n(cc.ephemeral_5m_input_tokens);
    w1 = n(cc.ephemeral_1h_input_tokens);
  } else {
    w5 = n(usage.cache_creation_input_tokens);
  }
  return { input: n(usage.input_tokens), output: n(usage.output_tokens), cache_read: n(usage.cache_read_input_tokens), w5, w1 };
}

// Rates per million tokens. Haiku: prompts above the limit use the high tier, per message.
function precificar(t, p) {
  let tar = p;
  let faixaAlta = false;
  const fa = p.faixa_alta;
  if (fa && t.input + t.cache_read + t.w5 + t.w1 > fa.prompt_acima_de) {
    tar = { ...p, ...fa };
    faixaAlta = true;
  }
  const c = {
    input: (t.input * tar.input) / 1e6,
    output: (t.output * tar.output) / 1e6,
    cache_read: (t.cache_read * tar.cache_read) / 1e6,
    cache_write: (t.w5 * tar.cache_write_5m + t.w1 * tar.cache_write_1h) / 1e6,
  };
  c.total = c.input + c.output + c.cache_read + c.cache_write;
  return { c, faixaAlta };
}

async function lerTranscritos(raiz) {
  const proj = path.join(raiz, 'projects');
  const msgs = new Map();
  let ilegiveis = 0;
  let semChave = 0;
  for (const arq of listarJsonl(proj)) {
    const id = identificar(arq, proj);
    const rl = readline.createInterface({ input: fs.createReadStream(arq, { encoding: 'utf8' }), crlfDelay: Infinity });
    for await (const linha of rl) {
      if (!linha.trim()) continue;
      let o;
      try { o = JSON.parse(linha); } catch { ilegiveis++; continue; }
      if (!o || o.type !== 'assistant' || !o.message || !o.message.usage || typeof o.message.usage !== 'object') continue;
      const modelo = o.message.model;
      if (typeof modelo !== 'string' || modelo === '<synthetic>') continue;
      const chave = o.message.id || o.requestId || `sem-chave-${semChave++}`;
      // Streaming repeats the ID; the latest occurrence wins.
      msgs.set(chave, {
        modelo,
        origem: id.emSubagents || o.isSidechain === true ? 'subagente' : 'principal',
        mes: mesDe(o.timestamp),
        sessao: id.sessao.slice(0, 8),
        projeto: id.projeto,
        tokens: extrairTokens(o.message.usage),
      });
    }
  }
  return { msgs: [...msgs.values()], ilegiveis };
}

function novoAcc() {
  return { mensagens: 0, input: 0, output: 0, cache_read: 0, cache_write: 0, usd: 0 };
}
function somar(a, t, usd) {
  a.mensagens++;
  a.input += t.input;
  a.output += t.output;
  a.cache_read += t.cache_read;
  a.cache_write += t.w5 + t.w1;
  a.usd += usd;
}

function calcular(msgs, ilegiveis, filtroMes, filtroSessao) {
  const grupos = new Map();
  const sessoes = new Map();
  const semPreco = new Map();
  const total = novoAcc();
  const comp = { cache_read: 0, cache_write: 0, output: 0, input: 0 };
  const cacheTok = { cache_read: 0, creation: 0, input: 0 };
  const usdPorModeloPrincipal = new Map();
  let faixaAltaMsgs = 0;
  let faixaAltaCacheRead = 0;
  const subs = [];

  for (const m of msgs) {
    if (filtroMes && m.mes !== filtroMes) continue;
    if (filtroSessao && !m.sessao.startsWith(filtroSessao.slice(0, 8))) continue;
    const t = m.tokens;
    const p = achaPreco(m.modelo);
    if (!p) {
      const s = semPreco.get(m.modelo) || { modelo: m.modelo, mensagens: 0, input: 0, output: 0, cache_read: 0, cache_write: 0 };
      s.mensagens++; s.input += t.input; s.output += t.output; s.cache_read += t.cache_read; s.cache_write += t.w5 + t.w1;
      semPreco.set(m.modelo, s);
      continue;
    }
    const { c, faixaAlta } = precificar(t, p);
    if (faixaAlta) { faixaAltaMsgs++; faixaAltaCacheRead += t.cache_read; }
    const k = `${m.mes}\t${m.modelo}\t${m.origem}`;
    if (!grupos.has(k)) grupos.set(k, { mes: m.mes, modelo: m.modelo, origem: m.origem, ...novoAcc() });
    somar(grupos.get(k), t, c.total);
    somar(total, t, c.total);
    const sk = `${m.sessao}\t${m.projeto}`;
    if (!sessoes.has(sk)) sessoes.set(sk, { sessao: m.sessao, projeto: m.projeto, principal: 0, subagente: 0, usd: 0 });
    const se = sessoes.get(sk);
    se.usd += c.total;
    se[m.origem] += c.total;
    comp.cache_read += c.cache_read; comp.cache_write += c.cache_write; comp.output += c.output; comp.input += c.input;
    cacheTok.cache_read += t.cache_read; cacheTok.creation += t.w5 + t.w1; cacheTok.input += t.input;
    if (m.origem === 'principal') usdPorModeloPrincipal.set(m.modelo, (usdPorModeloPrincipal.get(m.modelo) || 0) + c.total);
    else subs.push({ t, usd: c.total });
  }

  let contrafactual = null;
  if (usdPorModeloPrincipal.size && subs.length) {
    const [modelo] = [...usdPorModeloPrincipal.entries()].sort((a, b) => b[1] - a[1])[0];
    const p = achaPreco(modelo);
    let hipot = 0;
    let real = 0;
    for (const s of subs) { hipot += precificar(s.t, p).c.total; real += s.usd; }
    contrafactual = { modelo_principal_predominante: modelo, usd_real: real, usd_contrafactual: hipot, diferenca_usd: hipot - real };
  }

  const denom = cacheTok.cache_read + cacheTok.creation + cacheTok.input;
  const pct = (v) => (total.usd > 0 ? (v / total.usd) * 100 : 0);
  const estimados = [];
  for (const [nome, p] of Object.entries(PRECOS.modelos)) {
    const campos = Object.entries(p.verificado).filter(([, v]) => v === false).map(([k]) => k);
    if (campos.length) estimados.push({ modelo: nome, campos });
  }

  return {
    filtros: { mes: filtroMes || null, sessao: filtroSessao || null },
    precos_data: PRECOS.data,
    linhas_ilegiveis: ilegiveis,
    linhas: [...grupos.values()].sort((a, b) => (a.mes + a.modelo + a.origem).localeCompare(b.mes + b.modelo + b.origem)),
    total,
    razao_cache_hit: denom ? cacheTok.cache_read / denom : null,
    decomposicao_pct: { cache_read: pct(comp.cache_read), cache_write: pct(comp.cache_write), output: pct(comp.output), input_novo: pct(comp.input) },
    contrafactual_subagentes: contrafactual,
    sem_preco: [...semPreco.values()],
    sessoes: [...sessoes.values()].sort((a, b) => b.usd - a.usd),
    haiku_faixa_alta: { mensagens: faixaAltaMsgs, cache_read_tokens_com_tarifa_estimada: faixaAltaCacheRead },
    precos_estimados: estimados,
  };
}

const f = new Intl.NumberFormat('en-US');
const usd = (v) => 'US$ ' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function tabela(cab, linhas) {
  const larg = cab.map((h, i) => Math.max(h.length, ...linhas.map((l) => String(l[i]).length)));
  const fmt = (l) => l.map((c, i) => (i < 3 ? String(c).padEnd(larg[i]) : String(c).padStart(larg[i]))).join('  ');
  return [fmt(cab), larg.map((w) => '-'.repeat(w)).join('  '), ...linhas.map(fmt)].join('\n');
}

function texto(r) {
  const o = [];
  o.push('Cost report (prices as of ' + r.precos_data + ')');
  if (r.filtros.mes || r.filtros.sessao) o.push(`Filters: month=${r.filtros.mes || '-'} session=${r.filtros.sessao || '-'}`);
  o.push('');
  o.push(tabela(['month', 'model', 'source', 'msgs', 'input', 'output', 'cache_read', 'cache_write', 'US$'],
    r.linhas.map((l) => [l.mes, l.modelo, l.origem === 'subagente' ? 'subagent' : 'main', f.format(l.mensagens), f.format(l.input), f.format(l.output), f.format(l.cache_read), f.format(l.cache_write), usd(l.usd)])));
  o.push('');
  o.push(`Grand total: ${usd(r.total.usd)} across ${f.format(r.total.mensagens)} messages`);
  o.push(`Cache hit ratio: ${r.razao_cache_hit === null ? 'n/a' : (r.razao_cache_hit * 100).toFixed(1) + '%'}`);
  const d = r.decomposicao_pct;
  o.push(`US$ breakdown: cache read ${d.cache_read.toFixed(1)}% | cache write ${d.cache_write.toFixed(1)}% | output ${d.output.toFixed(1)}% | new input ${d.input_novo.toFixed(1)}%`);
  const c = r.contrafactual_subagentes;
  if (c) {
    o.push(`Subagents priced at the predominant main model rate (${c.modelo_principal_predominante}): ${usd(c.usd_contrafactual)} vs real ${usd(c.usd_real)}; difference ${c.diferenca_usd >= 0 ? '+' : '-'}${usd(Math.abs(c.diferenca_usd))}`);
  } else {
    o.push('Subagents priced at the predominant main model rate: n/a (no priced subagent or main messages)');
  }
  if (r.sem_preco.length) {
    o.push('');
    o.push('Unpriced (dollar amount not calculated):');
    o.push(tabela(['model', '', '', 'msgs', 'input', 'output', 'cache_read', 'cache_write'],
      r.sem_preco.map((s) => [s.modelo, '', '', f.format(s.mensagens), f.format(s.input), f.format(s.output), f.format(s.cache_read), f.format(s.cache_write)])));
  }
  o.push('');
  o.push('Highest-cost sessions (id, project, main, subagent, total):');
  for (const s of r.sessoes.slice(0, 10)) o.push(`  ${s.sessao}  ${s.projeto}  ${usd(s.principal)}  ${usd(s.subagente)}  ${usd(s.usd)}`);
  o.push('');
  o.push('WARNING: estimated prices (not confirmed in the official table):');
  for (const e of r.precos_estimados) o.push(`  - ${e.modelo}: ${e.campos.join(', ')}`);
  if (r.haiku_faixa_alta.mensagens) o.push(`  - Haiku prompts above 100K: ${r.haiku_faixa_alta.mensagens} message(s); cache_read in this tier (${f.format(r.haiku_faixa_alta.cache_read_tokens_com_tarifa_estimada)} tokens) uses an estimated rate`);
  if (r.linhas_ilegiveis) o.push(`Unreadable JSON lines ignored: ${r.linhas_ilegiveis}`);
  return o.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  let json = false;
  let mes = null;
  let sessao = null;
  const uso = 'Usage: node custo.js [YYYY-MM] [--json] [--sessao <id-prefix>]';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') json = true;
    else if (args[i] === '--sessao') {
      sessao = args[++i];
      if (!sessao) { console.error(uso); process.exit(2); }
    } else if (/^\d{4}-\d{2}$/.test(args[i])) mes = args[i];
    else { console.error(uso); process.exit(2); }
  }
  const { msgs, ilegiveis } = await lerTranscritos(HOME);
  const r = calcular(msgs, ilegiveis, mes, sessao);
  console.log(json ? JSON.stringify(r, null, 2) : texto(r));
}

if (require.main === module) {
  main().catch((e) => { console.error('Error: ' + e.message); process.exit(1); });
}

module.exports = { achaPreco, extrairTokens, precificar, listarJsonl };
