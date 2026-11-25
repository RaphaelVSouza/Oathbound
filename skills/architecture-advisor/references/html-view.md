# HTML view (Phase 6)

Read before building the view. It is generated from `assets/architecture-view.html`: a single file with no external dependencies that works offline in any browser. It shows a summary and ranking, a diagram per alternative, a tradeoff matrix with **adjustable weights** (to test sensitivity) and risks and triggers.

## Steps
1. Copy the template and replace **only** the content of `<script type="application/json" id="arch-data">` with valid JSON; remove `"example": true`. Do not touch HTML, CSS or JS.
2. Fill the JSON using the schema below.
3. Validate (see "Validation").
4. With user approval, save it next to the ADR (for example `docs/adr/NNNN-title.view.html`). The HTML is derived: the ADR is the source of truth, so regenerate instead of hand-editing.

## Helper script (optional)
With Node and `scripts/arch-check.cjs` (no dependencies; short enough to read before running):
- `node scripts/arch-check.cjs validate data.json`: checks the schema and the rules below, warns when every score is an `assumption`, and prints the ranking. It also accepts a generated `.html`.
- `node scripts/arch-check.cjs sensitivity data.json`: shows how far each weight can move and which score change (±1) flips the leader. Use it in the recommendation (confidence, fragility).
- `node scripts/arch-check.cjs render data.json -o docs/adr/NNNN-title.view.html`: writes the HTML with safe escaping (a `</script>` inside a text does not break the page). Refuses when `validate` finds an error or the JSON still has `"example": true`.
- `node scripts/arch-check.cjs adr-next [dir]`: next ADR number; reports gaps, duplicates and ADRs still `Proposed`.
- Exit code 0 = ok, 1 = problems, 2 = usage or unreadable file. Treat WARN as a point to review, not an error.
Build `data.json` as early as Phase 4 (temporary file, outside the repository): it feeds the sensitivity analysis and later `render`. Without the script, follow the manual steps.

## JSON schema
- Root: `project`, `date`, `confidence`, `decision`, `drivers[]`, `candidates[]`, `triggers[]`, `assumptions[]`.
- `drivers[]`: `id`, `name`, `scenario` (measurable), `weight` (sum 100).
- `candidates[]`: `id`, `name`, `recommended` (true on exactly one), `summary`, `reversal` (`low`, `medium` or `high`), `mustBeTrue[]`, `risks[]`, `scores`, `diagram`.
- `scores`: one entry per driver, `{ "<driverId>": { "score": 1-5, "why": "...", "source": "http(s) URL or 'assumption'" } }`.
- `diagram`: `nodes[]` (`id`, `label`, `kind`, `group`, `col`, `row`) and `edges[]` (`from`, `to`, `label`, `async`).

## Existing system
- The first alternative is the current architecture (`id: "current"`, named "Keep/adjust the current one"), with the diagram of the **real** state, drawn with the same conventions as the others.
- Add a driver "Transition cost and risk" (5 = little cost or risk; `current` tends to score high) with an agreed weight.
- `recommended: true` may sit on `current`: keeping is a valid recommendation.
- In Assess with no change alternatives, the view may have only `current`; use the drivers to show target versus observed in `scenario` and `why`.

## Diagram conventions
The same in every alternative, so they can be compared.
- `col`: layer from left to right (client, edge, application, data/external).
- `row`: vertical position within the column.
- `group`: the relevant boundary (process, team, network, provider).
- `kind`: `client`, `service`, `db`, `queue` or `external`.
- `async: true` on asynchronous links.
- At most ~12 nodes per alternative. Keep node and link labels short; the template places link labels itself and wraps long ones to two lines.
- Links are straight lines: avoid putting nodes in the path between two linked nodes.

## Content rules
- All text is plain, never HTML.
- Every score needs a `why`; a score without one does not count.
- `source` is an http(s) URL or the word `assumption`. `confidence` is `high`, `medium` or `low`.

## Validation
- JSON parses.
- Every `from`/`to` exists in `nodes`; no two nodes share a `col`/`row` cell.
- Weights sum to 100.
- Exactly one alternative has `recommended: true`.
- With a browser or screenshot tool available, open the file and check the diagram and tabs.
