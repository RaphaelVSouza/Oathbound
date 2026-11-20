---
name: create-adr
description: Write architectural decision records (ADRs). Use to propose a significant decision or update an ADR under review.
---

# Create an ADR

1. Consult the applicable `AGENTS.md`. Locate the project's ADR directory, template, and guide. Follow the local standard. Read the template and only the guide sections relevant to the task.
2. If unsure whether to record the decision, check the project's criteria. If none exist, consider architectural impact, viable alternatives, and the cost or risk of reversal.
3. For a new ADR, confirm that the path is available and the number follows the local convention. When no convention exists, use `docs/adr/NNNN-title.md` with the next sequential number, also counting rejected or superseded ADRs.
4. Create the ADR in `Proposed`. Record the date, decision-makers, context, viable alternatives, proposed decision, consequences, and how to verify compliance. Mark open decisions and information with `[DECISION PENDING]`.
5. Preserve the substance of accepted or rejected ADRs. To replace a decision, propose a new ADR referencing the previous one. Apply status changes only after the responsible parties decide and according to the local guide.
6. Report the edited path and pending items. Leave approval, commit, and publication to the responsible parties.

## Outline when no template exists

- Metadata `status: Proposed`, `date` in `YYYY-MM-DD` format, and `decision-makers`. If decision-makers are undecided, use an empty list and mark the pending item in the body.
- A title that states the proposed decision.
- Context and problem, options considered, and decision with rationale.
- Consequences with trade-offs and mitigation, confirmation, and applicable references.
