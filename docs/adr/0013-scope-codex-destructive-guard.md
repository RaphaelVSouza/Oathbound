---
status: Accepted
date: 2026-11-25
decision-makers: [Oathbound Maintainers]
---

# 0013 - Scope the Codex destructive guard to subagents

## Context and Problem Statement

The session-wide destructive guard blocks authorized Git operations from Oathkeeper before Codex can evaluate approval. Codex CLI 0.172.0 supplies agent identity to PreToolUse hooks for spawned subagents. Older payloads can omit these fields for subagents.

## Considered Options

- Keep the session-wide guard for all installations.
- Enable subagent-only enforcement for all Codex installations.
- Offer subagent-only enforcement as an explicit opt-in for compatible Codex installations.

## Decision Outcome

Use explicit opt-in. In this mode, a PreToolUse event with both identity fields absent proceeds through normal Codex approval. Events carrying either identity field remain subject to the guard. The session-wide guard remains the default for installations of unknown compatibility.

### Consequences

- Oathkeeper can use the normal approval flow for Git writes with the scoped mode enabled.
- Maintainers must verify the Codex version before selecting scoped mode and repeat the flag when upgrading.

### Confirmation

Test the main-thread and subagent payloads against the same Git commands. Test installer migration in both directions and verify that unrelated hooks survive.

## References

- [Codex CLI 0.172.0 generated hook input schema](https://raw.githubusercontent.com/openai/codex/rust-v0.172.0/codex-rs/hooks/schema/generated/pre-tool-use.command.input.schema.json)
- [Installer reference](../../tools/README.md)
