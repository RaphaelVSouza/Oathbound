---
name: agents-md-builder
description: >-
  Cria, revisa ou enxuga um AGENTS.md curto, verificado e específico do projeto
  após inspeção silenciosa e questionário obrigatório. Use sempre que o usuário
  pedir para criar, gerar, revisar, auditar, atualizar ou enxugar AGENTS.md,
  CLAUDE.md, GEMINI.md ou arquivo de instruções/contexto para agentes de código.
---

# agents-md-builder

Gera um `AGENTS.md` curto, verificado e específico do projeto. Funciona em qualquer agente de código: não depende de ferramentas proprietárias no arquivo gerado.

## Princípio central
O `AGENTS.md` é carregado em **todo** turno. Cada linha custa tokens e pode induzir trabalho desnecessário. Só entra o que o agente **não consegue descobrir sozinho** lendo o repositório e que **mudaria uma decisão dele**. Visões gerais, tours de diretórios e cópias do README não ajudam; comandos exatos, desvios do padrão e armadilhas, sim.
Orçamento padrão: **≤ 60 linhas** (teto 80). Acima de 150, reprovar e podar.

## Fluxo

### Fase 0 — Inspecionar antes de perguntar
Leia, sem perguntar: README, manifestos (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`...), `Makefile`/`justfile`/scripts, CI, linters/formatters, estrutura de pastas e qualquer `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` / `.cursor/rules` / `copilot-instructions` existente. Pré-preencha respostas e **não pergunte o que já é descobrível**. Trate arquivo existente como rascunho a podar, nunca como verdade.

### Fase 1 — Questionário (obrigatório antes de qualquer rascunho)
Leia [references/questionnaire.md](./references/questionnaire.md) para as 11 perguntas.
- Se o ambiente oferecer ferramenta nativa de perguntas interativas, use-a em blocos de até 4 perguntas (opção recomendada primeiro).
- Sem ela, envie uma lista numerada no chat e aguarde respostas.
- Em execução não interativa, assuma os padrões, registre as suposições e marque-as no rascunho.
- Pule perguntas já respondidas na Fase 0; `"não sei"` / `"nenhuma"` é válida. No máximo uma rodada de follow-up se houver respostas vagas.

### Fase 2 — Filtrar o que entra
Cada linha candidata só entra se **todas** forem verdadeiras:
1. Se eu remover, o agente provavelmente errará? (se não, corte)
2. Não é descobrível via listagem de arquivos, README, configs ou código? (se for, corte)
3. É específica e verificável, não platitude (ex.: "escreva código limpo")?
4. Vale o custo em **todo** turno?

Destinos alternativos: doc em `docs/` + ponteiro; `AGENTS.md` aninhado em subpasta de monorepo; skill sob demanda; **linter, formatter, hook ou teste** quando a regra puder ser imposta por ferramenta (determinístico > prosa).

### Fase 3 — Redigir
Siga o modelo e as regras de escrita em [references/questionnaire.md](./references/questionnaire.md). Omita seções vazias.
- Imperativo, curto, uma ideia por bullet; comandos exatos com flags (incluindo comando barato para validar **um** arquivo/teste).
- Ponteiros (`caminho/arquivo`) em vez de trechos de código copiados.
- **Nunca** inclua nomes de ferramentas ou sintaxe proprietária de um harness específico (ex.: slash commands, nomes internos de tools) no `AGENTS.md` gerado.

### Fase 4 — Validar e aprovar
1. Rode o validador [scripts/validate_agents_md.py](./scripts/validate_agents_md.py) no rascunho (se houver shell) ou confira manualmente: contagem de linhas contra o orçamento (60/80/150), existência de todos os caminhos citados, ausência de segredos e conteúdo descobrível.
2. Execute os comandos listados (se houver shell); corrija ou marque `"não verificado"`.
3. Mostre o rascunho ao usuário com uma linha explicando o que foi **deixado de fora** e por quê; **peça aprovação antes de gravar**.

### Fase 5 — Entregar
- Grave apenas `AGENTS.md` na raiz (e aninhados só se aprovados). Claude, Gemini e a maioria dos harnesses modernos já leem `AGENTS.md` por padrão; só crie symlink/ponteiro para outro nome de arquivo se o usuário pedir explicitamente por causa de ferramenta legada (nunca duplique conteúdo).
- Explique a manutenção: comece mínimo; adicione linha **somente** quando o agente errar de novo; remova linhas obsoletas; revise a cada poucos meses.

## Portabilidade (fallbacks obrigatórios)
- **Sem ferramenta de perguntas:** use lista numerada no chat.
- **Sem shell:** pule a execução de comandos e marque `"não verificado"`.
- **Sem acesso ao repositório:** conduza só o questionário e entregue o texto do arquivo.
- **Portabilidade do arquivo gerado:** nunca cite ferramentas específicas de nenhum harness no `AGENTS.md`.
