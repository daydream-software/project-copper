// Shared fixtures for the sim tests (split across sim.test.ts / modes.test.ts). Not a
// *.test file itself, so it runs no tests — just the builders the specs import.

import { step } from './sim'
import { DEFAULT_CONFIG, type Config } from './config'
import type { Vec2 } from './geometry'
import type { Asteroid, Input, World } from './entities'

export const DT = 1 / 120
export const NONE: Input = { thrust: false, turnLeft: false, turnRight: false, attract: false, repel: false, pulse: false, fire: false }

export function press(over: Partial<Input>): Input {
  return { ...NONE, ...over }
}

export const cfg = (over: Partial<Config> = {}): Config => ({ ...DEFAULT_CONFIG, ...over })

// A mote (drifting polygon) for field tests; shape is irrelevant to the sim.
export const mote = (x: number, vx: number): Asteroid => ({ pos: { x, y: 300 }, vel: { x: vx, y: 0 }, radius: 30, angle: 0, spin: 0, shape: [], charge: 0 })

// A mote at a fixed spot with a given radius and charge, for collision tests.
export const moteAt = (x: number, y: number, radius: number, charge: number): Asteroid => ({ pos: { x, y }, vel: { x: 0, y: 0 }, radius, angle: 0, spin: 0, shape: [], charge })

// A regular octagon at a fixed magnitude (unit vertices) — a known outline for shape-aware
// contact tests, where makeShape's randomness can't give a precise threshold.
export const ring = (mag: number): Vec2[] => [...Array(8).keys()].map((i) => {
  const a = (i / 8) * Math.PI * 2
  return { x: Math.cos(a) * mag, y: Math.sin(a) * mag }
})

// Run the sim n fixed steps under a held input.
export function stepN(w: World, input: Input, n: number): World {
  let world = w
  for (let i = 0; i < n; i += 1) {
    world = step(world, input, DT)
  }
  return world
}

export function makeWorld(over: Partial<World> = {}): World {
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
