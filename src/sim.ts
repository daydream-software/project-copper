// The pure, deterministic simulation. `step(world, input, dt) -> world` is the only
// place game logic lives: it never touches the DOM and uses the seeded PRNG
// (rng.ts) for all randomness, so a run is reproducible and directly unit-testable.

import { makeRng, random, range, type Rng } from './rng'
import { bound, makeShape, overlap, wrap, type EdgeMode, type Vec2 } from './geometry'
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
const MOTE_CHARGE_TIME = 2.5 // charge seconds at the base radius — scaled by size below
const MAX_MOTES = 80 // safety cap so a chain reaction can't explode the field unboundedly
const WELL_K = 1.8 // gravity-well pull toward the arena centre, 1/s^2 (sandbox toggle)
const MOTE_DRAG = 0.5 // friction: fraction of mote velocity shed per second (sandbox toggle)
const CHARGED_REPEL_RANGE = 95 // reach of charged-mote mutual repulsion, px
const CHARGED_REPEL_STRENGTH = 700 // charged-mote mutual repulsion at the centre, px/s^2
const CONDUCTION_RANGE = 130 // a charged mote energizes uncharged motes within this, px
const BIPOLAR_RANGE = 110 // reach of bipolar +/- forces between charged motes, px
const BIPOLAR_STRENGTH = 700 // bipolar force at the centre, px/s^2
const BURST_RADIUS = 130 // a shatter shoves motes within this outward, px
const BURST_STRENGTH = 260 // burst outward velocity kick at the centre, px/s
const MOTE_RESTITUTION = 0.85 // bounciness of mote↔mote elastic collisions (sandbox toggle)
const FLOW_SCALE = 0.012 // flow-field spatial frequency, 1/px (sandbox toggle)
const FLOW_FORCE = 120 // flow-field push, px/s^2

// Charge lasts longer on bigger motes (proportional to radius): a base-size mote holds
// MOTE_CHARGE_TIME, a small fragment proportionally less.
function chargeTimeFor(radius: number): number {
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

function spawnAsteroid(rng: Rng, width: number, height: number, radius: number, drift: number, avoid: Vec2): Asteroid {
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
    polarity: random(rng) < 0.5 ? -1 : 1,
  }
}

/** Build a fresh world: ship centred, a seeded asteroid field, no bullets. The field's
 * count / size / drift come from the sandbox config (defaulting to the shipped values),
 * so the same seed regenerates the same arena with whatever knobs are set. */
