# Auditor de documentação

`audit-docs.js` verifica documentos configurados sem dependências npm. Requer
Node.js 22 ou superior; Git é necessário para `--staged`. A configuração deste
repositório fica em `audit-docs.config.js`.

O executável `audit-docs.js` carrega `audit-docs.core.js`, que usa
`audit-docs.sources.js` para ler o working tree ou o índice Git pelo mesmo
contrato (`preload`, `exists`, `isDir`, `isFile`, `exactCase`, `list`, `size` e
`read`). Ao copiar o auditor para outro projeto, mantenha os três arquivos
juntos e forneça uma configuração `audit-docs.config.js`.

```sh
node tools/audit-docs.js
node tools/audit-docs.js --staged
node tools/audit-docs.js --verbose
```

Para usar o motor sem copiá-lo, informe a raiz e a configuração do projeto:

```sh
node /caminho/agent-governance-kit/tools/audit-docs.js --project /caminho/projeto --config /caminho/projeto/tools/audit-docs.config.js
```

`--project` e `--config` aceitam caminhos absolutos ou relativos ao diretório
de execução. Sem parâmetros, a raiz é a pasta acima de `tools/` e a
configuração é `tools/audit-docs.config.js` dessa raiz. O modo padrão lê o
working tree. `--staged` lê os documentos do índice Git; a configuração ainda
é lida do working tree, portanto mantenha seu conteúdo igual ao staged quando
ela também estiver sendo alterada.

## Configuração

- `rootDocs`: arquivos Markdown na raiz, com referências a linhas físicas
  proibidas por padrão.
- `docs`: pastas permitidas, cada uma com `path`, `recursive` e
  `lineNumberRefs` (`allow` ou `forbid`). Outras pastas não são varridas.
- `blocklist`: nomes, segmentos e sufixos ignorados durante a varredura.
- `checks`: severidade `error`, `warn` ou `off` para âncoras, portabilidade
  de caminhos e links relativos que saem do repositório. Links quebrados e
  caminhos absolutos em links são sempre erros.
- `lineRefAllowlist`: exceções para documentos que permitem referência a linha.
- `targets`: contratos de código opcionais. Cada alvo declara `enabled`,
  `sourceRoot` e `files`; cada arquivo pode declarar `symbols` (nome e tipo),
  `tokens` (token, padrão e quantidade esperada) e
  `style.requireUtf8NoBom`. Sem alvos, não há inspeção de código-fonte.

O [modelo para projetos consumidores](../templates/audit-docs/audit-docs.config.js)
é instalado com `-AuditDocs` e deve ser ajustado ao repositório. O instalador
não altera `core.hooksPath` nem cria hooks. Para um hook já configurado, a
chamada apropriada é `node tools/audit-docs.js --staged`.
