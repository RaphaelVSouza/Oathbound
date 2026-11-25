---
status: Accepted
date: 2026-11-24
decision-makers: [Raphael Vieira, Oathbound Maintainers]
consulted: []
informed: []
---

<!-- Guide: docs/adr/como-escrever-adr.md. Target reading time: 5 to 10 minutes. -->

# 0010 - Standardize Subagent Output Contracts

## Context and Problem Statement

Oathbound's seven subagents (`scout`, `scholar`, `smith`, `scribe`, `assayer`, `sentinel`, `breaker`) use disparate output contracts, making auditing, comparison, and automated parsing inconsistent across runs and harnesses (Claude Code, Antigravity, Codex). Specific gaps observed before this decision:

- Pending items use incompatible names across agents: `GAPS:` in four agents, `NOTE:` in `smith`, `PENDING:` in `scribe`, and none in `breaker`.
- No subagent declares the target `SCOPE` (paths, commit/revision, or URL with access date), only `assayer` reports `COVERAGE`, and only `breaker` reports execution state (`STATUS`).
- Neither `assayer` nor `sentinel` separates finding severity from certainty/confidence; `assayer` emits `BUG`/`RISK`/`NIT`/`QUESTION` without severity ranks or an explicit boundary with `sentinel`.
- `sentinel` packs condition, impact, and mitigation into one unstructured sentence without quoted evidence, uses `CWE-285` (whose direct vulnerability mapping MITRE discourages), and emits `"No security vulnerabilities found in scope."`, asserting a negative that static inspection cannot prove.
- `breaker` writes volatile `/tmp` screenshots without persistent workspace evidence rules or sensitive-data redaction across console, network, and captures.

COBIT 2019 (40 governance/management objectives across EDM, APO, BAI, DSS, MEA) defines no code-review output format and serves here solely as a reference for traceability, verifiable evidence, and assurance controls.

## Decision Drivers

- **Traceability:** Every subagent output identifies agent, scope/revision, execution status, and open gaps.
- **Verifiable evidence:** Findings cite `path:line` or dated primary sources; clean runs state coverage rather than proving absence.
- **Parseability:** Fixed plain-text envelope and field names, one concept per field, enumerated values.
- **Security and safety:** Permitted CWE mappings only, CVSS v4.0 severity + certainty separation, and mandatory secret/PII redaction in browser evidence.
- **Low overhead:** Remain plain-text readable by humans and orchestrators without requiring external tooling at runtime.
- **Interoperability (Phase 2):** Preserve clean fields so code findings can be exported to SARIF 2.1.0 later.

## Considered Options

- **Option A — Status quo:** Keep per-agent formats (`NOTE`, `PENDING`, single-line `sentinel`, volatile `breaker` screenshots).
- **Option B — Common plain-text envelope + standardized per-agent fields (chosen, with Phase 2 SARIF 2.1.0 export):** Wrap all seven agents in one common envelope while retaining domain-specific fields and clean-scope declarations.
- **Option C — JSON / SARIF 2.1.0 as the sole output format:** SARIF models static-analysis findings cleanly for GitHub code scanning, but fits `scout`, `scholar`, `smith`, `scribe`, and E2E `breaker` flows poorly and degrades plain-text readability.

## Decision Outcome

Chosen option: **"Option B — Common plain-text envelope + standardized per-agent fields"**, because it satisfies traceability, parseability, security hygiene, and human readability with a bounded prompt and test-contract update across all three harnesses. SARIF 2.1.0 export for `sentinel` and `assayer` is explicitly deferred to **Phase 2**.

### 1. Common Envelope (All 7 Subagents)

Every subagent starts with the four header fields and ends with `GAPS:` around its role-specific body:

```text
AGENT: <scout | scholar | smith | scribe | assayer | sentinel | breaker>
SCOPE: <paths | commit/revision | URL and YYYY-MM-DD access date>
STATUS: DONE | PARTIAL | BLOCKED
CONFIDENCE: HIGH | MEDIUM | LOW
<agent-specific body>
GAPS: <missing point and evidence, or "none">
```

