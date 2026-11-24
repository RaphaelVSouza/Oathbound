# Generic Prompt: Create a Harness-Native Skill from a Spec

Use this prompt in any coding agent/harness (Claude Code, Codex CLI, Antigravity, Cursor, etc.) to adapt and install a portable skill spec using that harness's native skill mechanism.

```markdown
# Task: Create the `<skill-name>` skill in this harness

You are a coding agent. Your task is to **create and install a skill** named `<skill-name>`, using the native skill creation mechanism of the harness you are running in. The behavioral content is in `<spec>` below—it is the source of truth for *behavior*. The *format, install path, and harness-specific features* come from your harness, which you must discover and apply.

## Step 1: Identify where you are
- Determine which harness (CLI, IDE, app, SDK) and which model are in use. Inspect your system prompt, available tools, working directory, and config files. Do not guess.
- If you cannot determine them, ask the user in a single short message.

## Step 2: Consult the native creator and official harness guide
- Look for the harness's own skill, command, or plugin for creating skills (e.g., a `skill-creator` skill, slash command, scaffolding helper, or documentation section). **Use it** and follow its instructions instead of assembling the structure manually.
- Consult the **current official skill guide** for your detected harness (do not rely on memorized paths or frontmatter—they change across versions), alongside the open [Agent Skills specification](https://agentskills.io/specification.md):
  - Claude Code: `https://code.claude.com/docs/en/skills`
  - Codex / OpenAI: `https://learn.chatgpt.com/docs/build-skills`
  - Antigravity: `https://antigravity.google/docs/skills/`
- If the harness has no "skill" concept, map to the closest equivalent primitive (on-demand reusable instructions such as a custom command, rule, saved prompt, or agent). Tell the user which primitive you chose and why.

## Step 3: Adapt the spec to harness specifics
Preserve the behavior in `<spec>` and adjust only what the harness requires or improves:
- **Portable core + optional extensions:** keep the open Agent Skills portable subset (`name`, `description`, concise `SKILL.md`) as a clean baseline. Treat harness-specific frontmatter (such as `allowed-tools`, hooks, or subagents) as optional extensions outside the core, and use them only if they genuinely simplify the skill.
- **Trigger description:** rewrite it according to how the harness decides when to load the skill (automatic, explicit-only, or both) so it triggers on the intended user intents.
- **Install location (context-aware):**
  - *General or multi-harness project:* write canonically to `.agents/skills/<skill-name>/` (or use the `skills` CLI if available to manage canonical copies and links) and create symlinks—falling back to file copy if symlinks fail—for target harnesses that do not read `.agents/skills/` natively.
  - *Single-harness exclusive skill or plugin repo (e.g., Oathbound):* place in the harness's native/exclusive directory (`agy/config/skills/`, `claude/skills/`, `codex/skills/`) or requested user/project scope. Ask if ambiguous, and do not overwrite an existing skill without confirmation.
- **Interactive questions:** if the harness has a native question/form tool, use it. Keep the numbered chat list fallback.
- **Progressive disclosure:** keep `references/`, `scripts/`, and `assets/` at most **one directory level deep** from `SKILL.md` so progressive loading and validators work across harnesses. Otherwise keep everything in a single file.
- **Tool names:** inside the skill, describe actions ("ask the user", "read the file") rather than proprietary tool names, except where the harness format requires them.

## Invariants (must not change in any adaptation)
1. <Insert non-negotiable invariant 1>
2. <Insert non-negotiable invariant 2>
3. **Portability fallbacks** remain intact (no question tool, no shell, no repo access).

## Step 4: Validate and test before declaring done
- Run `skills-ref validate <skill-dir>` (directly or via `uvx --from skills-ref skills-ref validate <skill-dir>`, if available) and the harness's native validator (lint, eval, format check). Verify `references/`/`scripts/` are at most one level deep from `SKILL.md`.
- Confirm the harness **discovers** the skill (list skills or reload session, as applicable) and that the description triggers on the expected scenario.
- Run a quick test in a sample directory to verify the full flow end to end. Fix and repeat if it fails.

## Step 5: Report (max 10 lines)
Report: identified harness and model, install path, how to invoke, what was adapted to the harness, anything not possible, and how you tested. Do not modify files outside the skill directory (unless installing into a plugin repo that registers exclusive skills).

<spec>
<Insert the target skill specification here — e.g., from docs/prompts/agents-md-builder-spec.md>
</spec>
```
