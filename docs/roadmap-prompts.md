# Prompts — próximas entregas do Oathbound

> Recebido de outro agente/sessão anterior, base `main` em `58ceb43` (v0.21.0).
> `VERSION` atual do repo é `0.23.8` — confira o estado real de cada item antes
> de rodar (scripts migraram de `.js` para `.ts` desde então; `docs/gaps.md` e
> `docs/demo.md` já existem). Status verificado nesta sessão, por grep:
>
> | # | Entrega | Status observado |
> |---|---|---|
> | 1 | Demonstração ponta a ponta | **Já feita** — `docs/demo.md` e `docs/gaps.md` existem e populados |
> | 2 | Permissões por agente no runner Claude | **Pendente** — `skill/scripts/runners/claude.ts:53` ainda usa `--dangerously-skip-permissions`, sem `--permission-mode`/`--allowedTools` |
> | 3 | Fila aceita diretório e glob | **Pendente** — sem `globSync`/`isDirectory` em `skill/scripts/queue.js` |
> | 4 | Quarentena de mudanças fora do escopo | **Pendente** — sem flag `quarantine` em `skill/scripts/*.ts` |
> | 5 | Desenho da fila concorrente (sem código) | **Pendente** — sem `docs/design/` no repo |
>
> Um prompt por sessão, um PR por prompt, cada prompt autocontido. Adaptar
> caminhos de `.js` para `.ts` onde o código já migrou antes de rodar.

Um prompt por sessão e um PR por prompt. Cada prompt é autocontido.

| # | Branch | Entrega | Versão | Depende de |
|---|---|---|---|---|
| 1 | `docs/demo` | Demonstração de ponta a ponta com recibos reais | patch | — |
| 2 | `feat/claude-permissions` | Runner Claude com permissões por agente em vez de bypass | minor | — |
| 3 | `feat/queue-discovery` | Fila aceita diretório e glob | minor | — |
| 4 | `feat/quarantine` | `--quarantine` para mudanças fora do escopo | minor | — |
| 5 | `design/parallel-queue` | Desenho da fila concorrente com worktrees (sem código) | — | 3 |

Regra de versão para todos: parta do `VERSION` que estiver em `main` quando a sessão começar.
Depois de cada sessão, cole aqui o relatório final para validação antes de abrir o PR.

Bloco comum (já incluído em cada prompt):
- Leia AGENTS.md e CONTRIBUTING.md; commits no formato do CONTRIBUTING.md, em português.
- Sem acesso ao GitHub; só git local e git push. Sem --force. Não abra PR, não faça merge.
- Em Validation, só o que foi realmente executado.
- Ao final, registrar as lacunas encontradas em `docs/gaps.md` (bloco "Registro de lacunas", igual em todos os prompts).

## Registro de lacunas (`docs/gaps.md`)

Arquivo único e contínuo. A sessão 1 cria o arquivo; as demais acrescentam ou atualizam entradas. Formato:

```markdown
# Registro de lacunas

Lacunas observadas pelo orquestrador durante entregas reais. Cada entrada tem evidência verificável.
Correções não são feitas na mesma sessão em que a lacuna é registrada.

| ID | Status | Área | Resumo |
|---|---|---|---|
| G-001 | aberta | runner/claude | ... |

## G-001 — <título curto>
- Status: aberta | em andamento (<branch>) | resolvida (<commit/PR>) | descartada (<motivo>)
- Encontrada em: <branch>, <data>, <commit base>
- Tipo: observada | suspeita
- Evidência: <comando executado + trecho da saída, ou arquivo:linha>
- Impacto: <o que quebra ou engana, para quem>
- Proposta: <correção sugerida em 1–3 linhas>
```

---

## 1. Demonstração de ponta a ponta

**Status: já executado** — ver `docs/demo.md` e `docs/gaps.md` no repo.

