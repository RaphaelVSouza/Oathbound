#!/usr/bin/env node
// Hook UserPromptSubmit: sugere no máximo uma skill por prompt, usando o Jev (TypeSafe).
// Protótipo do ADR 0001 (docs/adr/0001-sugestao-de-skill-com-jev.md): NÃO registrado em settings.json.
// Um request: `Choice` escolhe qual skill; `Noul` decide se alguma skill se aplica.
// Modo `subagente` (ADR 0002, passo 2): `SKILL_SUGGEST_MODO=subagente` troca o request por um `Choice` entre os
// subagentes (agents/*.md + embutidos) e a opção `inline`, mais um `Noul` por subagente. Nunca os dois modos no mesmo request.
// Falha em silêncio e sem stdout: sem chave, sem rede, timeout ou resposta inválida não bloqueiam o prompt.
// O texto do prompt vai ao serviço externo depois da redação de segredos; o log não guarda o prompt.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { redigir } = require('./redigir.js');

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const MODELO = 'jev-1.14.0'; // versão fixa: a medição só vale para ela
const TEMPO_MAX_MS = 4000;
const MAX_PROMPT = 2000;
const MIN_PROMPT = 15;
const MAX_DESC = 300;
const MAX_STDIN = 1024 * 1024;
// Constantes do cookbook `skill_suggestion`, ainda sem calibração nesta base (ADR 0001, critério de aceite).
const LIMIAR_ACAO = 0.3;
const LIMIAR_NOMEIA = 0.5;
const LIMIAR_CONFIANCA = 0.5;
// Sem calibração nesta base: valores iniciais, a calibrar no ADR 0002 passo 3.
const LIMIAR_PROB_SUB = 0.5; // probabilidade da opção escolhida no `Choice` (confidence.md recomenda, não `confidence`)
// Faixas do `Noul` do escolhido: >= ALTO sugere, <= BAIXO cala, o meio cala e registra `faixa: 'meio'`.
const LIMIAR_NOUL_SUB_ALTO = 0.7;
const LIMIAR_NOUL_SUB_BAIXO = 0.3;
const OPCAO_INLINE = 'inline';
const DESC_INLINE = 'Resolver na thread principal, sem delegar: resposta já conhecida ou edição trivial de 1 arquivo.';
// Pares que o Jev confundiu na medição do ADR 0002; o `nao_faz` de cada Noul aponta o par.
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
  Explore: 'Agente rápido para explorar código: buscar arquivos por padrão, procurar palavras-chave e responder perguntas sobre a base.',
  Plan: 'Arquiteto de software: projeta o plano de implementação, identifica arquivos críticos e compara trade-offs.',
  'general-purpose': 'Agente genérico para pesquisar questões complexas, buscar código e executar tarefas de vários passos.',
  'claude-code-guide': 'Responde dúvidas sobre o Claude Code (CLI, hooks, MCP, configurações), o Agent SDK e a API da Anthropic.',
  'statusline-setup': 'Configura a status line do Claude Code do usuário.',
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

