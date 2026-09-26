# Histórico de versões

## 0.21.1 — 2026-09-26

### Corrigido

- **Runners instalados via npm no Windows (`ENOENT`):** `process-runner.js` acrescentava `.exe` a
  `opencode`, `claude`, `codex` e `agy`; quando a CLI só existia como shim do npm (`opencode.cmd`), o
  spawn falhava com `ENOENT`. Agora o comando é resolvido no `PATH` sem shell: `.exe`/`.com` seguem
  direto; um shim `.cmd`/`.bat` do npm é lido e substituído pelo programa que ele chama (script Node
  executado com o Node atual, ou o `.exe` alvo). Argumentos com `&`, `|`, aspas e `%` chegam intactos.
  `shell: true` foi descartado por corromper esses argumentos. Shim fora do formato do npm falha com
  erro explícito.

### Alterado

- **CI:** a matriz passa a testar Node 24 LTS (antes Node 22) em Ubuntu e Windows.

## 0.21.0 — 2026-09-25

### Breaking

O projeto passa a se chamar **Oathbound**. A migração renomeia agentes, scripts, variáveis,
caminhos de instalação e o estado em `.git/`. Nenhum nome antigo permanece como alias, exceto
`GOVKIT_*`, aceito por uma versão com aviso em `stderr`.

- **Agentes:** `ds-explorer` → `surveyor`, `ds-researcher` → `scholar`, `ds-governance` → `scribe`,
  `ds-runner` → `smith`, `ds-reviewer` → `assayer`, `ds-security` → `warden`, `ds-mutant` → `breaker`,
  `ds-committer` → `archivist`. Novos: `oathkeeper` e `herald`.
- **Scripts de runtime:** `ds-run.js` → `run.js`, `ds-queue.js` → `queue.js`, `ds-kill.js` → `kill.js`;
  `GovernanceStore`/`openGovernanceStore` → `OathboundStore`/`openStore`.
- **Variáveis de ambiente:** `GOVKIT_RUNNER`, `GOVKIT_MODEL`, `GOVKIT_EFFORT`, `GOVKIT_AGENT_DIR` e
  `GOVKIT_GENERIC_CMD` → `OATHBOUND_*`. `GOVKIT_*` segue aceito por uma versão, com aviso.
- **Caminhos e estado:** `.claude/skills/agent-governance/` → `.claude/skills/oathbound/`;
  `~/.agent-governance-kit/` → `~/.oathbound/`; symlinks `agent-governance` → `oathbound`;
  `.git/ds-queue/` → `.git/oathbound/`; `governance.db` → `oathbound.db`; tag de sessão
  `dsrun-…` → `oathbound-…`. O instalador detecta instalações antigas e interrompe sem apagar nada.
- **Módulos internos:** `Governance Store` → `Oathbound Store` (CONTEXT.md); prefixos internos de
  agente, escopos, tag de sessão e temporários migram para `oathbound-*`.

### Adicionado e alterado

- **Disciplina do oathkeeper portátil (`skill/SKILL.md`, `guild/oathkeeper.md`):** a skill volta a
  conter integralmente a disciplina do orquestrador (escolha do papel, tarefa fechada, conferência
  de diff/status/recibo e decisão), porque só `skill/` é copiada na instalação — os links para
  `../guild/` quebravam em `.claude/skills/oathbound/` e Codex/AGY/generic dependem só da skill. O
  corpo de `guild/oathkeeper.md` fica curto: frontmatter e permissões, papel, ponteiro para a skill
  e recusa de trabalho de execução.
- **Guarda de links da skill (`test/skill-links.test.js`):** novo teste resolve cada link Markdown
  em `skill/**` e falha se o destino sai de `skill/` ou é absoluto.
- **`Bash` restaurado no Claude (`tools/guild-transpiler.js`):** `determineClaudeTools` volta a
  conceder `Bash` quando há qualquer comando liberado no mapa `bash`, inclusive com `"*": deny`. O
  arquivo de subagente do Claude só aceita nomes de ferramenta, sem escopo de comando; a lista vale
  pelo prompt do agente e pela auditoria de escopo do Git. Sem isso, `oathkeeper` (delegação),
  `archivist` (commit) e o git de leitura de `assayer`/`warden`/`scribe` ficavam sem `Bash`.
  `docs/runners/claude.md` documenta a limitação.
