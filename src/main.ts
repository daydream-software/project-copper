// Boot: wire the canvas, input, the pure sim and the pure view together through the
// fixed-timestep loop. This is the only module that talks to the DOM directly.

import './style.css'
import { createWorld, step } from './sim'
import { draw } from './render'
import { createInput } from './input'
import { createLoop } from './loop'
import type { World } from './entities'

function readSeed(): number {
  const param = new URLSearchParams(window.location.search).get('seed')
  const n = param === null ? Number.NaN : Number.parseInt(param, 10)
  return Number.isFinite(n) ? n : 1
}

const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (canvas === null) throw new Error('canvas #game not found')
const ctx = canvas.getContext('2d')
if (ctx === null) throw new Error('2d context unavailable')

const input = createInput(window)
let world: World = createWorld(readSeed(), canvas.width, canvas.height)

const loop = createLoop(
  (dt) => {
    world = step(world, input.state, dt)
  },
  () => {
    draw(ctx, world)
  },
)
loop.start()
