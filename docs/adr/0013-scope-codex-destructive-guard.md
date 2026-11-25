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

Use subagent-only enforcement by default in the Codex hook template and global installer. A PreToolUse event with both identity fields absent proceeds through normal Codex approval. Events carrying either identity field remain subject to the guard. This supersedes the original opt-in default, which allowed a regular upgrade to restore session-wide blocking.

### Consequences

- Oathkeeper and the default main agent use the normal Codex approval flow for Git writes.
- Older Codex versions can omit subagent identity. Select `--codex-session-wide-guard` on each install or upgrade when the CLI lacks this metadata.

### Confirmation

Test the main-thread and subagent payloads against the same Git commands. Test installer migration in both directions and verify that unrelated hooks survive.

## References

- [Codex CLI 0.172.0 generated hook input schema](https://raw.githubusercontent.com/openai/codex/rust-v0.172.0/codex-rs/hooks/schema/generated/pre-tool-use.command.input.schema.json)
- [Installer reference](../../tools/README.md)
