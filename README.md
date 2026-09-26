# Oathbound

> Camada de governança determinística, auditoria e orquestração multi-agente para CLIs de código com LLMs.

[![Versão](https://img.shields.io/badge/versão-0.23.1-blue.svg)](VERSION)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24.0.0-green.svg)](https://nodejs.org/)
[![Dependências](https://img.shields.io/badge/dependências-zero-brightgreen.svg)](README.md)
[![Licença](https://img.shields.io/badge/licença-MIT-blue.svg)](LICENSE)

O **Oathbound** governa CLIs de código já existentes — **OpenCode**, **Claude Code**, **Codex** e **AGY (Antigravity CLI)** — com papéis juramentados e auditoria de escopo pelo Git. Ele não chama modelos diretamente: delega a execução às CLIs, audita mutações contra o escopo delimitado via snapshots do Git, gerencia filas de tarefas com transações ACID em SQLite e organiza prefixos de prompts para maximizar o reaproveitamento de **prompt caching (KV cache)**.

---

## Por que o kit existe?

Agentes de código com LLMs frequentemente:
- Alteram arquivos além da tarefa designada, gerando quebras e drift acidental.
- Permanecem travados no ecossistema proprietário de uma única CLI.
- Re-injetam todo o contexto a cada turno, descartando o reaproveitamento de cache KV de prefixo.
- Criam commits genéricos ou desordenados sem rastreabilidade.

O **Oathbound** resolve esses problemas através de:

1. **Executores Agnósticos (Runners):** Suporte nativo e intercambiável para **OpenCode**, **Claude Code**, **OpenAI Codex**, **Antigravity CLI (AGY)** e comandos customizados via contrato `RunnerAdapter`.
2. **Auditoria Determinística de Escopo:** O kit não cria virtualização de filesystem nem isolamento de kernel; a governança apoia-se em restrições de ferramentas e prompt guards, combinados com auditoria factual de snapshot Git antes e depois de cada chamada. Qualquer mutação fora dos globs autorizados (`-s`) é detectada no diff e encerra com código de saída `3` (sem descartar alterações automaticamente, preservando evidências para conferência).
3. **Fila Sequencial com Checkpoints Persistentes (`queue`):** Execução sequencial de tarefas com persistência de estágio em `node:sqlite` (`queue_state`) e arquivos de estado, permitindo retomar de onde parou sem reprocessar tickets concluídos. `OathboundStore.transaction()` oferece transações assíncronas para operações agrupadas.
4. **Alinhamento para Prompt Caching KV:** Prompt engineering ordenado estritamente do estático para o volátil (instruções do papel → regras do repositório → guardrails de escopo → dados voláteis da tarefa), garantindo prefixos byte-exact estáveis.
5. **Transpilação Nativa de Agentes:** Conversor automático que traduz permissões granulares canônicas em whitelists de ferramentas (`tools`) para Claude Code e definições para AGY CLI.
6. **Zero Dependências Externas:** Construído 100% sobre os módulos nativos do **Node.js 24 LTS** (`node:test`, `node:sqlite`, `node:util.parseArgs`, `path.matchesGlob`, `fs.globSync`).

---

## A guilda

O Oathbound distribui o trabalho entre dez papéis juramentados em [`guild/`](guild/) — o `oathkeeper`, oito especialistas e o `herald`:

| Ofício | Função | Permissões principais |
| :--- | :--- | :--- |
| [`oathkeeper`](guild/oathkeeper.md) | Orquestra a guilda: escolhe o papel, entrega a tarefa fechada, confere diff/recibo e decide o avanço. Não edita nem commita. | Somente leitura; shell restrito a `git status/diff/log/show` e aos scripts de `run.js`, `queue.js`, `kill.js`, `quiet.js`; não é delegável. |
| [`surveyor`](guild/surveyor.md) | Mapeia o código e responde com `arquivo:linha`. | Somente leitura (`glob`, `read`); escrita e shell proibidos. |
| [`scholar`](guild/scholar.md) | Pesquisa em fontes externas primárias. | Somente leitura; navegação web permitida; escrita local bloqueada. |
| [`scribe`](guild/scribe.md) | Specs, tickets, decisões e instruções de agentes, antes da implementação. | Edição em `docs/`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` e `.scratch/`; shell somente leitura (`git`). |
| [`smith`](guild/smith.md) | Implementação delimitada de um ticket com ciclo TDD e correção na causa-raiz. | Edição restrita aos arquivos do escopo (`-s`); comandos de teste/build; Git que altera histórico bloqueado. |
| [`assayer`](guild/assayer.md) | Revisão técnica em dois eixos independentes: padrões do projeto e aderência à spec. | Somente leitura; shell restrito a `git diff`, `git status`, `git show` e `git log -p`. |
| [`herald`](guild/herald.md) | README, CHANGELOG e texto do PR, com base em commits, diff e saídas de comando. | Edição só em `README.md`, `CHANGELOG.md` e `docs/`; shell somente leitura (`git`). |
| [`archivist`](guild/archivist.md) | Seleção de hunks, auditoria de escopo e criação de commits semânticos rastreados. | Edição direta proibida; Git restrito aos arquivos autorizados (`git-stage.js`, `git-commit.js`). |
| [`breaker`](guild/breaker.md) | Testes de mutação: quebra o código de propósito para medir se os testes percebem. | Edição temporária em fontes (exceto testes); restauração conferida por hash; Git destrutivo bloqueado. |
| [`warden`](guild/warden.md) | Auditoria de segurança de aplicação (AppSec), fronteiras de confiança e fluxos de dados. | Somente leitura estrita com esforço de raciocínio elevado (`high`). |

---

## Demonstração
Execução real contra [`examples/invoice/`](examples/invoice/). Recibo f.2 — script que
ignora o escopo autorizado (`docs/*`), detectado pela auditoria de diff do Oathbound:
````text
agente escreveu src/probe.js

── oathbound run: agente=smith runner=generic modo=edicao modelo=configuração do projeto exit=0 tempo=4s sessao=oathbound-smith-12652-1790377599174
── alterados na chamada (1):
   src/probe.js
── FORA DO ESCOPO (1) — confira autoria:
   ! src/probe.js
-- exit_processo=3 duracao=9s
````
Recibos completos em [`docs/demo.md`](docs/demo.md).

---

## Instalação

Requisitos: **PowerShell 7+**, **Git** e **Node.js 24 LTS+**.

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

Configura uma fonte única em `~/.oathbound/` com symlinks automáticos para as pastas de skills do usuário (`~/.claude/skills/`, `~/.codex/skills/`, `~/.gemini/config/skills/`) e compila os agentes nativos em cada CLI:

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
node .claude/skills/oathbound/scripts/run.js -d . -u claude -s "src/services/*" -a smith -- "Implementar cálculo de desconto"

# Exploração somente leitura via OpenCode com reasoning effort alto
node .claude/skills/oathbound/scripts/run.js -d . -u opencode -R -e high -a surveyor -- "Mapear fluxo de autenticação"
```

### 2. Fila Orquestrada de Tarefas (`queue.js`)

Orquestra sequencialmente as etapas de implementação, validação e revisão para um conjunto de issues/tickets:

```bash
# Executa fila de tickets com arquivo de critérios de aceite (-A) e escopo delimitado (-s)
node .claude/skills/oathbound/scripts/queue.js -d . -u agy -A docs/aceite.txt -s "src/*" -- docs/tickets/001.md docs/tickets/002.md
```

Consulte a [referência da fila](skill/references/queue.md) para detalhes de critérios de aceite, checagens e checkpoints.

### 3. Transpilador de Agentes (`guild-transpiler.js`)

Compila dinamicamente as definições canônicas de agentes para qualquer host suportado:

```bash
node tools/guild-transpiler.js --target . --runner all
```

---

## Variáveis de Ambiente

Os wrappers leem variáveis `OATHBOUND_*` para substituir opcionalmente `-u`, `-m`, `-e`, `-a` e os guardrails de escopo:

| Variável | Efeito |
| :--- | :--- |
| `OATHBOUND_RUNNER` | Runner padrão (`opencode`, `claude`, `codex`, `agy`, `generic`). |
| `OATHBOUND_MODEL` | Modelo repassado ao runner (`-m`). |
| `OATHBOUND_EFFORT` | Esforço de raciocínio (`low`, `medium`, `high`). |
| `OATHBOUND_AGENT_DIR` | Diretório alternativo de arquivos de agente. |
| `OATHBOUND_GENERIC_CMD` | Comando usado pelo runner `generic`. |

---

## Como o Oathbound se compara

Frameworks como **CrewAI**, **AutoGen** e **LangGraph** orquestram chamadas a modelos: montam agentes, conectam ferramentas e governam o fluxo de inferência dentro da aplicação.

O Oathbound parte de outro ponto: governa CLIs de código já existentes (OpenCode, Claude Code, Codex, AGY), que continuam a conversar com seus próprios provedores e modelos. O que o Oathbound acrescenta é a moldura de escopo auditada no Git — papéis juramentados, globs autorizados, auditoria de diff antes e depois de cada chamada e uma fila transacional com checkpoints.

As duas abordagens resolvem problemas diferentes e podem coexistir. Este documento apenas descreve o recorte do Oathbound; não emite juízo de valor sobre os outros projetos.

---

## Estrutura do Pacote

| Diretório / Arquivo | Responsabilidade |
| :--- | :--- |
| [`docs/runners/`](docs/runners/README.md) | Documentação de integração e adaptadores para OpenCode, Claude Code, Codex, AGY e Generic. |
| [`tools/guild-transpiler.js`](tools/guild-transpiler.js) | Compilador que converte definições canônicas de agentes nos formatos específicos de cada CLI. |
| [`guild/`](guild/) | Definições canônicas em Markdown dos dez agentes da guilda. |
| [`skill/SKILL.md`](skill/SKILL.md) | Skill do oathkeeper com instruções operacionais e escolha de papéis. |
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

Lacunas conhecidas, com evidência e status, em [`docs/gaps.md`](docs/gaps.md).

---

## Créditos e Referências

O Oathbound sintetiza e adapta conceitos das seguintes referências:

- **[Matt Pocock — Skills for Real Engineers](https://github.com/mattpocock/skills):** Padrões de desenvolvimento orientado a especificações (triagem, spec, tickets, TDD e revisão em dois eixos) incorporados nativamente aos agentes canônicos `scribe`, `smith` e `assayer`.
- **[RTK — Rust Token Killer](https://github.com/rtk-ai/rtk):** Estratégias de compressão de saída de terminal para mitigação de consumo de contexto em LLMs.
- **[Caveman](https://github.com/JuliusBrussee/caveman):** Comunicação técnica ultra-concisa para extensão da janela de contexto do modelo.

---

## Licença

Distribuído sob a licença MIT. Consulte [`LICENSE`](LICENSE) para mais detalhes.
