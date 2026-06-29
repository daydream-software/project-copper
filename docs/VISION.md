# Vision — what this is

> **A tiny polarity sandbox. You're a charged point drifting in a wrapping field of
> motes — you don't shoot, you bend the field: gather them in, scatter them out, or
> hold both to spin them into a vortex. Purely geometric, simple to grasp — a sandbox
> that grows over time.**

## North star

Project Copper is deliberately **the simplest of our game attempts**. Where the
others grew elaborate systems, this one stays direct: one screen, a handful of
shapes, a verb you understand instantly. We are **not** carrying over the
"programmable brain / automation you watch" ADN of the others.

The aesthetic and the inertial drift rhyme with **Nova Drift** — and that's the
long-term aspiration, but **not a clone**. Nova Drift's real depth is its **modular
build-craft** (mods that synergise), and crucially that depth costs **no assets** —
a mod is behaviour + stats + a little geometry. That's the direction Copper grows
toward: a clean, asset-free core that a build layer can stack onto. The *verb*,
though, is ours — **polarity**, not guns.

## Pillars

1. **Purely geometric.** Every visible thing is a stroked vector path drawn in code —
   ship, motes, field rings, tethers. **No image, audio or font assets** to make,
   manage, or break. (Audio may arrive much later as its own slice; not a pillar.)
2. **Simple to grasp, simple to grow.** The verb is "bend the field." New mechanics
   stack onto a clean core; nothing in the foundation needs to be undone to add them.
3. **Pure, deterministic, seedable.** The whole simulation is `step(world, input,
   dt) -> world`, all randomness from a seeded PRNG. An arena is a seed — share it,
   replay it, unit-test it.
4. **A sandbox first.** No score, no lives, no game-over yet. The field keeps itself
   populated so there's always something to push around. It becomes a "game" only
   when we decide to make it one (a later slice).
5. **Static & tiny.** Ships on GitHub Pages, no server, no runtime dependencies.

## The verb: polarity

You are a charged point. You drift (thrust + rotate + a little drag) through a
wrapping arena of **motes** (the drifting polygons), and you bend the field around you:

- **Gather pulse** (tap space) — a one-shot impulse that yanks nearby motes inward;
  tap to herd them in (a sharp tug, not a continuous hold).
- **Scatter** (hold shift) — a continuous radial push, motes away.
- **Vortex** (hold space + shift) — motes orbit you on a shell, and the longer you hold
  the more the orbit **winds up** (a charge gauge fills, the ring thickens). **Release
  or scatter to fling** the wound-up motes outward. So the verbs chain into a
  polarity-native throw — **gather → charge → fling** — no bullets.

The view reads at a glance: a pulse ripple that collapses inward, a reach ring for the
held field (dashed = scatter, dotted = vortex, thickening with charge), a charge gauge
around the ship, and faint tethers to what's in range.

**Charged motes & splitting.** Any field interaction (pulse, scatter, vortex) leaves a
mote **charged** for a few seconds — it glows brighter and thicker. A charged mote
**splits** an uncharged one it touches into two smaller fragments (down to a minimum,
where it's destroyed), discharging itself in the process. So the throw has teeth: fling
your charged motes into the fresh field and they shatter it. (This is the old
bullet-hit split, now driven by polarity instead of bullets — the dormant gun isn't
needed.) It closes the loop: **gather → charge → fling → shatter.**

> The earlier slices' **bullet/split** mechanic is **dormant** — the code is intact,
> just unbound. Nova Drift keeps shooting *alongside* its physics, so we may bring it
> back later as a second verb; for now polarity is the focus.

## Where it can go

The growth path leans into the Nova-Drift-flavoured depth, asset-free:

- **Field / charge mods** — reach, strength, faster wind-up, a charge that overflows
  into a burst, alternating polarity, motes that chain or bind… a build tree of field
  behaviours.
- **Make it a game** — ship × mote collision, lives, score, runs (roguelite shape).
- **Juice & variety** — line-debris, mote types, hazards, waves, palette themes.
- **Audio** — much later, via the workspace `suno-songs/` folder.
