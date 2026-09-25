# Claude Code

O Claude Code opera no Oathbound em dois papéis: como **host do oathkeeper**
interativo e como **runner de execução** subordinado.

## 1. Claude Code como host (oathkeeper)

A skill fica disponível em `.claude/skills/oathbound/`. Para que o Claude
leia as regras do projeto, mantenha um `CLAUDE.md` curto na raiz importando
o `AGENTS.md` (`@AGENTS.md`).

O oathkeeper Claude consulta o `AGENTS.md` do projeto e invoca as ferramentas do
kit pelo terminal (`node .claude/skills/oathbound/scripts/run.js` e
`queue.js`).

### Início com o oathkeeper

Instale os agentes nativos (`.\install.ps1 -Project . -Runner claude`) e inicie
uma sessão já no papel de oathkeeper:

```bash
claude --agent oathkeeper
```

`oathkeeper` é o agente primário da guilda: não edita nem commita e delega pelos
scripts do kit. Os demais agentes viram subagentes em `.claude/agents/`, com
`tools` derivadas das permissões canônicas. `oathkeeper` não é delegável: uma
chamada `node .../run.js -a oathkeeper` é recusada com exit code 2.

## 2. Claude Code como runner delegado

O oathkeeper pode delegar tarefas para uma instância não-interativa do Claude Code
adicionando `-u claude` à chamada:

```bash
# Execução com edição delimitada por escopo
node .claude/skills/oathbound/scripts/run.js -d . -u claude -s "src/api/*" -a smith -- "Implementar endpoint"

# Consulta somente leitura
node .claude/skills/oathbound/scripts/run.js -d . -u claude -R -a surveyor -- "Localizar handlers de autenticação"
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

O arquivo de subagente do Claude **só aceita nomes de ferramenta** — não há escopo de comando no `tools`. Por isso, quando o mapa `bash` do agente canônico tem qualquer comando liberado (mesmo com `"*": deny`), a ferramenta `Bash` é concedida por inteiro. A lista de comandos permitidos vale por permissão no OpenCode; no Claude, vale pelo prompt do agente e pela auditoria de escopo do Git. O transpilador não promete restrição de comando no Claude.

