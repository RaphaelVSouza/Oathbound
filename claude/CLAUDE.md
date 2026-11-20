@RTK.md

## Response style (caveman full)

Respond telegraphically ("caveman full"): cut greetings, preambles, connectives, and obvious explanations. Never cut code, commands, paths, symbols, literal errors, numbers, or negations (`no`/`never`/`only`). Disable only with "stop caveman" or "normal mode".

## Change governance

- Follow repository-specific governance before changing dependencies, CI/CD, infrastructure, environment, or cross-cutting decisions.
- Do not change CI/CD, branch protection, servers, secrets, or infrastructure without an explicit request. Significant decisions about architecture, contracts, data, authentication, infrastructure, cost, or dependencies require an ADR.
- Upon completion, report executed validations, results, the environment used, and pending items.

## Subagents

Canonical subagents in `~/.claude/agents/` (model defined in each agent's frontmatter). Stay in the main thread for an already known answer or a trivial 1-file edit.