Rules:
- `GAPS:` replaces `NOTE:` (`smith`), replaces `PENDING:` (`scribe`), and is added to `breaker`. It is always present and equals `none` only when no gap exists.
- Whenever `STATUS` is `PARTIAL` or `BLOCKED`, `GAPS:` must name the concrete missing piece or blocker (never `none`).
- For `assayer` and `sentinel`, whenever `STATUS` is `PARTIAL`, `COVERAGE` must be `partial`.

### 2. Per-Agent Specifications

| Agent | Role-Specific Fields | Key Changes |
|---|---|---|
| `scout` | `ANSWER`, `EVIDENCE` (`path:line`; claim mode: `CONFIRMED`/`REFUTED`/`INCONCLUSIVE` + `TOTALS`) | Receives common envelope; envelope + `GAPS` do not count against `ANSWER` brevity |
| `scholar` | `ANSWER`, `SOURCES` (`URL` — section/passage; date/version) | Receives common envelope; `SCOPE`/`SOURCES` capture access date (`YYYY-MM-DD`) |
| `smith` | `FILES`, `ACCEPTANCE` (`<command> -> actual vs expected>`) | Replaces `NOTE:` with `GAPS:`; adds envelope (`STATUS` distinguishes `DONE`/`PARTIAL`/`BLOCKED`) |
| `scribe` | `MODE` (`spec \| release`), `FILES` | Replaces `PENDING:` with `GAPS:`; `spec` cites requirement IDs (when present); `release` cites version and changelog items |
| `assayer` | `BUG`/`RISK` with `[CRITICAL\|HIGH\|MEDIUM\|LOW]`, unranked `NIT`/`QUESTION`, `totals`, `COVERAGE` | Adds severity scale to `BUG` and `RISK`; delegates deep security findings to `sentinel` |
| `sentinel` | Structured finding blocks (below), `totals`, `COVERAGE` | Replaces `CWE-285` with `CWE-862`/`CWE-863`; adds certainty, `CONDITION`/`IMPACT`/`FIX`/`EVIDENCE`/`SCORE`, and `COVERAGE`; clean output becomes `No findings in scope.` |
| `breaker` | `RESULT` (`PASS \| FAIL \| none`), `ENVIRONMENT`, `FLOW`, `CONSOLE`, `NETWORK`, `EVIDENCE` | `STATUS` moves to envelope execution state; `RESULT` holds test verdict (`none` when `STATUS: BLOCKED`); `FLOW` includes reproduction steps on `FAIL`; `EVIDENCE` uses `.scratch/breaker/` with secret/PII redaction |

### 3. `sentinel` Finding Block & `CONFIDENCE` Criteria

```text
path/to/file.ts:42: HIGH [CWE-89] [CONFIRMED|LIKELY|POSSIBLE]
CONDITION: <source -> sink; exploitation precondition>
IMPACT: <consequence on Confidentiality/Integrity/Availability>
FIX: <objective mitigation>
EVIDENCE: <excerpt up to 2 lines>
SCORE: <CVSS-B|BT|BE|BTE 4.0 vector and score, or "not scored">
totals: <n> CRITICAL, <n> HIGH, <n> MEDIUM, <n> LOW
COVERAGE: complete | partial
GAPS: <missing point and evidence, or "none">
```

Without confirmed/suspected findings:

```text
No findings in scope.
COVERAGE: complete | partial
GAPS: <missing point and evidence, or "none">
```

Finding certainty levels (`[CONFIRMED | LIKELY | POSSIBLE]`):
- `CONFIRMED`: reproduced or demonstrated directly from read code with cited evidence.
- `LIKELY`: plausible data/control path exists without proof of exploitation.
- `POSSIBLE`: depends on unseen context or external configuration.

Severity and CWE rules:
- Use CVSS v4.0 (`CVSS-B`, `CVSS-BT`, `CVSS-BE`, or `CVSS-BTE`) when scoring, or `SCORE: not scored`. Because CVSS measures technical severity rather than organizational risk, both certainty (`CONFIRMED|LIKELY|POSSIBLE`, plus envelope `CONFIDENCE`) and `CONDITION` are mandatory.
- Use only CWE IDs permitted for direct vulnerability mapping; replace `CWE-285` with `CWE-862` (Missing Authorization) or `CWE-863` (Incorrect Authorization).

