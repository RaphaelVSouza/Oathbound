---
status: Accepted
date: 2026-11-24
decision-makers: [Oathbound Maintainers]
consulted: []
informed: []
---

<!-- Guide: docs/adr/como-escrever-adr.md. Target reading time: 5 to 10 minutes. -->

# 0008 - Layered Portability and Harness-Exclusive Skills

## Context and Problem Statement

Oathbound distributes skills across Claude Code, Antigravity (`agy`), and Codex CLI. While many workflows can be shared in `skills/<name>/` (with optional `SKILL.<runner>.md` overrides per [ADR-0006](0006-skills-override-por-cli.md)), some skills depend deeply on harness-specific primitives (e.g., interactive question forms, subagent orchestration, or runner-native hooks) that cannot be expressed cleanly in a single cross-harness package without bloating shared prompts or breaking compatibility.

## Decision Drivers

- Keep shared skills clean and compatible with the open [Agent Skills specification](https://agentskills.io/specification.md).
- Allow each harness to host skills tailored to its own native tools without leaking them into other harnesses' builds or installs.
- Support project-level universal skill discovery via `.agents/skills/` alongside harness-native plugin layouts.

## Considered Options

- **Single shared `skills/` directory with conditional fallback prose for all skills.**
- **Three-layer architecture: portable core (`skills/`), symmetric harness-exclusive directories (`agy/config/skills/`, `claude/skills/`, `codex/skills/`), and bus-aware installation (`.agents/skills/`).**

## Decision Outcome

Chosen option: **"Three-layer architecture"**, because it keeps portable skills minimal and interoperable while giving each harness a first-class, isolated space for tool-specific skills.

1. **Layer 1 — Portable Core (`skills/<name>/`)**: Follows the open Agent Skills format (`name`, `description` frontmatter, concise `SKILL.md`, `references/` and `scripts/` at most one directory level deep). Runner differences limited to instructions use `SKILL.<runner>.md` ([ADR-0006](0006-skills-override-por-cli.md)).
2. **Layer 2 — Harness-Exclusive Skills**: Skills built around harness-native tools live in `agy/config/skills/<name>/`, `claude/skills/<name>/`, or `codex/skills/<name>/`. `tools/build-plugin.cjs` and `tools/install.ts` include each directory only for its matching runner and deduplicate project installs against global user installs.
3. **Layer 3 — Bus & Distribution**: Project-level `agy` installs target `.agents/skills/` (the cross-agent bus), while global installs and plugin builds (`build-plugin.cjs`) target each harness's native layout.

### Consequences

- **Good:** Shared skills stay lean; harness-exclusive skills can use native tools without polluting other runners.
- **Good:** Symmetric `RUNNER_EXCLUSIVE_SKILL_DIRS` handling avoids per-runner special-case drift.
- **Bad:** Maintaining harness-exclusive equivalents of the same capability requires explicit synchronization via shared behavioral specs (see [docs/prompts/create-skill-from-spec.md](../prompts/create-skill-from-spec.md)) — _mitigation:_ keep behavioral specs and invariants in `docs/prompts/` as the single source of truth.

### Confirmation

- `node test/build-plugin.test.cjs` verifies runner isolation for `agy`, `claude`, and `codex` exclusive skill directories.
- `node test/install.test.ts` verifies exclusive skill installation and global-vs-project deduplication.
- `node tools/audit-docs.ts` verifies documentation links and traceability.

## References

- [ADR-0006: Per-CLI skill overrides](0006-skills-override-por-cli.md)
- [Agent Skills Specification](https://agentskills.io/specification.md)
- [Generic prompt: create a harness-native skill from a spec](../prompts/create-skill-from-spec.md)
