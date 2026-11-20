# Adaptive Subagent Model Routing

## Objective and Scope

Oathkeeper selects a role by responsibility, then selects model and effort by
the delegated task's complexity. This applies to Claude, Codex and Antigravity.
The orchestrator remains `oathkeeper`; there is no `oathseeker` rename.
This is an instruction policy, not a deterministic runtime router or a benchmark.
It adds no dependency, hook, extra role or automatic installation update.

## Selection Contract

Classify each subtask separately before spawning. Keep trivial work in the main
session. Use the first matching class below; file count alone is insufficient.

| Tier | Evidence | Example |
|---|---|---|
| Complex | Conflicting constraints, uncertain causes across systems, architectural tradeoffs or sensitive trust-boundary reasoning | Architecture ADR, authorization audit, cross-service investigation |
| Standard | Cross-file synthesis or bounded implementation with established design | Feature patch, spec from settled decisions, routine diff review |
| Routine | Clear instructions, local evidence and mechanical work | Locate a symbol, extract facts, release notes from verified changes |

If classification remains uncertain after collecting available evidence, use
standard. Missing access, information or permissions is a blocker, not proof of
complexity. Reviews and security audits require at least standard; security
reasoning across trust boundaries is complex. Role tools, output contracts,
required review steps, sandbox and authorization remain unchanged.

Before invocation, record:

```text
ROUTING: role=<role>; tier=<routine|standard|complex>; model=<requested>;
effort=<requested|inherited>; reason=<one sentence>; attempt=<1|2>
```

After invocation, record separately:

```text
ROUTING RESULT: model=<observed|unverified>; effort=<observed|unverified>;
fallback=<reason|none>
```

Report runtime evidence, not the subagent's self-identification. A requested
model is not an observed model. Compact records belong in the plan and final
agent report, not in a new persistent log.

## Provider Preferences

These preferences are starting policies, not measured quality or cost rankings.
Check installed tool schema and permitted models before sending parameters.

| Runner | Tier or specialization | Model preference | Effort |
|---|---|---|---|
| Codex | Routine | `gpt-6-luna` | `low` |
| Codex | Routine requiring several tool steps | `gpt-6-luna` | `medium` |
| Codex | Standard | `gpt-6.2-sol` | `medium` |
| Codex | Complex, bounded debugging or refactoring | `gpt-6.2-sol` | `high` |
| Codex | Complex, architecture or cross-system reasoning | `gpt-6.2-astra` | `high` |
| Codex | Standard browser or desktop inspection | `gpt-6.1-terra` | `medium` |
| Claude | Routine | `haiku` | `low` |
| Claude | Routine requiring several tool steps | `haiku` | `medium` |
| Claude | Standard | `sonnet` | `medium` |
| Claude | Complex, bounded debugging or refactoring | `sonnet` | `high` |
| Claude | Complex, architecture or cross-system reasoning | `opus` | `high` |
| Antigravity | Routine | Gemini 3.8 Flash | Low |
| Antigravity | Routine implementation with a settled plan | Gemini 4 Hydrogen | Medium |
| Antigravity | Standard | Gemini 4 Neon | Medium |
| Antigravity | Complex | Gemini 4 Neon | High |
| Antigravity | Deep cross-system architecture or security audit | Gemini 4 Carbon, when available | High |

Argon remains an allowed Antigravity alternative when Neon is unavailable and
the invocation supports it. Neon Extra (`xhigh`) is an escalation option only
when evidence warrants deeper reasoning and the approved budget permits it.

## Capability and Precedence Rules

- User/project pins, organization restrictions, environment-forced settings and
  approved budgets constrain routing. Never rewrite configuration to bypass them.
- Role definitions remain fallback defaults. Treat an explicit local role pin as
  binding unless its owner authorizes adaptive selection.
- Codex: use `spawn_agent` model and reasoning-effort overrides only when exposed.
  Use `fork_turns="none"` when passing delimited context; full-history forks can
  inherit settings and reject overrides. Custom agent TOML model/effort settings
  take precedence, so the shipped TOMLs intentionally leave both unset.
- Claude: use the Agent tool's model aliases (`haiku`, `sonnet`, `opus`), not
  full version IDs. Pass effort only when exposed; per-invocation effort needs
  Claude Code v2.1.292 or later. Aliases do not guarantee version 5.5.
- Antigravity: `agy models` lists session availability, not necessarily accepted
  `invoke_subagent` values. Use exact named models and effort only if exposed by
  the installed invocation schema. With tier-only support, request `flash` for
  routine and `pro` for standard/complex; do not claim either resolves to a named
  Gemini model. Without a child effort field, retain inherited effort.
- Never pass session `--model`/`--effort` flags as subagent parameters. Do not
  launch another CLI or redefine a role to bypass an unsupported override.
- If selection is unavailable or rejected, retain the configured default only
  when permitted and sufficient within budget; otherwise handle in the main
  session when permitted and capable, or report PENDING. Record the limitation.
  Never silently substitute a more expensive model or claim an unverified switch.
- Built-in Antigravity Orchestrator is a separate session mode with fixed effort;
  do not substitute it for a subagent or automatically enable it.

## Escalation and Failure Contract

Allow at most one escalation per subtask, across all child sessions and model or
effort changes. Require a concrete failed acceptance criterion attributable to
reasoning, sufficient evidence and remaining authorized budget. Carry forward
the evidence, previous findings, failed criterion and bounded scope. Spawn a
fresh child when the runner cannot change settings on resume; stop its predecessor
before mutation resumes. Do not run competing writers.

Repeated tool errors, absent credentials, missing access and rate limits require
diagnosis or PENDING, not escalation. Smith still stops after two identical
errors. Budget increases retain existing approval requirements. After a second
reasoning failure, report the diagnosis and unresolved criterion.

## Validation and Acceptance

- Offline policy-contract checks cover all runners, required routing fields,
  provider mappings, shared safeguards and unchanged role model defaults.
- Package tests verify the policy survives all three distributions. Installer
  tests verify local profile customization survives upgrade.
- Run required unit coverage and documentation audits, including staged audit.
- Manual runtime matrix: routine release notes and complex architecture work
  both use scribe; cross-file implementation uses smith; security uses sentinel;
  verify unavailable models, explicit pins, unsupported effort and tool failures.
  Record actual model/effort from runtime metadata where exposed.
- Offline checks prove instruction and packaging contracts, not model compliance.
  Runtime trials require an authorized test session and quota; do not execute
  repository agent prompts as part of an ordinary build.

Done means every runner ships tier-based selection, capability-aware fallback,
bounded escalation and requested-versus-observed reporting, with offline checks
passing. Actual model routing remains unverified until runtime trials run.

## References

- [Decision record](adr/0007-route-subagent-models-by-task-complexity.md)
- [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Claude subagents](https://code.claude.com/docs/en/sub-agents)
- [Antigravity subagents](https://antigravity.google/docs/subagents)
- [Antigravity models](https://antigravity.google/docs/models)

Capabilities reviewed: 2026-11-20. Runtime schemas remain authoritative.
