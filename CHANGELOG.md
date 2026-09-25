# Histórico de versões

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
