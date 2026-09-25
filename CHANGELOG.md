# Histórico de versões

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
