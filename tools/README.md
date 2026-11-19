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
- `--global`: Instala agentes do Claude e do agy e guarda o manifesto e os guards dos agentes Claude em `~/.oathbound/`.
- `--project <dir>`: Instala em um diretório de projeto específico.
- `--runner all|claude|agy`: Seleciona o runner alvo.
- `--upgrade`: Atualiza uma instalação existente apresentando o diff.
- `--statusline`: Configura a barra de status.
- `--audit-docs`: Instala a configuração de auditoria de documentação.
- `--no-dedupe-skills`: Desativa a desduplicação automática de skills duplicadas.

O instalador valida manifestos SHA-256 e desativa skills duplicadas sem utilizar symlinks.
O instalador global preserva instruções, configurações, hooks compartilhados e skills existentes. Use `--statusline` na instalação local do Claude.
Quando um binário nativo `oathbound-hook` está disponível em `native/bin/oathbound-hook-<platform>-<arch>[.exe]` ou informado via `OATHBOUND_NATIVE_BIN`, o instalador copia o binário e aponta `agent-audit` e `rtk-hook` para ele; na ausência do binário, mantém o fallback automático para os scripts `.js`.

## Benchmark de hooks (`bench-hooks.cjs`)

Mede latência (p50/p95/min/max) dos hooks `plugin-agent-guard`, `agent-audit` e `rtk-hook` em Node.js e, opcionalmente, no binário nativo Rust:

```sh
node tools/bench-hooks.cjs --runs=15
node tools/bench-hooks.cjs --runs=15 --bin=native/oathbound-hook/target/release/oathbound-hook.exe
```

## Pacotes de plugin (`build-plugin.cjs`)

Crie o diretório pai e execute `node tools/build-plugin.cjs claude <destino>` ou `node tools/build-plugin.cjs agy <destino>`. O destino deve ser novo e estar dentro do repositório. O gerador não sobrescreve arquivos existentes e injeta a versão de `VERSION` nos manifestos gerados. Valide com `claude plugin validate <destino>` ou `agy plugin validate <destino>`.

## Smoke tests pagos do orquestrador Claude

Execute apenas o caso necessário após mudanças relevantes no orquestrador,
na delegação ou no guard do plugin. Estes testes usam a conta autenticada
da CLI e consomem cota. A suíte principal e o CI seguem com validações locais.

```sh
node tools/smoke-orquestrador.cjs --listar
node tools/smoke-orquestrador.cjs --caso guard --pago
```

`--listar` roda offline. Uma execução paga exige um caso explícito e
`--pago`. A CLI usa Haiku na sessão e nos subagentes, com até oito turnos,
60 segundos e limite de US$ 0,05 informado à CLI por execução. O runner
imprime o custo reportado e usa o plugin gerado em projeto sintético temporário.

Casos disponíveis:

- `falso-positivo` confere o achado e a linha da asserção.
- `ambiguidade` confere a pergunta pendente e a revisão do caso claro.
- `delegacao` confere a chamada e o resultado de `oathbound:assayer`.
- `guard` confere o bloqueio de uma leitura com limite acima de 150 linhas
  pela trilha de auditoria temporária do hook.

O runner usa eventos `stream-json` e evidências no texto final. A interação
com `AskUserQuestion` exige um teste interativo. Estes casos executam no
Claude. Uma futura execução no agy precisa de executor próprio.

## Atualização de versão (`bump-version.cjs`)

Execute `node tools/bump-version.cjs <semver>` para atualizar `VERSION`, `.antigravity-plugin/plugin.json` e `.claude-plugin/plugin.json` juntos. Use `--commit` para criar o commit de release e `--tag` para criar também a tag anotada `v<semver>`.

Para ativar a validação automática local antes de cada commit, configure os hooks versionados:
```sh
git config core.hooksPath .githooks
```
