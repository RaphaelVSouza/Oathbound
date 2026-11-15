#!/usr/bin/env node
// Trilha de auditoria das chamadas de ferramenta feitas por subagentes.
// Hook PreToolUse global: grava uma linha JSON por chamada em
// ~/.claude/state/agent-audit.jsonl (ou em AGENT_AUDIT_DIR, usado nos testes).
// Só registra chamadas com agent_id (subagentes). Nunca grava conteúdo de arquivo,
// aplica redação de segredos e trunca. Nunca bloqueia: falha em silêncio, sem stdout.
// Uma chamada negada pelo readonly-guard gera duas linhas: a da chamada (este hook, global)
// e a da negação (guard, com bloqueado:true). audit-resumo.js conta só a primeira como chamada.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_BYTES = 1024 * 1024; // rotaciona acima de 1 MB
const MAX_ARQUIVOS = 3; // agent-audit.jsonl + .1 + .2
const MAX_TEXTO = 200;
const MAX_ENTRADA = 4096; // texto analisado pela redação; limita o custo das regexes
const MAX_STDIN = 16 * 1024 * 1024;
const TEMPO_MAX_MS = 3000;
const NOME_SEGREDO = '(?:key|token|secret|passw(?:or)?d|pwd|credential|passphrase|signature|cookie|dsn)';

// Formatos com prefixo próprio: o valor inteiro vira [REDIGIDO].
const PREFIXOS = [
  /\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{12,}/g,
  /\bAIza[0-9A-Za-z_-]{20,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bglpat-[A-Za-z0-9_-]{16,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{12,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\bya29\.[A-Za-z0-9_-]{20,}/g,
  /\b(?:npm|hf)_[A-Za-z0-9]{20,}/g,
  /\bshpat_[a-f0-9]{16,}/g,
  /\bdop_v1_[a-f0-9]{20,}/g,
  /\bsntrys_[A-Za-z0-9_=-]{20,}/g,
  /hooks\.slack\.com\/services\/[A-Za-z0-9/]+/g,
  /-----BEGIN [A-Z ]{0,30}PRIVATE KEY-----[\s\S]{0,4000}?(?:-----END [A-Z ]{0,30}PRIVATE KEY-----|$)/g,
];
// [regex, substituição]: preserva o contexto e troca só o segredo.
const CONTEXTUAIS = [
  // Cabeçalho que carrega credencial: redige o resto até a próxima aspa ou fim de linha.
  [/\b((?:Proxy-)?Authorization|Set-Cookie|Cookie)(\s*:\s*)[^\n"']{1,300}/gi, '$1$2[REDIGIDO]'],
  [/(\s-pass(?:in|out)?\s+pass:)\S+/gi, '$1[REDIGIDO]'],
  [/(Authorization[^\n]{0,20}?)Basic\s+[A-Za-z0-9+/=]{8,}/gi, '$1Basic [REDIGIDO]'],
  [/\b([a-z][a-z0-9+.-]{0,16}:\/\/)[^\s/@]{1,200}@/gi, '$1[REDIGIDO]@'],
  [/(\s-u\s+|\s--user\s+)("[^"]*:[^"]*"|'[^']*:[^']*'|[^\s:'"]+:\S+)/g, '$1[REDIGIDO]'],
  [/\b(mysql|mysqldump|mariadb)\b([^|;&\n]*?\s)-p\S+/gi, '$1$2-p[REDIGIDO]'],
  [/\b(sshpass\s+-p\s+)("[^"]*"|'[^']*'|\S+)/gi, '$1[REDIGIDO]'],
  // Flag com valor separado por espaço: --token S, --api-key "a b".
  [new RegExp(`(--?[A-Za-z0-9-]{0,64}${NOME_SEGREDO}[A-Za-z0-9-]{0,64})(\\s+)("[^"]*"|'[^']*'|[^\\s-]\\S*)`, 'gi'), '$1$2[REDIGIDO]'],
];
// nome=valor, nome: valor, "nome": "valor", com ou sem aspas; valor entre aspas inteiro.
const CHAVE_VALOR = new RegExp(`(["']?)\\b([A-Za-z0-9_-]{0,64}${NOME_SEGREDO}[A-Za-z0-9_-]{0,64})\\1\\s*([=:])\\s*("[^"]*"|'[^']*'|\\S+)`, 'gi');

function redigir(texto) {
  // \" e \' viram aspas simples para que JSON escapado dentro de um argumento seja redigido.
  let t = String(texto).slice(0, MAX_ENTRADA).replace(/\\(["'])/g, '$1');
  for (const re of PREFIXOS) t = t.replace(re, '[REDIGIDO]');
  for (const [re, sub] of CONTEXTUAIS) t = t.replace(re, sub);
  return t.replace(CHAVE_VALOR, (_, q, nome, sep) => `${q}${nome}${q}${sep}[REDIGIDO]`);
}

function truncar(texto) {
  const t = redigir(texto).replace(/\s+/g, ' ').trim();
  return t.length > MAX_TEXTO ? `${t.slice(0, MAX_TEXTO)}…` : t;
}

// Remove a query e mascara segmentos longos do caminho que misturam letra e dígito
// (token de bot, assinatura pré-assinada). Não pega segredo só com letras.
function semQuery(url) {
  try {
    const u = new URL(url);
    const caminho = u.pathname.split('/')
      .map((s) => (s.length >= 24 && /\d/.test(s) && /[A-Za-z]/.test(s) ? '[REDIGIDO]' : s))
      .join('/');
    return truncar(`${u.origin}${caminho}`);
  } catch { return truncar(url); }
}

// Resume a chamada sem copiar conteúdo: comando, caminho, padrão ou URL apenas.
function resumir(ferramenta, entrada) {
  const e = entrada || {};
  if (ferramenta === 'Bash' || ferramenta === 'PowerShell') return truncar(e.command || '');
  if (['Read', 'Edit', 'Write', 'NotebookEdit'].includes(ferramenta)) return truncar(e.file_path || e.notebook_path || '');
  if (ferramenta === 'Grep') return truncar(`${e.pattern || ''} @ ${e.path || ''}`);
  if (ferramenta === 'Glob') return truncar(`${e.pattern || ''} @ ${e.path || ''}`);
  if (ferramenta === 'WebFetch') return semQuery(e.url || '');
  if (ferramenta === 'WebSearch') return truncar(e.query || '');
  return ''; // MCP e demais: só o nome da ferramenta
}

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

// payload: JSON do hook. extra: só { bloqueado, motivo } são aceitos; o resto é ignorado.
function registrar(payload, extra) {
  try {
    if (!payload || !payload.agent_id) return false;
    const linha = {
      ts: new Date().toISOString(),
      agente: payload.agent_type || 'desconhecido',
      agent_id: payload.agent_id,
      sessao: String(payload.session_id || '').slice(0, 8),
      ferramenta: payload.tool_name || '',
      alvo: resumir(payload.tool_name, payload.tool_input),
    };
    if (extra && extra.bloqueado === true) linha.bloqueado = true;
    if (extra && extra.motivo) linha.motivo = truncar(extra.motivo);
    if (extra && extra.erro) linha.erro = String(extra.erro).slice(0, 40);
    const dir = dirAuditoria();
    fs.mkdirSync(dir, { recursive: true });
    const arquivo = path.join(dir, 'agent-audit.jsonl');
    rotacionar(arquivo);
    fs.appendFileSync(arquivo, `${JSON.stringify(linha)}\n`);
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

module.exports = { registrar, registrarFalha, resumir, redigir, truncar };
