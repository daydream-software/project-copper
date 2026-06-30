// Static pillar obstacles: seeded placement, and the bounce a moving circle takes off
// them. Split out of sim.ts (which sits at the max-lines ceiling); pure and deterministic
// like the rest of the simulation — randomness only through the seeded rng.

import { random, type Rng } from './rng'
import { deflect, outlineRadius, type Vec2 } from './geometry'
import type { Pillar } from './entities'

const PILLAR_SHIP_CLEAR = 30 // extra gap so a pillar never spawns on the centred ship, px
const PILLAR_GAP = 24 // desired gap between two pillars' surfaces, px (best-effort)
const PILLAR_TRIES = 24 // placement attempts before accepting a tight spot

// Place `count` static pillars in the inscribed disc (edges-agnostic, so it holds whether
// the arena is the rectangle or the circle — a live toggle, not a generation knob). Each
// sits at a seeded angle and an annulus radius clearing the ship (at the centre, radius
// `shipRadius`) and all four walls; `margin` (a full mote diameter, 2× the max radius)
// leaves room for a mote to rest on a rim pillar's far side without being pinned against
// the wall. Inter-pillar spacing is best-effort, retried up to PILLAR_TRIES.
export function spawnPillars(rng: Rng, width: number, height: number, count: number, size: number, margin: number, shipRadius: number): Pillar[] {
  const ringMin = shipRadius + size + PILLAR_SHIP_CLEAR
  const ringMax = Math.max(ringMin, Math.min(width, height) / 2 - size - margin)
  const pillars: Pillar[] = []
  for (let i = 0; i < count; i += 1) {
    for (let t = 0; t < PILLAR_TRIES; t += 1) {
      const a = random(rng) * Math.PI * 2
      const rad = ringMin + random(rng) * (ringMax - ringMin)
      const pos = { x: width / 2 + Math.cos(a) * rad, y: height / 2 + Math.sin(a) * rad }
      const clear = pillars.every((p) => Math.hypot(p.pos.x - pos.x, p.pos.y - pos.y) > size + p.radius + PILLAR_GAP)
      if (clear || t === PILLAR_TRIES - 1) { pillars.push({ pos, radius: size }); break }
    }
  }
  return pillars
}

// Bounce a moving body off every pillar in turn (pillars don't overlap, so folding the
// deflections sequentially resolves cleanly). The body's reach toward each pillar follows
// its `shape` outline (interpolated, like mote↔mote contact); a circle body passes an empty
// shape, for which outlineRadius falls back to `radius` (the ship does this).
export function bouncePillars(x: number, y: number, vx: number, vy: number, radius: number, shape: Vec2[], angle: number, pillars: Pillar[]): { x: number, y: number, vx: number, vy: number } {
  return pillars.reduce((s, p) => {
    const r = outlineRadius(shape, radius, angle, p.pos.x - s.x, p.pos.y - s.y) // reach toward the pillar
    return deflect(s.x, s.y, s.vx, s.vy, r, p.pos.x, p.pos.y, p.radius)
  }, { x, y, vx, vy })
}
