---
status: Proposed # Proposed | Accepted | Rejected | Deprecated | Superseded by ADR-NNNN
date: 2026-11-25 # date of the last status change
decision-makers: [Oathbound Maintainers]
consulted: []
informed: []
---

<!-- Guide: docs/adr/como-escrever-adr.md. Target reading time: 5 to 10 minutes. -->

# 0016 - Adopt hook failure blocking and ConfigChange guard; spike output redaction

## Context and Problem Statement

The only Claude hook registered by the package is `PreToolUse` running `plugin-agent-guard` (`hooks/hooks.json`). Audit records are appended as JSONL to `agent-audit.jsonl` under `AGENT_AUDIT_DIR` or `~/.claude/state` (`native/oathbound-hook/src/guards/audit.rs`). ADR-0004 lists a `redigir` (redaction) rule as part of the guard. Today nothing protects the hook configuration itself from changes during a session, a failing hook may be treated as non-blocking by the host, and tool output is not redacted after execution. Claude Code exposes additional events and output fields that could close these gaps, with different risk profiles.

External facts below come from a secondary research report and were not verified against the vendor documentation during drafting. They are marked "unverified".

## Decision Drivers

- A security guard that silently stops running is worse than no guard (fail closed where it guards).
- Audit trails must not leave the machine by default; the repository states hooks work offline (ADR-0009).
- Latency budget of ADR-0004 (p95 below 15 ms) applies to native hooks.
- Secrets must never enter documents or logs (`AGENTS.md` and global governance).
- Features with undocumented or version-dependent semantics need a spike before adoption.

## Considered Options

Per feature, each with a verdict:

- **Hook `onFailure: block` (unverified: v2.1.295):** adopt.
- **`ConfigChange` tamper guard:** adopt.
- **`PostToolUse` `updatedToolOutput` redaction:** adopt after a spike.
- **`PermissionRequest` / `PermissionDenied`:** defer.
- **`http` / `mcp_tool` hook types for audit export:** reject by default.
- **Do nothing.**

## Decision Outcome

Chosen option: **adopt `onFailure: block` and a `ConfigChange` guard; adopt `updatedToolOutput` redaction only after a spike; defer `PermissionRequest` and `PermissionDenied`; reject remote audit export by default**, because the first two protect the existing guard at low cost, redaction has real value but unproven semantics, and remote export conflicts with the offline and privacy drivers.

- **`onFailure: block`.** Set on the `plugin-agent-guard` entry so that a crash or timeout denies the call instead of allowing it. Today the native `run_guard` already denies on invalid hook input; this closes the remaining case where the process itself fails. Unverified: the field name, its values and the version that introduced it.
- **`ConfigChange` guard, ranked first by value.** A native subcommand denies mid-session changes that would remove or weaken the Oathbound hook entries, and records the attempt in the audit file. Unverified: that the event can block, and which settings sources it reports. Scope to Oathbound entries only; do not police unrelated user settings.
- **`updatedToolOutput` redaction, after spike.** Redact secret-like values in tool output before the model sees it. The spike must show that the field is honored for the tools in scope, that redaction cannot corrupt structured output, and that false negatives are documented. Reuse the redaction logic behind `redigir` from ADR-0004 rather than adding a second rule set.
- **`PermissionRequest` / `PermissionDenied` deferred.** Unverified: precedence among hook decisions is deny, then defer, then ask, then allow. The guard already acts at `PreToolUse`; adding permission-time hooks risks double decisions with no demonstrated gap.
- **`http` / `mcp_tool` export rejected by default.** Sending audit data to a network endpoint breaks the offline driver and can leak command text. It may return later as an explicit opt-in under its own ADR.

### Consequences

- **Good:** The guard cannot be bypassed by crashing it or by editing settings mid-session.
- **Good:** Secret leakage through tool output can be reduced, once proven.
- **Bad:** `onFailure: block` turns a hook bug or slow start into a stopped session - _mitigation:_ keep the 5 second timeout under review, measure p95 per ADR-0004, and document a recovery path (disable the plugin).
- **Bad:** `ConfigChange` may block legitimate user edits - _mitigation:_ restrict to Oathbound entries and emit a clear reason.
- **Bad:** Redaction can hide data the user needs, and regex redaction has false negatives - _mitigation:_ spike first, log redaction counts without values, never log the redacted content.
- **Neutral:** Audit records gain new reasons beyond `acao_destrutiva` and `politica_do_agente`; any consumer of `agent-audit.jsonl` must tolerate them. Package rebuild and hook tests follow `AGENTS.md`.

### Confirmation

- Hook tests cover crash, timeout and invalid input for `onFailure: block` behavior, and allow, deny and unrelated-entry cases for `ConfigChange`.
- A spike report, linked from this ADR before acceptance, records the verified semantics of `updatedToolOutput` and a redaction test corpus without real secrets.
- `node tools/audit-docs.ts` reports 0 violations after the ADR changes.
- Before acceptance, every item marked unverified is checked against the vendor hooks documentation.

## Pros and Cons of the Options

### Adopt selectively (chosen)

- **Good:** protects the guard first, defers speculative features.
- **Bad:** leaves tool-output redaction open until the spike finishes.

### Adopt all, including remote export

- **Good:** richest audit and observability.
- **Bad:** network egress of command data, higher latency, new failure modes.

### Do nothing

- **Good:** no new behavior to maintain.
- **Bad:** guard can be removed or fail open.

## Pending Decisions

- [DECISION PENDING] Spike owner, scope and exit criteria for `updatedToolOutput` redaction.
- [DECISION PENDING] Which settings changes `ConfigChange` treats as tampering.
- [DECISION PENDING] Whether `onFailure: block` applies to every Oathbound hook or only the guard.
- [DECISION PENDING] Conditions under which `PermissionRequest` / `PermissionDenied` or remote export would be reopened.
- [DECISION PENDING] Verification of the `onFailure` version and event semantics against vendor documentation.

## References

- [ADR-0004: Native Rust hooks for the hot path](0004-hooks-nativos.md)
- [ADR-0009: Per-platform packaging of the native hook binary](0009-per-platform-native-hook-packaging.md)
- [ADR-0014: Plugin configuration and packaging](0014-plugin-configuration-and-packaging.md)
- [ADR-0015: Context and completion hooks](0015-context-and-completion-hooks.md)
- [Claude Code hooks documentation](https://code.claude.com/docs/en/hooks) (not fetched during drafting; unverified)
