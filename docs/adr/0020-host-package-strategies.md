---
status: Accepted
date: 2026-11-25
decision-makers: [Raphael Vieira]
---

# 0020 - Use host-specific strategies to build plugin packages

## Context and Problem Statement

`buildPlugin(runner, destination)` validates the destination, resolves Claude's native binary, provides file helpers, and writes three host-specific package layouts. Codex takes an early branch, while Claude Code and Antigravity share part of the write sequence. Maintainers adding a host-specific artifact must trace the shared flow and the relevant branches to find the correct place to write it.

This is an architectural decision, not a local refactor, because the builder is a shared build contract. The build CLI, global upgrade (`tools/upgrade-global.ts`), the install tests (`test/install.test.ts`), `tools/smoke-oathkeeper.cjs`, and the CI and release workflows all consume it, and its structure sets the pattern for adding future hosts.

## Decision Drivers

- Make a host-specific package change local to that host's writer and package tests.
- Keep version, manifest (`loadManifest`), and skill selection (`copySkillsForRunner`) single implementations. They are single today, and the change must not split them per host. The remaining duplication is the repeated `JSON.parse(readFileSync(...))` of the marketplace files and the `codex/statusline.cjs` copy written to two places.
- Preserve generated artifacts and the builder's CLI and module contracts, including failure behavior.
- Keep the design small enough to follow in one file and use the existing Node APIs.

## Considered Options

| Option | Benefit | Cost |
| --- | --- | --- |
| Keep the inline branches | No transition effort. The full flow is visible in one function. | Host layout changes still require tracing shared and host-specific branches. |
| Extract one writer per host and dispatch to it | Isolates each layout. Each writer shows the full host layout, and the builder keeps sequencing and shared rules. | Adds one level of dispatch. Claude's preflight and writer selection happen at different points of the shared flow, so the builder must coordinate both. |
| Describe packages through a declarative file map | Plain copies become easy to scan and compare. | Native binary preflight, executable permissions, skill selection, and generated manifests need special operations. |

A `switch` and a function map are two spellings of the second option, so they are not listed separately.

## Decision Outcome

We will extract one writer per host in `tools/build-plugin.cjs` and select it through a fixed lookup that pairs each host's writer with its optional preflight. The builder then runs the same sequence for all three hosts: validate the runner and destination, run the preflight, create the destination exclusively, call the writer, and return the absolute path. This keeps Claude's native input requirement next to its layout and keeps the shared version, manifest, and skill rules in one place.

Invariants:

- The lookup is own-key only (`Object.hasOwn` or a `Map`). Prototype keys such as `constructor` are rejected with the existing usage error, and only `claude`, `agy`, and `codex` are accepted.
- Only Claude defines a preflight, because only Claude needs an input that can be missing. The preflight runs before the destination is created, and its result is passed to the writer, so a missing binary leaves no output.
- The Codex footer stays as `codex/statusline.cjs`, copied to both `plugins/oathbound/` and `setup/`. Both copies are kept.
- Existing CommonJS exports stay available: `buildPlugin`, `findNativeHookBinary`, `copySkillsForRunner`, and `RUNNER_EXCLUSIVE_SKILL_DIRS`.

### Consequences

- **Good:** Adding a Codex setup file changes the Codex writer and its package test. A manifest versioning change stays in the shared helper.
- **Bad:** The lookup adds a call boundary, and writes can still fail partway through a build, as they do today. _Mitigation:_ keep the interface small and preserve the existing sequencing and failure behavior, including partial output on a failed write.
- **Neutral:** The CLI and module contracts, the generated artifacts, and the failure behavior stay unchanged. The pattern applies to package generation only. Host installation, hook execution, and release orchestration keep their existing entry points.

### Confirmation

Characterization tests must land before the extraction and remain as the ongoing guard for every later host change. Before the extraction, `test/build-plugin.test.cjs` had no test for:

- an unsupported runner (such as `constructor`) through `buildPlugin`, expecting the usage error;
- the preflight running before the destination is created, with a missing binary and both a new and an existing destination;
- the `0o755` mode of the packaged binary (POSIX only).

The existing `test/upgrade-global.test.ts` test stubs `buildPlugin`, so the global upgrade path also needs a smoke check against the real builder.

The test named "names the packaged native binary from the source binary extension, not the host" already covers the packaged filename and stays in place.

As a one-time migration check, compare relative paths and file contents of all three packages before and after the extraction, using the same inputs.

The next host-only packaging change should fit in one writer and its package assertions. If it does not, review this decision.

## References

- [Package builder](../../tools/build-plugin.cjs)
- [Package tests](../../test/build-plugin.test.cjs)
- [Global upgrade](../../tools/upgrade-global.ts)
- [ADR-0009 — Per-platform native hook packaging](0009-per-platform-native-hook-packaging.md)
