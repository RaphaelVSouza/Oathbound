# Fila de issues

`node .claude/skills/agent-governance/scripts/ds-queue.js` recebe `-d <repo>`, `-A <arquivo-de-aceite>`, um ou mais
`-s <glob>` e caminhos de issues após `--`. Cada issue deve existir no projeto.
`-u <runner>` ou `--runner` define o executor de implementação e revisão (padrão `opencode`,
ou via `GOVKIT_RUNNER`). O script usa uma sessão de runner e uma de reviewer por fila; `-P` cria
sessões por issue. `GOVKIT_MODEL` seleciona modelo opcionalmente.
Cada `-C` executa no shell do sistema (`PowerShell` no Windows, `sh` em
Linux/macOS). O log completo da checagem fica no diretório impresso pela fila.

Por issue, o script chama `ds-runner` via `ds-run.js`, imprime o resumo do Git,
executa cada `-C` opcional com subprocesso e log próprio e chama `ds-reviewer` pelo modo
somente leitura de `ds-run.js`. Exit não zero
do runner interrompe a fila, exceto `3`: mudança fora do escopo é reportada
e a fila prossegue para revisão. Falha de `-C` interrompe com exit `5`.

Mudanças no worktree durante a revisão geram exit `3` no modo leitura; a fila
preserva `implementada` para que o orquestrador confira a autoria e repita a
revisão quando o estado estiver estável.

O checkpoint fica em `<git-dir>/ds-queue/state/`. `implementada` significa
que runner e checagens opcionais terminaram; `revisada` exige exit `0` do
reviewer e um marcador de resposta (`No issues.`, `totals:` ou achado com
`caminho:linha` e severidade). Falha, timeout ou recibo ausente preserva
`implementada` para repetir só a revisão. O marcador prova formato, não
qualidade: achados precisam ser julgados pelo orquestrador.

O procedimento completo pode incluir correção na sessão do runner, auditoria
por mutação, commit e atualização de issue. Essas ações não são executadas
por `ds-queue.js`. O projeto decide quando cada uma ocorre. A fila não
reverte alterações preexistentes.

Execução de mutação deve ocorrer em série, com worktree quieto. Consulte
[mutation.md](mutation.md) para recuperação após interrupção.
