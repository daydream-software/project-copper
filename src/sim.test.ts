import { describe, expect, it } from 'vitest'
import { createWorld, step } from './sim'
import { bound, overlap, wrap } from './geometry'
import { DEFAULT_CONFIG, type Config } from './config'
import type { Input, World } from './entities'

const DT = 1 / 120
const NONE: Input = { thrust: false, turnLeft: false, turnRight: false, attract: false, repel: false, pulse: false, fire: false }

function press(over: Partial<Input>): Input {
  return { ...NONE, ...over }
}

const cfg = (over: Partial<Config> = {}): Config => ({ ...DEFAULT_CONFIG, ...over })

// A mote (drifting polygon) for field tests; shape is irrelevant to the sim.
const mote = (x: number, vx: number) => ({ pos: { x, y: 300 }, vel: { x: vx, y: 0 }, radius: 30, angle: 0, spin: 0, shape: [], charge: 0 })

// A mote at a fixed spot with a given radius and charge, for collision tests.
const moteAt = (x: number, y: number, radius: number, charge: number) => ({ pos: { x, y }, vel: { x: 0, y: 0 }, radius, angle: 0, spin: 0, shape: [], charge })

// Run the sim n fixed steps under a held input.
function stepN(w: World, input: Input, n: number): World {
  let world = w
  for (let i = 0; i < n; i += 1) {
    world = step(world, input, DT)
  }
  return world
}

function makeWorld(over: Partial<World> = {}): World {
  return {
    width: 800,
    height: 600,
    ship: { pos: { x: 400, y: 300 }, vel: { x: 0, y: 0 }, angle: 0, fireCooldown: 0, thrusting: false, field: 'off', charge: 0, pulseT: 99 },
    bullets: [],
    asteroids: [],
    pillars: [],
    shatters: [],
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

  it('bound wraps / bounces / kills against the rectangle', () => {
    expect(bound(105, 50, 5, 0, 0, 100, 100, 'wrap')).toEqual({ x: 5, y: 50, vx: 5, vy: 0, dead: false })
    expect(bound(105, 50, 5, 0, 0, 100, 100, 'bounce')).toEqual({ x: 95, y: 50, vx: -5, vy: 0, dead: false })
    expect(bound(105, 50, 5, 0, 0, 100, 100, 'kill').dead).toBe(true)
    expect(bound(50, 50, 5, 0, 0, 100, 100, 'kill').dead).toBe(false) // in bounds
  })

  it('bound reflects off the circle arena', () => {
    const b = bound(110, 50, 10, 0, 0, 100, 100, 'circle') // outside the r=50 circle at (50,50)
    expect(b.x).toBeLessThan(110) // pulled back onto the circle
    expect(b.vx).toBeLessThan(0) // velocity reflected inward
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
    const w = step(makeWorld({ ship: { pos: { x: 400, y: 300 }, vel: { x: 100, y: 0 }, angle: 0, fireCooldown: 0, thrusting: false, field: 'off', charge: 0, pulseT: 99 } }), NONE, DT)
    expect(w.ship.vel.x).toBeGreaterThan(0)
    expect(w.ship.vel.x).toBeLessThan(100)
  })
})

describe('firing (gun)', () => {
  it('spawns one upward bullet and arms the cooldown when the gun is on', () => {
    const w = step(makeWorld(), press({ fire: true }), DT, cfg({ gun: true }))
    expect(w.bullets).toHaveLength(1)
    expect(w.bullets[0].vel.y).toBeLessThan(0)
    expect(w.bullets[0].ttl).toBeGreaterThan(0)
    expect(w.ship.fireCooldown).toBeGreaterThan(0)
  })

  it('does not fire when the gun is disabled (the default)', () => {
    expect(step(makeWorld(), press({ fire: true }), DT).bullets).toHaveLength(0)
  })

  it('refuses to fire while the cooldown is up', () => {
    const w = step(makeWorld({ ship: { pos: { x: 400, y: 300 }, vel: { x: 0, y: 0 }, angle: 0, fireCooldown: 0.1, thrusting: false, field: 'off', charge: 0, pulseT: 99 } }), press({ fire: true }), DT, cfg({ gun: true }))
    expect(w.bullets).toHaveLength(0)
  })

  it('culls bullets when their ttl runs out', () => {
    const w = step(makeWorld({ bullets: [{ pos: { x: 10, y: 10 }, vel: { x: 0, y: 0 }, ttl: 0.005 }] }), NONE, DT)
    expect(w.bullets).toHaveLength(0)
  })
})