- **`skill: allow` no oathkeeper (`guild/oathkeeper.md`):** o orquestrador volta a poder carregar a
  skill `oathbound`; o corpo aponta para a skill e, no fallback, para
  `.claude/skills/oathbound/SKILL.md` ou `~/.oathbound/SKILL.md`.

- **Orquestrador e documentador da guilda (sessão 5 de 6 — "Oathbound"):** novos agentes
  `oathkeeper` (`mode: primary`, `temperature: 0`) e `herald` (`mode: subagent`, `temperature: 0`).
  O `oathkeeper` orquestra — escolhe o papel, entrega a tarefa fechada, confere diff/status/recibo
  e decide — sem editar nem commitar; delega por `oathbound run`/`queue` e não é delegável
  (`run.js -a oathkeeper` falha com exit code 2). O `herald` documenta **depois** do trabalho
  (README, CHANGELOG, guias e a descrição do PR na resposta), sempre citando commit, arquivo ou
  saída de comando.
- **Divisão scribe/herald:** o `scribe` passa a escrever **antes** da implementação (spec, tickets,
  decisões e instruções de agentes) e não mantém README nem CHANGELOG; o `herald` cobre a
  documentação posterior. A tabela de papéis da skill separa as duas linhas.
- **Papéis e modo dos agentes (`roles.js`, `guild/`):** `ROLES.orchestrator = 'oathkeeper'` e
  `ROLES.documenter = 'herald'` centralizam os novos nomes. Os demais agentes de `guild/` passam de
  `mode: all` para `mode: subagent`; só o `oathkeeper` fica `mode: primary`. A guilda passa a ter
  dez agentes.
- **Transpilação (`tools/guild-transpiler.js`):** a ferramenta `Write` acompanha `Edit` quando o
  agente edita; um mapa de `bash` com `"*": deny` (comandos nomeados, sem execução livre) deixa de
  emitir a ferramenta `Bash` no Claude. `oathkeeper` sai só com leitura; o `herald` sai com
  `Edit`/`Write` e sem `Bash` livre.
- **Documentação dos runners (`docs/runners/`):** `opencode.md` e `claude.md` descrevem como
  iniciar com o `oathkeeper` (OpenCode: agente primário; Claude Code: `claude --agent oathkeeper`);
  `codex.md`, `agy.md` e `generic.md` registram que aí as regras do oathkeeper valem só pelo
  `AGENTS.md`/skill, sem imposição por permissão.
- **Renomeação de agentes, scripts, variáveis e estado (sessão 4 de 6 — "Oathbound"):** os agentes
  passam a nomes de ofícios da guilda — `ds-explorer` → `surveyor`, `ds-researcher` → `scholar`,
  `ds-governance` → `scribe`, `ds-runner` → `smith`, `ds-reviewer` → `assayer`, `ds-security` →
  `warden`, `ds-mutant` → `breaker`, `ds-committer` → `archivist`. Os scripts de runtime passam a
  `run.js`, `queue.js`, `kill.js` e `store.js` (`GovernanceStore` → `OathboundStore`;
  `openGovernanceStore` → `openStore`); os testes acompanham (`run.test.js`, `queue.test.js`,
  `store.test.js`). As variáveis públicas migram para o prefixo `OATHBOUND_` (`OATHBOUND_RUNNER`,
  `OATHBOUND_MODEL`, `OATHBOUND_EFFORT`, `OATHBOUND_AGENT_DIR`, `OATHBOUND_GENERIC_CMD`) e as
  internas para `OATHBOUND_AGENT`, `OATHBOUND_SCOPES`, `OATHBOUND_SESSION_TAG` e
  `OATHBOUND_PROCS_DIR`. O estado fica em `.git/oathbound/oathbound.db`, a tag de sessão vira
  `oathbound-…`, os temporários viram `oathbound-*` e os recibos passam a `── oathbound run:`,
  `── oathbound queue:` e `── oathbound kill:`. `roles.js` centraliza `ROLES` e `STATE_DIR_NAME`.