export function createWorld(seed: number, width: number, height: number, config: Config = DEFAULT_CONFIG): World {
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
  const asteroids = [...Array(config.moteCount).keys()].map(() =>
    spawnAsteroid(rng, width, height, config.moteSize, config.moteDrift, ship.pos),
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
  // The ship never dies at the edge (no game-over) — kill behaves like bounce for it.
  const shipMode = config.edges === 'kill' ? 'bounce' : config.edges
  const b = bound(ship.pos.x + vx * dt, ship.pos.y + vy * dt, vx, vy, SHIP_RADIUS, width, height, shipMode)
  return {
    pos: { x: b.x, y: b.y },
    vel: { x: b.vx, y: b.vy },
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
  return { ...a, charge: chargeTimeFor(a.radius), vel: { x: a.vel.x + (dx / dist) * kick, y: a.vel.y + (dy / dist) * kick } }
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

// The polarity field's effect on a mote: the new velocity and whether the field
// touched it (which (re)charges it). Extracted to keep stepMote flat.
function fieldForce(ship: Ship, a: Asteroid, dt: number): { vx: number, vy: number, touched: boolean } {
  const vx = a.vel.x
  const vy = a.vel.y
  if (ship.field === 'off') return { vx, vy, touched: false }
  const dx = ship.pos.x - a.pos.x
  const dy = ship.pos.y - a.pos.y
  const dist = Math.hypot(dx, dy)
  if (dist <= 0 || dist >= FIELD_RANGE) return { vx, vy, touched: false }
  const ux = dx / dist
  const uy = dy / dist
  if (ship.field === 'vortex') {
    const swirl = VORTEX_SWIRL_MIN + (VORTEX_SWIRL_MAX - VORTEX_SWIRL_MIN) * ship.charge
    const v = vortexVel(ux, uy, dist, swirl, vx, vy, dt)
    return { vx: v.x, vy: v.y, touched: true }
  }
  // 'attract' = radial inward (ux,uy point at the ship); 'repel' = outward.
  const mag = FIELD_STRENGTH * (1 - dist / FIELD_RANGE) * dt * (ship.field === 'attract' ? 1 : -1)
  return { vx: vx + ux * mag, vy: vy + uy * mag, touched: true }
}

// Drift a mote: polarity field, then gravity well + friction (sandbox toggles), clamp,
// move + spin (wrapping or bouncing). The field touching it (re)charges it.
function stepMote(a: Asteroid, ship: Ship, width: number, height: number, dt: number, config: Config): Asteroid | null {
  const f = fieldForce(ship, a, dt)
  let { vx, vy } = f
  if (config.well) {
    vx += (width / 2 - a.pos.x) * WELL_K * dt
    vy += (height / 2 - a.pos.y) * WELL_K * dt
  }
  if (config.flow) {
    // A static swirl field: motes drift along it like currents.
    vx += Math.cos(a.pos.y * FLOW_SCALE) * FLOW_FORCE * dt
    vy += Math.sin(a.pos.x * FLOW_SCALE) * FLOW_FORCE * dt
  }
  if (config.friction) {
    const drag = Math.max(0, 1 - MOTE_DRAG * dt)
    vx *= drag
    vy *= drag
  }
  if (config.stasis && a.charge > 0) {
    vx = 0 // stasis: a charged mote is frozen in place
    vy = 0
  }
  const speed = Math.hypot(vx, vy)
  if (speed > MOTE_MAX_SPEED) {
    vx = (vx / speed) * MOTE_MAX_SPEED
    vy = (vy / speed) * MOTE_MAX_SPEED
  }
  const b = bound(a.pos.x + vx * dt, a.pos.y + vy * dt, vx, vy, a.radius, width, height, config.edges)
  if (b.dead) return null // killed at the edge (kill mode)
  return {
    ...a,
    vel: { x: b.vx, y: b.vy },
    pos: { x: b.x, y: b.y },
    angle: a.angle + a.spin * dt,
    charge: f.touched ? chargeTimeFor(a.radius) : Math.max(0, a.charge - dt),
  }
}

// Charged motes repel each other (sandbox toggle): each is nudged away from every other
// charged mote within range — applied to velocity (takes effect next step).
function applyChargedRepel(motes: Asteroid[], dt: number): Asteroid[] {
  return motes.map((m, i) => {
    if (m.charge <= 0) return m
    let vx = m.vel.x
    let vy = m.vel.y
    for (const [j, o] of motes.entries()) {
      if (i === j || o.charge <= 0) continue
      const dx = m.pos.x - o.pos.x
      const dy = m.pos.y - o.pos.y
      const d2 = dx * dx + dy * dy
      if (d2 <= 0 || d2 >= CHARGED_REPEL_RANGE * CHARGED_REPEL_RANGE) continue
      const d = Math.sqrt(d2)
      const push = CHARGED_REPEL_STRENGTH * (1 - d / CHARGED_REPEL_RANGE) * dt
      vx += (dx / d) * push
      vy += (dy / d) * push
    }
    return { ...m, vel: { x: vx, y: vy } }
  })
}

// Bipolar (sandbox toggle): charged motes interact by their intrinsic polarity — like
// poles repel, opposite poles attract — within BIPOLAR_RANGE.
function applyBipolar(motes: Asteroid[], dt: number): Asteroid[] {
  return motes.map((m, i) => {
    if (m.charge <= 0) return m
    const pm = m.polarity ?? 1
    let vx = m.vel.x
    let vy = m.vel.y
    for (const [j, o] of motes.entries()) {
      if (i === j || o.charge <= 0) continue
      const dx = m.pos.x - o.pos.x
      const dy = m.pos.y - o.pos.y
      const d2 = dx * dx + dy * dy
      if (d2 <= 0 || d2 >= BIPOLAR_RANGE * BIPOLAR_RANGE) continue
      const d = Math.sqrt(d2)
      const sign = pm === (o.polarity ?? 1) ? 1 : -1 // like → push apart, opposite → pull together
      const f = BIPOLAR_STRENGTH * (1 - d / BIPOLAR_RANGE) * dt * sign
      vx += (dx / d) * f
      vy += (dy / d) * f
    }
    return { ...m, vel: { x: vx, y: vy } }
  })
}

// Mote↔mote elastic collisions (sandbox toggle): motes bounce off each other (billiards)
// instead of passing through. Each overlapping pair is separated and exchanges momentum
// along the contact normal (mass ∝ radius²). O(n²) over the small field; works on local
// position/velocity arrays so it never mutates the input motes.
function resolveMoteBounce(motes: Asteroid[]): Asteroid[] {
  const px = motes.map((m) => m.pos.x)
  const py = motes.map((m) => m.pos.y)
  const vx = motes.map((m) => m.vel.x)
  const vy = motes.map((m) => m.vel.y)
  for (let i = 0; i < motes.length; i += 1) {
    for (let j = i + 1; j < motes.length; j += 1) {
      const dx = px[j] - px[i]
      const dy = py[j] - py[i]
      const rsum = motes[i].radius + motes[j].radius
      const d2 = dx * dx + dy * dy
      if (d2 <= 0 || d2 >= rsum * rsum) continue
      const d = Math.sqrt(d2)
      const nx = dx / d
      const ny = dy / d
      const ma = motes[i].radius * motes[i].radius
      const mb = motes[j].radius * motes[j].radius
      const mt = ma + mb
      const overlap = rsum - d
      px[i] -= nx * overlap * (mb / mt)
      py[i] -= ny * overlap * (mb / mt)
      px[j] += nx * overlap * (ma / mt)
      py[j] += ny * overlap * (ma / mt)
      const vn = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny
      if (vn > 0) continue
      const imp = (-(1 + MOTE_RESTITUTION) * vn) / (1 / ma + 1 / mb)
      vx[i] -= (imp / ma) * nx
      vy[i] -= (imp / ma) * ny
      vx[j] += (imp / mb) * nx
      vy[j] += (imp / mb) * ny
    }
  }
  return motes.map((m, i) => ({ ...m, pos: { x: px[i], y: py[i] }, vel: { x: vx[i], y: vy[i] } }))
}

// Conduction (sandbox toggle): an uncharged mote within CONDUCTION_RANGE of any charged
// mote becomes charged — current spreading through nearby conductors. Runs as its own
// pass, so it works alongside split (split shatters on contact; conduction lights up the
// surroundings). Charge still decays, so the glow follows wherever motes cluster.
function applyConduction(motes: Asteroid[]): Asteroid[] {
  return motes.map((m) => {
    if (m.charge > 0) return m
    for (const o of motes) {
      if (o.charge <= 0) continue
      const dx = m.pos.x - o.pos.x
      const dy = m.pos.y - o.pos.y
      if (dx * dx + dy * dy < CONDUCTION_RANGE * CONDUCTION_RANGE) return { ...m, charge: chargeTimeFor(m.radius) }
    }
    return m
  })
}

// A charged mote that overlaps an uncharged one triggers the bullet-style split.
// Charged↔charged and uncharged↔uncharged do nothing. Returns the uncharged motes hit
// (`targets`) and the charged motes that hit something (`chargers`).
function findMoteSplits(motes: Asteroid[]): { targets: Set<number>, chargers: Set<number> } {
  const targets = new Set<number>()
  const chargers = new Set<number>()
  for (const [i, mi] of motes.entries()) {
    if (mi.charge <= 0) continue
    for (const [j, mj] of motes.entries()) {
      if (i === j) continue
      if (mj.charge > 0) continue
      if (!overlap(mi.pos, mi.radius, mj.pos, mj.radius)) continue
      targets.add(j)
      chargers.add(i)
    }
  }
  return { targets, chargers }
}

// Burst: shove a mote outward from each shatter centre within BURST_RADIUS.
function burstPush(m: Asteroid, centers: Vec2[]): Asteroid {
  let vx = m.vel.x
  let vy = m.vel.y
  for (const c of centers) {
    const dx = m.pos.x - c.x
    const dy = m.pos.y - c.y
    const d2 = dx * dx + dy * dy
    if (d2 <= 0 || d2 >= BURST_RADIUS * BURST_RADIUS) continue
    const d = Math.sqrt(d2)
    const k = BURST_STRENGTH * (1 - d / BURST_RADIUS)
    vx += (dx / d) * k
    vy += (dy / d) * k
  }
  return { ...m, vel: { x: vx, y: vy } }
}

function resolveMoteCollisions(rng: Rng, motes: Asteroid[], config: Config): Asteroid[] {
  if (motes.length >= MAX_MOTES) return motes // safety valve: stop splitting (chain guard)
  const { targets, chargers } = findMoteSplits(motes)
  const out: Asteroid[] = []
  const bursts: Vec2[] = []
  for (const [idx, m] of motes.entries()) {
    // Both motes shatter on a charged hit — including the charger itself, unless
    // piercing, where it survives whole (keeping its charge) and plows through.
    const shatters = targets.has(idx) || (chargers.has(idx) && !config.piercing)
    if (shatters) {
      if (config.burst) bursts.push(m.pos) // overcharge → shockwave centre
      if (m.radius > ASTEROID_MIN_RADIUS) {
        // Chain reaction: fragments are born charged (duration scaled to their size).
        const cc = config.chainReaction ? chargeTimeFor(m.radius * CHILD_SCALE) : 0
        out.push(spawnChild(rng, m, cc), spawnChild(rng, m, cc))
      }
      // else: destroyed at min size (same as a bullet hit)
    } else {
      out.push(m)
    }
  }
  return bursts.length > 0 ? out.map((m) => burstPush(m, bursts)) : out
}

// Advance existing bullets, age them, cull the expired.
function advanceBullets(bullets: Bullet[], width: number, height: number, dt: number, mode: EdgeMode): Bullet[] {
  const next: Bullet[] = []
  for (const bl of bullets) {
    const ttl = bl.ttl - dt
    if (ttl <= 0) continue
    const b = bound(bl.pos.x + bl.vel.x * dt, bl.pos.y + bl.vel.y * dt, bl.vel.x, bl.vel.y, BULLET_RADIUS, width, height, mode)
    if (b.dead) continue
    next.push({ pos: { x: b.x, y: b.y }, vel: { x: b.vx, y: b.vy }, ttl })
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

// The post-movement mote passes, gated by config: charged repel, mote↔mote bounce,
// charged-split, (dormant) bullet hits, then conduction.
function reactMotes(rng: Rng, motes: Asteroid[], bullets: Bullet[], config: Config, dt: number): { asteroids: Asteroid[], bullets: Bullet[] } {
  const repelled = config.chargedRepel ? applyChargedRepel(motes, dt) : motes
  const bip = config.bipolar ? applyBipolar(repelled, dt) : repelled
  const bounced = config.moteCollision ? resolveMoteBounce(bip) : bip
  const reacted = config.chargedSplit ? resolveMoteCollisions(rng, bounced, config) : bounced
  const hit = resolveCollisions(rng, bullets, reacted)
  const conducted = config.conduction ? applyConduction(hit.asteroids) : hit.asteroids
  return { asteroids: conducted, bullets: hit.bullets }
}

/** Advance the world one fixed timestep. Pure: returns a new world. `config` selects
 * sandbox behaviour; it defaults to the shipped behaviour so existing callers are
 * unaffected. */
export function step(world: World, input: Input, dt: number, config: Config = DEFAULT_CONFIG): World {
  const rng = makeRng(world.rngState)
  const ship = stepShip(world.ship, input, world.width, world.height, dt, config)

  // Advance bullets, then fire (arming the cooldown) if the gun is enabled and triggered.
  const flying = advanceBullets(world.bullets, world.width, world.height, dt, config.edges)
  const firing = config.gun && input.fire && ship.fireCooldown <= 0
  const bullets = firing ? [...flying, makeBullet(ship, world.width, world.height)] : flying
  const armed: Ship = firing ? { ...ship, fireCooldown: FIRE_COOLDOWN } : ship

  // A gather pulse yanks motes inward first, then the continuous field + drift + wrap,
  // then the post-movement passes (repel / bounce / split / bullet hits / conduction).
  const kicked = input.pulse ? world.asteroids.map((a) => pulseKick(a, ship.pos)) : world.asteroids
  const moved = kicked.map((a) => stepMote(a, ship, world.width, world.height, dt, config)).filter((a): a is Asteroid => a !== null)
  const reacted = reactMotes(rng, moved, bullets, config, dt)

  // Keep the field populated to the configured count (no game-over yet: it's a sandbox).
  const deficit = Math.max(0, config.moteCount - reacted.asteroids.length)
  const refill = [...Array(deficit).keys()].map(() =>
    spawnAsteroid(rng, world.width, world.height, config.moteSize, config.moteDrift, armed.pos),
  )

  return {
    width: world.width,
    height: world.height,
    ship: armed,
    bullets: reacted.bullets,
    asteroids: [...reacted.asteroids, ...refill],
    rngState: rng.s,
    t: world.t + dt,
  }
}