describe('polarity field', () => {
  it('a gather pulse yanks a nearby mote toward the ship', () => {
    const w = step(makeWorld({ asteroids: [mote(500, 0)] }), press({ pulse: true }), DT)
    expect(w.asteroids[0].vel.x).toBeLessThan(0) // ship at x=400, mote at x=500 → kicked left
    expect(w.asteroids[0].pos.x).toBeLessThan(500)
  })

  it('does nothing to a mote without a pulse or field', () => {
    const w = step(makeWorld({ asteroids: [mote(500, 0)] }), NONE, DT)
    expect(w.asteroids[0].vel.x).toBe(0)
    expect(w.asteroids[0].vel.y).toBe(0)
  })

  it('repel pushes a nearby mote away from the ship', () => {
    const w = step(makeWorld({ asteroids: [mote(500, 0)] }), press({ repel: true }), DT)
    expect(w.asteroids[0].vel.x).toBeGreaterThan(0)
    expect(w.asteroids[0].pos.x).toBeGreaterThan(500)
  })

  it('a pulse leaves motes beyond its reach untouched', () => {
    const w = step(makeWorld({ asteroids: [mote(750, 0)] }), press({ pulse: true }), DT) // dist 350 > PULSE_RANGE
    expect(w.asteroids[0].vel.x).toBe(0)
    expect(w.asteroids[0].vel.y).toBe(0)
  })

  it('clamps mote speed so the field cannot fling them off to infinity', () => {
    const w = step(makeWorld({ asteroids: [mote(500, 9999)] }), NONE, DT)
    expect(Math.hypot(w.asteroids[0].vel.x, w.asteroids[0].vel.y)).toBeCloseTo(720, 1)
  })

  it('vortex (both held) swirls a mote tangentially instead of cancelling out', () => {
    // Mote sits due-right of the ship: a purely radial field (attract/repel) leaves
    // vel.y at 0; the vortex's tangential component makes it non-zero.
    const w = step(makeWorld({ asteroids: [mote(500, 0)] }), press({ attract: true, repel: true }), DT)
    expect(w.asteroids[0].vel.y).not.toBe(0)
    expect(w.asteroids[0].vel.y).toBeLessThan(0)
  })
})

describe('vortex charge', () => {
  const both = press({ attract: true, repel: true })

  it('builds while the vortex is held and caps at 1', () => {
    const once = step(makeWorld(), both, DT)
    expect(once.ship.charge).toBeGreaterThan(0)
    expect(once.ship.charge).toBeLessThan(1)
    expect(stepN(makeWorld(), both, 300).ship.charge).toBe(1)
  })

  it('resets the moment the vortex is released', () => {
    const charged = makeWorld({ ship: { pos: { x: 400, y: 300 }, vel: { x: 0, y: 0 }, angle: 0, fireCooldown: 0, thrusting: false, field: 'off', charge: 0.5, pulseT: 99 } })
    expect(step(charged, NONE, DT).ship.charge).toBe(0)
  })

  it('a longer-held vortex winds motes up to a higher orbit speed', () => {
    const brief = stepN(makeWorld({ asteroids: [mote(500, 0)] }), both, 5)
    const wound = stepN(makeWorld({ asteroids: [mote(500, 0)] }), both, 200)
    const sBrief = Math.hypot(brief.asteroids[0].vel.x, brief.asteroids[0].vel.y)
    const sWound = Math.hypot(wound.asteroids[0].vel.x, wound.asteroids[0].vel.y)
    expect(sWound).toBeGreaterThan(sBrief)
  })
})

