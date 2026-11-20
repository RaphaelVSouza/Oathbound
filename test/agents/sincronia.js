#!/usr/bin/env node
'use strict';
// Synchronize common rules across agent copies (Claude, Codex, agy).
//   node test/agents/sincronia.js             check; exit 1 on divergence
//   node test/agents/sincronia.js --aplicar   append missing rules (Codex and agy)
// Canonical source: regras-comuns.json. Uses no quota.
// Variables: CLAUDE_AGENTS_DIR, CODEX_AGENTS_DIR, GEMINI_AGENTS_DIR.
const fs = require('fs');
const os = require('os');
const path = require('path');

const home = os.homedir();

const norm = (s) => s.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();

function carregar(arquivo) {
  return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
}

function resolverRegra(r, cli) {
  return typeof r === 'string' ? r : (r?.[cli] ?? r?.default ?? null);
}

// Return the list of issues in an agent copy.
function verificar(texto, agente, cfg, cli) {
  const n = norm(texto);
  const out = [];
  for (const r of cfg.regras[agente] || []) {
    const regra = resolverRegra(r, cli);
    if (!regra) continue;
    if (!n.includes(norm(regra))) out.push({ tipo: 'falta', detalhe: regra.split(':')[0] });
  }
  for (const p of cfg.proibido || []) {
    if (texto.includes(p)) out.push({ tipo: 'proibido', detalhe: p });
  }
  return out;
}

// Append a rule: before "Receipt:" if present, otherwise at the end of instructions.
function inserir(texto, ext, regra) {
  const linha = `- ${regra}`;
  const rec = texto.search(/^Receipt:/m);
  if (rec >= 0) return texto.slice(0, rec).replace(/\s*$/, '\n') + linha + '\n\n' + texto.slice(rec);
  if (ext === '.md') return texto.replace(/\s*$/, '\n') + '\n' + linha + '\n';
  const m = texto.indexOf('developer_instructions = """');
  if (m >= 0) {
    const fim = texto.lastIndexOf('"""');
    return texto.slice(0, fim).replace(/\s*$/, '\n') + '\n' + linha + '\n' + texto.slice(fim);
  }
  // Single-line string with escaped \n: insert before the final quote on the line.
  const re = /^(developer_instructions = ".*)"([ \t]*)$/m;
  if (re.test(texto)) return texto.replace(re, (_, a, b) => `${a}\\n\\n${linha}"${b}`);
  throw new Error('unrecognized agent format');
}

function executar({ aplicar = false, cfgPath = path.join(__dirname, 'regras-comuns.json'), dirs } = {}) {
  const cfg = carregar(cfgPath);
  const relatorio = [];
  const clis = {
    claude: { dir: dirs?.claude || process.env.CLAUDE_AGENTS_DIR || path.join(__dirname, '..', '..', 'claude', 'agents'), ext: '.md', aplica: false },
    codex: { dir: dirs?.codex || process.env.CODEX_AGENTS_DIR || path.join(home, '.codex', 'agents'), ext: '.toml', aplica: true },
    gemini: { dir: dirs?.gemini || process.env.GEMINI_AGENTS_DIR || path.join(__dirname, '..', '..', 'agy', 'config', 'agents'), ext: '.md', aplica: true },
  };
  for (const [cli, c] of Object.entries(clis)) {
    if (cli === 'codex' && !dirs?.codex && !fs.existsSync(c.dir)) {
      continue;
    }
    for (const agente of Object.keys(cfg.regras)) {
      const nome = cfg.mapa?.[cli]?.[agente] ?? cfg.nomes?.[cli]?.[agente] ?? agente;
      const arq = path.join(c.dir, nome + c.ext);
      if (!fs.existsSync(arq)) { relatorio.push({ cli, agente, tipo: 'ausente', detalhe: arq }); continue; }
      let texto = fs.readFileSync(arq, 'utf8');
      let probs = verificar(texto, agente, cfg, cli);
      if (aplicar && c.aplica) {
        for (const p of probs.filter((x) => x.tipo === 'falta')) {
          const regra = cfg.regras[agente].map((r) => resolverRegra(r, cli)).find((r) => r && r.split(':')[0] === p.detalhe);
          if (regra) texto = inserir(texto, c.ext, regra);
        }
        fs.writeFileSync(arq, texto, 'utf8');
        probs = verificar(texto, agente, cfg, cli);
      }
      for (const p of probs) relatorio.push({ cli, agente, ...p });
    }
  }
  return relatorio;
}

module.exports = { norm, resolverRegra, verificar, inserir, executar };

if (require.main === module) {
  const rel = executar({ aplicar: process.argv.includes('--aplicar') });
  for (const r of rel) console.log(`${r.cli}/${r.agente}: ${r.tipo} ${r.detalhe}`);
  console.log(rel.length ? `${rel.length} divergence(s)` : 'ok synchronization');
  process.exit(rel.length ? 1 : 0);
}
