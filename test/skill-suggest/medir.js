#!/usr/bin/env node
'use strict';
// Measures the suggestion hook (ADR 0001) against actual agent actions in the extrair.js sample.
// Sends prompts (redacted, truncated) to Jev: USES external calls. Writes results to
// state/medicao-skill-suggest/resultado.json, without prompt text. Run: node test/skill-suggest/medir.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const hook = require('../../claude/hooks/skill-suggest.js');
const { redigir } = require('../../claude/hooks/agent-audit.js');

const raiz = path.join(os.homedir(), '.claude');
const dir = path.join(raiz, 'state', 'medicao-skill-suggest');
const amostra = JSON.parse(fs.readFileSync(path.join(dir, 'amostra.json'), 'utf8'));
const chave = process.env.JEV_API_KEY;
if (!chave) { console.error('JEV_API_KEY missing'); process.exit(1); }

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
} catch { /* missing or unreadable directory */ }

// Claude Code built-in subagents (summarized descriptions from the session type list).
agentes.set('Explore', 'Read-only search across many files to locate something; returns a conclusion, does not review or audit.');
agentes.set('general-purpose', 'Researches complex questions and executes multi-step tasks when searching is not obvious.');
agentes.set('Plan', 'Software architect: plans implementation strategy, steps, and trade-offs.');
agentes.set('claude-code-guide', 'Answers questions about Claude Code (CLI, hooks, MCP, settings), Agent SDK, and Anthropic API.');

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
  console.log('prompts', saida.length, 'errors', saida.filter((x) => x.erro || !x.s || !x.g).length);
})();
