// Pure geometry helpers shared by the sim and the view. No DOM, no game state.

import { random, type Rng } from './rng'

export interface Vec2 {
  x: number
  y: number
}

/** Wrap a coordinate into [0, size) — the toroidal arena edges. */
export function wrap(value: number, size: number): number {
  return ((value % size) + size) % size
}

/** Do two circles overlap? (squared-distance test, no sqrt.) */
export function overlap(a: Vec2, ar: number, b: Vec2, br: number): boolean {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const r = ar + br
  return dx * dx + dy * dy < r * r
}

/**
 * A convex-ish blob of `points` unit vertices (magnitude ~0.7–1.0), evenly spaced
 * around the circle with a seeded radial jitter. The renderer scales these by the
 * asteroid's radius, so one shape works at any size (and across a split).
 */
export function makeShape(rng: Rng, points: number): Vec2[] {
  return [...Array(points).keys()].map((i) => {
    const a = (i / points) * Math.PI * 2
    const m = 0.7 + random(rng) * 0.3
    return { x: Math.cos(a) * m, y: Math.sin(a) * m }
  })
}
