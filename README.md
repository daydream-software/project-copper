# Project Copper

A tiny **vector arena**: fly a triangle ship through a wrapping field of drifting
polygons and shoot them — each hit **splits** an asteroid into smaller ones.
Everything is **stroked vector geometry drawn in code**: no images, no audio, no
fonts. It starts as a sandbox toy and grows from there.

> Pillars: **purely geometric** (no assets) · **simple to grasp, simple to grow** ·
> a pure, deterministic, seedable simulation · static & tiny (ships on GitHub Pages).

## Stack

TypeScript · Vite · Canvas 2D · Vitest. **No runtime dependencies.**

## Develop

```bash
npm install
npm run dev      # dev server — open http://127.0.0.1.nip.io:5173
npm test         # Vitest — unit tests on the pure simulation
npm run lint     # ESLint (eslint-config-love)
npm run build    # typecheck (tsc) + lint + production build into dist/
npm run preview  # serve the production build locally
```

Controls: **↑ / W** thrust · **← → / A D** turn · **space** fire. Add `?seed=<n>` to
the URL for a specific arena.

## How it works

A **pure, deterministic** simulation — `step(world, input, dt)` in
[`src/sim.ts`](src/sim.ts), using the seeded PRNG in [`src/rng.ts`](src/rng.ts) — is
decoupled from a **pure view** ([`src/render.ts`](src/render.ts)) that strokes the
world onto a canvas. A [fixed-timestep loop](src/loop.ts) drives the sim so
behaviour is frame-rate independent, which keeps the simulation testable and a given
seed reproducible. See [docs/VISION.md](docs/VISION.md) and
[docs/ROADMAP.md](docs/ROADMAP.md).

## Deploy

The build uses a relative `base` so it works on GitHub Pages from any repo path.
Once pushed to GitHub with Pages enabled, `.github/workflows/deploy.yml` publishes
`dist/` to the `gh-pages` branch automatically.

---

**Conventions:** commits follow [Conventional Commits](CONTRIBUTING.md). The
codebase, docs and commits are written in **English**. (Day-to-day development
conversation may happen in another language.)
