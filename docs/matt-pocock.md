# Fluxo obrigatório inspirado em Matt Pocock

As regras relevantes das skills originais de Matt Pocock foram consolidadas
diretamente nos agentes em `guild/`, sem duplicatas de arquivos.
Nenhuma skill adicional é instalada ou carregada. O oathkeeper conserva a
escolha do papel, o escopo da chamada, a conferência do resultado e o avanço da
fila.

| Etapa | Agente | Regras incorporadas |
| --- | --- | --- |
| Triagem, spec, tickets e instruções de agentes | [`scribe`](../guild/scribe.md) | `triage`, `to-spec`, `to-tickets`, `writing-for-agents`. |
| Implementação de um ticket ou recorte de spec | [`smith`](../guild/smith.md) | `implement`; ciclos de TDD somente quando testes fizerem parte da tarefa. |
| Revisão de uma entrega | [`assayer`](../guild/assayer.md) | Dois eixos de `code-review`: padrões e spec. |

`cartographer`, `sage`, `gremlin`, `archivist` e `warden` mantêm instruções específicas de seus papéis.
`sage` incorpora o contrato de pesquisa em fontes primárias da skill
`research` de Matt Pocock e devolve as fontes ao oathkeeper sem carregar
essa skill. O trabalho de `implement-spec` sobre vários tickets continua com
o oathkeeper e a fila
`queue.js`; o `smith` recebe apenas uma tarefa delimitada por chamada.
`grilling` é uma conversa para decisões do usuário, fora do papel desses
agentes de execução.

O projeto define seu tracker: local das specs e tickets, estados, bloqueios,
quem aprova e como registrar aceite. `.scratch/` pode ser escolhido para
rascunhos ou tracker local; sua existência não o torna obrigatório. Use o
[fragmento opcional](../templates/AGENTS.matt-pocock.fragment.md) para apontar essa
configuração. O instalador não altera `AGENTS.md`.

Este módulo é uma adaptação, não uma cópia integral das skills originais.
Worktrees e PRs do fluxo original exigem integração própria.
