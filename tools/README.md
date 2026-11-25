# Documentation Auditor and Installer

## Audit Extraction (`extract-audit.ts`)

Node.js 24 or later. Provide inclusive dates and a new output directory.

```sh
node tools/extract-audit.ts --inicio 2026-11-14 --fim 2026-11-19 --saida ./auditoria-local
```

`--claude`, `--codex` and `--gemini` override source directories.

For Antigravity invocations, `correlacao_filha` indicates whether the link was
confirmed, ambiguous or lacks evidence. The extractor fills `sessao_filha`
when a matching creation response identifies a previously unseen child for an
isolated `invoke_subagent` call (either immediately adjacent via
`criacao_adjacente` or within a single-subagent mixed-tool batch via
`criacao_no_turno`). Parallel multi-subagent batches remain `ambigua`.
Status queries do not create new links.
Confirmed links include `evidencia_filha` with the creation record's method, source and line.
By default, the extractor reads `AGENT_AUDIT_DIR` or `~/.claude/state`,
`$CODEX_HOME/state` or `~/.codex/state`, and `~/.gemini`.
`--fuso` changes the date boundaries, which default to `America/Sao_Paulo`.

`eventos.jsonl` contains events and file and line references.
`metricas.json` contains a file inventory and counts by CLI. Claude's block
rate requires keys for all calls and blocks in the window, with a match for
each block. `correlacao_por_coorte` splits `com_produtor` (non-plugin records
with `produtor`) from `legado` so historical unkeyed rows do not mask keyed
rates. `decisoes_plugin` reports the separate cohort observed by the
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
- `--runner all|claude|agy|codex`: Selects the target runner. Select `codex` to install its agents. With `--global`, also installs the profile for `codex -p oathkeeper`, `oathbound-hook` under `~/.codex/hooks/` and merges `~/.codex/hooks.json`. `all` includes Claude and agy.
- `--upgrade`: Updates an existing installation, displaying the diff.
- `--statusline`: Enables the native Oathbound status line for Claude project installations with no existing `statusLine` entry.
- `--audit-docs`: Installs documentation audit configuration.
- `--no-dedupe-skills`: Disables automatic skill deduplication.
- `--prune`: With `--global`, removes older version directories under `~/.oathbound/` and CLI plugin caches via `prune-old-versions.cjs --apply`. Without `--prune`, `--global --upgrade` prints a hint when removable versions exist.

The installer validates SHA-256 manifests and disables duplicate skills without symlinks.
The global installer preserves existing instructions, configuration, non-Oathbound hooks and skills; on `--upgrade` it migrates legacy Oathbound `.js` hook commands in `~/.claude/settings.json` and `~/.codex/hooks.json` to the native `oathbound-hook` binary. Use `--statusline` for local Claude installation.
On Windows, the global Codex installer updates existing Oathbound native hook commands in `~/.codex/hooks.json` to use PowerShell's `&` call operator. Review and trust the updated hooks in `/hooks`.
When installing hooks, the installer requires the native `oathbound-hook` binary (resolved through `OATHBOUND_NATIVE_BIN`, `native/bin/oathbound-hook-<platform>-<arch>[.exe]` or a local build in `native/oathbound-hook/target/release/`), copies it to the destination and points hooks directly to it. Project/manual Codex hook configuration remains manual.

## Global Upgrade (`upgrade-global.ts`)

Builds plugin packages into `~/.oathbound/marketplaces/oathbound-<version>/`, reinstalls plugins for installed CLIs (`claude`, `agy`, `codex`), runs `install.ts --global --upgrade` for those runners, and prunes older versions at the end:

```sh
node tools/upgrade-global.ts
node tools/upgrade-global.ts --runner codex --build-hook
```

Options: `--runner <all|claude|agy|codex>` (`all` includes all three CLIs; missing CLIs are skipped), `--build-hook` (runs `cargo build --locked --release` first), `--no-prune`, and `--home <dir>`. Run `/hooks` in Codex CLI afterwards to trust updated `~/.codex/hooks.json`.

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

The packaged file is named `native/bin/oathbound-hook.exe` when the source binary has a `.exe` extension, otherwise `native/bin/oathbound-hook`; the build host platform is not used. To package another target, build the hook on that OS and set `OATHBOUND_NATIVE_BIN` to it (the release workflow does this once per target).

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

## Prune Old Versions (`prune-old-versions.cjs`)

Run it after reinstalling the plugin in each CLI. It removes versions older than the kept one (default: `VERSION`) from the directories reinstalls leave behind: `~/.oathbound/marketplaces/oathbound-<version>`, `~/.oathbound/downloads/<version>`, `~/.claude/plugins/cache/oathbound/oathbound/<version>` and `~/.codex/plugins/cache/oathbound-local/oathbound/<version>`.

```sh
node tools/prune-old-versions.cjs                 # dry run: lists what would be removed
node tools/prune-old-versions.cjs --apply         # removes
node tools/prune-old-versions.cjs --keep <semver> # keep another version
```

Safety rules: it is a dry run unless `--apply` is passed. A location is skipped when the kept version is not there, so the last copy is never removed. It never touches newer versions, names that are not `<prefix><semver>`, files or symlinks. It also skips a directory still named in `~/.claude/settings.json`, `~/.claude/plugins/known_marketplaces.json`, `~/.claude/plugins/installed_plugins.json` or `~/.codex/config.toml`, so a marketplace that points at an old directory is never broken. agy copies the plugin into `~/.gemini/config/plugins/oathbound` and keeps no old versions.

To enable automatic local validation before each commit, configure the versioned hooks:
```sh
git config core.hooksPath .githooks
```
