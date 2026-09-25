# Adapters de Runners

O Agent Governance Kit separa o motor de governança (auditoria Git, travas de escopo,
banco transacional SQLite e fila) do executor de modelos (o **runner**).

Esta pasta reúne a documentação e os adaptadores de execução para os runners suportados.

## Runners disponíveis

| Runner | Invocação | Guardrails de escopo | Descoberta de sessão | Documentação |
| --- | --- | --- | --- | --- |
| `opencode` (padrão) | `-u opencode` | YAML frontmatter (`edit: deny`, `bash`) | `opencode session list` | [`opencode/README.md`](opencode/README.md) |
| `claude` | `-u claude` | `--tools` + injeção no prompt | `--resume` / ID no recibo | [`claude/README.md`](claude/README.md) |
| `codex` | `-u codex` | Sandbox `-s read-only` + prompt | ID no recibo | [`codex/README.md`](codex/README.md) |
| `agy` | `-u agy` | `--mode plan` + prompt | `--conversation` | [`agy/README.md`](agy/README.md) |
| `generic` | `-u generic` | Injeção no prompt / script | ID no recibo | [`generic/README.md`](generic/README.md) |

## Configuração do runner

Defina o runner ativo por três vias, em ordem de precedência:

1. **Flag CLI:** `-u <nome>` ou `--runner <nome>` em `ds-run.js` e `ds-queue.js`.
2. **Variável de ambiente:** `GOVKIT_RUNNER=<nome>` (ex.: `export GOVKIT_RUNNER=claude`).
3. **Padrão implícito:** `opencode` se nenhuma opção for informada.

## Modelos e Reasoning Effort

- **Modelo:** passe `-m <modelo>` ou defina `GOVKIT_MODEL`. Descubra modelos disponíveis no ambiente via CLI (`opencode models`, `agy models`, `claude --help`).
- **Esforço de raciocínio:** passe `-e <low|medium|high>` ou defina `GOVKIT_EFFORT`. Consulte as diretrizes e regras de prompt caching em [`skill/references/models.md`](../skill/references/models.md).

## Adapters customizados

Para usar um executor proprietário ou ferramenta interna sem alterar o kit, aponte
o caminho do arquivo JavaScript com `--runner`:

```bash
node .claude/skills/agent-governance/scripts/ds-run.js -d . -s "src/*" --runner ./meu-adapter.js -- "tarefa"
```

O arquivo exportado deve implementar o contrato canônico de [`skill/scripts/runner-adapter.js`](../skill/scripts/runner-adapter.js):

- `name`: identificador em string.
- `resolveAgentFile({ root, agent, agentDir })`: localiza o arquivo do papel.
- `prepareAgent({ agentFile, agent, others, feedback, scopes, readonly })`: prepara arquivos temporários ou guardrails de prompt (`promptPrefix`).
- `buildCommand({ root, agent, agentFile, tempAgent, model, message, session, tag, promptPrefix, readonly, scopes })`: monta `{ command, args, env, input }`.
- `resolveSession({ root, tag, sessionInput, runResult })`: extrai ou devolve o identificador estável da sessão.
