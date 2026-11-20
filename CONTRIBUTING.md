# Contributing

Thank you for your interest in contributing to **Oathbound**! This document covers the collaboration process, architectural guidelines and repository quality standards.

## Design Principles

1. **Consumer independence**: the repository contains no absolute paths, hosts, secrets or rules specific to consumer projects.
2. **Zero external (`npm`) dependencies**: tools and modules use only native Node.js 24+ features, without third-party packages.
3. **Deep modules**: small, well-documented interfaces with JSDoc.

## Required Validation

```bash
# Run the unit test suite with coverage
node --test --experimental-test-coverage test/*.test.ts test/*/*.test.js

# Audit documentation integrity (links and anchors)
node tools/audit-docs.ts

# Audit files staged in the Git index
node tools/audit-docs.ts --staged
```

All validation must pass without errors (`0 violations`).

## Commit Convention

We use **Conventional Commits** (e.g. `feat(hooks): add guardrail`):
- `feat`: new functionality for agents or governance scripts
- `fix`: correction of unexpected behavior
- `refactor`: internal refactoring without behavior changes
- `docs`: documentation-only changes
- `test`: new or updated tests
- `chore`: general repository maintenance

## License

Licensed under the [MIT](LICENSE) license.
