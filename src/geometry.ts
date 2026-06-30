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

/**
 * Bounce a moving circle (radius `r` at `x,y` with velocity `vx,vy`) off a SOLID disc
 * obstacle (centre `cx,cy`, radius `obstacleR`) — the inverse of the `circle` arena,
 * which contains. If they overlap, push the circle out to the contact surface and
 * reflect only the inward normal component (so a circle already moving away keeps its
 * speed — no energy is added). A perfect bounce, like the rectangle/circle edges.
 */
export function deflect(x: number, y: number, vx: number, vy: number, r: number, cx: number, cy: number, obstacleR: number): { x: number, y: number, vx: number, vy: number } {
  const minD = obstacleR + r
  const dx = x - cx
  const dy = y - cy
  const d = Math.hypot(dx, dy)
  if (d >= minD || d <= 0) return { x, y, vx, vy } // clear (or dead-centre: leave it for next frame)
  const nx = dx / d
  const ny = dy / d
  const vn = vx * nx + vy * ny // <0 when moving toward the obstacle
  return {
    x: cx + nx * minD, // pushed out to the surface
    y: cy + ny * minD,
    vx: vn < 0 ? vx - 2 * vn * nx : vx, // reflect only the inward component
    vy: vn < 0 ? vy - 2 * vn * ny : vy,
  }
}

/**
 * The positions to draw an entity at for a seamless toroidal (wrap) arena: always its own
 * spot, plus a copy shifted by ±width / ±height (and the corner) whenever its bounding
 * circle (radius `r`) crosses an edge — so a shape straddling the seam shows on *both*
 * sides instead of teleporting when its centre folds over. Returns 1, 2 or 4 positions.
 */
export function wrapImages(x: number, y: number, r: number, width: number, height: number): Vec2[] {
  const xs = [x]
  if (x - r < 0) xs.push(x + width)
  if (x + r > width) xs.push(x - width)
  const ys = [y]
  if (y - r < 0) ys.push(y + height)
  if (y + r > height) ys.push(y - height)
  const out: Vec2[] = []
  for (const px of xs) {
    for (const py of ys) out.push({ x: px, y: py })
  }
  return out
}

/** Do two circles overlap? (squared-distance test, no sqrt.) */
export function overlap(a: Vec2, ar: number, b: Vec2, br: number): boolean {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const r = ar + br
  return dx * dx + dy * dy < r * r
}

/**
 * Shortest signed delta from `from` to `to` on an axis of length `size` — the
 * minimum-image convention of a wrapped (toroidal) arena, so two bodies near opposite
 * edges read as neighbours across the seam, not a whole arena apart. Plain difference when
 * not wrapping. Valid while interaction ranges stay under size/2 (true for every range here).
 */
export function axisDelta(from: number, to: number, size: number, wrap: boolean): number {
  const d = to - from
  return wrap ? d - size * Math.round(d / size) : d
}

/** The oriented-outline subset of a mote that shape-aware contact needs. */
export interface Outline { pos: Vec2, radius: number, angle: number, shape: Vec2[] }

/**
 * How far a convex blob's outline reaches from its centre toward world direction (ux,uy).
 * The shape is unit vertices evenly spaced in local angle (see makeShape); rotate the
 * direction into the shape's frame and linearly interpolate the two straddling vertices'
 * magnitudes, then scale by `radius`. A shapeless mote (no vertices — the unit-test
 * stand-ins) falls back to its bounding `radius`. Interpolating vertex magnitudes (rather
 * than intersecting the exact edge) keeps it cheap; its chord-vs-arc error is a few percent,
 * well under the line-of-centres approximation the contact test already makes.
 */
export function outlineRadius(shape: Vec2[], radius: number, angle: number, ux: number, uy: number): number {
  const n = shape.length
  if (n === 0) return radius
  const tau = Math.PI * 2
  const phi = (((Math.atan2(uy, ux) - angle) % tau) + tau) % tau // direction in the shape's frame, [0, tau)
  const step = tau / n
  const k = Math.floor(phi / step)
  const frac = phi / step - k
  const mk = Math.hypot(shape[k].x, shape[k].y)
  const mk1 = Math.hypot(shape[(k + 1) % n].x, shape[(k + 1) % n].y)
  return (mk + (mk1 - mk) * frac) * radius
}

/**
 * Shape-aware contact: two oriented blobs touch when the gap between centres is less than
 * the sum of each outline's reach toward the other — so a hit follows the drawn polygon,
 * not its (larger) bounding circle. Coincident centres count as in contact.
 */
export function outlinesTouch(a: Outline, b: Outline, width: number, height: number, wrap: boolean): boolean {
  const dx = axisDelta(a.pos.x, b.pos.x, width, wrap)
  const dy = axisDelta(a.pos.y, b.pos.y, height, wrap)
  const d = Math.hypot(dx, dy)
  if (d <= 0) return true
  const ra = outlineRadius(a.shape, a.radius, a.angle, dx / d, dy / d)
  const rb = outlineRadius(b.shape, b.radius, b.angle, -dx / d, -dy / d)
  return d < ra + rb
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
