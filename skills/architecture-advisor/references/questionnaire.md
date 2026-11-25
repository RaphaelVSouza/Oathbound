# Questionnaire (Phase 1)

Read before asking. It is mandatory and comes before any recommendation.

## How to ask
- Use the interactive question tool if available: blocks of up to 4 questions, recommended option first. If the tool only acknowledges submission, keep the turn open until the user replies; an acknowledgment is not an answer.
- Without it, send a numbered list in chat and wait.
- Non-interactive run: assume conservative defaults and mark each assumption.
- Do not ask what Phase 0 found; present it as "found X, confirm?".
- "Unknown" is a valid answer and becomes a recorded risk.
- At most one follow-up round, only for vague answers.
- End with a summary of the drivers in up to 8 lines and ask for confirmation before moving on.

## Questions
1. **Goal and stage**: business problem, phase (MVP, growth, legacy), 1-3 year horizon.
2. **Decision and mode**: new project, assess the current architecture, or change it? What exactly must be decided? For an existing system, what prompted the question now (incident, slow delivery, cost, growth, someone's opinion)? If unsure, the mode is Assess.
3. **Team**: size, seniority, number of teams, experience with the candidate technologies, who operates production.
4. **Domain**: complexity, volatility of the rules, known context boundaries.
5. **Quality attributes (top 3-5, with numbers)**: ask for measurable scenarios, for example "p95 < 300 ms at 500 req/s", "99.9% availability", "independent deploys per team". Cover performance/scale, availability, data consistency, security/compliance, evolvability, testability, cost, observability. Without a number, record a gap.
6. **Data**: volume, read/write pattern, transaction needs, retention, residency.
7. **Constraints**: budget, deadline, cloud/vendor, regulation, required or forbidden technologies, integrations.
8. **Operations**: CI/CD maturity, observability, on-call, tolerated operating cost.
9. **(Existing system)** current pains **with evidence** (incidents, delivery time, cost, metrics), what works well and must be preserved, what must not break, downtime tolerance, test coverage, and what happens in 12 months if nothing changes. Record causes that are code, process, team or operations separately (see `current-architecture.md`).
10. **Success and reversibility**: how will we know it worked? What time or cost to go back is acceptable? Who decides?
11. **Declared bias**: is there an option preferred or ruled out in advance? Why?

## Driver summary (template)
- Mode (New | Assess | Change) and what prompted the question: ...
- Goal and stage: ...
- Team and operations: ...
- Quality attributes (with numbers): ...
- Data and constraints: ...
- Existing system: evidenced pains, what to preserve, what must not break: ...
- Declared bias: ...
- Gaps and assumptions: ...
