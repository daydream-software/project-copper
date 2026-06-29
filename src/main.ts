// Boot: wire the canvas, input, the pure sim and the pure view together through the
// fixed-timestep loop. This is the only module that talks to the DOM directly.

import './style.css'
import { createWorld, step } from './sim'
import { DEFAULT_CONFIG, type Config } from './config'
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

// Sandbox config the panel mutates and the loop reads live (it reads this `let` each
// frame, so reassigning it from the panel takes effect immediately).
let config: Config = { ...DEFAULT_CONFIG }

function checked(id: string): boolean {
  return document.querySelector<HTMLInputElement>(id)?.checked ?? false
}

function readPanel(): Config {
  const gather = document.querySelector<HTMLInputElement>('input[name="gather"]:checked')?.value
  return {
    gather: gather === 'attract' ? 'attract' : 'pulse',
    scatter: checked('#opt-scatter'),
    vortex: checked('#opt-vortex'),
    gun: checked('#opt-gun'),
    chargedSplit: checked('#opt-chargedSplit'),
    piercing: checked('#opt-piercing'),
    chainReaction: checked('#opt-chainReaction'),
  }
}

const panel = document.querySelector<HTMLElement>('#panel')
if (panel !== null) {
  panel.addEventListener('change', (e) => {
    config = readPanel()
    // Blur the control so the next space/shift goes to the game, not the checkbox.
    if (e.target instanceof HTMLElement) e.target.blur()
  })
  document.querySelector<HTMLButtonElement>('#opt-reseed')?.addEventListener('click', (e) => {
    world = createWorld(Math.floor(Math.random() * 1_000_000_000), canvas.width, canvas.height)
    if (e.target instanceof HTMLElement) e.target.blur()
  })
}

const loop = createLoop(
  (dt) => {
    // Always drain the pulse so a queued one doesn't fire on switching back to pulse;
    // only feed it to the sim when gather is in pulse mode.
    const pulse = input.consumePulse()
    world = step(world, { ...input.state, pulse: config.gather === 'pulse' ? pulse : false }, dt, config)
  },
  () => {
    draw(ctx, world)
  },
)
loop.start()
