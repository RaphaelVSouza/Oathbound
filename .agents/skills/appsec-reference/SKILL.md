---
name: appsec-reference
description: Reference data for classifying application security findings: CWE IDs allowed for mapping to real vulnerabilities with their MITRE mapping status, CVSS v4.0 nomenclature and severity bands, and finding-certainty criteria. Use when assigning a CWE ID, severity or certainty to a vulnerability finding, or when auditing code for security issues. Not for general code review.
metadata:
  verified-on: "2026-11-24"
---

# AppSec reference

Reference data for classifying vulnerability findings. It does not define an output format: the calling agent's contract does.

## CWE IDs

Cite only IDs whose MITRE "Vulnerability Mapping" status is ALLOWED or ALLOWED-WITH-REVIEW, never DISCOURAGED or PROHIBITED. For an ID not listed here, check its page (https://cwe.mitre.org/data/definitions/<id>.html); if you cannot, do not cite it and record that in GAPS. Never state a mapping status from memory.

Status checked on 2026-11-24. REVIEW means ALLOWED-WITH-REVIEW: read the mapping notes on the MITRE page before citing the ID.

| Area | CWE | Title | Status |
| --- | --- | --- | --- |
| Injection | 78 | Improper Neutralization of Special Elements used in an OS Command | ALLOWED |
| Injection | 89 | Improper Neutralization of Special Elements used in an SQL Command | ALLOWED |
| Access control | 639 | Authorization Bypass Through User-Controlled Key | ALLOWED |
| Access control | 862 | Missing Authorization | REVIEW |
| Access control | 863 | Incorrect Authorization | REVIEW |
| Cryptography and secrets | 312 | Cleartext Storage of Sensitive Information | ALLOWED |
| Cryptography and secrets | 798 | Use of Hard-coded Credentials | REVIEW |
| Configuration and exposure | 209 | Generation of Error Message Containing Sensitive Information | ALLOWED |
| Configuration and exposure | 918 | Server-Side Request Forgery | ALLOWED |
| Data handling | 22 | Improper Limitation of a Pathname to a Restricted Directory | REVIEW |
| Data handling | 502 | Deserialization of Untrusted Data | ALLOWED |

Do not use CWE-285 (Improper Authorization): MITRE marks its mapping DISCOURAGED. Use 862 or 863.

The MITRE pages for 22, 798, 862 and 863 label the status ALLOWED but describe or note it as allowed with review; treat them as REVIEW.

## CVSS v4.0

CVSS measures the severity of a vulnerability, not organizational risk. Never judge risk from a score alone: pair it with finding certainty and the exploitation condition.

Nomenclature: CVSS-B (Base), CVSS-BT (Base + Threat), CVSS-BE (Base + Environmental), CVSS-BTE (Base + Threat + Environmental). Always state which one a score is.

Qualitative severity bands: LOW 0.1-3.9, MEDIUM 4.0-6.9, HIGH 7.0-8.9, CRITICAL 9.0-10.0.

When no score is computed, write "not scored", assign the label from the impact on confidentiality, integrity and availability and from the exploitation precondition, and state that basis in CONDITION.

## Finding certainty

- CONFIRMED: reproduced, or demonstrated in the code read, with cited evidence.
- LIKELY: plausible path without proof of exploitation.
- POSSIBLE: depends on context or configuration not seen.

This is the proof level of one finding. It is not the agent's overall CONFIDENCE.

## Secrets

Report a hardcoded secret with path, line and CWE only. Never print, quote or log the value.

## Maintenance

Statuses and bands are a snapshot. Re-verify them when MITRE publishes a new CWE release or FIRST revises CVSS, and update `verified-on`.