- **Compatibilidade de uma versão (`skill/scripts/env.js` e migração de estado):** novo
  `readEnv(name)` lê `OATHBOUND_<name>` e, quando ausente, aceita `GOVKIT_<name>` com um aviso
  único em stderr; `stateDir(gitDir)` renomeia `.git/ds-queue` para `.git/oathbound` e
  `governance.db` para `oathbound.db` na primeira execução, preservando o legado quando ambos
  existirem.
- **Papéis e diretório de estado centralizados (`skill/scripts/roles.js`):** novo módulo exporta
  `ROLES` (`implementer`, `reviewer`, `committer`) e `stateDir(gitDir)`, fonte única para os literais
  `'ds-runner'`, `'ds-reviewer'`, `'ds-committer'` e `'ds-queue'` antes espalhados por `ds-run.js`,
  `ds-queue.js`, `ds-kill.js`, `git.js` e `git-commit.js`. Refatoração sem mudança de comportamento;
  prepara a renomeação futura do projeto para "Oathbound" (sessão 2 de 6).
- **Reorganização de estrutura de pastas (sessão 3 de 6 — "Oathbound"):** `adapters/opencode/agents/`
  passa a ser `guild/`; `adapters/agent-transpiler.js` passa a ser `tools/guild-transpiler.js`;
  os READMEs de cada runner (`adapters/*/README.md`) passam a ser `docs/runners/*.md`; a
  documentação e o fragmento de `AGENTS.md` do pacote opcional Matt Pocock passam a ser
  `docs/matt-pocock.md` e `templates/AGENTS.matt-pocock.fragment.md`. Removidos os repasses de
  uma linha `adapters/*/runner.js`, sem uso fora deles. `adapters/` e `optional/` não existem
  mais. Nomes de agentes (`ds-*.md`) e de scripts (`ds-run.js` etc.) não foram alterados.

## 0.20.3 — 2026-09-25

- **Método `createDisplay()` nos adapters (`RunnerAdapter`):** contrato ganha método opcional
  `createDisplay()` que devolve `{ push(chunk), flush(rawStdout) }`, movendo a lógica de exibição
  em tempo real do motor genérico (`ds-run.js`) para cada adapter. Padrão quando ausente: `push`
  devolve o próprio chunk; `flush` devolve `''`.
- **Remoção do acoplamento por nome de runner na exibição (`ds-run.js`):** eliminados os desvios
  `if (runner.name === 'codex')` / `else if (runner.name === 'agy')` que quebravam a abstração
  `RunnerAdapter` — um runner customizado com saída JSONL agora reusa `createDisplay` de um builtin
  (ex.: `codex`) e obtém o mesmo comportamento sem que o motor precise conhecer seu nome.
- **Correção de exibição ausente no AGY (`agy.js`):** `createDisplay().flush` agora exibe
  `parseOutput(rawStdout).text` sempre que houver saída, inclusive quando a CLI devolve texto cru
  não-JSON (erro, flag desconhecida) — antes a comparação `parsed.text !== r.stdout` silenciava
  esse caso porque os dois valores eram iguais.
- **`validateAdapter` não muta mais o objeto recebido (`runner-adapter.js`):** devolve um objeto
  novo com os padrões de `parseOutput` e `createDisplay` preenchidos, preservando o adapter original
  passado pelo chamador.
- **Runner escreve em pipe, não em TTY:** stdout/stderr do processo do runner são sempre capturados
  via pipe; CLIs invocadas podem omitir cores ANSI e barras de progresso interativas ao detectar a
  ausência de TTY.