describe('charged-mote collisions', () => {
  it('a field interaction charges a mote', () => {
    const w = step(makeWorld({ asteroids: [mote(500, 0)] }), press({ pulse: true }), DT)
    expect(w.asteroids[0].charge).toBeGreaterThan(0)
  })

  it('charges bigger motes for longer (duration ∝ radius)', () => {
    const big = step(makeWorld({ asteroids: [moteAt(500, 300, 48, 0)] }), press({ pulse: true }), DT)
    const small = step(makeWorld({ asteroids: [moteAt(500, 300, 20, 0)] }), press({ pulse: true }), DT)
    expect(big.asteroids[0].charge).toBeGreaterThan(small.asteroids[0].charge)
  })

  it('a charged hit shatters both motes (the charger splits too)', () => {
    const w = step(makeWorld({ rngState: 99, asteroids: [moteAt(300, 300, 48, 2), moteAt(300, 300, 48, 0)] }), NONE, DT)
    expect(w.asteroids.filter((a) => a.radius < 40).length).toBeGreaterThanOrEqual(4) // two children from each mote
  })

  it('two charged motes do not split each other', () => {
    const w = step(makeWorld({ asteroids: [moteAt(300, 300, 48, 2), moteAt(300, 300, 48, 2)] }), NONE, DT)
    expect(w.asteroids.filter((a) => a.radius < 40)).toHaveLength(0)
  })

  it('two uncharged motes do not split each other', () => {
    const w = step(makeWorld({ asteroids: [moteAt(300, 300, 48, 0), moteAt(300, 300, 48, 0)] }), NONE, DT)
    expect(w.asteroids.filter((a) => a.radius < 40)).toHaveLength(0)
  })
})

describe('sandbox config', () => {
  const contact = () => [moteAt(300, 300, 48, 2), moteAt(300, 300, 48, 0)] // a charger overlapping an uncharged mote

  it('gather=attract applies a continuous inward pull (no pulse needed)', () => {
    const w = step(makeWorld({ asteroids: [mote(500, 0)] }), press({ attract: true }), DT, cfg({ gather: 'attract' }))
    expect(w.asteroids[0].vel.x).toBeLessThan(0)
  })

  it('chargedSplit=false leaves a charged+uncharged contact intact', () => {
    const w = step(makeWorld({ asteroids: contact() }), NONE, DT, cfg({ chargedSplit: false }))
    expect(w.asteroids.filter((a) => a.radius < 40)).toHaveLength(0)
  })

  it('piercing=true keeps the charger charged after a hit', () => {
    const w = step(makeWorld({ asteroids: contact() }), NONE, DT, cfg({ piercing: true }))
    expect(w.asteroids[0].charge).toBeGreaterThan(0) // charger (idx 0) did not discharge
  })

  it('chainReaction=true spawns charged fragments', () => {
    const w = step(makeWorld({ asteroids: contact() }), NONE, DT, cfg({ chainReaction: true }))
    expect(w.asteroids.find((a) => a.radius < 40)?.charge ?? 0).toBeGreaterThan(0)
  })
})

