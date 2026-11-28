---
status: Accepted
date: 2026-11-25
decision-makers: [Raphael Vieira]
---

# 0011 - Use an opt-in MCP provider for the Codex footer

## Context and Problem Statement

Codex's built-in footer fields do not expose subagent roles. The experimental custom footer accepts an MCP UI tree and supplies the displayed thread ID. Oathbound's Codex hooks already record lifecycle events with full session and agent IDs.

## Considered Options

- Keep the built-in footer and use Codex's subagent picker to inspect agents.
- Publish the custom footer from a Node.js stdio provider that reads the existing audit log.
- Add an MCP subcommand to the native hook and make the existing native binary an explicit footer setup dependency.

## Decision Outcome

Use the built-in footer and `/subagents` for native inspection. Ship the Node.js provider in the Codex package's `setup/` directory for users who want a timer in their footer. The provider reuses the audit log without introducing a second state writer.

### Consequences

- The provider runs on the app-server host and reads the local audit files.
- The role list reflects the retained lifecycle events. Rotation and missing events can make the list incomplete. Codex still receives the core footer when the log is absent.
- Users who want the timer register the server manually and select the provider in the footer picker. This replaces the original automatic registration decision as of 2026-11-28.

### Confirmation

The package test verifies distribution. The stdio test verifies the advertised resource and replays lifecycle records for two sessions.

## References

- [Implementation specification](../codex/statusline-spec.md)
- [Codex 0.172.0 statusline schema](https://github.com/openai/codex/blob/rust-v0.172.0/codex-rs/skills/src/assets/samples/create-statusline/references/statusline.d.ts)
