# Histórico de versões

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
