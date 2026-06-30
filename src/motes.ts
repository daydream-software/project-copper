// Mote (asteroid) spawning and charge timing — the leaf helpers the simulation builds its
// field from. Split out of sim.ts (the file sits at the max-lines ceiling); pure and seeded
// like the rest of the sim, importing only the rng and geometry, never sim itself.

import { random, range, type Rng } from './rng'
import { makeShape, wrap, type Vec2 } from './geometry'
import type { Asteroid } from './entities'

const ASTEROID_BASE_RADIUS = 48
const ASTEROID_DRIFT = 60 // max px/s
const ASTEROID_MAX_SPIN = 0.8 // max rad/s
const ASTEROID_POINTS_MIN = 8
const ASTEROID_POINTS_MAX = 12
const SAFE_SPAWN_DIST = 140 // keep fresh asteroids off the ship
const MOTE_CHARGE_TIME = 2.5 // charge seconds at the base radius — scaled by size below
export const CHILD_SCALE = 0.58 // child radius = parent radius * this

// Charge lasts longer on bigger motes (proportional to radius): a base-size mote holds
// MOTE_CHARGE_TIME, a small fragment proportionally less.
export function chargeTimeFor(radius: number): number {
  return MOTE_CHARGE_TIME * (radius / ASTEROID_BASE_RADIUS)
}

function driftVel(rng: Rng, maxSpeed: number): Vec2 {
  const a = random(rng) * Math.PI * 2
  const s = random(rng) * maxSpeed
  return { x: Math.cos(a) * s, y: Math.sin(a) * s }
}

// A random arena position, pushed out to a safe ring if it landed on the ship.
function safePos(rng: Rng, width: number, height: number, avoid: Vec2): Vec2 {
  const raw: Vec2 = { x: random(rng) * width, y: random(rng) * height }
  const dx = raw.x - avoid.x
  const dy = raw.y - avoid.y
  const d = Math.hypot(dx, dy)
  if (d >= SAFE_SPAWN_DIST) return raw
  const a = d === 0 ? random(rng) * Math.PI * 2 : Math.atan2(dy, dx)
  return {
    x: wrap(avoid.x + Math.cos(a) * SAFE_SPAWN_DIST, width),
    y: wrap(avoid.y + Math.sin(a) * SAFE_SPAWN_DIST, height),
  }
}

export function spawnAsteroid(rng: Rng, width: number, height: number, radius: number, drift: number, avoid: Vec2): Asteroid {
  return {
    pos: safePos(rng, width, height, avoid),
    vel: driftVel(rng, drift),
    radius,
    angle: random(rng) * Math.PI * 2,
    spin: (random(rng) * 2 - 1) * ASTEROID_MAX_SPIN,
    shape: makeShape(rng, range(rng, ASTEROID_POINTS_MIN, ASTEROID_POINTS_MAX)),
    charge: 0,
    polarity: random(rng) < 0.5 ? -1 : 1,
  }
}

export function spawnChild(rng: Rng, parent: Asteroid, childCharge: number): Asteroid {
  const a = random(rng) * Math.PI * 2
  const kick = ASTEROID_DRIFT * 0.8
  return {
    pos: { x: parent.pos.x, y: parent.pos.y },
    vel: { x: parent.vel.x + Math.cos(a) * kick, y: parent.vel.y + Math.sin(a) * kick },
    radius: parent.radius * CHILD_SCALE,
    angle: random(rng) * Math.PI * 2,
    spin: (random(rng) * 2 - 1) * ASTEROID_MAX_SPIN,
    shape: makeShape(rng, range(rng, ASTEROID_POINTS_MIN, ASTEROID_POINTS_MAX)),
    charge: childCharge,
    polarity: random(rng) < 0.5 ? -1 : 1,
  }
}
