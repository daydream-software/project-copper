# Contributing

## Commit messages — Conventional Commits

Every commit follows [Conventional Commits](https://www.conventionalcommits.org/):

```
type(optional scope): subject
```

| Type | Meaning |
|---|---|
| `feat` | a new capability |
| `fix` | a bug fix |
| `perf` | a performance improvement |
| `refactor` | code change, no behaviour change |
| `docs` | documentation only |
| `test` | tests only |
| `build` | build system / dependencies |
| `ci` | CI configuration |
| `chore` | maintenance, version bumps |
| `style` | formatting only |

- **Breaking change:** add `!` after the type (`feat!:`) or a `BREAKING CHANGE:`
  footer.
- **Subject:** imperative mood, lower-case, no trailing period.

Examples:

```
feat(ship): add thrust, rotation and screen-wrap
fix(sim): cull bullets exactly at ttl <= 0
refactor(sim): extract safe-spawn helper
```

## Code

- **English** in every artifact: code, comments, UI strings, docs, commits.
- Keep game logic in `src/sim.ts` **pure and deterministic**; the renderer
  (`src/render.ts`) is a **pure view**. Use the seeded PRNG (`src/rng.ts`) for any
  randomness so arenas stay reproducible and the sim stays testable.
- `npm run build` must pass: `tsc` typecheck + `eslint .` + Vite build.
- Prove a change by **running the app**, not by green tests alone.
