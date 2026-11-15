'use strict';
// Verificadores do contrato de saída de cada agente e leitor do stream-json do `claude -p`.
// Funções puras: testadas offline em contratos.test.js, sem custo.

const nl = (t) => String(t || '').split(/\r?\n/).filter((l) => l.trim() !== '');

const tem = (re) => (t) => re.test(t);
const CHECKS = {
  scout: [
    ['RESPOSTA', tem(/^RESPOSTA:/m)],
    ['EVIDÊNCIA ou "não encontrado"', tem(/^EVIDÊNCIA:|^RESPOSTA:\s*não encontrado/m)],
    ['LACUNAS', tem(/^LACUNAS:/m)],
  ],
  scholar: [
    ['RESPOSTA', tem(/^RESPOSTA:/m)],
    ['FONTES com URL', (t) => /^FONTES:/m.test(t) && /https?:\/\//.test(t)],
    ['LACUNAS', tem(/^LACUNAS:/m)],
  ],
  assayer: [
    ['só achados, totals ou "No issues."', (t) => {
      const linhas = nl(t);
      if (!linhas.length) return false;
      if (linhas.length === 1 && /^No issues\.?$/.test(linhas[0].trim())) return true;
      const achado = /^\S.*:\d+: (🔴 bug|🟡 risk|🔵 nit|❓ question): /;
      const total = /^totals: /;
      const ok = linhas.every((l) => achado.test(l) || total.test(l));
      return ok && linhas.some((l) => achado.test(l)) && linhas.some((l) => total.test(l));
    }],
  ],
  sentinel: [
    ['achados com CWE e totals, ou frase de "sem achados"', (t) => {
      if (/^No security vulnerabilities found in scope\.?$/m.test(t)) return true;
      const achado = /^\S.*:\d+: (🔴 CRITICAL|🟠 HIGH|🟡 MEDIUM|🔵 LOW) \[CWE-\d+\]: /m;
      return achado.test(t) && /^totals: /m.test(t);
    }],
  ],
  scribe: [
    ['MODO', tem(/^MODO:\s*(spec|release)/m)],
    ['ARQUIVOS', tem(/^ARQUIVOS:/m)],
    ['PENDÊNCIAS', tem(/^PEND[ÊE]NCIAS:/m)],
  ],
  smith: [
    ['ARQUIVOS', tem(/^ARQUIVOS:/m)],
    ['ACEITE', tem(/^ACEITE:/m)],
    ['NOTA', tem(/^NOTA:/m)],
  ],
  tester: [
    ['STATUS', tem(/^STATUS:\s*(PASS|FAIL|BLOCKED)/m)],
    ['AMBIENTE', tem(/^AMBIENTE:/m)],
    ['FLUXO', tem(/^FLUXO:/m)],
    ['CONSOLE', tem(/^CONSOLE:/m)],
    ['NETWORK', tem(/^NETWORK:/m)],
    ['EVIDÊNCIA', tem(/^EVIDÊNCIA:/m)],
  ],
};

// Retorna a lista de itens do contrato que falharam (vazia = contrato cumprido).
function verificarContrato(agente, texto) {
  const checks = CHECKS[agente];
  if (!checks) return [`agente sem contrato definido: ${agente}`];
  return checks.filter(([, fn]) => !fn(String(texto || ''))).map(([nome]) => nome);
}

// Lê as linhas do `--output-format stream-json` e devolve texto final, usos e resultados de ferramenta.
function lerStream(saida) {
  const usos = [];
  const resultados = [];
  let ultimoTexto = '';
  let final = null;
  let custo = null;
  for (const linha of String(saida || '').split(/\r?\n/)) {
    if (!linha.trim().startsWith('{')) continue;
    let ev;
    try { ev = JSON.parse(linha); } catch { continue; }
    const blocos = ev.message && Array.isArray(ev.message.content) ? ev.message.content : [];
    if (ev.type === 'assistant') {
      for (const b of blocos) {
        if (b.type === 'tool_use') usos.push({ id: b.id, name: b.name, input: b.input || {} });
        if (b.type === 'text') ultimoTexto = b.text;
      }
    } else if (ev.type === 'user') {
      for (const b of blocos) {
        if (b.type === 'tool_result') {
          const c = Array.isArray(b.content) ? b.content.map((x) => x.text || '').join('') : String(b.content || '');
          resultados.push({ id: b.tool_use_id, erro: !!b.is_error, texto: c });
        }
      }
    }
    if (ev.type === 'result' || (typeof ev.result === 'string' && 'total_cost_usd' in ev)) {
      final = typeof ev.result === 'string' ? ev.result : final;
      if (typeof ev.total_cost_usd === 'number') custo = ev.total_cost_usd;
    }
  }
  return { texto: final !== null && final !== '' ? final : ultimoTexto, usos, resultados, custo };
}

module.exports = { verificarContrato, lerStream, CHECKS };
