'use strict';
// Output contract checkers for each agent (ADR-0010) and a stream-json reader for `claude -p`.
// Pure functions: tested offline in contratos.test.js, at no cost.

const nl = (t) => String(t || '').split(/\r?\n/).filter((l) => l.trim() !== '');

const tem = (re) => (t) => re.test(t);
const lacunas = tem(/^GAPS:[ \t]+\S/m);

function extrairCampo(linhas, prefixo) {
  const linha = linhas.find((l) => l.startsWith(prefixo));
  return linha ? linha.slice(prefixo.length).trim() : null;
}

function verificarEnvelope(agente, texto) {
  const falhas = [];
  const linhas = nl(texto);
  const statusMatch = texto.match(/^STATUS:[ \t]+(DONE|PARTIAL|BLOCKED)[ \t]*$/m);
  const confMatch = texto.match(/^CONFIDENCE:[ \t]+(HIGH|MEDIUM|LOW)[ \t]*$/m);
  const gapsVal = extrairCampo(linhas, 'GAPS:');

  if (!new RegExp(`^AGENT:[ \\t]+${agente}[ \\t]*$`, 'm').test(texto)) falhas.push('AGENT');
  if (!/^SCOPE:[ \t]+\S/m.test(texto)) falhas.push('SCOPE');
  if (!statusMatch) falhas.push('STATUS');
  if (!confMatch) falhas.push('CONFIDENCE');
  if (!gapsVal) falhas.push('GAPS');
  if (statusMatch && statusMatch[1] !== 'DONE' && gapsVal && /^none\.?$/i.test(gapsVal)) {
    falhas.push('GAPS must name a concrete gap when STATUS is PARTIAL or BLOCKED');
  }
  if (/^(?:NOTE|PENDING):/m.test(texto)) falhas.push('legacy NOTE/PENDING is prohibited');
  return falhas;
}

function removerCabecalhoEnvelope(linhas) {
  const esperado = ['AGENT:', 'SCOPE:', 'STATUS:', 'CONFIDENCE:'];
  if (linhas.length < esperado.length) return null;
  for (let i = 0; i < esperado.length; i++) {
    if (!linhas[i].startsWith(esperado[i])) return null;
  }
  return linhas.slice(esperado.length);
}

function verificarCoberturaERodape(corpo, status) {
  if (!corpo || corpo.length < 2) return null;
  const pendencias = corpo.pop();
  const cobertura = corpo.pop();
  if (!/^COVERAGE: (complete|partial)$/.test(cobertura) || !lacunas(pendencias)) return null;
  if (cobertura === 'COVERAGE: partial' && /^GAPS:\s+none\.?\s*$/i.test(pendencias)) return null;
  if (status === 'PARTIAL' && cobertura !== 'COVERAGE: partial') return null;
  return corpo;
}

function revisarCobertura(texto) {
  const linhas = removerCabecalhoEnvelope(nl(texto));
  const status = extrairCampo(nl(texto), 'STATUS:');
  const corpo = verificarCoberturaERodape(linhas, status);
  if (!corpo || corpo.length === 0) return false;
  if (corpo.length === 1 && /^No issues\.?$/.test(corpo[0])) return true;
  const total = corpo.pop();
  const achado = /^\S.*:\d+: (?:(?:BUG|RISK) \[(?:CRITICAL|HIGH|MEDIUM|LOW)\](?: \[handoff:sentinel\])?|(?:NIT|QUESTION)): \S/;
  return /^totals: \d+ BUG, \d+ RISK, \d+ NIT, \d+ QUESTION$/.test(total) &&
    corpo.length > 0 && corpo.every((linha) => achado.test(linha));
}

function revisarSentinel(texto) {
  if (/\[CWE-285\]/.test(texto)) return false;
  if (/^No security vulnerabilities found in scope\.?$/m.test(texto)) return false;
  const linhas = removerCabecalhoEnvelope(nl(texto));
  const status = extrairCampo(nl(texto), 'STATUS:');
  const corpo = verificarCoberturaERodape(linhas, status);
  if (!corpo || corpo.length === 0) return false;
  if (corpo.length === 1 && /^No findings in scope\.?$/.test(corpo[0])) return true;

  const total = corpo.pop();
  if (!/^totals: \d+ CRITICAL, \d+ HIGH, \d+ MEDIUM, \d+ LOW$/.test(total) || corpo.length === 0) return false;

  const headerRe = /^\S.*:\d+: (CRITICAL|HIGH|MEDIUM|LOW) \[CWE-(\d+)\] \[(CONFIRMED|LIKELY|POSSIBLE)\][ \t]*$/;
  let i = 0;
  let count = 0;
  while (i < corpo.length) {
    const hdr = corpo[i].match(headerRe);
    if (!hdr || hdr[2] === '285') return false;
    count++;
    i++;
    const req = ['CONDITION:', 'IMPACT:', 'FIX:', 'EVIDENCE:'];
    for (const prefix of req) {
      if (i >= corpo.length || !corpo[i].startsWith(prefix) || !corpo[i].slice(prefix.length).trim()) return false;
      i++;
      if (prefix === 'EVIDENCE:' && i < corpo.length && !corpo[i].startsWith('SCORE:')) {
        // Optional second evidence line before SCORE:.
        i++;
      }
    }
    if (i >= corpo.length || !/^SCORE:[ \t]+(?:not scored|CVSS-(?:B|BT|BE|BTE)\s+4\.0\s+\S+)/.test(corpo[i])) return false;
    i++;
  }
  return count > 0;
}

