# Agent Governance Kit

Pacote reutilizável de delegação, auditoria e orquestração de agentes. Esta
versão reúne uma skill, oito papéis OpenCode e os wrappers de execução
usados pela fila. Regras de domínio, endpoints, hosts, comandos de validação e
decisões de produção pertencem ao repositório que adota o pacote.

**Versão:** [`VERSION`](VERSION) · **estado:** pacote para revisão,
sem execução de fila ou agentes neste pacote.

## Conteúdo

| Caminho | Responsabilidade |
| --- | --- |
| [`skill/SKILL.md`](skill/SKILL.md) | Escolha de papéis e disciplina do orquestrador. |
| [`skill/scripts/`](skill/scripts/) | Runner com auditoria de escopo, fila, saída curta e controle de processos. |
| [`adapters/opencode/agents/`](adapters/opencode/agents/) | Oito agentes com permissões por papel, incluindo pesquisa externa e commits; o modelo vem da configuração do projeto. |
| [`adapters/`](adapters/) | Instruções de integração para OpenCode, Claude e Codex. |
| [`templates/AGENTS.fragment.md`](templates/AGENTS.fragment.md) | Ponteiro curto a adaptar no repositório consumidor. |
| [`optional/matt-pocock/`](optional/matt-pocock/README.md) | Documentação e referências do fluxo Matt Pocock (triagem, spec, tickets, implementação e revisão) incorporado aos agentes canônicos. |
| [`tools/audit-docs.js`](tools/README.md) | Auditor de links e contratos documentais, configurado para este repositório e instalável de forma opcional. |
| [`install.ps1`](install.ps1) | Instalação em um repositório Git sem substituir arquivos existentes. |

## Instalação em um projeto

Requisitos para a instalação: PowerShell 7 e Git. Para executar os wrappers:
Node.js 22 LTS ou superior, OpenCode e Git. Os wrappers e ferramentas utilizam
apenas recursos e módulos nativos do Node (incluindo `node:test`,
`node:util.parseArgs`, `path.matchesGlob`, `fs.globSync` e `node:sqlite`), com
zero dependências externas e sem etapa de `npm install`. O auditor de documentação
usa o mesmo Node. No Windows, o encerramento da árvore usa `taskkill /T /F`; em Linux/macOS,
usa o grupo de processos criado para cada comando.
Um descendente já separado do processo pai no Windows pode exigir limpeza
manual; o registro de PID do wrapper não é uma garantia de isolamento.

```powershell
pwsh -NoProfile -File D:\agent-governance-kit\install.ps1 -Project D:\caminho\do\projeto
```

O fluxo Matt Pocock (triagem, spec, tickets) já vem incorporado a
`ds-governance`, `ds-runner` e `ds-reviewer` — não é uma opção à parte.

Para incluir também o auditor de documentação, acrescente `-AuditDocs` ao
comando de instalação. Ele copia motor e configuração modelo para `tools/` do
projeto consumidor; adapte a configuração antes de usá-la. Ele usa o Node já
exigido pelos wrappers. O pacote não instala hooks automaticamente.

Neste repositório, a configuração está em `tools/audit-docs.config.js` e os
comandos estão no [guia do auditor](tools/README.md).

O instalador copia a skill para `.claude/skills/agent-governance/` e os agentes
para `.opencode/agents/`. OpenCode reconhece a skill nesse caminho; Claude
também usa a pasta de skills do projeto. O instalador cria (ou completa, se já
existir) `AGENTS.md` na raiz do projeto com um ponteiro de uma linha à skill —
Claude Code o lê nativamente quando não há `CLAUDE.md` no diretório de
trabalho ou pais, e Codex o lê sempre. O instalador não escolhe modelo, não
cria commits e recusa caminhos de destino já existentes (`AGENTS.md` é a única
exceção: ganha uma linha acrescentada, nunca é sobrescrito). Revise os
arquivos copiados antes de ativar a delegação no projeto.

As regras de etapa Matt Pocock já vêm consolidadas diretamente nos agentes
`ds-governance`, `ds-runner` e `ds-reviewer` em `adapters/opencode/agents/` —
não há arquivos duplicados nem variantes separadas. Nenhuma skill adicional é
instalada ou carregada por eles. Configure o tracker no projeto e adapte o
[fragmento](optional/matt-pocock/templates/AGENTS.fragment.md). O instalador
não atualiza uma instalação prévia; compare e migre seus arquivos manualmente.

No projeto consumidor, defina o modelo no OpenCode ou passe `GOVKIT_MODEL` ao
chamar os scripts. Registre no `AGENTS.md` os comandos de validação, áreas de
edição, exigências de ambiente e a política de produção desse projeto. A
aceitação de uma fila é um arquivo do projeto, passado por `node ds-queue.js -A`;
o pacote não inventa valores esperados.

