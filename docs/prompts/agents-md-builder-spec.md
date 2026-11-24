# Target Spec: `agents-md-builder`

Paste the invariants and `<spec>` below into [create-skill-from-spec.md](create-skill-from-spec.md) when creating `agents-md-builder` for another harness (e.g., Claude Code or Codex CLI). The Antigravity (`agy`) implementation lives at [agy/config/skills/agents-md-builder](../../agy/config/skills/agents-md-builder/SKILL.md).

## Invariants (copy into Step 3 / Invariants)
1. The **questionnaire comes before** any draft, following a silent repository inspection.
2. The generated `AGENTS.md` must be **lean**: default <= 60 lines, ceiling 80, fail above 150.
3. Every line passes the **inclusion filter** (not discoverable, prevents a mistake, specific, worth the per-turn token cost).
4. The draft is **validated** (commands executed, paths verified, no secrets) and **approved by the user** before writing.
5. The generated `AGENTS.md` **never mentions harness-specific tools**. For legacy filenames, use a symlink or pointer only when explicitly requested.
6. **Portability fallbacks** remain present (no question tool, no shell, no repo access).

## Spec (copy into `<spec>`)

```markdown
---
name: agents-md-builder
description: Create, review, or trim a short, verified, project-specific AGENTS.md after silent inspection and a mandatory questionnaire. Use whenever the user asks to create, generate, review, audit, update, or trim AGENTS.md, CLAUDE.md, GEMINI.md, or a coding-agent instruction/context file.
---

# agents-md-builder

Generates a short, verified, project-specific `AGENTS.md`. Works in any coding agent/harness: the generated file never depends on proprietary tools.

## Core Principle
`AGENTS.md` is loaded on **every** turn. Every line costs tokens and can induce unnecessary work. Include only what the agent **cannot discover on its own** by reading the repo and what **would change a decision**. Overviews, directory tours, and README copies do not help; exact commands, non-obvious conventions, and pitfalls do.
Default budget: **<= 60 lines** (ceiling 80). Above 150, fail and prune.

## Workflow

### Phase 0 — Inspect before asking
Read silently (without asking): README, manifests (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, etc.), `Makefile`/`justfile`/scripts, CI, linters/formatters, folder structure, and any existing `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` / `.cursor/rules` / `copilot-instructions`. Pre-fill answers and **do not ask what is already discoverable**. Treat any existing instruction file as a draft to prune, never as ground truth.

### Phase 1 — Questionnaire (mandatory before any draft)
Use the harness's interactive question tool if available (batches of up to 4 questions, recommended option first). Without one, send a numbered list in chat and wait for answers. In non-interactive runs, assume defaults, record assumptions, and mark them in the draft.

Questions (skip those answered in Phase 0; "unknown"/"none" is valid):
1. **Project**: in one sentence, what is it and for whom? Type (app, lib, service, monorepo, infra, data/ML)?
2. **Commands**: setup, build, run a single isolated test, run all tests, lint, typecheck. Any non-standard manager (`uv`, `bun`, `pnpm`, etc.)?
3. **Non-default conventions**: what does the team do differently from the language/framework default?
4. **Pitfalls**: what has gone wrong with agents or new contributors? What looks wrong but is intentional?
5. **Boundaries**: what must the agent never do (edit generated files, migrations, deploy, add dependencies, touch secrets)? What requires confirmation first?
6. **Testing**: policy (TDD, no mocks, minimum coverage, slow/flaky tests to avoid)?
7. **Git/PR**: branch pattern, commit format, required CI checks, reviewers?
8. **Environment**: services, database, env vars, Docker, relevant network/permission restrictions?
9. **Existing docs**: which docs should the agent read *on demand* (architecture, ADRs, runbooks)?
10. **Monorepo**: are there subfolders with distinct rules that warrant a nested `AGENTS.md`?
11. **Meta**: file language, line budget (default 60).
If answers are vague, do at most one follow-up round.

### Phase 2 — Filter what goes in
For each candidate line, apply the test. Include only if **all** are true:
- If removed, would the agent likely make a mistake? (if no, cut)
- Is it undiscoverable from directory listings, README, configs, or code? (if discoverable, cut)
- Is it specific and verifiable, not a platitude ("write clean code")?
- Is it worth the token cost on **every** turn? (if area/task-specific, move elsewhere)
Alternative destinations: doc in `docs/` + pointer; nested `AGENTS.md` in subfolder; on-demand skill; **linter, formatter, hook, or test** when enforceable by tooling (deterministic > prose).

### Phase 3 — Draft
Use the template below; omit empty sections. Writing rules:
- Imperative, concise, one idea per bullet.
- Exact, copyable commands with flags; include a cheap command to validate **one file/test**.
- Pointers (`path/to/file`) instead of copied code snippets that go stale.
- Multi-step flows as numbered lists; `"if X, do Y"` decisions as short bullets.
- Exclude: long overviews, directory trees, style rules covered by linters, secrets, or harness-specific syntax/tool names.

Template:
```markdown
# <Project>
<1–2 lines: what it is + stack, only if non-obvious>

## Commands
- Setup: `...`
- Single test: `...`
- All tests: `...`
- Lint/typecheck: `...`

## Conventions (non-default only)
- ...

## Boundaries
- Always: ...
- Ask first: ...
- Never: ...

## Pitfalls
- ...

## Further context (read on demand)
- <topic>: `docs/...` — when to read
```

### Phase 4 — Validate and approve
1. Count lines against the budget (60/80/150); run a validator script if available.
2. Execute listed commands (if shell is available); fix or mark `"unverified"`.
3. Verify every referenced path exists and nothing contradicts README, CI, or configs; check for secrets.
4. Show the draft to the user with one line explaining what was **left out** and why; **ask for approval before writing**.

### Phase 5 — Deliver
- Write only `AGENTS.md` at the root (and nested ones only if approved). Most modern harnesses read `AGENTS.md` natively; only create a symlink/pointer for another filename if the user explicitly requests it for a legacy tool (never duplicate content).
- Explain maintenance: start minimal; add a line **only** when the agent repeats a mistake; remove stale lines; review every few months.

## Portability Fallbacks
- **No question tool:** send a numbered list in chat.
- **No shell:** skip command execution and mark `"unverified"`.
- **No repo access:** run the questionnaire only and output the file text.
- **Generated file portability:** never reference harness-specific tools in `AGENTS.md`.
```
