'use strict';
// Output contract checkers for each agent and a stream-json reader for `claude -p`.
// Pure functions: tested offline in contratos.test.js, at no cost.

const nl = (t) => String(t || '').split(/\r?\n/).filter((l) => l.trim() !== '');

const tem = (re) => (t) => re.test(t);
const lacunas = tem(/^GAPS:[ \t]+\S/m);

function revisarCobertura(texto) {
  const linhas = nl(texto);
  const pendencias = linhas.pop();
  const cobertura = linhas.pop();
  if (!/^COVERAGE: (complete|partial)$/.test(cobertura) || !lacunas(pendencias)) return false;
  if (cobertura === 'COVERAGE: partial' && /^GAPS:\s+none\.?\s*$/i.test(pendencias)) return false;
  if (linhas.length === 1 && /^No issues\.?$/.test(linhas[0])) return true;
  const total = linhas.pop();
  const achado = /^\S.*:\d+: (🔴 bug|🟡 risk|🔵 nit|❓ question): /;
  return /^totals: /.test(total) && linhas.length > 0 && linhas.every((linha) => achado.test(linha));
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
    ['GAPS', tem(/^GAPS:/m)],
  ],
  scholar: [
    ['ANSWER', tem(/^ANSWER:/m)],
    ['SOURCES with URL', (t) => /^SOURCES:/m.test(t) && /https?:\/\//.test(t)],
    ['GAPS', tem(/^GAPS:/m)],
  ],
  assayer: [
    ['findings and totals or "No issues.", followed by COVERAGE and GAPS', revisarCobertura],
  ],
  sentinel: [
    ['findings with CWE and totals, or a "no findings" sentence', (t) => {
      if (/^No security vulnerabilities found in scope\.?$/m.test(t)) return true;
      const achado = /^\S.*:\d+: (🔴 CRITICAL|🟠 HIGH|🟡 MEDIUM|🔵 LOW) \[CWE-\d+\]: /m;
      return achado.test(t) && /^totals: /m.test(t);
    }],
    ['GAPS', lacunas],
  ],
  scribe: [
    ['MODE', tem(/^MODE:\s*(spec|release)/m)],
    ['FILES', tem(/^FILES:/m)],
    ['PENDING', tem(/^PENDING:/m)],
  ],
  smith: [
    ['FILES', tem(/^FILES:/m)],
    ['ACCEPTANCE', tem(/^ACCEPTANCE:/m)],
    ['NOTE', tem(/^NOTE:/m)],
  ],
  breaker: [
    ['STATUS', tem(/^STATUS:\s*(PASS|FAIL|BLOCKED)/m)],
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
  const falhas = checks.filter(([, fn]) => !fn(saida)).map(([nome]) => nome);
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
