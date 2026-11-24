# Documentation Auditor and Installer

## Audit Extraction (`extract-audit.ts`)

Node.js 24 or later. Provide inclusive dates and a new output directory.

```sh
node tools/extract-audit.ts --inicio 2026-11-14 --fim 2026-11-19 --saida ./auditoria-local
```

`--claude`, `--codex` and `--gemini` override source directories.

For Antigravity invocations, `correlacao_filha` indicates whether the link was
confirmed, ambiguous or lacks evidence. The extractor fills `sessao_filha`
when the immediately following creation response identifies a previously unseen
child for an isolated call. It preserves all calls in batches.
Status queries do not create new links.
Confirmed adjacent links include `evidencia_filha` with the creation record's source and line.
By default, the extractor reads `AGENT_AUDIT_DIR` or `~/.claude/state`,
`$CODEX_HOME/state` or `~/.codex/state`, and `~/.gemini`.
`--fuso` changes the date boundaries, which default to `America/Sao_Paulo`.

`eventos.jsonl` contains events and file and line references.
`metricas.json` contains a file inventory and counts by CLI. Claude's block
rate requires keys for all calls and blocks in the window, with a match for
each block. `decisoes_plugin` reports the separate cohort observed by the
Claude plugin guard. Each decision is one attempt, including denials. Its
rate is null when decision keys are missing or conflicting. Native records
can carry the producing release and, for plugin decisions, the installation mode.
Codex lifecycle hooks default to `$CODEX_HOME/state` or `~/.codex/state` unless
`AGENT_AUDIT_DIR` is set. Historical Codex records without start or end events appear as
calls, blocks or audit errors.
For Antigravity, the extractor counts transcript invocations by surface.
CLI history measures database and transcript coverage through conversation IDs.
Matching names indicate compatibility with the current agent catalog.
Keep artifacts locally, as they include session and call identifiers.

## Documentation Auditor (`audit-docs.ts`)

`audit-docs.ts` checks configured documents without npm dependencies. Requires
Node.js 24 or later; Git is required for `--staged`. This repository's
configuration lives in `audit-docs.config.js`.

```sh
node tools/audit-docs.ts
node tools/audit-docs.ts --staged
node tools/audit-docs.ts --verbose
```

To use the engine from a terminal with an external project and configuration:
```sh
node tools/audit-docs.ts --project <dir> --config <dir>/tools/audit-docs.config.js
```

## Installer (`install.ts`)

The installer copies Oathbound into local environments or projects, preserving changes and disabling duplicates.

```sh
node tools/install.ts [options]
```

Supported options:
- `--global`: Installs Claude and agy agents and stores the manifest and Claude agent guards in `~/.oathbound/`.
- `--project <dir>`: Installs into a specific project directory.
- `--runner all|claude|agy|codex`: Selects the target runner. Select `codex` to install its agents. With `--global`, also installs the profile for `codex -p oathkeeper`. `all` includes Claude and agy.
- `--upgrade`: Updates an existing installation, displaying the diff.
- `--statusline`: Configures the status bar.
- `--audit-docs`: Installs documentation audit configuration.
- `--no-dedupe-skills`: Disables automatic skill deduplication.

The installer validates SHA-256 manifests and disables duplicate skills without symlinks.
The global installer preserves existing instructions, configuration, shared hooks and skills. Use `--statusline` for local Claude installation.
When installing hooks, the installer requires the native `oathbound-hook` binary (resolved through `OATHBOUND_NATIVE_BIN`, `native/bin/oathbound-hook-<platform>-<arch>[.exe]` or a local build in `native/oathbound-hook/target/release/`), copies it to the destination and points hooks directly to it. Codex hook configuration is manual.

## Hook Benchmark (`bench-hooks.cjs`)

Measures latency (p50/p95/min/max) of `plugin-agent-guard` and `agent-audit` hooks in the native Rust binary:

```sh
node tools/bench-hooks.cjs --runs=15
```

## Plugin Packages (`build-plugin.cjs`)

Create the parent directory and run `node tools/build-plugin.cjs claude <destination>` or `node tools/build-plugin.cjs agy <destination>`. The destination must be new and inside the repository. The generator does not overwrite existing files and injects the version from `VERSION` into generated manifests. Validate with `claude plugin validate <destination>` or `agy plugin validate <destination>`.

The `claude` build requires the native hook binary and fails with `Native hook binary not found` when none exists; `agy` and `codex` builds do not use it. Lookup order:

1. `OATHBOUND_NATIVE_BIN`
2. `native/bin/oathbound-hook-<platform>-<arch>[.exe]`
3. `native/oathbound-hook/target/release/oathbound-hook[.exe]`

Build it with `cargo build --locked --release --manifest-path native/oathbound-hook/Cargo.toml`. The binary only works on the OS it was built on.

For Codex CLI, run `node tools/build-plugin.cjs codex dist/codex`.
The generated destination is the local marketplace root and contains the plugin
in `plugins/oathbound/`. Follow the [manual installation](../README.md#2-local-plugin-for-codex-cli).

## Paid Claude oathkeeper Smoke Tests

Run only the required case after relevant changes to oathkeeper,
delegation or the plugin guard. These tests use the CLI's authenticated
account and consume quota. The main suite and CI keep local validation.

```sh
node tools/smoke-oathkeeper.cjs --listar
node tools/smoke-oathkeeper.cjs --caso guard --pago
```

`--listar` runs offline. A paid run requires an explicit case and
`--pago`. The CLI uses Haiku in the session and subagents, with up to eight
turns, 60 seconds and a US$ 0.05 limit passed to the CLI per run. The runner
prints the reported cost and uses the generated plugin in a temporary synthetic project.

Available cases:

- `falso-positivo` checks the finding and assertion line.
- `ambiguidade` checks the pending question and review of the clear case.
- `delegacao` checks the `oathbound:assayer` call and result.
- `guard` checks that a read with a limit above 150 lines is blocked,
  using the hook's temporary audit trail.

The runner uses `stream-json` events and evidence in the final text.
Interaction with `AskUserQuestion` requires an interactive test. These cases
run in Claude. A future agy run needs its own executor.

## Version Update (`bump-version.cjs`)

Run `node tools/bump-version.cjs <semver>` to update `VERSION` and the Antigravity, Claude and Codex manifests. Use `--commit` to create the release commit and `--tag` to also create the annotated `v<semver>` tag.

To enable automatic local validation before each commit, configure the versioned hooks:
```sh
git config core.hooksPath .githooks
```
