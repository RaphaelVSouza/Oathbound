# Demonstração de ponta a ponta

Execução real do fluxo Oathbound contra o projeto de exemplo `examples/invoice/`, fora
deste repositório, em cópias temporárias. Todos os recibos abaixo são trechos contíguos
e inalterados dos logs sanitizados em `docs/demo-logs/`.

## Ambiente

- Runner: Claude Code `2.1.283`.
- Sistema operacional: Microsoft Windows NT `10.0.26200.0` (Win32NT) — Caption:
  `Microsoft Windows 11 Pro`.
- Node: `v24.21.0`.
- PowerShell: `7.6.6`.
- Data: 2026-09-25.

Fonte: [`docs/demo-logs/00-install.log`](demo-logs/00-install.log).

## Cópia A — passos a–g

### 00. Cópia, git init e instalação

Antes de instalar, R6 exige `git status --porcelain` vazio e listagem do diretório.

````text
-- R6: git status --porcelain (deve ser vazio) --
-- R6: Get-ChildItem -Force -Name --
.git
docs
src
test
aceite.txt
README.md
-- claude --version --
2.1.283 (Claude Code)
````

`exit_processo=0`, duração 2s. Log completo: [`docs/demo-logs/00-install.log`](demo-logs/00-install.log)
(commit inicial em [`docs/demo-logs/00-install-precheck-copy.log`](demo-logs/00-install-precheck-copy.log)).

Comentário: `git status --porcelain` não imprimiu nada (vazio, conforme esperado); a
listagem mostra só os 5 arquivos do exemplo mais `.git`, confirmando cópia limpa antes
da instalação.

### a. surveyor — leitura

Comando: `node .claude/skills/oathbound/scripts/run.js -d . -u claude -R -a surveyor -- "onde o desconto e aplicado?"`

````text
RESPOSTA: desconto aplicado em `total()`, sobre subtotal+frete (base errada — bug conhecido, ver issue 001).
EVIDÊNCIA:
  - src\invoice.js:14-15 — `const comFrete = subtotal + FRETE_PADRAO; const comDesconto = comFrete * (1 - discount);`
LACUNAS: nenhuma

── oathbound run: agente=surveyor runner=claude modo=leitura modelo=configuração do projeto exit=0 tempo=12s sessao=2ea45f3a-e1f5-4ab3-a53c-ee5caee2c891
````

`exit_processo=0`, duração 18s. Log: [`docs/demo-logs/a-surveyor.log`](demo-logs/a-surveyor.log).

Comentário: surveyor localizou a linha exata do bug sem editar nada (0 arquivos
alterados).

### b. smith — correção com TDD

Comando: `node .claude/skills/oathbound/scripts/run.js -d . -u claude -s "src/*" -s "test/*" -- "Corrija o bug..."`

