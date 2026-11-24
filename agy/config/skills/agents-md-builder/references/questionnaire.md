# Questionário e Modelo — `agents-md-builder`

## Perguntas (Fase 1)
Pule o que já foi descoberto na Fase 0. `"não sei"` / `"nenhuma"` é resposta válida.

1. **Projeto**: em uma frase, o que é e para quem? Tipo (app, lib, serviço, monorepo, infra, data/ML)?
2. **Comandos**: setup, build, rodar um teste isolado, rodar tudo, lint, typecheck. Há gerenciador não padrão (`uv`, `bun`, `pnpm`...)?
3. **Convenções fora do padrão**: o que o time faz diferente do default da linguagem/framework?
4. **Armadilhas**: o que já deu errado com agentes ou pessoas novas? O que parece errado mas é intencional?
5. **Limites**: o que o agente nunca deve fazer (editar gerados, migrations, deploy, dependências novas, mexer em secrets)? E o que exige confirmação antes?
6. **Testes**: política (TDD, mocks proibidos, cobertura mínima, testes lentos/flaky a evitar)?
7. **Git/PR**: padrão de branch, commits, checks de CI obrigatórios, quem revisa?
8. **Ambiente**: serviços, banco, variáveis, Docker, restrições de rede/permissão relevantes?
9. **Docs existentes**: quais documentos o agente deve ler *sob demanda* (arquitetura, ADRs, runbooks)?
10. **Monorepo**: há subpastas com regras próprias que merecem `AGENTS.md` aninhado?
11. **Meta**: idioma do arquivo, orçamento de linhas (padrão 60).

## Regras de escrita (Fase 3)
- Imperativo, curto, uma ideia por bullet.
- Comandos exatos, copiáveis, com flags; inclua um comando para validar **um arquivo/teste** (feedback barato).
- Ponteiros (`caminho/arquivo`) em vez de trechos de código copiados, que envelhecem.
- Fluxos multi-etapa como lista numerada; decisões `"se X, faça Y"` como bullets curtos.
- Nada de: visão geral longa, árvore de diretórios, guia de estilo que o linter já cobre, segredos, instruções ou nomes de ferramentas de um único harness.

## Modelo de `AGENTS.md`
Omita seções vazias:

```markdown
# <Projeto>
<1–2 linhas: o que é + stack, só se não óbvio>

## Comandos
- Setup: `...`
- Teste de um arquivo: `...`
- Testes (tudo): `...`
- Lint/typecheck: `...`

## Convenções (apenas desvios do padrão)
- ...

## Limites
- Sempre: ...
- Pergunte antes: ...
- Nunca: ...

## Armadilhas
- ...

## Mais contexto (ler sob demanda)
- <tema>: `docs/...` — quando ler
```