## Instalação global (agnóstica de CLI)

```powershell
pwsh -NoProfile -File D:\agent-governance-kit\install.ps1 -Global
```

Não exige repositório Git. Copia a skill para `~/.agent-governance-kit/`
(caminho neutro, sem sinal de um host específico) — fonte única de verdade —
e sobrescreve os agentes `ds-*` em `~/.config/opencode/agents/` com a versão
deste repositório; agentes fora desse conjunto (ex.: um `ds-worker` de outra
origem) não são tocados. Cria um symlink em `~/.claude/skills/agent-governance`
e outro em `~/.codex/skills/agent-governance` apontando para a fonte, para
que a skill fique invocável nativamente (`/agent-governance` no Claude Code,
`$agent-governance` no Codex) sem duplicar arquivos. Symlink no Windows exige
Modo de desenvolvedor ativo ou elevação; se falhar, o instalador avisa mas não
aborta — a skill segue usável via referência manual ao SKILL.md. Para AGY ou
qualquer outra CLI sem convenção de skills documentada, aponte manualmente
para `~/.agent-governance-kit/SKILL.md` no lugar que essa CLI usa.

`-AuditDocs` funciona igual ao modo por-projeto. O fluxo Matt Pocock é
instalado sempre, sem switch — igual ao modo por-projeto.

Terceiro symlink em `~/.gemini/config/skills/agent-governance` cobre o AGY CLI e o
Gemini nativo do Antigravity IDE, que compartilham essa mesma raiz de configuração.

## Atualizar uma instalação global

```powershell
pwsh -NoProfile -File D:\agent-governance-kit\install.ps1 -Global -Upgrade
```

`-Upgrade` só é aceito com `-Global` — o modo `-Project` nunca sobrescreve
automaticamente (preserva mudanças locais do consumidor, ver seção acima).
Substitui a fonte da skill (`~/.agent-governance-kit/`) e o auditor de
documentação, se instalado, pela versão atual do repositório. Os agentes
`ds-*` e os symlinks já são sincronizados a cada execução do modo `-Global`,
com ou sem `-Upgrade`. Não existe script de atualização separado: o mesmo
`install.ps1` instala e atualiza, para não duplicar a lógica de colisão e
symlink em dois lugares.

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

Os comandos em `skill/scripts/` usam quatro módulos internos: `cli-options.js`
interpreta argumentos via `node:util.parseArgs`, `process-runner.js` executa e
encerra subprocessos via `Promise.withResolvers`, `governance-db.js` fornece persistência
transacional ACID com `node:sqlite`, e `git.js` unifica consultas de estado,
preparação seletiva de hunks e criação de commits protegidos por escopo com
`path.matchesGlob` e `fs.globSync`. As interfaces exportadas têm contratos JSDoc;
entradas externas críticas também são validadas durante a execução. A instalação
copia esses módulos junto com os comandos.

Para rodar a suíte de testes unitários isolada com relatório nativo de cobertura:

```bash
node --test --experimental-test-coverage test/*.test.js
```

Altere o pacote aqui, registre a mudança no [`CHANGELOG.md`](CHANGELOG.md),
incremente `VERSION` e instale a nova versão em cada projeto após revisar o
diff local. O instalador inicial não faz upgrade para preservar modificações
do projeto consumidor.

Os wrappers em Node substituem os scripts Bash do fluxo original. Ainda precisam
de validação em projetos consumidores, especialmente recuperação após
interrupção abrupta, permissões OpenCode e timeout de mutação.

## Créditos e Agradecimentos

Este projeto utiliza conceitos, convenções e adaptações inspiradas nos seguintes trabalhos de código aberto:

- **[Matt Pocock — Skills for Real Engineers](https://github.com/mattpocock/skills)** (Licença MIT):
  Inspirou os fluxos de triagem, specs, decomposição em tickets e revisão de código incorporados aos agentes `ds-governance`, `ds-runner` e `ds-reviewer`.
- **[RTK — Rust Token Killer](https://github.com/rtk-ai/rtk)** (Licença Apache 2.0):
  Regras de interceptação e compressão de saídas de terminal para redução de consumo de tokens em ferramentas CLI.
- **[Caveman](https://github.com/JuliusBrussee/caveman)** (Licença MIT):
  Conceito e convenções de comunicação ultra-concisa para preservação de janela de contexto em interações com LLMs.

## Licença

Distribuído sob a licença MIT. Consulte [LICENSE](LICENSE) para mais detalhes.
