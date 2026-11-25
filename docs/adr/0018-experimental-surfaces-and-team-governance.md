---
status: Proposed
date: 2026-11-25
decision-makers: [Raphael Vieira]
consulted: []
informed: []
---

<!-- Guide: docs/adr/como-escrever-adr.md. Target reading time: 5 to 10 minutes. -->

# 0018 - Defer experimental plugin surfaces and document managed-settings guidance only

## Context and Problem Statement

Claude Code documents experimental plugin surfaces (`experimental.monitors`, `experimental.evals`, `experimental.themes`), managed settings that teams can enforce (`allowManagedHooksOnly`, `strictPluginOnlyCustomization`, `blockReadsOutsideWorkingDirectories`, `blockWrites...` variants) and a `/loop` command for recurring prompts. Oathbound is a governance package whose value depends on stable contracts across Claude Code, Antigravity and Codex, and `AGENTS.md` forbids changing CI/CD, secrets, dependencies or infrastructure without a request.

Verified in this repository: `.claude-plugin/plugin.json` declares `skills` and `agents` only (no `experimental` key). `hooks/hooks.json` registers a single `PreToolUse` hook (matcher `Bash|PowerShell|Read`, command `plugin-agent-guard`, timeout 5). `claude/settings.json` and `claude/settings.playwright.json` exist. The `loop` and `schedule` skills in this session come from the host, not from this repository.

The names, availability and semantics of the experimental keys, the managed settings and `/loop` come from a prior research report (status PARTIAL, confidence MEDIUM). They were not re-fetched for this ADR and are all unverified, including the settings-reference and managed-settings details and the Claude Code versions in which they appeared.

## Decision Drivers

- Experimental surfaces may change or disappear; the package already tracks a moving alpha version (`0.50.0-alpha.65` in `.claude-plugin/plugin.json`).
- Managed settings belong to the installing organization, not to a plugin; the repository must stay independent of consumer rules, hosts and paths.
- Evidence standard: do not adopt behavior whose documentation was not verified.
- Cost of maintenance across three runners with no equivalent experimental surface in `agy` or `codex`.

## Considered Options

- Adopt experimental surfaces and ship managed-settings defaults in the package.
- Defer experimental surfaces, and publish managed-settings guidance only as documentation.
- Reject all of it and document nothing.

## Decision Outcome

Chosen option: **"Defer experimental surfaces, guidance only for managed settings"**, because experimental keys carry contract risk and managed settings are an organizational decision that the plugin must not impose. Verdicts per feature:

| Feature | Verdict | Reason |
| --- | --- | --- |
| `experimental.monitors` | Defer | Candidate for background audit monitoring, but depends on hook-audit decisions in ADR-0016 and on unverified semantics. Revisit once the key is documented as stable. |
| `experimental.evals` | Defer | Could host agent receipt checks beyond `test/agents/model-routing.test.js`, but the existing `node --test` suite already covers contracts without an experimental dependency. |
| `experimental.themes` | Reject | Cosmetic, no governance value, and not portable to `agy` or `codex`. |
| `allowManagedHooksOnly` | Guidance only | An organization can use it so only managed hooks run. Note in docs that this would block the plugin's own `hooks/hooks.json` unless the plugin is managed. Effect unverified. |
| `strictPluginOnlyCustomization` | Guidance only | Fits teams that want plugin-only agents and skills. Effect on user-level installs unverified. |
| `blockReadsOutsideWorkingDirectories` / `blockWrites...` | Guidance only | Complements, but does not replace, the `plugin-agent-guard` hook. Exact key names unverified. |
| `/loop` | Reject as a package feature | A host-provided command; the package adds no skill or wrapper for it. `AGENTS.md` already says repository skills are run only when asked. |

Guidance means a short section in an existing guide after the keys are verified against `code.claude.com/docs` settings and managed-settings pages. No default managed-settings file ships in the package. This applies to new work only; nothing in the current plugin changes.

### Consequences

- **Good:** The plugin manifest and hook contract stay stable and identical in shape across runners.
- **Good:** No organization-level policy is imposed on installers.
- **Bad:** Teams get no turnkey enforcement from the package — _mitigation:_ a verified guidance section once the settings are confirmed.
- **Bad:** Deferred monitors and evals delay possible runtime audit gains — _mitigation:_ revisit after ADR-0016 outcomes.
- **Neutral:** Any later adoption needs its own ADR, plus `VERSION`, `CHANGELOG.md` and test updates in the same delivery.

### Confirmation

- Review checklist: `.claude-plugin/plugin.json` contains no `experimental` key until a superseding ADR is Accepted.
- `node --test "test/*.test.ts" "test/*.test.cjs" "test/*/*.test.js"` and `node tools/audit-docs.ts` stay green.
- Before writing guidance, fetch the settings-reference and managed-settings pages and record version and access date; otherwise keep the item labeled unverified.

## Pros and Cons of the Options

### Adopt experimental surfaces and ship managed defaults

- **Good:** because it offers turnkey audit and enforcement.
- **Bad:** because it ties the package to unstable keys and overrides organizational policy.

### Defer, guidance only

- **Good:** because it keeps contracts stable and respects ownership of managed settings.
- **Bad:** because value is delayed and guidance needs later verification.

### Reject and document nothing

- **Good:** because it needs no work.
- **Bad:** because teams lose a pointer to controls that complement the guard hook.

## References

- [ADR-0007](0007-route-subagent-models-by-task-complexity.md), [ADR-0008](0008-portable-and-harness-exclusive-skills.md), [ADR-0010](0010-standardize-subagent-output-contracts.md).
- [ADR-0014](0014-plugin-configuration-and-packaging.md), [ADR-0015](0015-context-and-completion-hooks.md), [ADR-0016](0016-security-and-audit-hooks.md), [ADR-0017](0017-agent-skill-and-output-style-surfaces.md): packaging, hooks, agent and skill surfaces.
- Claude Code docs (unverified here, not re-fetched): `code.claude.com/docs` plugins reference, settings and scheduled-tasks pages.
