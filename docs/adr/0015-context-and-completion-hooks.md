---
status: Proposed # Proposed | Accepted | Rejected | Deprecated | Superseded by ADR-NNNN
date: 2026-11-25 # date of the last status change
decision-makers: [Oathbound Maintainers]
consulted: []
informed: []
---

<!-- Guide: docs/adr/como-escrever-adr.md. Target reading time: 5 to 10 minutes. -->

# 0015 - Adopt SessionStart and TaskCompleted hooks; defer compaction hooks

## Context and Problem Statement

`hooks/hooks.json` registers a single hook: `PreToolUse` with matcher `Bash|PowerShell|Read`, running `oathbound-hook plugin-agent-guard` with a 5 second timeout. The native binary also has subcommands for audit and Codex events (`agent-audit`, `codex-agent-audit`), but the Claude plugin does not wire any session-lifecycle or completion event. Governance context (routing rules, receipt contracts) reaches the model only through agent and skill prompts, and nothing checks that a task ended with the expected evidence. Claude Code exposes more hook events that could cover both, at the price of extra processes and extra injected context.

External facts below come from a secondary research report and were not verified against the vendor documentation during drafting. They are marked "unverified".

## Decision Drivers

- Hook latency budget: ADR-0004 targets p95 below 15 ms for hot-path hooks on `win32-x64`; new hooks must stay in the native binary to respect it.
- Hooks must work offline and fail closed where they guard (`run_guard` in `native/oathbound-hook/src/main.rs` denies on invalid hook input).
- Injected context costs tokens on every session; it must be small and stable.
- Receipt contracts already exist (ADR-0010); a completion gate should reuse them, not invent a second format.

## Considered Options

Per event, each with a verdict:

- **`SessionStart`:** adopt.
- **`TaskCompleted`:** adopt.
- **`PreCompact` / `PostCompact`:** defer.
- **`TeammateIdle`:** reject.
- **Do nothing:** keep the single `PreToolUse` hook.

## Decision Outcome

Chosen option: **adopt `SessionStart` and `TaskCompleted`; defer `PreCompact` and `PostCompact`; reject `TeammateIdle`**, because the first two address missing context and missing completion evidence within the latency and token drivers, while the others lack a demonstrated need.

- **`SessionStart`, ranked first by value.** A native subcommand emits a short `additionalContext` (unverified: the event supports `additionalContext` output) carrying only stable facts such as active package version and pointer to the routing rules. Cap the injected text with a fixed byte limit. It must not read the network or the consumer project's secrets.
- **`TaskCompleted`.** A native subcommand checks that a completing task carries the receipt fields required by ADR-0010 and blocks completion when they are missing (unverified: the event can block through exit code or JSON decision). Scope to Oathbound agents using the same `agent_type` prefix check (`oathbound:`) that `run_guard` already applies, so consumer-project tasks are untouched.
- **`PreCompact` / `PostCompact` deferred.** Unverified: they accept `additionalContext` and a `sessionTitle`. Re-injecting context after compaction is only worth the cost if `SessionStart` context is observed to be lost; no evidence of that exists yet.
- **`TeammateIdle` rejected.** It targets agent-team coordination, which Oathbound does not use; the governance model is subagents under one main thread.

### Consequences

- **Good:** Governance context is present from the first turn without relying on prompt text alone.
- **Good:** Missing receipts are caught at completion rather than by the next reader.
- **Bad:** Two more hook processes per session, and `TaskCompleted` can block legitimate work on a false positive - _mitigation:_ native binary only, p95 measured against the ADR-0004 target, and an environment or `userConfig` switch to run in log-only mode (see ADR-0014).
- **Bad:** Injected context adds tokens to every session - _mitigation:_ fixed byte cap and a test that asserts it.
- **Bad:** The `agy` and `codex` packages have different hook models, so parity is not guaranteed - _mitigation:_ scope this ADR to the Claude package; record per-harness gaps in the installer reference.
- **Neutral:** `hooks/hooks.json`, `tools/build-plugin.cjs` and `test/hooks/native-parity.test.js` need updates; the hook binary embeds `VERSION`, so a bump requires a rebuild (`AGENTS.md`).

### Confirmation

- Hook tests feed payloads for both events and assert allow, block and invalid-input behavior, as the existing guard tests do.
- A latency run with `tools/bench-hooks.cjs` (referenced in ADR-0004) shows the new subcommands under the 15 ms p95 target on the reference platform.
- A test asserts the `SessionStart` output stays under the byte cap.
- Before acceptance, the unverified event semantics are checked against the vendor hooks documentation.

## Pros and Cons of the Options

### Adopt `SessionStart` and `TaskCompleted` (chosen)

- **Good:** covers context and completion with two small hooks.
- **Bad:** adds blocking behavior that needs a log-only escape hatch.

### Also adopt `PreCompact` / `PostCompact` now

- **Good:** context survives compaction.
- **Bad:** speculative; adds cost before the need is shown.

### Do nothing

- **Good:** no new latency or tokens.
- **Bad:** completion evidence stays unchecked.

## Pending Decisions

- [DECISION PENDING] Exact content and byte cap of the `SessionStart` context.
- [DECISION PENDING] Which receipt fields `TaskCompleted` enforces, and whether failure blocks or only logs in the first release.
- [DECISION PENDING] Evidence threshold for revisiting `PreCompact` / `PostCompact`.

## References

- [ADR-0004: Native Rust hooks for the hot path](0004-hooks-nativos.md)
- [ADR-0009: Per-platform packaging of the native hook binary](0009-per-platform-native-hook-packaging.md)
- [ADR-0010: Standardize subagent output contracts](0010-standardize-subagent-output-contracts.md)
- [ADR-0014: Plugin configuration and packaging](0014-plugin-configuration-and-packaging.md)
- [Claude Code hooks documentation](https://code.claude.com/docs/en/hooks) (not fetched during drafting; unverified)