```text
Contexto
Repositório Oathbound (Node 22, zero dependências). Leia AGENTS.md e CONTRIBUTING.md.
Sem acesso ao GitHub; só git local e git push (sem --force; não abrir PR).
Esta tarefa AUTORIZA executar os agentes e scripts do kit, mas SOMENTE num projeto de exemplo em diretório
temporário fora deste repositório. Nunca rode run.js/queue.js contra o próprio repositório Oathbound.
Objetivo: provar o fluxo real e registrar recibos verdadeiros para o README. Nada de saída inventada ou editada
além da sanitização descrita abaixo.

Preparação
git fetch origin && git checkout main && git pull --ff-only && git checkout -b docs/demo

1. Projeto de exemplo versionado
   Criar examples/invoice/ com um módulo Node mínimo (zero dependências, node:test):
   - src/invoice.js com uma função total(items, discount) que tem UM bug proposital e realista
     (ex.: desconto aplicado antes de somar frete, ou arredondamento errado);
   - test/invoice.test.js com testes que passam, sem cobrir o bug;
   - docs/issues/001-desconto.md: issue curta descrevendo o comportamento correto e o aceite
     ("node --test passa e o caso X retorna Y");
   - aceite.txt com o critério objetivo;
   - README.md de 5 linhas explicando o exemplo.
   Commit: feat(examples): adicionar projeto de exemplo invoice

2. Execução real (fora do repositório)
   - Copiar examples/invoice para um diretório temporário, `git init`, commit inicial.
   - Instalar o Oathbound nele: pwsh -NoProfile -File <repo>/install.ps1 -Project <tmp> -Runner <runner>
     (use o runner que você tem autenticado: opencode ou claude; registre qual).
   - Rodar, nesta ordem, guardando a saída completa de cada comando:
     a) surveyor, leitura: "onde o desconto é aplicado?" (-R -a surveyor)
     b) smith, edição com escopo -s "src/*" -s "test/*": corrigir o bug da issue com TDD
     c) assayer, leitura: revisar o diff contra a issue
     d) archivist, -s "src/*" -s "test/*": criar o commit
     e) herald, -s "CHANGELOG.md": registrar a mudança no CHANGELOG do exemplo
     f) caso negativo proposital: smith com escopo -s "docs/*" e tarefa que exige mexer em src/
        → registrar o recibo com FORA DO ESCOPO e exit 3
     g) uma consulta de sessão: -S <id da sessão de b> -Q status
   - Rodar também a fila uma vez: queue.js -A aceite.txt -s "src/*" -s "test/*" -- docs/issues/001-desconto.md
     (em outra cópia limpa do exemplo), registrando o resultado.

3. Registro
   - docs/demo.md: para cada passo, o comando exato e o recibo real (bloco de código), com 1–2 linhas de
     comentário factual. Incluir versão do runner (`<runner> --version`), sistema operacional e data.
   - Sanitização obrigatória antes de gravar: substituir caminhos pessoais e temporários por
     <tmp>/invoice e <repo>; remover nomes de usuário, e-mails, hosts e tokens. Não alterar mais nada.
   - Se algum passo falhar, registrar a falha como aconteceu e abrir a seção "Problemas encontrados" com
     a causa provável. NÃO corrigir o kit nesta sessão; liste as correções sugeridas.
   - README.md: seção curta "Demonstração" logo após "A guilda", com o recibo do passo b (smith) e o do
     passo f (exit 3), e link para docs/demo.md.
   - CHANGELOG: nova seção patch com a demonstração e o exemplo. VERSION: incrementar o patch.
   Commit: docs(demo): registrar demonstração de ponta a ponta com recibos reais

Validação
node --test                         (no repositório Oathbound)
node --test                         (em examples/invoice: deve passar com o bug ainda presente — o bug é do exemplo)
node tools/audit-docs.js            (0 violações)
git grep -niE "users[\\/]|home[\\/]|@[a-z0-9-]+\.(com|br)|D:\\\\|C:\\\\" -- docs/demo.md README.md   (vazio)

Registro de lacunas (antes do push; commit separado)
Crie docs/gaps.md. É o registro contínuo das lacunas que o orquestrador observou em entregas reais; as próximas
sessões vão acrescentar entradas nele. Formato:

  # Registro de lacunas
  Lacunas observadas pelo orquestrador durante entregas reais. Cada entrada tem evidência verificável.
  Correções não são feitas na mesma sessão em que a lacuna é registrada.

  | ID | Status | Área | Resumo |
  |---|---|---|---|
  | G-001 | aberta | <área> | <uma linha> |

  ## G-001 — <título curto>
  - Status: aberta | em andamento (<branch>) | resolvida (<commit>) | descartada (<motivo>)
  - Encontrada em: <branch>, <data>, <commit base>
  - Tipo: observada | suspeita
  - Evidência: <comando executado + trecho da saída, ou arquivo:linha>
  - Impacto: <o que quebra ou engana, e para quem>
  - Proposta: <correção sugerida em 1–3 linhas>

O que registrar: tudo que você observou nesta sessão e NÃO corrigiu — comportamento diferente do documentado,
falha ou flag inexistente em runner, recibo enganoso, atrito de instalação ou de uso, teste ausente, ambiguidade
neste prompt ou na skill. Nesta sessão, inclua obrigatoriamente cada item da seção "Problemas encontrados" do docs/demo.md.
Regras: só com evidência (comando + saída real, ou arquivo:linha); marque "suspeita" quando não houver reprodução;
aplique a mesma sanitização de caminhos e nomes do docs/demo.md; zero lacunas é um resultado válido — nesse caso,
crie o arquivo com a tabela vazia e a frase "Nenhuma lacuna observada em <branch>".
Entradas iniciais conhecidas (de revisões anteriores). Confira CADA uma no main atual antes de registrar:
se ainda procede, registre com a evidência que você mesmo obteve (arquivo:linha ou saída); se não procede, não registre.
  - Runner claude roda com --dangerously-skip-permissions; comandos do agente só restritos por prompt
    (skill/scripts/runners/claude.ts, buildCommand).
  - guild/archivist.md libera git-stage.ts/git-commit.ts só no caminho .claude/skills/oathbound/…; na instalação
    global (~/.oathbound) o archivist não conseguiria commitar (suspeita, se você não reproduzir).
  - Flags do AGY (--output-format json, campo conversation_id, --mode plan, --agent) nunca verificadas contra a CLI real (suspeita).
  - Runner claude não reporta telemetria de tokens (parseOutput devolve usage null).
  - Runner generic: resolveSession devolve o tag local como id de sessão.
  - queue.js aceita um diretório como issue sem erro (fs.existsSync) e o agente recebe o caminho de uma pasta.
  - queue.js resolve -A contra o diretório atual e as issues contra a raiz do repositório.
  - store.js cria a tabela agent_claims, mas nenhum script a usa (claims reais são arquivos).
Link para docs/gaps.md na seção "Qualidade e Testes" do README.
Commit: docs(gaps): criar registro de lacunas com achados da demonstração

Push: git push -u origin docs/demo

Relatório final: SHAs; IDs das lacunas registradas; runner e versão usados; tabela passo → exit code → tempo; problemas encontrados;
saída do git grep de sanitização; validações e resultados; desvios.
```

