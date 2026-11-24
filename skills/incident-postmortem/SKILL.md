---
name: incident-postmortem
description: >-
  Write an objective technical postmortem after incident mitigation or diagnosis.
  Use to record the timeline, impact, root cause, and verifiable preventive
  actions.
disable-model-invocation: true
---

# Incident Postmortem

Assume the requester is a software engineer: keep a factual, blameless tone, separating verified facts from hypotheses.

1. **Collect evidence:** gather logs, metrics, commits, PRs, alerts, and actual times. Do not invent timestamps or unproven causes; mark gaps as `[TO CONFIRM]`.
2. **Structure the document:**
   - **Executive summary:** what failed, duration, and measurable impact (users, requests, data, SLA).
   - **Timeline (UTC or explicit time zone):** detection, triage, mitigation, and recovery.
   - **Root cause and contributing factors:** the exact technical mechanism and why existing safeguards did not prevent it or detect it earlier.
   - **What worked / what failed:** detection, runbooks, rollback, observability.
   - **Corrective and preventive actions:** a table with type (`immediate` | `structural`), objective description, owner, deadline, and verification criterion.
3. **Connect to the workflow:** if an action requires an architectural change, point to an ADR (`create-adr`); if it requires a migration or fix, point to `migration` or `surgical-patch`.
4. **Report the saved path and pending gaps** for review by those involved.
