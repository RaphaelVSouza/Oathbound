# Oathbound

Conjunto portátil de governança, regras de execução, subagentes especializados, guardrails determinísticos em hooks, trilha de auditoria e skills de engenharia para assistentes de IA baseados em CLI.

- **Estágio:** alpha / incompleto, com protótipos em calibração (versão em [VERSION](VERSION) e histórico em [CHANGELOG.md](CHANGELOG.md)).
- **Stack:** TypeScript e JavaScript nativos em **Node.js 24+** (type stripping nativo, sem etapa de build e sem dependências externas).
- **Alvos suportados:** **Claude Code** (`claude`) e **Antigravity CLI** (`agy` — nota: ferramenta independente, não se refere ao Gemini CLI do Google). O suporte ao **Codex** encontra-se planejado para entregas futuras.

---

## O que o projeto faz

1. **Regras de Governança:** O orquestrador aplica o fluxo comum do pacote. Cada projeto define suas exceções locais.
2. **Subagentes Especializados:** Orquestrador principal complementado por 7 papéis: `scout`, `scholar`, `scribe`, `smith`, `assayer`, `sentinel` e `tester`.
3. **Skills de Engenharia:** Conjunto de 6 skills genéricas: `diagnosing-bugs`, `grill-me`, `migration`, `safe-refactor`, `surgical-patch` e `verify-and-stop`.
4. **Hooks Determinísticos:** Mecanismos de proteção em tempo de execução incluindo `agent-audit`, `readonly-guard`, `read-size-guard`, `destructive-guard` e `rtk-hook`.
5. **Telemetria, Relatórios e Protótipos:** Inclui `audit-resumo`, módulos de custo e dificuldade (`test/custo`, `test/dificuldade`) e protótipos inativos com Jev (`claude/hooks/skill-suggest.js`, `test/jev/revisar-teste.js`) documentados nos ADRs [docs/adr/0001-sugestao-de-skill-com-jev.md](docs/adr/0001-sugestao-de-skill-com-jev.md), [docs/adr/0002-roteamento-de-subagentes-com-jev.md](docs/adr/0002-roteamento-de-subagentes-com-jev.md) e [docs/adr/0003-jev-revisao-de-testes.md](docs/adr/0003-jev-revisao-de-testes.md).

---

## Instalação

O Oathbound pode ser instalado como plugin nativo ou através do instalador em Node.js.

### 1. Plugin Nativo

No Claude Code, instale pelo marketplace com `/plugin install oathbound --marketplace RaphaelVSouza/Oathbound`.

Se já usa o marketplace, atualize-o e recarregue o plugin pelo painel `/plugin`. Se usa o pacote de release, gere ou extraia a nova versão em outro diretório e aponte o Claude para ele.

Para iniciar uma sessão Oathbound no Claude, use `claude --agent oathbound:orquestrador`. No agy, use `agy agents` para conferir os agentes disponíveis e selecione o orquestrador com `agy --agent orquestrador`.

Inicie a CLI normalmente para manter o agente padrão. Na sessão, peça pelo subagente desejado, por exemplo, `oathbound:scout` no plugin Claude ou `scout` no agy.

No plugin Claude, o hook aplica guards pelo identificador `oathbound:<agente>` e registra bloqueios. Logs novos usam modo `0600` em Unix e herdam as permissões do diretório no Windows. Logs antigos podem conter detalhes gravados por versões anteriores.
Os manifestos de origem ficam separados por harness: [Claude Code](.claude-plugin/plugin.json), com seu [marketplace](.claude-plugin/marketplace.json), e [Antigravity](.antigravity-plugin/plugin.json). Para gerar pacotes nativos independentes, informe diretórios novos dentro do repositório:

```sh
node tools/build-plugin.cjs claude dist/claude
node tools/build-plugin.cjs agy dist/agy
claude plugin validate dist/claude
agy plugin validate dist/agy
```

Crie `dist/` antes de gerar os pacotes. O gerador exige destinos novos. Cada pacote contém seis skills e oito agentes. O pacote Claude inclui os guards por agente, que requerem Node.js.

### 2. Instalador de Projeto e Ambiente (`install.ts`)

Na migração de manifestos antigos, o instalador conserva arquivos divergentes e mostra o diff para revisão. A limpeza automática exige registro de origem no manifesto atual.

Para agentes locais preservados de instalações antigas, revise o diff do instalador e aplique a delimitação dos caminhos dos hooks.

Gerencie skills do plugin pelo comando `/plugin` do Claude Code. Use `--no-dedupe-skills` para conservar as cópias locais durante a instalação.
Para gerenciar a instalação e atualização em ambientes globais ou diretórios de projeto específicos, execute:

```sh
node tools/install.ts [opções]
```

**Opções suportadas:**
- `--global`: Instala agentes em `~/.claude/agents/` e `~/.gemini/config/agents/`. O manifesto e os scripts usados pelos guards dos agentes Claude ficam em `~/.oathbound/`.
- `--project <dir>`: Instala em diretório específico gerando `.claude/`, `.agents/`, `.oathbound/manifest.json`, `.agents/skills.json` e `_disabled/`.
- `--runner all|claude|agy`: Seleciona o runner alvo.
- `--upgrade`: Atualiza uma instalação existente apresentando o diff de alterações.
- `--statusline`: Configura a barra de status do Claude em instalações de projeto.
- `--audit-docs`: Instala a configuração de auditoria de documentação (exclusivo para projetos).
- `--no-dedupe-skills`: Desativa a desduplicação automática de skills duplicadas.

O instalador valida manifestos SHA-256 (`.oathbound/manifest.json`), preserva alterações locais e desativa skills duplicadas sem utilizar symlinks (através de marcação e mapeamento em `_disabled` / `skills.json`).

Na instalação avulsa do Claude, use `claude --agent orquestrador`. O instalador global preserva instruções, configurações, hooks compartilhados e skills existentes. Se uma versão anterior registrou regras ou hooks globais do Oathbound, revise esses registros antes de removê-los manualmente.

O hook RTK usa apenas `PreToolUse`. Remova manualmente registros `Stop` antigos do `rtk-hook.js` em instalações existentes para evitar loops de encerramento.

---

## Validação e Qualidade

Para rodar os testes unitários utilizando os recursos nativos do Node.js 24+:
```sh
node --test --experimental-test-coverage test/*.test.ts test/*/*.test.js
```

Para executar o auditor de documentação (integridade de links, âncoras e portabilidade):
```sh
node tools/audit-docs.ts
node tools/audit-docs.ts --staged
```

Consulte também os documentos de referência:
- [Referências oficiais por harness](docs/README.md)
- [Como Contribuir](CONTRIBUTING.md)
- [Instruções do Pacote](AGENTS.md)
- [Changelog](CHANGELOG.md)
- [Guia de Ferramentas](tools/README.md)
- [Licença](LICENSE)
