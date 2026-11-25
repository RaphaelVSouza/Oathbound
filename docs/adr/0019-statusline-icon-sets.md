---
status: Accepted
date: 2026-11-25
decision-makers: [Oathbound Maintainers]
---

# 0019 - Selectable status line icon sets

## Context and Problem Statement

The native status line shows a brand mark and one glyph per running subagent. Glyphs depend on the terminal font. A single custom font (`assets/glyphs/OathboundIcons.ttf`, Private Use Area `U+EF00` to `U+EF07`) would lock users to one font setup, and a terminal font list cannot be assumed to fall back to it.

## Considered Options

- Keep Unicode symbols only.
- Switch to the custom PUA font for everyone.
- Offer several icon sets, chosen by the user, with Unicode as the default.

## Decision Outcome

Add the `OATHBOUND_STATUSLINE_ICONS` environment variable read by `oathbound-hook statusline`:

- `unicode` (default and fallback for any other value): BMP symbols, no install needed.
- `nerd`: Font Awesome code points (`U+F0E3`, `U+F02D`, `U+F040`, `U+F0E7`, `U+F24E`, `U+F132`, `U+F14E`; brand `U+F219`) from a Nerd Font.
- `oathbound`: the PUA glyphs of `OathboundIcons.ttf`.
- `ascii`: `*` brand and `>` for every agent.

The hook cannot detect installed fonts, so the choice is explicit user configuration. Scope: the Rust hook (Claude and agy) and the Codex Node provider `codex/statusline.cjs`, which mirrors the same tables.

### Consequences

- Default output is unchanged.
- `nerd` and `oathbound` show empty boxes without the matching font; the fix is `unicode` or `ascii`.
- Width accounting already budgets two cells per non-ASCII character, so PUA glyphs are covered conservatively.
- The Nerd Font code points match Font Awesome 4.7 names (`U+F0E3` gavel, `U+F02D` book, `U+F040` pencil, `U+F0E7` bolt, `U+F24E` balance-scale, `U+F132` shield, `U+F14E` compass, `U+F219` diamond), checked against the Font Awesome 4.7.0 `_variables.scss` and the Nerd Fonts `glyphnames.json`. The brand glyph `U+F219` was seen rendering as a diamond in a Meslo Nerd Font; the role glyphs were not visually checked.

### Confirmation

Unit test `icon_sets_select_glyphs_and_default_to_unicode`. Visual check: `nerd` brand glyph confirmed in a Meslo Nerd Font; the role glyphs and the `oathbound` set are pending.
