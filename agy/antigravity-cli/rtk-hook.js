#!/usr/bin/env node
// Hook PreToolUse do Antigravity (agy) para reescrever comandos via RTK (Rust Token Killer)
const { execFileSync } = require('child_process');

const MAX_STDIN = 1024 * 1024;
let raw = '';
let oversized = false;
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  if (oversized) return;
  if (raw.length + chunk.length > MAX_STDIN) {
    oversized = true;
    raw = '';
    return;
  }
  raw += chunk;
});
process.stdin.on('end', () => {
  if (oversized) {
    process.stdout.write(JSON.stringify({ decision: 'allow' }));
    return;
  }
  try {
    const payload = JSON.parse(raw);

    const args = (payload.toolCall && payload.toolCall.args) || {};
    const cmd = typeof args.CommandLine === 'string' ? args.CommandLine.trim() : '';

    // 1. Guardrails determinísticos contra comandos que travam subagentes no Windows
    if (/^(?:rtk\s+(?:proxy\s+)?)?find(?:\.exe)?\s+/i.test(cmd)) {
      process.stdout.write(JSON.stringify({
        decision: 'deny',
        reason: 'Bloqueado pelo hook: no Windows `find` invoca `System32\\find.exe` e falha. Use `rtk rg --files <caminho>` ou `rtk rg --files -g "<glob>" <caminho>`.',
      }));
      return;
    }

    if (/^(?!node\s+-e\b).*\b(?:Get-ChildItem|gci)\b[^\n|;]*\s-(?:Recurse|r)\b/i.test(cmd)) {
      process.stdout.write(JSON.stringify({
        decision: 'deny',
        reason: 'Bloqueado pelo hook: `Get-ChildItem -Recurse` varre `.venv`, `node_modules` e `data`, estourando timeout e gerando tasks órfãs. Use `rtk rg --files <caminho>` (que respeita `.gitignore`/`.ignore`).',
      }));
      return;
    }

    // Garante WaitMsBeforeAsync >= 10000 para evitar backgrounding prematuro no startup do pwsh no Windows
    const currentWait = typeof args.WaitMsBeforeAsync === 'number' ? args.WaitMsBeforeAsync : 0;
    const minWaitOverride = currentWait > 0 && currentWait < 10000 && !args.IsDaemon ? { WaitMsBeforeAsync: 10000 } : {};

    // Evita reescrever blocos PowerShell multi-linha complexos ou vazios
    if (!cmd || cmd.includes('\n')) {
      if (Object.keys(minWaitOverride).length > 0) {
        process.stdout.write(JSON.stringify({
          decision: 'allow',
          overwrite: minWaitOverride,
        }));
        return;
      }
      process.stdout.write(JSON.stringify({ decision: 'allow' }));
      return;
    }

    let rewritten = '';
    try {
      rewritten = execFileSync('rtk', ['rewrite', cmd], {
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch (err) {
      // rtk rewrite no Windows pode retornar exit code 3 quando reescreve com sucesso
      if (err && typeof err.stdout === 'string') {
        rewritten = err.stdout.trim();
      }
    }

    if (rewritten && rewritten !== cmd) {
      process.stdout.write(JSON.stringify({
        decision: 'allow',
        overwrite: { ...minWaitOverride, CommandLine: rewritten },
      }));
      return;
    }

    if (Object.keys(minWaitOverride).length > 0) {
      process.stdout.write(JSON.stringify({
        decision: 'allow',
        overwrite: minWaitOverride,
      }));
      return;
    }
  } catch {
    // Em caso de falha no parse, nunca bloqueia a execução do agente
  }

  process.stdout.write(JSON.stringify({ decision: 'allow' }));
});
