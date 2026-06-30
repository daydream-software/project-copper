// The pure, deterministic simulation. `step(world, input, dt) -> world` is the only
// place game logic lives: it never touches the DOM and uses the seeded PRNG
// (rng.ts) for all randomness, so a run is reproducible and directly unit-testable.

import { makeRng, type Rng } from './rng'
import { axisDelta, bound, outlineRadius, outlinesTouch, overlap, wrap, type EdgeMode, type Vec2 } from './geometry'
import { DEFAULT_CONFIG, type Config } from './config'
import { bouncePillars, spawnPillars } from './pillars'
import { CHILD_SCALE, chargeTimeFor, spawnAsteroid, spawnChild } from './motes'
import type { Asteroid, Bullet, FieldMode, Input, Pillar, Ship, World } from './entities'

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

// --- Asteroids --- (spawning + charge timing live in motes.ts)
const ASTEROID_MIN_RADIUS = 18 // below this a hit destroys instead of splitting
const MOTE_MAX_SPEED = 720 // clamp so the field can't fling motes off to infinity (high enough for a charged fling)

// --- Polarity field (the core verb): pull motes in / push them away ---
// Reach, strength, charge time and the full-charge fling speed are sandbox knobs (read
// from Config); the constants below are the fixed *shape* of the vortex. The orbit shell
// radius derives from the (configurable) field range, at half of it.
const VORTEX_SWIRL_MIN = 170 // tangential orbit speed at zero charge, px/s (config sets the max)
const VORTEX_SPRING = 3.5 // pull toward the shell radius, 1/s
const VORTEX_RESPONSE = 6 // how fast a mote's velocity tracks the vortex target, 1/s

// --- Gather pulse (replaces a continuous attract): a discrete inward impulse ---
/** Reach of a gather pulse, px. Exported so the view can size the ripple. */
export const PULSE_RANGE = 300
const PULSE_STRENGTH = 380 // inward velocity kick at the centre, px/s (linear falloff to 0 at the edge)
const MAX_MOTES = 80 // safety cap so a chain reaction can't explode the field unboundedly
const TRIM_INTERVAL = 0.3 // s between population trims while the field is over the count target
const TRIM_FRACTION = 0.25 // proportion of the count over target trimmed each tick (proportional ease)
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

/** Build a fresh world: ship centred, a seeded asteroid field, no bullets, and (when the
 * knob is set) static pillars. Count / size / drift and the pillar count / size come from
 * config (defaulting to the shipped values), so the same seed regenerates the same arena
 * with whatever knobs are set. Pillars draw from the rng *after* the asteroids and only
 * when present, so an existing seed's field is unchanged with pillars off. */
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
  const pillars = config.pillarCount > 0 ? spawnPillars(rng, width, height, config.pillarCount, config.pillarSize, config.moteSize * 2, SHIP_RADIUS) : []
  return { width, height, ship, bullets: [], asteroids, pillars, shatters: [], rngState: rng.s, t: 0 }
}

