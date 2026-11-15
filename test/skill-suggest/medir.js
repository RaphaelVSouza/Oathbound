#!/usr/bin/env node
'use strict';
// Mede o hook de sugestão (ADR 0001) contra o que o agente fez de fato, na amostra de extrair.js.
// Envia os prompts (redigidos, truncados) ao Jev: GASTA chamadas externas. Grava resultados em
// state/medicao-skill-suggest/resultado.json, sem texto de prompt. Rode: node test/skill-suggest/medir.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const hook = require('../../claude/hooks/skill-suggest.js');
const { redigir } = require('../../claude/hooks/agent-audit.js');

const raiz = path.join(os.homedir(), '.claude');
const dir = path.join(raiz, 'state', 'medicao-skill-suggest');
const amostra = JSON.parse(fs.readFileSync(path.join(dir, 'amostra.json'), 'utf8'));
const chave = process.env.JEV_API_KEY;
if (!chave) { console.error('JEV_API_KEY ausente'); process.exit(1); }

const skills = hook.carregarCatalogo();
const agentes = new Map();
const pastaAgentes = fs.existsSync(path.join(__dirname, '..', '..', 'claude', 'agents'))
  ? path.join(__dirname, '..', '..', 'claude', 'agents')
  : path.join(raiz, 'agents');
try {
  for (const f of fs.readdirSync(pastaAgentes)) {
    const fm = hook.frontmatter(fs.readFileSync(path.join(pastaAgentes, f), 'utf8'));
    if (fm) agentes.set(fm.nome, fm.descricao.slice(0, 300));
  }
} catch { /* pasta inexistente ou ilegível */ }

// Subagentes embutidos do Claude Code (descrições resumidas da lista de tipos da sessão).
agentes.set('Explore', 'Busca somente leitura em muitos arquivos para responder onde algo está; devolve conclusão, não revisa nem audita.');
agentes.set('general-purpose', 'Pesquisa questões complexas e executa tarefas de vários passos quando a busca não é óbvia.');
agentes.set('Plan', 'Arquiteto de software: planeja estratégia de implementação, passos e trade-offs.');
agentes.set('claude-code-guide', 'Responde perguntas sobre Claude Code (CLI, hooks, MCP, configurações), Agent SDK e API da Anthropic.');

async function perguntar(prompt, catalogo, alvo) {
  const estado = redigir(prompt.trim().slice(0, 2000));
  const r = await hook.chamarJev(estado, hook.montarPerguntas(catalogo, prompt, alvo), chave);
  return hook.decidir(r, catalogo);
}

(async () => {
  const saida = [];
  let i = 0;
  const trabalhador = async () => {
    while (i < amostra.length) {
      const k = i++;
      const a = amostra[k];
      try {
        const [s, g] = await Promise.all([perguntar(a.prompt, skills, 'skill'), perguntar(a.prompt, agentes, 'subagente')]);
        saida[k] = { skills: a.skills, agentes: a.agentes, s, g };
      } catch (e) { saida[k] = { skills: a.skills, agentes: a.agentes, erro: String(e.message || e) }; }
    }
  };
  await Promise.all([trabalhador(), trabalhador(), trabalhador(), trabalhador()]);
  fs.writeFileSync(path.join(dir, 'resultado.json'), JSON.stringify(saida));
  console.log('prompts', saida.length, 'erros', saida.filter((x) => x.erro || !x.s || !x.g).length);
})();