---

## 2. Permissões por agente no runner Claude

```text
Contexto
Repositório Oathbound (Node 22). Leia AGENTS.md e CONTRIBUTING.md.
Sem acesso ao GitHub; só git local e git push (sem --force; não abrir PR).
Não execute run.js/queue.js/kill.ts contra este repositório.

Problema
skill/scripts/runners/claude.ts roda sempre com --dangerously-skip-permissions. As permissões de cada agente
(guild/*.md, formato OpenCode: bash com padrões allow/deny, edit com globs) só são impostas no OpenCode.
No Claude, o arquivo de subagente aceita só nomes de ferramenta (tools/guild-transpiler.js, determineClaudeTools),
então hoje a restrição de comandos vale só pelo prompt.
A CLI do Claude Code aceita: --permission-mode dontAsk (nega o que não foi pré-aprovado), --allowedTools e
--disallowedTools com regras como "Bash(git diff *)", "Edit(...)", "Read". Confirme a sintaxe exata com
`claude --help` e com a documentação de permissões do Claude Code antes de implementar.

Preparação
git fetch origin && git checkout main && git pull --ff-only && git checkout -b feat/claude-permissions

O que fazer
a) tools/guild-transpiler.js (runner claude): além de .claude/agents/<nome>.md, gerar
   .claude/agents/oathbound-permissions.json com, por agente: { allow: [...], deny: [...] } em regras do Claude:
   - bash allow "git diff*" → "Bash(git diff *)"; deny → "Bash(<padrão>)" em deny;
     bash "*": allow com denies → "Bash" em allow e os denies em deny;
   - edit com allow por glob → "Edit(<glob>)" e "Write(<glob>)"; edit: deny → nada;
   - read/glob → "Read", "Glob"; webfetch/websearch allow → "WebFetch"/"WebSearch".
   Documentar a tradução em comentário e em docs/runners/claude.md.
b) skill/scripts/runners/claude.ts:
   - trocar --dangerously-skip-permissions por --permission-mode dontAsk;
   - ler oathbound-permissions.json do diretório do agentFile (quando nativo) e passar
     --allowedTools e --disallowedTools como UM argumento cada, separado por vírgula (evita que listas
     variádicas engulam o prompt);
   - escopos da sessão (-s): acrescentar "Edit(<glob>)"/"Write(<glob>)" por escopo e NÃO conceder Edit/Write genérico
     quando houver escopo (o escopo passa a ser imposto pela CLI, não só auditado);
   - modo leitura: manter --tools Read,Grep,Glob e acrescentar só os Bash de leitura do agente;
   - sem arquivo de permissões (agente não nativo): comportamento atual, com aviso único no stderr
     "permissões do agente indisponíveis; rodando sem restrição de comandos".
c) guild/archivist.md: os allow de git-stage.ts/git-commit.ts hoje fixam ".claude/skills/oathbound/scripts/…";
   trocar por "node *oathbound/scripts/git-stage.ts*" e "node *oathbound/scripts/git-commit.ts*" para cobrir a
   instalação global (~/.oathbound).
d) Revisar os outros agentes em guild/ pelo mesmo problema de caminho fixo.

Testes
- Transpilação: oathkeeper gera Bash(node *oathbound/scripts/run.js *) etc.; smith gera Bash + denies;
  surveyor sem Bash; herald com Edit(README.md), Edit(CHANGELOG.md), Edit(docs/**).
- buildCommand do claude: contém --permission-mode dontAsk; não contém --dangerously-skip-permissions quando há
  permissões; --allowedTools é um único argumento; com -s "src/*" contém Edit(src/*) e não "Edit" genérico.
- Sem arquivo de permissões: fallback atual + aviso.
- Se você tiver o Claude Code instalado e autenticado: um teste manual num repositório temporário fora deste,
  smith com -s "src/*" tentando editar docs/x.md → a CLI deve negar. Registre o resultado; não automatize isso no CI.

Registro: CHANGELOG (minor, com nota de comportamento: o Claude passa a negar comandos fora da lista do agente),
VERSION, docs/runners/claude.md.
Validação: node --test; node tools/audit-docs.js; transpilador em repo temporário com a saída do JSON colada.
Commit: feat(claude): impor permissões do agente e escopo via allowedTools
Registro de lacunas (antes do push; commit separado)
Atualize docs/gaps.md seguindo o formato já existente no arquivo (tabela-resumo + uma seção por entrada com
Status, Encontrada em, Tipo, Evidência, Impacto, Proposta). Se o arquivo ainda não existir, crie-o com esse formato.
- Registre tudo que você observou nesta sessão e NÃO corrigiu: comportamento diferente do documentado, falha de
  runner, recibo enganoso, teste ausente, atrito de uso, ambiguidade neste prompt ou na skill.
- Só com evidência (comando + saída real, ou arquivo:linha); "suspeita" quando não houver reprodução.
- Não duplique: se a lacuna já existe, acrescente a evidência nova e ajuste o status.
- Lacunas que esta entrega resolve: mude o status para "resolvida (<SHA>)".
- Sem caminhos pessoais, usuários, e-mails ou tokens. Zero lacunas novas é válido: diga isso no relatório.
Commit: docs(gaps): registrar lacunas de <nome do branch>

Push: git push -u origin feat/claude-permissions
Relatório: SHA; IDs das lacunas registradas/atualizadas; arquivos; JSON de permissões gerado para os 10 agentes; resultado do teste manual (ou "não executado");
validações; desvios.
```

