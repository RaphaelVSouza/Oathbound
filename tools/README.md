# Auditor de documentação e instalador

## Auditor de Documentação (`audit-docs.ts`)

`audit-docs.ts` verifica documentos configurados sem dependências npm. Requer
Node.js 24 ou superior; Git é necessário para `--staged`. A configuração deste
repositório fica em `audit-docs.config.js`.

```sh
node tools/audit-docs.ts
node tools/audit-docs.ts --staged
node tools/audit-docs.ts --verbose
```

Para usar o motor via terminal informando projeto e configuração externos:
```sh
node tools/audit-docs.ts --project <dir> --config <dir>/tools/audit-docs.config.js
```

## Instalador (`install.ts`)

O instalador copia o Oathbound para ambientes locais ou projetos, preservando alterações e desativando duplicidades.

```sh
node tools/install.ts [opções]
```

Opções suportadas:
- `--global`: Instala globalmente (`~/.claude` e `~/.gemini`).
- `--project <dir>`: Instala em um diretório de projeto específico.
- `--runner all|claude|agy`: Seleciona o runner alvo.
- `--upgrade`: Atualiza uma instalação existente apresentando o diff.
- `--statusline`: Configura a barra de status.
- `--audit-docs`: Instala a configuração de auditoria de documentação.
- `--no-dedupe-skills`: Desativa a desduplicação automática de skills duplicadas.

O instalador valida manifestos SHA-256 e desativa skills duplicadas sem utilizar symlinks.
As instruções globais do Antigravity ficam em `~/.gemini/GEMINI.md`. O instalador preserva arquivos existentes nesse destino e no antigo `~/.gemini/config/GEMINI.md`; alterações no caminho antigo devem ser migradas manualmente, se necessário.

## Pacotes de plugin (`build-plugin.cjs`)

Crie o diretório pai e execute `node tools/build-plugin.cjs claude <destino>` ou `node tools/build-plugin.cjs agy <destino>`. O destino deve ser novo e estar dentro do repositório. O gerador não sobrescreve arquivos existentes e injeta a versão de `VERSION` nos manifestos gerados. Valide com `claude plugin validate <destino>` ou `agy plugin validate <destino>`.

## Atualização de versão (`bump-version.cjs`)

Execute `node tools/bump-version.cjs <semver>` para atualizar `VERSION`, `.antigravity-plugin/plugin.json` e `.claude-plugin/plugin.json` juntos. Use `--commit` para criar o commit de release e `--tag` para criar também a tag anotada `v<semver>`.

Para ativar a validação automática local antes de cada commit, configure os hooks versionados:
```sh
git config core.hooksPath .githooks
```
