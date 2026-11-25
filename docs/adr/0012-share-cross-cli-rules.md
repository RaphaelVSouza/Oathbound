---
status: Proposed
date: 2026-11-25
decision-makers: [Oathbound Maintainers]
consulted: []
informed: []
---

# 0012 - Share common rules across separate CLI configurations

## Context and Problem Statement

Oathbound ships separate configurations for Claude Code, Antigravity, and Codex. The Oathkeeper receipt contract repeats across agent definitions, and the sync tool appends missing rules without replacing older wording. The package builder and direct installer also implement skill selection and native binary discovery independently. A change to a shared rule can therefore require several coordinated edits across CLI and delivery paths.

## Decision Drivers

- One hand-edited source per shared rule.
- Changes to CLI-specific instructions affect only that CLI.
- Preserve the effective instructions, selected files, and supported installation paths during conversion.
- Keep the toolchain dependency-free and make changes reversible in small steps.
- Use English consistently across all project-owned source files and shipped artifacts.

## Considered Options

| Option | Benefit | Cost |
| --- | --- | --- |
| Keep separate files and enforce consistency with tests | Direct editing and straightforward review of shipped files | Tests detect drift after edits and maintainers still coordinate repeated changes |
| Share specific rules and render them into CLI-owned files | Shared changes have one edit point and CLI-specific behavior stays locally editable | Adds rendering and parity checks to build and install paths |
| Generate every CLI configuration from a common model | Uniform structure and centralized generation | A larger transition and more renderer logic to express CLI-specific behavior |

## Decision Outcome

We propose sharing specific rules while keeping separate CLI configurations. A common source will own the receipt fields, confidence rules, and receipt handling shared by Oathkeeper and its subagents. Rendering will replace the complete shared blocks and produce native CLI files. Each CLI will own its model routing, tools, invocation instructions, and format-specific configuration.

Use one skill-selection implementation for packaging and direct installation. Start there to verify parity across both delivery paths, then convert the receipt contract. Consolidate native binary discovery when touching the relevant tooling. For Claude guard wiring and audit events, first establish parity and compatibility through fixtures covering both delivery paths or both readers, as applicable.

### Project language

Use English throughout the project for code identifiers and filenames, including variables and hooks, as well as comments, tests, configuration, documentation, agent and skill instructions, and user-facing messages. Apply this requirement to all three CLI configurations and to the shared sources that render them.

Inventory and migrate existing Portuguese names and text in reviewable batches. For each rename, update its callers, configuration references, and tests together. Where a name is part of a shipped contract or persisted data, define and test a compatibility path before renaming it.

### Consequences

- **Good** — A shared rule change has one source edit, and each CLI still ships its own configuration.
- **Bad** — Rendered instructions depend on tooling. Require deterministic output and compare the initial conversion with the existing files before adoption.
- **Neutral** — Shared rules migrate incrementally. Existing behavior remains the baseline for each conversion.

### Confirmation

- For each CLI, compare the skills selected by packaging and direct installation, including overrides, fallbacks, and runner-specific metadata.
- Verify that a single receipt-rule edit reaches all three CLI outputs, replaces the prior rule, and passes the existing contract tests.
- Verify that a CLI-specific edit changes only that CLI output. Compare the initial render with the existing instructions and account for every intentional difference.
- Review the language inventory against source files and all three packaged outputs. For each migration batch, verify the affected hooks, references, and any compatibility paths.
- Reassess if a shared-rule edit still requires multiple hand edits or any supported delivery path produces different effective instructions.

**[DECISION PENDING]** Maintainer approval and the parity checks above. Source inspection establishes duplication. The frequency and cost of coordinated edits and runtime divergence remain unmeasured.

## References

- [ADR-0008 on portable and harness-exclusive skills](0008-portable-and-harness-exclusive-skills.md)
- [ADR-0010 on subagent output contracts](0010-standardize-subagent-output-contracts.md)
- [Package builder](../../tools/build-plugin.cjs) and [direct installer](../../tools/install.ts)
- [Agent sync tool](../../test/agents/sincronia.js) and [cross-CLI contract tests](../../test/agents/model-routing.test.js)
