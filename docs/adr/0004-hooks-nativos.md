# ADR 0004 — Native Rust Hooks for the Hot Path

Date: 2026-11-19. Status: Phase 0 and Phase 1 (Rust pilot) completed and measured.

## Context

`PreToolUse` hooks and `statusline` run on every tool call or interface update. In Node.js (`v24.21.0`, `win32-x64`), `node.exe` cold start costs ~130–137 ms (p50) and up to ~280 ms (p95) per invocation, adding noticeable latency in sessions with dozens of tool calls.

## Decision

1. **Narrow scope (hot path)**: migrate only high-frequency synchronous hooks to the native binary:
   - `plugin-agent-guard` (combining `readonly-guard`, `read-size-guard`, `destructive-guard`, `agent-audit` and `redigir`)
   - `agent-audit`
   - `rtk-hook`
   - `statusline`
   Keep network-bound (`skill-suggest.js`) or rarely run code (`tools/install.ts`, `tools/audit-docs*.ts`, `tools/build-plugin.cjs`, `test/**`) on Node.js >= 24.

2. **Language and format**: Rust, compiled as one multi-call `oathbound-hook` binary (`oathbound-hook.exe` on Windows), with subcommands for each hook.
   - `regex` crate (linear time, no ReDoS risk); rules with negative lookahead (e.g. `^(?!node\s+-e\b)` in `rtk-hook.js`) become an equivalent prefix check before the regex.
   - Minimal dependencies (`serde`, `serde_json`, `regex`) and `release` profile with `lto = true` and `strip = true`.

3. **Distribution (Option A — precompiled binaries + `.js` fallback)**:
   - Platform artifact convention: `oathbound-hook-win32-x64.exe`, `oathbound-hook-linux-x64`, `oathbound-hook-darwin-arm64`.
   - Primary target: `win32-x64`, with structure already prepared for `linux-x64` and `darwin-arm64`.
   - `.js` scripts remain as a functional fallback when the native binary is unavailable.

4. **Parity and acceptance criteria**:
   - The existing suite (`test/hooks/*.test.js`) must pass entirely against the native binary through `OATHBOUND_HOOK_BIN`.
   - Latency target on `win32-x64`: **p95 < 15 ms** for hooks without an external subprocess (`plugin-agent-guard`, `agent-audit`, `rtk-hook` deny).

## Baseline Measurement (Node v24.21.0, win32-x64, 15 runs)

Measured with `rtk proxy node tools/bench-hooks.cjs --runs=15`:

| Hook | min (ms) | p50 (ms) | p95 (ms) | max (ms) |
| --- | ---: | ---: | ---: | ---: |
| `plugin-agent-guard` (allow) | 112.7 | 136.9 | 167.6 | 167.6 |
| `plugin-agent-guard` (deny) | 103.5 | 130.5 | 281.8 | 281.8 |
| `agent-audit` (append) | 121.6 | 133.0 | 235.6 | 235.6 |
| `rtk-hook` (deny find) | 112.7 | 137.0 | 196.3 | 196.3 |

## Native Pilot Measurement (Rust 1.100.0 GNU, win32-x64, 15 runs)

Measured with `rtk proxy node tools/bench-hooks.cjs --runs=15 --bin=native/oathbound-hook/target/release/oathbound-hook.exe`:

| Hook | Node p50 (ms) | Native p50 (ms) | p50 speedup | Node p95 (ms) | Native p95 (ms) | p95 speedup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `plugin-agent-guard` (allow) | 136.9 | 77.7 | 1.8x | 167.6 | 108.5 | 1.5x |
| `plugin-agent-guard` (deny) | 130.5 | 75.5 | 1.7x | 281.8 | 112.3 | 2.5x |
| `agent-audit` (append) | 133.0 | 30.9 | 4.3x | 235.6 | 41.3 | 5.7x |
| `rtk-hook` (deny find) | 137.0 | 28.1 | 4.9x | 196.3 | 34.2 | 5.7x |

## Update (0.50.0-alpha.24): Rust-Only Hot Path + Lazy Regexes

Removed the `.js` fallback for hot-path hooks (`plugin-agent-guard`, `readonly-guard`, `read-size-guard`, `destructive-guard`, `agent-audit`, `rtk-hook` and `statusline`) to eliminate duplication and drift. `destructive.rs` now compiles regexes on demand after a substring prefilter:

| Hook | Node p50 (ms) | Native p50 (ms) | p50 speedup | Native p95 (ms) |
| --- | ---: | ---: | ---: | ---: |
| `plugin-agent-guard` (allow) | 136.9 | 13.8 | 9.9x | 15.0 |
| `plugin-agent-guard` (deny) | 130.5 | 16.6 | 7.9x | 20.9 |
| `agent-audit` (append) | 133.0 | 17.3 | 7.7x | 21.2 |
| `rtk-hook` (deny find) | 137.0 | 16.9 | 8.1x | 19.2 |

## Consequences

- **Positive**: estimated >10x reduction in hook cold-start latency; no Node runtime dependency for hooks; ReDoS protection.
- **Negative**: repository now maintains two languages (Rust in the hot path + Node/TS in `tools/` and `test/`); requires a Rust toolchain (`rustup`) for local development/compilation and platform-specific binary publishing.
