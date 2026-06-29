import { describe, expect, it } from 'vitest'
import { createWorld, step } from './sim'
import { overlap, wrap } from './geometry'
import type { Input, World } from './entities'

const DT = 1 / 120
const NONE: Input = { thrust: false, turnLeft: false, turnRight: false, attract: false, repel: false, fire: false }

function press(over: Partial<Input>): Input {
  return { ...NONE, ...over }
}

function makeWorld(over: Partial<World> = {}): World {
  return {
    width: 800,
    height: 600,
    ship: { pos: { x: 400, y: 300 }, vel: { x: 0, y: 0 }, angle: 0, fireCooldown: 0, thrusting: false, field: 'off' },
    bullets: [],
    asteroids: [],
    rngState: 12345,
    t: 0,
    ...over,
  }
}

describe('geometry', () => {
  it('wrap folds coordinates into [0, size)', () => {
    expect(wrap(-5, 100)).toBe(95)
    expect(wrap(105, 100)).toBe(5)
    expect(wrap(50, 100)).toBe(50)
    expect(wrap(100, 100)).toBe(0)
  })

  it('overlap is true only when circles intersect', () => {
    expect(overlap({ x: 0, y: 0 }, 5, { x: 0, y: 8 }, 4)).toBe(true) // gap 8 < 9
    expect(overlap({ x: 0, y: 0 }, 5, { x: 0, y: 8 }, 2)).toBe(false) // gap 8 > 7
  })
})

describe('createWorld', () => {
  it('is deterministic for a given seed', () => {
    expect(createWorld(7, 800, 600)).toEqual(createWorld(7, 800, 600))
  })

  it('produces a different field for a different seed', () => {
    expect(createWorld(1, 800, 600)).not.toEqual(createWorld(2, 800, 600))
  })

  it('spawns a full field with the ship centred', () => {
    const w = createWorld(7, 800, 600)
    expect(w.asteroids).toHaveLength(6)
    expect(w.ship.pos).toEqual({ x: 400, y: 300 })
  })
})

describe('ship', () => {
  it('thrust accelerates along the nose (up at angle 0)', () => {
    const w = step(makeWorld(), press({ thrust: true }), DT)
    expect(w.ship.vel.y).toBeLessThan(0)
    expect(w.ship.pos.y).toBeLessThan(300)
    expect(Math.abs(w.ship.vel.x)).toBeLessThan(1e-6)
  })

  it('turns right (angle increases) and left (angle decreases)', () => {
    expect(step(makeWorld(), press({ turnRight: true }), DT).ship.angle).toBeGreaterThan(0)
    expect(step(makeWorld(), press({ turnLeft: true }), DT).ship.angle).toBeLessThan(0)
  })

  it('drag bleeds velocity when coasting', () => {
    const w = step(makeWorld({ ship: { pos: { x: 400, y: 300 }, vel: { x: 100, y: 0 }, angle: 0, fireCooldown: 0, thrusting: false, field: 'off' } }), NONE, DT)
    expect(w.ship.vel.x).toBeGreaterThan(0)
    expect(w.ship.vel.x).toBeLessThan(100)
  })
})

describe('firing', () => {
  it('spawns one upward bullet and arms the cooldown', () => {
    const w = step(makeWorld(), press({ fire: true }), DT)
    expect(w.bullets).toHaveLength(1)
    expect(w.bullets[0].vel.y).toBeLessThan(0)
    expect(w.bullets[0].ttl).toBeGreaterThan(0)
    expect(w.ship.fireCooldown).toBeGreaterThan(0)
  })

  it('refuses to fire while the cooldown is up', () => {
    const w = step(makeWorld({ ship: { pos: { x: 400, y: 300 }, vel: { x: 0, y: 0 }, angle: 0, fireCooldown: 0.1, thrusting: false, field: 'off' } }), press({ fire: true }), DT)
    expect(w.bullets).toHaveLength(0)
  })

  it('culls bullets when their ttl runs out', () => {
    const w = step(makeWorld({ bullets: [{ pos: { x: 10, y: 10 }, vel: { x: 0, y: 0 }, ttl: 0.005 }] }), NONE, DT)
    expect(w.bullets).toHaveLength(0)
  })
})

describe('polarity field', () => {
  const mote = (x: number, vx: number) => ({ pos: { x, y: 300 }, vel: { x: vx, y: 0 }, radius: 30, angle: 0, spin: 0, shape: [] })

  it('attract pulls a nearby mote toward the ship', () => {
    const w = step(makeWorld({ asteroids: [mote(500, 0)] }), press({ attract: true }), DT)
    expect(w.asteroids[0].vel.x).toBeLessThan(0) // ship is at x=400, mote at x=500 → pulled left
    expect(w.asteroids[0].pos.x).toBeLessThan(500)
  })

  it('repel pushes a nearby mote away from the ship', () => {
    const w = step(makeWorld({ asteroids: [mote(500, 0)] }), press({ repel: true }), DT)
    expect(w.asteroids[0].vel.x).toBeGreaterThan(0)
    expect(w.asteroids[0].pos.x).toBeGreaterThan(500)
  })

  it('leaves motes beyond the field range untouched', () => {
    const w = step(makeWorld({ asteroids: [mote(700, 0)] }), press({ attract: true }), DT) // dist 300 > range
    expect(w.asteroids[0].vel.x).toBe(0)
    expect(w.asteroids[0].vel.y).toBe(0)
  })

  it('clamps mote speed so the field cannot fling them away', () => {
    const w = step(makeWorld({ asteroids: [mote(500, 9999)] }), NONE, DT)
    expect(Math.hypot(w.asteroids[0].vel.x, w.asteroids[0].vel.y)).toBeCloseTo(360, 1)
  })

  it('vortex (both held) swirls a mote tangentially instead of cancelling out', () => {
    // Mote sits due-right of the ship: a purely radial field (attract/repel) leaves
    // vel.y at 0; the vortex's tangential component makes it non-zero.
    const w = step(makeWorld({ asteroids: [mote(500, 0)] }), press({ attract: true, repel: true }), DT)
    expect(w.asteroids[0].vel.y).not.toBe(0)
    expect(w.asteroids[0].vel.y).toBeLessThan(0)
  })
})

describe('asteroid collision', () => {
  const SHAPE = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }]

  it('splits a large asteroid into two smaller children', () => {
    const w = step(
      makeWorld({
        rngState: 99,
        asteroids: [{ pos: { x: 200, y: 200 }, vel: { x: 0, y: 0 }, radius: 48, angle: 0, spin: 0, shape: SHAPE }],
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
        asteroids: [{ pos: { x: 200, y: 200 }, vel: { x: 0, y: 0 }, radius: 18, angle: 0, spin: 0, shape: SHAPE }],
        bullets: [{ pos: { x: 200, y: 200 }, vel: { x: 0, y: 0 }, ttl: 1 }],
      }),
      NONE,
      DT,
    )
    expect(w.bullets).toHaveLength(0) // bullet consumed → a hit happened
    expect(w.asteroids.filter((a) => a.radius < 40)).toHaveLength(0) // no children spawned
  })
})
