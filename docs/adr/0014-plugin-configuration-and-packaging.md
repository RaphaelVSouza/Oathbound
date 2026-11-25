---
status: Proposed # Proposed | Accepted | Rejected | Deprecated | Superseded by ADR-NNNN
date: 2026-11-25 # date of the last status change
decision-makers: [Oathbound Maintainers]
consulted: []
informed: []
---

<!-- Guide: docs/adr/como-escrever-adr.md. Target reading time: 5 to 10 minutes. -->

# 0014 - Adopt selected Claude Code plugin configuration and packaging fields

## Context and Problem Statement

The Claude package manifest at `.claude-plugin/plugin.json` declares `name`, `displayName`, `version`, `icon`, `description`, `author`, `repository`, `license`, `skills` and `agents`. It declares nothing else. Runtime settings that a user may reasonably want to change (audit directory, guard strictness, per-role model and effort) are read today from environment variables such as `AGENT_AUDIT_DIR` in `native/oathbound-hook/src/guards/audit.rs`, with a fallback to `~/.claude/state`. Persistent plugin state has no sanctioned location. Newer Claude Code plugin manifest fields could cover these gaps, but each has a cost and some overlap with decisions already made in ADR-0004 and ADR-0009.

External facts in this ADR come from a secondary research report and were not re-verified against the vendor documentation during drafting. They are marked "unverified" and must be checked before this ADR is accepted.

## Decision Drivers

- Hooks run on every tool call and must work offline (ADR-0009).
- The repository has zero npm dependencies and the hook is one native binary (ADR-0004, `AGENTS.md`).
- Users currently configure the package through environment variables or by editing installed files; neither is discoverable.
- Package state must survive plugin updates without writing into the plugin cache.
- Every new manifest field adds a compatibility floor on the Claude Code version.

## Considered Options

Per feature, each with a verdict:

- **`engines` (minimum Claude Code version):** adopt.
- **`${CLAUDE_PLUGIN_DATA}` (persistent per-plugin data directory):** adopt.
- **`userConfig` (user-prompted options, narrowly):** adopt narrowly.
- **`bin/` (executables added to PATH):** defer.
- **`dependencies` (plugin-to-plugin dependencies):** reject.
- **Do nothing:** keep environment variables and `~/.claude/state` only.

## Decision Outcome

Chosen option: **adopt `engines`, `${CLAUDE_PLUGIN_DATA}` and a narrow `userConfig`; defer `bin/`; reject `dependencies`**, because these address the discoverability and state-location drivers without adding runtime dependencies or network access.

- **`userConfig`, ranked first by value.** Expose only non-secret options: audit directory, guard strictness, and per-role model and effort. Do not collect secrets through it. Unverified: values are substituted as `${user_config.KEY}` and exported to hooks as `CLAUDE_PLUGIN_OPTION_<KEY>`, with a strict schema, since Claude Code v2.1.271. The native hook must keep today's environment-variable behavior as the default when no option is set, so installations without the feature behave identically.
- **`engines`.** Declare a minimum Claude Code version so unsupported hosts fail at install rather than at hook time. Unverified: introduced around v2.1.319 to v2.1.323. The floor must be the highest version among the fields this ADR adopts.
- **`${CLAUDE_PLUGIN_DATA}`.** Use as the default audit location when set, with `AGENT_AUDIT_DIR` still taking precedence. This changes the default audit path from `~/.claude/state`; existing audit files stay where they are and are not migrated (see Consequences).
- **`bin/` deferred.** The hook is already invoked by absolute path from `hooks/hooks.json` through `${CLAUDE_PLUGIN_ROOT}/native/bin/oathbound-hook`, which ADR-0009 deliberately keeps unchanged. PATH exposure adds a second resolution path and a name-collision surface with no current consumer. Revisit if a user-facing CLI is introduced.
- **`dependencies` rejected.** The package is meant to be self-contained and independent of consumer projects (`AGENTS.md`). A plugin dependency would couple installation to another plugin's availability and version.

### Consequences

- **Good:** Users can change audit location and guard strictness without editing files or setting shell variables.
- **Good:** Hosts below the version floor are rejected explicitly.
- **Bad:** Each adopted field raises the minimum Claude Code version, excluding older hosts from the Claude package - _mitigation:_ set `engines` to the exact required floor and note it in `CHANGELOG.md`.
- **Bad:** The audit default moves when `CLAUDE_PLUGIN_DATA` is set, so existing trails split across two directories - _mitigation:_ keep `AGENT_AUDIT_DIR` precedence; document the old path; no automatic migration.
- **Bad:** `agy` and `codex` packages have no equivalent fields, so configuration surfaces diverge between harnesses - _mitigation:_ keep the environment-variable path as the shared contract (see ADR-0012).
- **Neutral:** `tools/build-plugin.cjs` and its tests must emit and validate the new manifest fields; the version bump follows `tools/bump-version.cjs`.

### Confirmation

- A build test asserts that the generated Claude manifest contains the adopted fields and that `VERSION` and the three manifests still match.
- A native hook test asserts that with no `userConfig` values and no `CLAUDE_PLUGIN_DATA`, the audit directory resolution is unchanged, and that `AGENT_AUDIT_DIR` wins when set.
- `claude plugin validate <dir>` passes on the built package.
- Before acceptance, the unverified version numbers and field names are checked against the vendor documentation.

## Pros and Cons of the Options

### Adopt selected fields (chosen)

- **Good:** closes the configuration and state gaps with the smallest surface.
- **Bad:** raises the host version floor and diverges from `agy` and `codex`.

### Do nothing

- **Good:** no compatibility change.
- **Bad:** configuration stays undiscoverable and state stays in a shared home directory.

### Adopt everything including `bin/` and `dependencies`

- **Good:** feature parity with the manifest.
- **Bad:** adds resolution paths and coupling with no present consumer.

## Pending Decisions

- [DECISION PENDING] Exact `userConfig` keys, defaults and whether the strictness option may weaken the destructive guard.
- [DECISION PENDING] Whether per-role model and effort in `userConfig` may override the routing rules of ADR-0007 and `docs/adaptive-model-routing.md`.
- [DECISION PENDING] Whether `${CLAUDE_PLUGIN_DATA}` becomes the audit default or only an option.
- [DECISION PENDING] The `engines` floor, after the vendor documentation is checked.

## References

- [ADR-0004: Native Rust hooks for the hot path](0004-hooks-nativos.md)
- [ADR-0007: Route subagent models by task complexity](0007-route-subagent-models-by-task-complexity.md)
- [ADR-0009: Per-platform packaging of the native hook binary](0009-per-platform-native-hook-packaging.md)
- [ADR-0012: Share common rules across separate CLI configurations](0012-share-cross-cli-rules.md)
- [Claude Code plugins documentation](https://code.claude.com/docs/en/plugins) (not fetched during drafting; unverified)
