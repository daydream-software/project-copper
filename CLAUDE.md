# CLAUDE.md

Guidance for working in this repo. Keep it short — details live in `docs/`.

## What this is

**Project Copper** — a tiny **polarity sandbox**: you're a charged point drifting in a
wrapping field of motes. No shooting — you **gather** (a one-shot **pulse**, tap space),
**scatter** (repel, hold shift), or hold **space + shift** for a **vortex** that winds up
a **charge** and **flings** the motes on release. **Purely
geometric** visuals: everything is stroked vector paths drawn in code — **no image/font
assets**. Starts as a **sandbox toy**, grows toward a Nova-Drift-flavoured, asset-free
build-craft depth. The bullet/split mechanic from the earlier slices is **dormant**
(code intact in `sim.ts`, just no key bound). Deliberately simpler than our other game
attempts; we are **not** carrying over their "programmable brain" ADN. See
`docs/VISION.md` (north star) and `docs/ROADMAP.md` (build order).

## Stack & commands

TypeScript · Vite · Canvas 2D · Vitest. **No runtime dependencies.**

- `npm run dev` — dev server; open **http://127.0.0.1.nip.io:5173** (the workspace's
  `*.nip.io` dev-host convention)
- `npm test` — Vitest (unit tests on the pure simulation)
- `npm run lint` — ESLint (`eslint-config-love`)
- `npm run build` — `tsc` typecheck + `eslint .` + production build into `dist/`
- `npm run preview` — serve the production build

## Conventions (non-negotiable)

- **English** in every project artifact: code, comments, UI strings, docs, commits.
  (Conversation may be in French; the repo is English.)
- **Conventional Commits** — `type(scope): subject`, imperative lower-case. See
  `CONTRIBUTING.md`.
- **GitHub Pages:** keep `base: './'` in `vite.config.ts` so asset paths stay
  relative; `deploy.yml` builds and pushes `dist/` to the `gh-pages` branch (the org
  enforces SHA-pinned actions). Pushes to `main` auto-deploy.

## How we work

- Build in **tiny verified slices**; attack the riskiest unknown first.
- **Prove changes by running the app** (browser screenshot), not by green tests
  alone. Tests must fail when logic breaks — cover boundaries, and mutation-check
  (flip the logic, see red, restore).
- Keep the simulation in `src/sim.ts` as **pure, deterministic** functions; the
  renderer (`src/render.ts`) is a pure view. Use the **seeded** PRNG (`src/rng.ts`)
  for any randomness so an arena (a seed) is reproducible and the sim is testable.
- **Visuals are geometry, not assets.** Anything drawn is a vector path in code — if a
  slice seems to need an image, reach for geometry first. **Audio is the exception:**
  two looping music tracks live in `src/audio/` (from the workspace `suno-songs/`) and
  SFX are **synthesized** in `src/audio.ts` (no sound files); all behind a panel toggle.
