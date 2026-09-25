# Fluxo obrigatório inspirado em Matt Pocock

O instalador sempre usa estas variantes de três agentes — não há mais versão
base sem elas. As regras relevantes das skills originais foram adaptadas para
as instruções desses agentes. Nenhuma skill adicional é instalada ou
carregada. O orquestrador conserva a escolha do papel, o escopo da chamada, a
conferência do resultado e o avanço da fila.

| Etapa | Agente | Regras incorporadas |
| --- | --- | --- |
| Triagem, spec, tickets e instruções de agentes | [`ds-governance`](agents/ds-governance.md) | `triage`, `to-spec`, `to-tickets`, `writing-for-agents`. |
| Implementação de um ticket ou recorte de spec | [`ds-runner`](agents/ds-runner.md) | `implement`; ciclos de TDD somente quando testes fizerem parte da tarefa. |
| Revisão de uma entrega | [`ds-reviewer`](agents/ds-reviewer.md) | Dois eixos de `code-review`: padrões e spec. |

`ds-explorer`, `ds-researcher`, `ds-mutant` e `ds-committer` mantêm as instruções base.
`ds-researcher` incorpora o contrato de pesquisa em fontes primárias da skill
`research` de Matt Pocock e devolve as fontes ao orquestrador sem carregar
essa skill. O trabalho de `implement-spec` sobre vários tickets continua com
o orquestrador e a fila
`ds-queue.js`; o `ds-runner` recebe apenas uma tarefa delimitada por chamada.
`grilling` é uma conversa para decisões do usuário, fora do papel desses
agentes de execução.

O projeto define seu tracker: local das specs e tickets, estados, bloqueios,
quem aprova e como registrar aceite. `.scratch/` pode ser escolhido para
rascunhos ou tracker local; sua existência não o torna obrigatório. Use o
[fragmento opcional](templates/AGENTS.fragment.md) para apontar essa
configuração. O instalador não altera `AGENTS.md`.

Este módulo é uma adaptação, não uma cópia integral das skills originais.
Worktrees e PRs do fluxo original exigem integração própria.
