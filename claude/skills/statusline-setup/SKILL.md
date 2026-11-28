---
name: statusline-setup
description: >-
  Explain Claude Code's native task and subagent monitoring. Activate ONLY when
  the user requests /oathbound:statusline-setup or asks how to monitor tasks,
  subagents, or configure the Oathbound status line.
disable-model-invocation: true
---

# Native task and subagent monitoring

Use Claude Code's built-in subagent panel and task view. This skill provides guidance without editing settings or launching a renderer.

## Show progress

- Use `/tasks` to inspect running background shells and subagents.
- The native subagent panel beneath the prompt shows activity and elapsed time. Background subagent completion notifications include duration in Claude Code v2.1.144 and later. [Subagent panel](https://code.claude.com/docs/en/sub-agents#finished-subagents-in-the-panel-and-task-list) · [Claude Code changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)

## Existing custom status lines

If the user wants to remove their Oathbound renderer, direct them to the settings file where they configured it and explain how to remove its `statusLine` entry. Preserve other settings and custom renderers. [Claude Code status line settings](https://code.claude.com/docs/en/statusline#disable-the-status-line)
