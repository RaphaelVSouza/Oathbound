## Estilo de resposta (caveman full)

Responda em estilo telegráfico ("caveman full"): corte saudações, preâmbulos, conectivos e explicações óbvias. Nunca corte código, comandos, caminhos, símbolos, erros literais, números nem negações (`não`/`nunca`/`apenas`). Desative só com "stop caveman" ou "normal mode".

## Governança de mudança
- Siga a governança específica do repositório antes de mudar dependências, CI/CD, infraestrutura, ambiente ou decisões transversais.
- Não altere CI/CD, proteção de branch, servidores, segredos ou infraestrutura sem solicitação explícita. Decisões relevantes de arquitetura, contratos, dados, autenticação, infraestrutura, custo ou dependências precisam de ADR.
- Ao concluir, reporte validações executadas, resultado, ambiente utilizado e pendências.

## Economia de Tokens e Execução
- Escopo estrito: altere apenas arquivos/símbolos pedidos. Proibido refatorar código adjacente sem autorização.
- Gate de alinhamento: se a tarefa tocar 3+ arquivos ou tiver ambiguidade arquitetural, proponha plano (máx 5 linhas) e aguarde "ok" antes de editar.
- Anti-loop: se um teste/comando falhar 2x pelo mesmo erro, pare e reporte diagnóstico em vez de tentar às cegas.
- Leitura cirúrgica: use `StartLine`/`EndLine` em `read_file` para arquivos >200 linhas.
- Comandos enxutos e RTK: filtre testes por arquivo/caso (`--bail=1`, `--quiet`, `-q`). Comandos shell passam pelo `rtk` (use `rtk <cmd>` ou `rtk proxy <cmd>` se precisar da saída crua sem filtro). Em `run_command`, use `WaitMsBeforeAsync: 10000` para evitar backgrounding prematuro no Windows, e para listar arquivos use `rtk rg --files <caminho>` (nunca `find` nem `Get-ChildItem -Recurse`). Se uma task ficar em background por timeout, encerre-a com `manage_task(Action: "kill")`.
- Subagentes econômicos (`invoke_subagent`):
  - Exploração/pesquisa/docs (`research` [built-in], `scout`, `scholar`, `scribe`): use `Model: "flash_lite"` (Gemini 3.8 Flash).
  - Implementação/QA (`smith`, `breaker`): use `Model: "flash"` (Gemini 4 Hydrogen).
  - Revisão/AppSec (`assayer`, `sentinel`): use `Model: "inherit"`.
  - Passe caminhos absolutos explícitos no prompt do subagente e exija saída contrato `caveman` (`caminho:linha — mudança`, máx 10 linhas). Se um subagente ficar preso em `waiting_for_dependents` após responder, encerre-o com `manage_subagents(Action: "kill")`.
