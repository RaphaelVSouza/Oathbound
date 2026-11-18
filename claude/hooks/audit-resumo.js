#!/usr/bin/env node
'use strict';
// Resumo da trilha de auditoria por mês e agente.
//   node ~/.claude/hooks/audit-resumo.js [AAAA-MM] [--json]
// Lê state/agent-audit.jsonl e rotacionados (.1, .2...). Variável: AGENT_AUDIT_DIR.
const fs = require('fs');
const os = require('os');
const path = require('path');

function lerLinhas(dir) {
  const base = 'agent-audit.jsonl';
  let nomes = [];
  try { nomes = fs.readdirSync(dir).filter((n) => n === base || n.startsWith(base + '.')); } catch { return []; }
  const out = [];
  for (const n of nomes) {
    for (const l of fs.readFileSync(path.join(dir, n), 'utf8').split('\n')) {
      if (!l.trim()) continue;
      try { out.push(JSON.parse(l)); } catch { /* linha corrompida: ignora */ }
    }
  }
  return out;
}

function resumir(registros, mes) {
  const por = {};
  for (const r of registros) {
    const m = String(r.ts || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m) || (mes && m !== mes)) continue;
    const a = (por[m] ||= {});
    const e = (a[r.agente || '?'] ||= { chamadas: 0, bloqueios: 0, erros: 0, sessoes: new Set(), agentes: new Set(), ferramentas: {}, motivos: {}, pares: {} });
    if (r.sessao) e.sessoes.add(r.sessao);
    if (r.agent_id) e.agentes.add(r.agent_id);
    // Chamada negada gera duas linhas (a da chamada, pelo hook global, e a da negação, pelo guard,
    // com bloqueado:true). A linha com bloqueado:true conta só como bloqueio; a chamada já foi contada.
    // Negação sem a linha da chamada (dado antigo, hook global que falhou) vira órfã e é somada abaixo.
    const chave = JSON.stringify([r.agent_id, r.ferramenta, r.tool_use_id ?? r.alvo]);
    const p = (e.pares[chave] ||= { chamadas: 0, bloqueios: 0, ferramenta: r.ferramenta });
    if (r.bloqueado) {
      e.bloqueios++;
      p.bloqueios++;
      const mo = r.motivo || 'sem motivo';
      e.motivos[mo] = (e.motivos[mo] || 0) + 1;
    } else {
      e.chamadas++;
      p.chamadas++;
      if (r.erro) e.erros++; // payload ilegível, grande ou lento: a chamada existiu, o conteúdo não foi lido
      e.ferramentas[r.ferramenta] = (e.ferramentas[r.ferramenta] || 0) + 1;
    }
  }
  const res = {};
  for (const [m, ags] of Object.entries(por)) {
    res[m] = {};
    for (const [n, e] of Object.entries(ags)) {
      let orfas = 0;
      for (const p of Object.values(e.pares)) {
        const falta = Math.max(0, p.bloqueios - p.chamadas);
        orfas += falta;
        e.ferramentas[p.ferramenta] = (e.ferramentas[p.ferramenta] || 0) + falta;
      }
      const chamadas = e.chamadas + orfas;
      res[m][n] = {
        chamadas, bloqueios: e.bloqueios, orfas, erros: e.erros,
        taxa_bloqueio: chamadas ? +(e.bloqueios / chamadas).toFixed(3) : 0,
        execucoes: e.agentes.size, sessoes: e.sessoes.size,
        ferramentas: e.ferramentas, motivos: e.motivos,
      };
    }
  }
  return res;
}

function formatar(res) {
  const L = [];
  for (const m of Object.keys(res).sort()) {
    L.push(`## ${m}`);
    L.push('agente\texecuções\tchamadas\tbloqueios\ttaxa\tferramentas');
    for (const [n, e] of Object.entries(res[m]).sort((a, b) => b[1].chamadas - a[1].chamadas)) {
      const f = Object.entries(e.ferramentas).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ');
      L.push(`${n}\t${e.execucoes}\t${e.chamadas}\t${e.bloqueios}\t${(e.taxa_bloqueio * 100).toFixed(1)}%\t${f}`);
    }
    const mot = {};
    for (const e of Object.values(res[m])) for (const [k, v] of Object.entries(e.motivos)) mot[k] = (mot[k] || 0) + v;
    for (const [k, v] of Object.entries(mot).sort((a, b) => b[1] - a[1]).slice(0, 5)) L.push(`  bloqueio x${v}: ${k}`);
    L.push('');
  }
  return L.join('\n') || 'sem registros\n';
}

module.exports = { lerLinhas, resumir, formatar };

if (require.main === module) {
  const args = process.argv.slice(2);
  const mes = args.find((a) => /^\d{4}-\d{2}$/.test(a));
  const dir = process.env.AGENT_AUDIT_DIR || path.join(os.homedir(), '.claude', 'state');
  const res = resumir(lerLinhas(dir), mes);
  process.stdout.write(args.includes('--json') ? JSON.stringify(res, null, 2) + '\n' : formatar(res));
}
