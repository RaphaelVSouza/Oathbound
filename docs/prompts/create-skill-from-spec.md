# Generic Prompt: Create a Harness-Native Skill from a Spec

Use this prompt in any coding agent/harness (Claude Code, Codex CLI, Antigravity, Cursor, etc.) to adapt and install a portable skill spec using that harness's native skill mechanism.

```markdown
# Task: Create the `<skill-name>` skill in this harness

You are a coding agent. Your task is to **create and install a skill** named `<skill-name>`, using the native skill creation mechanism of the harness you are running in. The behavioral content is in `<spec>` below—it is the source of truth for *behavior*. The *format, install path, and harness-specific features* come from your harness, which you must discover and apply.

## Step 1: Identify where you are
- Determine which harness (CLI, IDE, app, SDK) and which model are in use. Inspect your system prompt, available tools, working directory, and config files. Do not guess.
- If you cannot determine them, ask the user in a single short message.

## Step 2: Use the native skill creator
- Look for the harness's own skill, command, or plugin for creating skills (e.g., a `skill-creator` skill, slash command, scaffolding helper, or documentation section). **Use it** and follow its instructions instead of assembling the structure manually.
- If no native creator exists, consult the **current official documentation** of the harness (web search if available) for the format of skills, rules, or reusable instructions. Do not invent formats or memory paths: they change across versions.
- If the harness has no "skill" concept, map to the closest equivalent primitive (on-demand reusable instructions such as a custom command, rule, saved prompt, or agent). Tell the user which primitive you chose and why.

## Step 3: Adapt the spec to harness specifics
Preserve the behavior in `<spec>` and adjust only what the harness requires or improves:
- **Structure and metadata:** frontmatter, name/description limits, required and optional fields, naming conventions.
- **Trigger description:** rewrite it according to how the harness decides when to load the skill (automatic, explicit-only, or both) so it triggers on the intended user intents.
- **Install location:** project or user/global scope (or harness-exclusive skills directory when applicable). Ask the user if ambiguous, and do not overwrite an existing skill of the same name without confirmation.
- **Interactive questions:** if the harness has a native question/form tool, use it. Keep the numbered chat list fallback.
- **Progressive disclosure:** if the harness supports auxiliary files (`references/`, `scripts/`, `assets/`), move large checklists/templates/validators there and keep `SKILL.md` concise. Otherwise keep everything in a single file.
- **Extra features (only if supported):** allowed-tool restrictions, subagents, hooks, or command invocation. Use them only if they simplify the skill—do not add complexity just because a feature exists.
- **Tool names:** inside the skill, describe actions ("ask the user", "read the file") rather than proprietary tool names, except where the harness format requires them.

## Invariants (must not change in any adaptation)
1. <Insert non-negotiable invariant 1>
2. <Insert non-negotiable invariant 2>
3. **Portability fallbacks** remain intact (no question tool, no shell, no repo access).

## Step 4: Test before declaring done
- Run the native creator's validation, if any (lint, eval, format check).
- Confirm the harness **discovers** the skill (list skills or reload session, as applicable) and that the description triggers on the expected scenario.
- Run a quick test in a sample directory to verify the full flow end to end. Fix and repeat if it fails.

## Step 5: Report (max 10 lines)
Report: identified harness and model, install path, how to invoke, what was adapted to the harness, anything not possible, and how you tested. Do not modify files outside the skill directory (unless installing into a plugin repo that registers exclusive skills).

<spec>
<Insert the target skill specification here — e.g., from docs/prompts/agents-md-builder-spec.md>
</spec>
```
