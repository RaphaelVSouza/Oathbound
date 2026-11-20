---
name: test-strategy
description: >-
  Design a test strategy and matrix for critical, complex, or legacy code.
  Use to choose the right test level (unit, integration, contract, E2E) and
  cover invariants and failure modes without brittle mocks.
---

# Test Strategy

Assume the requester is a software engineer: prioritize risk, invariants, and determinism, without repeating basic testing concepts.

1. **Map risk and invariants:** read the target code/spec and list what must not fail (business rules, contracts, persisted state, security, concurrency).
2. **Build the case matrix:** explicitly cover:
   - Minimal happy path.
   - Edges and limits (empty, null, maximum, ordering, time zone/encoding).
   - Failure modes (network/IO error, timeout, invalid input, partial failure).
   - State and concurrency (idempotency, retry, event ordering), when applicable.
3. **Choose the minimum effective level:** prefer the fastest, most deterministic level that proves actual behavior (unit -> integration -> contract -> E2E).
4. **Avoid brittle mocks:** test observable behavior at boundaries, not private implementation details. Only isolate slow or nondeterministic external dependencies.
5. **Define validation criteria:** provide exact commands for filtered execution and what each test block proves.
