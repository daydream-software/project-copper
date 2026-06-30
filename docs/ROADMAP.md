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

You're a charged point; you **bend the field** instead of shooting. **Gather** is a
discrete **pulse** (tap — a one-shot inward impulse); **scatter** (repel) and **vortex**
(both held) are continuous. The vortex **charges** the longer it's held (orbit winds up,
gauge fills); **release or scatter flings** the wound-up motes outward — a
polarity-native **gather → charge → fling** throw, no bullets. View: pulse ripple,
reach ring (dashed / dotted, thickening with charge), a charge gauge, and tethers.
(`sim.ts` `pulseKick` / `stepMote` / `fieldMode` / `vortexVel`, `render.ts` `drawField`
/ `drawPulse`, `input.ts` edge-triggered `consumePulse`.)

**Charged motes (the split is back).** Any field interaction charges a mote for a few
seconds (it glows); a **charged mote splits an uncharged one on contact** into two
fragments (reusing the bullet-hit split + `spawnChild`), discharging itself. Closes the
loop **gather → charge → fling → shatter**. (`sim.ts` `findMoteSplits` /
`resolveMoteCollisions`; mote `charge` in `entities.ts`; brighter render in `drawAsteroids`.)

### Slice S — the sandbox options panel (done)

A floating panel (`index.html` / `style.css`, wired in `main.ts`) toggles mechanics
live via a `Config` (`config.ts`) passed to `step(world, input, dt, config)` —
`DEFAULT_CONFIG` is the shipped behaviour so the default arg keeps existing callers
unchanged. Toggles: gather **pulse vs continuous attract**, **edges** (wrap vs bounce —
`geometry.ts` `edge()`), **scatter**, **vortex**, the **gun** (press F — the dormant
bullets, re-enabled), **charged-mote split** (a charged hit shatters both motes), and —
nested under it with a dependency line, disabled when it's off — **piercing** (the
charger survives & plows through) and **chain reaction** (fragments born charged,
bounded by `MAX_MOTES`); plus **reseed**. The on-screen hint tracks the config. Charge
duration scales with mote radius (`chargeTimeFor`). Every toggle has a discriminating
unit test.

### Slice M1 — mode pack: charge & physics (done)

Four sandbox toggles: **conduction** (charged motes energize uncharged ones within
`CONDUCTION_RANGE` — a proximity pass, `applyConduction`, that runs *alongside* split,
not instead of it; charged motes glow), **charged repel** (charged motes push each other
apart; `applyChargedRepel`), **gravity well** (motes pulled to the arena centre) and
**friction** (mote drag) — both in `stepMote` (field force extracted to `fieldForce`).
Each has a discriminating test.

## Next — the open ladder (more mode packs)

- **Pack: more charge** — bipolar +/- charge, overcharge→burst, stasis.
- **Pack: physics** — mote↔mote elastic collisions, flow field.
- **Pack: arena** — circular arena, obstacles/walls, kill-edges.
- **Pack: ship & juice** — ship collision (bounce, no game-over), dash, magnetic hull,
  trails, debris on shatter, screen-shake, palette themes.

### Older notes

5. **Numeric knobs.** Sliders for field range / strength / vortex bias / charge time /
   mote count, on top of the toggle panel.
6. **Field / charge mods (the Nova-Drift-flavoured depth).** A first modular upgrade —
   e.g. extra reach, a vortex that flings motes on release, motes that bind into
   chains. Asset-free: behaviour + stats + geometry.
7. **Make it a game (optional).** Ship × mote collision, lives, score, runs.
8. **Juice & variety.** Line-debris, mote types, hazards, waves, palette themes; maybe
   revive the dormant **shot** as a second verb (Nova Drift keeps both).
### Slice A — audio (done)

Two looping music tracks (`src/audio/between-runs.ogg`, `autorun.mp3` — from
`suno-songs/`) and synthesized WebAudio SFX (`src/audio.ts` — pulse + shatter, no sound
files), behind a **Music** radio (Off / Between Runs / Autorun) and an **SFX** toggle in
the panel. `main.ts` resumes audio on the first gesture and drives SFX from observed
world changes (pulse via `pulseT`, shatter heuristically via mote-count growth).

## Method

Tiny verified slices. Keep `sim.ts` pure and deterministic; keep `render.ts` a pure
view; route all randomness through the seeded `rng.ts`. English codebase.
Conventional Commits. Prove each slice in a browser.
