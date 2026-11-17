# Oathbound

Conjunto portátil de governança, regras de execução, subagentes especializados, guardrails determinísticos em hooks, trilha de auditoria e skills de engenharia para assistentes de IA baseados em CLI.

- **Versão atual:** `0.50.0-alpha.3` (alpha / incompleto, com protótipos em calibração).
- **Stack:** TypeScript e JavaScript nativos em **Node.js 24+** (type stripping nativo, sem etapa de build e sem dependências externas).
- **Alvos suportados:** **Claude Code** (`claude`) e **Antigravity CLI** (`agy` — nota: ferramenta independente, não se refere ao Gemini CLI do Google). O suporte ao **Codex** encontra-se planejado para entregas futuras.

---

## O que o projeto faz

1. **Regras de Governança:** Configurações padronizadas para `CLAUDE.md` e `GEMINI.md`, mantendo separação entre o fluxo comum do pacote e as exceções locais dos projetos consumidores.
2. **Subagentes Especializados:** Orquestrador principal complementado por 7 papéis: `scout`, `scholar`, `scribe`, `smith`, `assayer`, `sentinel` e `tester`.
3. **Skills de Engenharia:** Conjunto de 6 skills genéricas: `diagnosing-bugs`, `grill-me`, `migration`, `safe-refactor`, `surgical-patch` e `verify-and-stop`.
4. **Hooks Determinísticos:** Mecanismos de proteção em tempo de execução incluindo `agent-audit`, `readonly-guard`, `read-size-guard`, `destructive-guard` e `rtk-hook`.
5. **Telemetria, Relatórios e Protótipos:** Inclui `audit-resumo`, módulos de custo e dificuldade (`test/custo`, `test/dificuldade`) e protótipos inativos com Jev (`claude/hooks/skill-suggest.js`, `test/jev/revisar-teste.js`) documentados nos ADRs [docs/adr/0001-sugestao-de-skill-com-jev.md](docs/adr/0001-sugestao-de-skill-com-jev.md), [docs/adr/0002-roteamento-de-subagentes-com-jev.md](docs/adr/0002-roteamento-de-subagentes-com-jev.md) e [docs/adr/0003-jev-revisao-de-testes.md](docs/adr/0003-jev-revisao-de-testes.md).

---

## Instalação

O Oathbound pode ser instalado como plugin nativo ou através do instalador em Node.js.

### 1. Plugin Nativo
Os manifestos de origem ficam separados por harness: [Claude Code](.claude-plugin/plugin.json), com seu [marketplace](.claude-plugin/marketplace.json), e [Antigravity](.antigravity-plugin/plugin.json). Para gerar pacotes nativos independentes, informe diretórios novos dentro do repositório:

```sh
node tools/build-plugin.cjs claude dist/claude
node tools/build-plugin.cjs agy dist/agy
claude plugin validate dist/claude
agy plugin validate dist/agy
```

Crie `dist/` antes de gerar os pacotes. O gerador não sobrescreve destinos existentes. Cada pacote contém seis skills, oito agentes e seus hooks. Os hooks requerem Node.js e RTK disponíveis no ambiente. O instalador abaixo configura também permissões e configurações globais ou de projeto, fora do escopo dos plugins nativos.

### 2. Instalador de Projeto e Ambiente (`install.ts`)
Para gerenciar a instalação e atualização em ambientes globais ou diretórios de projeto específicos, execute:

```sh
node tools/install.ts [opções]
```

**Opções suportadas:**
- `--global`: Instala globalmente em `~/.claude/`, `~/.gemini/`, `.oathbound/global-manifest.json` e `skillOverrides`.
- `--project <dir>`: Instala em diretório específico gerando `.claude/`, `.agents/`, `.oathbound/manifest.json`, `.agents/skills.json` e `_disabled/`.
- `--runner all|claude|agy`: Seleciona o runner alvo.
- `--upgrade`: Atualiza uma instalação existente apresentando o diff de alterações.
- `--statusline`: Configura a barra de status.
- `--audit-docs`: Instala a configuração de auditoria de documentação (exclusivo para projetos).
- `--no-dedupe-skills`: Desativa a desduplicação automática de skills duplicadas.

O instalador valida manifestos SHA-256 (`.oathbound/manifest.json`), preserva alterações locais e desativa skills duplicadas sem utilizar symlinks (através de marcação e mapeamento em `_disabled` / `skills.json`).

No Antigravity, as instruções globais são instaladas em `~/.gemini/GEMINI.md`. Arquivos existentes nesse destino e no antigo `~/.gemini/config/GEMINI.md` são preservados; compare-os e migre suas alterações manualmente, se necessário.

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
- [Como Contribuir](CONTRIBUTING.md)
- [Instruções do Pacote](AGENTS.md)
- [Changelog](CHANGELOG.md)
- [Guia de Ferramentas](tools/README.md)
- [Licença](LICENSE)
