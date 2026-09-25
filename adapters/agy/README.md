# AGY (Antigravity CLI)

O AGY opera como **runner de execução** subordinado ao kit através do executável `agy`.

## Invocação como runner

Ative o runner AGY informando `-u agy` ou exportando `GOVKIT_RUNNER=agy`:

```bash
# Execução com edição delimitada por escopo
node .claude/skills/agent-governance/scripts/ds-run.js -d . -u agy -s "src/services/*" -a ds-runner -- "Implementar lógica de fila"

# Consulta somente leitura
node .claude/skills/agent-governance/scripts/ds-run.js -d . -u agy -R -a ds-explorer -- "Verificar endpoints do gateway"
```

### Características de execução

- **Invocação:** executa `agy -p "<prompt>" --dangerously-skip-permissions`.
- **Modo somente leitura (`-R`):** ativa `--mode plan` para evitar mutações de arquivo e injeta instrução de bloqueio no cabeçalho do prompt.
- **Continuidade de sessão:** usa `-S <conversation-id>` (repassado para `--conversation <id>`).
- **Modelo:** selecione com `-m <modelo>` (repassado para `--model`) ou via `GOVKIT_MODEL`.
- **Seleção de subagente:** o papel selecionado com `-a` é repassado para `--agent <nome>` do AGY quando aplicável.
