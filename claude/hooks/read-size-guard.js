#!/usr/bin/env node
// Guard PreToolUse de tamanho de leitura para agentes revisores (assayer, sentinel).
// Limita o contexto que um revisor puxa de uma vez, para não gastar cota:
//   - Read: exige `limit` <= MAX_LINHAS.
//   - Bash: nega leitura de arquivo inteiro (cat, Get-Content, rtk read), head/tail sem
//     -n <= MAX_LINHAS e `git diff/show` sem --stat/--name-only ou caminho delimitado.
// Falha fechada: entrada inválida é negada. Complementa o readonly-guard.js (escrita).
'use strict';

const { dividir } = require('./readonly-guard.js');

const MAX_LINHAS = 150;
const RESUMOS_GIT = new Set(['--stat', '--name-only', '--name-status', '--numstat', '--shortstat', '--summary', '--check']);

function nomeComando(token) {
  return token.replace(/^.*[\\/]/, '').replace(/\.exe$/i, '').toLowerCase();
}

function limiteDe(args, flagsCurtos, flagsLongos) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i].toLowerCase();
    let v = null;
    for (const f of flagsLongos) {
      if (a === f) v = args[i + 1];
      else if (a.startsWith(`${f}=`)) v = a.slice(f.length + 1);
    }
    for (const f of flagsCurtos) {
      if (a === f) v = args[i + 1];
      else if (a.startsWith(f) && /^\d+$/.test(a.slice(f.length))) v = a.slice(f.length);
    }
    if (v === null && /^-\d+$/.test(a)) v = a.slice(1); // head -20
    if (v !== null && v !== undefined) {
      const n = Number(String(v).replace(/^\+/, ''));
      return Number.isFinite(n) ? n : NaN;
    }
  }
  return null;
}

function verificaSegmento(tokens) {
  const t = tokens.slice();
  if (nomeComando(t[0]) === 'rtk') {
    t.shift();
    if (t[0] === 'proxy') t.shift();
    if (!t.length) return null;
    if (t[0] === 'read') return 'rtk read lê arquivo inteiro. Use Read com offset e limit';
  }
  const cmd = nomeComando(t[0]);
  const args = t.slice(1);

  if (cmd === 'cat' || cmd === 'get-content' || cmd === 'gc' || cmd === 'type') {
    if (cmd === 'get-content' || cmd === 'gc') {
      const n = limiteDe(args, [], ['-totalcount', '-tail', '-first']);
      if (n !== null && n <= MAX_LINHAS) return null;
    }
    return `${cmd} lê arquivo inteiro. Use Read com offset e limit (<= ${MAX_LINHAS}) ou Grep -n`;
  }
  if (cmd === 'head' || cmd === 'tail') {
    const n = limiteDe(args, ['-n'], ['--lines']);
    if (n === null || Number.isNaN(n) || n > MAX_LINHAS) return `${cmd} exige -n <= ${MAX_LINHAS}`;
    if (args.some((a) => /^(-c|--bytes)/.test(a))) return `${cmd} -c não permitido; use -n <= ${MAX_LINHAS}`;
    return null;
  }
  if (cmd === 'git') {
    let i = 0;
    while (args[i] === '--no-pager' || (args[i] === '-C' && args[i + 1] !== undefined)) i += args[i] === '-C' ? 2 : 1;
    const sub = args[i];
    if (sub !== 'diff' && sub !== 'show') return null;
    const resto = args.slice(i + 1);
    if (resto.some((a) => RESUMOS_GIT.has(a))) return null;
    if (resto.includes('--')) return null; // caminho delimitado
    return `git ${sub} sem --stat/--name-only nem caminho (-- <arquivo>) pode trazer diff enorme. Rode --stat primeiro e revise por arquivo`;
  }
  return null;
}

function avaliarBash(command) {
  if (typeof command !== 'string' || !command.trim()) return 'comando vazio ou ausente';
  const r = dividir(command);
  if (r.erro) return `construção não permitida (${r.erro})`;
  for (const seg of r.segmentos) {
    const motivo = verificaSegmento(seg);
    if (motivo) return motivo;
  }
  return null;
}

function avaliarRead(input) {
  const limit = input && input.limit;
  if (!Number.isInteger(limit) || limit <= 0) return `Read sem limit. Passe offset e limit <= ${MAX_LINHAS}`;
  if (limit > MAX_LINHAS) return `Read com limit ${limit} > ${MAX_LINHAS}. Fatie a leitura`;
  return null;
}

function avaliar(payload) {
  const ferramenta = payload && payload.tool_name;
  if (ferramenta === 'Read') return avaliarRead(payload.tool_input);
  if (ferramenta === 'Bash') return avaliarBash(payload.tool_input && payload.tool_input.command);
  return null; // outras ferramentas não são desta guarda
}

function negar(motivo) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Guard de tamanho de leitura: ${motivo}.`,
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
      motivo = avaliar(payload);
    } catch {
      motivo = 'entrada do hook inválida';
    }
    if (motivo) {
      try { require('./agent-audit.js').registrar(payload, { bloqueado: true, motivo }); } catch { /* auditoria nunca impede a negação */ }
      negar(motivo);
    }
  });
}

module.exports = { avaliar, MAX_LINHAS };
