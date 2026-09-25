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
- **Sessões:** suporta retomada de contexto com `-S <session-id>` (passado para `--resume`).
- **Modelo:** selecione com `-m <modelo>` (repassado para `--model`).

## 3. Instalação de subagentes nativos no Claude Code

O kit pode compilar e instalar os agentes canônicos como subagentes nativos em `.claude/agents/`:

```powershell
.\install.ps1 -Project . -Runner claude
```

O transpilador converte as regras de permissão do kit na lista de ferramentas permitidas (`tools: [Read, Grep, Glob]`, etc.), permitindo que o Claude Code acione os subagentes automaticamente por descrição ou pelo menu `/agents`.

