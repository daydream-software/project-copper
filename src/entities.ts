// Plain data shapes for the world. No methods, no DOM — just the state the pure
// sim reads and writes, and the pure view draws.

import type { Vec2 } from './geometry'

/**
 * The polarity field's continuous mode this step:
 * - `repel` (scatter, radial out) · `vortex` (both held: motes orbit a shell) · `off`
 * - `attract` (radial in) — only when the sandbox sets gather to continuous-attract;
 *   the default gather is a discrete `pulse` (see Input), not a field mode.
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
  /** Vortex charge in [0, 1]: builds while vortex is held, spins motes up faster;
   * resets when released. Releasing/scattering then flings them at the built speed. */
  charge: number
  /** Seconds since the last gather pulse fired (drives the expanding ripple in the
   * view); large when no recent pulse. 0 exactly on the step a pulse fires. */
  pulseT: number
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
  /** Seconds of charge remaining: a mote is "charged" after the field touches it,
   * and a charged mote splits an uncharged one on contact. Decays to 0. */
  charge: number
  /** Intrinsic polarity (-1 or +1), assigned at spawn. Only used by the bipolar mode
   * (opposite poles attract, like poles repel). Optional → defaults to +1. */
  polarity?: number
}

/** A static obstacle: a solid disc that motes and the ship bounce off. Placed once in
 * createWorld (seeded), never moves — so it carries no velocity. */
export interface Pillar {
  pos: Vec2
  radius: number
}

/** The per-step intent collected from the keyboard. */
export interface Input {
  thrust: boolean
  turnLeft: boolean
  turnRight: boolean
  /** Whether the gather key is held — only meaningful with `repel` (together = vortex). */
  attract: boolean
  /** Push nearby motes away from the ship. */
  repel: boolean
  /** A one-shot gather pulse this step: an impulse that yanks nearby motes inward. */
  pulse: boolean
  /** Dormant for now (no key bound): the bullet/split mechanic from slices 2–4. */
  fire: boolean
}

export interface World {
  width: number
  height: number
  ship: Ship
  bullets: Bullet[]
  asteroids: Asteroid[]
  /** Static obstacles (a sandbox knob; empty when pillarCount is 0). */
  pillars: Pillar[]
  /** Serialisable PRNG cursor (see rng.ts) — makes the field reproducible. */
  rngState: number
  /** Elapsed sim time, seconds. */
  t: number
}
