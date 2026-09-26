# Fila de issues

`node .claude/skills/oathbound/scripts/queue.js` recebe `-d <repo>`, `-A <arquivo-de-aceite>`, um ou mais
`-s <glob>` e caminhos de issues após `--`. Cada issue deve existir no projeto e ser um arquivo
(diretório em `-A` ou em uma issue é rejeitado com exit `2` antes de abrir qualquer sessão).
`-A` resolve contra a raiz do repositório, como as issues; se só existir a partir do diretório
atual, a fila usa esse caminho e avisa no stderr que esse retrocesso será removido — prefira um
caminho relativo à raiz ou absoluto.
`-u <runner>` ou `--runner` define o executor de implementação e revisão (padrão `opencode`,
ou via `OATHBOUND_RUNNER`). O script usa uma sessão de runner e uma de reviewer por fila; `-P` cria
sessões por issue. `OATHBOUND_MODEL` seleciona modelo opcionalmente.
Cada `-C` executa no shell do sistema (`PowerShell` no Windows, `sh` em
Linux/macOS). O log completo da checagem fica no diretório impresso pela fila.

Por issue, o script chama `smith` via `run.js`, imprime o resumo do Git,
executa cada `-C` opcional com subprocesso e log próprio e chama `assayer` pelo modo
somente leitura de `run.js`, anexando o diff real do escopo (rastreado e não
rastreado) ao prompt do reviewer — não só a referência à issue. O diff
completo é salvo em `<git-dir>/oathbound/review/<id>.diff`; o prompt embute
até 20000 caracteres e referencia o arquivo quando o diff é maior (limite
dimensionado para a linha de comando do processo, já que todo adapter de
runner recebe a mensagem via argv, não stdin). Diff vazio no escopo declarado
(nada pra revisar) interrompe a fila com exit `6` sem chamar o reviewer.
Qualquer exit não zero do runner de implementação interrompe a fila,
incluindo `3` (mudança fora do escopo declarado em `-s`): a fila lista os
arquivos fora do escopo e não marca a issue como `implementada`, para não
perder o rastro do que precisa de revisão manual antes de repetir. Falha de
`-C` interrompe com exit `5`.

Mudanças no worktree durante a revisão também geram exit `3` no modo
leitura e param a fila da mesma forma, preservando o checkpoint anterior
(`implementada`, se já alcançado) para o oathkeeper conferir a autoria antes
de repetir.

O checkpoint fica em `<git-dir>/oathbound/state/`, identificado pelo caminho
da issue relativo à raiz do repositório, sem extensão e com separadores de
diretório trocados por `--` (ex.: `docs/tickets/001.md` vira
`docs--tickets--001`) — isso evita colisão entre issues de nomes iguais em
pastas-irmãs diferentes. Checkpoints gravados pelo esquema antigo (baseado
apenas no nome do diretório avô e do arquivo) continuam reconhecidos: a fila
migra o estágio automaticamente pro novo id na primeira execução e registra
a migração no log. `implementada` significa que runner e checagens opcionais
terminaram; `revisada` exige exit `0` do reviewer e um marcador de resposta
(`No issues.`, `totals:` ou achado com `caminho:linha` e severidade) — a
comparação ignora espaço, crase e asterisco nas pontas de cada linha, então
variações de formatação Markdown (` `No issues.` `, `**No issues.**`, bloco
de código) não bloqueiam o reconhecimento. Falha, timeout ou recibo ausente
preserva `implementada` para repetir só a revisão. O marcador prova formato,
não qualidade: achados precisam ser julgados pelo oathkeeper.

O procedimento completo pode incluir correção na sessão do runner, auditoria
por mutação, commit e atualização de issue. Essas ações não são executadas
por `queue.js`. O projeto decide quando cada uma ocorre. A fila não
reverte alterações preexistentes.

Execução de mutação deve ocorrer em série, com worktree quieto. Consulte
[mutation.md](mutation.md) para recuperação após interrupção.
