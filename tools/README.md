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