describe('physics & charge modes', () => {
  it('conduction charges a nearby uncharged mote — alongside split, not instead of it', () => {
    const near = () => [moteAt(300, 300, 48, 2), moteAt(410, 300, 48, 0)] // 110px apart: within conduction range, not overlapping
    for (const chargedSplit of [false, true]) {
      const w = step(makeWorld({ asteroids: near() }), NONE, DT, cfg({ conduction: true, chargedSplit }))
      expect(w.asteroids[1].charge).toBeGreaterThan(0) // the nearby uncharged mote got energized
      expect(w.asteroids.filter((a) => a.radius < 40)).toHaveLength(0) // not overlapping → nothing shattered
    }
  })

  it('charged motes repel each other', () => {
    const w = step(makeWorld({ asteroids: [moteAt(300, 300, 30, 2), moteAt(340, 300, 30, 2)] }), NONE, DT, cfg({ chargedRepel: true }))
    expect(w.asteroids[0].vel.x).toBeLessThan(0) // left mote shoved left
    expect(w.asteroids[1].vel.x).toBeGreaterThan(0) // right mote shoved right
  })

  it('gravity well pulls a mote toward the centre', () => {
    const w = step(makeWorld({ width: 800, height: 600, asteroids: [moteAt(200, 300, 30, 0)] }), NONE, DT, cfg({ well: true }))
    expect(w.asteroids[0].vel.x).toBeGreaterThan(0) // centre is at x=400 → pulled right
  })

  it('friction bleeds a mote speed', () => {
    const fast = { pos: { x: 300, y: 300 }, vel: { x: 200, y: 0 }, radius: 30, angle: 0, spin: 0, shape: [], charge: 0 }
    const w = step(makeWorld({ asteroids: [fast] }), NONE, DT, cfg({ friction: true }))
    expect(w.asteroids[0].vel.x).toBeGreaterThan(0)
    expect(w.asteroids[0].vel.x).toBeLessThan(200)
  })

  it('mote collisions bounce two motes off each other (billiards)', () => {
    const a = { pos: { x: 300, y: 300 }, vel: { x: 100, y: 0 }, radius: 30, angle: 0, spin: 0, shape: [], charge: 0 }
    const b = { pos: { x: 340, y: 300 }, vel: { x: -100, y: 0 }, radius: 30, angle: 0, spin: 0, shape: [], charge: 0 }
    const w = step(makeWorld({ asteroids: [a, b] }), NONE, DT, cfg({ moteCollision: true }))
    expect(w.asteroids[0].vel.x).toBeLessThan(0) // head-on → both reverse
    expect(w.asteroids[1].vel.x).toBeGreaterThan(0)
  })

  it('the flow field pushes a still mote', () => {
    const w = step(makeWorld({ asteroids: [moteAt(300, 300, 30, 0)] }), NONE, DT, cfg({ flow: true }))
    expect(Math.hypot(w.asteroids[0].vel.x, w.asteroids[0].vel.y)).toBeGreaterThan(0)
  })
})

describe('advanced charge modes', () => {
  it('bipolar: opposite poles attract, like poles repel', () => {
    const make = (x: number, pol: number) => ({ pos: { x, y: 300 }, vel: { x: 0, y: 0 }, radius: 30, angle: 0, spin: 0, shape: [], charge: 2, polarity: pol })
    const opp = step(makeWorld({ asteroids: [make(300, 1), make(360, -1)] }), NONE, DT, cfg({ bipolar: true }))
    expect(opp.asteroids[0].vel.x).toBeGreaterThan(0) // + pulled toward the − on its right
    const like = step(makeWorld({ asteroids: [make(300, 1), make(360, 1)] }), NONE, DT, cfg({ bipolar: true }))
    expect(like.asteroids[0].vel.x).toBeLessThan(0) // + pushed from the + on its right
  })

  it('burst shoves a bystander mote outward on a shatter', () => {
    const motes = [moteAt(300, 300, 48, 2), moteAt(300, 300, 48, 0), moteAt(380, 300, 30, 0)]
    const w = step(makeWorld({ asteroids: motes }), NONE, DT, cfg({ burst: true }))
    expect(w.asteroids.find((a) => a.radius === 30)?.vel.x ?? 0).toBeGreaterThan(0) // shoved from the shatter at x=300
  })

  it('stasis freezes a charged mote in place', () => {
    const m = { pos: { x: 300, y: 300 }, vel: { x: 200, y: 0 }, radius: 30, angle: 0, spin: 0, shape: [], charge: 2 }
    const w = step(makeWorld({ asteroids: [m] }), NONE, DT, cfg({ stasis: true }))
    expect(w.asteroids[0].vel.x).toBe(0)
  })
})

