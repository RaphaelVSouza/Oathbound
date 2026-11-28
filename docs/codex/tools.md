# OpenAI Codex CLI Built-in Tools

Built-in tools declared in a live headless OpenAI Codex CLI session (`codex exec --sandbox read-only`, tested on `OpenAI Codex v0.172.0` / `gpt-6.2-sol`, excluding deferred MCP server tools).

Verified headless: 2026-11-28.

## Direct Tools (12)

| Tool | Description | Key Parameters | Usage Example |
|---|---|---|---|
| `functions.exec` | Evaluate raw JavaScript and invoke nested `tools.*` (Code Mode) | Optional pragma: `yield_time_ms`, `max_output_tokens` | `text(await tools.clock__curr_time({}))` |
| `functions.wait` | Resume or terminate a yielded execution cell | `cell_id`, `yield_time_ms`, `max_tokens`, `terminate` | `{"cell_id":"cell-123","yield_time_ms":1000}` |
| `functions.request_user_input` | Ask 1–3 blocking questions (Plan mode only) | `questions[]` (`id`, `header`, `question`, `options[]`) | `{"questions":[{"id":"format","header":"Format","question":"Which format?","options":[{"label":"JSON (Recommended)","description":"Structured output."},{"label":"Text","description":"Plain text output."}]}]}` |
| `functions.request_user_input_async` | Ask questions without blocking (Default mode) | `questions[]` (`title`, optional `options`) | `{"questions":[{"title":"Which format?","options":["JSON","Text"]}]}` |
| `functions.send_message_to_user_async` | Send an immediate user-facing update | `message` | `{"message":"The build is blocked by a missing SDK."}` |
| `clock.sleep` | Sleep with early wake on new input | `duration_ms` | `{"duration_ms":1000}` |
| `collaboration.spawn_agent` | Start a subagent (subject to session and role constraints) | `task_name`, `message`, optional `agent_type`, `fork_turns`, `model`, `reasoning_effort` | `{"task_name":"review","message":"Review the parser diff.","fork_turns":"none"}` |
| `collaboration.send_message` | Queue a message for an existing agent without triggering a turn | `target`, `message` | `{"target":"review","message":"The parser diff is ready."}` |
| `collaboration.followup_task` | Assign follow-up work and trigger a turn if the agent is idle | `target`, `message` | `{"target":"review","message":"Check the updated parser diff."}` |
| `collaboration.interrupt_agent` | Interrupt an agent's current turn | `target` | `{"target":"review"}` |
| `collaboration.list_agents` | List live agents | Optional `path_prefix` | `{"path_prefix":"/root"}` |
| `collaboration.wait_agent` | Wait for an agent mailbox update or new user input | Optional `timeout_ms` | `{"timeout_ms":30000}` |

## Nested Tools Exposed via `functions.exec` (14)

| Tool | Description | Key Parameters | Usage Example |
|---|---|---|---|
| `tools.exec_command` | Run a shell command in the workspace sandbox | `cmd`, optional `workdir`, `shell`, `login`, `tty`, `yield_time_ms`, `max_output_tokens` (+ `sandbox_permissions`, `justification`, `prefix_rule` when permitted) | `await tools.exec_command({cmd:"git status --short"})` |
| `tools.write_stdin` | Send input to or poll a running command session | `session_id`, `chars`, `yield_time_ms`, `max_output_tokens` | `await tools.write_stdin({session_id:123,chars:""})` |
| `tools.apply_patch` | Apply a filesystem patch where writes are permitted | Raw patch string (`*** Begin Patch` ... `*** End Patch`) | `await tools.apply_patch("*** Begin Patch\n*** Add File: example.txt\n+hello\n*** End Patch")` |
| `tools.view_image` | Load a local image for visual inspection | `path` | `image((await tools.view_image({path:"screenshots/chart.png"})).image_url)` |
| `tools.list_mcp_resources` | List resources from connected MCP servers | Optional `server`, `cursor` | `await tools.list_mcp_resources({server:"example"})` |
| `tools.list_mcp_resource_templates` | List parameterized MCP resource templates | Optional `server`, `cursor` | `await tools.list_mcp_resource_templates({})` |
| `tools.read_mcp_resource` | Read a resource URI from a named MCP server | `server`, `uri` | `await tools.read_mcp_resource({server:"example",uri:"resource://guide"})` |
| `tools.create_goal` | Create an explicitly requested goal | `objective`, optional `token_budget` | `await tools.create_goal({objective:"Verify all release artifacts"})` |
| `tools.get_goal` | Read current goal status and usage | `{}` | `await tools.get_goal({})` |
| `tools.update_goal` | Update goal status under declared conditions | `status` (`complete` \| `blocked` \| `paused`) | `await tools.update_goal({status:"complete"})` |
| `tools.request_plugin_install` | Suggest installing a requested plugin when prerequisites are met | `plugin_id`, `suggest_reason` | `await tools.request_plugin_install({plugin_id:"example@remote",suggest_reason:"Access requested files."})` |
| `tools.clock__curr_time` | Read the current UTC time | `{}` | `await tools.clock__curr_time({})` |
| `tools.image_gen__imagegen` | Generate or edit images | `prompt`, optional `transparent_background`, `referenced_image_paths`, `num_last_images_to_include` | `generatedImage(await tools.image_gen__imagegen({prompt:"A watercolor of a mountain lake"}))` |
| `tools.web__run` | Search/inspect web content and query specialized data | Optional `search_query`, `literature_search_query`, `image_query`, `open`, `click`, `find`, `screenshot`, `finance`, `weather`, `sports`, `time`, `response_length` | `await tools.web__run({search_query:[{q:"Rust edition guide"}]})` |

## Session and Mode Notes

- Tool names vary by Codex CLI version and model mode: in `v0.172.0` (`gpt-6.2-sol`), shell execution is `tools.exec_command` inside `functions.exec` (`shell_command` and `shell` are absent; `shell` is an optional parameter of `tools.exec_command`), web search is `tools.web__run`, and `update_plan` is absent.
- `functions.request_user_input` is available in Plan mode; Default mode uses `functions.request_user_input_async`.
- `tools.list_mcp_resources`, `tools.list_mcp_resource_templates`, and `tools.read_mcp_resource` are built-in harness wrappers (separate from external `mcp__*` server tools).