- **Correção de corrupção UTF-8 entre chunks (`process-runner.js`, `ds-run.js`):** captura de
  stdout/stderr passa a usar `StringDecoder` (`node:string_decoder`), um por stream, em vez de
  converter cada chunk isoladamente com `chunk.toString()` / concatenação `stdout + chunk`. Evita
  corromper caracteres multibyte (ex.: acentos) divididos entre dois chunks de leitura. O texto
  passado a `display.push` e ao `earlyBuffer` de captura de sessão em `ds-run.js` usa decoder
  próprio, com `decoder.end()` repassado a `display.push` antes de `display.flush`.

## 0.20.2 — 2026-09-25

- **Método `parseOutput` nos adapters (`RunnerAdapter`):** unificação da extração de `{ text, session, usage }` em todos os runners (`codex`, `agy`, `claude`, `opencode`, `generic`).
- **Resolução de travamento da fila com saídas JSON/JSONL (`ds-queue.js`):** `runSession` agora expõe `stdout` contendo apenas o texto do agente (`parsed.text`), garantindo que o recibo do reviewer (`No issues.` / checklist) e resumos de aceite casem deterministicamente com o regex de início de linha, eliminando falhas indevidas com código 6.
- **Captura concorrente e exibição limpa no terminal (`ds-run.js`):** o terminal exibe o texto do agente e progresso em paralelo sem despejar JSONL bruto; o stream é sempre capturado sem depender de herança direta de console (`output: inherit`).
- **Rastreamento antecipado de sessão contra truncamento (`ds-run.js`):** captura do ID de sessão (`thread_id`, `conversation_id`) assim que surge nos primeiros blocos do stream, impedindo a perda do identificador em execuções longas cuja saída ultrapassa o limite de buffer (`maxCapture` de 1 MB).
- **Telemetria de uso de tokens e cache KV:** extração de estatísticas de tokens (`input_tokens`, `cached_input_tokens`, `output_tokens`) incorporadas ao recibo `── telemetria:` e retornadas estruturadas em `runSession`.
- **Prevenção de `--agent` inválido e instruções duplicadas no Claude Code (`claude.js`):** a flag `--agent <papel>` é repassada exclusivamente quando o agente reside em `.claude/agents/` (suprimindo repetição de instruções no prompt); quando resolvido em outros diretórios (fallback), as instruções do papel são injetadas no prompt sem repassar a flag `--agent`.
- **Suíte de testes expandida:** 68 testes unitários e de integração passing, incluindo teste end-to-end da fila com streams JSONL.

## 0.20.1 — 2026-09-25

- **Descoberta unificada de agentes (`resolveAgentPath`):** extração de função canônica em `runner-adapter.js` compartilhada por todos os 5 runners, inspecionando diretórios nativos (`.claude/agents/`, `.agents/agents/`, `.opencode/agents/` e pastas globais de usuário).
- **Identificadores factuais de sessão via saída estruturada:**
  - `claude`: geração e rastreamento de UUID via `node:crypto` (`--session-id <uuid>` no primeiro disparo, `--resume <uuid>` nas continuações e em `-Q`), repassando também `--agent <papel>`.
  - `codex`: captura de `thread_id` a partir de eventos JSONL (`--json`); se ausente, retorna string vazia em vez de adivinhar arquivos locais.
  - `agy`: captura determinística de `conversation_id` a partir da saída estruturada (`--output-format json`); se ausente, retorna string vazia.
- **Isolamento de sandbox e flags no runner Codex:**
  - Remoção da flag inválida `-a never` no `codex exec`.
  - Posicionamento correto de flags globais (`-s read-only`, `-C`, `--json`) antes do comando `resume`.
- **Robustez no runner Generic:** introdução de `parseCommandLine` com suporte a aspas simples e duplas para que caminhos com espaços em `GOVKIT_GENERIC_CMD` não sejam corrompidos.
- **Instalador (`install.ps1`):** criação automática de `AGENTS.md` a partir de `templates/AGENTS.fragment.md` quando ausente no projeto de destino, e atualização da mensagem de conclusão (removida menção obsoleta a variantes de agentes).
- **Higiene de repositório:** remoção do arquivo de configuração pessoal `.agents/rules/antigravity-rtk-rules.md` e adição de `.agents/` ao `.gitignore`.
- **Pipeline de Integração Contínua (CI):** adição de `.github/workflows/ci.yml` executando a suíte de testes e o auditor documental em Ubuntu e Windows no Node 22 LTS.
- **Suíte de testes ampliada:** adição de `test/ds-queue.test.js` e restauração de testes de `--effort` (totalizando 61 testes passando).
- **Alinhamento do README:** esclarecimento honesto de que a governança opera por auditoria e validação determinística de diff Git antes/depois da chamada (código de saída 3), sem prometer virtualização de kernel/filesystem nas CLIs externas.

