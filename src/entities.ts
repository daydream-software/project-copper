// Plain data shapes for the world. No methods, no DOM — just the state the pure
// sim reads and writes, and the pure view draws.

import type { Vec2 } from './geometry'

export interface Ship {
  pos: Vec2
  vel: Vec2
  /** Radians. 0 = pointing up (-y). */
  angle: number
  /** Seconds until the next shot is allowed. */
  fireCooldown: number
  /** Whether thrust is held this step (drives the flame in the view). */
  thrusting: boolean
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
