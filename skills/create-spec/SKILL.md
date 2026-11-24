---
name: create-spec
description: >-
  Write a verifiable technical specification before implementing features or
  medium/large changes. Use to settle the objective, exclusions, contracts,
  invariants, edge cases, validation plan, and acceptance criteria.
---

# Create a Technical Specification

Assume the requester is a software engineer: go straight to contracts, invariants, trade-offs, and failure modes, without introductory explanations.

1. Consult the applicable `AGENTS.md` and check whether the project has a specs directory or template. Follow the local convention; if none exists, fall back to [spec-template.md](references/spec-template.md).
2. Explore relevant code and docs before writing (or delegate to `scout`) to ground the spec in actual paths, types, and boundaries.
3. Structure the spec with objective, verifiable decisions:
   - **Problem and objective:** what changes and why, in a few lines.
   - **Scope and exclusions:** explicit boundaries to prevent scope creep.
   - **Contracts and data:** signatures, payloads, schemas, events, errors, and backward compatibility.
   - **Invariants and edge cases:** rules that must never break, concurrency, idempotency, partial failures, and limits.
   - **Validation plan:** unit, integration, contract, or manual tests needed to prove delivery.
   - **Acceptance criteria:** a closed, testable definition of "done".
4. Mark gaps or open decisions with `[DECISION PENDING]` (use `grill-me` if significant architectural ambiguity exists).
5. If the spec introduces a significant architectural decision, indicate that an ADR should be created via `create-adr`.
6. Report the created/edited path and any pending items before starting implementation.
