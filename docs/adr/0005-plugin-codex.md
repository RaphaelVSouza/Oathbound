# ADR 0005 — Local Plugin for Codex CLI

Date 2026-11-19. Status accepted.

## Context

Oathbound maintains four shared skills. Codex CLI distributes
skills in plugins and discovers plugins through marketplaces.

## Decision

Generate a local marketplace with the `oathbound` plugin, a portable
`plugin.json` manifest and a complete copy of `skills/`. The marketplace
references the plugin through a relative path. The manifest uses the package version.
[Official packaging](https://developers.openai.com/plugins/build/plugins)

## Consequences

Installation uses native Codex CLI marketplace commands.
The `oathkeeper` profile injects instructions into the main session when selected
through `codex -p oathkeeper`. TOMLs accompany the
marketplace in `setup/agents/` and are installed in Codex's native scope.
GitHub Release distributes the complete marketplace.

The optional `setup/hooks.json` file records subagent starts and ends
and blocks destructive commands through `PreToolUse`. Auditing uses the role
reported by lifecycle events. The Bash guard applies to the entire
session because the documented `PreToolUse` contract does not identify the role.
[Skills](https://learn.chatgpt.com/docs/build-skills) · [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) · [Hooks](https://learn.chatgpt.com/docs/hooks)
