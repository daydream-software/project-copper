// Boot: wire the canvas, input, the pure sim and the pure view together through the
// fixed-timestep loop. This is the only module that talks to the DOM directly.

import './style.css'
import { createWorld, step } from './sim'
import type { Config } from './config'
import { draw } from './render'
import { createInput } from './input'
import { createLoop } from './loop'
import { resumeAudio, setMusic, setSfx, sfxPulse, sfxShatter } from './audio'
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

function checked(id: string): boolean {
  return document.querySelector<HTMLInputElement>(id)?.checked ?? false
}

function radio(name: string): string | undefined {
  return document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value
}

function readPanel(): Config {
  const palette = radio('palette')
  return {
    gather: radio('gather') === 'attract' ? 'attract' : 'pulse',
    edges: radio('edges') === 'bounce' ? 'bounce' : 'wrap',
    scatter: checked('#opt-scatter'),
    vortex: checked('#opt-vortex'),
    gun: checked('#opt-gun'),
    chargedSplit: checked('#opt-chargedSplit'),
    piercing: checked('#opt-piercing'),
    chainReaction: checked('#opt-chainReaction'),
    conduction: checked('#opt-conduction'),
    chargedRepel: checked('#opt-chargedRepel'),
    well: checked('#opt-well'),
    friction: checked('#opt-friction'),
    trails: checked('#opt-trails'),
    shake: checked('#opt-shake'),
    palette: palette === 'mono' || palette === 'neon' ? palette : 'copper',
  }
}

// Initialise from the panel's actual control state (browsers restore checkbox/radio
// state across reloads), not from defaults — otherwise a restored setting like Bounce
// would be shown but ignored. The loop reads this `let` each frame, so reassigning it
// from the panel takes effect immediately.
let config: Config = readPanel()

// Piercing / chain reaction only matter when charged motes split, so disable them
// (the panel dims the nested group) when that's off.
function syncEnablement(): void {
  const on = checked('#opt-chargedSplit')
  for (const id of ['#opt-piercing', '#opt-chainReaction']) {
    const el = document.querySelector<HTMLInputElement>(id)
    if (el !== null) el.disabled = !on
  }
}

// Read the music/SFX controls (separate from the sim Config — audio is output only).
function applyAudio(): void {
  const m = document.querySelector<HTMLInputElement>('input[name="music"]:checked')?.value
  setMusic(m === 'between' || m === 'autorun' ? m : 'off')
  setSfx(checked('#opt-sfx'))
}

// Browsers block audio until a user gesture. On the first one, resume the context AND
// (re)apply the panel's music choice — so a track the browser restored on refresh
// actually starts playing, matching what the panel shows.
const onFirstGesture = (): void => {
  resumeAudio()
  applyAudio()
}
window.addEventListener('pointerdown', onFirstGesture, { once: true })
window.addEventListener('keydown', onFirstGesture, { once: true })

// Keep the on-screen hint in sync with the active config.
function updateHint(): void {
  const parts = ['↑ thrust', '← → turn', config.gather === 'attract' ? 'hold space = attract' : 'tap space = gather pulse']
  if (config.scatter) parts.push('shift = scatter')
  if (config.vortex) parts.push('space + shift = vortex (charge, release to fling)')
  if (config.gun) parts.push('F = fire')
  const hint = document.querySelector('#hint')
  if (hint !== null) hint.textContent = parts.join(' · ')
}
updateHint()
syncEnablement()
applyAudio()

const panel = document.querySelector<HTMLElement>('#panel')
if (panel !== null) {
  panel.addEventListener('change', (e) => {
    config = readPanel()
    updateHint()
    syncEnablement()
    applyAudio()
    // Blur the control so the next space/shift goes to the game, not the checkbox.
    if (e.target instanceof HTMLElement) e.target.blur()
  })
  document.querySelector<HTMLButtonElement>('#opt-reseed')?.addEventListener('click', (e) => {
    world = createWorld(Math.floor(Math.random() * 1_000_000_000), canvas.width, canvas.height)
    if (e.target instanceof HTMLElement) e.target.blur()
  })
}

// SFX and screen-shake are driven by observable changes in the world (sim stays silent).
let prevPulseT = world.ship.pulseT
let prevCount = world.asteroids.length
let shake = 0 // current screen-shake magnitude, px

const loop = createLoop(
  (dt) => {
    // Always drain the pulse so a queued one doesn't fire on switching back to pulse;
    // only feed it to the sim when gather is in pulse mode.
    const pulse = input.consumePulse()
    world = step(world, { ...input.state, pulse: config.gather === 'pulse' ? pulse : false }, dt, config)
  },
  () => {
    draw(ctx, world, config)
    const grew = world.asteroids.length > prevCount // motes split (heuristic: count grew)
    if (world.ship.pulseT < 0.05 && prevPulseT > 0.1) sfxPulse()
    if (grew) sfxShatter()
    // Screen-shake: kick on a shatter, decay each frame, jitter the canvas element.
    if (grew && config.shake) shake = 8
    shake *= 0.85
    canvas.style.transform = config.shake && shake > 0.4
      ? `translate(${(Math.random() * 2 - 1) * shake}px, ${(Math.random() * 2 - 1) * shake}px)`
      : ''
    prevPulseT = world.ship.pulseT
    prevCount = world.asteroids.length
  },
)
loop.start()