function conferirContagem(texto, totalAfirmacoes) {
  const vereditos = [...texto.matchAll(/^[ \t]*(\d+)\. (CONFIRMED|REFUTED|INCONCLUSIVE) — \S/gm)];
  const totais = texto.match(/^TOTALS: (\d+) confirmed, (\d+) refuted, (\d+) inconclusive[ \t]*$/m);
  if (!totais || vereditos.length !== totalAfirmacoes) return false;
  if (!vereditos.every((item, i) => Number(item[1]) === i + 1)) return false;
  return ['CONFIRMED', 'REFUTED', 'INCONCLUSIVE'].every((veredito, i) =>
    vereditos.filter((item) => item[2] === veredito).length === Number(totais[i + 1]));
}

function verificarColeta(texto, campo, ferramenta, { usos, resultados }) {
  const informouLimpo = nl(texto).some((linha) => linha.trim().toLowerCase() === campo + ': clean');
  return !informouLimpo || usos.some((uso) =>
    uso.name === ferramenta && resultados.some((resultado) => resultado.id === uso.id && !resultado.erro));
}

const CHECKS = {
  scout: [
    ['ANSWER', tem(/^ANSWER:/m)],
    ['EVIDENCE or "not found"', tem(/^EVIDENCE:|^ANSWER:\s*not found/m)],
  ],
  scholar: [
    ['ANSWER', tem(/^ANSWER:/m)],
    ['SOURCES with URL', (t) => /^SOURCES:/m.test(t) && /https?:\/\//.test(t)],
  ],
  assayer: [
    ['ranked BUG/RISK or unranked NIT/QUESTION with totals or "No issues.", followed by COVERAGE and GAPS', revisarCobertura],
  ],
  sentinel: [
    ['structured CWE/CVSS findings with totals or "No findings in scope.", followed by COVERAGE and GAPS', revisarSentinel],
  ],
  scribe: [
    ['MODE', tem(/^MODE:\s*(spec|release)/m)],
    ['FILES', tem(/^FILES:/m)],
  ],
  smith: [
    ['FILES', tem(/^FILES:/m)],
    ['ACCEPTANCE', tem(/^ACCEPTANCE:/m)],
  ],
  breaker: [
    ['RESULT', (t) => {
      const m = t.match(/^RESULT:[ \t]+(PASS|FAIL|none)[ \t]*$/m);
      if (!m) return false;
      const blocked = /^STATUS:[ \t]+BLOCKED[ \t]*$/m.test(t);
      return blocked ? m[1] === 'none' : m[1] !== 'none';
    }],
    ['ENVIRONMENT', tem(/^ENVIRONMENT:/m)],
    ['FLOW', tem(/^FLOW:/m)],
    ['CONSOLE', tem(/^CONSOLE:/m)],
    ['NETWORK', tem(/^NETWORK:/m)],
    ['EVIDENCE', tem(/^EVIDENCE:/m)],
  ],
};

// Return the list of failed contract items (empty = contract fulfilled).
function verificarContrato(agente, texto, contexto = {}) {
  const checks = CHECKS[agente];
  if (!checks) return [`agent without a defined contract: ${agente}`];
  const saida = String(texto || '');
  const falhas = verificarEnvelope(agente, saida)
    .concat(checks.filter(([, fn]) => !fn(saida)).map(([nome]) => nome));
  if (agente === 'scout' && contexto.totalAfirmacoes !== undefined &&
      !conferirContagem(saida, contexto.totalAfirmacoes)) {
    falhas.push('verdicts and TOTALS matching the received batch');
  }
  if (agente === 'breaker' && contexto.usos && contexto.resultados) {
    if (!verificarColeta(saida, 'console', 'mcp__playwright__browser_console_messages', contexto)) {
      falhas.push('CONSOLE clean requires successful collection');
    }
    if (!verificarColeta(saida, 'network', 'mcp__playwright__browser_network_requests', contexto)) {
      falhas.push('NETWORK clean requires successful collection');
    }
  }
  return falhas;
}

// Read `--output-format stream-json` lines and return final text, tool uses, and tool results.
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
