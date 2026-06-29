// Plain data shapes for the world. No methods, no DOM — just the state the pure
// sim reads and writes, and the pure view draws.

import type { Vec2 } from './geometry'

/**
 * The polarity field's mode this step:
 * - `attract` (gather, radial in) · `repel` (scatter, radial out)
 * - `vortex` (both held: tangential swirl + a gentle inward bias — motes orbit)
 * - `off`
 */
export type FieldMode = 'attract' | 'off' | 'repel' | 'vortex'

export interface Ship {
  pos: Vec2
  vel: Vec2
  /** Radians. 0 = pointing up (-y). */
  angle: number
  /** Seconds until the next shot is allowed (firing is dormant for now). */
  fireCooldown: number
  /** Whether thrust is held this step (drives the flame in the view). */
  thrusting: boolean
  /** Polarity field this step (drives both the sim force and the view). */
  field: FieldMode
}

export interface Bullet {
  pos: Vec2
  vel: Vec2
  /** Seconds of life remaining; the bullet is culled at <= 0. */
  ttl: number
}

export interface Asteroid {
  pos: Vec2
  vel: Vec2
  radius: number
  /** Current rotation, radians. */
  angle: number
  /** Angular velocity, radians/second. */
  spin: number
  /** Unit vertices (scaled by radius when drawn). */
  shape: Vec2[]
}

/** The per-step intent collected from the keyboard. */
export interface Input {
  thrust: boolean
  turnLeft: boolean
  turnRight: boolean
  /** Pull nearby motes toward the ship. */
  attract: boolean
  /** Push nearby motes away from the ship. */
  repel: boolean
  /** Dormant for now (no key bound): the bullet/split mechanic from slices 2–4. */
  fire: boolean
}

export interface World {
  width: number
  height: number
  ship: Ship
  bullets: Bullet[]
  asteroids: Asteroid[]
  /** Serialisable PRNG cursor (see rng.ts) — makes the field reproducible. */
  rngState: number
  /** Elapsed sim time, seconds. */
  t: number
}
