# Generic Process Runner

O runner genérico permite conectar qualquer executável, ferramenta CLI ou script
ao fluxo de governança, auditoria e travas de escopo do kit.

Neste runner, as regras do oathkeeper (`oathkeeper`) valem apenas pelo
`AGENTS.md` e pela skill, sem imposição por permissão de agente.
`oathkeeper` não é delegável; `node .../run.js -a oathkeeper` é recusado com
exit code 2.

## Invocação como runner

Ative o runner genérico informando `-u generic` ou definindo `OATHBOUND_RUNNER=generic`:

```bash
# Executando script ou comando personalizado
export OATHBOUND_GENERIC_CMD="python -m my_agent"
node .claude/skills/oathbound/scripts/run.js -d . -u generic -s "lib/*" -- "Refatorar módulo"
```

### Características de execução

- **Comando configurável:** lê `process.env.OATHBOUND_GENERIC_CMD`. Caso não esteja configurado, utiliza o Node imprimindo o prompt via stdout (útil para dry-runs de integração).
- **Passagem de contexto:** os guardrails de escopo de arquivo e as instruções do papel são combinados e passados como argumento do comando configurado.
- **Auditoria de saída:** o Git captura o snapshot do repositório antes e depois do comando; modificações fora dos globs passados em `-s` resultam em exit code `3` e alerta de violação de escopo no recibo.
