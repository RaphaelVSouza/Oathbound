# Changelog

## [Unreleased]

- The global alignment gate in `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md` and `~/.gemini/config/GEMINI.md` now reads "propose a plan (max 5 lines) and wait for "ok", unless the request already states the work". A request that already names the work no longer needs a second approval. These files live outside this repository; edited by hand, not by the installer.

## [0.50.0-alpha.66] - 2026-11-25

- The Claude plugin now declares `displayName` and `icon` (`assets/logo.svg`) in `plugin.json`, and the Claude build ships the logo. Claude Code ignores `icon` at load time; Anthropic's directory reads it at submission.
- Adds the Claude-only skill `statusline-setup` (`/oathbound:statusline-setup`). Claude plugins cannot ship `statusLine`, so the skill writes it into `~/.claude/settings.json` with consent, pointing at the bundled `oathbound-hook statusline`. It never replaces an existing entry without asking.
- Adds `EnterPlanMode`, `ExitPlanMode`, `Skill`, `TaskStop`, `TodoWrite` and `Monitor` to the Claude `oathkeeper` tools.
- Records ADR-0014 to ADR-0018 (Proposed): Claude Code plugin configuration, hooks, agent and skill surfaces, and experimental and team-governance features. Docs only; no behavior change.
- Test allowlist for the agy manifest now accepts `license`.

## [0.50.0-alpha.65] - 2026-11-25

- Shows the project, Git branch, active subagent elapsed time, low-context highlighting, and recent thread-scoped hook blocks in the Codex footer. [Statusline specification](docs/codex/statusline-spec.md)

## [0.50.0-alpha.64] - 2026-11-25

- Adds an opt-in subagent-only destructive guard for Codex CLI 0.172.0. The main thread uses Codex's normal approval flow. [ADR-0013](docs/adr/0013-scope-codex-destructive-guard.md)

## [0.50.0-alpha.63] - 2026-11-25

- Consolidates the `smith` agent contract across Claude Code, Antigravity, and Codex: adds the before-editing and done checklists, per-criterion `PASS`/`FAIL`/`SKIP` validation verdicts, multi-line `ACCEPTANCE:` receipt format, and updates `oathkeeper` to number acceptance criteria (`C1`, `C2`, ...) in every delegation.

## [0.50.0-alpha.62] - 2026-11-25

- Fixes Windows Codex hook launches by invoking the native guard and audit hooks with PowerShell's call operator. Reinstalling migrates the existing commands in `~/.codex/hooks.json`.

## [0.50.0-alpha.61] - 2026-11-25

- Bundles and registers an opt-in MCP footer in the Oathbound Codex plugin. Selecting it in `/statusline` shows the Oathbound mark, live subagent role glyphs, model, and remaining context. The package also includes `setup/statusline.cjs` for standalone registration. [ADR-0011](docs/adr/0011-use-mcp-for-the-codex-footer.md)

## [0.50.0-alpha.60] - 2026-11-24

- Claude project installs with `--statusline` use the installed native Oathbound renderer and preserve existing status-line settings. Claude Code and agy share a compact layout with context and quota remaining. agy adds running subagent glyphs and shortens optional details in narrow terminals.
- Standardizes subagent output contracts across Claude Code, Antigravity, and Codex per [ADR-0010](docs/adr/0010-standardize-subagent-output-contracts.md) (Phase 2 SARIF export deferred): adds the common `AGENT`/`SCOPE`/`STATUS`/`CONFIDENCE`/`GAPS` envelope to all 7 subagents, replaces legacy `NOTE:`/`PENDING:` with `GAPS:`, adds `[CRITICAL|HIGH|MEDIUM|LOW]` severity ranks to `assayer` `BUG`/`RISK` with security handoff to `sentinel`, updates `sentinel` to structured findings (`CWE-862`/`863` instead of `CWE-285`, certainty `[CONFIRMED|LIKELY|POSSIBLE]`, `CONDITION`/`IMPACT`/`FIX`/`EVIDENCE`/CVSS v4.0 `SCORE`, `COVERAGE`, and `No findings in scope.`), updates `breaker` to `RESULT: PASS|FAIL|none` + numbered `FLOW` reproduction on `FAIL` + redacted persistent evidence under `.scratch/breaker/`, and updates `test/agents/contratos.js`, `test/agents/contratos.test.js`, `test/agents/regras-comuns.json`, and `test/agents/model-routing.test.js`.

## [0.50.0-alpha.59] - 2026-11-24

- Adds a Codex status line to the opt-in `oathkeeper` profile with project, branch, model and reasoning effort, remaining context, and primary usage limit. The README shows the Oathbound and agent SVGs and explains how to enable the footer in an existing profile.

## [0.50.0-alpha.58] - 2026-11-24

