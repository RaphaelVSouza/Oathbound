# Registro de lacunas

Lacunas observadas pelo orquestrador durante entregas reais. Cada entrada tem evidência
verificável. Correções não são feitas na mesma sessão em que a lacuna é registrada.

| ID | Status | Área | Resumo |
|---|---|---|---|
| G-001 | aberta | runners/opencode | `surveyor` usa bloco `edit:` no opencode; validação de `-R` exige linha `edit: deny` |
| G-002 | aberta | fila (queue.js) | `queue.js:108` não reconhece `` `No issues.` `` com crase simples; não reproduzido em toda chamada |
| G-003 | aberta | fila (queue.js) | Revisor da fila não recebe diff nem Bash com `-R` no Claude; avalia arquivo cru |
| G-004 | aberta | runners/claude | Runner roda com `--dangerously-skip-permissions`; único freio é o prompt |
| G-005 | suspeita | guild/archivist | `git-stage.js`/`git-commit.js` liberados só no caminho `.claude/skills/oathbound/…` |
| G-006 | suspeita | runners/agy | Flags do AGY (`--output-format json`, `conversation_id`, `--mode plan`, `--agent`) nunca testadas contra a CLI real |
| G-007 | aberta | runners/claude | `parseOutput` do runner `claude` sempre devolve `usage: null` |
| G-008 | aberta | runners/generic | `resolveSession` do runner `generic` devolve a tag local como id de sessão |
| G-009 | aberta | fila (queue.js) | `queue.js` aceita diretório como issue ou como aceite sem erro (`fs.existsSync`) |
| G-010 | aberta | fila (queue.js) | `-A` resolve contra o diretório atual; a issue resolve contra a raiz do repositório |
| G-011 | aberta | store.js | Tabela `agent_claims` criada e com métodos prontos, mas nenhum script chama `registerClaim`/`getActiveClaims`/`cleanStaleClaims` |

## G-001 — `surveyor` usa bloco `edit:` no opencode; validação de `-R` exige linha simples

- Status: aberta
- Encontrada em: `docs/demo`, 2026-09-25, commit base `45122fb`
- Tipo: observada
- Evidência: `guild/surveyor.md:31-32` declara `edit:\n    "*": deny` (bloco), único entre os
  agentes de leitura — `guild/assayer.md:31`, `guild/oathkeeper.md:30`, `guild/scholar.md:31`
  e `guild/warden.md:32` já usam a linha simples `edit: deny`. `skill/scripts/runners/opencode.js:9`
  detecta bloco (`/^  edit:$/m`) para `temporaryAgent`, mas `skill/scripts/runners/opencode.js:52`
  exige a linha exata `/^  edit: deny$/m` para liberar `-R` — os dois formatos são opostos no
  mesmo arquivo. Reproduzido de verdade: [`docs/demo-logs/Ca-surveyor-opencode.log`](demo-logs/Ca-surveyor-opencode.log)
  (`modo somente leitura exige edit: deny no agente: surveyor`, `exit_processo=2`).
- Impacto: só o agente `surveyor` falha com `-R` no runner opencode; os demais agentes de
  leitura (`assayer`, `oathkeeper`, `scholar`, `warden`) já usam o formato aceito e não são
  afetados — a abrangência é menor do que "todo agente `-R`".
- Proposta: normalizar o bloco `edit:` de `surveyor.md` para a linha simples `edit: deny`
  (perde a granularidade do sub-bloco, que hoje é só `"*": deny` mesmo) ou ajustar a regex
  de `opencode.js:52` para aceitar as duas formas.

## G-002 — `queue.js:108` não aceita `` `No issues.` `` com crase simples

- Status: aberta
- Encontrada em: `docs/demo`, 2026-09-25, commit base `45122fb`
- Tipo: observada, não reprodução determinística
- Evidência: `skill/scripts/queue.js:108` valida com
  `/^No issues\.$|^totals:|^[^\s]+:\d+: (🔴|🟡|🔵|❓)/m`. Em execução anterior deste mesmo
  fluxo, o reviewer respondeu a linha `` `No issues.` `` (crase simples ao redor), que não
  casa com `^No issues\.$`; a fila parou com `exit_processo=6` (`queue.js:111`). Na
  reexecução registrada em `docs/demo.md` ("Cópia B"), o mesmo reviewer devolveu
  `No issues.` dentro de um bloco de três crases, que casa com a regex, e a fila terminou
  com `exit_processo=0` — ver [`docs/demo-logs/B-02-queue-docs-001-desconto.rev.log`](demo-logs/B-02-queue-docs-001-desconto.rev.log).
- Impacto: a fila pode parar sem motivo real quando o modelo varia a pontuação da resposta
  de aprovação; não é reproduzível a cada chamada.
