// The pure, deterministic simulation. `step(world, input, dt) -> world` is the only
// place game logic lives: it never touches the DOM and uses the seeded PRNG
// (rng.ts) for all randomness, so a run is reproducible and directly unit-testable.

import { makeRng, random, range, type Rng } from './rng'
import { makeShape, overlap, wrap, type Vec2 } from './geometry'
import type { Asteroid, Bullet, Input, Ship, World } from './entities'

// --- Ship ---
const TURN_RATE = 3.2 // rad/s
const THRUST = 340 // px/s^2
const DRAG = 0.5 // fraction of velocity shed per second
const MAX_SPEED = 420 // px/s
const SHIP_RADIUS = 16 // px (also the nose offset for spawning bullets)

// --- Bullets ---
const BULLET_SPEED = 560 // px/s, added to the ship's velocity
const BULLET_TTL = 1 // s
const BULLET_RADIUS = 2 // px (collision point)
const FIRE_COOLDOWN = 0.16 // s between shots

// --- Asteroids ---
const ASTEROID_BASE_RADIUS = 48
const ASTEROID_MIN_RADIUS = 18 // below this a hit destroys instead of splitting
const ASTEROID_DRIFT = 60 // max px/s
const ASTEROID_MAX_SPIN = 0.8 // max rad/s
const ASTEROID_POINTS_MIN = 8
const ASTEROID_POINTS_MAX = 12
const CHILD_SCALE = 0.58 // child radius = parent radius * this
const TARGET_ASTEROIDS = 6 // field is topped up to this count
const SAFE_SPAWN_DIST = 140 // keep fresh asteroids off the ship

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

function spawnAsteroid(rng: Rng, width: number, height: number, radius: number, avoid: Vec2): Asteroid {
  return {
    pos: safePos(rng, width, height, avoid),
    vel: driftVel(rng, ASTEROID_DRIFT),
    radius,
    angle: random(rng) * Math.PI * 2,
    spin: (random(rng) * 2 - 1) * ASTEROID_MAX_SPIN,
    shape: makeShape(rng, range(rng, ASTEROID_POINTS_MIN, ASTEROID_POINTS_MAX)),
  }
}

function spawnChild(rng: Rng, parent: Asteroid): Asteroid {
  const a = random(rng) * Math.PI * 2
  const kick = ASTEROID_DRIFT * 0.8
  return {
    pos: { x: parent.pos.x, y: parent.pos.y },
    vel: { x: parent.vel.x + Math.cos(a) * kick, y: parent.vel.y + Math.sin(a) * kick },
    radius: parent.radius * CHILD_SCALE,
    angle: random(rng) * Math.PI * 2,
    spin: (random(rng) * 2 - 1) * ASTEROID_MAX_SPIN,
    shape: makeShape(rng, range(rng, ASTEROID_POINTS_MIN, ASTEROID_POINTS_MAX)),
  }
}

/** Build a fresh world: ship centred, a seeded asteroid field, no bullets. */
export function createWorld(seed: number, width: number, height: number): World {
  const rng = makeRng(seed)
  const ship: Ship = {
    pos: { x: width / 2, y: height / 2 },
    vel: { x: 0, y: 0 },
    angle: 0,
    fireCooldown: 0,
    thrusting: false,
  }
  const asteroids = [...Array(TARGET_ASTEROIDS).keys()].map(() =>
    spawnAsteroid(rng, width, height, ASTEROID_BASE_RADIUS, ship.pos),
  )
  return { width, height, ship, bullets: [], asteroids, rngState: rng.s, t: 0 }
}

// Turn, thrust, drag, clamp, then move (wrapping). Decrements the fire cooldown but
// does not arm it — firing (which creates a bullet) is the caller's job.
function stepShip(ship: Ship, input: Input, width: number, height: number, dt: number): Ship {
  const turn = (input.turnLeft ? -1 : 0) + (input.turnRight ? 1 : 0)
  const angle = ship.angle + turn * TURN_RATE * dt
  let vx = ship.vel.x
  let vy = ship.vel.y
  if (input.thrust) {
    vx += Math.sin(angle) * THRUST * dt
    vy += -Math.cos(angle) * THRUST * dt
  }
  const drag = Math.max(0, 1 - DRAG * dt)
  vx *= drag
  vy *= drag
  const speed = Math.hypot(vx, vy)
  if (speed > MAX_SPEED) {
    vx = (vx / speed) * MAX_SPEED
    vy = (vy / speed) * MAX_SPEED
  }
  return {
    pos: { x: wrap(ship.pos.x + vx * dt, width), y: wrap(ship.pos.y + vy * dt, height) },
    vel: { x: vx, y: vy },
    angle,
    fireCooldown: Math.max(0, ship.fireCooldown - dt),
    thrusting: input.thrust,
  }
}

