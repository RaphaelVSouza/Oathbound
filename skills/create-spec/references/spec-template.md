---
status: Draft # Draft | In Review | Approved | Implemented | Superseded
date: YYYY-MM-DD
owner: [Name]
---

# [Feature / Change Title]

## Problem and Objective

What problem is being solved, why now, and the concrete outcome expected (2 to 4 sentences).

## Scope and Exclusions

### In Scope

- [Deliverable or behavior included]

### Out of Scope

- [Explicit exclusion to prevent scope creep]

## Contracts and Data

- **Interfaces / Signatures:** [HTTP endpoints, RPCs, CLI flags, function signatures]
- **Payloads / Schemas:** [request/response shapes, DB schema or migration impact, events]
- **Errors:** [error codes, failure responses, retry/fallback behavior]
- **Compatibility:** [backward compatibility guarantees or breaking-change transition]

## Invariants and Edge Cases

- **Invariants:** [rules that must never break]
- **Concurrency & Idempotency:** [race conditions, retries, ordering, locking]
- **Partial Failures & Limits:** [timeouts, size/rate limits, empty/null inputs, rollback]

## Validation Plan

- **Unit:** [what is verified in isolation]
- **Integration / Contract:** [boundary and persistence checks]
- **E2E / Manual:** [end-to-end flow or smoke commands]

## Acceptance Criteria

- [ ] [Closed, testable criterion 1]
- [ ] [Closed, testable criterion 2]

## Open Decisions <!-- remove when empty -->

- `[DECISION PENDING]`: [open question and options]

## References <!-- optional -->

- [Related ADR (`create-adr`), issue, or doc]
