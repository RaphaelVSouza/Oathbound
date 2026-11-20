---
status: Proposed # Proposed | Accepted | Rejected | Deprecated | Superseded by ADR-NNNN
date: YYYY-MM-DD # date of the last status change
decision-makers: [Name 1, Name 2]
consulted: [] # optional: who provided technical input
informed: [] # optional: who only needs to know the decision
---

<!-- Guide: docs/adr/como-escrever-adr.md. Target reading time: 5 to 10 minutes. -->

# NNNN - Short Title Stating the Decision Made

## Context and Problem Statement

Current situation, technical or business constraints (deadline, budget, team, legacy, SLA) and the problem requiring a decision. Neutral tone, without selling the solution (2 to 4 sentences).

## Decision Drivers <!-- optional -->

- [Relevant NFR, e.g. p99 latency below 100 ms]
- [Cost, learning curve, deadline or compliance]

## Considered Options

- [Option 1]
- [Option 2]
- [Option 3]

## Decision Outcome

Chosen option: **"[Option 1]"**, because [rationale tied to the drivers above].

<!-- If the rule applies only to new code, state here how legacy code will be handled. -->

### Consequences

- **Good:** [concrete benefit].
- **Bad:** [accepted trade-off, operational cost or limitation] — _mitigation:_ [how to reduce it].
- **Neutral:** [side effect or required adjustment].

### Confirmation

[How to verify compliance: automated test, lint/architecture rule, code review checklist, Go/No-Go criterion.]

## Pros and Cons of the Options <!-- optional for simple decisions -->

### [Option 1]

- **Good:** because [argument].
- **Bad:** because [argument].

### [Option 2]

- **Good:** because [argument].
- **Bad:** because [argument].

## References <!-- optional -->

- [Related RFC, benchmark, issue or ADR]
