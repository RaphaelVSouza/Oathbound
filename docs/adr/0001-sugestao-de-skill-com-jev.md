# ADR 0001 — Per-Prompt Skill Suggestions with Jev

Date: 2026-11-14. Status: **experiment closed**. Acceptance criteria were not met. The prototype remains inactive in `hooks/skill-suggest.js`.

Language note: historical measurements used Portuguese prompts and corpora. English translations have not been recalibrated.

## Context

The agent sees only truncated skill descriptions and sometimes loads the wrong skill or loads one unnecessarily. TypeSafe's `skill_suggestion` cookbook (<https://docs.typesafe.ai/cookbooks/skill_suggestion.md>) reports, across 452 requests with `claude-haiku-4-5` and 194 skills: wrong loads decreasing from 15.7% to 7.9% and unnecessary loads from 14.0% to 5.2%. In the same measurement, suggestions fixed 29 cases and broke 7: a confident wrong suggestion can override a correct decision. These are their numbers, with a different catalog and language.

Jev (System One) returns typed responses, not text. It is already used in data curation pipelines, with the same `JEV_API_KEY` key and endpoint. The key was validated on 2026-11-14. No version above `jev-1.14.0` exists (changelog and `/v1/models`).

## Evaluated Design

1. **`UserPromptSubmit` hook** in `hooks/skill-suggest.js` injects at most one `<skill_relevance>` line as additional context. The agent decides independently; the line is a hint.
2. **One request per prompt**, with three questions: `Choice` over the catalog (which skill), `Noul` `acao` (requires an action or procedure) and `Noul` `nomeia` (names a tool, format or method). Suggest only if `acao >= 0.3` or `nomeia >= 0.5` **and** the `Choice` `confidence >= 0.5`. The cookbook uses two requests (reranking the top 3); this remains an alternative if measurement shows one is insufficient. The local catalog has 44 skills, against 194 in the cookbook.
3. **Catalog read from disk**: `skills/*/SKILL.md` (excluding `_*`) and the latest version of each plugin in `plugins/cache`. Descriptions limited to 300 characters.
4. **Option order shuffled** per prompt (text hash), to control `Choice` first-option bias.
5. **Pinned version `jev-1.14.0`**, recorded in the log.
6. **Silent failure**: missing key, no network, 4 s timeout, HTTP error or invalid response inject nothing and do not block the prompt. Prompts shorter than 15 characters or beginning with `/` are not sent.
7. **Privacy**: text goes to the external service after `redigir()` (the same secret redaction as `agent-audit.js`) and truncation to 2000 characters. The `state/skill-suggest.jsonl` log stores skill, confidence, probabilities, size and model, **never the prompt**.

Thresholds are cookbook constants, without calibration on this dataset.

## Acceptance Criteria (Fixed Before Measurement)

- Review a sample of real prompts from `history.jsonl` for privacy before any submission (the file may contain sensitive data), using the skill actually loaded as reference, alongside prompts where no skill was loaded.
- Report separately: wrong load, unnecessary load and suggestions contradicting the agent's correct choice. Accept only if the "broke" rate stays below the "fixed" rate.
- Measured latency: hook p50 and p95. Register in `settings.json` only with p95 below the configured `timeout`, with margin.
- Choose thresholds on the sample curve and check them on a separate sample.

## Measurement Results (2026-11-14)

Sample: 121 eligible human prompts from transcripts (`tests/skill-suggest/extrair.js`, `medir.js`), `jev-1.14.0`, 0 errors. Reference: what the agent actually did.

- **Skills: inconclusive.** Only 1 prompt loaded a skill (`typesafe:typesafe-ai`, which Jev suggested with confidence 1.00). Without a reference, wrong or unnecessary loads cannot be measured. The hook would suggest for 48 of 121 prompts (40%), dominated by `caveman:*`.
- **Subagents: weak.** In 11 prompts with a subagent, `Choice` selected the first correctly in 6 (55%); with current thresholds, it suggested correctly in 4, incorrectly in 3 and stayed silent in 4 (low `confidence`). Confusions: `general-purpose` instead of `smith`; `scholar` instead of `claude-code-guide`. Without an actual subagent, it would suggest for 50 of 110 prompts. The confidence interval for 6/11 is wide (about 25% to 83%).
- **Sample limitations:** few prompts, one person, catalog of 11 subagents (the cookbook uses 194 skills). Thresholds come from the cookbook and `acao` does not make sense for subagents.

Conclusion: close the experiment. The sample did not demonstrate sufficient benefit to add latency and send prompts to an external service. The hook remains outside `settings.json`.

## Consequences of Possible Activation

- Each eligible prompt makes an external call (small latency and cost, without a ledger) and sends user text to TypeSafe.
- Depends on `JEV_API_KEY` in the environment; without it the hook does nothing.
- Reversible: remove the hook entry from `settings.json`.

## Rejected Alternatives

- **No suggestions** (current state): retains the load error measured in the cookbook.
- **Embeddings**: new dependency and index for a small catalog.
- **Two requests as in the cookbook**: more latency without evidence, on this dataset, that one request is insufficient.
