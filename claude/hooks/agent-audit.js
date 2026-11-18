#!/usr/bin/env node
// Trilha de auditoria das chamadas de ferramenta feitas por subagentes.
// Hook PreToolUse global: grava uma linha JSON por chamada em
// ~/.claude/state/agent-audit.jsonl (ou em AGENT_AUDIT_DIR, usado nos testes).
// Só registra metadados de chamadas com agent_id (subagentes).
// Nunca bloqueia: falha em silêncio, sem stdout.
// Uma chamada negada pelo readonly-guard gera duas linhas: a da chamada (este hook, global)
// e a da negação (guard, com bloqueado:true). audit-resumo.js conta só a primeira como chamada.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_BYTES = 1024 * 1024; // rotaciona acima de 1 MB
const MAX_ARQUIVOS = 3; // agent-audit.jsonl + .1 + .2
const MAX_STDIN = 16 * 1024 * 1024;
const TEMPO_MAX_MS = 3000;
const CATEGORIAS = new Set(['somente_leitura', 'limite_de_leitura', 'acao_destrutiva', 'politica_do_agente']);

function dirAuditoria() {
  return process.env.AGENT_AUDIT_DIR || path.join(os.homedir(), '.claude', 'state');
}

// Trava por arquivo (open 'wx'). Se outra instância está rotacionando, pula a rotação;
// trava com mais de 5 s é considerada abandonada.
function comTrava(arquivo, fn) {
  const trava = `${arquivo}.lock`;
  let fd;
  try { fd = fs.openSync(trava, 'wx'); } catch {
    try {
      if (Date.now() - fs.statSync(trava).mtimeMs > 5000) { fs.unlinkSync(trava); fd = fs.openSync(trava, 'wx'); }
    } catch { return; }
  }
  if (fd === undefined) return;
  try { fn(); } finally {
    try { fs.closeSync(fd); } catch { /* já fechado */ }
    try { fs.unlinkSync(trava); } catch { /* já removida */ }
  }
}

function rotacionar(arquivo) {
  try {
    if (fs.statSync(arquivo).size < MAX_BYTES) return;
  } catch { return; }
  comTrava(arquivo, () => {
    try { if (fs.statSync(arquivo).size < MAX_BYTES) return; } catch { return; } // outra instância já rotacionou
    for (let i = MAX_ARQUIVOS - 1; i >= 1; i--) {
      const de = i === 1 ? arquivo : `${arquivo}.${i - 1}`;
      const para = `${arquivo}.${i}`;
      try { fs.renameSync(de, para); } catch (e) {
        if (e && e.code === 'ENOENT') continue; // geração ainda não existe
        return; // EPERM/EBUSY: aborta sem sobrescrever geração mais nova; tenta de novo na próxima chamada
      }
    }
  });
}

// O motivo do bloqueio é uma categoria fixa. O diagnóstico completo sai só no hook.
function registrar(payload, extra) {
  try {
    if (!payload || !payload.agent_id) return false;
    const linha = {
      ts: new Date().toISOString(),
      agente: payload.agent_type || 'desconhecido',
      agent_id: payload.agent_id,
      sessao: String(payload.session_id || '').slice(0, 8),
      ferramenta: payload.tool_name || '',
    };
    if (typeof payload.tool_use_id === 'string') linha.tool_use_id = payload.tool_use_id;
    if (extra && extra.bloqueado === true) linha.bloqueado = true;
    if (extra && CATEGORIAS.has(extra.motivo)) linha.motivo = extra.motivo;
    if (extra && extra.erro) linha.erro = String(extra.erro).slice(0, 40);
    const dir = dirAuditoria();
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const arquivo = path.join(dir, 'agent-audit.jsonl');
    rotacionar(arquivo);
    fs.appendFileSync(arquivo, `${JSON.stringify(linha)}\n`, { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

function extrair(raw, chave) {
  const m = new RegExp(`"${chave}"\\s*:\\s*"([^"\\\\]{1,64})"`).exec(raw);
  return m ? m[1] : undefined;
}

// Payload ilegível, grande demais ou lento: o JSON não vale, mas a chamada de subagente não pode sumir
// da trilha. Extrai só identificadores do texto bruto e grava linha com `erro`, sem conteúdo.
function registrarFalha(raw, erro) {
  try {
    const agentId = extrair(raw, 'agent_id');
    if (!agentId) return false;
    return registrar({
      agent_id: agentId, agent_type: extrair(raw, 'agent_type'),
      session_id: extrair(raw, 'session_id'), tool_name: extrair(raw, 'tool_name'),
    }, { erro });
  } catch { return false; }
}

if (require.main === module) {
  let raw = '';
  let truncado = false;
  // stdin que não fecha não prende a ferramenta; antes de sair, registra o que deu para extrair.
  setTimeout(() => { registrarFalha(raw, 'stdin_lento'); process.exit(0); }, TEMPO_MAX_MS).unref();
  process.stdin.setEncoding('utf8');
  process.stdin.on('error', () => process.exit(0));
  process.stdin.on('data', (c) => {
    if (raw.length < MAX_STDIN) raw += c; else truncado = true;
  });
  process.stdin.on('end', () => {
    try {
      let payload;
      if (!truncado) { try { payload = JSON.parse(raw); } catch { /* cai na falha abaixo */ } }
      if (payload !== undefined) registrar(payload);
      else if (raw) registrarFalha(raw, truncado ? 'payload_grande' : 'payload_invalido');
    } catch { /* nunca bloqueia */ }
  });
}

module.exports = { registrar, registrarFalha, redigir: require('./redigir.js').redigir };
