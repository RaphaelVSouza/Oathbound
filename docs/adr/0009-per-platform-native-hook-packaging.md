---
status: Accepted # Proposed | Accepted | Rejected | Deprecated | Superseded by ADR-NNNN
date: 2026-11-24 # date of the last status change
decision-makers: [Oathbound Maintainers]
consulted: []
informed: []
---

<!-- Guide: docs/adr/como-escrever-adr.md. Target reading time: 5 to 10 minutes. -->

# 0009 - Per-Platform Packaging of the Native Hook Binary

> The maintainer accepted Option A on 2026-11-24.

## Context and Problem Statement

[ADR-0004](0004-hooks-nativos.md) moved the hot-path hooks to the Rust `oathbound-hook` binary and removed the `.js` fallback, so the Claude plugin cannot run its hooks without that binary. `hooks/hooks.json` calls `"${CLAUDE_PLUGIN_ROOT}/native/bin/oathbound-hook" plugin-agent-guard` (`PreToolUse`, matcher `Bash|PowerShell|Read`), with no `.exe` suffix. `tools/build-plugin.cjs claude <dir>` copies exactly one binary into `native/bin/oathbound-hook[.exe]`, chosen by `findNativeHookBinary` (until 0.50.0-alpha.50 it was named after the **build host**; since 0.50.0-alpha.51 it is named after the source binary's extension) (env `OATHBOUND_NATIVE_BIN`, then `native/bin/oathbound-hook-<platform>-<arch>[.exe]`, then `native/oathbound-hook/target/release/oathbound-hook[.exe]`); it fails if none is found.

`.github/workflows/release.yml` runs on `ubuntu-latest` only, so release tarballs carry a Linux ELF binary. Windows and macOS users of a release package get a hook that cannot run. `ci.yml` validates on `ubuntu-latest` and `windows-latest` but does not produce release artifacts. Motivating incident: the alpha.48 package shipped without the binary and hooks failed with exit 127; alpha.49 added bundling and alpha.50 added `marketplace.json`. The `agy` and `codex` packages do not bundle the binary.

## Decision Drivers

- **Windows/Git Bash resolution:** Claude Code runs hooks through Git Bash on Windows. An extensionless command resolved to `oathbound-hook.exe` in a manual Git Bash test (exit 0). PowerShell and cmd.exe also resolved it in a direct test against an installed 0.50.0-alpha.50 package (exit 0, allowed-command payload). Other runners are unverified.
- **No network at runtime:** hooks run on every tool call and must work offline.
- **Hot-path latency:** ADR-0004 target is p95 < 15 ms; extra process layers cost against it (cost of a launcher not measured).
- **Supply chain and integrity:** artifacts must be built by project CI and be verifiable (checksums).
- **Package size:** bundling several binaries enlarges the package (size not measured).
- **CI cost:** more OS runners and build time per release.
- **`hooks.json` portability:** a single `hooks.json`, with no per-OS variants.

## Considered Options

- **A. Matrix release build** (ubuntu, windows, macos) producing one tarball per OS/arch, e.g. `oathbound-claude-<ver>-<platform>-<arch>.tar.gz`, each bundling its own binary.
- **B. One universal Claude package** with `native/bin/oathbound-hook-<platform>-<arch>[.exe]` for all targets plus an extensionless shell-script launcher `oathbound-hook` that dispatches by platform; `hooks.json` unchanged.
- **C. Status quo:** Linux-only release; other platforms build locally and document it.
- **D. Download the binary at install or first run.**

## Decision Outcome

**Accepted: Option A**, because it keeps `hooks.json` unchanged and the hook a direct native exec (no launcher on the hot path), needs no network at runtime, and fits the artifact naming already set by ADR-0004 (`oathbound-hook-<platform>-<arch>[.exe]`). It fixes the actual defect (wrong-OS binary in release) at the cost of more CI jobs and more release assets. Option B is the fallback if a single installable artifact is a hard requirement.

If accepted, implementation would be: build the binary per target in a CI matrix, pass it to `build-plugin.cjs` via `OATHBOUND_NATIVE_BIN`, name tarballs per platform, publish a checksum file (e.g. `SHA256SUMS`) with the release, and keep the `findNativeHookBinary` fail-if-missing behavior. Per ADR rules for this repo, the change would also update `VERSION`, `CHANGELOG.md`, and the README install section.

### Consequences

- **Good:** each package ships the one binary that matches its target; no runtime dispatch or network.
- **Good:** `hooks.json` and the hook command stay identical on all OSes.
- **Bad:** several release assets per version; users must pick the right one — _mitigation:_ clear naming and install docs; how the marketplace flow selects an asset is unverified.
- **Bad:** CI cost and release complexity grow with each OS/arch — _mitigation:_ start with `linux-x64`, `win32-x64`, and `darwin-arm64` (the ADR-0004 targets).
- **Neutral:** `agy` and `codex` packages remain without the binary until their own decision.

### Confirmation

- For each target, extract the packaged tarball on that OS and run `native/bin/oathbound-hook plugin-agent-guard` with a sample hook payload; expect exit 0 for allow and the documented deny result for a blocked command.
- On Windows, run the same through Git Bash (the Claude Code hook path); PowerShell and cmd.exe are extra checks (resolution already tested on alpha.50; see Open Questions).
- `claude plugin validate` on each package (not yet run for this ADR).
- Release workflow check: each artifact contains the binary for its own OS/arch, and checksums match.
- `node tools/audit-docs.ts` for links and traceability.

## Pros and Cons of the Options

### A. Matrix release build, one tarball per OS/arch

- **Good:** no launcher; direct exec; `hooks.json` unchanged; smaller packages.
- **Good:** binaries built by project CI, checksummable.
- **Bad:** more runners and release assets; per-OS asset selection by users.

### B. Universal package with launcher

- **Good:** one artifact for all users; `hooks.json` unchanged.
- **Bad:** larger package (all binaries); the launcher adds a shell process to every hook call (latency not measured against the p95 < 15 ms target).
- **Bad:** the launcher needs a POSIX shell; Windows without bash is unresolved.
- **Bad:** still needs a multi-OS build matrix, so CI cost is not saved versus A.

### C. Keep Linux-only release (status quo)

- **Good:** no CI change.
- **Bad:** release package is broken for Windows and macOS; every such user needs a Rust toolchain.

### D. Download at install or first run

- **Good:** small package.
- **Bad:** needs network at install or first run; hooks fail offline or behind proxies.
- **Bad:** adds supply-chain exposure (download source, integrity verification, possible TOFU) and a failure mode on the hot path.

## Open Questions

- macOS: is `darwin-arm64` enough, or is `darwin-x64` needed? (ADR-0004 lists only `darwin-arm64`.)
- Binary signing and notarization (macOS Gatekeeper, Windows SmartScreen): needed? Not investigated.
- Does the Claude plugin marketplace flow support choosing a per-platform asset? Unverified.
- If B is chosen: launcher behavior on Windows without Git Bash.
- Should `agy` and `codex` packages bundle the binary, and under which option?
- Result: PowerShell and cmd.exe resolve the extensionless command to the `.exe` on Windows (tested against an installed 0.50.0-alpha.50 package with an allowed-command payload; exit 0).

## References

- [ADR-0004: Native Rust hooks for the hot path](0004-hooks-nativos.md)
- [ADR-0008: Layered portability and harness-exclusive skills](0008-portable-and-harness-exclusive-skills.md)
- `hooks/hooks.json`, `tools/build-plugin.cjs` (`findNativeHookBinary`), `.github/workflows/release.yml`, `.github/workflows/ci.yml`
