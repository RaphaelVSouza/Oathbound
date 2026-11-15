#!/usr/bin/env node
// Guard PreToolUse de somente leitura para agentes revisores (assayer, sentinel).
// Lê o JSON do hook no stdin e nega (permissionDecision: "deny") qualquer comando Bash
// fora da lista de leitura. Falha fechada: entrada inválida ou comando ambíguo é negado.
// Aceita o comando original e o reescrito pelo RTK (prefixo `rtk`), pois a ordem entre
// este hook e o hook global do RTK não é documentada.
'use strict';

const GIT_LEITURA = new Set([
  'diff', 'show', 'log', 'status', 'blame', 'ls-files', 'ls-tree', 'rev-parse',
  'rev-list', 'cat-file', 'grep', 'shortlog', 'describe', 'diff-tree', 'show-ref',
]);
// `git branch` só lista; qualquer outro argumento pode criar ou apagar branch.
const GIT_BRANCH_OK = new Set([
  '--show-current', '-a', '-r', '-v', '-vv', '--list', '-l', '--contains', '--merged', '--no-merged',
]);
const COMANDOS_LEITURA = new Set([
  'rg', 'grep', 'egrep', 'fgrep', 'find', 'ls', 'dir', 'tree', 'cat', 'head', 'tail',
  'wc', 'uniq', 'file', 'stat', 'basename', 'dirname', 'realpath', 'which', 'pwd', 'cd',
  'echo', 'diff', 'sort', 'get-childitem', 'get-content', 'select-string', 'test-path',
  'get-item', 'measure-object',
]);
// Só valem logo após o prefixo `rtk`.
const RTK_SUBCOMANDOS = new Set(['read', 'grep', 'ls', 'find', 'rg', 'diff', 'tree']);
const FIND_PROIBIDO = /^-(delete|exec|execdir|ok|okdir|fprint\w*|fls)$/;

function dividir(cmd) {
  const segmentos = [];
  let tokens = [];
  let atual = '';
  let temToken = false;
  let aspa = null;
  const fechaToken = () => { if (temToken) { tokens.push(atual); } atual = ''; temToken = false; };
  const fechaSegmento = () => { fechaToken(); if (tokens.length) segmentos.push(tokens); tokens = []; };

  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (aspa) {
      if (aspa === '"' && c === '\\') {
        if (i + 1 >= cmd.length) return { erro: 'escape incompleto' };
        atual += cmd[++i]; temToken = true; continue;
      }
      if (c === aspa) { aspa = null; continue; }
      if (aspa === '"' && (c === '`' || (c === '$' && cmd[i + 1] === '('))) {
        return { erro: 'substituição de comando' };
      }
      atual += c; temToken = true; continue;
    }
    if (c === '\\') {
      if (i + 1 >= cmd.length) return { erro: 'escape incompleto' };
      atual += cmd[++i]; temToken = true; continue;
    }
    if (c === "'" || c === '"') { aspa = c; temToken = true; continue; }
    if (c === '`' || (c === '$' && cmd[i + 1] === '(')) return { erro: 'substituição de comando' };
    if (c === '>' || c === '<') return { erro: 'redirecionamento' };
    if (c === ';' || c === '|' || c === '&' || c === '\n' || c === '\r') { fechaSegmento(); continue; }
    if (c === ' ' || c === '\t') { fechaToken(); continue; }
    atual += c; temToken = true;
  }
  if (aspa) return { erro: 'aspas não fechadas' };
  fechaSegmento();
  return { segmentos };
}

function nomeComando(token) {
  return token.replace(/^.*[\\/]/, '').replace(/\.exe$/i, '').toLowerCase();
}

