---
status: Accepted
date: 2026-11-20
decision-makers: [Raphael]
consulted: []
informed: []
---

# 0006 - Override opcional de skills por CLI via `SKILL.<runner>.md`

## Contexto e Problema

As skills do Oathbound são compartilhadas entre três CLIs (`claude`, `agy` e `codex`). Até agora, [`tools/install.ts`](../../tools/install.ts) e [`tools/build-plugin.cjs`](../../tools/build-plugin.cjs) copiavam `skills/<nome>/` de forma idêntica para todos os runners.

Quando uma skill referencia uma ferramenta nativa específica de uma CLI (por exemplo, `AskUserQuestion` no Claude Code, `ask_question` no Antigravity ou `request_user_input` no Codex), o texto acoplado a um runner degrada a execução nos demais.

## Fatores de Decisão

- Evitar duplicação integral de skills idênticas entre CLIs.
- Permitir otimização cirúrgica quando uma skill depende de ferramenta específica do runner.
- Manter o formato final instalado/empacotado compatível com o contrato padrão de cada CLI (`<skill>/SKILL.md`).
- Não vazar arquivos de outros runners na instalação ou no artefato de plugin.

## Opções Consideradas

- **Opção 1: `SKILL.md` canônico + override opcional `SKILL.<runner>.md` resolvido na instalação e no build.**
- **Opção 2: `SKILL.md` único 100% agnóstico de ferramentas de CLI.**
- **Opção 3: Diretórios separados `claude/skills/`, `agy/skills/` e `codex/skills/`.**

## Decisão

Opção escolhida: **"Opção 1 (`SKILL.md` canônico + override opcional `SKILL.<runner>.md`)"**, porque preserva uma única fonte de verdade para skills agnósticas e permite adaptar apenas as skills que referenciam tools específicas de cada CLI.

Regras de resolução em [`tools/install.ts`](../../tools/install.ts) e [`tools/build-plugin.cjs`](../../tools/build-plugin.cjs):

1. Para cada runner (`claude`, `agy`, `codex`), se existir `skills/<nome>/SKILL.<runner>.md`, ele é gravado como `SKILL.md` no destino daquele runner.
2. Caso contrário, grava-se `skills/<nome>/SKILL.md` normalmente.
3. Arquivos `SKILL.<outro-runner>.md` nunca são copiados para o destino.

### Consequências

- **Bom:** skills agnósticas continuam com um único arquivo; skills acopladas a tools nativas entregam instruções exatas para cada CLI.
- **Ruim:** skills com override exigem manter o texto sincronizado entre `SKILL.md` e `SKILL.<runner>.md` — _mitigação:_ restringir overrides apenas a skills que referenciam tools específicas de CLI.
- **Neutro:** `tools/install.ts` e `tools/build-plugin.cjs` passam a aplicar a mesma função de resolução de skills por runner.

### Confirmação

- Testes automatizados em [`test/build-plugin.test.cjs`](../../test/build-plugin.test.cjs) e [`test/install.test.ts`](../../test/install.test.ts) cobrindo resolução de `SKILL.<runner>.md` -> `SKILL.md`, fallback para `SKILL.md` e ausência de vazamento de overrides de outros runners.

## Referências

- [`skills/grill-me/SKILL.md`](../../skills/grill-me/SKILL.md)
- [`tools/install.ts`](../../tools/install.ts)
- [`tools/build-plugin.cjs`](../../tools/build-plugin.cjs)
