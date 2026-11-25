---
status: Proposed
date: 2026-11-25
decision-makers: [Raphael Vieira]
consulted: []
informed: []
---

<!-- Guide: docs/adr/como-escrever-adr.md. Target reading time: 5 to 10 minutes. -->

# 0017 - Adopt agent and skill frontmatter fields selectively and defer output styles

## Context and Problem Statement

Claude Code exposes frontmatter fields for plugin agents (`effort`, `maxTurns`, `memory`, `isolation`, `skills`, `omitClaudeMd`), fields for skills (`paths`, `context: fork`, `when_to_use`, `allowed-tools`) and a plugin `outputStyles` surface with `force-for-plugin`. Oathbound ships eight Claude agents in `claude/agents/` and eleven portable skills in `skills/`, shared across Claude Code, Antigravity and Codex. Adopting a field changes a contract that three runners and installed projects depend on, so each field needs a verdict.

Verified in this repository: the agent frontmatter in `claude/agents/*.md` uses only `name`, `description`, `tools` and `model`, plus `skills: [appsec-reference]` in `sentinel`. No agent declares `effort`, `maxTurns`, `memory`, `isolation` or `omitClaudeMd`. Skill frontmatter in `skills/*/SKILL.md` uses `name` and `description`, plus `disable-model-invocation` in `grill-me` and `incident-postmortem`. `.claude-plugin/plugin.json` declares no `outputStyles` key. `oathkeeper` already selects model and effort per subtask and states that per-invocation effort needs Claude Code v2.1.292 or later.

Facts about the Claude Code fields come from a prior research report (status PARTIAL, confidence MEDIUM) citing the Claude Code documentation at `code.claude.com/docs` (sub-agents, skills, output-styles, plugins reference). They were not re-fetched for this ADR and are marked unverified below.

## Decision Drivers