- Proposta: relaxar a regex para tolerar crase simples ao redor de `No issues.`.

## G-003 — Revisor da fila não recebe diff nem Bash com `-R` no Claude

- Status: aberta
- Encontrada em: `docs/demo`, 2026-09-25, commit base `45122fb`
- Tipo: observada
- Evidência: `skill/scripts/queue.js:85` monta o prompt do revisor pedindo para "revisar o
  git diff do escopo", mas não anexa o diff à mensagem nem passa Bash: no runner `claude`,
  `skill/scripts/runners/claude.js:70` restringe `--tools Read,Grep,Glob` quando `readonly`
  é verdadeiro. O próprio assayer relatou isso nos dois logs reais desta demonstração:
  [`docs/demo-logs/c-assayer.log`](demo-logs/c-assayer.log) e
  [`docs/demo-logs/B-02-queue-docs-001-desconto.rev.log`](demo-logs/B-02-queue-docs-001-desconto.rev.log)
  ("Sem tool de diff/bash nesse contexto — avalio arquivos direto").
- Impacto: a revisão da fila não vê de fato o diff pedido; avalia o conteúdo final dos
  arquivos como proxy, o que pode aprovar mudanças que um diff real reprovaria (ex.: uma
  regressão em uma parte do arquivo não relacionada à issue).
- Proposta: anexar o diff (`git diff` do escopo) diretamente à mensagem do revisor em
  `queue.js`, já que o runner `-R` não garante acesso a Bash em todo runner.

## G-004 — Runner `claude` roda com `--dangerously-skip-permissions`

- Status: aberta
- Encontrada em: `main`, 2026-09-25, commit base `45122fb`
- Tipo: observada
- Evidência: `skill/scripts/runners/claude.js:53` inclui `--dangerously-skip-permissions`
  em todo `buildCommand`. Os únicos freios são o prompt (guardrails de escopo/leitura
  injetados em `prepareAgent`, linhas 22-36) e a auditoria de diff pós-fato do Oathbound;
  não há restrição de ferramenta imposta pela CLI do Claude nesse runner.
- Impacto: com `-R` o runner já restringe a `Read,Grep,Glob` (`claude.js:70`), então o
  guardrail de leitura não depende só do prompt. O risco real é no modo de edição:
  `--dangerously-skip-permissions` libera Bash e Edit/Write em qualquer arquivo, e o
  escopo autorizado (`-s`) só é verificado depois, pela auditoria de diff Git
  (`exit_processo=3`), que não impede a execução do comando — só a detecta.
- Proposta: avaliar se `--tools` (já usado quando `readonly`) pode restringir Bash também
  fora do modo `-R`, ou documentar explicitamente que o isolamento é só por prompt+auditoria.

## G-005 — `archivist` só commita pelo caminho `.claude/skills/oathbound/…` (suspeita)

- Status: suspeita
- Encontrada em: `main`, 2026-09-25, commit base `45122fb`
- Tipo: suspeita — não reproduzida nesta sessão (instalação global não foi testada)
- Evidência: `guild/archivist.md:29-30` libera Bash só para
  `"node .claude/skills/oathbound/scripts/git-stage.js*"` e
  `"node .claude/skills/oathbound/scripts/git-commit.js*"`. Numa instalação global
  (`~/.oathbound/`), o caminho seria outro, e o padrão declarado no agente não bateria.
- Impacto, se confirmado: `archivist` instalado globalmente não conseguiria commitar,
  porque o guardrail de Bash do OpenCode casa texto literal do caminho.
- Proposta: parametrizar o caminho no guardrail conforme o diretório real de instalação,
  ou documentar que `archivist` só funciona com instalação por projeto.

## G-006 — Flags do AGY nunca verificadas contra a CLI real (suspeita)

- Status: suspeita
- Encontrada em: `main`, 2026-09-25, commit base `45122fb`
- Tipo: suspeita — AGY CLI não estava disponível nesta sessão para reprodução
- Evidência: `skill/scripts/runners/agy.js:37` (`--output-format json`), `:41`
  (`--conversation`), `:42` (`--mode plan`), `:43` (`--agent`) e o parsing de
  `conversation_id` em `:58`/`:78`/`:91` assumem um contrato de CLI que não foi exercitado
  contra o binário real do Antigravity CLI nesta demonstração (só `claude` e `opencode`
  foram rodados de fato).
- Impacto, se confirmado: qualquer divergência de flag ou formato de saída quebraria o
  runner `agy` silenciosamente (parsing best-effort com múltiplos fallbacks).
- Proposta: rodar uma demonstração equivalente com o AGY CLI instalado antes de confiar
  no runner em produção.

## G-007 — `parseOutput` do runner `claude` sempre devolve `usage: null`

