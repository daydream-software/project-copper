# Roadmap

> The **what & why** lives in [VISION.md](VISION.md). This file is the **build
> order** — tiny verified slices, riskiest unknown first, each proven by running the
> app (not by green tests alone).

## Done — the init (slices 0–4): a playable vector arena

- **0 · Skeleton.** Canvas, fixed-timestep loop, pure sim/view split, seeded PRNG,
  one passing test, gh-pages deploy stub. (`loop.ts`, `rng.ts`, `geometry.ts`,
  `entities.ts`, `main.ts`)
- **1 · Ship.** Thrust + rotate + drag + screen-wrap. (`sim.ts`, `input.ts`,
  `render.ts`)
- **2 · Firing.** Bullets from the nose, ship-relative velocity, ttl, wrap, cooldown.
- **3 · Asteroids.** Seeded convex polygons drift + spin + wrap (vertices from `rng`,
  no assets).
- **4 · Collision + split.** Bullet × asteroid → splits into two smaller children, or
  is destroyed at minimum radius; the field tops itself back up.

## Next — the open ladder (not built yet)

5. **Sandbox knobs.** A tiny on-screen panel to live-tune thrust / drag / drift /
   spawn-count / seed. The payoff of "it's a sandbox": play with the rules in real
   time. *Riskiest part: a clean knobs→constants wiring that doesn't pollute the
   pure sim.*
6. **Make it a game (optional).** Ship × asteroid collision, then lives, score and a
   game-over/restart. Flip from "toy" to "game" deliberately.
7. **Juice & variety.** Line-debris particles on a split, thrust trail, a brief
   screen-shake; then enemy shapes, weapon variants, waves.
8. **Themes.** Alternate geometric palettes (still copper by default).
9. **Audio (much later).** Synth or short loops via the workspace `suno-songs/`
   folder. The first sound is a slice of its own.

## Method

Tiny verified slices. Keep `sim.ts` pure and deterministic; keep `render.ts` a pure
view; route all randomness through the seeded `rng.ts`. English codebase.
Conventional Commits. Prove each slice in a browser.