- Audits and standardizes all 7 subagents (`scout`, `scholar`, `smith`, `scribe`, `assayer`, `sentinel`, `breaker`) across Claude Code (`claude/agents/*.md`), Antigravity (`agy/config/agents/*.md`), and Codex (`codex/agents/*.toml`):
  - Removes all emojis from instructions and output contracts, unifying plain-text contracts (`BUG`/`RISK`/`NIT`/`QUESTION` + `totals:` for `assayer`, `CRITICAL`/`HIGH`/`MEDIUM`/`LOW` `[CWE-...]` + `totals:` for `sentinel`, `CONFIRMED|REFUTED|INCONCLUSIVE` + `TOTALS:` for `scout` claim verification, standardized `SOURCES:`/`ANSWER:`/`FILES:`/`MODE:`/`STATUS:` blocks across all runners).
  - Expands Codex subagents (`scholar`, `smith`, `scribe`, `breaker`, `assayer`, `sentinel`, `scout`) to operational parity with Claude/Antigravity, adds `sandbox_mode = "read-only"` to `scout.toml`, `assayer.toml`, and `sentinel.toml` (leaving `model` and `model_reasoning_effort` unset per ADR-0007), and adds single-turn parallel batching guidance across all 21 subagents.
  - Updates `test/agents/contratos.js`, `test/agents/contratos.test.js`, `test/agents/regras-comuns.json` (removing stale `destructive-guard.js` and `codex.scribe -> docs` references), `test/agents/sincronia.js` (defaulting Codex dir to `codex/agents/`), `skills/architecture-advisor/references/current-architecture.md`, and `test/agents/model-routing.test.js`.

## [0.50.0-alpha.57] - 2026-11-24

- Streamlines `oathkeeper` instructions (`claude/agents/oathkeeper.md`, `agy/config/agents/oathkeeper.md`, `codex/oathkeeper.config.toml`) to reduce unnecessary turns and over-asking while keeping Oathbound governance: handles small bounded edits (up to ~3 closely related files) and batched reads in the main session, treats the default pipeline as logical stages rather than mandatory separate subagents, allows read-only/clear-scope delegation and post-diff risk checks within `CAP` without extra plan pauses, applies safe reversible defaults while recording open choices in `PENDING`, and runs repo-mandated local checks automatically. Covered by `test/agents/model-routing.test.js`.

## [0.50.0-alpha.56] - 2026-11-24

- `tools/install.ts`: adds `--prune` (with `--global`) to invoke `prune-old-versions.cjs --apply` right after writing the global manifest; without `--prune`, `--global --upgrade` logs a dry-run hint when removable older versions exist. Covered by `test/install.test.ts`.
- Adds `tools/upgrade-global.ts` to automate building plugin packages into `~/.oathbound/marketplaces/oathbound-<version>/`, reinstalling plugins across installed CLIs (`claude`, `agy`, `codex`), running `install.ts --global --upgrade`, and pruning older versions (`--no-prune` to skip, `--build-hook` to compile the Rust hook binary first). Covered by `test/upgrade-global.test.ts`.
- `docs/adr/0005-plugin-codex.md` and `README.md`: adds Codex CLI `>= 0.134.0` minimum version note for standalone profiles and clarifies why custom agents, profiles, and the native hook binary live outside the Codex plugin package.

## [0.50.0-alpha.55] - 2026-11-24

- `tools/install.ts`: `--global --upgrade` now migrates legacy Oathbound `.js` hook entries (`agent-audit.js`, `readonly-guard.js`, `read-size-guard.js`, `destructive-guard.js`) in `~/.claude/settings.json` and `~/.codex/hooks.json` to the native `oathbound-hook` binary while preserving `rtk hook` and custom hooks. `--global --runner codex` now copies `oathbound-hook` to `~/.codex/hooks/` and merges `~/.codex/hooks.json` (`SubagentStart`/`SubagentStop` + `destructive-guard`). Covered by `test/install.test.ts`.
- `tools/extract-audit.ts`: links single-`invoke_subagent` mixed tool batches (`criacao_no_turno`) in Antigravity transcripts and adds `correlacao_por_coorte` (`com_produtor` vs `legado`) for Claude and Codex so historical unkeyed rows do not mask keyed block rates. Covered by `test/extract-audit.test.ts`.
- Clarifies `Read` (`offset` and `limit <= 150`) and `git diff`/`git show` (`--stat`/`--name-only` or `-- <file>`) guardrails in `claude/agents/scout.md` and `claude/agents/sentinel.md`, and updates the stale `read-size-guard.js` hook name in `claude/agents/assayer.md`.

## [0.50.0-alpha.54] - 2026-11-24

- The `oathkeeper` profiles (Claude, agy, Codex) no longer ask again for an action the user already named. A request that names the action, or states a goal that needs it ("release", "tag it", "push"), is the confirmation; the profile asks once, in one batch, only for unrequested actions, and still confirms irreversible actions beyond the goal. `AGENTS.md` carries the same exception.
- The final report's `PENDING` field lists items in dependency order (`after P01`), and a `decision` item is never an action the user already requested.
- `test/agents/model-routing.test.js` asserts the confirmation rule and the `PENDING` rules in all three profiles.
- Adds `tools/prune-old-versions.cjs`, which removes plugin versions older than `VERSION` that reinstalls leave under `~/.oathbound/` and the Claude and Codex plugin caches. Dry run by default, `--apply` removes. It skips any directory still named in the Claude or Codex plugin config, so it cannot break a marketplace that was not reinstalled. Covered by `test/prune-old-versions.test.cjs`.