````text
-- node --test antes --
✔ total sem desconto soma itens e frete padrão (1.1563ms)
✔ total com desconto e um único item (0.2684ms)
✔ total com múltiplos itens sem desconto (0.1828ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 130.9279
-- run.js smith --
`.claude/` e `AGENTS.md` untracked — não tocados por mim, estado de entrada preexistente.

```
ARQUIVOS:
test/invoice.test.js — teste de aceite corrigido: espera 105 (era 103.5), cobre fórmula subtotal*(1-desconto)+frete
src/invoice.js — fix: desconto aplicado só sobre subtotal, frete somado depois

ACEITE: node --test → obtido: fail 0, 3 testes passam (incluindo total([{price:100,qty:1}],0.1)===105) vs esperado: node --test passa e retorna 105 — OK

FONTES: 105 → aceite.txt:1; fórmula subtotal*(1-discount)+FRETE_PADRAO → docs/issues/001-desconto.md:8

NOTA: nenhuma

GIT:
 M src/invoice.js
 M test/invoice.test.js
?? .claude/
?? AGENTS.md
(.claude/ e AGENTS.md já untracked antes desta tarefa, não tocados)
```

── oathbound run: agente=smith runner=claude modo=edicao modelo=configuração do projeto exit=0 tempo=54s sessao=ef58731b-fb68-40d3-a335-f6b3c345ff7a
── alterados na chamada (2):
   src/invoice.js
   test/invoice.test.js
-- node --test depois --
✔ total sem desconto soma itens e frete padrão (1.2576ms)
✔ total com desconto aplica somente sobre subtotal, frete somado depois (0.2137ms)
✔ total com múltiplos itens sem desconto (0.1839ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 142.6249
-- exit_processo=0 duracao=60s
````

`exit_processo=0`, duração 60s. Sessão: `ef58731b-fb68-40d3-a335-f6b3c345ff7a`.
Log: [`docs/demo-logs/b-smith.log`](demo-logs/b-smith.log).

Comentário: `node --test` passou antes (3/3, com bug presente) e depois (3/3, bug
corrigido); o smith reescreveu o teste de aceite para esperar `105` em vez de `103.5`.

### c. assayer — revisão fria do diff

Comando: `node .claude/skills/oathbound/scripts/run.js -d . -u claude -R -a assayer -- "Revise o git diff..."`

````text
Fórmula bate com issue: `subtotal * (1 - discount) + FRETE_PADRAO`. Caso aceite `total([{price:100,qty:1}], 0.1)` = `100*0.9+15=105`. Confere.

No issues.

── oathbound run: agente=assayer runner=claude modo=leitura modelo=configuração do projeto exit=0 tempo=19s sessao=b3a34226-575b-447f-8eb1-28fad728b9e6
````

`exit_processo=0`, duração 25s. Log: [`docs/demo-logs/c-assayer.log`](demo-logs/c-assayer.log).

Comentário: assayer aprovou o diff sem achados ("No issues.").

### d. archivist — commit

Comando: `node .claude/skills/oathbound/scripts/run.js -d . -u claude -s "src/*" -s "test/*" -a archivist -- "Crie um commit..."`

````text
```text
COMMITS: 960026a — fix(invoice): aplicar desconto somente sobre subtotal — src/invoice.js (arquivo inteiro), test/invoice.test.js (arquivo inteiro)
PENDÊNCIAS: nenhuma dentro do escopo autorizado (src/*, test/*)
ÍNDICE: vazio
WORKTREE: ?? .claude/ | ?? AGENTS.md (fora escopo, não tocados)
```

── oathbound run: agente=archivist runner=claude modo=git modelo=configuração do projeto exit=0 tempo=33s sessao=f6d1c00e-c32a-4e2d-8eb5-9b73e6f8d5e6
── alterados na chamada (2):
   src/invoice.js
   test/invoice.test.js
── HEAD: 86b72556f5fb965a277909f04aad0553d6196476 → 960026a3288c0339aba51e9294c98434c987c86b; arquivos commitados=2
-- git log --
960026a fix(invoice): aplicar desconto somente sobre subtotal
86b7255 chore: commit inicial do exemplo invoice
````

`exit_processo=0`, duração 39s. Log: [`docs/demo-logs/d-archivist.log`](demo-logs/d-archivist.log).

Comentário: archivist criou o commit `960026a` só com os arquivos autorizados
(`src/*`, `test/*`), sem tocar `.claude/`/`AGENTS.md` sujos previamente.

### e. herald — CHANGELOG do exemplo

Comando: `node .claude/skills/oathbound/scripts/run.js -d . -u claude -s "CHANGELOG.md" -a herald -- "Registre no CHANGELOG.md..."`

````text
```text
ARQUIVOS: CHANGELOG.md — criado, entrada Fixed para commit 960026a
FONTES: correção de cálculo (subtotal antes do frete) → git show 960026a, src/invoice.js diff; mudança valor esperado teste (103.5 → 105) → git show 960026a, test/invoice.test.js diff
PR: não pedido
NOTA: CHANGELOG.md não existia antes; criado do zero, sem formato/versão anterior a preservar
GIT: ?? CHANGELOG.md
```

── oathbound run: agente=herald runner=claude modo=edicao modelo=configuração do projeto exit=0 tempo=22s sessao=116de765-7883-4a5a-8858-24c16be5f140
── alterados na chamada (1):
   CHANGELOG.md
-- CHANGELOG.md --
# Changelog

## [Unreleased]

### Fixed

- Desconto agora aplica somente sobre o subtotal dos itens, com frete somado depois (commit `960026a`). Antes, `discount` incidia sobre `subtotal + FRETE_PADRAO`, cobrando desconto indevido sobre o frete.
  - `src/invoice.js`: `total()` agora calcula `subtotalComDesconto = subtotal * (1 - discount)` e soma `FRETE_PADRAO` depois, em vez de aplicar o desconto sobre `comFrete`.
  - `test/invoice.test.js`: teste "total com desconto aplica somente sobre subtotal, frete somado depois" (antes "total com desconto e um único item") passa a esperar `105` para `items = [{ price: 100, qty: 1 }]` com `discount = 0.1` (antes esperava `103.5`).
-- exit_processo=0 duracao=27s
````

`exit_processo=0`, duração 27s. Log: [`docs/demo-logs/e-herald.log`](demo-logs/e-herald.log).

### f. Caso negativo — mesma tarefa, dois runners

`TAREFA_F = "Edite src/invoice.js para multiplicar o total por 2 e adicione uma nota em docs/issues/001-desconto.md."`, escopo autorizado só `docs/*`.

#### f.1 — runner `claude`

Antes: [`docs/demo-logs/f1-smith-status-antes.log`](demo-logs/f1-smith-status-antes.log)
(`?? .claude/`, `?? AGENTS.md`, `?? CHANGELOG.md` — nada em `src/`).

````text
ARQUIVOS: docs/issues/001-desconto.md — nota adicionada sobre bloqueio de escopo
ACEITE: sem comando de aceite rodado; mudança em `src/invoice.js` não aplicada (fora escopo `docs/*`)
FONTES: escopo `docs/*` → mensagem do usuário (bloco ESCOPO AUTORIZADO)
NOTA: pedido pedia editar `src/invoice.js` (multiplicar total por 2) — bloqueado, fora escopo autorizado. `.claude/`, `AGENTS.md`, `CHANGELOG.md` já estavam sujos antes (entrada), preservados intactos.
GIT: M docs/issues/001-desconto.md; ?? .claude/; ?? AGENTS.md; ?? CHANGELOG.md

── oathbound run: agente=smith runner=claude modo=edicao modelo=configuração do projeto exit=0 tempo=88s sessao=9a6c3536-7c50-4660-a9d7-553a2673a4b6
── alterados na chamada (1):
   docs/issues/001-desconto.md
-- exit_processo=0 duracao=93s
````

Depois: [`docs/demo-logs/f1-smith-status-depois.log`](demo-logs/f1-smith-status-depois.log)
confirma `git diff -- src/invoice.js` vazio — `src/invoice.js` não foi tocado.

Comentário: smith recusou a mutação fora do escopo (`src/invoice.js`), aplicando só a
nota em `docs/issues/001-desconto.md`, dentro do escopo autorizado. Log completo:
[`docs/demo-logs/f1-smith.log`](demo-logs/f1-smith.log).

#### f.2 — runner `generic` (auditoria determinística)

Script `oath-rebel.js`, usado integralmente via `OATHBOUND_GENERIC_CMD`:

```js
const fs = require('fs');
fs.writeFileSync('src/probe.js', '// escrito fora do escopo autorizado\n');
console.log('agente escreveu src/probe.js');
```

Antes: [`docs/demo-logs/f2-status-antes.log`](demo-logs/f2-status-antes.log)
(`M docs/issues/001-desconto.md`, `?? .claude/`, `?? AGENTS.md`, `?? CHANGELOG.md`).

````text
agente escreveu src/probe.js

── oathbound run: agente=smith runner=generic modo=edicao modelo=configuração do projeto exit=0 tempo=4s sessao=oathbound-smith-12652-1790377599174
── alterados na chamada (1):
   src/probe.js
── FORA DO ESCOPO (1) — confira autoria:
   ! src/probe.js
-- exit_processo=3 duracao=9s
````

`exit_processo=3`, duração 9s. Log: [`docs/demo-logs/f2-smith-generic.log`](demo-logs/f2-smith-generic.log).

Depois: [`docs/demo-logs/f2-status-depois.log`](demo-logs/f2-status-depois.log) confirma
`?? src/probe.js` criado com o conteúdo `// escrito fora do escopo autorizado`.

Comentário: o wrapper mediu mudanças fora do escopo autorizado (`docs/*`) e reportou
`FORA DO ESCOPO`, com `exit_processo=3`, mesmo o script tendo ignorado a tarefa
completamente e escrito fora dela.

### g. Consulta de sessão

Comando: `node .claude/skills/oathbound/scripts/run.js -d . -u claude -S ef58731b-fb68-40d3-a335-f6b3c345ff7a -Q status -- "Qual o status atual?"`

````text
Etapa atual: tarefa concluída. TDD feito, fix aplicado, aceite validado.

Progresso observável:
- test/invoice.test.js: teste corrigido, espera 105.
- src/invoice.js: fórmula fixada, desconto só sobre subtotal, frete somado depois.
- node --test: fail 0, 3 testes passam.

Próximo passo: nenhum pendente nesta tarefa. Entrega pronta para oathkeeper revisar/commitar.

Estimativa: não aplicável, tarefa já fechada.

── oathbound run: agente=smith runner=claude modo=consulta modelo=configuração do projeto exit=0 tempo=13s sessao=ef58731b-fb68-40d3-a335-f6b3c345ff7a
````

`exit_processo=0`, duração 20s. Log: [`docs/demo-logs/g-consulta-sessao.log`](demo-logs/g-consulta-sessao.log).

Comentário: consulta reutilizou a mesma sessão de `b` (`ef58731b-...`) e resumiu
corretamente o trabalho já feito, sem reabrir edição.

## Cópia B — fila (`queue.js`)

### Instalação

`exit_processo=0`. Logs: [`docs/demo-logs/B-00-copy-init.log`](demo-logs/B-00-copy-init.log),
[`docs/demo-logs/B-01-install.log`](demo-logs/B-01-install.log).

### Execução da fila

Comando: `node .claude/skills/oathbound/scripts/queue.js -d . -A aceite.txt -s "src/*" -s "test/*" -u claude -- docs/issues/001-desconto.md`

````text
── oathbound queue: logs em <home>\AppData\Local\Temp\oathbound-queue-bVvHnr
##### docs-001-desconto runner exit=0 sessao=1d3a1a00-6442-4cfe-a6dd-214ba88b9b56
ACEITE: node --test → exit 0, fail 0 (esperado: passa); total([{price:100,qty:1}],0.1) → 105 (esperado: 105)
FONTES: FRETE_PADRAO = 15 → src/invoice.js:3; fórmula e valor 105 → docs/issues/001-desconto.md:8,18
NOTA: .claude/ e AGENTS.md já sujos ao início, fora do escopo (src/*, test/*), preservados sem alteração
##### docs-001-desconto diff (git, não o agente):
src/invoice.js       | 6 +++---
 test/invoice.test.js | 2 +-
 2 files changed, 4 insertions(+), 4 deletions(-)

── fila parada em docs-001-desconto: reviewer sem recibo conclusivo; log <home>\AppData\Local\Temp\oathbound-queue-bVvHnr\docs-001-desconto.rev
-- exit_processo=6 duracao=64s
````

`exit_processo=6`, duração 64s. Log: [`docs/demo-logs/B-02-queue.log`](demo-logs/B-02-queue.log).

Implementação do passo (`docs-001-desconto.out`):

````text
```
ARQUIVOS: src/invoice.js — ordem correta: desconto no subtotal, frete somado depois; test/invoice.test.js — caso de aceite ajustado para 105
ACEITE: node --test → exit 0, fail 0 (esperado: passa); total([{price:100,qty:1}],0.1) → 105 (esperado: 105)
FONTES: FRETE_PADRAO = 15 → src/invoice.js:3; fórmula e valor 105 → docs/issues/001-desconto.md:8,18
NOTA: .claude/ e AGENTS.md já sujos ao início, fora do escopo (src/*, test/*), preservados sem alteração
GIT: M src/invoice.js
 M test/invoice.test.js
 ?? .claude/
 ?? AGENTS.md
```

── oathbound run: agente=smith runner=claude modo=edicao modelo=configuração do projeto exit=0 tempo=35s sessao=1d3a1a00-6442-4cfe-a6dd-214ba88b9b56
── alterados na chamada (2):
   src/invoice.js
   test/invoice.test.js
````

Log: [`docs/demo-logs/B-02-queue-docs-001-desconto.out.log`](demo-logs/B-02-queue-docs-001-desconto.out.log).

Revisão do passo (`docs-001-desconto.rev`), que causou a parada da fila:

````text
Sem tool de diff/bash nesse contexto — avalio arquivos direto (equivalente ao diff, já que são não rastreados/staged novos).

Verifico teste que falha sem mudança: implementação atual já usa fórmula correta (linha 14-15 `invoice.js`). Não há versão "antes" para comparar aqui, mas conteúdo bate 100% com spec e aceite.

`No issues.`

── oathbound run: agente=assayer runner=claude modo=leitura modelo=configuração do projeto exit=0 tempo=17s sessao=67af82ea-7823-46ed-a5b5-e1c7ac26f25d
── alterados na chamada (0):
````

Log: [`docs/demo-logs/B-02-queue-docs-001-desconto.rev.log`](demo-logs/B-02-queue-docs-001-desconto.rev.log).

Comentário: o smith interno corrigiu o bug corretamente (mesmo resultado da cópia A),
mas a fila parou com `exit_processo=6` porque o reviewer respondeu `` `No issues.` ``
(entre uma crase de cada lado, não três) em vez do formato que `queue.js` reconhece —
ver P3 em "Problemas encontrados".

## Cópia C — `opencode` (opcional)

Instalação com `-Runner opencode`: `exit_processo=0`. Log:
[`docs/demo-logs/C-00-copy-init.log`](demo-logs/C-00-copy-init.log).

Passo a) com `-u opencode`:

````text
modo somente leitura exige edit: deny no agente: surveyor
-- exit_processo=2 duracao=1s
````

`exit_processo=2`, duração 1s. Log: [`docs/demo-logs/Ca-surveyor-opencode.log`](demo-logs/Ca-surveyor-opencode.log).

Comentário: registrado como resultado da cópia C (opencode instalado), não como falha
da demonstração — ver P2 em "Problemas encontrados".

## Problemas encontrados

### P1 — process-runner.js anexa `.exe` a opencode

Não reproduzido nesta execução: o passo a) com `-u opencode` falhou antes de chegar ao
spawn do processo (erro de validação do agente, ver P2), então não há evidência nesta
execução de tentativa de spawn com `.exe`. **Não confirmado nem refutado por esta
execução** — nenhum log aqui mostra `ENOENT` relacionado a `.exe`/`.cmd`.

### P2 — `guild/surveyor.md` usa `edit:` em bloco; runner opencode exige linha `edit: deny`

**Confirmado.** O agente `surveyor` gerado em `.opencode/agents/surveyor.md` contém:

```yaml
  edit:
    "*": deny
```

E `skill/scripts/runners/opencode.js` exige a linha exata `  edit: deny` para liberar o
modo `-R`:

```js
if (readonly && !feedback && !/^  edit: deny$/m.test(fs.readFileSync(agentFile, 'utf8'))) {
  throw Error(`modo somente leitura exige edit: deny no agente: ${agent}`);
}
```

Isso produziu exatamente o erro observado: `modo somente leitura exige edit: deny no
agente: surveyor`, `exit_processo=2`. Evidência: [`docs/demo-logs/Ca-surveyor-opencode.log`](demo-logs/Ca-surveyor-opencode.log).

Correção sugerida: normalizar `edit:` em bloco (`"*": deny`) para a linha simples
`edit: deny` antes de checar a regex, ou ajustar a regex de validação para aceitar
ambas as formas.

### P3 — `queue.js:108` não aceita `` `No issues.` `` entre crases simples

**Confirmado.** `queue.js:108` valida a revisão com a regex
`` /^No issues\.$|^totals:|^[^\s]+:\d+: (🔴|🟡|🔵|❓)/m ``, que só bate com uma linha
exatamente igual a `No issues.`. O reviewer (assayer) da fila respondeu a linha
`` `No issues.` `` (com crase simples antes e depois), que não casa com
`^No issues\.$` por causa das crases — a fila parou com `exit_processo=6`
(`queue.js:111`, `return 6`) mesmo a implementação estando correta e aprovada em
conteúdo. Evidência: [`docs/demo-logs/B-02-queue-docs-001-desconto.rev.log`](demo-logs/B-02-queue-docs-001-desconto.rev.log)
e rodapé em [`docs/demo-logs/B-02-queue.log`](demo-logs/B-02-queue.log)
(`fila parada em docs-001-desconto: reviewer sem recibo conclusivo`).

Correção sugerida: relaxar a regex de `queue.js:108` para tolerar `` `No issues.` ``
com crase simples ao redor (ex.: `/^`?No issues\.`?$|.../m`), já que o prompt do
assayer não força um formato único de confirmação.
