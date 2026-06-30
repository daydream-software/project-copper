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

export type EdgeMode = 'bounce' | 'circle' | 'kill' | 'wrap'

// Resolve one axis against a rectangular border. wrap folds around; bounce reflects;
// kill flags the entity dead when it crosses out. (circle is handled in bound().)
function edgeAxis(p: number, v: number, size: number, mode: EdgeMode): { p: number, v: number, dead: boolean } {
  if (mode === 'kill') return { p, v, dead: p < 0 || p > size }
  if (mode === 'bounce') {
    if (p < 0) return { p: -p, v: -v, dead: false }
    if (p > size) return { p: 2 * size - p, v: -v, dead: false }
    return { p, v, dead: false }
  }
  return { p: wrap(p, size), v, dead: false } // wrap
}

/**
 * Resolve an entity (radius `r`) against the arena bounds. For `circle`, reflect off a
 * centred circle; otherwise resolve each axis against the rectangle (wrap / bounce /
 * kill). Returns the new position + velocity and whether it died (kill only).
 */
export function bound(x: number, y: number, vx: number, vy: number, r: number, width: number, height: number, mode: EdgeMode): { x: number, y: number, vx: number, vy: number, dead: boolean } {
  if (mode === 'circle') {
    const cx = width / 2
    const cy = height / 2
    const radius = Math.min(width, height) / 2 - r
    const dx = x - cx
    const dy = y - cy
    const d = Math.hypot(dx, dy)
    if (d <= radius || d <= 0) return { x, y, vx, vy, dead: false }
    const nx = dx / d
    const ny = dy / d
    const vn = vx * nx + vy * ny
    return { x: cx + nx * radius, y: cy + ny * radius, vx: vx - 2 * vn * nx, vy: vy - 2 * vn * ny, dead: false }
  }
  const ex = edgeAxis(x, vx, width, mode)
  const ey = edgeAxis(y, vy, height, mode)
  return { x: ex.p, y: ey.p, vx: ex.v, vy: ey.v, dead: ex.dead || ey.dead }
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
