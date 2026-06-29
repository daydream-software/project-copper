// The pure, deterministic simulation. `step(world, input, dt) -> world` is the only
// place game logic lives: it never touches the DOM and uses the seeded PRNG
// (rng.ts) for all randomness, so a run is reproducible and directly unit-testable.

import { makeRng, random, range, type Rng } from './rng'
import { makeShape, overlap, wrap, type Vec2 } from './geometry'
import { DEFAULT_CONFIG, type Config } from './config'
import type { Asteroid, Bullet, FieldMode, Input, Ship, World } from './entities'

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
const MOTE_MAX_SPEED = 720 // clamp so the field can't fling motes off to infinity (high enough for a charged fling)

// --- Polarity field (the core verb): pull motes in / push them away ---
/** Reach of the ship's field, px. Exported so the view can draw the ring. */
export const FIELD_RANGE = 260
const FIELD_STRENGTH = 1100 // px/s^2 at the centre, falling linearly to 0 at the edge
const VORTEX_RADIUS = FIELD_RANGE * 0.5 // motes settle onto this orbit shell in vortex mode
const VORTEX_SWIRL_MIN = 170 // tangential orbit speed at zero charge, px/s
const VORTEX_SWIRL_MAX = 640 // tangential orbit speed at full charge, px/s — the wound-up fling speed
const VORTEX_SPRING = 3.5 // pull toward the shell radius, 1/s
const VORTEX_RESPONSE = 6 // how fast a mote's velocity tracks the vortex target, 1/s
const CHARGE_TIME = 1.4 // seconds of held vortex to reach full charge

// --- Gather pulse (replaces a continuous attract): a discrete inward impulse ---
/** Reach of a gather pulse, px. Exported so the view can size the ripple. */
export const PULSE_RANGE = 300
const PULSE_STRENGTH = 380 // inward velocity kick at the centre, px/s (linear falloff to 0 at the edge)
const MOTE_CHARGE_TIME = 2.5 // seconds a mote stays "charged" after the field touches it
const MAX_MOTES = 80 // safety cap so a chain reaction can't explode the field unboundedly

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
    charge: 0,
  }
}

function spawnChild(rng: Rng, parent: Asteroid, childCharge: number): Asteroid {
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
    field: 'off',
    charge: 0,
    pulseT: 99,
  }
  const asteroids = [...Array(TARGET_ASTEROIDS).keys()].map(() =>
    spawnAsteroid(rng, width, height, ASTEROID_BASE_RADIUS, ship.pos),
  )
  return { width, height, ship, bullets: [], asteroids, rngState: rng.s, t: 0 }
}

// Turn, thrust, drag, clamp, then move (wrapping). Decrements the fire cooldown but
// does not arm it — firing (which creates a bullet) is the caller's job.
function stepShip(ship: Ship, input: Input, width: number, height: number, dt: number, config: Config): Ship {
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
  // Charge builds while the vortex is held, and resets the moment it's released —
  // releasing/scattering then flings the motes at whatever orbit speed was wound up.
  const field = fieldMode(input, config)
  const charge = field === 'vortex' ? Math.min(1, ship.charge + dt / CHARGE_TIME) : 0
  return {
    pos: { x: wrap(ship.pos.x + vx * dt, width), y: wrap(ship.pos.y + vy * dt, height) },
    vel: { x: vx, y: vy },
    angle,
    fireCooldown: Math.max(0, ship.fireCooldown - dt),
    thrusting: input.thrust,
    field,
    charge,
    pulseT: input.pulse ? 0 : ship.pulseT + dt,
  }
}

// Which continuous field is active this step, gated by the sandbox config. Both held =
// vortex; continuous-attract (if gather is set to it); scatter alone = repel; else off.
// (When gather is `pulse`, gather is a discrete impulse handled outside this function.)
function fieldMode(input: Input, config: Config): FieldMode {
  if (input.attract && input.repel && config.vortex) return 'vortex'
  if (input.attract && config.gather === 'attract') return 'attract'
  if (input.repel && config.scatter) return 'repel'
  return 'off'
}

// A gather pulse: a one-shot inward velocity kick (linear falloff over PULSE_RANGE)
// on every mote in reach. Replaces the old continuous attract — a sharp tug, not a hold.
function pulseKick(a: Asteroid, shipPos: Vec2): Asteroid {
  const dx = shipPos.x - a.pos.x
  const dy = shipPos.y - a.pos.y
  const dist = Math.hypot(dx, dy)
  if (dist === 0 || dist >= PULSE_RANGE) return a
  const kick = PULSE_STRENGTH * (1 - dist / PULSE_RANGE)
  return { ...a, charge: MOTE_CHARGE_TIME, vel: { x: a.vel.x + (dx / dist) * kick, y: a.vel.y + (dy / dist) * kick } }
}

// Vortex steers a mote's velocity toward a rotating shell — a spring toward
// VORTEX_RADIUS plus a tangential orbit speed — so motes circle the ship and stay
// captured, instead of a constant tangential force spiralling them out of range.
// (ux, uy) points from the mote toward the ship; `swirl` is the (charge-scaled)
// tangential orbit speed.
function vortexVel(ux: number, uy: number, dist: number, swirl: number, vx: number, vy: number, dt: number): Vec2 {
  const radialOut = VORTEX_SPRING * (VORTEX_RADIUS - dist) // +outward inside the shell, -inward outside
  const targetX = -ux * radialOut + -uy * swirl // outward (-ux,-uy) + tangent (-uy, ux)
  const targetY = -uy * radialOut + ux * swirl
  const k = Math.min(1, VORTEX_RESPONSE * dt)
  return { x: vx + (targetX - vx) * k, y: vy + (targetY - vy) * k }
}