function verificaSegmento(tokens) {
  let t = tokens.slice();
  let viaRtk = false;
  if (nomeComando(t[0]) === 'rtk') {
    viaRtk = true;
    t.shift();
    if (t[0] === 'proxy') t.shift();
    if (!t.length) return 'rtk sem subcomando';
  }
  if (t[0].includes('=')) return 'atribuição de variável antes do comando';
  const cmd = nomeComando(t[0]);
  const args = t.slice(1);

  if (cmd === 'git') {
    let i = 0;
    while (args[i] === '--no-pager' || (args[i] === '-C' && args[i + 1] !== undefined)) {
      i += args[i] === '-C' ? 2 : 1; // -C <caminho> só muda o diretório; o subcomando segue validado
    }
    const sub = args[i];
    if (!sub) return 'git sem subcomando';
    const resto = args.slice(i + 1);
    if (sub === 'branch') {
      const ruim = resto.find((a) => !GIT_BRANCH_OK.has(a));
      return ruim ? `git branch com argumento não permitido: ${ruim}` : null;
    }
    if (!GIT_LEITURA.has(sub)) return `git ${sub} não é leitura`;
    const out = resto.find((a) => /^--(output|open-files-in-pager)(=|$)/.test(a) || a === '-o');
    return out ? `git com ${out.split('=')[0]} não é permitido` : null;
  }
  if (cmd === 'find' && args.some((a) => FIND_PROIBIDO.test(a))) return 'find com ação de escrita/execução';
  if (cmd === 'sort' && args.some((a) => /^-[a-zA-Z]*o/.test(a) || /^--(output|compress-program)(=|$)/.test(a))) {
    return 'sort com gravação/execução não permitido';
  }
  if (cmd === 'tree' && args.some((a) => /^-[a-zA-Z]*o/.test(a) || /^--output(=|$)/.test(a))) {
    return 'tree -o grava arquivo';
  }
  if (cmd === 'file' && args.some((a) => /^-[a-zA-Z]*C/.test(a) || a === '--compile')) {
    return 'file -C grava arquivo';
  }
  if (cmd === 'rg' && args.some((a) => /^--pre(=|$)/.test(a))) {
    return 'rg --pre executa comando';
  }
  if (cmd === 'uniq') {
    let aposDoubleDash = false;
    let posicionais = 0;
    for (let j = 0; j < args.length; j++) {
      const a = args[j];
      if (!aposDoubleDash && a === '--') { aposDoubleDash = true; continue; }
      if (!aposDoubleDash && a.startsWith('-') && a !== '-') {
        if ((a === '-f' || a === '-s' || a === '-w') && j + 1 < args.length) j++;
        continue;
      }
      posicionais++;
      if (posicionais > 1) return 'uniq com arquivo de saída';
    }
  }
  if (viaRtk && RTK_SUBCOMANDOS.has(cmd)) return null;
  if (COMANDOS_LEITURA.has(cmd)) return null;
  return `comando fora da lista de leitura: ${cmd}`;
}

function avaliar(command) {
  if (typeof command !== 'string' || !command.trim()) return 'comando vazio ou ausente';
  const r = dividir(command);
  if (r.erro) return `construção não permitida (${r.erro})`;
  if (!r.segmentos.length) return 'comando vazio';
  for (const seg of r.segmentos) {
    const motivo = verificaSegmento(seg);
    if (motivo) return motivo;
  }
  return null;
}

function negar(motivo) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Agente somente leitura: ${motivo}. Use apenas comandos de leitura (git diff/show/log/status, rtk rg, ls).`,
    },
  }));
}

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', () => {
    let motivo;
    let payload = null;
    try {
      payload = JSON.parse(raw);
      const ferramenta = payload.tool_name;
      if (ferramenta !== 'Bash') {
        motivo = `ferramenta ${ferramenta} não coberta por este guard`;
      } else {
        motivo = avaliar(payload.tool_input && payload.tool_input.command);
      }
    } catch {
      motivo = 'entrada do hook inválida';
    }
    if (motivo) {
      try { require('./agent-audit.js').registrar(payload, { bloqueado: true, motivo }); } catch { /* auditoria nunca impede a negação */ }
      negar(motivo);
    }
  });
}

module.exports = { avaliar, dividir };
