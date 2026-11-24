---
name: grill-me
description: >-
  Conduct a structured interview in question rounds to settle requirements,
  plans, or design decisions before implementation. Activate ONLY when the user
  requests /grill-me, "grill me", "ask questions", or when the architecture has
  genuine ambiguities that require alignment.
---

# Grill Me

Interview the user relentlessly, one decision at a time, until every branch of the plan or design is resolved.

Assume the requester is a software engineer: skip basic explanations and go straight to contracts, invariants, trade-offs, failure modes, and edge cases.

## Rules

1. **Explore before asking:** If reading project code or docs can answer a question, read first — or call `invoke_subagent` with `TypeName: "scout"` and `Model: "flash_lite"` for read-only discovery. Do not ask the user the obvious.
2. **One question / focused block per round:** Use `ask_question` (batches of up to 4 focused questions; put the recommended option first prefixed with `(Recommended)`, and set `is_multi_select` when multiple choices apply), traversing each branch of the decision tree and resolving dependencies one at a time. Fall back to short numbered chat questions when `ask_question` does not fit (e.g., open-ended free text).
3. **Give your recommendation:** For each question involving a trade-off, state which option you recommend and why in 1 line.
4. **Stop when settled:** Do not invent extra questions once scope, contracts, edge cases, and validation are defined.
5. **Final summary:** When finished, deliver a compact summary of settled decisions before starting implementation (or wait for `ok`).
