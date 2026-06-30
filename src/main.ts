// Boot: wire the canvas, input, the pure sim and the pure view together through the
// fixed-timestep loop. This is the only module that talks to the DOM directly.

import './style.css'
import { createWorld, step } from './sim'
import type { Config } from './config'
import { draw, type Ghost, type Shard, type TrailDot } from './render'
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

function checked(id: string): boolean {
  return document.querySelector<HTMLInputElement>(id)?.checked ?? false
}

function radio(name: string): string | undefined {
  return document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value
}

// A numeric control's value (range sliders), falling back if the control is missing.
function num(id: string, fallback: number): number {
  const v = document.querySelector<HTMLInputElement>(id)?.valueAsNumber
  return v !== undefined && Number.isFinite(v) ? v : fallback
}

function readPanel(): Config {
  const palette = radio('palette')
  const trails = radio('trails')
  const edges = radio('edges')
  return {
    gather: radio('gather') === 'attract' ? 'attract' : 'pulse',
    edges: edges === 'bounce' || edges === 'kill' || edges === 'circle' ? edges : 'wrap',
    scatter: checked('#opt-scatter'),
    vortex: checked('#opt-vortex'),
    fieldRange: num('#opt-fieldRange', 260),
    fieldStrength: num('#opt-fieldStrength', 1100),
    chargeTime: num('#opt-chargeTime', 1.4),
    vortexSwirl: num('#opt-vortexSwirl', 640),
    gun: checked('#opt-gun'),
    chargedSplit: checked('#opt-chargedSplit'),
    piercing: checked('#opt-piercing'),
    chainReaction: checked('#opt-chainReaction'),
    conduction: checked('#opt-conduction'),
    chargedRepel: checked('#opt-chargedRepel'),
    bipolar: checked('#opt-bipolar'),
    burst: checked('#opt-burst'),
    stasis: checked('#opt-stasis'),
    moteCount: num('#opt-moteCount', 6),
    moteSize: num('#opt-moteSize', 48),
    moteDrift: num('#opt-moteDrift', 60),
    pillarCount: num('#opt-pillarCount', 0),
    pillarSize: num('#opt-pillarSize', 40),
    well: checked('#opt-well'),
    friction: checked('#opt-friction'),
    moteCollision: checked('#opt-moteCollision'),
    flow: checked('#opt-flow'),
    trails: trails === 'dust' || trails === 'full' ? trails : 'off',
    trailMotes: checked('#opt-trailMotes'),
    shake: checked('#opt-shake'),
    debris: checked('#opt-debris'),
    palette: palette === 'mono' || palette === 'neon' ? palette : 'copper',
  }
}

// Initialise from the panel's actual control state (browsers restore checkbox/radio
// state across reloads), not from defaults — otherwise a restored setting like Bounce
// would be shown but ignored. The loop reads this `let` each frame, so reassigning it
// from the panel takes effect immediately.
let config: Config = readPanel()

// The world is seeded from the panel's count/size/drift; keep the seed so tuning those
// knobs regenerates the *same* arena (motes resize / multiply in place, not reshuffle).
let currentSeed = readSeed()
let world: World = createWorld(currentSeed, canvas.width, canvas.height, config)

// Mote count / size / drift are world-generation knobs: changing them rebuilds the field
// (the toggles, by contrast, just take effect on the next step). Detect that here.
function genChanged(a: Config, b: Config): boolean {
  return a.moteCount !== b.moteCount || a.moteSize !== b.moteSize || a.moteDrift !== b.moteDrift
    || a.pillarCount !== b.pillarCount || a.pillarSize !== b.pillarSize
}

// Piercing / chain reaction only matter when charged motes split, so disable them
// (the panel dims the nested group) when that's off.
function disable(id: string, off: boolean): void {
  const el = document.querySelector<HTMLInputElement>(id)
  if (el !== null) el.disabled = off
}

function syncEnablement(): void {
  const split = checked('#opt-chargedSplit')
  disable('#opt-piercing', !split)
  disable('#opt-chainReaction', !split)
  disable('#opt-trailMotes', radio('trails') === 'off') // only relevant when trails are on
}

// Read the music/SFX controls (separate from the sim Config — audio is output only).
function applyAudio(): void {
  const m = document.querySelector<HTMLInputElement>('input[name="music"]:checked')?.value
  setMusic(m === 'between' || m === 'autorun' ? m : 'off')
  setSfx(checked('#opt-sfx'))
}

// In circle mode, clip the canvas itself to a circle so the arena *is* the circle
// (the rectangular corners/margins are hidden), not a circle drawn inside a rectangle.
function applyArenaShape(): void {
  if (canvas === null) return
  const circle = config.edges === 'circle'
  canvas.style.clipPath = circle ? 'circle(closest-side)' : '' // clip the canvas to a circle
  canvas.style.border = circle ? 'none' : '' // drop the rectangular frame ('' reverts to the CSS border)
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
  if (config.vortex) parts.push('space+shift = vortex (charge → fling)')
  if (config.gun) parts.push('F = fire')
  const hint = document.querySelector('#hint')
  if (hint === null) return
  // Each part is a no-wrap span (carrying its own leading separator) with a breakable space
  // between, so a line only ever wraps *between* hints — never mid-detail.
  const nodes: Node[] = []
  for (const [i, p] of parts.entries()) {
    if (i > 0) nodes.push(document.createTextNode(' '))
    const span = document.createElement('span')
    span.className = 'seg'
    span.textContent = (i > 0 ? '· ' : '') + p
    nodes.push(span)
  }
  hint.replaceChildren(...nodes)
}
updateHint()
syncEnablement()
applyAudio()
applyArenaShape()

