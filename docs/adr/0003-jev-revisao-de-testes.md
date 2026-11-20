# ADR 0003 — Jev in Test Change Reviews

Date: 2026-11-14. Status: manual prototype, with a provisional threshold measured on synthetic data.

Language note: historical measurements used Portuguese prompts and corpora. English translations have not been recalibrated.

## Decision

Run `test/jev/revisar-teste.js` on demand when comparing a test with a requirement needs text interpretation. The command receives an acceptance criterion, the previous assertion and the diff. It reuses Jev transport with a `Noul` question about weakening.

The command sends these three fields to TypeSafe after applying auditor redaction. Use synthetic examples or authorized excerpts. Output contains only status, probability or an unavailability reason.

Use `alerta` from 0.81, `sem_alerta` up to 0.30 and `inconclusivo` between them. Use the signal in human review. Infrastructure failure returns `indisponivel`. Missing delegation, failing tests and repeated errors are local checks.

## Usage

Prepare JSON with the three fields, as in this early-expiration case:

```json
{
  "criterio": "The reservation expires at second 323.",
  "assercao_anterior": "assert.deepEqual(expire(322), [])",
  "diff": "- assert.deepEqual(expire(322), [])\n+ assert.deepEqual(expire(322), ['boundary'])"
}
```

With `JEV_API_KEY` in the environment, run in Git Bash:

```bash
rtk proxy node test/jev/revisar-teste.js < caso.json
```

JSON output. Code 0 indicates completed analysis, 1 unavailability and 2 invalid input.

## Preliminary Calibration

Two subagents prepared independent synthetic sets. The answer key was reviewed before measuring the checking set. With `jev-1.14.0`, we measured 18 calibration cases and 18 checking cases. The model received only the three input fields. Labels stayed with the evaluator.

| Set | No alert / alert | Weakenings alerted | Legitimate changes alerted | Uncertain cases remaining inconclusive |
| --- | --- | --- | --- | --- |
| Calibration | 0.30 / 0.70 | 7/8 | 2/8 | 0/2 |
| Calibration | 0.30 / 0.81 | 6/8 | 0/8 | 2/2 |
| Checking | 0.30 / 0.70 | 7/7 | 0/9 | 1/2 |
| Checking | 0.30 / 0.81 | 7/7 | 0/9 | 2/2 |

Calibration suggested 0.65 / 0.81 before checking. At that pair, an uncertain checking case became `sem_alerta`. We kept 0.30 to avoid that dismissal. With 0.30 / 0.81, the two calibration weakenings without a positive alert remained inconclusive. The change is provisional and requires another independent sample.

To repeat both measurements with the API:

```bash
rtk proxy node test/jev/medir-revisao.js test/jev/casos-calibracao.json
rtk proxy node test/jev/medir-revisao.js test/jev/casos-conferencia.json
```

Before proposing hook integration, compare with an independent human answer key and report detection, false alerts and the inconclusive rate.
