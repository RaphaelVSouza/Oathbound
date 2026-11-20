# Oathbound Instructions

- Keep this repository independent of consumer project rules, hosts, paths, and secrets.
- Put shared workflows in skills, agents, and hooks; configure exceptions in the installing project's `AGENTS.md`.
- When writing ADRs for this repository, use the [ADR template](docs/adr/adr-template.md) and consult relevant sections of the [ADR guide](docs/adr/como-escrever-adr.md).
- When working in this repository, use only global skills and subagents to carry out tasks. Repository skills and agents are under development and may be inspected, edited, and validated; execute them only when the user explicitly requests testing them.
- When changing behavior, update `VERSION`, `CHANGELOG.md`, and the corresponding reference in the same delivery.
- Do not automatically overwrite existing installations. Preserve local changes and present the upgrade diff.
- Describe only validations actually performed.
- To audit links and documents in this package, consult `tools/README.md` and the configuration in `tools/audit-docs.config.js`.
- On Windows, use native RTK commands: `rtk read <file>` for full reads and `rtk rg -n -C 5 <pattern> <file>` for excerpts. Do not pass PowerShell cmdlets to `rtk`.
