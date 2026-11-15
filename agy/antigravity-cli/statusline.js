#!/usr/bin/env node
// Statusline do Antigravity CLI (agy)
// Lê o payload JSON do stdin e exibe:
// Projeto/Branch (via .git/HEAD, sem spawnar processos) | Modelo | Contexto | Cota (5h + semanal) | Subagentes ativos
const fs = require('fs');
const path = require('path');

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

function fmtTokens(n) {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 10e6 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 100e3 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(Math.round(n));
}

function fmtDuration(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const remH = h % 24;
    return remH > 0 ? `${d}d${remH}h` : `${d}d`;
  }
  if (h > 0) return m > 0 ? `${h}h${String(m).padStart(2, '0')}m` : `${h}h`;
  return `${m}m`;
}

function colorByPct(pct, invert = false) {
  // invert=false: maior = melhor (cota restante)
  // invert=true:  maior = pior (uso de contexto)
  const val = invert ? 100 - pct : pct;
  if (val <= 15) return C.red;
  if (val <= 40) return C.yellow;
  return C.green;
}

function readGitBranch(startDir) {
  if (!startDir) return null;
  let dir = path.resolve(startDir);
  for (let i = 0; i < 6; i++) {
    const dotGit = path.join(dir, '.git');
    try {
      const stat = fs.statSync(dotGit);
      let headPath = path.join(dotGit, 'HEAD');
      if (stat.isFile()) {
        const gitdirContent = fs.readFileSync(dotGit, 'utf8').trim();
        const m = gitdirContent.match(/^gitdir:\s*(.+)$/i);
        if (m) headPath = path.resolve(dir, m[1].trim(), 'HEAD');
      }
      const head = fs.readFileSync(headPath, 'utf8').trim();
      if (head.startsWith('ref: refs/heads/')) {
        return head.slice('ref: refs/heads/'.length);
      }
      return head.slice(0, 7);
    } catch {
      // sobe um nível
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

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
  let p = {};
  try { p = JSON.parse(raw); } catch { /* ignora JSON inválido */ }

  const parts = [];

  // 1. Projeto + Branch Git
  const cwd = (p.workspace && (p.workspace.current_dir || p.workspace.project_dir)) || p.cwd || '';
  const project = cwd ? path.basename(cwd) : '';
  const branch = (p.vcs && p.vcs.branch) || readGitBranch(cwd);
  if (project || branch) {
    const dirty = p.vcs && p.vcs.dirty ? '*' : '';
    const repoLabel = project && branch
      ? `${C.bold}${C.cyan}${project}${C.reset} ${C.cyan}(${branch}${dirty})${C.reset}`
      : `${C.cyan}${branch || project}${dirty}${C.reset}`;
    parts.push(repoLabel);
  }

  // 2. Modelo + Effort
  if (p.model && (p.model.display_name || p.model.id)) {
    let modelName = String(p.model.display_name || p.model.id)
      .replace(/^Gemini\s+/i, '')
      .replace(/\s*\((Low|Medium|High|Max)\)\s*$/i, '');
    const effort = p.model.effort ? `${C.dim}/${p.model.effort}${C.reset}` : '';
    parts.push(`${C.magenta}${modelName}${C.reset}${effort}`);
  }

  // 3. Context Window (ocupação atual + tamanho + cache hit)
  const cw = p.context_window;
  if (cw) {
    const usedPct = Number.isFinite(cw.used_percentage) ? Math.round(cw.used_percentage) : null;
    const u = cw.current_usage || {};
    const inputTokens = u.input_tokens || 0;
    const cacheTokens = u.cache_read_input_tokens || 0;
    const outputTokens = u.output_tokens || 0;
    const curTokens = inputTokens + cacheTokens + outputTokens;
    const maxTokens = cw.context_window_size || 0;
    const ctxColor = usedPct != null ? colorByPct(usedPct, true) : C.yellow;

    let ctxText = '';
    if (curTokens > 0 && maxTokens > 0) {
      ctxText = `ctx ${fmtTokens(curTokens)}`;
      if (usedPct != null) ctxText += ` (${usedPct}%)`;
    } else if (usedPct != null) {
      ctxText = `ctx ${usedPct}%`;
    } else {
      ctxText = `${fmtTokens(cw.total_input_tokens)} in / ${fmtTokens(cw.total_output_tokens)} out`;
    }

    // Cache hit ratio no prompt
    const totalPrompt = inputTokens + cacheTokens;
    if (totalPrompt > 1000) {
      const cachePct = Math.round((cacheTokens / totalPrompt) * 100);
      const cacheCol = cachePct >= 75 ? C.green : cachePct >= 40 ? C.yellow : C.dim;
      ctxText += ` ${C.dim}[${C.reset}${cacheCol}cache ${cachePct}%${C.reset}${C.dim}]${C.reset}`;
    }

    // Alerta visual de compactação quando atingir 50%
    if (usedPct != null && usedPct >= 50) {
      ctxText += ` ${C.bold}${C.red}⚠ /compact${C.reset}`;
    }

    parts.push(`${ctxColor}${ctxText}${C.reset}`);
  }

  // 4. Cota (janela 5h + semanal Argon/Gemini)
  if (p.quota && typeof p.quota === 'object') {
    const q5h = p.quota['gemini-5h'] || p.quota['3p-5h'];
    const qWk = p.quota['gemini-argon-wtu-weekly'] || p.quota['gemini-weekly'] || p.quota['3p-weekly'];
    const qParts = [];

    if (q5h && Number.isFinite(q5h.remaining_fraction)) {
      const pct = Math.round(q5h.remaining_fraction * 100);
      const col = colorByPct(pct, false);
      const rst = fmtDuration(q5h.reset_in_seconds);
      qParts.push(`5h:${col}${pct}%${C.reset}${rst ? `${C.dim}(${rst})${C.reset}` : ''}`);
    }
    if (qWk && Number.isFinite(qWk.remaining_fraction)) {
      const pct = Math.round(qWk.remaining_fraction * 100);
      const col = colorByPct(pct, false);
      qParts.push(`sem:${col}${pct}%${C.reset}`);
    }
    if (qParts.length > 0) {
      parts.push(qParts.join(' '));
    }
  }

  // 5. Subagentes ativos
  if (Array.isArray(p.subagents)) {
    const running = p.subagents.filter((s) => s && s.status === 'running');
    if (running.length > 0) {
      const names = running.map((s) => s.name || 'subagent').join(',');
      parts.push(`${C.blue}⚡ ${running.length} sub (${names})${C.reset}`);
    }
  }

  process.stdout.write(parts.join(` ${C.dim}|${C.reset} `));
});