---

## 3. Fila aceita diretório e glob

```text
Contexto
Repositório Oathbound (Node 22). Leia AGENTS.md e CONTRIBUTING.md.
Sem acesso ao GitHub; só git local e git push (sem --force; não abrir PR).
Não execute run.js/queue.js/kill.ts contra este repositório (os testes podem, em diretórios temporários).

Situação atual (skill/scripts/queue.js)
- Um diretório passado como issue passa no fs.existsSync e o agente recebe o caminho de uma pasta. É um bug.
- O id do checkpoint é `<avô>-<nome>` (path.basename(path.dirname(path.dirname(issue)))), derivado do caminho
  informado; mudar o formato do caminho muda o id e invalida checkpoints.
- As issues são resolvidas contra a raiz do repositório; o -A é resolvido contra o diretório atual.

Preparação
git fetch origin && git checkout main && git pull --ff-only && git checkout -b feat/queue-discovery

O que fazer
a) Cada argumento posicional pode ser:
   - arquivo .md → como hoje;
   - diretório → os *.md do próprio nível, sem recursão;
   - glob (contém *, ? ou [) → expandir com fs.globSync relativo à raiz do repositório.
   Ordenar com localeCompare(…, undefined, { numeric: true }) (2 antes de 10). Remover duplicados.
   Os caminhos expandidos devem ser relativos à raiz, no mesmo formato que o usuário digitaria, para que o id do
   checkpoint seja idêntico ao de hoje.
b) Diretório sem .md ou glob sem resultado → erro claro, exit 2, antes de qualquer sessão.
c) Resolver -A contra a raiz do repositório quando o caminho for relativo e não existir no diretório atual
   (manter compatibilidade: se existir no cwd, usa o cwd).
d) NÃO criar aceite padrão (nada de docs/aceite.txt implícito): o pacote não define caminhos do projeto consumidor.
e) Atualizar skill/references/queue.md e a seção de uso da fila no README.

Testes (test/queue.test.js)
- diretório com 1.md, 2.md, 10.md e nota.txt → ordem 1, 2, 10; nota.txt ignorado;
- glob "docs/issues/*.md" → mesma lista;
- id do checkpoint igual ao obtido passando os arquivos um a um;
- diretório vazio e glob sem resultado → erro, nenhuma sessão iniciada;
- -A relativo à raiz funciona quando o cwd é outro.

Registro: CHANGELOG (minor), VERSION.
Validação: node --test; node tools/audit-docs.js.
Commit: feat(queue): aceitar diretório e glob como lista de issues
Registro de lacunas (antes do push; commit separado)
Atualize docs/gaps.md seguindo o formato já existente no arquivo (tabela-resumo + uma seção por entrada com
Status, Encontrada em, Tipo, Evidência, Impacto, Proposta). Se o arquivo ainda não existir, crie-o com esse formato.
- Registre tudo que você observou nesta sessão e NÃO corrigiu: comportamento diferente do documentado, falha de
  runner, recibo enganoso, teste ausente, atrito de uso, ambiguidade neste prompt ou na skill.
- Só com evidência (comando + saída real, ou arquivo:linha); "suspeita" quando não houver reprodução.
- Não duplique: se a lacuna já existe, acrescente a evidência nova e ajuste o status.
- Lacunas que esta entrega resolve: mude o status para "resolvida (<SHA>)".
- Sem caminhos pessoais, usuários, e-mails ou tokens. Zero lacunas novas é válido: diga isso no relatório.
Commit: docs(gaps): registrar lacunas de <nome do branch>

Push: git push -u origin feat/queue-discovery
Relatório: SHA; IDs das lacunas registradas/atualizadas; arquivos; validações e resultados; desvios.
```

