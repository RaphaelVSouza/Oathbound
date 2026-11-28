---
status: Approved
date: 2026-11-25
owner: Raphael Vieira
---

# Oathbound footer for Codex

## Objective and scope

Show the Oathbound mark, model, remaining context, and subagent roles in the Codex terminal footer. Ship an opt-in stdio MCP provider in the Codex package and support registration from a checkout.

## Contracts and data

- Use the built-in footer by default and `/subagents` to inspect active threads. The plugin registers the optional `oathbound-statusline` provider in `mcp.json`. Standalone users can register `setup/statusline.cjs` manually. Its `statusline` tool advertises `ui://oathbound-statusline/footer` through the Codex UI entrypoint metadata.
- Read the displayed thread ID from the snapshot on each resource request. In Codex 0.172.0 the root thread ID is also the session ID carried by the lifecycle hooks.
- Replay the existing audit records in file order, from oldest retained file to current file. Use the full session ID and agent ID. A start adds or updates an agent and a stop removes it. Repeated events are idempotent.
- Read the host's audit files using the same directory precedence as the hooks. The bundled provider inherits `AGENT_AUDIT_DIR` and `CODEX_HOME` when set. For standalone setup, pass these variables at registration. Cap each file read and use complete records. Missing files and invalid records leave the branded footer available.
- Use single-line text with up to four agent labels and an overflow count. Further changes to experiment availability and polling follow Codex.
- Show active subagent elapsed time when the audit start has a timestamp. Resolve the Git project and branch from the displayed thread's working directory with a bounded lookup.
- Read the audit files asynchronously. Run the audit and Git lookups in parallel and give each 300 ms per attempt, with one retry. Omit unavailable audit details and use the working directory name if Git is unavailable. Return the available snapshot fields within the client's one-second read budget. Each poll can recover the enriched footer independently.
- Codex 0.172.0 stops polling on an MCP read failure. Its built-in footer can be selected in `/statusline` and uses `[tui].status_line` for its fields. Reselect Oathbound to restart polling.
- Show total input/output tokens, 5h (300 min) and weekly (10080 min) remaining quota from `account.rate_limits` (hide windows already reset), `usage.cost.total_cost_usd`, and a `/compact` hint at 15% or less context remaining. Omit any value the snapshot lacks. Duration and line counts are not available and are not shown.
- Highlight 20% or less remaining context. Show a hook-block warning for 60 seconds when the Codex audit contains a matching thread ID. The Codex subagent guard writes denials to that audit.

## Validation and acceptance

- Exercise discovery and rendering through the provider's stdio interface.
- Verify start, stop, thread isolation, rotated logs, malformed records, and overflow.
- Inject slow audit reads and verify the response deadline, retry limit, snapshot fallback, and recovery through stdio.
- Verify that the package registers the bundled provider and ships the standalone script. Check live discovery from the installed plugin in an isolated Codex configuration.

## References

- [ADR-0011](../adr/0011-use-mcp-for-the-codex-footer.md)
- [Codex 0.172.0 statusline guide](https://github.com/openai/codex/blob/rust-v0.172.0/codex-rs/skills/src/assets/samples/create-statusline/SKILL.md)
