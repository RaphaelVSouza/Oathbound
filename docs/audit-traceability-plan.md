# Audit traceability implementation plan

Improve Claude Code tool-call correlation, Antigravity CLI child-session linking, Oathbound release attribution, and delegation outcome reporting. Use the November 14–23, 2026 local extraction as the baseline. Its logs span projects and its two CLIs measure different events.

## 1. Correlate Claude tool attempts and guard decisions

The native writer already persists `tool_use_id` when the payload supplies it. The extractor requires session, agent, and call IDs. None of the 2,237 historical call rows met that requirement. The 57 block rows include 29 distinct keys with no matching call in the window.

- Inspect sanitized payload shapes and key presence across the audit and guard paths. Establish which hook sees an attempt before a deny decision, including plugin and manual installs.
- Preserve the native call ID on both records wherever available. Validate session and call ID uniqueness before relaxing the current agent-ID requirement. Count each observed attempt once, including denied attempts, using one shared identity or one canonical decision row that explicitly represents an attempt.
- Report keyed coverage, duplicates, unmatched decisions, and event counts separately. Publish a block rate only for a window or explicitly defined cohort with a complete attempted-call denominator and attributable decisions. Preserve existing historical counts.
- Accept when fixtures cover allowed and denied calls, duplicated rows, missing IDs, and decisions across rotations and date boundaries. A denied attempt counts once in the denominator and once in the numerator. Incomplete cohorts report counts and a null rate.

[DECISION PENDING] Confirm which stable identifiers and hook ordering supported Claude versions expose. Document the fallback if a path lacks joinable IDs.

## 2. Strengthen Antigravity CLI session links

The extractor found 97 invocations, linked 46 using adjacent creation evidence, and marked 51 ambiguous. Only 11 of 17 CLI history conversations had a transcript.

- Inspect sanitized transcript shapes for explicit invocation and child IDs, including batches, repeated creation records, and status queries.
- Prefer explicit one-to-one links. Keep the existing isolated adjacent rule as a labeled evidence method. Record source references and reasons for ambiguous or missing links. Treat transcript presence and child-link coverage as separate metrics.
- Accept when fixtures cover explicit IDs, isolated legacy calls, batches, repeated records, conflicting links, status polls, and absent transcripts. Preserve each batch invocation and leave unresolved links unknown. Report how many of the baseline ambiguities the new evidence resolves.

[DECISION PENDING] Confirm which structured fields the installed Antigravity CLI exposes. Use transcript-based extraction where producer instrumentation is unavailable.

## 3. Attribute events to Oathbound releases

- Add versioned producer metadata to records Oathbound writes. Use the release version from `VERSION` at build time and derive plugin or manual mode from the configured entry point. Keep producer identity distinct from agent identity.
- Normalize metadata in `tools/extract-audit.ts`. Keep existing fields and historical attribution readable. Report coverage by producer version and mode. Preserve name-based matches for legacy records and unknown values where the source supplies no installation evidence.
- Accept when plugin and manual package fixtures emit the expected release and mode. Old, partial, and third-party rows retain their supported interpretation. The extractor version never fills in a missing producer version.

## 4. Measure delegation outcomes

- Inventory lifecycle events and stable delegation or attempt IDs per CLI. For Claude, use verified lifecycle hooks or transcript evidence. For Antigravity, use verified child-session evidence and terminal records. Keep lifecycle rows separate from tool-call rows.
- Track observed starts, terminal outcomes, unresolved attempts, and retries with evidence. Count a retry only when the source links attempts to the same delegation. Calculate duration only from matched timestamps. Report coverage per CLI and agent alongside outcome counts.
- Accept when fixtures cover parallel delegations, repeated terminal records, open attempts, failures, and explicit retries. Missing terminal evidence stays unknown.

[DECISION PENDING] Confirm terminal and retry evidence for each CLI. Ship observed outcomes first if retry identity is unavailable.

## Delivery and validation

Ship one release covering Claude Code, Antigravity CLI, and Codex. Implement Claude correlation first, then land Antigravity linking and producer attribution within that release. Build outcome metrics on the validated identities.

Verify Codex lifecycle auditing and join keys. Include Codex in producer attribution, lifecycle outcomes, and coverage reporting. Require verified telemetry and explicit coverage gaps for all three CLIs before release.

Use synthetic fixtures with redacted payload shapes and replay the baseline locally. Compare old and new event totals, explain intentional metric differences, and report identifier and transcript coverage. Validate native hooks, generated packages, and extractor output on supported entry points before release.

Keep audit payloads limited to identifiers, timestamps, event classifications, and source references. Avoid adding prompt content, tool arguments, secrets, or absolute user paths. Preserve guard decisions and audit rotation behavior. Keep readers compatible with existing logs and coordinate any breaking export change through a versioned schema. Update `VERSION`, `CHANGELOG.md`, package version references, and the extractor documentation with behavior changes. Preview installation upgrades and preserve local changes.