---

## 4. Quarentena de mudanças fora do escopo

```text
Contexto
Repositório Oathbound (Node 22). Leia AGENTS.md e CONTRIBUTING.md.
Sem acesso ao GitHub; só git local e git push (sem --force; não abrir PR).
Não execute run.js/queue.js/kill.ts contra este repositório (os testes podem, em diretórios temporários).

Situação atual
- run.js detecta mudanças fora do escopo (outside) comparando snapshots do Git antes/depois e retorna exit 3,
  sem reverter nada. README, skill/SKILL.md e skill/references/queue.md documentam que o kit não reverte arquivos,
  e o AGENTS.md exige preservar alterações locais.
- O snapshot (skill/scripts/git.ts, função snapshot) usa `git hash-object` SEM -w: só guarda o hash, não o
  conteúdo, então hoje é impossível restaurar o estado anterior com exatidão.
- Um git restore voltaria ao índice, não ao estado anterior à chamada, e apagaria trabalho não commitado do usuário.

Preparação
git fetch origin && git checkout main && git pull --ff-only && git checkout -b feat/quarantine

O que fazer (opt-in; o padrão continua sem reverter nada)
a) Flag --quarantine em run.js (CLI e runSession({ quarantine: true })); também em queue.js repassando à sessão.
b) Quando ativa, o snapshot "antes" grava o conteúdo dos arquivos sujos com `git hash-object -w` (blobs no
   object store do próprio repositório; nada fora do .git).
c) Depois da chamada, para cada arquivo em `outside`:
   - salvar o diff do arquivo em <stateDir>/quarantine/<tag>.patch (um arquivo por sessão, com cabeçalho explicando);
   - restaurar SOMENTE se: (1) o arquivo estava limpo antes da chamada, ou o blob anterior foi gravado com -w;
     (2) nenhuma claim ativa de outro agente cobre o arquivo; (3) não é modo leitura; (4) não entrou em commit.
     Restaurar = gravar exatamente o conteúdo anterior (git cat-file -p <blob>), ou apagar se não existia antes.
   - o que não puder ser restaurado fica como está e é listado no recibo com o motivo.
d) Recibo: nova linha "── quarentena: N restaurados, M mantidos (motivo); patch em <caminho>". Exit continua 3.
e) Documentar em README, skill/SKILL.md e skill/references/queue.md: é opt-in, o que restaura, o que nunca toca,
   onde fica o patch e como reaplicá-lo (git apply <patch>).

Testes
- arquivo limpo alterado fora do escopo → restaurado, patch contém a mudança, exit 3;
- arquivo que já estava sujo antes → restaurado para o conteúdo sujo anterior (não para HEAD);
- arquivo novo fora do escopo → removido e presente no patch;
- arquivo coberto por claim de outro agente → mantido, motivo no recibo;
- commit fora do escopo → não desfeito, motivo no recibo;
- modo leitura com --quarantine → recusado com erro claro;
- sem --quarantine → comportamento idêntico ao atual (nenhum arquivo tocado).

Registro: CHANGELOG (minor), VERSION.
Validação: node --test; node tools/audit-docs.js.
Commit: feat(run): adicionar --quarantine para mudanças fora do escopo
Registro de lacunas (antes do push; commit separado)
Atualize docs/gaps.md seguindo o formato já existente no arquivo (tabela-resumo + uma seção por entrada com
Status, Encontrada em, Tipo, Evidência, Impacto, Proposta). Se o arquivo ainda não existir, crie-o com esse formato.
- Registre tudo que você observou nesta sessão e NÃO corrigiu: comportamento diferente do documentado, falha de
  runner, recibo enganoso, teste ausente, atrito de uso, ambiguidade neste prompt ou na skill.
- Só com evidência (comando + saída real, ou arquivo:linha); "suspeita" quando não houver reprodução.
- Não duplique: se a lacuna já existe, acrescente a evidência nova e ajuste o status.
- Lacunas que esta entrega resolve: mude o status para "resolvida (<SHA>)".
- Sem caminhos pessoais, usuários, e-mails ou tokens. Zero lacunas novas é válido: diga isso no relatório.
Commit: docs(gaps): registrar lacunas de <nome do branch>

Push: git push -u origin feat/quarantine
Relatório: SHA; IDs das lacunas registradas/atualizadas; arquivos; exemplo de recibo e de patch gerado num teste; validações; desvios.
```

