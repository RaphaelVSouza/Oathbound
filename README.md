# Agent Governance Kit

Pacote reutilizável de delegação, auditoria e orquestração de agentes. Esta
versão reúne uma skill, sete papéis OpenCode e os wrappers de execução
usados pela fila. Regras de domínio, endpoints, hosts, comandos de validação e
decisões de produção pertencem ao repositório que adota o pacote.

**Versão:** [`VERSION`](VERSION) · **estado:** pacote para revisão,
sem execução de fila ou agentes neste pacote.

## Conteúdo

| Caminho | Responsabilidade |
| --- | --- |
| [`skill/SKILL.md`](skill/SKILL.md) | Escolha de papéis e disciplina do orquestrador. |
| [`skill/scripts/`](skill/scripts/) | Runner com auditoria de escopo, fila, saída curta e controle de processos. |
| [`adapters/opencode/agents/`](adapters/opencode/agents/) | Sete agentes com permissões por papel, incluindo pesquisa externa e commits; o modelo vem da configuração do projeto. |
| [`adapters/`](adapters/) | Instruções de integração para OpenCode, Claude e Codex. |
| [`templates/AGENTS.fragment.md`](templates/AGENTS.fragment.md) | Ponteiro curto a adaptar no repositório consumidor. |
| [`optional/matt-pocock/`](optional/matt-pocock/README.md) | Variantes opcionais de três agentes com triagem, spec, tickets, implementação e revisão incorporadas. |
| [`tools/audit-docs.js`](tools/README.md) | Auditor de links e contratos documentais, configurado para este repositório e instalável de forma opcional. |
| [`install.ps1`](install.ps1) | Instalação em um repositório Git sem substituir arquivos existentes. |

## Instalação em um projeto

Requisitos para a instalação: PowerShell 7 e Git. Para executar os wrappers:
Node.js 22 ou superior, OpenCode e Git. Os wrappers usam apenas módulos nativos
do Node, sem `npm install`. O auditor de documentação usa o mesmo Node.
No Windows, o encerramento da árvore usa `taskkill /T /F`; em Linux/macOS,
usa o grupo de processos criado para cada comando.
Um descendente já separado do processo pai no Windows pode exigir limpeza
manual; o registro de PID do wrapper não é uma garantia de isolamento.

```powershell
pwsh -NoProfile -File D:\agent-governance-kit\install.ps1 -Project D:\caminho\do\projeto
```

Para incluir o fluxo opcional:

```powershell
pwsh -NoProfile -File D:\agent-governance-kit\install.ps1 -Project D:\caminho\do\projeto -MattPocock
```

Para incluir também o auditor de documentação, acrescente `-AuditDocs` ao
comando de instalação. Ele copia motor e configuração modelo para `tools/` do
projeto consumidor; adapte a configuração antes de usá-la. Ele usa o Node já
exigido pelos wrappers. O pacote não instala hooks automaticamente.

Neste repositório, a configuração está em `tools/audit-docs.config.js` e os
comandos estão no [guia do auditor](tools/README.md).

O instalador copia a skill para `.claude/skills/agent-governance/` e os agentes
para `.opencode/agents/`. OpenCode reconhece a skill nesse caminho; Claude
também usa a pasta de skills do projeto. Para Codex, adicione ao `AGENTS.md`
do projeto um ponteiro à skill, usando o [fragmento](templates/AGENTS.fragment.md).
O instalador não modifica `AGENTS.md`, não escolhe modelo, não cria commits e
recusa caminhos de destino já existentes. Revise os arquivos copiados antes de
ativar a delegação no projeto.

Com `-MattPocock`, instala as variantes de `ds-governance`, `ds-runner` e
`ds-reviewer` com regras de etapa nos próprios agentes. Nenhuma skill adicional
é instalada ou carregada por eles. Configure o tracker no projeto e adapte o
[fragmento opcional](optional/matt-pocock/templates/AGENTS.fragment.md). O
instalador não atualiza uma instalação prévia; compare e migre seus arquivos
antes de tentar instalar outra variante.

No projeto consumidor, defina o modelo no OpenCode ou passe `GOVKIT_MODEL` ao
chamar os scripts. Registre no `AGENTS.md` os comandos de validação, áreas de
edição, exigências de ambiente e a política de produção desse projeto. A
aceitação de uma fila é um arquivo do projeto, passado por `node ds-queue.js -A`;
o pacote não inventa valores esperados.

## Contrato de execução

- `node skill/scripts/ds-run.js` exige `-d` (repositório) e uma mensagem. Para agentes de leitura,
  use `-R` sem `-s`; para agentes que editam, use ao menos um `-s` (glob).
  Registra a sessão e detecta mudanças durante a chamada. Exit `3` informa
  mudança incompatível com o modo e não reverte arquivos.
- `node skill/scripts/ds-queue.js` executa runner, checagens `-C` opcionais e reviewer por issue.
  Correção de achados, mutação, commits e atualização documental dependem do
  orquestrador. Consulte a [referência da fila](skill/references/queue.md).
- `ds-committer` escolhe hunks e grupos, prepara o índice e cria commits apenas
  para arquivos autorizados. Consulte [commits.md](skill/references/commits.md).
  O wrapper também detecta mudanças no índice e arquivos incluídos em commits.
- `ds-run.js -S <id> -Q status|bloqueios|evidencias|entrega` consulta uma sessão
  entre etapas com escrita e shell bloqueados. Veja os
  [comandos prontos](skill/references/feedback.md).
- `node skill/scripts/quiet.js -t 600 -- <comando>` guarda a saída completa em
  log e imprime um recibo curto. `node skill/scripts/ds-kill.js -d <repo> -l`
  lista PIDs registrados; `--orphans` e `--all` encerram as árvores registradas.
- `ds-mutant` altera o fonte temporariamente. Rode sozinho e confira hashes e
  worktree após a chamada. O wrapper do pacote não restaura backups de
  mutação automaticamente.
- Permissões por padrão textual são guardas operacionais, não isolamento de
  segurança. O orquestrador revisa diff, status e logs decisivos.

## Evolução e limites

Os comandos em `skill/scripts/` usam três módulos internos: `cli-options.js`
interpreta argumentos, `process-runner.js` executa e encerra subprocessos, e
`git.js` unifica consultas de estado, preparação seletiva de hunks e criação de commits protegidos por escopo. As interfaces exportadas têm
contratos JSDoc; entradas externas críticas também são validadas durante a
execução. A instalação copia esses módulos junto com os comandos.

Altere o pacote aqui, registre a mudança no [`CHANGELOG.md`](CHANGELOG.md),
incremente `VERSION` e instale a nova versão em cada projeto após revisar o
diff local. O instalador inicial não faz upgrade para preservar modificações
do projeto consumidor.

Os wrappers em Node substituem os scripts Bash do fluxo original. Ainda precisam
de validação em projetos consumidores, especialmente recuperação após
interrupção abrupta, permissões OpenCode e timeout de mutação.
