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
Subagentes TOML, orquestração, hooks e publicação ficam para entregas
próprias. [Skills](https://learn.chatgpt.com/docs/build-skills) · [Subagentes](https://learn.chatgpt.com/docs/agent-configuration/subagents) · [Hooks](https://learn.chatgpt.com/docs/hooks)
