# Adapters de Runners

O Oathbound separa o motor de governança (auditoria Git, travas de escopo,
banco transacional SQLite e fila) do executor de modelos (o **runner**).

Esta pasta reúne a documentação e os adaptadores de execução para os runners suportados.

O runner é sempre executado com stdout/stderr em pipe, nunca em TTY. CLIs
invocadas por um adapter podem detectar a ausência de TTY e omitir cores
ANSI e barras de progresso interativas na saída.

No Windows, o runner nunca é executado via shell. Um `.exe`/`.com` no `PATH` é chamado
direto. Quando só existe o shim do npm (`opencode.cmd`, `codex.cmd`, `claude.cmd`), o
Oathbound lê o shim e executa o que ele chamaria: o script Node do pacote com o próprio
Node, ou o `.exe` apontado. Assim os argumentos (prompt com `&`, `|`, aspas, `%`) chegam
intactos, sem passar pelo `cmd.exe`. Um `.cmd`/`.bat` que não siga o formato do shim do
npm falha com erro explícito; aponte o runner para o executável real.

## Runners disponíveis

| Runner | Invocação | Guardrails de escopo | Descoberta de sessão | Documentação |
| --- | --- | --- | --- | --- |
| `opencode` (padrão) | `-u opencode` | YAML frontmatter (`edit: deny`, `bash`) | `opencode session list` | [`opencode.md`](opencode.md) |
| `claude` | `-u claude` | `--tools` + injeção no prompt | `--resume` / ID no recibo | [`claude.md`](claude.md) |
| `codex` | `-u codex` | Sandbox `-s read-only` + prompt | ID no recibo | [`codex.md`](codex.md) |
| `agy` | `-u agy` | `--mode plan` + prompt | `--conversation` | [`agy.md`](agy.md) |
| `generic` | `-u generic` | Injeção no prompt / script | ID no recibo | [`generic.md`](generic.md) |

## Configuração do runner

Defina o runner ativo por três vias, em ordem de precedência:

1. **Flag CLI:** `-u <nome>` ou `--runner <nome>` em `run.js` e `queue.js`.
2. **Variável de ambiente:** `OATHBOUND_RUNNER=<nome>` (ex.: `export OATHBOUND_RUNNER=claude`).
3. **Padrão implícito:** `opencode` se nenhuma opção for informada.

## Modelos e Reasoning Effort

- **Modelo:** passe `-m <modelo>` ou defina `OATHBOUND_MODEL`. Descubra modelos disponíveis no ambiente via CLI (`opencode models`, `agy models`, `claude --help`).
- **Esforço de raciocínio:** passe `-e <low|medium|high>` ou defina `OATHBOUND_EFFORT`. Consulte as diretrizes e regras de prompt caching em [`skill/references/models.md`](../../skill/references/models.md).

## Adapters customizados

Para usar um executor proprietário ou ferramenta interna sem alterar o kit, aponte
o caminho do arquivo JavaScript com `--runner`:

```bash
node .claude/skills/oathbound/scripts/run.js -d . -s "src/*" --runner ./meu-adapter.js -- "tarefa"
```

O arquivo exportado deve implementar o contrato canônico de [`skill/scripts/runner-adapter.ts`](../../skill/scripts/runner-adapter.ts):

- `name`: identificador em string.
- `resolveAgentFile({ root, agent, agentDir })`: localiza o arquivo do papel.
- `prepareAgent({ agentFile, agent, others, feedback, scopes, readonly })`: prepara arquivos temporários ou guardrails de prompt (`promptPrefix`).
- `buildCommand({ root, agent, agentFile, tempAgent, model, message, session, tag, promptPrefix, readonly, scopes })`: monta `{ command, args, env, input }`.
- `resolveSession({ root, tag, sessionInput, runResult })`: extrai ou devolve o identificador estável da sessão.
- `createDisplay()` (opcional): devolve `{ push(chunk), flush(rawStdout) }` para controlar a exibição no
  terminal sem que o motor de execução (`run.js`) precise conhecer o nome do runner. `push` recebe cada
  pedaço de stdout e devolve o texto a exibir (pode ser `''`); `flush` recebe o stdout bruto completo e
  devolve o texto final a exibir (pode ser `''`). Padrão quando ausente: `push` devolve o próprio chunk;
  `flush` devolve `''`. Runners com saída estruturada (JSONL do `codex`, envelope JSON do `agy`) implementam
  `createDisplay` para filtrar o que aparece no terminal.

## Transpilação e instalação de agentes nativos

O kit inclui o transpilador [`tools/guild-transpiler.js`](../../tools/guild-transpiler.js) para converter as definições canônicas de agentes (localizadas em `guild/`) nos formatos esperados por cada ecossistema:

| Runner | Destino no projeto | Formato gerado |
| --- | --- | --- |
| `opencode` | `.opencode/agents/` | YAML frontmatter com permissões granulares (`permission`) |
| `claude` | `.claude/agents/` | YAML frontmatter com whitelist de ferramentas (`tools: [Read, Grep, Glob...]`) |
| `agy` | `.agents/agents/` | YAML frontmatter com `name`, `description` e corpo de instruções |
| `codex` | N/A | Opera via `AGENTS.md` e skills (Codex não utiliza pasta de arquivos de agentes) |

O transpilador é acionado pelo instalador [`install.ps1`](../../install.ps1):

```powershell
.\install.ps1 -Project . -Runner all      # Instala para OpenCode, Claude e AGY
.\install.ps1 -Project . -Runner claude   # Instala exclusivamente para Claude Code
```

Ou diretamente via linha de comando:

```bash
node tools/guild-transpiler.js --target . --runner all
```

