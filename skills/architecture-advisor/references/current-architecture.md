# Assess the current architecture (Assess and Change modes)

Read when a system already exists. Goal: say, with evidence, whether the current architecture still fits. **Keeping it (with adjustments) is as valid an outcome as changing it.** Changing needs justification; keeping out of inertia does too.

## 1. Rebuild the architecture as it is
- Describe what the code and infrastructure do, not only what the docs say. Flag divergences.
- Record: architectural style, real boundaries (modules, services, databases), integration points, where state lives, how it is deployed and operated.
- Delegate the facts to the explorer as closed questions (one question per call). To compare docs with code, send the claims from the README, ADRs and architecture docs in claim-verification mode (up to 15 per call) and read the `✅ ⚠️ ❌ —` verdicts and GAPS.
- Draw the `current` candidate's diagram from this (see `html-view.md`).

## 2. Find what prompted the question
If the user did not say: what event or signal made them question the architecture now? Incident, slow delivery, cost, growth, a team change, someone's opinion? The answer defines what to measure.

## 3. Measure against the drivers, not an ideal
For each quality attribute in the questionnaire, compare the **target scenario** with the **observed value**. Prefer data to impressions. Evidence examples, when available:
- Delivery: deploy frequency, lead time for changes, change failure rate, time to restore.
- Operations: recent incidents and postmortems, measured SLOs, infrastructure cost per unit of use.
- Code: files that frequently change together, dependency cycles, modules that concentrate bugs, test coverage at the boundaries.
- Team: where people wait for each other, where onboarding stalls.
Without data, record "not measured" and propose the cheapest measurement. Do not invent numbers.

## 4. Attribute the cause before blaming the architecture
| Cause | Examples | Typical remedy |
|---|---|---|
| Architecture | wrong boundaries, coupling across contexts, scale limit of the style | architectural change |
| Code | local debt, missing tests, duplication | local refactoring |
| Process | manual deploys, slow review, no CI | process change |
| Team/organization | coupled teams, diffuse ownership | reorganization |
| Operations | no observability, no alerts | tooling and practices |
Only pains with an **architectural** cause justify changing the architecture. Other causes become targeted adjustments and are recorded as such.

## 4b. Transition cost and risk
For an existing system, always add the criterion **"transition cost and risk"** to the matrix, with an agreed weight (score 5 = little cost and risk; the `current` candidate tends to score high). Include: migration effort, period of dual operation, regression risk, lost productivity during the change, retraining cost, what ships late. Without this criterion the matrix compares end states and favors change.

## 5. Verdict (Assess mode)
Pick one and justify it in terms of the drivers:
- **Adequate**: meets the target scenarios with reasonable margin. Keep; define re-evaluation triggers.
- **Adequate with adjustments**: meets them, but specific points need fixing (list them with cost and gain). Not a reason to change style.
- **Inadequate**: some target scenarios cannot be met by the architecture itself, with evidence and an architectural cause. Only then generate change alternatives (Phases 2-5) and compare them with "keep" using transition cost.
- **Insufficient evidence**: say what to measure and when to reassess.
Always include confidence, what would change the verdict, measurable re-evaluation triggers and open assumptions.

## 6. Anti-bias checks
Before delivering, confirm:
- Did I look for evidence for keeping with the same effort as for changing?
- Did "keep/adjust" get scores with a `why`, like the others?
- Is transition cost in the calculation, and do scores for new alternatives avoid assuming perfect execution?
- Were pains blamed on the architecture separated from code, process, team and operations causes?
- Does the recommendation hold if the weight of "transition cost" goes up? (sensitivity analysis)
- Did the user already prefer changing or keeping? Was it declared and tested like the others?

## 7. Record
Deciding to keep is also a decision: record it in an ADR (context, drivers, evidence, adjustments, triggers). That avoids reopening it without new facts.