### 4. Consequences

- **Good:** Uniform top/bottom envelope enables a single parser across all seven agents (`test/agents/contratos.js`) while preserving plain-text readability.
- **Good:** `sentinel` findings capture exploit preconditions, C/I/A impact, CWE validity, quoted evidence, and incomplete-coverage honesty (`No findings in scope.` + `COVERAGE`).
- **Good:** `breaker` separates infrastructure blocks (`STATUS: BLOCKED`) from test verdicts (`RESULT: FAIL`), preserves reproducible steps, stores persistent artifacts under gitignored `.scratch/breaker/`, and mandates redaction of tokens, cookies, and PII.
- **Bad:** Longer outputs exceed tight caller line caps if callers count envelope lines against the answer budget — _mitigation:_ keep `ANSWER` concise (up to 5 lines) independently of the 4-line envelope header and `GAPS:` footer.
- **Bad:** Renaming `breaker`'s `STATUS` and `smith`/`scribe`'s `NOTE`/`PENDING` breaks parsers expecting the legacy labels — _mitigation:_ update all 21 subagent prompts, `test/agents/regras-comuns.json`, and `test/agents/contratos.js` in the same change.
- **Bad:** LLM-assigned CVSS v4.0 scores may vary from analyst scoring — _mitigation:_ treat `SCORE` as indicative and permit `SCORE: not scored`.

### 5. Confirmation

- `node test/agents/contratos.test.js` validates envelope compliance, `GAPS:` consistency on `PARTIAL`/`BLOCKED`, `sentinel` structured fields (`CWE-862`/`863`, rejection of `CWE-285` or `"No security vulnerabilities found in scope."`), `assayer` severities on `BUG`/`RISK`, `breaker` `RESULT` vs `STATUS`, and rejection of legacy `NOTE:`/`PENDING:`.
- `node test/agents/model-routing.test.js` and `node test/agents/sincronia.js` verify prompt parity and contract markers across all 21 files (`claude/agents/*.md`, `agy/config/agents/*.md`, `codex/agents/*.toml`).
- `node tools/audit-docs.ts` verifies links and documentation references across the repository.

### 6. COBIT 2019 Traceability Mapping (Informative)

This ADR infers the following mapping to COBIT 2019 objectives (COBIT does not prescribe coding-agent roles):
- `sentinel`: `APO13` (Managed Security), `DSS05` (Managed Security Services)
- `breaker`: `BAI07` (Managed IT Change Acceptance and Transitioning)
- `assayer`, `smith`: `BAI03` (Managed Solutions Identification and Build)
- `scribe`: `BAI08` (Managed Knowledge)
- All subagents (output assurance): `MEA04` (Managed Assurance)

### 7. Open Follow-ups

- **Phase 2 — SARIF 2.1.0 Export:** Implement and schema-validate optional SARIF 2.1.0 export from `sentinel` and `assayer` outputs (tracked outside this ADR's Phase 1 rollout).

## References

- [test/agents/contratos.js](../../test/agents/contratos.js) — Automated subagent output contract validators
- [test/agents/regras-comuns.json](../../test/agents/regras-comuns.json) — Cross-harness shared safety and gate rules
- COBIT 2019 Governance & Management Objectives ([ISACA](https://www.isaca.org/resources/news-and-trends/industry-news/2018/a-new-cobit-is-in-town-and-i-really-like-how-it-looks))
- SARIF 2.1.0 OASIS Standard ([OASIS Errata 01](https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/sarif-v2.1.0-errata01.html)) & [GitHub code scanning SARIF support](https://docs.github.com/en/code-security/concepts/code-scanning/sarif-files)
- FIRST CVSS v4.0 Specification ([FIRST](https://www.first.org/cvss/v4.0/))
- MITRE CWE mappings: [CWE-89](https://cwe.mitre.org/data/definitions/89.html), [CWE-285 (discouraged)](https://cwe.mitre.org/data/definitions/285.html), [CWE-862](https://cwe.mitre.org/data/definitions/862.html), [CWE-863](https://cwe.mitre.org/data/definitions/863.html)
