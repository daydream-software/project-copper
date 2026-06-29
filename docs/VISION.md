# Vision — what this is

> **A tiny vector arena. Fly a triangle ship through a wrapping field of drifting
> polygons and shoot them apart. Purely geometric, simple to grasp — a sandbox that
> grows over time.**

## North star

Project Copper is deliberately **the simplest of our game attempts**. Where the
others grew elaborate systems (the latest, project-black, is a "program-your-party"
roguelite with its own little language), this one is the opposite: **one screen, a
handful of shapes, rules you understand at a glance.** We are **not** carrying over
the "programmable brain / automation you watch" ADN of the others. This is a direct,
hands-on toy.

## Pillars

1. **Purely geometric.** Every visible thing is a stroked vector path drawn in code —
   the ship, the bullets, the asteroids. **No image, audio or font assets** to make,
   manage, or break. (Audio may arrive much later as its own slice; not a pillar.)
2. **Simple to grasp, simple to grow.** The first cut is a few hundred lines you can
   hold in your head. New mechanics **stack** onto a clean core; nothing in the
   foundation needs to be undone to add them.
3. **Pure, deterministic, seedable.** The whole simulation is `step(world, input,
   dt) -> world`, with all randomness from a seeded PRNG. An arena is a seed — share
   it, replay it, unit-test it.
4. **A sandbox first.** No score, no lives, no game-over in the first cut. The field
   keeps itself populated so there's always something to fly through and shoot. It
   becomes a "game" only when we decide to make it one (a later slice).
5. **Static & tiny.** Ships on GitHub Pages, no server, no runtime dependencies.

## The shape of it

- **Ship** — a triangle. Thrust along its nose, rotate, drift with a little drag.
- **Arena** — the screen wraps at every edge (a torus); nothing leaves.
- **Asteroids** — convex-ish polygons that drift and spin. Shoot one and it **splits**
  into two smaller ones, down to a minimum size where it's destroyed.
- **Bullets** — points fired from the nose, short-lived, that pop asteroids.

That's the whole toy. Everything else is roadmap.

## Where it can go

The core is genre-neutral enough to grow in many directions — see
[ROADMAP.md](ROADMAP.md). Likely next steps: live-tunable sandbox knobs, then
(optionally) making it a game with collisions, lives and score; later, line-debris
particles, enemy shapes, weapon variants, waves, palette themes, juice, and — much
later — audio.