## 0.20.0 — 2026-09-25

- **Compilador e transpilador de agentes (`adapters/agent-transpiler.js`):** mecanismo agnóstico
  para transformar as definições canônicas de agentes em formatos nativos para cada ecossistema CLI:
  - `opencode`: preservação do formato original com permissões granulares (`permission`).
  - `claude`: geração de YAML frontmatter para subagentes nativos (`.claude/agents/*.md`), convertendo
    regras de permissão em whitelists de ferramentas (`tools: [Read, Grep, Glob, ...]`).
  - `agy`: geração de YAML frontmatter limpo (`name`, `description`) para agentes nativos do Antigravity CLI (`.agents/agents/*.md`).
  - `codex` / `generic`: dispensa arquivos de agentes, informando operação via `AGENTS.md` e skills.
- **Instalador multi-CLI (`install.ps1`):** adição do parâmetro `-Runner <opencode|claude|agy|codex|generic|all>`
  (padrão `opencode`), integrando com o transpilador e instalando agentes nativos nas respectivas pastas
  (`.opencode/agents/`, `.claude/agents/`, `.agents/agents/`) tanto no modo `-Project` quanto `-Global`.
- **Suíte de testes:** 8 novos testes em `test/agent-transpiler.test.js` cobrindo parse de frontmatter,
  alocação de ferramentas por permissões, transposição de formato e resolução de pastas (52 testes no total).

## 0.19.0 — 2026-09-25

- **Arquitetura agnóstica a runners:** desacoplamento da camada de execução em
  `skill/scripts/ds-run.js` e `skill/scripts/ds-queue.js` através da interface
  `RunnerAdapter` e do módulo `skill/scripts/runner-adapter.js`.
- **Seleção flexível de runner:** suporte à flag `-u` / `--runner <nome|caminho>`
  e variável de ambiente `GOVKIT_RUNNER` (mantendo `opencode` como padrão com
  total retrocompatibilidade).
- **Registry híbrido e extensível:** carregamento de adapters embutidos
  (`opencode`, `claude`, `codex`, `agy`, `generic`) ou resolução dinâmica de
  arquivos locais arbitrários sem exigir registro prévio no kit.
- **Adapters dedicados:**
  - `adapters/opencode/runner.js`: isolamento da invocação standalone, mutação
    dinâmica de permissões YAML (`temporaryAgent`, `feedbackAgent`) e listagem
    de sessões.
  - `adapters/claude/runner.js`: execução headless (`claude -p`), restrição de
    ferramentas (`--tools`) e guardrails injetados via prompt.
  - `adapters/codex/runner.js`: execução não-interativa (`codex exec`), sandbox
    `-s read-only` em leitura e guardrails de escopo.
  - `adapters/agy/runner.js`: execução com `agy -p`, modo `--mode plan` para
    leitura e continuidade de conversa com `--conversation`.
  - `adapters/generic/runner.js`: suporte a comandos arbitrários configuráveis
    via `GOVKIT_GENERIC_CMD`.
- `process-runner.js`: ampliação da resolução automática de `.exe` no Windows
  para cobrir `claude`, `codex` e `agy`.
- **Reasoning Effort e Prompt Caching:** suporte a flags `-e` / `--effort` e variável
  `GOVKIT_EFFORT` em `ds-run.js` e `ds-queue.js`; documentação perene de invariantes de
  cache KV e diretrizes de modelos em `skill/references/models.md`.
- **Testes unitários:** nova suíte `test/runner-adapter.test.js` com testes cobrindo contratos,
  resolução, reasoning effort e montagem de comandos dos adapters (44 testes no total).

