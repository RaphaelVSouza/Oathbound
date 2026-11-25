---
name: statusline-setup
description: >-
  Enable the Oathbound native status line in Antigravity CLI (agy) by writing
  the `statusLine` setting. Activate ONLY when the user requests
  /statusline-setup or asks to install the Oathbound status line for agy.
disable-model-invocation: true
---

# Antigravity CLI Statusline Setup

This skill configures `statusLine` in `~/.gemini/antigravity-cli/settings.json`, with user consent, using the `oathbound-hook` native binary.

## Steps

1. **Locate the binary.** Search for `oathbound-hook` (`oathbound-hook.exe` on Windows) in:
   - `~/.gemini/antigravity-cli/oathbound-hook`
   - `~/.gemini/config/plugins/oathbound/native/bin/`
   - A local Oathbound checkout (`native/bin/oathbound-hook-<platform>-<arch>` or `native/oathbound-hook/target/release/oathbound-hook`).
   If no binary exists, stop and tell the user to build it with `cargo build --locked --release --manifest-path native/oathbound-hook/Cargo.toml`.
2. **Use a stable path.** Copy the binary to `~/.gemini/antigravity-cli/oathbound-hook` (`.exe` on Windows). If that file already exists and differs, ask before replacing it; never overwrite silently.
3. **Read `~/.gemini/antigravity-cli/settings.json`.** If it has a `statusLine` entry, show it and ask before replacing. If the user declines, stop and change nothing.
4. **Write the entry**, merging with the existing JSON and preserving every other key:

   ```json
   "statusLine": {
     "type": "command",
     "command": "\"<absolute path to ~/.gemini/antigravity-cli/oathbound-hook>\" statusline",
     "padding": 0
   }
   ```

   Use forward slashes in the path. Keep the file valid JSON.
5. **Validate.** Run `echo '{}' | "<path>" statusline` and expect exit 0. Report the result.
6. **Tell the user** to restart `agy` (or run `/statusline` to toggle). To undo, delete `statusLine` from `~/.gemini/antigravity-cli/settings.json` or run `/statusline delete`.

## Rules

- Edit only `~/.gemini/antigravity-cli/settings.json` and the copied binary. Never touch project settings, hooks, or permissions.
- Never print other settings values; they may hold secrets.
- Report only validations you ran.
