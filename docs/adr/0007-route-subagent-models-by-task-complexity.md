---
status: Proposed
date: 2026-11-20
decision-makers: []
consulted: []
informed: []
---

# 0007 - Route Subagent Models by Task Complexity

## Context and Problem Statement

Oathkeeper currently associates roles with fixed model defaults and forbids
changing models for retries. A documentation role can perform mechanical release
notes or architectural synthesis, which require different reasoning. Runner
capabilities and account model availability also differ.

## Decision Drivers

- Match reasoning depth to each subtask while controlling quota consumption.
- Preserve role permissions, project instructions and installation customizations.
- Distinguish requested settings from observed runtime behavior.

## Considered Options

- Keep fixed models per role.
- Add role variants for every model and effort combination.
- Select settings in the orchestrator using task tiers and capability checks.

## Decision Outcome

Chosen option: **orchestrator selection with capability checks**, because it
keeps seven role contracts while adapting reasoning to task uncertainty.
The user requested implementation of this policy. This record remains Proposed
pending maintainer review; [DECISION PENDING] assign decision-makers and record
formal acceptance. It does not supersede the closed Jev experiment in ADR 0002.

Apply routine, standard and complex tiers independently to each subtask.
Use per-invocation settings only when supported; preserve existing role defaults
as fallback. Allow one evidence-backed escalation within authorized scope and
budget. Never escalate to fix missing access or repeated tool errors.
Existing installations change only through the normal reviewed upgrade process.

### Consequences

- **Good:** the same role can handle routine and complex work with different
  supported models without duplicating permissions or output contracts.
- **Bad:** instruction routing is probabilistic and provider aliases can resolve
  differently — mitigation: capability checks and separate requested/observed
  receipts, followed by controlled runtime evaluation.
- **Neutral:** provider preferences need maintenance as models and schemas evolve.

### Confirmation

Validate shared policy contracts, distribution preservation, customization-safe
upgrades and documentation integrity. Runtime trials must inspect actual child
metadata before asserting a switch or quality/cost improvement.

## References

- [Routing specification and validation matrix](../adaptive-model-routing.md)
- [ADR 0002: closed Jev routing experiment](0002-roteamento-de-subagentes-com-jev.md)