## 0.18.0 — 2026-09-25

- **Consolidação:** eliminadas as duplicatas de agentes entre
  `adapters/opencode/agents/` e `optional/matt-pocock/agents/`. As regras do
  fluxo Matt Pocock (triagem, spec e tickets no `ds-governance`; dois eixos de
  revisão no `ds-reviewer`; ciclos de TDD/implement e diretrizes de comentários
  no `ds-runner`) foram consolidadas diretamente nos arquivos canônicos de
  `adapters/opencode/agents/`.
- `optional/matt-pocock/agents/`: pasta e arquivos redundantes removidos do
  pacote.
- `install.ps1`: simplificado para copiar os agentes diretamente do diretório
  canônico de agentes, sem lookup condicional de candidatos.
- Documentação e referências atualizadas em `README.md` e
  `optional/matt-pocock/README.md`.

## 0.17.0 — 2026-09-25

- `ds-runner` (base e variante Matt Pocock): endurecimento do bloco de
  permissões `bash`. Bloqueados comandos de manipulação de worktree e histórico
  Git fora de escopo (`git switch*`, `git branch*`, `git worktree*`,
  `git clone*`, `git pull*`), gerenciadores de dependência adicionais (`pnpm`,
  `yarn`, `bun`, `pip`, `dotnet add/remove`) e deleções destrutivas recursivas
  ou forçadas (`rm -r *`, `rm -f *`, `rmdir /s*`, `del /f*`, `del /s*`, `ri *`).
- `ds-runner` (base e variante Matt Pocock): diretriz explícita de comentários
  e documentação de código. Combina Ousterhout na interface pública (contratos
  de abstração, pré-condições, parâmetros, exceções e efeitos colaterais sem
  exigir leitura da implementação) com Fowler e Clean Code no corpo interno
  (proibição de comentários redundantes, código morto/comentado e comentários
  como desodorante de lógica opaca; foco no porquê de regras de domínio e
  invariantes).
- `templates/AGENTS.fragment.md`: atualizado com guia de preenchimento para
  convenções locais de comentários de código.

## 0.16.0 — 2026-09-25

- Novo agente `ds-security` (`adapters/opencode/agents/ds-security.md`): auditor
  de segurança de aplicação (AppSec) read-only com `reasoningEffort: high`.
  Conta com diretrizes de exploração econômica de contexto (inside-out a partir
  do diff, leitura fatiada sem carregar arquivos inteiros, rastreamento de
  mancha limitado a 2 saltos e early exit sem primitivas sensíveis). Checklist
  cobre OWASP Top 10 e CWE Top 25; matriz de risco calcula Probabilidade x
  Impacto; saída compacta uma linha por achado, compatível com `ds-run.js -R`.
- Documentação e contagem de agentes atualizadas para oito papéis em `README.md`,
  `adapters/opencode/README.md`, `skill/SKILL.md`,
  `optional/matt-pocock/README.md` e `install.ps1`.

## 0.15.0 — 2026-09-25

- `ds-governance` (base e Matt Pocock) ganha responsabilidade explícita de
  análise qualitativa de risco: levanta probabilidade e impacto com fonte
  verificável, sem ranquear ou definir prioridade. Recibo ganha campo `RISCO`.
- `skill/SKILL.md` documenta a divisão: prioridade entre riscos ou issues é
  sempre do orquestrador, que enxerga fila, prazo e decisão de negócio fora
  do escopo de uma única spec.

## 0.14.0 — 2026-09-25

- **Ruptura:** fluxo Matt Pocock (triagem, spec, tickets) deixa de ser
  opcional. Switch `-MattPocock` removido de `install.ps1`; `ds-governance`,
  `ds-runner` e `ds-reviewer` sempre instalam a variante com as regras de
  etapa incorporadas, em `-Project` e em `-Global`. Sem migração automática:
  quem já tinha a versão base instalada compara e migra manualmente.

## 0.13.0 — 2026-09-25

