# Contributing to FlyLab

Thanks for helping build an open flight simulator! This project is **spec-driven**
— a little process up front keeps the physics trustworthy and the codebase clean.

## Ground rules (from the [Constitution](./.specify/memory/constitution.md))
- **Accuracy:** no physics model lands without a validation test.
- **Determinism:** no `Math.random()` in `src/core` — use the seeded RNG.
- **Headless core:** `src/core` must not import React, Three.js, or UI code.
- **SI units** internally; convert only at UI boundaries.
- **Quaternions** for attitude internally; Euler for display only.

## Workflow
1. **Find or open an issue.** Describe the problem/feature and the user value.
2. **For non-trivial work, write the spec first.** Copy the templates in
   `.specify/templates/` into `specs/NNN-your-feature/` and fill `spec.md`, then
   `plan.md`, then `tasks.md`. Open these for review before large code changes.
3. **Branch:** `feat/...`, `fix/...`, `docs/...` off `main`.
4. **Implement** following your `tasks.md`. Keep PRs focused.
5. **Test:** `npm test` must pass. Add tests for new logic; add a *validation*
   test for new physics. `npm run lint` and typecheck must be clean.
6. **Open a PR** referencing the issue and spec. Fill in the PR template.

## Local setup
```bash
npm install
npm run dev      # app
npm test         # watch tests
npm run test:run # one-shot (CI mode)
npm run lint
```

## Commit style
Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.

## Code review
At least one maintainer approval. CI (lint, typecheck, tests) must be green.

## Reporting bugs
Open an issue with repro steps. For physics bugs, include the **seed + config**
(or an exported run record) so we can reproduce exactly — that's why determinism
matters.

## License
By contributing you agree your contributions are licensed under Apache-2.0.
