---
name: setup-alias
description: Set up the Oathkeeper shortcut for Codex CLI in the user's shell. Explicit user invocation only.
---

# Set up the Codex shortcut

Proceed only when the user explicitly invokes this skill. Apply [the shell setup instructions](references/shell-setup.md) with shortcut `codex:oathkeeper` and command `codex --profile oathkeeper`. Add `--no-daemon` if `codex --help` advertises it.

Verify that `oathkeeper.config.toml` exists under the effective `CODEX_HOME` (default `~/.codex`). If the profile is missing, report the prerequisite before writing the shortcut.
