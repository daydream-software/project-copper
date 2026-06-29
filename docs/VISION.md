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
wrapping arena of **motes** (the drifting polygons). Your one tool is a **field** with
three modes, on a linear falloff over its reach:

- **Gather** (attract, hold space) — pull motes inward.
- **Scatter** (repel, hold shift) — push them outward.
- **Vortex** (hold both) — a tangential swirl with a gentle inward bias: motes orbit
  you instead of the two radial forces simply cancelling.

The view reads at a glance: a reach ring (solid = gather, dashed = scatter, dotted =
vortex) and faint tethers to whatever's in range.

> The earlier slices' **bullet/split** mechanic is **dormant** — the code is intact,
> just unbound. Nova Drift keeps shooting *alongside* its physics, so we may bring it
> back later as a second verb; for now polarity is the focus.

## Where it can go

The growth path leans into the Nova-Drift-flavoured depth, asset-free:

- **Field / charge mods** — reach, strength, alternating polarity, motes that chain or
  bind, a vortex that flings on release… a build tree of field behaviours.
- **Make it a game** — ship × mote collision, lives, score, runs (roguelite shape).
- **Juice & variety** — line-debris, mote types, hazards, waves, palette themes.
- **Audio** — much later, via the workspace `suno-songs/` folder.
