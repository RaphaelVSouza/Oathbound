#!/usr/bin/env node
// UserPromptSubmit hook: suggests at most one skill per prompt, using Jev (TypeSafe).
// ADR 0001 prototype (docs/adr/0001-sugestao-de-skill-com-jev.md): NOT registered in settings.json.
// One request: `Choice` selects a skill; `Noul` decides whether any skill applies.
// `subagente` mode (ADR 0002, step 2): `SKILL_SUGGEST_MODO=subagente` replaces the request with a `Choice` among
// subagents (agents/*.md + built-ins) and `inline`, plus one `Noul` per subagent. Never both modes in one request.
// Fails silently without stdout: missing keys, no network, timeouts, or invalid responses do not block the prompt.
// Prompt text goes to the external service after secret redaction; the log does not store the prompt.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { redigir } = require('./redigir.js');

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const MODELO = 'jev-1.14.0'; // pinned version: measurements apply only to this version
const TEMPO_MAX_MS = 4000;
const MAX_PROMPT = 2000;
const MIN_PROMPT = 15;
const MAX_DESC = 300;
const MAX_STDIN = 1024 * 1024;
// Constants from the `skill_suggestion` cookbook, not yet calibrated on this dataset (ADR 0001, acceptance criterion).
const LIMIAR_ACAO = 0.3;
const LIMIAR_NOMEIA = 0.5;
const LIMIAR_CONFIANCA = 0.5;
// Not calibrated on this dataset: initial values, to calibrate in ADR 0002 step 3.
const LIMIAR_PROB_SUB = 0.5; // probability of the selected `Choice` option (recommended by confidence.md, not `confidence`)
// Selected `Noul` bands: >= ALTO suggests, <= BAIXO stays silent, middle stays silent and records `faixa: 'meio'`.
const LIMIAR_NOUL_SUB_ALTO = 0.7;
const LIMIAR_NOUL_SUB_BAIXO = 0.3;
const OPCAO_INLINE = 'inline';
const DESC_INLINE = 'Resolve in the main thread, without delegation: known answer or trivial edit to 1 file.';
// Pairs Jev confused in the ADR 0002 measurement; each Noul's `nao_faz` points to its pair.
const PARES_CONFUNDIDOS = {
  smith: 'general-purpose',
  'general-purpose': 'smith',
  scholar: 'claude-code-guide',
  'claude-code-guide': 'scholar',
  assayer: 'sentinel',
  sentinel: 'assayer',
  scout: 'Explore',
  Explore: 'scout',
};
const SUBAGENTES_EMBUTIDOS = {
  Explore: 'Fast code exploration agent: find files by pattern, search keywords, and answer codebase questions.',
  Plan: 'Software architect: designs the implementation plan, identifies critical files, and compares trade-offs.',
  'general-purpose': 'General agent for researching complex questions, searching code, and executing multi-step tasks.',
  'claude-code-guide': 'Answers questions about Claude Code (CLI, hooks, MCP, settings), the Agent SDK, and the Anthropic API.',
  'statusline-setup': 'Configures the Claude Code status line for the user.',
};

const raizClaude = () => process.env.SKILL_SUGGEST_HOME || path.join(os.homedir(), '.claude');