---

## 5. Desenho da fila concorrente (sem código)

```text
Contexto
Repositório Oathbound (Node 22). Leia AGENTS.md, CONTRIBUTING.md, CONTEXT.md, skill/scripts/run.js,
skill/scripts/queue.js, skill/scripts/git.ts, skill/scripts/store.ts e skill/scripts/roles.ts.
Sem acesso ao GitHub; só git local e git push (sem --force; não abrir PR).
Esta sessão NÃO altera código. Entregável: um documento de desenho para decisão.

Preparação
git fetch origin && git checkout main && git pull --ff-only && git checkout -b design/parallel-queue

Problema a desenhar: queue.js -j <N> executando tickets em paralelo com segurança.
Restrições conhecidas (confirme cada uma no código e cite arquivo:linha):
- a fila aplica o mesmo -s a todas as issues → hoje todo par de tickets conflita;
- claims são arquivos <stateDir>/claims/<pid>.claim com mutex por mkdir; várias sessões no mesmo processo
  compartilham o pid e se sobrescrevem;
- a tabela agent_claims do store existe mas não é usada;
- o snapshot cobre o worktree inteiro; a lista `others` é lida só no início da sessão → ticket iniciado depois
  aparece como FORA DO ESCOPO (exit 3 falso);
- checagens -C rodam a suíte do repositório inteiro;
- a fila reaproveita uma sessão de runner e uma de reviewer entre issues;
- overlap() compara prefixos antes do primeiro curinga; "**/*.md" sobrepõe tudo.

Entregável: docs/design/parallel-queue.md com
1. Resumo do problema e das restrições (com arquivo:linha).
2. Duas alternativas: (A) mesmo worktree com claims por sessão; (B) um `git worktree` por ticket com integração
   em série pelo archivist. Para cada uma: como resolve cada restrição, riscos, o que muda em run/queue/store/git.
3. Escopo por ticket: formato proposto no arquivo da issue (ex.: frontmatter `scopes:`), compatibilidade com -s.
4. Integração: ordem, conflitos, o que acontece quando um ticket falha, limpeza de worktrees.
5. Recomendação e plano em etapas pequenas (cada etapa = um PR com aceite verificável).
6. Riscos em aberto e perguntas que precisam de decisão do mantenedor.
Sem números de ganho de desempenho que não tenham sido medidos.

Registro: nenhum VERSION; CHANGELOG não muda (documento de desenho).
Validação: node tools/audit-docs.js (0 violações).
Commit: docs(design): propor fila concorrente com escopo por ticket
Registro de lacunas (antes do push; commit separado)
Atualize docs/gaps.md seguindo o formato já existente no arquivo (tabela-resumo + uma seção por entrada com
Status, Encontrada em, Tipo, Evidência, Impacto, Proposta). Se o arquivo ainda não existir, crie-o com esse formato.
- Registre tudo que você observou nesta sessão e NÃO corrigiu: comportamento diferente do documentado, falha de
  runner, recibo enganoso, teste ausente, atrito de uso, ambiguidade neste prompt ou na skill.
- Só com evidência (comando + saída real, ou arquivo:linha); "suspeita" quando não houver reprodução.
- Não duplique: se a lacuna já existe, acrescente a evidência nova e ajuste o status.
- Lacunas que esta entrega resolve: mude o status para "resolvida (<SHA>)".
- Sem caminhos pessoais, usuários, e-mails ou tokens. Zero lacunas novas é válido: diga isso no relatório.
Commit: docs(gaps): registrar lacunas de <nome do branch>

Push: git push -u origin design/parallel-queue
Relatório: SHA; IDs das lacunas registradas/atualizadas; resumo da recomendação em 5 linhas; perguntas abertas; validação.
```