- `ds-governance` (base e variante Matt Pocock) ganha `reasoningEffort: high`
  no frontmatter, sobrepondo o `reasoningEffort` global de menor esforço.
  Papel julga estrutura, convenções e decisões de governança — tarefa que se
  beneficia de mais raciocínio, diferente de agentes de edição mecânica
  (`ds-runner`, `ds-committer`), que seguem sem o campo (herdam o padrão).

## 0.12.0 — 2026-09-25

- `install.ps1`: novo switch `-Upgrade`, aceito só com `-Global`. Libera
  substituir a fonte da skill (`~/.agent-governance-kit/`) e o auditor de
  documentação já instalados pela versão atual do repositório, sem exigir
  remoção manual. `-Upgrade` com `-Project` é rejeitado explicitamente — o
  modo por-projeto continua sem upgrade automático, por design.
- Modo `-Global` cria um terceiro symlink em
  `~/.gemini/config/skills/agent-governance`, cobrindo AGY CLI e o Gemini
  nativo do Antigravity IDE (compartilham a mesma raiz de configuração), além
  de Claude Code e Codex.
- Mesmo ponto de entrada serve instalação e atualização; nenhum script novo
  foi criado, para não duplicar a lógica de colisão e symlink.

## 0.11.0 — 2026-09-25

- `install.ps1`: novo parâmetro `-Global`, mutuamente exclusivo com `-Project`.
  Instala o pacote de forma agnóstica de CLI, sem exigir repositório Git:
  - Fonte única em `~/.agent-governance-kit/`; symlinks em
    `~/.claude/skills/agent-governance` e `~/.codex/skills/agent-governance`
    mantêm a skill invocável nativamente em cada host sem duplicar arquivos.
    Falha de symlink (Windows sem Modo de desenvolvedor/elevação) avisa mas
    não aborta a instalação.
  - Agentes `ds-*` em `~/.config/opencode/agents/` são sobrescritos com a
    versão do repositório; agentes fora desse conjunto não são tocados.
- Modo `-Project`: o instalador agora cria (ou completa, sem sobrescrever)
  `AGENTS.md` na raiz do projeto com um ponteiro de uma linha à skill.

## 0.10.0 — 2026-09-24

- Modernização com recursos nativos do Node 22 LTS (Active LTS *Jod*):
  - `skill/scripts/process-runner.js`: simplificação do ciclo assíncrono com `Promise.withResolvers()`.
  - `skill/scripts/cli-options.js`: migração do parser manual de flags para `node:util.parseArgs` nativo, mantendo compatibilidade retroativa total.
  - `skill/scripts/git.js` e `skill/scripts/ds-run.js`: adoção de `path.matchesGlob` e `fs.globSync` nativos para verificação de escopos e descoberta de arquivos.
  - `skill/scripts/governance-db.js`: criação do `GovernanceStore` encapsulando persistência transacional ACID com `node:sqlite` para fila e claims de agentes.
- Expansão da suíte de testes unitários para 32 testes via `node:test` e adição de comando nativo de cobertura com `--experimental-test-coverage`.
- Registro do termo *Governance Store* no `CONTEXT.md`.


- `ds-run.js` ganha interface programática profunda `runSession()` com opções tipadas
  em JavaScript (`repo`, `message`, `agent`, `scopes`, `readonly`, `feedback`, `session`, `label`).
- `ds-queue.js` migrado para invocar `runSession()` diretamente com objetos nativos,
  eliminando a serialização intermediária de strings de linha de comando.
- `dsRun()` preservado como adaptador fino para CLI e chamadas legadas.
- Criação de suíte de testes em `test/ds-run.test.js` para `overlap`, `mutex`, `feedbackAgent`
  e validações de escopo.

## 0.8.2 — 2026-09-24

- `process-runner.js` absorve detecção de cmd-shims e ativação de shell no Windows automaticamente.
- Remoção do script raso `tree-timeout.js` conforme o teste da deleção.
- `quiet.js` simplificado para delegar opções diretamente a `run()`.
- Criação de suíte de testes isolada em `test/process-runner.test.js`.
- Registro do termo *Process Runner* no `CONTEXT.md`.