// Skills próprias (`skills/<nome>/SKILL.md`) e de plugins (`plugins/cache/<mkt>/<plugin>/<versão>/skills/...`).
// Só a versão mais recente de cada plugin. Ignora `_disabled`.
function carregarCatalogo(raiz = raizClaude()) {
  const achados = new Map();
  const ler = (arquivo, prefixo) => {
    try {
      const fm = frontmatter(fs.readFileSync(arquivo, 'utf8'));
      if (!fm) return;
      const nome = prefixo ? `${prefixo}:${fm.nome.replace(/^.*:/, '')}` : fm.nome;
      achados.set(nome, fm.descricao.slice(0, MAX_DESC));
    } catch { /* arquivo ilegível: ignora */ }
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

// Embaralha de forma determinística por prompt: controla o viés de primeira opção do `Choice`.
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
      instructions: `Qual ${alvo} do catálogo faz exatamente o que o pedido do usuário exige? Escolha a que mais se aproxima, mesmo que nenhuma sirva.`,
      criteria,
    },
    acao: {
      type: 'noul',
      instructions: 'O pedido exige executar uma ação (em arquivos, contas, serviços, navegador) ou seguir um procedimento documentado, em vez de apenas ser respondido com texto?',
    },
    nomeia: {
      type: 'noul',
      instructions: 'O pedido nomeia uma ferramenta, formato, modelo ou método específico (por exemplo uma skill, um plugin, um tipo de arquivo ou um comando com barra)?',
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

// Devolve { skill, confianca, acao, nomeia } ou null. Só sugere se alguma skill é desejada
// (ação ou nomeia acima do limiar) e a confiança da escolha passa do limiar.
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
  return `<skill_relevance>\nPossivelmente relevante ao pedido: ${skill}. Ignore se não combinar com o que o usuário pediu.\n</skill_relevance>`;
}

function registrarLog(dado) {
  try {
    const dir = process.env.SKILL_SUGGEST_LOG_DIR || path.join(raizClaude(), 'state');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'skill-suggest.jsonl'), JSON.stringify({ ts: new Date().toISOString(), modelo: MODELO, ...dado }) + '\n');
  } catch { /* log é opcional */ }
}

// Subagentes próprios (`agents/*.md`) mais os embutidos fixos. Embutido não é sobrescrito por arquivo homônimo.
function carregarSubagentes(raiz = raizClaude()) {
  const achados = new Map();
  try {
    for (const arq of fs.readdirSync(path.join(raiz, 'agents')).filter((f) => f.endsWith('.md')).sort()) {
      try {
        const fm = frontmatter(fs.readFileSync(path.join(raiz, 'agents', arq), 'utf8'));
        if (fm) achados.set(fm.nome, fm.descricao.slice(0, MAX_DESC));
      } catch { /* arquivo ilegível: ignora */ }
    }
  } catch { /* sem pasta agents */ }
  for (const [nome, desc] of Object.entries(SUBAGENTES_EMBUTIDOS)) achados.set(nome, desc);
  return achados;
}

// Chave segura para o serviço: nomes com hífen ou outros símbolos viram `_`.
const chaveNoul = (nome) => `noul_${nome.replace(/[^A-Za-z0-9]/g, '_')}`;

// Um `Choice` entre todos os subagentes e um `Noul` por subagente, num único request.
function montarPerguntasSubagente(catalogo, prompt) {
  const criteria = {};
  for (const nome of embaralhar([...catalogo.keys(), OPCAO_INLINE], prompt)) criteria[nome] = nome === OPCAO_INLINE ? DESC_INLINE : catalogo.get(nome);
  const perguntas = {
    subagente: {
      type: 'choice',
      instructions: 'Qual subagente do catálogo é o mais adequado para executar o pedido do usuário? Escolha o que mais se aproxima, mesmo que nenhum sirva.',
      criteria,
    },
  };
  for (const [nome, desc] of catalogo) {
    const par = PARES_CONFUNDIDOS[nome];
    const nao_faz = par && catalogo.has(par) ? [`Pedido que cabe ao ${par}: ${catalogo.get(par)}`] : ['Pedido que outro subagente do catálogo atende melhor.'];
    perguntas[chaveNoul(nome)] = {
      type: 'noul',
      instructions: `Este pedido deve ser delegado ao subagente ${nome}?`,
      criteria: { true: { faz: desc }, false: { nao_faz } },
    };
  }
  return perguntas;
}

// Devolve { subagente, prob, noul, faixa, sugerir } ou null. `inline` escolhido: calado, com `inline: true`.
// Sugere só se a probabilidade do escolhido no `Choice` passa do limiar e o `Noul` do escolhido cai na faixa alta.
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
  return `<subagent_relevance>\nSubagente possivelmente adequado: ${nome}. Ignore se não combinar.\n</subagent_relevance>`;
}

// Mesmas salvaguardas de `sugerir`. `deps` injeta catálogo, chave e transporte.
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

// `deps` permite injetar catálogo, chave e transporte nos testes.
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