- Keep the portable skill core compatible with the open Agent Skills format, per [ADR-0008](0008-portable-and-harness-exclusive-skills.md) and [ADR-0006](0006-skills-override-por-cli.md).
- Keep routing in the orchestrator with capability checks, per [ADR-0007](0007-route-subagent-models-by-task-complexity.md), without role variants per model or effort.
- Preserve the receipt contracts of [ADR-0010](0010-standardize-subagent-output-contracts.md) and the project-rule model (exceptions live in the installing project's `AGENTS.md`).
- Do not change user experience or persist state in consumer projects without opt-in.
- Do not rely on facts that were not verified against primary sources.

## Considered Options

- Adopt every field to maximize Claude Code coverage.
- Adopt a small subset with a verified benefit, defer the rest, reject fields that conflict with existing decisions.
- Adopt none and keep the current frontmatter.

## Decision Outcome

Chosen option: **"Adopt a small subset, defer the rest, reject conflicting fields"**, because it captures low-risk value without forking the portable skill core or overriding the orchestrator's routing. Verdicts per feature:

| Feature | Verdict | Reason |
| --- | --- | --- |
| Agent `skills` (preload) | Adopt, no new work | Already used by `sentinel`. Extend to another role only with evidence that the Skill tool load costs turns. |
| Agent `maxTurns` | Adopt for read-only roles (`scout`, `scholar`, `assayer`) after a runtime check | Bounds runaway exploration at low risk. Semantics when the limit hits (partial output vs. error) are unverified; the receipt `GAPS` line must still be emitted. |
| Agent `effort` | Defer | Frontmatter fixes effort per role, which [ADR-0007](0007-route-subagent-models-by-task-complexity.md) rejects in favor of orchestrator selection. Revisit if per-invocation effort proves unreliable. |
| Agent `isolation` | Defer | Worktree isolation for `smith` is plausible, but git write operations are denied by the guard hook and the interaction is unverified. |
| Agent `memory` | Reject | Persists state across sessions in consumer projects without opt-in. It conflicts with keeping this repository independent of consumer data. |
| Agent `omitClaudeMd` | Reject | Roles must read the installing project's `AGENTS.md` and `CLAUDE.md`, where governance exceptions live. |
| Plugin agents ignore `permissionMode`, `hooks`, `mcpServers` | Constraint, unverified | Treat as a design limit: guardrails stay in plugin-level `hooks/hooks.json`, not agent frontmatter. |
| Skill `allowed-tools` | Defer | Not part of the portable format. If adopted, place it only in `SKILL.claude.md` overrides per ADR-0006. |
| Skill `paths` | Defer | No current skill is path-scoped. Revisit when a Claude-only skill needs it. |
| Skill `context: fork` | Defer | Overlaps with subagent delegation and the ADR-0008 harness-exclusive layer. |
| Skill `when_to_use` | Reject | Trigger guidance already lives in `description`, which is the portable field. |
| `outputStyles` | Defer | `oathkeeper` already applies its response style by prompt. A packaged style adds a manifest key and build step with no verified gain. |
| `force-for-plugin` | Reject | Overrides the user's own output style. |
| Plugin theme | Defer | Cosmetic, no governance value. |

This applies to new and edited agents only. Existing agents keep their frontmatter until touched. Any adoption is a separate change that updates `VERSION`, `CHANGELOG.md` and tests in the same delivery, per `AGENTS.md`.

### Consequences

- **Good:** Portable skills stay on `name` and `description`; no new per-runner divergence.
- **Good:** Routing stays in one place (`oathkeeper`), consistent with ADR-0007.
- **Bad:** Claude-only controls (`effort`, `isolation`, `allowed-tools`) remain unused, so some safety and cost levers are left on the table — _mitigation:_ revisit deferred items once their behavior is verified against current Claude Code documentation.
- **Bad:** `maxTurns` could truncate a legitimate long read-only task — _mitigation:_ set a generous limit and keep the `GAPS` line mandatory in receipts.
- **Neutral:** Related plugin-level decisions sit in [ADR-0014](0014-plugin-configuration-and-packaging.md) (configuration and packaging), [ADR-0015](0015-context-and-completion-hooks.md) and [ADR-0016](0016-security-and-audit-hooks.md) (hooks), and ADR-0018 (experimental surfaces).

### Confirmation

- Review checklist: a new frontmatter field in `claude/agents/` or `skills/` cites this ADR or a superseding one.
- `node --test "test/*.test.ts" "test/*.test.cjs" "test/*/*.test.js"` stays green; `test/agents/model-routing.test.js` covers routing text.
- `node tools/audit-docs.ts` reports 0 violations.
- Before adopting `maxTurns`, run one read-only agent to the limit and record the observed behavior.

## Pros and Cons of the Options

### Adopt every field

- **Good:** because it exposes full Claude Code capability.
- **Bad:** because it forks agent and skill contracts across three runners and contradicts ADR-0007 and ADR-0008.

### Adopt a small subset, defer the rest, reject conflicting fields

- **Good:** because each verdict ties to an existing decision or a verified repository fact.
- **Bad:** because deferred items need a later review.

### Adopt none

- **Good:** because it has no change cost.
- **Bad:** because it ignores a cheap bound (`maxTurns`) and an already-used field (`skills`) without recording why.

## References

- [ADR-0006](0006-skills-override-por-cli.md), [ADR-0007](0007-route-subagent-models-by-task-complexity.md), [ADR-0008](0008-portable-and-harness-exclusive-skills.md), [ADR-0010](0010-standardize-subagent-output-contracts.md).
- [ADR-0014](0014-plugin-configuration-and-packaging.md), [ADR-0015](0015-context-and-completion-hooks.md), [ADR-0016](0016-security-and-audit-hooks.md): related plugin and hook surfaces.
- Claude Code docs (unverified here, not re-fetched): `code.claude.com/docs` sub-agents, skills, output-styles and plugins reference pages.
