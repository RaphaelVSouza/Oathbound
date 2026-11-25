---
status: Approved
date: 2026-11-25
owner: Raphael Vieira
---

# Oathbound footer for Codex

## Objective and scope

Show the Oathbound mark, model, remaining context, and subagent roles in the Codex terminal footer. Ship an opt-in stdio MCP provider in the Codex package and support registration from a checkout.

## Contracts and data

- Register the server as `oathbound-statusline` in the plugin's `mcp.json` and keep the same registration name for standalone setup. Its `statusline` tool advertises `ui://oathbound-statusline/footer` through the Codex UI entrypoint metadata.
- Read the displayed thread ID from the snapshot on each resource request. In Codex 0.172.0 the root thread ID is also the session ID carried by the lifecycle hooks.
- Replay the existing audit records in file order, from oldest retained file to current file. Use the full session ID and agent ID. A start adds or updates an agent and a stop removes it. Repeated events are idempotent.
- Read the host's audit files using the same directory precedence as the hooks. The Codex manifest overlay forwards `AGENT_AUDIT_DIR` and `CODEX_HOME` to the bundled server when set. Cap each file read and use complete records. Missing files and invalid records leave the branded footer available.
- Use single-line text with up to four agent labels and an overflow count. Further changes to experiment availability and polling follow Codex.

## Validation and acceptance

- Exercise discovery and rendering through the provider's stdio interface.
- Verify start, stop, thread isolation, rotated logs, malformed records, and overflow.
- Verify that Codex discovers the provider from the installed plugin with an isolated configuration.

## References

- [ADR-0011](../adr/0011-use-mcp-for-the-codex-footer.md)
- [Codex 0.172.0 statusline guide](https://github.com/openai/codex/blob/rust-v0.172.0/codex-rs/skills/src/assets/samples/create-statusline/SKILL.md)