function frontmatter(texto) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(texto);
  if (!m) return null;
  const nome = /^name:\s*(.+)$/m.exec(m[1]);
  const desc = /^description:\s*(>-?|\|-?)?\s*([\s\S]*?)(?=^\S|$(?![\s\S]))/m.exec(m[1]);
  if (!nome || !desc) return null;
  const descricao = desc[2].split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(' ').replace(/^["']|["']$/g, '');
  return { nome: nome[1].trim().replace(/^["']|["']$/g, ''), descricao };
}

function versaoMaior(a, b) {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

// Local skills (`skills/<name>/SKILL.md`) and plugin skills (`plugins/cache/<mkt>/<plugin>/<version>/skills/...`).
// Only the latest version of each plugin. Ignores `_disabled`.
function carregarCatalogo(raiz = raizClaude()) {
  const achados = new Map();
  const ler = (arquivo, prefixo) => {
    try {
      const fm = frontmatter(fs.readFileSync(arquivo, 'utf8'));
      if (!fm) return;
      const nome = prefixo ? `${prefixo}:${fm.nome.replace(/^.*:/, '')}` : fm.nome;
      achados.set(nome, fm.descricao.slice(0, MAX_DESC));
    } catch { /* unreadable file: skip */ }
  };
  const listar = (dir) => { try { return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; } };

  for (const s of listar(path.join(raiz, 'skills'))) {
    if (s.startsWith('_')) continue;
    ler(path.join(raiz, 'skills', s, 'SKILL.md'), '');
  }
  const cache = path.join(raiz, 'plugins', 'cache');
  for (const mkt of listar(cache)) {
    for (const plugin of listar(path.join(cache, mkt))) {
      const versoes = listar(path.join(cache, mkt, plugin)).sort(versaoMaior);
      const v = versoes[versoes.length - 1];
      if (!v) continue;
      const base = path.join(cache, mkt, plugin, v, 'skills');
      for (const s of listar(base)) ler(path.join(base, s, 'SKILL.md'), plugin);
    }
  }
  return achados;
}

// Shuffles deterministically per prompt: controls `Choice` first-option bias.
function embaralhar(nomes, semente) {
  const h = crypto.createHash('sha256').update(semente).digest();
  const lista = nomes.slice();
  for (let i = lista.length - 1; i > 0; i--) {
    const j = h[i % h.length] % (i + 1);
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
}

function montarPerguntas(catalogo, prompt, alvo = 'skill') {
  const criteria = {};
  for (const nome of embaralhar([...catalogo.keys()], prompt)) criteria[nome] = catalogo.get(nome);
  return {
    skill: {
      type: 'choice',
      instructions: `Which ${alvo === 'subagente' ? 'subagent' : alvo} in the catalog does exactly what the user request requires? Choose the closest match, even if none fits.`,
      criteria,
    },
    acao: {
      type: 'noul',
      instructions: 'Does the request require an action (on files, accounts, services, browser) or a documented procedure, rather than just a text answer?',
    },
    nomeia: {
      type: 'noul',
      instructions: 'Does the request name a specific tool, format, model, or method (for example a skill, plugin, file type, or slash command)?',
    },
  };
}

async function chamarJev(estado, perguntas, chave, buscar = fetch) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TEMPO_MAX_MS);
  try {
    const r = await buscar(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: estado, model: MODELO, questions: perguntas }),
      signal: ctl.signal,
    });
    if (!r.ok) return null;
    return await r.json();
  } finally { clearTimeout(timer); }
}

// Returns { skill, confianca, acao, nomeia } or null. Suggests only if a skill is wanted
// (action or naming above threshold) and selection confidence passes the threshold.
function decidir(resposta, catalogo) {
  const r = resposta && resposta.answers;
  if (!r || !r.skill || !r.acao || !r.nomeia) return null;
  const skill = r.skill.choice;
  const confianca = Number(r.skill.confidence);
  const acao = Number(r.acao.noul);
  const nomeia = Number(r.nomeia.noul);
  if (![confianca, acao, nomeia].every(Number.isFinite)) return null;
  const detalhe = { skill, confianca, acao, nomeia };
  if (!catalogo.has(skill)) return { ...detalhe, sugerir: false };
  const desejada = acao >= LIMIAR_ACAO || nomeia >= LIMIAR_NOMEIA;
  return { ...detalhe, sugerir: desejada && confianca >= LIMIAR_CONFIANCA };
}

function bloco(skill) {
  return `<skill_relevance>\nPossibly relevant to the request: ${skill}. Ignore if it does not match what the user requested.\n</skill_relevance>`;
}

function registrarLog(dado) {
  try {
    const dir = process.env.SKILL_SUGGEST_LOG_DIR || path.join(raizClaude(), 'state');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'skill-suggest.jsonl'), JSON.stringify({ ts: new Date().toISOString(), modelo: MODELO, ...dado }) + '\n');
  } catch { /* logging is optional */ }
}

// Local subagents (`agents/*.md`) plus fixed built-ins. A same-named file does not override a built-in.
function carregarSubagentes(raiz = raizClaude()) {
  const achados = new Map();
  try {
    for (const arq of fs.readdirSync(path.join(raiz, 'agents')).filter((f) => f.endsWith('.md')).sort()) {
      try {
        const fm = frontmatter(fs.readFileSync(path.join(raiz, 'agents', arq), 'utf8'));
        if (fm) achados.set(fm.nome, fm.descricao.slice(0, MAX_DESC));
      } catch { /* unreadable file: skip */ }
    }
  } catch { /* no agents directory */ }
  for (const [nome, desc] of Object.entries(SUBAGENTES_EMBUTIDOS)) achados.set(nome, desc);
  return achados;
}

// Service-safe key: names with hyphens or other symbols become `_`.
const chaveNoul = (nome) => `noul_${nome.replace(/[^A-Za-z0-9]/g, '_')}`;

// One `Choice` among all subagents and one `Noul` per subagent, in a single request.
function montarPerguntasSubagente(catalogo, prompt) {
  const criteria = {};
  for (const nome of embaralhar([...catalogo.keys(), OPCAO_INLINE], prompt)) criteria[nome] = nome === OPCAO_INLINE ? DESC_INLINE : catalogo.get(nome);
  const perguntas = {
    subagente: {
      type: 'choice',
      instructions: 'Which subagent in the catalog is best suited to execute the user request? Choose the closest match, even if none fits.',
      criteria,
    },
  };
  for (const [nome, desc] of catalogo) {
    const par = PARES_CONFUNDIDOS[nome];
    const nao_faz = par && catalogo.has(par) ? [`Request suited to ${par}: ${catalogo.get(par)}`] : ['Request better handled by another subagent in the catalog.'];
    perguntas[chaveNoul(nome)] = {
      type: 'noul',
      instructions: `Should this request be delegated to subagent ${nome}?`,
      criteria: { true: { faz: desc }, false: { nao_faz } },
    };
  }
  return perguntas;
}

