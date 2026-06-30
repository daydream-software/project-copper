import { describe, expect, it } from 'vitest'
import { createWorld, step } from './sim'
import { DT, NONE, cfg, makeWorld, mote, press, ring } from './test-helpers'

describe('pillars', () => {
  it('createWorld spawns config.pillarCount pillars at config.pillarSize (none by default)', () => {
    expect(createWorld(7, 720, 720).pillars).toHaveLength(0) // off by default
    const w = createWorld(7, 720, 720, cfg({ pillarCount: 4, pillarSize: 36 }))
    expect(w.pillars).toHaveLength(4)
    expect(w.pillars.every((p) => p.radius === 36)).toBe(true)
  })

  it('places every pillar clear of the centred ship and inside the arena', () => {
    const w = createWorld(7, 720, 720, cfg({ pillarCount: 6, pillarSize: 40 }))
    for (const p of w.pillars) {
      const d = Math.hypot(p.pos.x - 360, p.pos.y - 360) // centre of a 720² arena
      expect(d).toBeGreaterThanOrEqual(p.radius + 16) // clears the ship (SHIP_RADIUS) at the centre
      expect(d + p.radius).toBeLessThanOrEqual(360) // fully inside the inscribed circle
    }
  })

  it('leaves room for a mote to rest against a rim pillar inside the arena', () => {
    const moteR = 48 // default mote radius
    const w = createWorld(7, 720, 720, cfg({ pillarCount: 6, pillarSize: 40, moteSize: moteR }))
    for (const p of w.pillars) {
      const d = Math.hypot(p.pos.x - 360, p.pos.y - 360)
      // a mote pushed onto the pillar's far side (centre at d + pillarR + moteR) must stay
      // inside the mote-centre boundary (360 − moteR) — else deflect and bound fight at the rim
      expect(d + p.radius + moteR).toBeLessThanOrEqual(360 - moteR + 1e-6)
    }
  })

  it('a mote moving into a pillar bounces off it', () => {
    const pillar = { pos: { x: 400, y: 300 }, radius: 40 }
    const m = { pos: { x: 450, y: 300 }, vel: { x: -100, y: 0 }, radius: 30, angle: 0, spin: 0, shape: [], charge: 0 }
    const w = step(makeWorld({ asteroids: [m], pillars: [pillar] }), NONE, DT)
    expect(w.asteroids[0].vel.x).toBeGreaterThan(0) // inward velocity reflected outward
    expect(Math.hypot(w.asteroids[0].pos.x - 400, w.asteroids[0].pos.y - 300)).toBeGreaterThanOrEqual(70) // pushed to the surface (40 + 30)
  })

  it('the ship bounces off a pillar', () => {
    const pillar = { pos: { x: 400, y: 300 }, radius: 40 }
    const ship = { pos: { x: 450, y: 300 }, vel: { x: -120, y: 0 }, angle: 0, fireCooldown: 0, thrusting: false, field: 'off' as const, charge: 0, pulseT: 99 }
    const w = step(makeWorld({ ship, pillars: [pillar] }), NONE, DT)
    expect(w.ship.vel.x).toBeGreaterThan(0) // reflected away from the pillar
  })

  it('a mote bounces off a pillar by its outline, not its bounding circle', () => {
    const blob = ring(0.7) // reach 21 toward the pillar (sum with the r=40 pillar = 61)
    const pm = (x: number) => ({ pos: { x, y: 300 }, vel: { x: -100, y: 0 }, radius: 30, angle: 0, spin: 0, shape: blob, charge: 0 })
    const pillar = { pos: { x: 400, y: 300 }, radius: 40 }
    // Centre 65 from the pillar: the bounding circle (sum 70) would contact, the outline (61) doesn't.
    const apart = step(makeWorld({ asteroids: [pm(465)], pillars: [pillar] }), NONE, DT)
    expect(apart.asteroids[0].vel.x).toBeLessThan(0) // not bounced — still heading in
    // Centre 55: the outline (61) contacts → bounces back out.
    const close = step(makeWorld({ asteroids: [pm(455)], pillars: [pillar] }), NONE, DT)
    expect(close.asteroids[0].vel.x).toBeGreaterThan(0) // reflected away
  })
})

describe('wrapped-edge collisions (toroidal distance)', () => {
  const blob = ring(0.7) // outline reach 21 for r=30
  // Two motes 10px apart *across the right/left seam* of an 800-wide arena.
  const seamPair = (chargeL: number, chargeR: number, vxL = 0, vxR = 0) => [
    { pos: { x: 795, y: 300 }, vel: { x: vxL, y: 0 }, radius: 30, angle: 0, spin: 0, shape: blob, charge: chargeL },
    { pos: { x: 5, y: 300 }, vel: { x: vxR, y: 0 }, radius: 30, angle: 0, spin: 0, shape: blob, charge: chargeR },
  ]

  it('a charged mote shatters one across the seam in wrap mode', () => {
    const wrapped = step(makeWorld({ width: 800, height: 600, asteroids: seamPair(2, 0) }), NONE, DT, cfg({ edges: 'wrap' }))
    expect(wrapped.asteroids.filter((a) => a.radius < 25).length).toBeGreaterThanOrEqual(4) // both shatter across the seam
    expect(wrapped.shatters.length).toBeGreaterThan(0) // seam shatter still feeds debris (the shatter source fires)
    const bounced = step(makeWorld({ width: 800, height: 600, asteroids: seamPair(2, 0) }), NONE, DT, cfg({ edges: 'bounce' }))
    expect(bounced.asteroids.filter((a) => a.radius < 25)).toHaveLength(0) // no seam → 790px apart → no contact
  })

  it('two motes bounce across the seam in wrap mode', () => {
    const wrapped = step(makeWorld({ width: 800, height: 600, asteroids: seamPair(0, 0, 50, -50) }), NONE, DT, cfg({ edges: 'wrap', moteCollision: true }))
    expect(wrapped.asteroids[0].vel.x).toBeLessThan(0) // left-of-seam mote reversed by the bounce
    const open = step(makeWorld({ width: 800, height: 600, asteroids: seamPair(0, 0, 50, -50) }), NONE, DT, cfg({ edges: 'bounce', moteCollision: true }))
    expect(open.asteroids[0].vel.x).toBeGreaterThan(0) // no seam contact → still heading right
  })
})