- Adds the `architecture-advisor` skill: chooses, evaluates or changes a project's architecture from a questionnaire, current evidence and a weighted tradeoff matrix; keeping the current architecture is a valid outcome. It delegates repo reading to `scout` (closed questions and claim verification), external evidence to `scholar` and the ADR draft to `scribe` with `create-adr` (status `Proposed`); the questionnaire, weights, scoring and recommendation stay in the main thread. Ships `references/` (questionnaire, current-architecture assessment, HTML view contract), an offline HTML view template and `scripts/arch-check.cjs` (dependency-free Node: `validate`, `sensitivity`, `render`, `adr-next`). The script is optional: the skill has a manual fallback because the packaged plugin does not guarantee Node at runtime. `agents/openai.yaml` disables implicit invocation on Codex, like `create-adr`.
- Adds `test/architecture-advisor.test.cjs` (19 tests: validation, sensitivity against brute force, hostile-text render round trip, ADR numbering) and updates the skill counts in `test/build-plugin.test.cjs` (claude 11, agy 12, codex list).
- Validated locally: the new tests, `tools/audit-docs.ts`, `test/repo-eol.test.cjs`, and `test/build-plugin.test.cjs` with an empty placeholder file as `OATHBOUND_NATIVE_BIN`; the skill is packaged for claude, agy and codex; the HTML template renders in Chromium without console errors or label overlaps. Not validated: the native hook was not built, so the install and native-parity tests did not run; the skill was not exercised end to end in a live Oathbound session.

## [0.50.0-alpha.53] - 2026-11-24

- The `oathkeeper` final report (Claude, agy and Codex profiles) now numbers its items per field: `A01` agents, `V01 PASS|FAIL|SKIP` validations, `P01 decision|risk|blocked` pending. `SKIP` requires a reason, an empty field is `none`, `ENVIRONMENT` adds ahead/behind and clean/dirty, and `ROUTING RESULT` sits on each agent line. The Codex profile gains a `### Final report` section it lacked.
- `test/agents/model-routing.test.js` asserts the three profiles carry the identical report block.
- `.githooks/pre-commit` also runs `test/repo-eol.test.cjs`, so CRLF is caught before the push.
- Removes the `attach-release` job from `.github/workflows/native-hooks.yml`. It ran `gh release upload` without a checkout or `--repo` and failed with `fatal: not a git repository` on the `v0.50.0-alpha.51` and `v0.50.0-alpha.52` tags; it also raced `release.yml`, which creates the release and already packages each per-OS binary. The `build` job (Rust tests, build, integration test) is unchanged.
- README: the global-update heading now targets `0.50.0-alpha.52`.
- Rewrites `AGENTS.md` with commands, limits and pitfalls.
- `.gitattributes` now starts with `* text=auto eol=lf`, so every checkout uses LF regardless of `core.autocrlf` (previously only `*.sh`, `*.md`, `*.ps1` and `*.js` were forced). The index was already LF; `git add --renormalize .` changed nothing.
- Adds `test/repo-eol.test.cjs`, which fails when a tracked text file has CRLF or mixed endings in the index or the working tree.
- Validated locally on Windows: the new test fails with the 7 CRLF files before the change and passes after re-checkout. Not validated: the `windows-latest` CI run.

## [0.50.0-alpha.52] - 2026-11-24

- Fixes the release workflow: the `Generate checksums` step ran `sed 's# \./# #'` in a plain YAML scalar, where ` #` starts a comment, so the command was truncated and failed with exit 2. It now uses a block scalar with `sha256sum -- *.tar.gz > SHA256SUMS` followed by `sha256sum -c SHA256SUMS`.
- `v0.50.0-alpha.51` was tagged but its release run failed at that step and published nothing; use `0.50.0-alpha.52`.
- Validated locally: every `run:` step in `release.yml` passes `bash -n`, and the checksum commands verify on sample files. Not validated: the `Publish GitHub Release` step had not run before this release.

## [0.50.0-alpha.51] - 2026-11-24

- `.github/workflows/release.yml` now builds the hook per OS (linux-x64, win32-x64, darwin-arm64) in a matrix and publishes one Claude tarball per target (`oathbound-claude-<ver>-<platform>-<arch>.tar.gz`) plus `SHA256SUMS`; agy and codex tarballs are unchanged (no binary). Implements ADR-0009 Option A.
- `tools/build-plugin.cjs claude` names the packaged binary from the source binary extension (`.exe` or none) instead of the build host platform, so cross-built targets keep the right name.
- The tag-versus-`VERSION` check now runs in its own `check-version` job before the matrix build.
- Adds a top-level `description` to `.claude-plugin/marketplace.json`.
- Validated locally: PowerShell and cmd.exe resolve the extensionless hook command to `oathbound-hook.exe` on Windows (alpha.50 install, allowed-command payload, exit 0).
- Not validated: the release workflow was not run on GitHub; the darwin-arm64 binary and the Windows/macOS packages were not executed locally.