## 0.8.1 — 2026-09-24

- `audit-docs.core.js` transformado em motor profundo in-process que exporta `auditDocs()`,
  retornando diagnósticos estruturados sem invocar `process.exit()`.
- `audit-docs.js` atua como adaptador fino de CLI para argumentos de terminal e saídas formatadas.
- Adição de testes unitários isolados em `test/audit-docs.test.js` para as regras de validação.
- Registro dos termos *Audit Engine* e *Audit Source* no `CONTEXT.md`.

## 0.8.0 — 2026-09-24

- Unificação das operações Git em um módulo profundo `skill/scripts/git.js` (consultas,
  preparação de hunks/linhas e commits com regras de escopo in-process).
- `git-stage.js` e `git-commit.js` passam a atuar como adaptadores finos de CLI.
- Remoção de `git-state.js` e migração dos chamadores internos.
- Criação de `CONTEXT.md` com o glossário de domínio canônico do kit.
- Adição de suíte de testes isolada em `test/git.test.js` via `node --test`.

## 0.7.1 — 2026-09-24

- Fontes do auditor para working tree e índice Git extraídas para
  `audit-docs.sources.js`, com contrato JSDoc comum e seleção em um ponto.
- Instalador passa a copiar o novo módulo com o auditor opcional.

## 0.7.0 — 2026-09-24

- `ds-committer` prepara linhas, hunks e commits semânticos dentro dos caminhos
  autorizados, com posse exclusiva do Git e sem publicar ou reescrever histórico.
- `ds-run.js` passa a auditar índice e caminhos de commits além do worktree.
- Consultas prontas `-Q` reutilizam a sessão com edição e shell bloqueados.

## 0.6.0 — 2026-09-24

- Wrappers de sessão, fila, saída compacta, timeout e encerramento de processos
  migrados de Bash para Node.js 22 sem dependências npm.
- Execução assíncrona por subprocessos, limite de tempo e encerramento da árvore
  por `taskkill /T /F` no Windows ou grupo de processos em Linux/macOS.

## 0.5.0 — 2026-09-24

- Auditor de documentação adaptado do projeto Nike para a raiz e a configuração
  deste pacote, com parâmetros `--project` e `--config`.
- Instalação opcional do auditor em projetos consumidores via `-AuditDocs`,
  usando uma configuração modelo sem regras específicas do Jersey.
- Guia de uso e configuração; hooks continuam sob controle de cada projeto.

## 0.4.0 — 2026-09-24

- Substituição de `ds-worker` por `ds-researcher`, com pesquisa em fontes
  primárias e resposta citada diretamente ao orquestrador, sem editar arquivos.
- Edições mecânicas passam a `ds-runner`; roteamento e documentação atualizados.
- `ds-run.sh -R` registra sessões de agentes sem edição e acusa mudanças no
  worktree; a fila também passa a chamar o reviewer pelo wrapper.

## 0.3.0 — 2026-09-24

- Regras opcionais de triagem, spec, tickets e escrita incorporadas a
  `ds-governance`; implementação a `ds-runner`; revisão a `ds-reviewer`.
- Remoção das skills opcionais e de seu carregamento pelo agente de governança.
- Instalador passa a selecionar as três variantes quando `-MattPocock` é usado.

## 0.2.0 — 2026-09-24

- Módulo opcional inspirado no fluxo de Matt Pocock, com triagem, spec, tickets
  e convenções de tracker configuráveis.
- Skill de escrita para agentes e variante de `ds-governance` com acesso seletivo
  às duas skills opcionais.
- Instalador com chave explícita `-MattPocock`; instalação base preservada.

## 0.1.0 — 2026-09-24

- Extração da skill, seis papéis OpenCode e wrappers para um pacote separado.
- Modelo herdado do projeto ou de `GOVKIT_MODEL`; agentes instalados no próprio projeto.
- Remoção da restauração automática indiscriminada de `*.mut-bak` no wrapper.
- Instalador conservador: recusa sobrescrever arquivos existentes.
