---
name: grill-me
description: >-
  Conduct a structured interview in question rounds to settle requirements,
  plans, or design decisions before implementation. Activate ONLY when the user
  requests /grill-me, "grill me", "ask questions", or when the architecture has
  genuine ambiguities that require alignment.
disable-model-invocation: true
---

# Grill Me

Interview the user relentlessly, one decision at a time, until every branch of the plan or design is resolved.

Assume the requester is a software engineer: skip basic explanations and go straight to contracts, invariants, trade-offs, failure modes, and edge cases.

## Rules

1. **Explore before asking:** If reading project code or docs can answer a question, read first (or delegate to a read-only explorer subagent if available) — do not ask the user the obvious.
2. **One question / focused block per round:** Use the environment's interactive question tool (when available) or short numbered questions, traversing each branch of the decision tree and resolving dependencies one at a time.
   - Prefer a blocking question tool when available. If the tool only acknowledges submission, keep the turn active using the host's wait mechanism until the user replies or cancels. An acknowledgment is not an answer.
   - If the host cannot keep an asynchronous questionnaire open, ask in chat and await the next turn.
3. **Give your recommendation:** For each question involving a trade-off, state which option you recommend and why in 1 line.
4. **Stop when settled:** Do not invent extra questions once scope, contracts, edge cases, and validation are defined.
5. **Final summary:** When finished, deliver a compact summary of settled decisions before starting implementation (or wait for `ok`).