## [0.50.0-alpha.50] - 2026-11-24

- Fixes the Claude plugin package missing `.claude-plugin/marketplace.json`: `tools/build-plugin.cjs claude` now writes it from the repository source, so a built package or release tarball can be added with `claude plugin marketplace add <dir>`.

## [0.50.0-alpha.49] - 2026-11-24

- Fixes the Claude plugin package missing `native/bin/oathbound-hook` (hook `plugin-agent-guard` failed with exit 127): `tools/build-plugin.cjs claude` now copies the native binary (`.exe` on win32) using the same lookup as `tools/install.ts` (`OATHBOUND_NATIVE_BIN`, `native/bin/oathbound-hook-<platform>-<arch>`, `native/oathbound-hook/target/release`) and fails with an explicit error when none is found.

- `.github/workflows/release.yml` now builds the hook with cargo before tests and packaging.
- Not validated: Windows resolution of the extensionless hook command.
- Release tarballs carry a single-platform (Linux) binary.

## [0.50.0-alpha.48] - 2026-11-24

- Version bump only (`VERSION` and plugin manifests).

## [0.50.0-alpha.47] - 2026-11-24

- Adapts `skills/grill-me/` (`SKILL.md`, `SKILL.agy.md`, `SKILL.claude.md`, `SKILL.codex.md`) so the base `SKILL.md` stays harness-agnostic while each `SKILL.<runner>.md` override uses its native question and discovery tools (`ask_question` + `invoke_subagent`/`scout`, `AskUserQuestion` + `scout`, `request_user_input` / `request_user_input_async`).

## [0.50.0-alpha.46] - 2026-11-24

- Adds `ADR-0008` documenting the 3-layer skill portability model (`skills/` portable core, symmetric runner-exclusive skill directories, and `.agents/skills/` universal bus).
- Updates `docs/prompts/create-skill-from-spec.md`, `docs/prompts/agents-md-builder-spec.md`, and `docs/codex/README.md` with per-harness official skill guides, open Agent Skills compliance (`skills-ref validate`, 1-level depth), and context-aware `.agents/skills/` bus installation.
- Generalizes `build-plugin.cjs` (`RUNNER_EXCLUSIVE_SKILL_DIRS`) and `install.ts` to support `claude/skills/` and `codex/skills/` exclusive directories symmetrically alongside `agy/config/skills/`.

## [0.50.0-alpha.45] - 2026-11-24

- Adds `agents-md-builder` as an Antigravity-exclusive skill under `agy/config/skills/agents-md-builder/` and updates `build-plugin.cjs` and `install.ts` to package and install `agy`-exclusive skills only for the `agy` runner.

## [0.50.0-alpha.44] - 2026-11-24

- Adds a compact handoff block rule (`STATE`, `FILES`, `DECISIONS`, `NEXT`) to Antigravity's `oathkeeper` for long sessions or manual compaction requests when `/compact` is unavailable in custom `mainAgent` menus.

## [0.50.0-alpha.43] - 2026-11-23

- Selects the Claude Code or Antigravity CLI questionnaire tool in the shared `grill-me` entry point used by source plugins.

## [0.50.0-alpha.42] - 2026-11-23

- Builds the native hook with Rust edition 2024 using the existing Rust 1.100.0 toolchain.

## [0.50.0-alpha.41] - 2026-11-23

- Keep asynchronous Grill Me questionnaires open until the user replies or cancels.
- Record Claude plugin guard attempts and decisions together, add native audit producer versions, and report Antigravity creation evidence.
- Write Codex lifecycle audit records to the Codex state directory by default.

## [0.50.0-alpha.40] - 2026-11-20

- Removes unused global instruction templates `claude/CLAUDE.md` and `agy/config/GEMINI.md`, and replaces the stale RTK reference. Existing global instruction files remain untouched.

## [0.50.0-alpha.39] - 2026-11-20

- Oathkeeper selects subagent models and effort by task complexity across Codex, Claude and Antigravity, with capability-aware fallback, one evidence-backed escalation and requested-versus-observed routing reports.
- Preserves role defaults, project pins, permissions and existing installation customizations. Antigravity named-model preferences require invocation support; session model availability alone is insufficient.

## [0.50.0-alpha.38] - 2026-11-20

- Translates repository documentation, agent and skill prompts, and CLI diagnostics into English while preserving stable machine identifiers, commands and paths.

## [0.50.0-alpha.37] - 2026-11-20

- Renames the main agent to `oathkeeper` in Claude and agy. In Codex, the main-session profile becomes `oathkeeper` (`codex -p oathkeeper`). Renames the browser QA agent to `breaker` in Claude, agy and Codex.

## [0.50.0-alpha.36] - 2026-11-20

- Removes the custom RTK hook from the native binary and benchmark. The installer continues migrating old entries to the official hook.

## [0.50.0-alpha.35] - 2026-11-20

