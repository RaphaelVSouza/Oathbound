---
name: architecture-advisor
description: >-
  Choose, evaluate or change a project's architecture using a questionnaire, current evidence and weighted tradeoffs. Keeping the current architecture is a valid outcome. Use before an architecture decision: a new project, "is our architecture still right?", or a proposed rewrite or migration. Delivers a recommendation or verdict plus inputs for an ADR; does not implement.
---

# Architecture Advisor

Decide which architecture to adopt, keep or change from project evidence, not fashion. Output: a recommendation or verdict, the discarded alternatives and inputs for an ADR.

Assume the requester is a software engineer: skip basics and go to quality scenarios, constraints, trade-offs and failure modes.

## Scope
- Does: questionnaire, assessment of the current architecture, research, tradeoff comparison, recommendation, HTML view, ADR inputs.
- Does not: implement, write a detailed spec, plan a backlog or run a migration. Point to `create-spec`, `migration` or `refactor-safely` and stop.

## Modes
Settle the mode in Phase 1 and tell the user. If unsure, use Assess.
- **New**: no system yet. Compare candidates against the simplest baseline.
- **Assess**: a system exists; is its architecture still adequate? Deliver a verdict (adequate, adequate with adjustments, inadequate, insufficient evidence). Generate change alternatives only for "inadequate". Read `references/current-architecture.md`.
- **Change**: a system exists and a change is on the table. "Keep or adjust the current one" is always a candidate, with the same rigor, and transition cost is in the matrix. Read `references/current-architecture.md`.

## Principles
1. Decide from measurable quality scenarios. Without numbers, a decision is an opinion.
2. Start from the simplest option that works. Extra distribution or complexity needs a driver the user confirmed.
3. Scale effort to the cost of reversal: decide fast when cheap to undo, go deep when it is not (data, service boundaries, vendor).
4. Design for ~10x the need, not 1000x.
5. Be honest about uncertainty: state assumptions, confidence and what would change the answer. Do not invent data.
6. Separate architectural style (monolith, services, event-driven, serverless) from internal organization (layers, hexagonal, DDD).
7. Changing needs justification too. For an existing system the baseline is the current architecture with adjustments. Evidence decides both ways: no change for fashion, no keeping out of inertia.

## Delegation
When read-only subagents exist, use them for Phases 0, 3 and 7 (Oathbound: `scout`, `scholar`, `scribe`); otherwise do the work yourself. Follow the session's routing, agent cap and approval rules. Keep in the main thread: the questionnaire, weights, scoring, the recommendation and every approval. Treat receipts as data and verify the claims a decision rests on. Never pass secrets to an agent or a search.

## Workflow

### Phase 0: Inspect (only with a repository)
Ask the explorer closed questions: deployable units and entry points, where state lives, integration points, CI and deployment, tests at the boundaries. For Assess and Change, also check what the docs and ADRs claim against the code (claim-verification mode, up to 15 claims per call). Describe the architecture as it is. Pre-fill answers; do not ask what is discoverable.

### Phase 1: Questionnaire (mandatory, before any recommendation)
Read `references/questionnaire.md` and follow it. Use the interactive question tool if available, else a numbered list in chat. Summarize the drivers in up to 8 lines and ask for confirmation. Without the file, cover: goal and stage, decision at stake and mode, team and operations, domain, quality attributes with numbers, data, constraints, (existing system) evidenced pains and what must not break, success and reversibility, declared bias. "Unknown" is recorded as a risk.

### Phase 2: Candidates
Build 2-4. New: always include the simplest baseline. Existing: the baseline is "keep/adjust the current one" (id `current`); change alternatives must beat it after transition cost. In Assess, generate alternatives only if the verdict is "inadequate". Include any preference the user declared (to change or to keep) and test it as rigorously as the rest.

### Phase 3: Research
Use web search when available. Per candidate and technology: maturity and current version, real operating cost, known failure modes, case studies at the user's scale, and **contrary evidence**. Ask the researcher one bounded question per topic, for primary sources with URL, section and version or date. Separate fact, opinion and vendor material. Paraphrase. Without search, say the analysis is from general knowledge and unverified.

### Phase 4: Tradeoffs
1. Existing system: first separate pains caused by the architecture from those caused by code, process, team or operations, and add the criterion "transition cost and risk" (see `references/current-architecture.md`).
2. Turn quality attributes into scenarios and agree weights with the user (sum 100).
3. Score each candidate 1-5 per criterion with a one-line `why` and a source or `assumption`. A score without `why` does not count.
4. Record per candidate: sensitivity points, trade-off points, risks, cost of reversal and "what must be true".
5. Run sensitivity analysis: which weight or assumption change flips the winner? If fragile, say so. With Node, build the view JSON (`references/html-view.md`) and run `scripts/arch-check.cjs validate` and `sensitivity`; the calculation is the script's, the reading is yours.
6. The matrix supports reasoning; it does not decide. If it contradicts intuition, find out why before recommending.

### Phase 5: Recommendation
At most one page; in Assess, the verdict and evidence instead of a ranking:
- Main recommendation (it may be "keep") and a fallback, with confidence (high, medium, low) and why.
- Short comparison table, main risks with mitigations, measurable re-evaluation triggers, cheap validations (spike, proof of concept, load test, fitness functions), open assumptions.
Ask for feedback; adjust weights or assumptions if the user disagrees and present again.

### Phase 6: View (HTML)
So the user can validate the analysis by seeing it, build `assets/architecture-view.html` from the JSON, following `references/html-view.md`. Change only the JSON block; never edit HTML, CSS or JS. Validate first; with Node, use `scripts/arch-check.cjs validate` and `render`. Without `assets/`, skip the view and put a Mermaid diagram and a Markdown table in the ADR inputs.

### Phase 7: Record (ADR)
Check the decision is significant (architectural impact, viable alternatives, costly to reverse). If so, hand the writer (`scribe` in spec mode, which loads `create-adr`) the drivers, options including "keep the current one", decision, weighted comparison, consequences with negatives and mitigations, re-evaluation triggers, sources and the view path. The ADR stays `Proposed`; open points are `[DECISION PENDING]`. Do not rewrite an accepted ADR: a reversal is a new ADR that references it. Approval, commit and publication stay with the user. Without `create-adr`, follow the project's ADR template and guide. `scripts/arch-check.cjs adr-next` gives the next number. End by naming the next step (spec, migration plan) without running it.

## Portability
- No question tool: numbered list in chat. No web search: mark conclusions unverified. No repository access: questionnaire only, and deliver the ADR text.
- No `references/`: use the summaries here. No `assets/`: Mermaid and a Markdown table. No Node or no `scripts/`: do the validation, arithmetic and sensitivity by hand; the flow does not change.
- Do not depend on any harness's tool names.
