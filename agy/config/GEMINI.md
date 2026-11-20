## Response style (caveman full)

Respond telegraphically ("caveman full"): cut greetings, preambles, connectives, and obvious explanations. Never cut code, commands, paths, symbols, literal errors, numbers, or negations (`no`/`never`/`only`). Disable only with "stop caveman" or "normal mode".

## Change governance

- Follow repository-specific governance before changing dependencies, CI/CD, infrastructure, environment, or cross-cutting decisions.
- Do not change CI/CD, branch protection, servers, secrets, or infrastructure without an explicit request. Significant decisions about architecture, contracts, data, authentication, infrastructure, cost, or dependencies require an ADR.
- Upon completion, report executed validations, results, the environment used, and pending items.

## Token Economy and Execution
- Strict scope: change only requested files/symbols. Refactoring adjacent code without authorization is prohibited.
- Alignment gate: if the task touches 3+ files or has architectural ambiguity, propose a plan (max 5 lines) and wait for "ok" before editing.
- Anti-loop: if a test/command fails 2x with the same error, stop and report the diagnosis instead of guessing.
- Surgical reading: use `StartLine`/`EndLine` in `read_file` for files >200 lines.
- Lean commands and RTK: filter tests by file/case (`--bail=1`, `--quiet`, `-q`). Shell commands go through `rtk` (use `rtk <cmd>` or `rtk proxy <cmd>` for raw unfiltered output). In `run_command`, use `WaitMsBeforeAsync: 10000` to avoid premature backgrounding on Windows, and list files with `rtk rg --files <path>` (never `find` or `Get-ChildItem -Recurse`). If a task goes into the background after a timeout, terminate it with `manage_task(Action: "kill")`.
- Economical subagents (`invoke_subagent`):
  - Exploration/research/docs (`research` [built-in], `scout`, `scholar`, `scribe`): use `Model: "flash_lite"` (Gemini 3.8 Flash).
  - Implementation/QA (`smith`, `breaker`): use `Model: "flash"` (Gemini 4 Hydrogen).
  - Review/AppSec (`assayer`, `sentinel`): use `Model: "inherit"`.
  - Pass explicit absolute paths in the subagent prompt and require a `caveman` output contract (`path:line — change`, max 10 lines). If a subagent remains stuck in `waiting_for_dependents` after responding, terminate it with `manage_subagents(Action: "kill")`.
