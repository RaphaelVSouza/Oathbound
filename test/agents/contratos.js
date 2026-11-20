'use strict';
// Verificadores do contrato de saída de cada agente e leitor do stream-json do `claude -p`.
// Funções puras: testadas offline em contratos.test.js, sem custo.

const nl = (t) => String(t || '').split(/\r?\n/).filter((l) => l.trim() !== '');

const tem = (re) => (t) => re.test(t);
const lacunas = tem(/^LACUNAS:[ \t]+\S/m);

function revisarCobertura(texto) {
  const linhas = nl(texto);
  const pendencias = linhas.pop();
  const cobertura = linhas.pop();
  if (!/^COBERTURA: (completa|parcial)$/.test(cobertura) || !lacunas(pendencias)) return false;
  if (cobertura === 'COBERTURA: parcial' && /^LACUNAS:\s+nenhuma\.?\s*$/i.test(pendencias)) return false;
  if (linhas.length === 1 && /^No issues\.?$/.test(linhas[0])) return true;
  const total = linhas.pop();
  const achado = /^\S.*:\d+: (🔴 bug|🟡 risk|🔵 nit|❓ question): /;
  return /^totals: /.test(total) && linhas.length > 0 && linhas.every((linha) => achado.test(linha));
}

function conferirContagem(texto, totalAfirmacoes) {
  const vereditos = [...texto.matchAll(/^[ \t]*(\d+)\. (CONFIRMADA|REFUTADA|INCONCLUSIVA) — \S/gm)];
  const totais = texto.match(/^TOTAIS: (\d+) confirmadas, (\d+) refutadas, (\d+) inconclusivas[ \t]*$/m);
  if (!totais || vereditos.length !== totalAfirmacoes) return false;
  if (!vereditos.every((item, i) => Number(item[1]) === i + 1)) return false;
  return ['CONFIRMADA', 'REFUTADA', 'INCONCLUSIVA'].every((veredito, i) =>
    vereditos.filter((item) => item[2] === veredito).length === Number(totais[i + 1]));
}

function verificarColeta(texto, campo, ferramenta, { usos, resultados }) {
  const informouLimpo = nl(texto).some((linha) => linha.trim().toLowerCase() === campo + ': limpo');
  return !informouLimpo || usos.some((uso) =>
    uso.name === ferramenta && resultados.some((resultado) => resultado.id === uso.id && !resultado.erro));
}

const CHECKS = {
  scout: [
    ['RESPOSTA', tem(/^RESPOSTA:/m)],
    ['EVIDÊNCIA ou "não encontrado"', tem(/^EVIDÊNCIAS?:|^RESPOSTA:\s*não encontrado/m)],
    ['LACUNAS', tem(/^LACUNAS:/m)],
  ],
  scholar: [
    ['RESPOSTA', tem(/^RESPOSTA:/m)],
    ['FONTES com URL', (t) => /^FONTES:/m.test(t) && /https?:\/\//.test(t)],
    ['LACUNAS', tem(/^LACUNAS:/m)],
  ],
  assayer: [
    ['achados e totais ou "No issues.", seguidos de COBERTURA e LACUNAS', revisarCobertura],
  ],
  sentinel: [
    ['achados com CWE e totals, ou frase de "sem achados"', (t) => {
      if (/^No security vulnerabilities found in scope\.?$/m.test(t)) return true;
      const achado = /^\S.*:\d+: (🔴 CRITICAL|🟠 HIGH|🟡 MEDIUM|🔵 LOW) \[CWE-\d+\]: /m;
      return achado.test(t) && /^totals: /m.test(t);
    }],
    ['LACUNAS', lacunas],
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
function verificarContrato(agente, texto, contexto = {}) {
  const checks = CHECKS[agente];
  if (!checks) return [`agente sem contrato definido: ${agente}`];
  const saida = String(texto || '');
  const falhas = checks.filter(([, fn]) => !fn(saida)).map(([nome]) => nome);
  if (agente === 'scout' && contexto.totalAfirmacoes !== undefined &&
      !conferirContagem(saida, contexto.totalAfirmacoes)) {
    falhas.push('vereditos e TOTAIS compatíveis com o lote recebido');
  }
  if (agente === 'tester' && contexto.usos && contexto.resultados) {
    if (!verificarColeta(saida, 'console', 'mcp__playwright__browser_console_messages', contexto)) {
      falhas.push('CONSOLE limpo exige coleta bem-sucedida');
    }
    if (!verificarColeta(saida, 'network', 'mcp__playwright__browser_network_requests', contexto)) {
      falhas.push('NETWORK limpo exige coleta bem-sucedida');
    }
  }
  return falhas;
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
