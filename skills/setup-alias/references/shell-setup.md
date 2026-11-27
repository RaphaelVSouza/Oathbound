# Install a shell shortcut

1. Identify the shell the user opens interactively. Prefer their explicit choice, then reliable parent-process and shell configuration evidence. The tool shell and terminal emulator can differ from the interactive shell. Ask which shell to target if the evidence is ambiguous. Configure one shell and one runner.
2. Resolve the real CLI and verify its required flags with local help. Use the shell's current-user configuration. Inspect the effective command and relevant startup files for a conflicting definition. An equivalent definition is a successful no-op. If a different command uses the name, report the conflict and preserve it. Follow existing encoding and line endings, and preserve unrelated content. Request tool approval if the profile is outside the writable workspace.
3. Select the matching definition below. Replace `TOOL:SHORTCUT` with the shortcut and `LAUNCH` with the verified launch command. Test the name and syntax in the target shell. If the shell or its configuration filenames reject colons, retry with a hyphen, such as `codex-oathkeeper`, and report the actual name. For shells without a recipe, ask for the user's preferred shell or verify its native startup and function syntax before writing.
4. Check the installed definition and verify argument forwarding with a shell-local stand-in or a CLI help invocation. Report the exact command, changed file, and how to load it in the current shell or a new session.

| Shell | Definition | Startup location |
| --- | --- | --- |
| Windows PowerShell or PowerShell | `function global:TOOL:SHORTCUT { LAUNCH @args }` | Resolve `$PROFILE.CurrentUserAllHosts` in the target edition's executable with `-NoProfile`. |
| Bash | `function TOOL:SHORTCUT { LAUNCH "$@"; }` | Usually `~/.bashrc`. For login shells, inspect the first applicable login profile and whether it sources `.bashrc`. |
| Zsh | `function TOOL:SHORTCUT { LAUNCH "$@"; }` | `${ZDOTDIR:-$HOME}/.zshrc`. |
| Fish | A function named `TOOL:SHORTCUT` with body `LAUNCH $argv`, closed with `end` | `${XDG_CONFIG_HOME:-$HOME/.config}/fish/functions/<shortcut>.fish`. Resolve the location with Fish syntax. |
| Command Prompt | A `TOOL-oathkeeper.cmd` wrapper containing `@LAUNCH %*` | A user-owned directory already on PATH. Check command resolution for name clashes and avoid registry or PATH changes. If no suitable directory exists, report the prerequisite. |