// Live-update each slider's value readout (the <output> next to it) as it moves.
for (const r of document.querySelectorAll<HTMLInputElement>('#panel input[type="range"]')) {
  const out = r.nextElementSibling
  const sync = (): void => { if (out instanceof HTMLOutputElement) out.textContent = r.value }
  r.addEventListener('input', sync)
  sync()
}

const panel = document.querySelector<HTMLElement>('#panel')
if (panel !== null) {
  panel.addEventListener('change', (e) => {
    const prev = config
    config = readPanel()
    // Regenerate the field (same seed → same arena) when a generation knob changed.
    if (genChanged(prev, config)) world = createWorld(currentSeed, canvas.width, canvas.height, config)
    updateHint()
    syncEnablement()
    applyAudio()
    applyArenaShape()
    // Blur the control so the next space/shift goes to the game, not the checkbox.
    if (e.target instanceof HTMLElement) e.target.blur()
  })
  document.querySelector<HTMLButtonElement>('#opt-reseed')?.addEventListener('click', (e) => {
    currentSeed = Math.floor(Math.random() * 1_000_000_000)
    world = createWorld(currentSeed, canvas.width, canvas.height, config)
    if (e.target instanceof HTMLElement) e.target.blur()
  })
}

// SFX, screen-shake and trail particles are driven by the world each frame (the sim
// itself stays silent and trail-free — these are view concerns).
let prevPulseT = world.ship.pulseT
let prevCount = world.asteroids.length
let shake = 0 // current screen-shake magnitude, px
// Trails as particles that are fully dropped when they die → no residue ever. Dust =
// grains (dots); full = ghosts (faded snapshots of each entity's outline).
let grains: TrailDot[] = []
let ghosts: Ghost[] = []
const GRAIN_MAX = 1200
const GHOST_LIFE = 28
const GHOST_MAX = 1800

// Debris shards: spawned per fixed step from world.shatters (so a shatter in a caught-up
// sub-step is never missed), then moved + faded per render frame. The drawn record is a
// view-only Shard; main carries velocity (px/frame) on a local superset so draw() still
// takes a plain Shard[].
type LiveShard = Shard & { vx: number, vy: number }
let shards: LiveShard[] = []
const SHARD_MAX = 600

// Spawn a burst of shards at a shatter centre — a few segments flying out radially.
function spawnShards(x: number, y: number): void {
  const n = 5 + Math.floor(Math.random() * 3) // 5–7 per shatter
  for (let i = 0; i < n; i += 1) {
    const a = Math.random() * Math.PI * 2
    const sp = 1.5 + Math.random() * 3.5 // px/frame
    const life = 20 + Math.floor(Math.random() * 10)
    shards.push({ x, y, angle: a, len: 5 + Math.random() * 7, life, max: life, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp })
  }
}

function stepShards(): void {
  for (const s of shards) {
    s.x += s.vx
    s.y += s.vy
    s.vx *= 0.9 // ease out so shards decelerate as they fade
    s.vy *= 0.9
    s.life -= 1
  }
  shards = shards.filter((s) => s.life > 0)
  if (shards.length > SHARD_MAX) shards = shards.slice(-SHARD_MAX)
}

// Drop a dust grain near a point: small, jittered, faint, short-lived.
function dropGrain(x: number, y: number): void {
  if (Math.random() > 0.55) return
  grains.push({ x: x + (Math.random() * 2 - 1) * 4, y: y + (Math.random() * 2 - 1) * 4, life: 14, max: 14, r: 1, a: 0.45 })
}

function spawnTrail(): void {
  if (config.trails === 'dust') {
    dropGrain(world.ship.pos.x, world.ship.pos.y)
    if (config.trailMotes) for (const m of world.asteroids) dropGrain(m.pos.x, m.pos.y)
  } else if (config.trails === 'full') {
    const s = world.ship
    ghosts.push({ x: s.pos.x, y: s.pos.y, angle: s.angle, radius: 0, shape: [], ship: true, life: GHOST_LIFE, max: GHOST_LIFE })
    if (config.trailMotes) {
      for (const m of world.asteroids) {
        ghosts.push({ x: m.pos.x, y: m.pos.y, angle: m.angle, radius: m.radius, shape: m.shape, ship: false, life: GHOST_LIFE, max: GHOST_LIFE })
      }
    }
  }
}

function stepTrail(): void {
  spawnTrail()
  for (const p of grains) p.life -= 1
  grains = grains.filter((p) => p.life > 0)
  if (grains.length > GRAIN_MAX) grains = grains.slice(-GRAIN_MAX)
  for (const g of ghosts) g.life -= 1
  ghosts = ghosts.filter((g) => g.life > 0)
  if (ghosts.length > GHOST_MAX) ghosts = ghosts.slice(-GHOST_MAX)
}

const loop = createLoop(
  (dt) => {
    // Always drain the pulse so a queued one doesn't fire on switching back to pulse;
    // only feed it to the sim when gather is in pulse mode.
    const pulse = input.consumePulse()
    world = step(world, { ...input.state, pulse: config.gather === 'pulse' ? pulse : false }, dt, config)
    // Spawn debris here (per fixed step), not in render: a shatter in a caught-up sub-step
    // is otherwise overwritten before the next draw and its debris would be lost.
    if (config.debris) for (const c of world.shatters) spawnShards(c.x, c.y)
  },
  () => {
    stepTrail()
    stepShards()
    draw(ctx, world, config, grains, ghosts, shards)
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
