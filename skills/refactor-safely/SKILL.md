---
name: refactor-safely
description: >-
  Perform structural refactoring without changing observable behavior. Use
  when the change is larger than a surgical patch but does not require a
  data/protocol migration.
---

# Refactor Safely

Assume the requester is a software engineer: focus on behavior preservation, invariants, and reversible steps, without generic theory.

1. **Bound the target:** identify exactly which coupling, duplication, or debt to remove and what remains out of scope.
2. **Lock down behavior before moving code:** check current coverage. If tests are missing at the boundary, write characterization tests first and confirm they pass.
3. **Do not mix features with refactoring:** no business rule changes, public contract changes, or unrelated fixes in the same step.
4. **Proceed in atomic, reversible steps:** each step keeps compilation and tests green (e.g., extract -> adapt callers -> remove dead code).
5. **Validate regression:** run the focused suite after each relevant block and full validation at the end.
6. **Report objectively:** changed files, preserved invariants, validations performed, and any pending items.
