---
name: statusline-setup
description: >-
  Explain Antigravity CLI's native status line and agent commands. Activate ONLY
  when the user requests /statusline-setup or asks about agy status line setup.
disable-model-invocation: true
---

# Antigravity CLI Status Line

Antigravity CLI provides its status line and agent interface. Keep the native status line configuration: the default footer is controlled by Antigravity CLI, so Oathbound does not need a custom renderer or a `statusLine` command in user settings.

See the [Antigravity CLI status line documentation](https://antigravity.google/docs/cli-statusline?app=cli) for status line controls. The `/agents` command opens the agent interface; press Enter on an agent to expand or open it. See the [agents command documentation](https://antigravity.google/docs/cli/commands/agents/) for details.

If the user already has an Oathbound `statusLine` command configured and wants to remove it, direct them to run `/statusline reset` themselves. Do not run commands, edit user settings, install or copy binaries, or claim that a live elapsed-time display is available.
