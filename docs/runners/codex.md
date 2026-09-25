# Codex

O Codex opera no Oathbound como **host orquestrador** ou como
**runner de execução** subordinado.

## 1. Codex como host (orquestrador)

Use o `AGENTS.md` do projeto como ponto de entrada. Acrescente um ponteiro para
`.claude/skills/oathbound/SKILL.md` quando o trabalho exigir delegação de papéis,
commits auditados ou execução de fila.

O Codex segue a skill como especificação operacional do repositório e dispara as
chamadas CLI a partir da raiz do projeto.

Neste runner, as regras do oathkeeper (`oathkeeper`) valem apenas pelo
`AGENTS.md` e pela skill: não há agente primário nem imposição por permissão.
Trate `oathkeeper` como papel lógico descrito no `AGENTS.md`; a recusa de
`run.js -a oathkeeper` continua valendo porque o script é comum a todos os
runners.

## 2. Codex como runner delegado

Invoque o Codex como executor subordinado de uma tarefa adicionando `-u codex`:

```bash
# Execução com edição delimitada por escopo
node .claude/skills/oathbound/scripts/run.js -d . -u codex -s "src/db/*" -a smith -- "Criar migração"

# Inspeção somente leitura
node .claude/skills/oathbound/scripts/run.js -d . -u codex -R -a cartographer -- "Mapear esquemas de tabela"
```

### Características de execução

- **Invocação:** executa `codex exec "<prompt>" -C <repo>` (em modo edição, usa `--dangerously-bypass-approvals-and-sandbox`; em retomada, usa `codex exec resume <id>`).
- **Modo somente leitura (`-R`):** força sandbox nativo estrito via `-s read-only -a never` (sem desligamento de sandbox) e instrução de leitura no prompt.
- **Guardrails de escopo:** os caminhos autorizados em `-s` são injetados no prompt e auditados pelo Git após a conclusão do processo.
- **Modelo:** selecione com `-m <modelo>` (repassado para `-m` do Codex) ou via `OATHBOUND_MODEL`.

## Modelo de agentes no Codex

O Codex CLI não utiliza uma pasta de definições de agentes (como `.codex/agents/` — o comando `codex agents` lista sessões daemon ativas). A especialização de papéis opera via instruções no [`AGENTS.md`](../../AGENTS.md), skills em `.codex/skills/` e injeção contextual de papéis e sandboxes (`-s read-only`) pelo runner.

