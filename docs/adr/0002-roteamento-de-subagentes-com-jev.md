# ADR 0002 — Subagent Routing with Jev

Date: 2026-11-14. Status: **experiment closed**. The sample fell below the planned minimum. Agent descriptions remain in use. The `subagente` mode remains inactive.

Language note: historical measurements used Portuguese prompts and corpora. English translations have not been recalibrated.

## Context

The orchestrator (main session) selects a subagent through `description` in `agents/*.md` and `CLAUDE.md` rules. [ADR 0001](0001-sugestao-de-skill-com-jev.md) measured Jev `jev-1.14.0` for this choice, with the same catalog as the skills hook plus 4 built-in subagents (11 total):

- 11 prompts with an actual subagent (of 121 eligible). `Choice` selected the first correctly in 6 (55%), with a confidence interval of about 25% to 83%.
- Confusions: `general-purpose` instead of `smith`; `scholar` instead of `claude-code-guide`.
- With skills cookbook thresholds, it suggested correctly in 4, incorrectly in 3 and stayed silent in 4. The `acao` `Noul` was designed for skills and does not distinguish subagents.
- Without an actual subagent, it would suggest for 50 of 110 prompts.

TypeSafe does not offer Jev fine-tuning or custom training (documentation consulted on 2026-11-14). What can be controlled is the input: option descriptions, questions and thresholds.

## Evaluated Design

1. **Catalog and contrastive descriptions.** Rewrite each subagent's `description` to state what it does and does not do, focusing on confused pairs. The text serves the orchestrator and Jev; this changes `agents/*.md`, subject to the `tests/agents/executar.js` suite.
2. **One question per subagent**, following the `function_calling` cookbook: one `Noul` ("is this request for `smith`?") per option, in a single request, plus a `Choice` among subagents as a tiebreaker. Replaces the `acao` `Noul`.
3. **Catalog-specific thresholds**, chosen on the accuracy-versus-coverage curve of a calibration sample and checked on another sample. Do not reuse skills cookbook thresholds.
4. **No automatic registration.** Becomes a `UserPromptSubmit` hook (or `CLAUDE.md` entry) only if acceptance criteria are met. Reuses `hooks/skill-suggest.js` (secret redaction, silent failure, pinned version, no prompt in logs).

## Planned Sample Size

The protocol required at least **100 human prompts with a subagent call**, split into calibration (half) and checking (half). The observed sample had 11. The source is `tests/skill-suggest/extrair.js` (the `agentes` field, from transcript `subagent_type`), not `agent-audit.jsonl`, which records what the subagent did rather than whom the orchestrator chose.

## Acceptance Criteria (Fixed Before Measurement)

- First-choice accuracy on the checking set above the orchestrator's current selection accuracy. The orchestrator reference is the actual `subagent_type` used; comparison also measures a "no suggestion" arm repeating the orchestrator decision without the hint, which requires a controlled execution sample, not only transcripts.
- Report separately: correct suggestion, wrong suggestion and silence. Accept only if "broke" (wrong suggestion where the orchestrator would be correct) stays below "fixed".
- Report confidence interval; with fewer than 100 prompts, discard the result as inconclusive.
- Latency: hook p95 below configured `timeout`, with margin.

## Consequences

- Rewriting descriptions improves routing even without Jev and is the cheap, reversible part. It can happen first, protected by the regression suite.
- The hook sends prompt text to TypeSafe, with the same safeguards as ADR 0001.
- Risk of a confident wrong hint overriding the orchestrator's correct choice (29 fixed against 7 broken in the skills cookbook).

## Rejected Alternatives

- **Jev fine-tuning**: not offered by TypeSafe.
- **Adjust descriptions now and declare victory with 11 prompts**: insufficient statistical power; any gain could be overfitting the sample.
- **Embeddings**: new dependency and index for 11 options.

## Amendment 2026-11-14

Adjustments to step 2, in `subagente` mode of `hooks/skill-suggest.js` (`skill` mode unchanged):

- **`inline` option** in `Choice`: "resolve in the main thread, without delegation: answer already known or trivial edit to 1 file". Has no `Noul`. If `Choice` selects `inline`, the hook stays silent and logs `inline: true`.
- **Structured `criteria`** in each per-subagent `Noul`, using the documented API format (`criteria.true` and `criteria.false` accept objects): `true: { faz }` with the agent description and `false: { nao_faz }` with the confused pair (`PARES_CONFUNDIDOS`: smith and general-purpose, scholar and claude-code-guide, assayer and sentinel, scout and Explore). `instructions` contains only the question.
- **Band-based decision** over the selected option's `Noul` (source: docs.typesafe.ai/confidence.md): >= 0.7 suggests; <= 0.3 stays silent; between them stays silent and records `faixa: 'meio'`. `Choice` no longer uses `confidence` (measures distribution concentration, not accuracy probability; confidence.md:119): requires the selected option's probability (`probabilities[escolhido]`) >= 0.5, without calibration. Checked in the docs on 2026-11-14. The log gains `faixa` (`alta`, `meio`, `baixa`). Option order remains shuffled per prompt because of first-option bias (docs.typesafe.ai/model-jaggedness.md).
- **Estimated cost**: about US$ 0.00015 per prompt (US$ 0.042 per input Mtok, docs.typesafe.ai/models.md).
- **Closure**: calibration (step 3) and registration (step 4) were abandoned. The hook remains outside `settings.json`.
