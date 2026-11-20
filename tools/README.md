# Auditor de documentação e instalador

## Extração de auditoria (`extract-audit.ts`)

Node.js 24 ou superior. Informe datas inclusivas e um diretório de saída novo.

```sh
node tools/extract-audit.ts --inicio 2026-11-14 --fim 2026-11-19 --saida ./auditoria-local
```

`--claude`, `--codex` e `--gemini` sobrescrevem os diretórios de origem.

Nas invocações do Antigravity, `correlacao_filha` informa se o vínculo foi
confirmado, ficou ambíguo ou carece de evidência. O extrator preenche
`sessao_filha` quando a resposta de criação imediatamente seguinte identifica
uma filha inédita para uma chamada isolada. Preserva todas as chamadas em lotes.
Consultas de status não geram novos vínculos.
Por padrão, o extrator lê `AGENT_AUDIT_DIR` ou `~/.claude/state`,
`$CODEX_HOME/state` ou `~/.codex/state`, e `~/.gemini`.
`--fuso` altera o recorte de datas, que usa `America/Sao_Paulo` por padrão.

`eventos.jsonl` contém eventos e referências ao arquivo e à linha.
`metricas.json` traz inventário de arquivos e contagens por CLI. A taxa de
bloqueio do Claude exige chaves para todas as chamadas e bloqueios da janela,
com correspondência para cada bloqueio. Registros históricos do Codex sem
eventos de início ou fim aparecem como chamadas, bloqueios ou erros de auditoria.
No Antigravity, o extrator conta invocações nos transcripts por superfície.
O histórico da CLI mede a cobertura de bancos e transcripts pelos IDs de conversa.
Nomes coincidentes indicam compatibilidade com o catálogo atual de agentes.
Guarde os artefatos localmente, pois incluem identificadores de sessões e chamadas.

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
- `--runner all|claude|agy|codex`: Seleciona o runner alvo. Selecione `codex` para instalar seus agentes. Com `--global`, instala também o perfil para `codex -p oathbound`. `all` inclui Claude e agy.
- `--upgrade`: Atualiza uma instalação existente apresentando o diff.
- `--statusline`: Configura a barra de status.
- `--audit-docs`: Instala a configuração de auditoria de documentação.
- `--no-dedupe-skills`: Desativa a desduplicação automática de skills duplicadas.

O instalador valida manifestos SHA-256 e desativa skills duplicadas sem utilizar symlinks.
O instalador global preserva instruções, configurações, hooks compartilhados e skills existentes. Use `--statusline` na instalação local do Claude.
Quando instala hooks, o instalador exige o binário nativo `oathbound-hook` (resolvido via `OATHBOUND_NATIVE_BIN`, `native/bin/oathbound-hook-<platform>-<arch>[.exe]` ou build local em `native/oathbound-hook/target/release/`), copia-o para o destino e aponta os hooks diretamente para ele. No Codex, a configuração de hooks é manual.

## Benchmark de hooks (`bench-hooks.cjs`)

Mede latência (p50/p95/min/max) dos hooks `plugin-agent-guard` e `agent-audit` no binário nativo Rust:

```sh
node tools/bench-hooks.cjs --runs=15
```

## Pacotes de plugin (`build-plugin.cjs`)

Crie o diretório pai e execute `node tools/build-plugin.cjs claude <destino>` ou `node tools/build-plugin.cjs agy <destino>`. O destino deve ser novo e estar dentro do repositório. O gerador não sobrescreve arquivos existentes e injeta a versão de `VERSION` nos manifestos gerados. Valide com `claude plugin validate <destino>` ou `agy plugin validate <destino>`.

Para Codex CLI, execute `node tools/build-plugin.cjs codex dist/codex`.
O destino gerado é a raiz do marketplace local e contém o plugin em
`plugins/oathbound/`. Siga a [instalação manual](../README.md#2-plugin-local-para-codex-cli).

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

Execute `node tools/bump-version.cjs <semver>` para atualizar `VERSION` e os manifestos de Antigravity, Claude e Codex. Use `--commit` para criar o commit de release e `--tag` para criar também a tag anotada `v<semver>`.

Para ativar a validação automática local antes de cada commit, configure os hooks versionados:
```sh
git config core.hooksPath .githooks
```