// Returns { subagente, prob, noul, faixa, sugerir } or null. Selected `inline`: silent, with `inline: true`.
// Suggests only if the selected `Choice` probability passes the threshold and its `Noul` falls in the high band.
function decidirSubagente(resposta, catalogo, limiares = {}) {
  const { conf = LIMIAR_PROB_SUB, alto = LIMIAR_NOUL_SUB_ALTO, baixo = LIMIAR_NOUL_SUB_BAIXO } = limiares;
  const r = resposta && resposta.answers;
  if (!r || !r.subagente) return null;
  const subagente = r.subagente.choice;
  const probs = r.subagente.probabilities;
  const prob = Number(probs && probs[subagente]);
  if (!Number.isFinite(prob)) return null;
  if (subagente === OPCAO_INLINE) return { subagente, prob, noul: null, inline: true, sugerir: false };
  if (!catalogo.has(subagente)) return { subagente, prob, noul: null, sugerir: false };
  const resp = r[chaveNoul(subagente)];
  const noul = resp ? Number(resp.noul) : NaN;
  if (!Number.isFinite(noul)) return null;
  const faixa = noul >= alto ? 'alta' : noul <= baixo ? 'baixa' : 'meio';
  return { subagente, prob, noul, faixa, sugerir: prob >= conf && faixa === 'alta' };
}

function blocoSubagente(nome) {
  return `<subagent_relevance>\nPossibly suitable subagent: ${nome}. Ignore if it does not match.\n</subagent_relevance>`;
}

// Same safeguards as `sugerir`. `deps` injects catalog, key, and transport.
async function sugerirSubagente(prompt, deps = {}) {
  const chave = deps.chave !== undefined ? deps.chave : process.env.JEV_API_KEY;
  if (!chave) return null;
  const texto = String(prompt || '').trim();
  if (texto.length < MIN_PROMPT || texto.startsWith('/')) return null;
  const catalogo = deps.catalogo || carregarSubagentes();
  if (catalogo.size < 2) return null;
  const estado = redigir(texto.slice(0, MAX_PROMPT));
  const resposta = await chamarJev(estado, montarPerguntasSubagente(catalogo, texto), chave, deps.buscar);
  const d = decidirSubagente(resposta, catalogo);
  if (!d) return null;
  registrarLog({ modo: 'subagente', ...d, tamanho: texto.length, catalogo: catalogo.size });
  return d.sugerir ? { subagente: d.subagente, contexto: blocoSubagente(d.subagente) } : null;
}

// `deps` allows injecting catalog, key, and transport in tests.
async function sugerir(prompt, deps = {}) {
  const chave = deps.chave !== undefined ? deps.chave : process.env.JEV_API_KEY;
  if (!chave) return null;
  const texto = String(prompt || '').trim();
  if (texto.length < MIN_PROMPT || texto.startsWith('/')) return null;
  const catalogo = deps.catalogo || carregarCatalogo();
  if (catalogo.size < 2) return null;
  const estado = redigir(texto.slice(0, MAX_PROMPT));
  const resposta = await chamarJev(estado, montarPerguntas(catalogo, texto), chave, deps.buscar);
  const d = decidir(resposta, catalogo);
  if (!d) return null;
  registrarLog({ ...d, tamanho: texto.length, catalogo: catalogo.size });
  return d.sugerir ? { skill: d.skill, contexto: bloco(d.skill) } : null;
}

async function principal() {
  let bruto = '';
  const timer = setTimeout(() => process.exit(0), TEMPO_MAX_MS + 1000);
  for await (const parte of process.stdin) {
    bruto += parte;
    if (bruto.length > MAX_STDIN) return;
  }
  let entrada;
  try { entrada = JSON.parse(bruto); } catch { return; }
  const prompt = entrada && entrada.prompt;
  const s = process.env.SKILL_SUGGEST_MODO === 'subagente' ? await sugerirSubagente(prompt) : await sugerir(prompt);
  if (s) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: s.contexto } }));
  }
  clearTimeout(timer);
}

if (require.main === module) principal().catch(() => {}).finally(() => process.exit(0));

module.exports = { chamarJev, carregarCatalogo, montarPerguntas, decidir, sugerir, embaralhar, frontmatter, bloco,
  carregarSubagentes, montarPerguntasSubagente, decidirSubagente, sugerirSubagente, blocoSubagente,
  LIMIAR_PROB_SUB, LIMIAR_NOUL_SUB_ALTO, LIMIAR_NOUL_SUB_BAIXO, PARES_CONFUNDIDOS };