- Uses official RTK hooks in Claude Code, Codex and Antigravity CLI. Migrates legacy custom RTK entries in Antigravity projects.

## [0.50.0-alpha.34] - 2026-11-20

- Removes the invalid RTK subcommand from the Antigravity installation fallback. The fallback uses Oathbound's native hook.

## [0.50.0-alpha.33] - 2026-11-20

- Correlates isolated Antigravity invocations with child sessions and counts ambiguous batches.

## [0.50.0-alpha.32] - 2026-11-20

- Adds a local audit extractor for Claude, Codex and Antigravity, with normalized events, source inventory and per-CLI metrics.

## [0.50.0-alpha.31] - 2026-11-20

- Adds 5 engineering skills (`create-spec`, `refactor-safely`, `test-strategy`, `incident-postmortem`, `api-contract-design`) calibrated for software engineers.
- Supports optional per-CLI skill overrides (`SKILL.<runner>.md`, ADR 0006) in `tools/install.ts` and `tools/build-plugin.cjs`.
- Adapts `grill-me` with overrides for `claude` (`AskUserQuestion`), `agy` (`ask_question`) and `codex` (`request_user_input` / `request_user_input_async`) and calibration for software engineers.
- Updates `scribe` in all three runners to load `create-spec` alongside `create-adr`.

## [0.50.0-alpha.30] - 2026-11-19

- Adds `create-adr` to all three plugins. `scribe` loads the skill on demand and uses the project's guide and template.

## [0.50.0-alpha.29] - 2026-11-19

- Claude and Antigravity. `assayer` reviews large diffs in batches and reports coverage. `sentinel` follows relevant calls to the control or sensitive operation and makes gaps explicit.
- Codex. `tester`, `smith` and `scribe` detail evidence and pending work. `scholar` identifies the source section and date or version. `scout` reconciles verdicts with the total number of claims. The profile plans batch reviews and records open gaps.

## [0.50.0-alpha.28] - 2026-11-19

- Expands Codex `scout`, `assayer` and `sentinel` prompts with analysis criteria, gap handling and output formats.

## [0.50.0-alpha.27] - 2026-11-19

- Codex orchestration selectable in the main session with `codex -p oathbound`.

## [0.50.0-alpha.26] - 2026-11-19

- Adds seven Codex agents, an orchestration skill, optional native hook configuration, agent installer and GitHub Release package.

## [0.50.0-alpha.25] - 2026-11-19

- Adds a local Codex CLI plugin with the four skills and marketplace generated by `build-plugin.cjs codex`.

## [0.50.0-alpha.24] - 2026-11-19

- Rust-only hot path: removes duplicate `.js` hook scripts (`plugin-agent-guard`, `readonly-guard`, `read-size-guard`, `destructive-guard`, `agent-audit`, `rtk-hook`, `statusline`) and installer `.js` fallback (`tools/install.ts`).
- Adds `readonly-guard`, `read-size-guard` and `destructive-guard` subcommands and unit tests (`cargo test`) in `native/oathbound-hook`.
- Optimizes `destructive.rs` with substring prefiltering and lazy regex compilation (`plugin-agent-guard` p50 from 77.7 ms → 13.8 ms; ~8–10x faster than Node.js).

## [0.50.0-alpha.23] - 2026-11-19

- Adds a native multi-call Rust binary (`native/oathbound-hook`) for `plugin-agent-guard`, `agent-audit`, `rtk-hook` and `statusline` hooks, documented in `docs/adr/0004-hooks-nativos.md`.
- Installer (`tools/install.ts`) detects the native binary through `OATHBOUND_NATIVE_BIN` or `native/bin/oathbound-hook-<platform>-<arch>[.exe]` and automatically falls back to `.js` scripts when absent.
- Adds `tools/bench-hooks.cjs`, `test/hooks/native-parity.test.js` and the `.github/workflows/native-hooks.yml` workflow for builds/releases on `win32-x64`, `linux-x64` and `darwin-arm64`.

## [0.50.0-alpha.22] - 2026-11-19

- Claude and agy orchestrators apply `caveman full` from session start.

## [0.50.0-alpha.21] - 2026-11-19

- Keeps only the 4 skills in use (`diagnosing-bugs`, `grill-me`, `migration`, `surgical-patch`); removes `safe-refactor` and `verify-and-stop`.
- `--global` installation now synchronizes `skills/` into `~/.claude/skills/` and `~/.gemini/config/skills/`.

## [0.50.0-alpha.20] - 2026-11-18

- Adds explicit paid smoke tests for daily review, delegation and the Claude orchestrator guard on Haiku.

## [0.50.0-alpha.19] - 2026-11-18

- Claude and agy orchestrators review tests for affected flows and clarify ambiguous rules in the main session.

## [0.50.0-alpha.18] - 2026-11-18

- Claude plugin includes an architecture review workflow with three analyses and evidence verification.

## [0.50.0-alpha.17] - 2026-11-18

- Claude and agy apply delegation approval according to scope and risk, keeping external-action gates.

## [0.50.0-alpha.16] - 2026-11-18

