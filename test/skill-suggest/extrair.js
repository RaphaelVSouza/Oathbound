#!/usr/bin/env node
'use strict';
// Extracts each human prompt from the main chain of transcripts (projects/**/*.jsonl) and what the agent
// did until the next prompt: loaded skills (Skill.input.skill) and subagents (Agent.input.subagent_type).
// Writes state/medicao-skill-suggest/amostra.json (outside the repository). Does not print prompt content.
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = path.join(os.homedir(), '.claude');
const arquivos = [];
(function varrer(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) varrer(p); else if (e.name.endsWith('.jsonl')) arquivos.push(p);
  }
})(path.join(raiz, 'projects'));

const amostra = [];
for (const f of arquivos) {
  let atual = null;
  for (const linha of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!linha) continue;
    let o; try { o = JSON.parse(linha); } catch { continue; }
    if (o.isSidechain) continue;
    if (o.type === 'user' && !o.isMeta && typeof o.message?.content === 'string') {
      atual = { arquivo: path.basename(f), prompt: o.message.content, skills: [], agentes: [] };
      amostra.push(atual);
    } else if (o.type === 'assistant' && atual && Array.isArray(o.message?.content)) {
      for (const b of o.message.content) {
        if (b.type !== 'tool_use') continue;
        if (b.name === 'Skill' && b.input?.skill) atual.skills.push(b.input.skill);
        if ((b.name === 'Agent' || b.name === 'Task') && b.input?.subagent_type) atual.agentes.push(b.input.subagent_type);
      }
    }
  }
}
// Out of scope: slash commands, local command output, notifications, and short prompts.
const util = amostra.filter((a) => {
  const t = a.prompt.trim();
  return t.length >= 15 && !t.startsWith('/') && !t.startsWith('<') && !t.startsWith('Caveman mode');
});
const dir = path.join(raiz, 'state', 'medicao-skill-suggest');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'amostra.json'), JSON.stringify(util));
const cont = (k) => { const m = {}; for (const a of util) for (const n of a[k]) m[n] = (m[n] || 0) + 1; return m; };
console.log(JSON.stringify({
  prompts_totais: amostra.length, prompts_elegiveis: util.length,
  com_skill: util.filter((a) => a.skills.length).length, com_agente: util.filter((a) => a.agentes.length).length,
  skills: cont('skills'), agentes: cont('agentes'),
}, null, 1));