// Advance existing bullets, age them, cull the expired.
function advanceBullets(bullets: Bullet[], width: number, height: number, dt: number): Bullet[] {
  const next: Bullet[] = []
  for (const b of bullets) {
    const ttl = b.ttl - dt
    if (ttl <= 0) continue
    next.push({
      pos: { x: wrap(b.pos.x + b.vel.x * dt, width), y: wrap(b.pos.y + b.vel.y * dt, height) },
      vel: b.vel,
      ttl,
    })
  }
  return next
}

// A bullet leaving the ship's nose, inheriting the ship's velocity.
function makeBullet(ship: Ship, width: number, height: number): Bullet {
  const nose = { sx: Math.sin(ship.angle), cy: -Math.cos(ship.angle) }
  return {
    pos: {
      x: wrap(ship.pos.x + nose.sx * SHIP_RADIUS, width),
      y: wrap(ship.pos.y + nose.cy * SHIP_RADIUS, height),
    },
    vel: { x: ship.vel.x + nose.sx * BULLET_SPEED, y: ship.vel.y + nose.cy * BULLET_SPEED },
    ttl: BULLET_TTL,
  }
}

interface Collision {
  bullets: Bullet[]
  asteroids: Asteroid[]
}

// Each bullet hits at most one asteroid; a hit splits it (or destroys it at min size).
function resolveCollisions(rng: Rng, bullets: Bullet[], asteroids: Asteroid[]): Collision {
  const usedBullet = new Set<number>()
  const hitAsteroid = new Set<number>()
  const spawned: Asteroid[] = []
  for (const [bi, b] of bullets.entries()) {
    for (const [ai, a] of asteroids.entries()) {
      if (hitAsteroid.has(ai)) continue
      if (!overlap(b.pos, BULLET_RADIUS, a.pos, a.radius)) continue
      usedBullet.add(bi)
      hitAsteroid.add(ai)
      if (a.radius > ASTEROID_MIN_RADIUS) spawned.push(spawnChild(rng, a), spawnChild(rng, a))
      break
    }
  }
  return {
    bullets: bullets.filter((_, bi) => !usedBullet.has(bi)),
    asteroids: [...spawned, ...asteroids.filter((_, ai) => !hitAsteroid.has(ai))],
  }
}

/** Advance the world one fixed timestep. Pure: returns a new world. */
export function step(world: World, input: Input, dt: number): World {
  const rng = makeRng(world.rngState)
  const ship = stepShip(world.ship, input, world.width, world.height, dt)

  // Advance bullets, then fire (arming the cooldown) if the trigger is held.
  const flying = advanceBullets(world.bullets, world.width, world.height, dt)
  const firing = input.fire && ship.fireCooldown <= 0
  const bullets = firing ? [...flying, makeBullet(ship, world.width, world.height)] : flying
  const armed: Ship = firing ? { ...ship, fireCooldown: FIRE_COOLDOWN } : ship

  // Drift + spin + wrap the asteroids, then resolve hits.
  const moved: Asteroid[] = world.asteroids.map((a) => ({
    ...a,
    pos: { x: wrap(a.pos.x + a.vel.x * dt, world.width), y: wrap(a.pos.y + a.vel.y * dt, world.height) },
    angle: a.angle + a.spin * dt,
  }))
  const hit = resolveCollisions(rng, bullets, moved)

  // Keep the field populated (no game-over yet: it's a sandbox).
  const deficit = Math.max(0, TARGET_ASTEROIDS - hit.asteroids.length)
  const refill = [...Array(deficit).keys()].map(() =>
    spawnAsteroid(rng, world.width, world.height, ASTEROID_BASE_RADIUS, armed.pos),
  )

  return {
    width: world.width,
    height: world.height,
    ship: armed,
    bullets: hit.bullets,
    asteroids: [...hit.asteroids, ...refill],
    rngState: rng.s,
    t: world.t + dt,
  }
}
