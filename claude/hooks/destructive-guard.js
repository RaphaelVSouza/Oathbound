#!/usr/bin/env node
// Guard PreToolUse contra ação irreversível para agentes que escrevem (smith, scribe).
// Nega, em posição de comando, git que muda histórico/estado/remoto, remoção de arquivo,
// escrita remota (gh, npm publish) e wrappers de shell que escondem o comando real.
// Commit, push, remoção e publicação ficam com a thread principal. Falha fechada em
// entrada inválida. Só olha a posição de comando: `rg "git push"` não é negado.
'use strict';

const INICIO = String.raw`(?:^|[;&|\n(]|&&)\s*(?:rtk\s+(?:proxy\s+)?)?`;
const GIT_OPCOES = String.raw`(?:\s+(?:--no-pager|-C\s+\S+|-c\s+\S+))*`;

const REGRAS = [
  {
    re: new RegExp(`${INICIO}git${GIT_OPCOES}\\s+(commit|push|reset|clean|rebase|merge|cherry-pick|revert|am|apply|stash|checkout|restore|switch|filter-branch|gc|prune|update-ref|config|remote)\\b`, 'i'),
    motivo: (m) => `git ${m[1]} muda histórico, estado ou remoto`,
  },
  {
    re: new RegExp(`${INICIO}git${GIT_OPCOES}\\s+(branch\\s+(?:-\\S*[dDmM]\\S*|--delete|--move)|tag\\s+(?:-\\S*d\\S*|--delete)|reflog\\s+(?:expire|delete))\\b`, 'i'),
    motivo: (m) => `git ${m[1].split(/\s+/)[0]} apaga ou move referência`,
  },
  {
    re: new RegExp(`${INICIO}(rm|rmdir|del|erase|rd|remove-item|ri|unlink|shred)\\b`, 'i'),
    motivo: (m) => `${m[1]} remove arquivo ou pasta`,
  },
  {
    re: /\bfind\b[^;&|\n]*\s-(delete|exec|execdir)\b/i,
    motivo: () => 'find com ação de remoção/execução',
  },
  {
    re: new RegExp(`${INICIO}gh\\s+(pr\\s+(create|merge|close|edit|comment|review|ready)|issue\\s+(create|close|edit|comment|delete)|release\\b|repo\\s+(create|delete|edit|rename)|api\\b[^;&|\\n]*(-X|--method)\\s*(POST|PUT|PATCH|DELETE))`, 'i'),
    motivo: () => 'gh faz escrita remota',
  },
  {
    re: new RegExp(`${INICIO}(npm|pnpm|yarn)\\s+publish\\b`, 'i'),
    motivo: () => 'publish é escrita remota',
  },
  {
    re: new RegExp(`${INICIO}(bash|sh|zsh|cmd|powershell|pwsh)(?:\\.exe)?\\b[^;&|\\n]*\\s(-c|-command|-encodedcommand|/c)\\b`, 'i'),
    motivo: () => 'wrapper de shell esconde o comando real',
  },
  {
    re: new RegExp(`${INICIO}(eval|invoke-expression|iex)\\b`, 'i'),
    motivo: () => 'eval/Invoke-Expression esconde o comando real',
  },
];

function avaliar(payload) {
  const ferramenta = payload && payload.tool_name;
  if (ferramenta !== 'Bash' && ferramenta !== 'PowerShell') return null;
  const cmd = payload.tool_input && payload.tool_input.command;
  if (typeof cmd !== 'string' || !cmd.trim()) return 'comando vazio ou ausente';
  for (const r of REGRAS) {
    const m = cmd.match(r.re);
    if (m) return r.motivo(m);
  }
  return null;
}

function negar(motivo) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Ação irreversível bloqueada: ${motivo}. Devolva o pedido à thread principal, que executa commit, push, remoção e publicação.`,
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

module.exports = { avaliar };