- Claude orchestrator checks repository instructions before planning.

## [0.50.0-alpha.15] - 2026-11-18

- Native Claude uses the plugin guard. The standalone installer generates hooks in agent frontmatter.

## [0.50.0-alpha.14] - 2026-11-18

- Limits global installation to agents and their guards, with a dedicated manifest.
- Removes general hooks from the Claude plugin and rules and the RTK hook from the agy package. Documents explicit entry through the orchestrator.

## [0.50.0-alpha.13] - 2026-11-18

- CI: runs tests and validates the Claude manifest and artifact on Linux and Windows.
- Claude Code: qualifies agent names in native delegation.

## [0.50.0-alpha.12] - 2026-11-18

- Claude Code: minimizes audit-persisted data and restricts permissions for new logs.

## [0.50.0-alpha.11] - 2026-11-18

- Installer: protects Claude hook paths containing spaces.

## [0.50.0-alpha.10] - 2026-11-18

- Installer: validates configuration before deduplication, preserves folders on collisions and limits operation to the selected runner.

## [0.50.0-alpha.9] - 2026-11-18

- Installer: preserves local files across repeated upgrades and limits legacy-agent cleanup to managed files.

## [0.50.0-alpha.8] - 2026-11-18

- Claude Code: applies plugin agent guards through the global hook.

## [0.50.0-alpha.7] - 2026-11-18

- Claude Code: marketplace and release package share global hook registration.

## [0.50.0-alpha.6] - 2026-11-18
- Packages `agy/config/GEMINI.md` as `rules/AGENTS.md` in the native Antigravity plugin build (`tools/build-plugin.cjs`).
- Adds an SVG logo with a transparent `<mask>` in `assets/logo.svg`, referenced in `.antigravity-plugin/plugin.json` and copied in the Antigravity plugin build.

## [0.50.0-alpha.5] - 2026-11-17
- Adds official documentation indexes for Claude Code and Antigravity CLI in `docs/`.

## [0.50.0-alpha.4] - 2026-11-17
- Removes the Antigravity `Stop` hook to prevent shutdown loops with `fullyIdle=false`; keeps the `PreToolUse` hook.

## [0.50.0-alpha.3] - 2026-11-17
- Separates the native Antigravity manifest into `.antigravity-plugin/plugin.json`, alongside Claude's own manifest in `.claude-plugin/`.
- Generates independent packages per harness, with portable agents, skills and hooks, without overwriting existing directories.

## [0.50.0-alpha.2] - 2026-11-17
- Fixes the global Antigravity instruction destination to `~/.gemini/GEMINI.md`, preserving existing files at the destination and old path.

## [0.50.0-alpha.1] - 2026-11-15
- Public Oathbound rebuild for Claude Code and Antigravity CLI (`agy`), legacy removal, native plugin packaging and a new installer with duplicate-skill disabling.

## 2026-11-14 (closes Jev routing experiments)

- ADRs 0001 and 0002 closed. Skill and agent suggestion prototypes remain inactive.
- Jev test review remains on demand (ADR 0003). Local routing-prototype tests check the selected candidate's probability and `Noul`, and output for ineligible requests.

## 2026-11-14 (renames E2E testing agent)

- Agent `qa` becomes `tester` in Claude Code. Contract and regression case use the new name. Synchronization continues using `qa` in Codex and Gemini.

## 2026-11-14 (renames documentation agent)

- Agent `docs` becomes `scribe` in Claude Code. Contracts and regression cases use the new name. Synchronization continues using `docs` in Codex and Gemini.

## 2026-11-14 (Jev in test review)

- ADR 0003 and manual CLI `tests/jev/revisar-teste.js`. One `Noul` question per acceptance criterion, with alert, inconclusive band and unavailable output. Tests with simulated transport.
- Preliminary calibration with Jev 1.14.0 on 18 synthetic calibration cases and 18 checking cases. Alert threshold became 0.81; `sem_alerta` keeps 0.30. Corpus, measurement tool and results in ADR 0003.

## 2026-11-14 (RTK regression)

- `node tests/rtk/rg.test.js`: validates hook search rewriting offline, result compaction and evidence preservation in focused searches. On Windows, compares searches with and without `PATHEXT`.

