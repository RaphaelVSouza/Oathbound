# Agent Governance Kit

> Framework reutilizável e agnóstico de governança determinística, auditoria e orquestração multi-agente para desenvolvimento de software com LLMs.

[![Versão](https://img.shields.io/badge/versão-0.20.3-blue.svg)](VERSION)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.0.0-green.svg)](https://nodejs.org/)
[![Dependências](https://img.shields.io/badge/dependências-zero-brightgreen.svg)](README.md)
[![Licença](https://img.shields.io/badge/licença-MIT-blue.svg)](LICENSE)

O **Agent Governance Kit** estabelece uma camada de auditoria e controle factual sobre agentes de codificação autônomos. Ele desacopla o orquestrador das CLIs de execução, audita mutações contra o escopo delimitado via Git snapshots, gerencia filas de tarefas com transações ACID em SQLite e organiza prefixos de prompts para maximizar o reaproveitamento de **prompt caching (KV cache)**.

---

## Por que o kit existe?

Agentes de código com LLMs frequentemente:
- Alteram arquivos além da tarefa designada, gerando quebras e drift acidental.
- Permanecem travados no ecossistema proprietário de uma única CLI.
- Re-injetam todo o contexto a cada turno, descartando o reaproveitamento de cache KV de prefixo.
- Criam commits genéricos ou desordenados sem rastreabilidade.

O **Agent Governance Kit** resolve esses problemas através de:

1. **Executores Agnósticos (Runners):** Suporte nativo e intercambiável para **OpenCode**, **Claude Code**, **OpenAI Codex**, **Antigravity CLI (AGY)** e comandos customizados via contrato `RunnerAdapter`.
2. **Auditoria Determinística de Escopo:** O kit não cria virtualização de filesystem nem isolamento de kernel; a governança apoia-se em restrições de ferramentas e prompt guards, combinados com auditoria factual de snapshot Git antes e depois de cada chamada. Qualquer mutação fora dos globs autorizados (`-s`) é detectada no diff e encerra com código de saída `3` (sem descartar alterações automaticamente, preservando evidências para conferência).
3. **Fila Sequencial com Checkpoints Persistentes (`queue`):** Execução sequencial de tarefas com persistência de estágio em `node:sqlite` (`queue_state`) e arquivos de estado, permitindo retomar de onde parou sem reprocessar tickets concluídos.
4. **Alinhamento para Prompt Caching KV:** Prompt engineering ordenado estritamente do estático para o volátil (instruções do papel → regras do repositório → guardrails de escopo → dados voláteis da tarefa), garantindo prefixos byte-exact estáveis.
5. **Transpilação Nativa de Agentes:** Conversor automático que traduz permissões granulares canônicas em whitelists de ferramentas (`tools`) para Claude Code e definições para AGY CLI.
6. **Zero Dependências Externas:** Construído 100% sobre os módulos nativos do **Node.js 22 LTS** (`node:test`, `node:sqlite`, `node:util.parseArgs`, `path.matchesGlob`, `fs.globSync`).

---

## Agentes Canônicos

O kit disponibiliza oito papéis especializados com permissões estritas em [`guild/`](guild/):

| Papel | Responsabilidade | Permissões Padrão |
| :--- | :--- | :--- |
| [`scribe`](guild/scribe.md) | Triagem de issues, elaboração de especificações e decomposição em tickets técnicos. | Edição em `docs/`, `AGENTS.md` e rascunhos; shell somente leitura (`git`). |
| [`smith`](guild/smith.md) | Implementação delimitada de um ticket com ciclo TDD e correção na causa-raiz. | Edição restrita aos arquivos do escopo (`-s`); execução de comandos de teste/build. |
| [`assayer`](guild/assayer.md) | Revisão técnica em dois eixos independentes: padrões do projeto e aderência à spec. | Somente leitura de código; shell restrito a `git diff`, `git status`, `git show` e `git log -p`. |
| [`cartographer`](guild/cartographer.md) | Leitura rápida e orientação de código com evidências compactas (`caminho:linha`). | Somente leitura (`glob`, `read`); escrita e shell terminantemente proibidos. |
| [`sage`](guild/sage.md) | Pesquisa técnica em fontes primárias externas com citação de links verificáveis. | Somente leitura; navegação web permitida; escrita local bloqueada. |
| [`gremlin`](guild/gremlin.md) | Testes por mutação no código-fonte para avaliar eficácia das asserções de teste. | Edição temporária em fontes (exceto testes); restauração manual/pelo agente (wrapper não reverte automaticamente). |
| [`archivist`](guild/archivist.md) | Seleção de hunks, auditoria de escopo e criação de commits semânticos rastreados. | Edição direta proibida; operação de Git restrita aos arquivos autorizados. |
| [`warden`](guild/warden.md) | Auditoria de segurança de aplicação (AppSec), fronteiras de confiança e fluxos de dados. | Somente leitura estrita com esforço de raciocínio elevado (`high`). |

---

## Instalação

Requisitos: **PowerShell 7+**, **Git** e **Node.js 22 LTS+**.

### Instalação em um Projeto Específico

Instala a skill de governança, cria `AGENTS.md` (caso não exista no projeto de destino) e compila os agentes para o diretório nativo das CLIs escolhidas:

```powershell
# Instala para todos os runners (OpenCode, Claude Code e AGY)
pwsh -File .\install.ps1 -Project D:\caminho\do\projeto -Runner all

# Ou instala exclusivamente para o runner desejado (opencode, claude, agy)
pwsh -File .\install.ps1 -Project D:\caminho\do\projeto -Runner claude
```

> **Nota de segurança:** O modo `-Project` nunca sobrescreve arquivos automaticamente; aborta a execução se detectar colisões locais pré-existentes, preservando alterações do desenvolvedor.
> Para incluir o auditor documental de links e contratos no projeto consumidor, acrescente a flag `-AuditDocs`.

### Instalação Global (Agnóstica de CLI)

Configura uma fonte única em `~/.agent-governance-kit/` com symlinks automáticos para as pastas de skills do usuário (`~/.claude/skills/`, `~/.codex/skills/`, `~/.gemini/config/skills/`) e compila os agentes nativos em cada CLI:

```powershell
# Instalação global inicial
pwsh -File .\install.ps1 -Global -Runner all

# Atualização de instalação global existente
pwsh -File .\install.ps1 -Global -Runner all -Upgrade
```

---

## Modos de Uso

### 1. Execução de Tarefa Isolada (`run.js`)

Executa um agente sob um escopo explícito e com auditoria de diff antes e após a chamada:

```bash
# Implementação delimitada via Claude Code com escopo definido
node .claude/skills/agent-governance/scripts/run.js -d . -u claude -s "src/services/*" -a smith -- "Implementar cálculo de desconto"

# Exploração somente leitura via OpenCode com reasoning effort alto
node .claude/skills/agent-governance/scripts/run.js -d . -u opencode -R -e high -a cartographer -- "Mapear fluxo de autenticação"
```

### 2. Fila Orquestrada de Tarefas (`queue.js`)

Orquestra sequencialmente as etapas de implementação, validação e revisão para um conjunto de issues/tickets:

```bash
# Executa fila de tickets com arquivo de critérios de aceite (-A) e escopo delimitado (-s)
node .claude/skills/agent-governance/scripts/queue.js -d . -u agy -A docs/aceite.txt -s "src/*" -- docs/tickets/001.md docs/tickets/002.md
```

Consulte a [referência da fila](skill/references/queue.md) para detalhes de critérios de aceite, checagens e checkpoints.

### 3. Transpilador de Agentes (`guild-transpiler.js`)

Compila dinamicamente as definições canônicas de agentes para qualquer host suportado:

```bash
node tools/guild-transpiler.js --target . --runner all
```

---

## Estrutura do Pacote

| Diretório / Arquivo | Responsabilidade |
| :--- | :--- |
| [`docs/runners/`](docs/runners/README.md) | Documentação de integração e adaptadores para OpenCode, Claude Code, Codex, AGY e Generic. |
| [`tools/guild-transpiler.js`](tools/guild-transpiler.js) | Compilador que converte definições canônicas de agentes nos formatos específicos de cada CLI. |
| [`guild/`](guild/) | Definições canônicas em Markdown dos 8 agentes de governança. |
| [`skill/SKILL.md`](skill/SKILL.md) | Skill do orquestrador com instruções operacionais e escolha de papéis. |
| [`skill/scripts/`](skill/scripts/) | Scripts de runtime: runner com auditoria de escopo, fila transacional e controle de processos. |
| [`skill/references/models.md`](skill/references/models.md) | Guia prático de reasoning effort e estratégias perenes de prompt caching KV. |
| [`templates/AGENTS.fragment.md`](templates/AGENTS.fragment.md) | Fragmentos de configuração de `AGENTS.md` para novos repositórios. |
| [`tools/README.md`](tools/README.md) | Motor de auditoria estática de integridade documental, links e contratos. |
| [`install.ps1`](install.ps1) | Script PowerShell de instalação e distribuição segura por projeto ou global. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Diretrizes de contribuição, padrões de commit e validações. |

---

## Qualidade e Testes

O projeto adota a suíte nativa `node:test` e validação estática de integridade sem dependências externas:

```bash
# Executa todos os testes unitários (68 testes nativos)
node --test test/*.test.js

# Executa testes com relatório de cobertura nativo
node --test --experimental-test-coverage test/*.test.js

# Valida integridade documental, contratos e links
node tools/audit-docs.js
```

---

## Créditos e Referências

O Agent Governance Kit sintetiza e adapta conceitos das seguintes referências:

- **[Matt Pocock — Skills for Real Engineers](https://github.com/mattpocock/skills):** Padrões de desenvolvimento orientado a especificações (triagem, spec, tickets, TDD e revisão em dois eixos) incorporados nativamente aos agentes canônicos `scribe`, `smith` e `assayer`.
- **[RTK — Rust Token Killer](https://github.com/rtk-ai/rtk):** Estratégias de compressão de saída de terminal para mitigação de consumo de contexto em LLMs.
- **[Caveman](https://github.com/JuliusBrussee/caveman):** Comunicação técnica ultra-concisa para extensão da janela de contexto do modelo.

---

## Licença

Distribuído sob a licença MIT. Consulte [`LICENSE`](LICENSE) para mais detalhes.
