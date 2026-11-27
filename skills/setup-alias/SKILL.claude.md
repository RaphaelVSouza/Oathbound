---
name: setup-alias
description: Set up the Oathkeeper shortcut for Claude Code in the user's shell. Explicit user invocation only.
disable-model-invocation: true
---

# Set up the Claude Code shortcut

Proceed only when the user explicitly invokes this skill. Apply [the shell setup instructions](references/shell-setup.md) with shortcut `claude:oathkeeper`. Use `claude --agent oathbound:oathkeeper` when the Oathbound plugin is enabled, or `claude --agent oathkeeper` when only the standalone agent is installed.

Check the CLI and agent installation before writing. If neither agent is available, report the prerequisite.
