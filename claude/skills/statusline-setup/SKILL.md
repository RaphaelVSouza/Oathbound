---
name: statusline-setup
description: >-
  Enable the Oathbound native status line in Claude Code by writing the
  `statusLine` setting. Activate ONLY when the user requests
  /oathbound:statusline-setup or asks to install the Oathbound status line.
disable-model-invocation: true
---

# Statusline setup

A Claude plugin cannot set `statusLine` itself. This skill writes it into the user's settings, with consent, using the `oathbound-hook` binary bundled in this plugin.

## Steps

1. **Locate the binary.** Plugin copy: `${CLAUDE_PLUGIN_ROOT}/native/bin/oathbound-hook` (`oathbound-hook.exe` on Windows). If the variable shows up unexpanded, find the file with Glob under `~/.claude/plugins/`. If no binary exists, stop and report it.
2. **Use a stable path.** The plugin cache path changes on upgrade. Copy the binary to `~/.claude/hooks/oathbound-hook` (`.exe` on Windows). If that file already exists and differs, ask before replacing it; never overwrite silently.
3. **Read `~/.claude/settings.json`.** If it has a `statusLine` entry, show it and ask before replacing. If the user declines, stop and change nothing.
4. **Write the entry**, merging with the existing JSON and preserving every other key:

   ```json
   "statusLine": {
     "type": "command",
     "command": "\"<absolute path to ~/.claude/hooks/oathbound-hook>\" statusline",
     "padding": 0
   }
   ```

   Use forward slashes in the path. Keep the file valid JSON.
5. **Validate.** Run `echo '{}' | "<path>" statusline` and expect exit 0. Report the result.
6. **Tell the user** to restart Claude Code. To undo, delete the `statusLine` field from `settings.json` or run `/statusline` and ask to clear it.

## Rules

- Edit only `~/.claude/settings.json` and the copied binary. Never touch project settings, hooks, or permissions.
- Never print other settings values; they may hold secrets.
- Report only validations you ran.
