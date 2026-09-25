# AGY (Antigravity CLI)

O AGY opera como **runner de execução** subordinado ao kit através do executável `agy`.

Neste runner, as regras do orquestrador (`oathkeeper`) valem apenas pelo
`AGENTS.md` e pela skill: o AGY não tem agente primário com imposição por
permissão. `oathkeeper` não é delegável em nenhum runner;
`node .../run.js -a oathkeeper` é recusado com exit code 2.

## Invocação como runner

Ative o runner AGY informando `-u agy` ou exportando `OATHBOUND_RUNNER=agy`:

```bash
# Execução com edição delimitada por escopo
node .claude/skills/agent-governance/scripts/run.js -d . -u agy -s "src/services/*" -a smith -- "Implementar lógica de fila"

# Consulta somente leitura
node .claude/skills/agent-governance/scripts/run.js -d . -u agy -R -a cartographer -- "Verificar endpoints do gateway"
```

### Características de execução

- **Invocação:** executa `agy -p "<prompt>" --dangerously-skip-permissions`.
- **Modelo:** selecione com `-m <modelo>` (repassado para `--model`) ou via `OATHBOUND_MODEL`.
- **Seleção de subagente:** o papel selecionado com `-a` é repassado para `--agent <nome>` do AGY quando aplicável.

## Instalação de agentes nativos no AGY

O kit pode compilar e instalar os agentes canônicos como agentes nativos em `.agents/agents/`:

```powershell
.\install.ps1 -Project . -Runner agy
```

O transpilador adapta o frontmatter para o padrão do AGY CLI, permitindo listagem via `/agents` e invocação direta via `agy --agent <nome>`.

