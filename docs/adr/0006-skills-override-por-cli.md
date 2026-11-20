---
status: Accepted
date: 2026-11-20
decision-makers: [Raphael]
consulted: []
informed: []
---

# 0006 - Optional Per-CLI Skill Overrides via `SKILL.<runner>.md`

## Context and Problem Statement

Oathbound skills are shared across three CLIs (`claude`, `agy` and `codex`). Until now, [`tools/install.ts`](../../tools/install.ts) and [`tools/build-plugin.cjs`](../../tools/build-plugin.cjs) copied `skills/<nome>/` identically for all runners.

When a skill references a CLI-specific native tool (for example, `AskUserQuestion` in Claude Code, `ask_question` in Antigravity or `request_user_input` in Codex), text coupled to one runner degrades execution in the others.

## Decision Drivers

- Avoid full duplication of identical skills across CLIs.
- Allow narrow optimization when a skill depends on a runner-specific tool.
- Keep the installed/packaged format compatible with each CLI's standard contract (`<skill>/SKILL.md`).
- Do not leak other runners' files into the installation or plugin artifact.

## Considered Options

- **Option 1: canonical `SKILL.md` + optional `SKILL.<runner>.md` override resolved at installation and build time.**
- **Option 2: single `SKILL.md` fully agnostic of CLI tools.**
- **Option 3: separate `claude/skills/`, `agy/skills/` and `codex/skills/` directories.**

## Decision Outcome

Chosen option: **"Option 1 (canonical `SKILL.md` + optional `SKILL.<runner>.md` override)"**, because it preserves a single source of truth for agnostic skills and allows adapting only skills that reference CLI-specific tools.

Resolution rules in [`tools/install.ts`](../../tools/install.ts) and [`tools/build-plugin.cjs`](../../tools/build-plugin.cjs):

1. For each runner (`claude`, `agy`, `codex`), if `skills/<nome>/SKILL.<runner>.md` exists, write it as `SKILL.md` at that runner's destination.
2. Otherwise, write `skills/<nome>/SKILL.md` normally.
3. Never copy `SKILL.<outro-runner>.md` files to the destination.

### Consequences

- **Good:** agnostic skills retain a single file; skills coupled to native tools deliver exact instructions for each CLI.
- **Bad:** skills with overrides require keeping text synchronized between `SKILL.md` and `SKILL.<runner>.md` — _mitigation:_ restrict overrides to skills that reference CLI-specific tools.
- **Neutral:** `tools/install.ts` and `tools/build-plugin.cjs` apply the same per-runner skill resolution function.

### Confirmation

- Automated tests in [`test/build-plugin.test.cjs`](../../test/build-plugin.test.cjs) and [`test/install.test.ts`](../../test/install.test.ts) cover `SKILL.<runner>.md` -> `SKILL.md` resolution, fallback to `SKILL.md` and absence of leaked overrides from other runners.

## References

- [`skills/grill-me/SKILL.md`](../../skills/grill-me/SKILL.md)
- [`tools/install.ts`](../../tools/install.ts)
- [`tools/build-plugin.cjs`](../../tools/build-plugin.cjs)
