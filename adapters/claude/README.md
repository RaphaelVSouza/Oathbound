# Claude Code

O Claude Code opera no Agent Governance Kit em dois papéis: como **host orquestrador**
interativo e como **runner de execução** subordinado.

## 1. Claude Code como host (orquestrador)

A skill fica disponível em `.claude/skills/agent-governance/`. Para que o Claude
leia as regras do projeto, mantenha um `CLAUDE.md` curto na raiz importando
o `AGENTS.md` (`@AGENTS.md`).

O orquestrador Claude consulta o `AGENTS.md` do projeto e invoca as ferramentas do
kit pelo terminal (`node .claude/skills/agent-governance/scripts/ds-run.js` e
`ds-queue.js`).

## 2. Claude Code como runner delegado

O orquestrador pode delegar tarefas para uma instância não-interativa do Claude Code
adicionando `-u claude` à chamada:

```bash
# Execução com edição delimitada por escopo
node .claude/skills/agent-governance/scripts/ds-run.js -d . -u claude -s "src/api/*" -a ds-runner -- "Implementar endpoint"

# Consulta somente leitura
node .claude/skills/agent-governance/scripts/ds-run.js -d . -u claude -R -a ds-explorer -- "Localizar handlers de autenticação"
```

### Características de execução

- **Invocação não-interativa:** executa `claude -p "<prompt>" --dangerously-skip-permissions`.
- **Modo somente leitura (`-R`):** restringe as ferramentas do Claude a inspeção (`--tools Read,Grep,Glob`) e injeta bloqueio explícito de escrita no prompt.
- **Guardrails de escopo:** os globs de arquivos autorizados são injetados como instruções de cabeçalho no prompt, e a conformidade final é auditada pelo Git antes e depois da chamada.
- **Sessões:** suporta retomada de contexto com `-S <session-id>` (passado para `--resume`).
- **Modelo:** selecione com `-m <modelo>` (repassado para `--model`).
