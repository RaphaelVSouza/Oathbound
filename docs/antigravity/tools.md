# Antigravity CLI (AGY) Built-in Tools

Built-in tools declared in a live headless Antigravity CLI session (`agy --disable-slash-commands --output-format text -p`, excluding MCP tools).

Verified headless: 2026-11-28.

## Built-in Tools (15)

`*` marks required parameters. Most tools use `PascalCase` parameters, except `run_command.toolSummary` (`camelCase`) and `search_web`, `ask_question`, `update_steps`, and `swarm` (`lowercase`).

| Tool | Description | Key Parameters | Usage Example |
|---|---|---|---|
| `read_file` | Read text, image, PDF, video, or audio file (up to 800 lines or 46,080 bytes per call) | `Path*`, `StartLine`, `EndLine`, `ByteOffset` | `read_file(Path="/path/to/repo/README.md", StartLine=1, EndLine=80)` |
| `write_file` | Create, overwrite, or append to a file (or artifact with metadata) | `Path*`, `Content*`, `Overwrite`, `Append`, `ArtifactMetadata` | `write_file(Path="/path/to/repo/out.txt", Content="hello\n", Overwrite=true)` |
| `edit_file` | Exact-match single-block search-and-replace in an existing file | `Path*`, `Target*`, `Replacement*`, `ArtifactMetadata` | `edit_file(Path="/path/to/repo/a.js", Target="foo()", Replacement="bar()")` |
| `run_command` | Execute a shell command in workspace (sandboxed by default; backgrounds past wait time) | `CommandLine*`, `toolSummary*`, `WaitMsBeforeAsync*` (500–10000), `BypassSandbox`, `IsDaemon`, `NotificationTimeoutSeconds` | `run_command(CommandLine="node --test test/a.test.cjs", toolSummary="Run unit test", WaitMsBeforeAsync=10000)` |
| `manage_task` | List, inspect status/logs, send stdin to, or kill background tasks and schedules | `Action*` (`list` \| `status` \| `send_input` \| `kill`), `TaskId`, `Input` | `manage_task(Action="kill", TaskId="task-123")` |
| `search_web` | Perform web search and return summary with URL citations | `query*`, `domain` | `search_web(query="Node 24 test runner flags", domain="nodejs.org")` |
| `define_subagent` | Define a reusable custom subagent type for the current conversation | `Name*`, `Description*`, `SystemPrompt*`, `EnableWriteTools`, `EnableMCPTools`, `EnableSubagentTools` | `define_subagent(Name="lint-checker", Description="Checks lint rules", SystemPrompt="Check lint.", EnableWriteTools=false)` |
| `invoke_subagent` | Launch a background subagent (built-in or custom) that notifies on completion | `TypeName*`, `Role*`, `Prompt*`, `Model` (`inherit` \| `flash_lite` \| `flash` \| `pro`), `Workspace` (`inherit` \| `branch` \| `share`) | `invoke_subagent(TypeName="scout", Role="Codebase Explorer", Prompt="Find hook entrypoints", Model="flash_lite")` |
| `manage_subagents` | List active direct subagents or kill specific/all subagents | `Action*` (`list` \| `kill` \| `kill_all`), `ConversationIds` | `manage_subagents(Action="kill", ConversationIds=["conv-abc"])` |
| `send_message` | Send a message to another agent or subagent by conversation ID (not user-facing) | `Recipient*`, `Message*` | `send_message(Recipient="conv-abc", Message="Proceed with phase 2.")` |
| `ask_question` | Prompt the user with structured multiple-choice question(s) and wait for answers | `questions*` (array of `{question, options, is_multi_select}`) | `ask_question(questions=[{question: "Target runtime?", options: ["Node 24 (Recommended)", "Bun"]}])` |
| `update_steps` | Display or replace a live ordered checklist (up to 12 steps) shown to the user | `steps*` (array of `{title, status: pending \| in_progress \| done \| skipped \| failed}`) | `update_steps(steps=[{title: "Audit docs", status: "done"}, {title: "Run tests", status: "in_progress"}])` |
| `run_workflow` | Execute a Python workflow script orchestrating parallel or staged agents and tool calls | `Description`, `Script` or `ScriptPath` (mutually exclusive), `Args`, `Cwd`, `WaitMsBeforeAsync` | `run_workflow(Description="Fan-out audit", ScriptPath="/path/to/repo/.scratch/audit.py", WaitMsBeforeAsync=0)` |
| `schedule` | Schedule a one-shot timer or recurring 5-field cron notification task | `Prompt*`, `DurationSeconds` or `CronExpression` (mutually exclusive), `ExactTiming`, `IsDaemon`, `MaxIterations`, `TimerCondition` | `schedule(DurationSeconds=300, Prompt="Check build status", TimerCondition="any")` |
| `swarm` | Manage `/swarm` shared-board workers (only when `/swarm` is active) | `action*` (`status` \| `models` \| `add` \| `model` \| `kill` \| `title`), `name`, `brief`, `model`, `n`, `tasks`, `fork`, `workspace` (`inherit` \| `share` \| `branch`), `title`, `all` | `swarm(action="add", name="worker-a", brief="Own module X tests", workspace="share")` |

## Session and Mode Notes

- Default AGY CLI sessions do not declare `create_file`, `grep_search`, `find_by_name`, or `browser_*` built-in tools; file search runs through `run_command` (for example, `rg`), and browser automation runs through MCP (such as Playwright MCP) or IDE browser integrations.
