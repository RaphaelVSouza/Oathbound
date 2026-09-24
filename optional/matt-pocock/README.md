# Fluxo opcional inspirado em Matt Pocock

Este módulo acrescenta ao pacote uma sequência de triagem, especificação,
tickets e execução por dependências, além de instruções para escrever documentos
consumidos por agentes. É uma adaptação para este kit, não uma cópia das skills
originais. A instalação exige `-MattPocock`.

O agente `ds-governance` instalado com esse parâmetro pode carregar somente
`matt-governance` e `writing-for-agents`. A primeira orienta a escolha da etapa;
a segunda orienta a edição de `AGENTS.md`, `CLAUDE.md` e documentos de agentes.
O agente base, instalado sem o parâmetro, continua sem acesso a skills.

O fluxo usa o tracker já definido pelo projeto. `.scratch/` é uma opção local
para trabalhos temporários, não um destino obrigatório. Antes de registrar
issues, o projeto deve definir onde ficam, seus estados, dependências e critérios
de conclusão. Veja [tracker.md](skills/matt-governance/references/tracker.md).

Use o [fragmento opcional](templates/AGENTS.fragment.md) como ponto de partida
para essa configuração. A instalação não adiciona o fragmento automaticamente.

O fluxo de tickets pode alimentar a fila `ds-queue.sh`; a execução por worktrees
e PRs das skills originais exige integração própria e não é presumida aqui.