## 2026-11-14 (cost and turns per prompt)
- Generation updates `por-prompt.json` and creates `rotulos.csv` only when missing. `correcao_seguinte` considers only the next human prompt in the same transcript. Tests cover regeneration with notes and the boundary between two sessions.
- `tests/dificuldade/por-prompt.js`: joins human-prompt segmentation (`extrair.js` filter) with `custo.js` pricing (`precos.json`; `custo.js` now exports `achaPreco`, `extrairTokens`, `precificar`, `listarJsonl`; CLI unchanged). Per prompt: messages (dedup by `message.id`), tools (total and by name), distinct edited files, subagents, turns, US$ for main session and subagents, `irreversivel` (only boolean and category, never the command), `correcao_seguinte` (**weak heuristic**: keyword in the first 80 chars of the next prompt).
- Sidechain links to prompt through `promptId` (1st line of each `subagents/*.jsonl` = main session's human line); without a link, excluded from cost and counted separately.
- Writes `state/dificuldade/por-prompt.json` (id = sha256 8 hex, no text) and `rotulos.csv` (up to 60 shuffled prompts, redacted text truncated to 240, no cost, empty label) for blind labeling. `--correlacao`: Spearman label×cost and label×turns, underestimation (label 1 or 2 with cost above Q3), verdict (discard if Spearman < 0.4 or underestimation > 15%). n=60 gives CI ~±0.2.
- Test: `node tests/dificuldade/por-prompt.test.js` (fixtures in `CUSTO_HOME`).

## 2026-11-14 (refines Jev subagent mode)
- `hooks/skill-suggest.js`, `subagente` mode: `inline` option in `Choice` (no `Noul`; when selected, stays silent and logs `inline: true`); structured `criteria` per `Noul` (`true.faz`, `false.nao_faz` with `PARES_CONFUNDIDOS`); `Noul` bands: >= 0.7 suggests, <= 0.3 stays silent, middle stays silent and logs `faixa: 'meio'`. `LIMIAR_NOUL_SUB_ALTO` and `LIMIAR_NOUL_SUB_BAIXO` replace `LIMIAR_NOUL_SUB`. Expanded tests.
- ADR 0002: "Amendment 2026-11-14" section and "Status" line updated. Uncalibrated thresholds; **not registered** in `settings.json`.
- Later fix: subagent-mode `Choice` now requires `probabilities[escolhido]` >= 0.5 (`LIMIAR_PROB_SUB`) instead of `confidence`, per `confidence.md`. Test covers ignored `confidence`.

## 2026-11-14 (Jev implementation: subagent routing)
- ADR 0002 step 1: `description` in the 7 `agents/*.md` rewritten contrastively (what it does, when to use it, what it does not do; pairs `smith`/general-purpose, `scholar`/claude-code-guide, `assayer`/`sentinel`). `tests/agents/executar.js` suite: 12/12, US$ 0.063.
- ADR 0002 step 2: `hooks/skill-suggest.js` with `SKILL_SUGGEST_MODO=subagente` mode: 1 `Choice` + 1 `Noul` per subagent (12 items: 7 local + 5 built-in) in one request; suggests if confidence and `Noul` >= 0.5 (without calibration). `<subagent_relevance>` block; log with `modo` and without the prompt. Expanded tests. Written by `smith`.
- **Not registered** in `settings.json`: ADR acceptance criterion (100 human prompts with a subagent, calibration) not met.

## 2026-11-14 (Jev skill suggestion prototype)
- ADR `docs/adr/0001-sugestao-de-skill-com-jev.md` (proposed) and `hooks/skill-suggest.js` prototype (`UserPromptSubmit`). **Not registered** in `settings.json`: registration only after meeting ADR acceptance criteria.
- One request to Jev `jev-1.14.0` (`Choice` over the 44 skills + 2 `Noul`), prompt redacted by `redigir()`, silent failure, no prompt in the `state/skill-suggest.jsonl` log.
- ADR `docs/adr/0002-roteamento-de-subagentes-com-jev.md` (proposed): per-subagent questions, catalog-specific thresholds, trigger of 100 prompts with a subagent (currently 11). Jev fine-tuning is not offered by TypeSafe.
- `.gitignore`: allows `docs/`.
- Measurement (121 real prompts, `tests/skill-suggest/extrair.js` and `medir.js`, results in `state/`): skills inconclusive (1 actual load); subagents 6 of 11 correct first choices (55%). Acceptance criterion not met, hook remains unregistered. Details in the ADR.
- Test: `node hooks/skill-suggest.test.js` (no network, injected transport). Real call with 3 generic prompts: 227 to 423 ms; suggested `grill-me` and `caveman:caveman-review`, and nothing for a factual question.

## 2026-11-14 (dollar cost per model)
- `tests/custo/custo.js [YYYY-MM] [--json] [--sessao <id>]`: reads `projects/**/*.jsonl` (includes `subagents/`), deduplicates by `message.id` (58 of 80 ids repeat in the transcript; summing lines doubles cost) and sums US$ by month, model and origin (main/subagent). Shows cache hit, cost breakdown and subagent counterfactual at the main model's price.
- `tests/custo/precos.json`: Sonnet 5.5, Opus 5.5, Haiku 5.5 (`claude-api` skill table, 2026-11-03). **Estimated**: cache write 5m (1.25×) and 1h (2×) for all three models; Haiku cache read and above-100K tier. Output warns.
- Test: `node tests/custo/custo.test.js` (fixtures in `CUSTO_HOME`; output without prompt text).
- Measurement 2026-11-14: all transcripts US$ 30.83 (922 msgs, cache hit 96.6%); subagents US$ 2.06 against US$ 10.08 at Opus prices. Written by `smith`.

## 2026-11-14 (assayer and sentinel validation)
- Validation of commit `ad10103` by `assayer` (0 🔴, 9 🟡) and `sentinel` (0 🔴, 3 🟡, 11 🔵). Fixed:
  - Unreadable, large or slow payload no longer erases the call from the trail: writes a line with `erro` (`payload_invalido`, `payload_grande`, `stdin_lento`), containing only identifiers extracted from raw text, without content.
  - Redaction: JSON with escaped quotes, `Authorization`/`Cookie`/`Set-Cookie` headers, `-passin pass:`, names `passphrase`/`signature`/`cookie`/`dsn`, prefixes `ya29.`, `npm_`, `hf_`, `shpat_`, `dop_v1_`, `sntrys_`, Slack webhook and PEM body.
  - `audit-resumo.js`: denial without the call line (orphan) counts as a call and the tool appears; rate never exceeds 1; new `orfas` and `erros` fields.
  - Tests: ReDoS with a 2 s limit and 4096-character inputs; abandoned lock (`utimesSync`); failed rename (`.2` as a folder); 14 new formats; unreadable payload through stdin.
- Remains in `BACKLOG.md`: redaction false positives in flags, URL password with `/`, file mode, `O_NOFOLLOW`, retention, rare lock TOCTOU.

## 2026-11-14 (agent-audit.js audit)
- Opus (`assayer`) audit of `hooks/agent-audit.js`: 1 bug and 10 risks. Fixed:
  - Redaction: quoted key, flag with space-separated value, quoted value containing spaces, Stripe `sk_live_`, `github_pat_`, `glpat-`, `xox*-`, `ASIA`, JWT, `Basic`, `curl -u`, `https://user:senha@`, `mysql -p`, `sshpass -p`. URL path with masked token. Input limited to 4096 characters and quantifiers to 64 (quadratic ReDoS).
  - Rotation: file lock; aborts on errors other than `ENOENT` (previously `EPERM` on Windows lost a generation). `extra` accepts only `bloqueado` and `motivo`. Input: 3 s timer, stdin error handler.
  - `settings.json`: `timeout: 5` on the global hook.
- Question checked in the real log: a denied call generates 2 lines (global hook + guard, `bloqueado:true`), unintentional for counting. `audit-resumo.js` now counts only the line without `bloqueado` as a call; rate = blocks / calls. Previously denial inflated `chamadas` and reduced the rate.
- Tests: `agent-audit.test.js` (18 secret formats, 5 adversarial inputs with a 500 ms limit, rotation through `.2`, lock, stdin input) and `audit-resumo.test.js`. The new test fails on the old version.

## 2026-11-14 (lean CLAUDE.md)
- Global `CLAUDE.md` from about 40 to 13 lines. Removed: per-subagent model list (duplicated frontmatter `model:`) and cyclic-skills section (skill descriptions already restrict activation).

## 2026-11-14 (synchronization and tests)
- Cross-CLI synchronization (L4): `tests/agents/regras-comuns.json` (per-agent `Segredos` and `Gate` rules, forbidden excerpts) and `tests/agents/sincronia.js` (checks; `--aplicar` appends missing content in `~/.codex` and `~/.gemini`). Test: `sincronia.test.js`. Finding: Codex and agy lacked any secret rule or gate; applied to all 7 agents in each.
- agy: removes the `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM=NUL` workaround from `assayer`, `sentinel`, `scout`, `smith` (bypassed a block and ran in read-only agents). Now: stop and report. Revert through `git revert`.
- Suite: `smith-gate`, `docs-gate` and `ask-commit` cases.
- Private GitHub remotes: `claude-config`, `codex-config`, `gemini-config`.

## 2026-11-14 (one repository per CLI)
- Versioned separately, each with an allowlist `.gitignore`, `.gitattributes` and `README.md`. No remote. Secret scan of staged files: clean.

## 2026-11-14 (remote)
- `.gitattributes` (LF; `.ps1` CRLF): ends the LF-to-CRLF warning.
- Private GitHub remote (`origin`, branch `main`). Secret scan of history: clean.

## 2026-11-14 (Phase 7)
- Metrics (L3): `hooks/audit-resumo.js [YYYY-MM] [--json]` summarizes `state/agent-audit.jsonl` by month and agent (runs, calls, blocks, rate, tools, top reasons). Test: `audit-resumo.test.js`.

## 2026-11-14 (Phase 6)
- RACI and gates (L7): `README.md` with owner, approver, irreversible actions and control layers.
- `permissions.ask` for `git push`, `git commit`, `git reset --hard`, `rm`, `Remove-Item` (`rtk` variants).

## 2026-11-14 (Phase 5)
- Regression suite in `tests/agents/` (L5).
- RTK updated through the environment update script.
- `CHANGELOG.md` and `BACKLOG.md`.

## 2026-11-14
- Audit trail (L3): `hooks/agent-audit.js` records subagent calls in `state/agent-audit.jsonl`.
- Read-only guard (L1): `hooks/readonly-guard.js` on `assayer` and `sentinel`.
- Secrets (L6): agent rule and `deny` for `Read(//**/.env*)` and `.credentials.json`.
- Local Git baseline (L4).