// Drift a mote, apply the ship's polarity field, clamp its speed, then move + spin
// it (wrapping).
function stepMote(a: Asteroid, ship: Ship, width: number, height: number, dt: number): Asteroid {
  let vx = a.vel.x
  let vy = a.vel.y
  let touched = false
  if (ship.field !== 'off') {
    const dx = ship.pos.x - a.pos.x
    const dy = ship.pos.y - a.pos.y
    const dist = Math.hypot(dx, dy)
    if (dist > 0 && dist < FIELD_RANGE) {
      touched = true
      const ux = dx / dist
      const uy = dy / dist
      if (ship.field === 'vortex') {
        const swirl = VORTEX_SWIRL_MIN + (VORTEX_SWIRL_MAX - VORTEX_SWIRL_MIN) * ship.charge
        const v = vortexVel(ux, uy, dist, swirl, vx, vy, dt)
        vx = v.x
        vy = v.y
      } else {
        // 'attract' = radial inward (ux,uy point at the ship); 'repel' = outward.
        const mag = FIELD_STRENGTH * (1 - dist / FIELD_RANGE) * dt * (ship.field === 'attract' ? 1 : -1)
        vx += ux * mag
        vy += uy * mag
      }
    }
  }
  const speed = Math.hypot(vx, vy)
  if (speed > MOTE_MAX_SPEED) {
    vx = (vx / speed) * MOTE_MAX_SPEED
    vy = (vy / speed) * MOTE_MAX_SPEED
  }
  return {
    ...a,
    vel: { x: vx, y: vy },
    pos: { x: wrap(a.pos.x + vx * dt, width), y: wrap(a.pos.y + vy * dt, height) },
    angle: a.angle + a.spin * dt,
    // The field touching a mote (re)charges it; otherwise the charge ebbs away.
    charge: touched ? MOTE_CHARGE_TIME : Math.max(0, a.charge - dt),
  }
}

// A charged mote splits an uncharged one it overlaps (reusing the bullet-hit split),
// and discharges itself in the process. Charged↔charged and uncharged↔uncharged do
// nothing. Returns the indices to split and the chargers to discharge.
function findMoteSplits(motes: Asteroid[]): { split: Set<number>, discharge: Set<number> } {
  const split = new Set<number>()
  const discharge = new Set<number>()
  for (const [i, mi] of motes.entries()) {
    if (mi.charge <= 0) continue
    for (const [j, mj] of motes.entries()) {
      if (i === j) continue
      if (mj.charge > 0) continue
      if (!overlap(mi.pos, mi.radius, mj.pos, mj.radius)) continue
      split.add(j)
      discharge.add(i)
    }
  }
  return { split, discharge }
}

function resolveMoteCollisions(rng: Rng, motes: Asteroid[], config: Config): Asteroid[] {
  if (motes.length >= MAX_MOTES) return motes // safety valve: stop splitting (chain guard)
  const { split, discharge } = findMoteSplits(motes)
  const childCharge = config.chainReaction ? MOTE_CHARGE_TIME : 0 // fragments born charged → cascade
  const out: Asteroid[] = []
  for (const [idx, m] of motes.entries()) {
    if (split.has(idx)) {
      if (m.radius > ASTEROID_MIN_RADIUS) out.push(spawnChild(rng, m, childCharge), spawnChild(rng, m, childCharge))
      // else: destroyed at min size (same as a bullet hit)
    } else {
      // piercing: a charger keeps its charge instead of discharging.
      const keep = !discharge.has(idx) || config.piercing
      out.push(keep ? m : { ...m, charge: 0 })
    }
  }
  return out
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
      if (a.radius > ASTEROID_MIN_RADIUS) spawned.push(spawnChild(rng, a, 0), spawnChild(rng, a, 0))
      break
    }
  }
  return {
    bullets: bullets.filter((_, bi) => !usedBullet.has(bi)),
    asteroids: [...spawned, ...asteroids.filter((_, ai) => !hitAsteroid.has(ai))],
  }
}

/** Advance the world one fixed timestep. Pure: returns a new world. `config` selects
 * sandbox behaviour; it defaults to the shipped behaviour so existing callers are
 * unaffected. */
export function step(world: World, input: Input, dt: number, config: Config = DEFAULT_CONFIG): World {
  const rng = makeRng(world.rngState)
  const ship = stepShip(world.ship, input, world.width, world.height, dt, config)

  // Advance bullets, then fire (arming the cooldown) if the gun is enabled and triggered.
  const flying = advanceBullets(world.bullets, world.width, world.height, dt)
  const firing = config.gun && input.fire && ship.fireCooldown <= 0
  const bullets = firing ? [...flying, makeBullet(ship, world.width, world.height)] : flying
  const armed: Ship = firing ? { ...ship, fireCooldown: FIRE_COOLDOWN } : ship

  // A gather pulse yanks motes inward first (a one-shot velocity kick), then the
  // continuous field + drift + spin + wrap, then charged↔uncharged mote splits, and
  // finally any bullet hits.
  const kicked = input.pulse ? world.asteroids.map((a) => pulseKick(a, ship.pos)) : world.asteroids
  const moved: Asteroid[] = kicked.map((a) => stepMote(a, ship, world.width, world.height, dt))
  const reacted = config.chargedSplit ? resolveMoteCollisions(rng, moved, config) : moved
  const hit = resolveCollisions(rng, bullets, reacted)

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
