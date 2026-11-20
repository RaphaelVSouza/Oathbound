# ADR 0005 — Plugin local para Codex CLI

Data 2026-11-19. Estado aceito.

## Contexto

O Oathbound mantém quatro skills compartilhadas. O Codex CLI distribui
skills em plugins e descobre plugins por marketplace.

## Decisão

Gerar um marketplace local com o plugin `oathbound`, manifesto portátil
`plugin.json` e cópia integral de `skills/`. O marketplace referencia o
plugin por caminho relativo. O manifesto usa a versão do pacote.
[Empacotamento oficial](https://developers.openai.com/plugins/build/plugins)

## Consequências

A instalação usa os comandos nativos de marketplace do Codex CLI.
O perfil `oathkeeper` injeta instruções na sessão principal quando selecionado
por `codex -p oathkeeper`. Os TOMLs acompanham o
marketplace em `setup/agents/` e são instalados no escopo nativo do Codex.
O GitHub Release distribui o marketplace completo.

O arquivo opcional `setup/hooks.json` registra início e fim de subagentes
e bloqueia comandos destrutivos por `PreToolUse`. A auditoria usa o papel
informado pelos eventos de ciclo de vida. O guard Bash vale para toda a
sessão porque o contrato documentado de `PreToolUse` não identifica o papel.
[Skills](https://learn.chatgpt.com/docs/build-skills) · [Subagentes](https://learn.chatgpt.com/docs/agent-configuration/subagents) · [Hooks](https://learn.chatgpt.com/docs/hooks)
