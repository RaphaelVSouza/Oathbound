# Claude Code Built-in Tools

Built-in tools declared in a live headless Claude Code CLI session (`claude -p --no-session-persistence --output-format text`, excluding MCP tools).

Verified headless: 2026-11-28.

## Directly Declared Tools (13)

`*` marks required parameters.

| Tool | Description | Key Parameters | Usage Example |
|---|---|---|---|
| `Agent` | Launch a subagent or fork of the current agent | `description*`, `prompt*`, `subagent_type`, `model`, `isolation` (`worktree` \| `remote`), `run_in_background`, `effort` | `Agent(description="Locate hook loader", prompt="Where is hooks.json parsed?", subagent_type="oathbound:scout")` |
| `Bash` | Execute POSIX shell commands (Git Bash on Windows) | `command*`, `description`, `timeout`, `run_in_background` | `Bash(command="git status", description="Show working tree status")` |
| `PowerShell` | Execute PowerShell 7 commands (Windows sessions) | `command*`, `description`, `timeout`, `run_in_background` | `PowerShell(command="node --test test/build-plugin.test.cjs", description="Run build-plugin tests")` |
| `Read` | Read text, images, PDFs, or Jupyter notebooks | `file_path*`, `offset`, `limit`, `pages`, `allow_large` | `Read(file_path="AGENTS.md", limit=50)` |
| `Write` | Create or overwrite a file (existing files must be `Read` first) | `file_path*`, `content*` | `Write(file_path=".scratch/note.md", content="# Note")` |
| `Edit` | Exact string replacement in an existing file | `file_path*`, `old_string*`, `new_string*`, `replace_all` | `Edit(file_path="VERSION", old_string="0.1.0", new_string="0.1.1")` |
| `Glob` | Match file paths by glob pattern | `pattern*`, `path` | `Glob(pattern="test/**/*.test.js")` |
| `Grep` | Search file contents with ripgrep | `pattern*`, `path`, `glob`, `type`, `output_mode`, `-i`, `-n`, `-A/-B/-C`, `multiline`, `head_limit`, `offset` | `Grep(pattern="OATHBOUND_NATIVE_BIN", output_mode="content")` |
| `ListAgents` | List agents and sessions available to message | `cursor` | `ListAgents()` |
| `ReportFindings` | Emit a typed list of code-review findings | `findings*` (`file`, `summary`, `failure_scenario`, `line`, `severity`, `verdict`, `category`, `outcome`, `short_summary`), `level` | `ReportFindings(findings=[], level="medium")` |
| `ScheduleWakeup` | Schedule the next iteration of a `/loop` run | `delaySeconds`, `prompt`, `reason`, `noop`, `stop` | `ScheduleWakeup(delaySeconds=1200, prompt="<<autonomous-loop-dynamic>>", reason="idle tick", noop=true)` |
| `Skill` | Execute a listed skill | `skill*`, `args` | `Skill(skill="oathbound:git-commiter")` |
| `ToolSearch` | Load parameter schemas for deferred built-in tools | `query*`, `max_results` | `ToolSearch(query="select:WebSearch,NotebookEdit")` |

## Deferred Built-in Tools (14)

Deferred tools are advertised by name and require `ToolSearch` before invocation so their full parameter schema is loaded.

| Tool | Description | Schema Load Example |
|---|---|---|
| `CronCreate` | Create a scheduled or cron task | `ToolSearch(query="select:CronCreate")` |
| `CronDelete` | Delete a scheduled task | `ToolSearch(query="select:CronDelete")` |
| `CronList` | List scheduled tasks | `ToolSearch(query="select:CronList")` |
| `DesignSync` | Design synchronization tool | `ToolSearch(query="select:DesignSync")` |
| `EnterWorktree` | Switch session into a Git worktree | `ToolSearch(query="select:EnterWorktree")` |
| `ExitWorktree` | Leave the current Git worktree | `ToolSearch(query="select:ExitWorktree")` |
| `McpTaskCheck` | Check status of a background MCP task (built-in, not `mcp__*`; not for polling) | `ToolSearch(query="select:McpTaskCheck")` |
| `Monitor` | Wait on a condition or background process | `ToolSearch(query="select:Monitor")` |
| `NotebookEdit` | Edit Jupyter notebook cells | `ToolSearch(query="select:NotebookEdit")` |
| `PushNotification` | Send a push notification to the user | `ToolSearch(query="select:PushNotification")` |
| `RemoteTrigger` | Trigger remote or cloud runs | `ToolSearch(query="select:RemoteTrigger")` |
| `SendMessage` | Message an agent or session by name or ID | `ToolSearch(query="select:SendMessage")` |
| `TaskStop` | Stop a running background task | `ToolSearch(query="select:TaskStop")` |
| `WebSearch` | Perform web search (`mode`: standard or extended) | `ToolSearch(query="select:WebSearch")` |

## Session and Mode Notes

- Interactive or agent-profile-gated tools such as `AskUserQuestion` and `WebFetch` (reachable via `Agent` `web-fetch` type) are not declared in default headless `-p` sessions.
- `PowerShell` is declared on Windows sessions alongside `Bash`.