describe('mote field knobs', () => {
  it('createWorld spawns config.moteCount motes at config.moteSize', () => {
    const w = createWorld(7, 800, 600, cfg({ moteCount: 3, moteSize: 30 }))
    expect(w.asteroids).toHaveLength(3)
    expect(w.asteroids.every((a) => a.radius === 30)).toBe(true)
  })

  it('the field refills up to config.moteCount at config.moteSize', () => {
    const w = step(makeWorld({ asteroids: [] }), NONE, DT, cfg({ moteCount: 4, moteSize: 36 }))
    expect(w.asteroids).toHaveLength(4)
    expect(w.asteroids.every((a) => a.radius === 36)).toBe(true)
  })

  it('moteDrift=0 spawns motionless motes', () => {
    const w = createWorld(7, 800, 600, cfg({ moteDrift: 0 }))
    expect(w.asteroids.every((a) => a.vel.x === 0 && a.vel.y === 0)).toBe(true)
  })

  it('same seed regenerates the same arena (positions/shapes preserved on resize)', () => {
    const small = createWorld(7, 800, 600, cfg({ moteSize: 30 }))
    const big = createWorld(7, 800, 600, cfg({ moteSize: 60 }))
    expect(big.asteroids[0].pos).toEqual(small.asteroids[0].pos) // resized in place, not reshuffled
    expect(big.asteroids[0].radius).toBe(60)
    expect(small.asteroids[0].radius).toBe(30)
  })
})

describe('field knobs', () => {
  it('fieldRange extends the field reach', () => {
    const far = () => [mote(690, 0)] // dist 290 from the ship at x=400
    const def = step(makeWorld({ asteroids: far() }), press({ attract: true }), DT, cfg({ gather: 'attract' }))
    expect(def.asteroids[0].charge).toBe(0) // beyond the default 260 reach → untouched
    const wide = step(makeWorld({ asteroids: far() }), press({ attract: true }), DT, cfg({ gather: 'attract', fieldRange: 360 }))
    expect(wide.asteroids[0].charge).toBeGreaterThan(0) // now in reach
    expect(wide.asteroids[0].vel.x).toBeLessThan(0) // pulled toward the ship on its left
  })

  it('fieldStrength scales the attract impulse', () => {
    const at = () => [mote(500, 0)] // dist 100, well within range
    const weak = step(makeWorld({ asteroids: at() }), press({ attract: true }), DT, cfg({ gather: 'attract', fieldStrength: 500 }))
    const strong = step(makeWorld({ asteroids: at() }), press({ attract: true }), DT, cfg({ gather: 'attract', fieldStrength: 2000 }))
    expect(Math.abs(strong.asteroids[0].vel.x)).toBeGreaterThan(Math.abs(weak.asteroids[0].vel.x))
  })

  it('chargeTime sets the vortex wind-up rate (shorter = faster)', () => {
    const both = press({ attract: true, repel: true })
    const fast = step(makeWorld(), both, DT, cfg({ chargeTime: 0.5 }))
    const slow = step(makeWorld(), both, DT, cfg({ chargeTime: 3 }))
    expect(fast.ship.charge).toBeGreaterThan(slow.ship.charge)
  })

  it('vortexSwirl sets the full-charge fling speed', () => {
    // Ship already wound to full charge; a mote due-right gets a tangential kick ∝ swirl.
    const wound = (swirl: number) => step(
      makeWorld({ ship: { pos: { x: 400, y: 300 }, vel: { x: 0, y: 0 }, angle: 0, fireCooldown: 0, thrusting: false, field: 'vortex', charge: 1, pulseT: 99 }, asteroids: [mote(500, 0)] }),
      press({ attract: true, repel: true }), DT, cfg({ vortexSwirl: swirl }),
    )
    expect(Math.abs(wound(900).asteroids[0].vel.y)).toBeGreaterThan(Math.abs(wound(300).asteroids[0].vel.y))
  })
})

describe('shatter centres (debris source)', () => {
  it('a charged shatter records its centre on the world', () => {
    const w = step(makeWorld({ asteroids: [moteAt(300, 300, 48, 2), moteAt(300, 300, 48, 0)] }), NONE, DT)
    expect(w.shatters.length).toBeGreaterThan(0)
    expect(w.shatters[0].x).toBeCloseTo(300, 0)
    expect(w.shatters[0].y).toBeCloseTo(300, 0)
  })

  it('a step with no shatter leaves the centres empty', () => {
    const w = step(makeWorld({ asteroids: [moteAt(300, 300, 48, 0)] }), NONE, DT)
    expect(w.shatters).toHaveLength(0)
  })
})

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
