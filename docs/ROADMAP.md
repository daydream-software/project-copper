# Roadmap

> The **what & why** lives in [VISION.md](VISION.md). This file is the **build
> order** — tiny verified slices, riskiest unknown first, each proven by running the
> app (not by green tests alone).

## Done

### Slices 0–4 — the vector-arena core (now the substrate)

- **0 · Skeleton.** Canvas, fixed-timestep loop, pure sim/view split, seeded PRNG,
  one passing test, gh-pages deploy stub. (`loop.ts`, `rng.ts`, `geometry.ts`,
  `entities.ts`, `main.ts`)
- **1 · Ship.** Thrust + rotate + drag + screen-wrap. (`sim.ts`, `input.ts`,
  `render.ts`)
- **2 · Firing.** Bullets from the nose, ttl, wrap, cooldown. **Now dormant** (code
  intact, no key bound) after the polarity pivot.
- **3 · Motes.** Seeded convex polygons drift + spin + wrap (vertices from `rng`).
- **4 · Collision + split.** Bullet × mote → split into two, or destroy at min size;
  field tops itself up. (Dormant with firing.)

### Slice P — the polarity pivot (the game's verb)

You're a charged point; you **bend the field** instead of shooting. Three modes with
linear falloff: **gather** (attract), **scatter** (repel), **vortex** (both held —
motes orbit a shell). The vortex **charges** the longer it's held (orbit winds up,
gauge fills); **release or scatter flings** the wound-up motes outward — a
polarity-native **gather → charge → fling** throw, no bullets. View: reach ring
(solid / dashed / dotted, thickening with charge), a charge gauge, and tethers.
(`sim.ts` `stepMote` / `fieldMode` / `vortexVel`, `render.ts` `drawField`, `input.ts`.)

## Next — the open ladder (not built yet)

5. **Sandbox knobs.** Live-tune field range / strength / vortex bias / mote count /
   seed. The payoff of "it's a sandbox." *Riskiest part: a clean knobs→constants
   wiring that doesn't pollute the pure sim.*
6. **Field / charge mods (the Nova-Drift-flavoured depth).** A first modular upgrade —
   e.g. extra reach, a vortex that flings motes on release, motes that bind into
   chains. Asset-free: behaviour + stats + geometry.
7. **Make it a game (optional).** Ship × mote collision, lives, score, runs.
8. **Juice & variety.** Line-debris, mote types, hazards, waves, palette themes; maybe
   revive the dormant **shot** as a second verb (Nova Drift keeps both).
9. **Audio (much later).** Via the workspace `suno-songs/` folder.

## Method

Tiny verified slices. Keep `sim.ts` pure and deterministic; keep `render.ts` a pure
view; route all randomness through the seeded `rng.ts`. English codebase.
Conventional Commits. Prove each slice in a browser.
