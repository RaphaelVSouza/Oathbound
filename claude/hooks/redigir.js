'use strict';

const MAX_ENTRADA = 4096; // texto analisado pela redação; limita o custo das regexes
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

module.exports = { redigir };
