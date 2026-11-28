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

Bundle a Node.js provider in the Codex plugin and register it through the plugin's MCP configuration. Node is already used in Oathbound and the provider can run directly from the same package on each platform. Selecting it in the footer picker keeps the experimental footer opt-in. The provider reuses the audit log without introducing a second state writer.

### Consequences

- The provider runs on the app-server host and reads the local audit files.
- The role list reflects the retained lifecycle events. Rotation and missing events can make the list incomplete. Codex still receives the core footer when the log is absent.
- Installing the plugin registers the server. Users select the provider in the footer picker. Standalone setups can register the same provider manually.

### Confirmation

The package test verifies distribution. The stdio test verifies the advertised resource and replays lifecycle records for two sessions.

## References

- [Implementation specification](../codex/statusline-spec.md)
- [Codex 0.172.0 statusline schema](https://github.com/openai/codex/blob/rust-v0.172.0/codex-rs/skills/src/assets/samples/create-statusline/references/statusline.d.ts)
