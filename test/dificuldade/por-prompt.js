#!/usr/bin/env node
'use strict';
// Custo e esforço por prompt humano, para medir se a dificuldade percebida prediz o custo.
// Somente leitura dos transcritos; sem rede. Raiz: CUSTO_HOME ou ~/.claude (como custo.js).
// Uso:
//   node por-prompt.js                 atualiza por-prompt.json e só cria rotulos.csv se faltar
//   node por-prompt.js --correlacao    lê rotulos.csv preenchido e imprime Spearman e veredito
// Saída em disco: por-prompt.json sem texto de prompt (id = sha256 curto do texto);
// rotulos.csv com texto redigido e truncado, sem custo, rótulo vazio. stdout: só contagens e quartis.
// Erros: opção inválida sai com 2; falta de arquivo na correlação sai com 1.
//
// Definições:
// - Prompt elegível: mesmo filtro de skill-suggest/extrair.js (>=15 chars, sem '/', sem '<', sem 'Caveman mode').
//   Qualquer prompt humano da cadeia principal encerra o trecho anterior, elegível ou não.
// - turnos: idas e voltas = resultados de ferramenta devolvidos ao modelo no trecho + 1.
// - Custo do subagente: mensagens de sidechain ligadas ao prompt por `promptId` (a linha humana da cadeia
//   principal e a primeira linha de cada arquivo de subagente compartilham o campo). Prompt sem promptId marca
//   custo_subagente_incluido=false; sidechain sem prompt correspondente é contada à parte, nunca atribuída.
// - correcao_seguinte: HEURÍSTICA FRACA. Palavra-chave nos 80 primeiros chars do prompt humano seguinte no transcrito;
//   "ainda" e "não" aparecem em frases que nada corrigem, e correções sem a palavra passam.
// - irreversivel: só o booleano e as categorias; o comando nunca é guardado.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { achaPreco, extrairTokens, precificar, listarJsonl } = require('../custo/custo.js');
const { redigir } = require('../../claude/hooks/redigir.js');

const HOME = process.env.CUSTO_HOME || path.join(os.homedir(), '.claude');
const MAX_AMOSTRA = 60;
const MAX_TEXTO_CSV = 240;
const FERRAMENTAS_EDICAO = new Set(['Edit', 'Write', 'NotebookEdit', 'apply_patch']);
const FERRAMENTAS_SHELL = new Set(['Bash', 'PowerShell']);

