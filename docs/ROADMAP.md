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

### Slice M2 — mode pack: juice (done)

Visual sandbox toggles, view/main side: **palette** (copper / mono / neon — `render.ts`
PALETTES), **trails** (off / dust / full — particles that are **dropped when they die**
over a fully-cleared canvas, so the background never leaks: dust = sparse grain dots
(`TrailDot`), full = faded snapshots of each entity's **actual outline** (`Ghost`); state
in `main.ts`, drawn via `render.ts`), **screen-shake** on shatters (`main.ts` jitters the
canvas element). The
audio-on-refresh gap is closed too: a music track the browser restores now starts on the
first user gesture (`onFirstGesture` re-applies the panel), so the panel matches what
plays.

### Slice M3 — mode pack: physics (done)

**Mote collisions** (motes bounce off each other — billiards; elastic, mass ∝ radius²,
`resolveMoteBounce`) and a **flow field** (a static swirl that pushes motes like
currents, in `stepMote`). Plus a **trail-motes** option: trails can apply to the ship
only, or ship + motes (nested under Trails, disabled when trails are off). `step()`'s
post-movement passes were factored into `reactMotes` to keep it flat.

### Slice M4 — mode pack: arena (done)

The arena `edges` mode grew from wrap/bounce to four: **kill** (motes die at the edge;
the ship clamps — no game-over) and **circle** (a centred circular arena everything
bounces off). The per-axis `edge` helper became a unified `bound()` in `geometry.ts`
(rectangle axes or a circle reflection, returning a `dead` flag). The canvas is **square** (720×720) so a circle fills it; in circle mode the canvas is
**clipped to a circle** (`clip-path: circle(closest-side)`) and its rectangular border is
dropped, so the arena *is* the circle (corners show the page bg), not a circle floating in
a rectangle. Panel "Arena" radio: Wrap / Bounce / Kill / Circle.

### Slice M5 — mode pack: advanced charge (done)

The last charge pack — three toggles deepening the charged-mote interactions.
**Bipolar** gives every mote an intrinsic polarity (`polarity: ±1` on `Asteroid`,
seeded in `spawnAsteroid` / `spawnChild`); charged motes then attract opposite poles
and repel like ones (`applyBipolar`, force ∝ `1 - d/BIPOLAR_RANGE`), and the renderer
marks each charged mote with a **+** or **−** (`drawPolarityMark`). **Burst** turns
every shatter into a shockwave — bystanders within `BURST_RADIUS` get an outward kick
(`burstPush`, fed shatter centres collected in `resolveMoteCollisions`). **Stasis**
freezes charged motes in place (`stepMote` zeroes velocity while `charge > 0`) — a
charged mote becomes a fixed anchor. Each has a discriminating test (opposite poles
attract / like repel, a bystander is shoved on shatter, a charged mote holds still).

### Slice K — mote field knobs (done)

The first numeric knobs (sliders, not toggles): a **Motes** panel group tunes the field
itself — **Count** (1–24), **Size** (base radius 20–80) and **Drift** (0–160 px/s) — backed
by `moteCount` / `moteSize` / `moteDrift` in `Config` (defaulting to the shipped 6 / 48 / 60,
so `createWorld` / `step` are unchanged for existing callers and tests). `createWorld` and
the field-refill in `step` read them; because radius/drift are spawn *params* (not RNG
draws), tuning a knob and **regenerating on the same seed** resizes/multiplies the motes
*in place* rather than reshuffling the arena. `main.ts` rebuilds the world (same
`currentSeed`) only when a generation knob changes, and each slider shows a live `<output>`
readout. UI fixes alongside: the controls **hint moved to the bottom-right** (the tall
top-left panel was covering it) and the **panel now scrolls** (`max-height` + `overflow-y`)
so Reseed/SFX stay reachable as it grows.

### Slice L — field knobs (done)

The knobs reach the **core verb**: a **Field** panel group tunes the continuous field
(attract / scatter / vortex) — **Range**, **Strength**, **Charge** (vortex wind-up) and
**Swirl** (the full-charge fling speed) — backed by `fieldRange` / `fieldStrength` /
`chargeTime` / `vortexSwirl` in `Config` (defaulting to the shipped 260 / 1100 / 1.4 / 640).
These are **live** knobs, not generation knobs: the loop reads `config` each frame, so they
take effect immediately and stay **out of `genChanged`** (no rebuild). The view reads
`config.fieldRange` for the tethers + reach ring; the old `FIELD_RANGE` export and the
`FIELD_STRENGTH` / `VORTEX_RADIUS` / `VORTEX_SWIRL_MAX` / `CHARGE_TIME` constants are gone
(the vortex shell radius derives from `config.fieldRange * 0.5`). Each knob has a
discriminating test.

### Slice O — arena pillars (done)

A **Pillars** group (Count 0–6, default 0 = off; Size) places static disc obstacles the
motes **and the ship** bounce off. New `Pillar` entity on `World`; a geometry `deflect()`
pushes a moving circle out of a solid disc and reflects only the inward normal component
(the inverse of the circle arena, which *contains*). `stepMote` / `stepShip` fold `deflect`
over `world.pillars` after the arena `bound`; pillars carry through `step` unchanged.
Placement is **edges-agnostic polar** — each pillar sits in an annulus of the inscribed
disc clearing the centred ship and all four walls (margin = one mote radius) — so it stays
valid when the arena toggles **live** to circle (edges isn't a generation knob) and never
pins a mote against the rim. Count/Size are generation knobs (in `genChanged`); pillars
draw from the rng *after* the asteroids and only when present, so an existing seed's field
is unchanged with pillars off. Tests: spawn count/size, ship-clearance + arena-containment,
mote bounce, ship bounce.

### Slice J — debris on shatter (done)

A **Debris** toggle (view-only, default off like the other juice toggles) flings short
bright line **shards** from every mote shatter. The sim now surfaces shatter centres on
`World.shatters` (the same centres `burst` already collects in `resolveMoteCollisions`),
instead of the renderer guessing from the count-grew heuristic. `main.ts` spawns shards
**per fixed step** from `world.shatters` (not in the render callback), so a shatter in a
caught-up sub-step is never overwritten before it's drawn; `render.ts` ages + draws them
(a view-only `Shard`; main carries px/frame velocity on a local superset).

## Next — the open ladder (more mode packs)

- **More field knobs** — pulse range / strength, conduction & burst radii, mote restitution.
- **Arena extra** — pillar variety (polarity-charged pillars, moving/rotating obstacles).
- **Pack: ship & juice** — ship × **mote** collision (bounce, no game-over), dash, magnetic
  hull. (Ship × pillar bounce and shatter debris already landed in Slices O / J.)
- **Refactor watch** — `sim.ts` is at the `max-lines` ceiling (450); before the next sim
  feature, lift shared constants (e.g. `SHIP_RADIUS`) into a small module and split out the
  pillar code, so growth stops fighting the linter.

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