// Turn, thrust, drag, clamp, then move (wrapping). Decrements the fire cooldown but
// does not arm it — firing (which creates a bullet) is the caller's job.
function stepShip(ship: Ship, input: Input, width: number, height: number, dt: number, config: Config, pillars: Pillar[]): Ship {
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
  const charge = field === 'vortex' ? Math.min(1, ship.charge + dt / config.chargeTime) : 0
  // The ship never dies at the edge (no game-over) — kill behaves like bounce for it.
  const shipMode = config.edges === 'kill' ? 'bounce' : config.edges
  const b = bound(ship.pos.x + vx * dt, ship.pos.y + vy * dt, vx, vy, SHIP_RADIUS, width, height, shipMode)
  const p = bouncePillars(b.x, b.y, b.vx, b.vy, SHIP_RADIUS, [], 0, pillars) // ship is a circle
  return {
    pos: { x: p.x, y: p.y },
    vel: { x: p.vx, y: p.vy },
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
function pulseKick(a: Asteroid, shipPos: Vec2, width: number, height: number, wrap: boolean): Asteroid {
  const dx = axisDelta(a.pos.x, shipPos.x, width, wrap) // toroidal: the pulse reaches across the seam
  const dy = axisDelta(a.pos.y, shipPos.y, height, wrap)
  const dist = Math.hypot(dx, dy)
  if (dist === 0 || dist >= PULSE_RANGE) return a
  const kick = PULSE_STRENGTH * (1 - dist / PULSE_RANGE)
  return { ...a, charge: chargeTimeFor(a.radius), vel: { x: a.vel.x + (dx / dist) * kick, y: a.vel.y + (dy / dist) * kick } }
}

// Vortex steers a mote's velocity toward a rotating shell — a spring toward the shell
// `radius` (half the field range) plus a tangential orbit speed — so motes circle the
// ship and stay captured, instead of a constant tangential force spiralling them out of
// range. (ux, uy) points from the mote toward the ship; `swirl` is the (charge-scaled)
// tangential orbit speed.
function vortexVel(ux: number, uy: number, dist: number, radius: number, swirl: number, vx: number, vy: number, dt: number): Vec2 {
  const radialOut = VORTEX_SPRING * (radius - dist) // +outward inside the shell, -inward outside
  const targetX = -ux * radialOut + -uy * swirl // outward (-ux,-uy) + tangent (-uy, ux)
  const targetY = -uy * radialOut + ux * swirl
  const k = Math.min(1, VORTEX_RESPONSE * dt)
  return { x: vx + (targetX - vx) * k, y: vy + (targetY - vy) * k }
}

// The polarity field's effect on a mote: the new velocity and whether the field
// touched it (which (re)charges it). Extracted to keep stepMote flat.
function fieldForce(ship: Ship, a: Asteroid, dt: number, config: Config, width: number, height: number): { vx: number, vy: number, touched: boolean } {
  const vx = a.vel.x
  const vy = a.vel.y
  if (ship.field === 'off') return { vx, vy, touched: false }
  const wrap = config.edges === 'wrap'
  const dx = axisDelta(a.pos.x, ship.pos.x, width, wrap) // toroidal: the field reaches across the seam
  const dy = axisDelta(a.pos.y, ship.pos.y, height, wrap)
  const dist = Math.hypot(dx, dy)
  if (dist <= 0 || dist >= config.fieldRange) return { vx, vy, touched: false }
  const ux = dx / dist
  const uy = dy / dist
  if (ship.field === 'vortex') {
    const swirl = VORTEX_SWIRL_MIN + (config.vortexSwirl - VORTEX_SWIRL_MIN) * ship.charge
    const v = vortexVel(ux, uy, dist, config.fieldRange * 0.5, swirl, vx, vy, dt)
    return { vx: v.x, vy: v.y, touched: true }
  }
  // 'attract' = radial inward (ux,uy point at the ship); 'repel' = outward.
  const mag = config.fieldStrength * (1 - dist / config.fieldRange) * dt * (ship.field === 'attract' ? 1 : -1)
  return { vx: vx + ux * mag, vy: vy + uy * mag, touched: true }
}

// Where a centre/ship-anchored force originates: the ship's position when it follows the
// ship, else the given fixed point (the arena centre for the well, the world origin for flow).
function anchorPoint(anchor: 'centre' | 'ship', ship: Ship, fixedX: number, fixedY: number): Vec2 {
  return anchor === 'ship' ? { x: ship.pos.x, y: ship.pos.y } : { x: fixedX, y: fixedY }
}

// Drift a mote: polarity field, then gravity well + friction (sandbox toggles), clamp,
// move + spin (wrapping or bouncing). The field touching it (re)charges it.
function stepMote(a: Asteroid, ship: Ship, width: number, height: number, dt: number, config: Config, pillars: Pillar[]): Asteroid | null {
  const f = fieldForce(ship, a, dt, config, width, height)
  let { vx, vy } = f
  if (config.well) {
    // Pull toward the arena centre, or toward the ship when the well follows it.
    const w = anchorPoint(config.wellAnchor, ship, width / 2, height / 2)
    vx += (w.x - a.pos.x) * WELL_K * dt
    vy += (w.y - a.pos.y) * WELL_K * dt
  }
  if (config.flow) {
    // A static swirl field: motes drift along it like currents. 'centre' = the fixed world
    // field (sampled from origin 0); 'ship' shifts the sample so the swirl centres on (and
    // follows) the ship. 'centre' is origin-0, NOT the arena centre — offsetting it would
    // shift every existing flow seed by ~0.7 of a period, so the default must stay origin-0.
    const f = anchorPoint(config.flowAnchor, ship, 0, 0)
    vx += Math.cos((a.pos.y - f.y) * FLOW_SCALE) * FLOW_FORCE * dt
    vy += Math.sin((a.pos.x - f.x) * FLOW_SCALE) * FLOW_FORCE * dt
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
  const p = bouncePillars(b.x, b.y, b.vx, b.vy, a.radius, a.shape, a.angle, pillars) // mote bounces by its outline
  return {
    ...a,
    vel: { x: p.vx, y: p.vy },
    pos: { x: p.x, y: p.y },
    angle: a.angle + a.spin * dt,
    charge: f.touched ? chargeTimeFor(a.radius) : Math.max(0, a.charge - dt),
  }
}

// A pairwise force between charged motes within `range`, magnitude `strength` at the centre
// falling linearly to 0 at the edge, the direction set by `signOf` (+ pushes apart). Drives
// both charged-repel (always +) and bipolar (+ for like poles, − for opposite) — same shape,
// different sign — applied to velocity (takes effect next step). Toroidal in wrap mode.
function applyPairForce(motes: Asteroid[], dt: number, width: number, height: number, wrap: boolean, range: number, strength: number, signOf: (m: Asteroid, o: Asteroid) => number): Asteroid[] {
  return motes.map((m, i) => {
    if (m.charge <= 0) return m
    let vx = m.vel.x
    let vy = m.vel.y
    for (const [j, o] of motes.entries()) {
      if (i === j || o.charge <= 0) continue
      const dx = axisDelta(o.pos.x, m.pos.x, width, wrap)
      const dy = axisDelta(o.pos.y, m.pos.y, height, wrap)
      const d2 = dx * dx + dy * dy
      if (d2 <= 0 || d2 >= range * range) continue
      const d = Math.sqrt(d2)
      const f = strength * (1 - d / range) * dt * signOf(m, o)
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
function resolveMoteBounce(motes: Asteroid[], width: number, height: number, wrap: boolean): Asteroid[] {
  const px = motes.map((m) => m.pos.x)
  const py = motes.map((m) => m.pos.y)
  const vx = motes.map((m) => m.vel.x)
  const vy = motes.map((m) => m.vel.y)
  for (let i = 0; i < motes.length; i += 1) {
    for (let j = i + 1; j < motes.length; j += 1) {
      const dx = axisDelta(px[i], px[j], width, wrap)
      const dy = axisDelta(py[i], py[j], height, wrap)
      const d2 = dx * dx + dy * dy
      if (d2 <= 0) continue // coincident — no contact normal; leave to next frame
      const d = Math.sqrt(d2)
      const nx = dx / d
      const ny = dy / d
      // Contact follows each mote's outline toward the other, not the bounding circle.
      const rsum = outlineRadius(motes[i].shape, motes[i].radius, motes[i].angle, nx, ny)
        + outlineRadius(motes[j].shape, motes[j].radius, motes[j].angle, -nx, -ny)
      if (d >= rsum) continue
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
function applyConduction(motes: Asteroid[], width: number, height: number, wrap: boolean): Asteroid[] {
  return motes.map((m) => {
    if (m.charge > 0) return m
    for (const o of motes) {
      if (o.charge <= 0) continue
      const dx = axisDelta(o.pos.x, m.pos.x, width, wrap)
      const dy = axisDelta(o.pos.y, m.pos.y, height, wrap)
      if (dx * dx + dy * dy < CONDUCTION_RANGE * CONDUCTION_RANGE) return { ...m, charge: chargeTimeFor(m.radius) }
    }
    return m
  })
}

// A charged mote that overlaps an uncharged one triggers the bullet-style split.
// Charged↔charged and uncharged↔uncharged do nothing. Returns the uncharged motes hit
// (`targets`) and the charged motes that hit something (`chargers`).
function findMoteSplits(motes: Asteroid[], width: number, height: number, wrap: boolean): { targets: Set<number>, chargers: Set<number> } {
  const targets = new Set<number>()
  const chargers = new Set<number>()
  for (const [i, mi] of motes.entries()) {
    if (mi.charge <= 0) continue
    for (const [j, mj] of motes.entries()) {
      if (i === j) continue
      if (mj.charge > 0) continue
      if (!outlinesTouch(mi, mj, width, height, wrap)) continue // outline contact, wrap-aware across the seam
      targets.add(j)
      chargers.add(i)
    }
  }
  return { targets, chargers }
}

// Burst: shove a mote outward from each shatter centre within BURST_RADIUS.
function burstPush(m: Asteroid, centers: Vec2[], width: number, height: number, wrap: boolean): Asteroid {
  let vx = m.vel.x
  let vy = m.vel.y
  for (const c of centers) {
    const dx = axisDelta(c.x, m.pos.x, width, wrap)
    const dy = axisDelta(c.y, m.pos.y, height, wrap)
    const d2 = dx * dx + dy * dy
    if (d2 <= 0 || d2 >= BURST_RADIUS * BURST_RADIUS) continue
    const d = Math.sqrt(d2)
    const k = BURST_STRENGTH * (1 - d / BURST_RADIUS)
    vx += (dx / d) * k
    vy += (dy / d) * k
  }
  return { ...m, vel: { x: vx, y: vy } }
}

// Shatter centres are collected for every charged hit (the `shatters` output, which the
// view turns into debris); burst reuses the same centres as shockwave origins.
function resolveMoteCollisions(rng: Rng, motes: Asteroid[], config: Config, width: number, height: number): { asteroids: Asteroid[], shatters: Vec2[] } {
  if (motes.length >= MAX_MOTES) return { asteroids: motes, shatters: [] } // safety valve: stop splitting
  const wrap = config.edges === 'wrap'
  const { targets, chargers } = findMoteSplits(motes, width, height, wrap)
  const out: Asteroid[] = []
  const shatters: Vec2[] = []
  for (const [idx, m] of motes.entries()) {
    // Both motes shatter on a charged hit — including the charger itself, unless
    // piercing, where it survives whole (keeping its charge) and plows through.
    const isShatter = targets.has(idx) || (chargers.has(idx) && !config.piercing)
    if (isShatter) {
      shatters.push({ x: m.pos.x, y: m.pos.y }) // a debris / shockwave origin
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
  return { asteroids: config.burst && shatters.length > 0 ? out.map((m) => burstPush(m, shatters, width, height, wrap)) : out, shatters }
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

// The post-movement mote passes, gated by config: charged repel, charged-split, mote↔mote
// bounce, (dormant) bullet hits, then conduction. Split runs *before* bounce: both use the
// same outline contact, and if bounce ran first it would separate an overlapping pair so
// the split could no longer see the contact — "it bounced but didn't split".
function reactMotes(rng: Rng, motes: Asteroid[], bullets: Bullet[], config: Config, dt: number, width: number, height: number): { asteroids: Asteroid[], bullets: Bullet[], shatters: Vec2[] } {
  // Mote↔mote passes measure distance the toroidal way in wrap mode, so a pair straddling
  // an edge interacts across the seam instead of reading as a whole arena apart.
  const wrap = config.edges === 'wrap'
  const repelled = config.chargedRepel ? applyPairForce(motes, dt, width, height, wrap, CHARGED_REPEL_RANGE, CHARGED_REPEL_STRENGTH, () => 1) : motes
  const bip = config.bipolar ? applyPairForce(repelled, dt, width, height, wrap, BIPOLAR_RANGE, BIPOLAR_STRENGTH, (m, o) => (m.polarity ?? 1) === (o.polarity ?? 1) ? 1 : -1) : repelled
  const reacted = config.chargedSplit ? resolveMoteCollisions(rng, bip, config, width, height) : { asteroids: bip, shatters: [] }
  const bounced = config.moteCollision ? resolveMoteBounce(reacted.asteroids, width, height, wrap) : reacted.asteroids
  const hit = resolveCollisions(rng, bullets, bounced)
  const conducted = config.conduction ? applyConduction(hit.asteroids, width, height, wrap) : hit.asteroids
  return { asteroids: conducted, bullets: hit.bullets, shatters: reacted.shatters }
}

// Bring the field back toward the target after splits churn it. Splits raise the entity
// count *and* lose mass (two children are smaller than the parent), so a plain count-floor
// leaves a dwindling cloud of fragments that never returns to the chosen motes. Two forces
// converge it to `moteCount` full-size motes:
//  - refill by MASS: spawn full motes while the field is at least one full mote under
//    moteCount full motes' worth of area — so destroyed fragments come back as big motes.
//  - trim by COUNT: gently drop the smallest (fragment) motes when over the count target
//    (a proportional cull, once per TRIM_INTERVAL), so the population can't ratchet up.
// Time-gated off world.t (no Math.random) so it stays pure / deterministic.
function populateField(rng: Rng, motes: Asteroid[], config: Config, width: number, height: number, avoid: Vec2, t: number, dt: number): Asteroid[] {
  const fullArea = config.moteSize * config.moteSize
  const target = config.moteCount * fullArea
  let kept = motes
  let area = kept.reduce((s, a) => s + a.radius * a.radius, 0)
  // Trim on a tick when over the count, or under target mass with a fragment to convert (drop
  // it so the refill replaces it with a full mote → all big at rest). Smallest dropped first.
  const fragmentLight = area < target && kept.some((a) => a.radius < config.moteSize)
  if (Math.floor(t / TRIM_INTERVAL) !== Math.floor((t + dt) / TRIM_INTERVAL) && (kept.length > config.moteCount || fragmentLight)) {
    const cull = Math.max(1, Math.round(Math.max(0, kept.length - config.moteCount) * TRIM_FRACTION))
    const drop = new Set([...kept.keys()].sort((a, b) => kept[a].radius - kept[b].radius).slice(0, cull))
    kept = kept.filter((_, i) => !drop.has(i))
    area = kept.reduce((s, a) => s + a.radius * a.radius, 0)
  }
  // Refill big motes by mass: as many full motes as fit under the target area (and MAX_MOTES).
  const room = Math.max(0, Math.min(Math.floor((target - area) / fullArea), MAX_MOTES - kept.length))
  const refill = [...Array(room).keys()].map(() => spawnAsteroid(rng, width, height, config.moteSize, config.moteDrift, avoid))
  return [...kept, ...refill]
}

/** Advance the world one fixed timestep. Pure: returns a new world. `config` selects
 * sandbox behaviour; it defaults to the shipped behaviour so existing callers are
 * unaffected. */
export function step(world: World, input: Input, dt: number, config: Config = DEFAULT_CONFIG): World {
  const rng = makeRng(world.rngState)
  const ship = stepShip(world.ship, input, world.width, world.height, dt, config, world.pillars)

  // Advance bullets, then fire (arming the cooldown) if the gun is enabled and triggered.
  const flying = advanceBullets(world.bullets, world.width, world.height, dt, config.edges)
  const firing = config.gun && input.fire && ship.fireCooldown <= 0
  const bullets = firing ? [...flying, makeBullet(ship, world.width, world.height)] : flying
  const armed: Ship = firing ? { ...ship, fireCooldown: FIRE_COOLDOWN } : ship

  // A gather pulse yanks motes inward first, then the continuous field + drift + wrap,
  // then the post-movement passes (repel / bounce / split / bullet hits / conduction).
  const kicked = input.pulse ? world.asteroids.map((a) => pulseKick(a, ship.pos, world.width, world.height, config.edges === 'wrap')) : world.asteroids
  const moved = kicked.map((a) => stepMote(a, ship, world.width, world.height, dt, config, world.pillars)).filter((a): a is Asteroid => a !== null)
  const reacted = reactMotes(rng, moved, bullets, config, dt, world.width, world.height)

  // Keep the field populated toward the configured count, as full motes (no game-over yet:
  // it's a sandbox). Trims fragment excess and refills big motes by mass — see populateField.
  const asteroids = populateField(rng, reacted.asteroids, config, world.width, world.height, armed.pos, world.t, dt)

  return {
    width: world.width,
    height: world.height,
    ship: armed,
    bullets: reacted.bullets,
    asteroids,
    pillars: world.pillars, // static: carried through unchanged
    shatters: reacted.shatters, // this step's shatter centres (debris source)
    rngState: rng.s,
    t: world.t + dt,
  }
}