- Status: aberta
- Encontrada em: `main`, 2026-09-25, commit base `45122fb`
- Tipo: observada
- Evidência: `skill/scripts/runners/claude.js:75-82` — `parseOutput` retorna
  `{ text: raw, session: '', usage: null }` incondicionalmente; não há extração de tokens
  da saída do `claude -p`.
- Impacto: o runner `claude` não fornece `usage` (tokens de entrada/saída/cache), ao
  contrário do runner `codex` (`skill/scripts/runners/codex.js:61-93`), que extrai
  `usage` real dos eventos JSONL; qualquer relatório de custo por chamada fica sem dado
  quando o runner é `claude`.
- Proposta: extrair `usage` da saída estruturada do Claude Code quando disponível
  (ex.: `--output-format json`), similar ao que `agy.js` já faz.

## G-008 — `resolveSession` do runner `generic` devolve a tag local como sessão

- Status: aberta
- Encontrada em: `main`, 2026-09-25, commit base `45122fb`
- Tipo: observada
- Evidência: `skill/scripts/runners/generic.js:97-99` — `resolveSession` retorna
  `sessionInput || tag`, sem nenhuma identificação real de sessão vinda do comando externo.
- Impacto: `-S`/`-Q status` no runner `generic` não consegue retomar uma conversa real;
  o "id de sessão" reportado é só a tag da chamada local, sem continuidade no processo
  externo (`OATHBOUND_GENERIC_CMD`).
- Proposta: documentar essa limitação explicitamente (sessão não é suportada em
  `generic`) ou exigir que o comando externo devolva um identificador real via stdout.

## G-009 — `queue.js` aceita diretório como issue ou como aceite sem erro

- Status: aberta
- Encontrada em: `main`, 2026-09-25, commit base `45122fb`
- Tipo: observada
- Evidência: `skill/scripts/queue.js:19` valida `!fs.existsSync(accept)` e
  `skill/scripts/queue.js:32` valida `!fs.existsSync(issuePath)`; `fs.existsSync` retorna
  `true` tanto para arquivo quanto para diretório (confirmado com
  `node -e "console.log(fs.existsSync('.'))"` → `true`). Nenhum dos dois checa `isFile()`.
- Impacto: passar um caminho de diretório em `-A` ou como issue não gera erro nessa
  validação; a falha migra para `fs.readFileSync`/leitura do conteúdo mais adiante, com
  mensagem menos clara sobre a causa real.
- Proposta: trocar `fs.existsSync` por `fs.statSync(...).isFile()` nas duas checagens.

## G-010 — `-A` resolve contra o diretório atual; a issue resolve contra a raiz do repositório

- Status: aberta
- Encontrada em: `main`, 2026-09-25, commit base `45122fb`
- Tipo: observada
- Evidência: `skill/scripts/queue.js:16` (`accept = one(o, '-A')`) e `:39`
  (`fs.readFileSync(accept, 'utf8')`) usam o valor de `-A` sem `path.resolve`, relativo ao
  `cwd` do processo Node; já `skill/scripts/queue.js:31`
  (`const issuePath = path.resolve(root, issue)`) resolve a issue contra `root`
  (raiz do repositório encontrada por `repoPaths`). As duas flags de caminho da mesma
  chamada usam bases diferentes.
- Impacto: rodar `queue.js` de um subdiretório do repositório com `-A` relativo falha ou
  aponta para um arquivo errado, enquanto o caminho da issue continua funcionando — atrito
  de uso não documentado.
- Proposta: resolver `-A` contra `root` (ou contra o `cwd`, mas documentando a diferença)
  para manter as duas flags de caminho consistentes.

## G-011 — Tabela `agent_claims` criada, mas nenhum script chama seus métodos

- Status: aberta
- Encontrada em: `main`, 2026-09-25, commit base `45122fb`
- Tipo: observada
- Evidência: `skill/scripts/store.js:37-43` cria a tabela `agent_claims` e expõe
  `registerClaim` (`:92`), `getActiveClaims` (`:102`) e `cleanStaleClaims` (`:117`); busca
  por esses três nomes em `skill/scripts/*.js` fora de `store.js` não encontra nenhuma
  chamada (`queue.js` só usa `openStore`, `getStage`, `setStage`, `close`; `run.js` e
  `kill.js` não usam nenhum dos três).
- Impacto: a posse por PID/label/agente mencionada na tabela nunca é registrada nem lida;
  reivindicações reais de agente hoje são só os arquivos de estado (`state/<id>`), não a
  tabela SQLite.
- Proposta: ligar `registerClaim`/`releaseClaim` ao ciclo de vida de `run.js`/`queue.js`,
  ou remover a tabela e os métodos não usados até que haja um chamador real.
