---
name: agent-governance
description: Orquestrar exploração, edição, validação, revisão, commits e filas de issues com agentes OpenCode em um projeto que instalou o Agent Governance Kit. Use quando o usuário pedir delegação, auditoria de mudanças, commits, execução de fila ou investigação com recibos compactos.
---

# Governança de agentes

Leia primeiro o `AGENTS.md` do projeto e as instruções da área. O projeto
define a tarefa, os comandos de aceite, os dados e as ações autorizadas; esta
skill fornece os papéis e wrappers.

## Escolha do papel

| Trabalho | Agente | Invocação |
| --- | --- | --- |
| Pergunta fechada sobre código | `ds-explorer` | `node ds-run.js -R -a ds-explorer` |
| Pesquisa em fontes externas | `ds-researcher` | `node ds-run.js -R -a ds-researcher` |
| Implementação com comandos | `ds-runner` | `node ds-run.js -s <glob>` |
| Revisão fria | `ds-reviewer` | `node ds-run.js -R -a ds-reviewer` |
| Preparação de hunks e commits | `ds-committer` | `node ds-run.js -a ds-committer -s <arquivo>` |
| Registro documental | `ds-governance` | `node ds-run.js -a ds-governance -s <glob>` |
| Auditoria por mutação | `ds-mutant` | `node ds-run.js -a ds-mutant -s <glob>`, em série |

Use um agente nomeado; o agente padrão do OpenCode não recebe as permissões
destes papéis. Passe ao agente uma tarefa fechada, os caminhos permitidos,
aceite com valor esperado e estado inicial do worktree. O modelo é configurado
no projeto; `GOVKIT_MODEL` é uma substituição opcional para os wrappers.
Edições mecânicas também vão para `ds-runner`. Para `ds-researcher`, delimite
a pergunta; o agente devolve fontes primárias e lacunas na resposta, enquanto
o orquestrador decide o próximo passo.

## Execução

1. Identifique o repositório Git e leia o aceite já definido pelo projeto.
2. Escolha o menor papel capaz de executar a tarefa. A partir da raiz do projeto,
   chame `node .claude/skills/agent-governance/scripts/ds-run.js`
   com `-d`; use `-R` para os agentes sem edição e `-s` para os que editam.
3. Rode chamadas longas em background. Leia o recibo e apenas os trechos de
   log necessários para conferir os pontos decisivos.
4. Confira o diff e o estado Git. Um exit `3` indica mudança fora do escopo
   ou durante leitura; confira a autoria antes de agir. O wrapper não reverte
   arquivos.
5. Para várias issues, use `node .claude/skills/agent-governance/scripts/ds-queue.js` conforme
   [queue.md](references/queue.md). O script não corrige achados, commita nem
   marca tickets como concluídos.
6. Quando houver pedido de commit, delegue a seleção de hunks e mensagens ao
   `ds-committer` conforme [commits.md](references/commits.md).

Saídas longas de teste/build/lint passam por `node .claude/skills/agent-governance/scripts/quiet.js`. Números e
status de aceite são válidos apenas com comando executado ou fonte indicada.
Para mutação, consulte [mutation.md](references/mutation.md) antes do disparo.
Para perguntar andamento, bloqueios, evidências ou entrega à sessão já iniciada,
use os comandos de [feedback.md](references/feedback.md).

## Limites

O wrapper mede mudanças antes/depois e registra posse por glob. Permissões de
shell do OpenCode casam texto e podem ser contornadas por ofuscação. Use o
aceite do projeto e revisão humana para decisões irreversíveis ou com dados.
Não use este pacote como fonte de regras de negócio de outro repositório.