describe('wrapped-edge ship field (toroidal reach)', () => {
  // Ship near the right edge, mote near the left — 20px apart across the seam, 780px raw.
  const edgeShip = { pos: { x: 790, y: 300 }, vel: { x: 0, y: 0 }, angle: 0, fireCooldown: 0, thrusting: false, field: 'off' as const, charge: 0, pulseT: 99 }

  it('a gather pulse reaches a mote across the seam in wrap mode, not in bounce', () => {
    const wrapped = step(makeWorld({ width: 800, height: 600, ship: edgeShip, asteroids: [mote(10, 0)] }), press({ pulse: true }), DT, cfg({ edges: 'wrap' }))
    expect(wrapped.asteroids[0].charge).toBeGreaterThan(0) // pulse reached across the seam
    const open = step(makeWorld({ width: 800, height: 600, ship: edgeShip, asteroids: [mote(10, 0)] }), press({ pulse: true }), DT, cfg({ edges: 'bounce' }))
    expect(open.asteroids[0].charge).toBe(0) // 780px away, out of reach
  })

  it('the continuous field reaches a mote across the seam in wrap mode, not in bounce', () => {
    const wrapped = step(makeWorld({ width: 800, height: 600, ship: edgeShip, asteroids: [mote(10, 0)] }), press({ attract: true }), DT, cfg({ gather: 'attract', edges: 'wrap' }))
    expect(wrapped.asteroids[0].vel.x).not.toBe(0) // pulled across the seam
    const open = step(makeWorld({ width: 800, height: 600, ship: edgeShip, asteroids: [mote(10, 0)] }), press({ attract: true }), DT, cfg({ gather: 'attract', edges: 'bounce' }))
    expect(open.asteroids[0].vel.x).toBe(0) // out of reach
  })
})

describe('edges mode', () => {
  const fastShip = { pos: { x: 799, y: 300 }, vel: { x: 300, y: 0 }, angle: 0, fireCooldown: 0, thrusting: false, field: 'off' as const, charge: 0, pulseT: 99 }

  it('bounce reflects the ship off the wall; wrap carries it across', () => {
    const bounced = step(makeWorld({ width: 800, ship: { ...fastShip } }), NONE, DT, cfg({ edges: 'bounce' }))
    expect(bounced.ship.vel.x).toBeLessThan(0)
    expect(bounced.ship.pos.x).toBeLessThan(800)
    const wrapped = step(makeWorld({ width: 800, ship: { ...fastShip } }), NONE, DT, cfg({ edges: 'wrap' }))
    expect(wrapped.ship.vel.x).toBeGreaterThan(0)
    expect(wrapped.ship.pos.x).toBeLessThan(10) // wrapped to the left side
  })

  it('bounce reflects a mote off the wall', () => {
    const fastMote = { pos: { x: 799, y: 300 }, vel: { x: 200, y: 0 }, radius: 30, angle: 0, spin: 0, shape: [], charge: 0 }
    const w = step(makeWorld({ width: 800, asteroids: [fastMote] }), NONE, DT, cfg({ edges: 'bounce' }))
    expect(w.asteroids[0].vel.x).toBeLessThan(0)
    expect(w.asteroids[0].pos.x).toBeLessThan(800)
  })

  it('kill removes a mote that leaves the arena', () => {
    const out = { pos: { x: 799, y: 300 }, vel: { x: 700, y: 0 }, radius: 31, angle: 0, spin: 0, shape: [], charge: 0 }
    const w = step(makeWorld({ width: 800, height: 600, asteroids: [out] }), NONE, DT, cfg({ edges: 'kill' }))
    expect(w.asteroids.every((a) => a.radius !== 31)).toBe(true) // the marked mote was culled (refills are r48)
  })
})

describe('asteroid collision', () => {
  const SHAPE = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }]

  it('splits a large asteroid into two smaller children', () => {
    const w = step(
      makeWorld({
        rngState: 99,
        asteroids: [{ pos: { x: 200, y: 200 }, vel: { x: 0, y: 0 }, radius: 48, angle: 0, spin: 0, shape: SHAPE, charge: 0 }],
        bullets: [{ pos: { x: 200, y: 200 }, vel: { x: 0, y: 0 }, ttl: 1 }],
      }),
      NONE,
      DT,
    )
    expect(w.bullets).toHaveLength(0) // bullet consumed
    expect(w.asteroids.filter((a) => a.radius < 40)).toHaveLength(2) // two children, rest are full-size refills
  })

  it('destroys (does not split) an asteroid already at minimum size', () => {
    const w = step(
      makeWorld({
        rngState: 99,
        asteroids: [{ pos: { x: 200, y: 200 }, vel: { x: 0, y: 0 }, radius: 18, angle: 0, spin: 0, shape: SHAPE, charge: 0 }],
        bullets: [{ pos: { x: 200, y: 200 }, vel: { x: 0, y: 0 }, ttl: 1 }],
      }),
      NONE,
      DT,
    )
    expect(w.bullets).toHaveLength(0) // bullet consumed → a hit happened
    expect(w.asteroids.filter((a) => a.radius < 40)).toHaveLength(0) // no children spawned
  })
})
