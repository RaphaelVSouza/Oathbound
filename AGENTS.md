# Oathbound
Governance package for coding agents: subagents, hooks and skills, shipped as Claude, agy and Codex plugins. Node.js 24+ (no npm deps) plus a Rust native hook (`native/oathbound-hook`).

## Commands
- Test one file: `node --test test/build-plugin.test.cjs`
- Tests (as CI): `node --test "test/*.test.ts" "test/*.test.cjs" "test/*/*.test.js"`
- Audit docs/links: `node tools/audit-docs.ts` (`--staged` for the Git index); must report 0 violations
- Build native hook: `cargo build --locked --release --manifest-path native/oathbound-hook/Cargo.toml`
- Build a package: `node tools/build-plugin.cjs claude|agy|codex <new-dir-inside-repo>`, then `claude plugin validate <dir>`
- Bump version: `node tools/bump-version.cjs <semver>` (`--commit --tag` for release commit and tag)
- Pre-commit validation: `git config core.hooksPath .githooks`

## Conventions
- Keep this repository independent of consumer project rules, hosts, paths, and secrets.
- Put shared workflows in skills, agents, and hooks; configure exceptions in the installing project's `AGENTS.md`.
- Zero npm dependencies: native Node APIs only.
- Conventional Commits (`feat(hooks): ...`).
- When changing behavior, update `VERSION`, `CHANGELOG.md`, and the corresponding reference in the same delivery. `VERSION` and the three plugin manifests must match; use `bump-version.cjs`.
- Release = tag `v<VERSION>` pushed to `main`; `.github/workflows/release.yml` fails if tag and `VERSION` differ.
- Describe only validations actually performed.

## Limits
- Ask before: changing CI/CD, secrets, dependencies or infrastructure; commit, push, tag, delete.
- ADR for architecture, contract, data, auth, infra, cost or dependency decisions: use `docs/adr/adr-template.md`, consult `docs/adr/como-escrever-adr.md`.
- Never overwrite existing installations; preserve local changes and present the upgrade diff.
- Never move or delete a pushed tag; ship a new pre-release version (`0.50.0-alpha.N`).
- Repository skills and agents are under development: inspect, edit and validate them, but run them only when the user asks. Use global skills and subagents for the work itself.

## Pitfalls
- The native hook embeds `VERSION` at compile time. After a bump, rebuild it, or `test/hooks/native-parity.test.js` fails on a stale `native/oathbound-hook/target/release/` binary.
- The `claude` build needs the hook binary (`OATHBOUND_NATIVE_BIN`, `native/bin/oathbound-hook-<platform>-<arch>[.exe]`, then the cargo `target/release` build) and fails with `Native hook binary not found`. A binary only runs on the OS that built it.
- `build-plugin.cjs` rejects destinations that exist or lie outside the repo; use `.scratch/` (gitignored).
- Git index is LF, but Windows checkouts (`core.autocrlf=true`, CI `windows-latest`) turn files not forced by `.gitattributes` (only `*.sh *.md *.ps1 *.js`) into CRLF. In tests, normalize `
` and sort `readdirSync` results.
- In workflow YAML, a plain scalar treats ` #` as a comment and truncates the command. Use `run: |` and check each step with `bash -n`.
- `hooks/hooks.json` calls `native/bin/oathbound-hook` without `.exe`; Windows resolves it. Keep it that way.

## More context (read on demand)
- Package tools, installer, smoke tests: `tools/README.md`
- Decisions: `docs/adr/` (index in `docs/README.md`); native hooks `docs/adr/0004-hooks-nativos.md`, per-OS packaging `docs/adr/0009-per-platform-native-hook-packaging.md`
- Contribution rules: `CONTRIBUTING.md`