const IRREVERSIVEL = [
  ['rm', /(^|[\s;&|(`])rm\s/],
  ['remove-item', /Remove-Item/i],
  ['git-reset-hard', /git\s+reset\s+--hard/],
  ['git-push', /git\s+push/],
  ['git-clean', /git\s+clean/],
  ['drop', /\bDROP\s/],
  ['truncate', /\bTRUNCATE\b/],
  ['delete-from', /DELETE\s+FROM(?![\s\S]*\bWHERE\b)/i],
];
const CORRECAO = /(?<![\p{L}])(não|errado|de novo|refaça|corrija|ainda|erro)(?![\p{L}])/iu;

function categoriasIrreversiveis(comando) {
  return IRREVERSIVEL.filter(([, re]) => re.test(comando)).map(([nome]) => nome);
}

function eElegivel(texto) {
  const t = texto.trim();
  return t.length >= 15 && !t.startsWith('/') && !t.startsWith('<') && !t.startsWith('Caveman mode')
    && !t.startsWith('This session is being continued'); // resumo de compactação não é prompt humano
}

function indicaCorrecao(proximo) {
  return typeof proximo === 'string' && CORRECAO.test(proximo.trim().slice(0, 80));
}

const sha8 = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);

function ehHumano(o) {
  return o.type === 'user' && !o.isMeta && typeof o.message?.content === 'string';
}

// Lê todos os transcritos. Principal: segmenta por prompt humano. Sidechain: lista à parte para ligar por promptId.
function lerTranscritos(raiz) {
  const proj = path.join(raiz, 'projects');
  const prompts = [];
  const side = new Map();
  const vistas = new Set();
  let ilegiveis = 0;

  for (const arq of listarJsonl(proj)) {
    const emSub = path.relative(proj, arq).split(path.sep).includes('subagents');
    let atual = null;
    let promptDoArquivo = null;
    for (const linha of fs.readFileSync(arq, 'utf8').split('\n')) {
      if (!linha.trim()) continue;
      let o;
      try { o = JSON.parse(linha); } catch { ilegiveis++; continue; }
      if (!o || typeof o !== 'object') continue;
      const lateral = emSub || o.isSidechain === true;
      // Só a primeira linha do subagente traz promptId; as mensagens do assistente herdam do arquivo.
      if (lateral && !promptDoArquivo && o.promptId) promptDoArquivo = o.promptId;

      if (!lateral && ehHumano(o)) {
        if (atual) atual.proximoTexto = o.message.content;
        atual = {
          texto: o.message.content, promptId: o.promptId || null, msgs: new Map(),
          tools: new Map(), resultados: 0,
        };
        prompts.push(atual);
        continue;
      }
      if (o.type === 'user' && !lateral && atual && !o.isMeta && Array.isArray(o.message?.content)
        && o.message.content.some((b) => b && b.type === 'tool_result')) {
        atual.resultados++;
        continue;
      }
      if (o.type !== 'assistant' || !o.message || typeof o.message !== 'object') continue;

      const m = o.message;
      if (lateral) {
        if (!m.usage || typeof m.model !== 'string' || m.model === '<synthetic>') continue;
        const chave = m.id || o.requestId || `sl-${side.size}`;
        side.set(chave, { promptId: o.promptId || promptDoArquivo, modelo: m.model, tokens: extrairTokens(m.usage) });
        continue;
      }
      if (!atual) continue;
      // Streaming repete o id com um bloco por linha: ferramentas se juntam por tool_use id.
      if (Array.isArray(m.content)) {
        for (const b of m.content) {
          if (b && b.type === 'tool_use') atual.tools.set(b.id || `t-${atual.tools.size}`, b);
        }
      }
      if (m.usage && typeof m.usage === 'object' && typeof m.model === 'string' && m.model !== '<synthetic>') {
        const chave = m.id || o.requestId;
        if (chave && vistas.has(chave) && !atual.msgs.has(chave)) continue;
        if (chave) vistas.add(chave);
        atual.msgs.set(chave || `sc-${atual.msgs.size}`, { modelo: m.model, tokens: extrairTokens(m.usage) });
      }
    }
  }
  return { prompts, side, ilegiveis };
}

function custoDe(msgs) {
  let usd = 0;
  let semPreco = 0;
  for (const { modelo, tokens } of msgs) {
    const p = achaPreco(modelo);
    if (!p) { semPreco++; continue; }
    usd += precificar(tokens, p).c.total;
  }
  return { usd, semPreco };
}

function resumirPrompt(p, proximo, sideDoPrompt) {
  const porNome = {};
  const arquivos = new Set();
  const agentes = {};
  let nAgentes = 0;
  const cats = new Set();
  for (const b of p.tools.values()) {
    const nome = typeof b.name === 'string' ? b.name : 'desconhecida';
    porNome[nome] = (porNome[nome] || 0) + 1;
    const inp = b.input && typeof b.input === 'object' ? b.input : {};
    if (FERRAMENTAS_EDICAO.has(nome)) {
      const f = inp.file_path || inp.notebook_path;
      if (typeof f === 'string') arquivos.add(f);
    }
    if (nome === 'Agent' || nome === 'Task') {
      nAgentes++;
      const tipo = typeof inp.subagent_type === 'string' ? inp.subagent_type : 'desconhecido';
      agentes[tipo] = (agentes[tipo] || 0) + 1;
    }
    if (FERRAMENTAS_SHELL.has(nome) && typeof inp.command === 'string') {
      for (const c of categoriasIrreversiveis(inp.command)) cats.add(c);
    }
  }
  const principal = custoDe([...p.msgs.values()]);
  const ligado = p.promptId !== null;
  const sub = ligado ? custoDe(sideDoPrompt) : { usd: 0, semPreco: 0 };
  return {
    mensagens_assistente: p.msgs.size,
    chamadas_ferramenta: p.tools.size,
    ferramentas: porNome,
    arquivos_editados: arquivos.size,
    subagentes_chamados: nAgentes,
    subagentes_por_tipo: agentes,
    turnos: p.resultados + 1,
    custo_principal_usd: principal.usd,
    custo_subagente_usd: sub.usd,
    custo_usd: principal.usd + sub.usd,
    custo_subagente_incluido: ligado,
    mensagens_sem_preco: principal.semPreco + sub.semPreco,
    irreversivel: cats.size > 0,
    categorias_irreversivel: [...cats].sort(),
    correcao_seguinte: indicaCorrecao(proximo),
  };
}

function quartis(valores) {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const q = (f) => {
    const pos = (v.length - 1) * f;
    const i = Math.floor(pos);
    return v[i] + (v[Math.min(i + 1, v.length - 1)] - v[i]) * (pos - i);
  };
  return { min: v[0], q1: q(0.25), mediana: q(0.5), q3: q(0.75), max: v[v.length - 1] };
}

// Postos 1..n; empates recebem a média dos postos que ocupam.
function postos(v) {
  const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(v.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const media = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = media;
    i = j + 1;
  }
  return r;
}

// Spearman = Pearson dos postos. Retorna null se n < 2 ou uma série não varia.
function spearman(x, y) {
  if (x.length !== y.length || x.length < 2) return null;
  const a = postos(x);
  const b = postos(y);
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let cov = 0; let va = 0; let vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i] - ma) * (b[i] - mb);
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  return va === 0 || vb === 0 ? null : cov / Math.sqrt(va * vb);
}

// Descarta se rho do custo < 0,4 ou subestimação > 15%; rho indefinido também descarta.
function veredito(rhoCusto, subestimacao) {
  const motivos = [];
  if (rhoCusto === null || rhoCusto < 0.4) motivos.push('Spearman rótulo×custo < 0,4');
  if (subestimacao === null || subestimacao > 0.15) motivos.push('subestimação > 15%');
  return { descartar: motivos.length > 0, motivos };
}

function csvCampo(v) {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function lerCsv(texto) {
  const linhas = [];
  let campo = ''; let linha = []; let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some((x) => x !== '')) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => x !== '')) linhas.push(linha);
  return linhas;
}

function montarRotulos(registrosComTexto) {
  const ordenados = registrosComTexto
    .map((r) => ({ ...r, ordem: sha8('amostra:' + r.id) }))
    .sort((a, b) => (a.ordem < b.ordem ? -1 : a.ordem > b.ordem ? 1 : a.id.localeCompare(b.id)))
    .slice(0, MAX_AMOSTRA);
  const corpo = ordenados.map((r) => {
    const t = redigir(r.texto).replace(/\s+/g, ' ').trim();
    const cortado = t.length > MAX_TEXTO_CSV ? t.slice(0, MAX_TEXTO_CSV) : t;
    return [r.id, cortado, ''].map(csvCampo).join(',');
  });
  return ['id,texto,rotulo', ...corpo].join('\n') + '\n';
}

function gerar(raiz, dirSaida = path.join(raiz, 'state', 'dificuldade')) {
  const { prompts, side, ilegiveis } = lerTranscritos(raiz);
  const sidePorPrompt = new Map();
  let ligadas = 0;
  const conhecidos = new Set(prompts.map((p) => p.promptId).filter(Boolean));
  for (const m of side.values()) {
    if (m.promptId && conhecidos.has(m.promptId)) {
      ligadas++;
      if (!sidePorPrompt.has(m.promptId)) sidePorPrompt.set(m.promptId, []);
      sidePorPrompt.get(m.promptId).push(m);
    }
  }

  const registros = [];
  const textos = [];
  const usados = new Set();
  prompts.forEach((p) => {
    if (!eElegivel(p.texto)) return;
    let id = sha8(p.texto);
    for (let n = 1; usados.has(id); n++) id = sha8(`${p.texto}#${n}`);
    usados.add(id);
    registros.push({ id, ...resumirPrompt(p, p.proximoTexto, sidePorPrompt.get(p.promptId) || []) });
    textos.push({ id, texto: p.texto });
  });

  fs.mkdirSync(dirSaida, { recursive: true });
  fs.writeFileSync(path.join(dirSaida, 'por-prompt.json'), JSON.stringify(registros, null, 1));
  const csvPath = path.join(dirSaida, 'rotulos.csv');
  let rotulosCsvCriado = true;
  try {
    fs.writeFileSync(csvPath, montarRotulos(textos), { flag: 'wx' });
  } catch (erro) {
    if (erro.code !== 'EEXIST') throw erro;
    rotulosCsvCriado = false;
  }

  return {
    prompts_humanos: prompts.length,
    prompts_elegiveis: registros.length,
    amostra_rotulos: Math.max(0, lerCsv(fs.readFileSync(csvPath, 'utf8')).length - 1),
    rotulos_csv_criado: rotulosCsvCriado,
    mensagens_sidechain: side.size,
    sidechain_ligadas_a_prompt: ligadas,
    sidechain_nao_ligadas: side.size - ligadas,
    prompts_sem_promptid: registros.filter((r) => !r.custo_subagente_incluido).length,
    com_irreversivel: registros.filter((r) => r.irreversivel).length,
    com_correcao_seguinte: registros.filter((r) => r.correcao_seguinte).length,
    linhas_ilegiveis: ilegiveis,
    custo_usd_quartis: quartis(registros.map((r) => r.custo_usd)),
    turnos_quartis: quartis(registros.map((r) => r.turnos)),
  };
}

function correlacao(raiz) {
  const dir = path.join(raiz, 'state', 'dificuldade');
  const csv = lerCsv(fs.readFileSync(path.join(dir, 'rotulos.csv'), 'utf8'));
  const registros = JSON.parse(fs.readFileSync(path.join(dir, 'por-prompt.json'), 'utf8'));
  const porId = new Map(registros.map((r) => [r.id, r]));
  const [cab, ...linhas] = csv;
  const iId = cab.indexOf('id');
  const iRot = cab.indexOf('rotulo');
  const pares = [];
  for (const l of linhas) {
    const rot = Number(l[iRot]);
    const r = porId.get(l[iId]);
    if (r && Number.isInteger(rot) && rot >= 1 && rot <= 5) pares.push({ rot, r });
  }
  const q3 = quartis(registros.map((r) => r.custo_usd))?.q3;
  const baixos = pares.filter((p) => p.rot <= 2);
  const sub = baixos.length ? baixos.filter((p) => p.r.custo_usd > q3).length / baixos.length : null;
  const rhoCusto = spearman(pares.map((p) => p.rot), pares.map((p) => p.r.custo_usd));
  const rhoTurnos = spearman(pares.map((p) => p.rot), pares.map((p) => p.r.turnos));
  return {
    n: pares.length,
    spearman_rotulo_custo: rhoCusto,
    spearman_rotulo_turnos: rhoTurnos,
    q3_custo_usd: q3 ?? null,
    rotulados_1_ou_2: baixos.length,
    taxa_subestimacao: sub,
    veredito: veredito(rhoCusto, sub),
    aviso: 'n=60 dá IC de cerca de ±0,2 no Spearman; resultado perto do limiar é inconclusivo.',
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(JSON.stringify(gerar(HOME), null, 1));
  } else if (args.length === 1 && args[0] === '--correlacao') {
    try {
      console.log(JSON.stringify(correlacao(HOME), null, 1));
    } catch (e) {
      console.error('Erro: ' + e.message);
      process.exit(1);
    }
  } else {
    console.error('Uso: node por-prompt.js [--correlacao]');
    process.exit(2);
  }
}

if (require.main === module) main();

module.exports = { spearman, postos, quartis, veredito, categoriasIrreversiveis, indicaCorrecao, eElegivel, lerCsv, gerar, correlacao };
