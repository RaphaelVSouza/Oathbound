#!/usr/bin/env node
// Benchmark de cold start dos hooks PreToolUse do Oathbound.
// Mede latência de spawn + execução completa (stdin -> stdout) em ms.
// Uso: node tools/bench-hooks.cjs [--runs=25] [--bin=<caminho-do-binario-nativo>]
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  let runs = 25;
  let bin = null;
  for (const arg of argv) {
    if (arg.startsWith('--runs=')) runs = Math.max(1, Number(arg.slice(7)) || 25);
    else if (arg.startsWith('--bin=')) bin = arg.slice(6);
  }
  return { runs, bin };
}

function percentile(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function measure(cmd, args, input, env, runs, warmup = 3) {
  for (let i = 0; i < warmup; i++) {
    spawnSync(cmd, args, { input, encoding: 'utf8', env });
  }
  const times = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    const res = spawnSync(cmd, args, { input, encoding: 'utf8', env });
    const dt = performance.now() - t0;
    if (res.error) throw res.error;
    times.push(dt);
  }
  times.sort((a, b) => a - b);
  return {
    min: times[0],
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    max: times[times.length - 1],
  };
}

function main() {
  const { runs, bin } = parseArgs(process.argv.slice(2));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-bench-'));
  const env = { ...process.env, AGENT_AUDIT_DIR: tmpDir };

  const cases = [
    {
      name: 'plugin-agent-guard (allow)',
      subcmd: 'plugin-agent-guard',
      script: path.join(ROOT, 'claude', 'hooks', 'plugin-agent-guard.js'),
      input: JSON.stringify({
        agent_id: 'bench-1',
        agent_type: 'oathbound:smith',
        tool_name: 'Bash',
        tool_input: { command: 'git status' },
      }),
    },
    {
      name: 'plugin-agent-guard (deny)',
      subcmd: 'plugin-agent-guard',
      script: path.join(ROOT, 'claude', 'hooks', 'plugin-agent-guard.js'),
      input: JSON.stringify({
        agent_id: 'bench-2',
        agent_type: 'oathbound:smith',
        tool_name: 'Bash',
        tool_input: { command: 'git push origin main' },
      }),
    },
    {
      name: 'agent-audit (append)',
      subcmd: 'agent-audit',
      script: path.join(ROOT, 'claude', 'hooks', 'agent-audit.js'),
      input: JSON.stringify({
        agent_id: 'bench-3',
        agent_type: 'oathbound:scout',
        session_id: 'sess-12345678',
        tool_name: 'Read',
        tool_use_id: 'tu-1',
      }),
    },
    {
      name: 'rtk-hook (deny find)',
      subcmd: 'rtk-hook',
      script: path.join(ROOT, 'agy', 'antigravity-cli', 'rtk-hook.js'),
      input: JSON.stringify({
        toolCall: { args: { CommandLine: 'find . -name "*.js"' } },
      }),
    },
  ];

  try {
    const mode = bin ? `native (${bin})` : `node ${process.version}`;
    console.log(`Benchmark: ${mode} | ${os.platform()}-${os.arch()} | runs=${runs}\n`);
    console.log('| Hook | min (ms) | p50 (ms) | p95 (ms) | max (ms) |');
    console.log('| --- | ---: | ---: | ---: | ---: |');
    for (const c of cases) {
      const cmd = bin || process.execPath;
      const args = bin ? [c.subcmd] : [c.script];
      const stats = measure(cmd, args, c.input, env, runs);
      console.log(
        `| ${c.name} | ${stats.min.toFixed(1)} | ${stats.p50.toFixed(1)} | ${stats.p95.toFixed(1)} | ${stats.max.toFixed(1)} |`
      );
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();
