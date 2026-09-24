# Agent Governance Kit

Pacote reutilizável de delegação, auditoria e orquestração de agentes. Esta
versão reúne uma skill, seis papéis OpenCode e os wrappers de execução
usados pela fila. Regras de domínio, endpoints, hosts, comandos de validação e
decisões de produção pertencem ao repositório que adota o pacote.

**Versão:** [`VERSION`](VERSION) · **estado:** pacote para revisão,
sem execução de fila ou agentes neste pacote.

## Conteúdo

| Caminho | Responsabilidade |
| --- | --- |
| [`skill/SKILL.md`](skill/SKILL.md) | Escolha de papéis e disciplina do orquestrador. |
| [`skill/scripts/`](skill/scripts/) | Runner com auditoria de escopo, fila, saída curta e controle de processos. |
| [`adapters/opencode/agents/`](adapters/opencode/agents/) | Seis agentes com permissões por papel; o modelo vem da configuração do projeto. |
| [`adapters/`](adapters/) | Instruções de integração para OpenCode, Claude e Codex. |
| [`templates/AGENTS.fragment.md`](templates/AGENTS.fragment.md) | Ponteiro curto a adaptar no repositório consumidor. |
| [`optional/matt-pocock/`](optional/matt-pocock/README.md) | Variantes opcionais de três agentes com triagem, spec, tickets, implementação e revisão incorporadas. |
| [`install.ps1`](install.ps1) | Instalação em um repositório Git sem substituir arquivos existentes. |

## Instalação em um projeto

Requisitos para a instalação: PowerShell 7 e Git. Para executar os scripts:
OpenCode, Bash, Git e utilitários Unix usuais. A limpeza de processos no
Windows usa `taskkill` quando disponível; em outros sistemas, a limpeza de
órfãos ainda precisa de adaptação específica.

```powershell
pwsh -NoProfile -File D:\agent-governance-kit\install.ps1 -Project D:\caminho\do\projeto
```

Para incluir o fluxo opcional:

```powershell
pwsh -NoProfile -File D:\agent-governance-kit\install.ps1 -Project D:\caminho\do\projeto -MattPocock
```

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
aceitação de uma fila é um arquivo do projeto, passado por `ds-queue.sh -A`;
o pacote não inventa valores esperados.

## Contrato de execução

- `ds-run.sh` exige `-d` (repositório), ao menos um `-s` (glob de arquivos) e
  uma mensagem. Detecta mudanças fora do escopo após a chamada; exit `3`
  informa a ocorrência e não reverte arquivos.
- `ds-queue.sh` executa runner, checagens `-C` opcionais e reviewer por issue.
  Correção de achados, mutação, commits e atualização documental dependem do
  orquestrador. Consulte a [referência da fila](skill/references/queue.md).
- `ds-mutant` altera o fonte temporariamente. Rode sozinho e confira hashes e
  worktree após a chamada. O wrapper do pacote não restaura backups de
  mutação automaticamente.
- Permissões por padrão textual são guardas operacionais, não isolamento de
  segurança. O orquestrador revisa diff, status e logs decisivos.

## Evolução e limites

Altere o pacote aqui, registre a mudança no [`CHANGELOG.md`](CHANGELOG.md),
incremente `VERSION` e instale a nova versão em cada projeto após revisar o
diff local. O instalador inicial não faz upgrade para preservar modificações
do projeto consumidor.

Os scripts foram adaptados do fluxo local original. Ainda precisam de
validação em projetos consumidores, especialmente retenção de processos em
Linux/macOS, permissões OpenCode e recuperação após timeout de mutação.
