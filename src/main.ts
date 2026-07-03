// Boot: wire the canvas, input, the pure sim and the pure view together through the
// fixed-timestep loop. This is the only module that talks to the DOM directly.

import './style.css'
import { createWorld, step } from './sim'
import { decodeSeed, encodeSeed } from './seed'
import type { Config } from './config'
import { draw, paletteFor, type Ghost, type Shard, type TrailDot } from './render'
import { createInput } from './input'
import { createTouch, type TouchHandle } from './touch'
import { createLoop } from './loop'
import { resumeAudio, setMusic, setMusicVolume, setSfxVolume, sfxPulse, sfxShatter } from './audio'
import type { Input, World } from './entities'

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

// On a coarse pointer (phone/tablet) there's no keyboard, so the game is unplayable
// without touch controls. Add a floating joystick + action buttons (touch.ts), and turn
// the always-open sidebar into a drawer behind a ⚙ toggle so the canvas gets the screen.
// Desktop (a fine pointer) is left byte-for-byte unchanged: none of this runs.
const isTouch = window.matchMedia('(pointer: coarse)').matches
const touch = isTouch ? createTouch() : null
if (isTouch) {
  document.body.classList.add('touch')
  // A long-press on the bare play area shouldn't pop the browser's context menu mid-game.
  canvas.addEventListener('contextmenu', (e) => { e.preventDefault() })
  const toggle = document.createElement('button')
  toggle.className = 'panel-toggle'
  toggle.type = 'button'
  toggle.setAttribute('aria-label', 'settings')
  toggle.textContent = '⚙' // ⚙
  const scrim = document.createElement('div')
  scrim.className = 'panel-scrim'
  toggle.addEventListener('click', () => { document.body.classList.toggle('panel-open') })
  scrim.addEventListener('click', () => { document.body.classList.remove('panel-open') })
  document.body.append(scrim, toggle)
}

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

// A colour input's #rrggbb value, falling back if the control is missing.
function colour(id: string, fallback: string): string {
  return document.querySelector<HTMLInputElement>(id)?.value ?? fallback
}

// A centre/ship anchor radio's value (anything but 'ship' → the default 'centre').
function anchorOf(name: string): 'centre' | 'ship' {
  return radio(name) === 'ship' ? 'ship' : 'centre'
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
    wellAnchor: anchorOf('wellAnchor'),
    friction: checked('#opt-friction'),
    moteCollision: checked('#opt-moteCollision'),
    flow: checked('#opt-flow'),
    flowAnchor: anchorOf('flowAnchor'),
    trails: trails === 'dust' || trails === 'full' ? trails : 'off',
    trailMotes: checked('#opt-trailMotes'),
    shake: checked('#opt-shake'),
    debris: checked('#opt-debris'),
    palette: palette === 'mono' || palette === 'neon' ? palette : 'copper',
    customPalette: checked('#opt-customPalette'),
    customBg: colour('#opt-customBg', '#0a0a0a'),
    customFront: colour('#opt-customFront', '#d98a44'),
  }
}

// The inverse of readPanel: push a Config onto the controls (used when a seed is loaded).
// Sets values directly without firing change events, so the panel listener isn't re-entered.
function writePanel(c: Config): void {
  const setRadio = (name: string, value: string): void => {
    const el = document.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`)
    if (el !== null) el.checked = true
  }
  const setCheck = (id: string, on: boolean): void => {
    const el = document.querySelector<HTMLInputElement>(id)
    if (el !== null) el.checked = on
  }
  const setRange = (id: string, v: number): void => {
    const el = document.querySelector<HTMLInputElement>(id)
    if (el === null) return
    el.value = String(v)
    if (el.nextElementSibling instanceof HTMLOutputElement) el.nextElementSibling.textContent = String(v)
  }
  setRadio('gather', c.gather)
  setRadio('edges', c.edges)
  setRadio('palette', c.palette)
  setRadio('trails', c.trails)
  setRadio('wellAnchor', c.wellAnchor)
  setRadio('flowAnchor', c.flowAnchor)
  const checks: Array<[string, boolean]> = [
    ['#opt-scatter', c.scatter], ['#opt-vortex', c.vortex], ['#opt-gun', c.gun],
    ['#opt-chargedSplit', c.chargedSplit], ['#opt-piercing', c.piercing], ['#opt-chainReaction', c.chainReaction],
    ['#opt-conduction', c.conduction], ['#opt-chargedRepel', c.chargedRepel], ['#opt-bipolar', c.bipolar],
    ['#opt-burst', c.burst], ['#opt-stasis', c.stasis], ['#opt-well', c.well], ['#opt-friction', c.friction],
    ['#opt-moteCollision', c.moteCollision], ['#opt-flow', c.flow], ['#opt-trailMotes', c.trailMotes],
    ['#opt-shake', c.shake], ['#opt-debris', c.debris], ['#opt-customPalette', c.customPalette],
  ]
  for (const [id, on] of checks) setCheck(id, on)
  for (const [id, v] of [['#opt-customBg', c.customBg], ['#opt-customFront', c.customFront]] as Array<[string, string]>) {
    const el = document.querySelector<HTMLInputElement>(id)
    if (el !== null) el.value = v
  }
  const ranges: Array<[string, number]> = [
    ['#opt-fieldRange', c.fieldRange], ['#opt-fieldStrength', c.fieldStrength], ['#opt-chargeTime', c.chargeTime],
    ['#opt-vortexSwirl', c.vortexSwirl], ['#opt-moteCount', c.moteCount], ['#opt-moteSize', c.moteSize],
    ['#opt-moteDrift', c.moteDrift], ['#opt-pillarCount', c.pillarCount], ['#opt-pillarSize', c.pillarSize],
  ]
  for (const [id, v] of ranges) setRange(id, v)
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

// Disable every control matching a selector (e.g. a whole radio group) — the `.sub` dims via CSS.
function disableAll(selector: string, off: boolean): void {
  for (const el of document.querySelectorAll<HTMLInputElement>(selector)) el.disabled = off
}

function syncEnablement(): void {
  const split = checked('#opt-chargedSplit')
  disable('#opt-piercing', !split)
  disable('#opt-chainReaction', !split)
  disable('#opt-trailMotes', radio('trails') === 'off') // only relevant when trails are on
  disableAll('input[name="wellAnchor"]', !checked('#opt-well')) // anchor only matters when the well is on
  disableAll('input[name="flowAnchor"]', !checked('#opt-flow'))
  const custom = checked('#opt-customPalette')
  disable('#opt-customBg', !custom) // colour pickers only matter with the custom palette on
  disable('#opt-customFront', !custom)
  touch?.setGunButton(checked('#opt-gun')) // the mobile FIRE button follows the Gun toggle
}

// Read the music/SFX controls (separate from the sim Config — audio is output only, so it's
// not in the seed). Track + two volume sliders.
function applyAudio(): void {
  const m = document.querySelector<HTMLInputElement>('input[name="music"]:checked')?.value
  setMusic(m === 'between' || m === 'autorun' ? m : 'off')
  setMusicVolume(num('#opt-musicVol', 0.5))
  setSfxVolume(num('#opt-sfxVol', 0.8))
}

// The FPS counter is UI-only — like audio, it's deliberately kept out of Config and the
// seed (so toggling it never changes the seed string). It's a DOM overlay, not canvas
// text, so the canvas stays pure geometry. The Display checkbox shows/hides it; the loop
// feeds it frame timings via updateFps().
const fpsEl = document.querySelector<HTMLDivElement>('#fps')
let showFps = false
let fpsLast = 0 // performance.now() of the previous render frame, ms (0 = unseeded)
let fpsEma = 0 // exponential moving average of the frame interval, ms (0 = unseeded)
let fpsShownAt = 0 // last time the readout text was rewritten, ms

function applyFps(): void {
  showFps = checked('#opt-fps')
  if (fpsEl !== null) fpsEl.hidden = !showFps
  fpsLast = 0 // re-seed timing on toggle so the gap while it was off isn't counted as a frame
}

// Smooth the frame interval (EMA) and refresh the readout. Throttled to ~4×/s: a per-frame
// rewrite would flicker and force needless reflow, while the EMA keeps the number stable.
function updateFps(): void {
  const now = performance.now()
  if (fpsLast > 0) {
    const dt = now - fpsLast
    fpsEma = fpsEma === 0 ? dt : fpsEma + (dt - fpsEma) * 0.1
  }
  fpsLast = now
  if (fpsEl !== null && fpsEma > 0 && now - fpsShownAt > 250) {
    fpsShownAt = now
    fpsEl.textContent = `${Math.round(1000 / fpsEma)} fps`
  }
}

// Theme the DOM UI to the active palette: push the canvas palette's colours onto the CSS
// variables the panel / hint / page background read, so switching palette recolours the
// whole app, not just the drawn world.
function applyPalette(): void {
  const p = paletteFor(config) // custom colours or the named preset
  const root = document.documentElement.style
  root.setProperty('--accent', p.stroke)
  root.setProperty('--dim', p.dim)
  root.setProperty('--bg', p.bg)
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
applyFps()
applyArenaShape()
applyPalette()

// Live-update each slider's value readout (the <output> next to it) as it moves.
for (const r of document.querySelectorAll<HTMLInputElement>('#panel input[type="range"]')) {
  const out = r.nextElementSibling
  const sync = (): void => { if (out instanceof HTMLOutputElement) out.textContent = r.value }
  r.addEventListener('input', sync)
  sync()
}

// Volume sliders take effect live as they move (audio is output-only — not in readPanel/seed).
for (const v of document.querySelectorAll<HTMLInputElement>('#opt-musicVol, #opt-sfxVol')) {
  v.addEventListener('input', applyAudio)
}

// The seed field *is* the settings: it shows the current config encoded, and editing it
// loads those settings. The mote layout (Reseed/Shuffle) is separate and not in the seed.
const seedInput = document.querySelector<HTMLInputElement>('#opt-seed')
function refreshSeed(): void {
  if (seedInput !== null) seedInput.value = encodeSeed(config)
}
refreshSeed()

const panel = document.querySelector<HTMLElement>('#panel')
if (panel !== null) {
  panel.addEventListener('change', (e) => {
    if (e.target === seedInput) return // the seed field has its own handler below
    const prev = config
    config = readPanel()
    // Regenerate the field (same seed → same arena) when a generation knob changed.
    if (genChanged(prev, config)) world = createWorld(currentSeed, canvas.width, canvas.height, config)
    refreshSeed() // settings changed → reflect them in the seed
    updateHint()
    syncEnablement()
    applyAudio()
    applyFps()
    applyArenaShape()
    applyPalette()
    // Blur the control so the next space/shift goes to the game, not the checkbox.
    if (e.target instanceof HTMLElement) e.target.blur()
  })
  seedInput?.addEventListener('change', () => {
    const decoded = decodeSeed(seedInput.value)
    if (decoded === null) { refreshSeed(); return } // unreadable → restore the current seed
    const prev = config
    writePanel(decoded)
    config = readPanel()
    // Rebuild the field only if a generation knob changed — a toggle-only seed keeps the
    // live arena (same currentSeed) instead of snapping motes back to their start.
    if (genChanged(prev, config)) world = createWorld(currentSeed, canvas.width, canvas.height, config)
    refreshSeed() // normalise the field to the applied settings
    updateHint()
    syncEnablement()
    applyArenaShape()
    applyPalette()
    seedInput.blur()
  })
  document.querySelector<HTMLButtonElement>('#opt-reseed')?.addEventListener('click', (e) => {
    currentSeed = Math.floor(Math.random() * 1_000_000_000)
    world = createWorld(currentSeed, canvas.width, canvas.height, config)
    if (e.target instanceof HTMLElement) e.target.blur()
  })
  // Live-recolour as the custom colour pickers move (they fire 'input' during the drag; the
  // panel listener above only catches 'change' on commit).
  const onColour = (): void => {
    config = readPanel()
    applyPalette()
    refreshSeed()
  }
  document.querySelector<HTMLInputElement>('#opt-customBg')?.addEventListener('input', onColour)
  document.querySelector<HTMLInputElement>('#opt-customFront')?.addEventListener('input', onColour)
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

// Drop dust over an entity's footprint: faint short-lived grains scattered across a disc of
// the given radius, with more grains for bigger motes — so the dust trail is proportional to
// the mote, not a single dot at its centre. (sqrt → grains spread evenly over the disc.)
function dropGrain(x: number, y: number, radius: number): void {
  const n = Math.max(1, Math.round(radius / 16)) // grain count scales with the mote
  for (let i = 0; i < n; i += 1) {
    const a = Math.random() * Math.PI * 2
    const d = Math.sqrt(Math.random()) * radius
    grains.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, life: 14, max: 14, r: 1, a: 0.4 })
  }
}

function spawnTrail(): void {
  if (config.trails === 'dust') {
    dropGrain(world.ship.pos.x, world.ship.pos.y, 14) // the ship's footprint is small + fixed
    if (config.trailMotes) for (const m of world.asteroids) dropGrain(m.pos.x, m.pos.y, m.radius)
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

// The joystick's steer/thrust contribution: it turns the push direction into a target
// heading (0 = up), compares it to the ship's angle, and nudges turnLeft/turnRight toward
// it; a firm push also thrusts. Below a small deadzone the stick contributes nothing.
function stickTurn(t: TouchHandle | null, shipAngle: number): { thrust: boolean, left: boolean, right: boolean } {
  if (t === null || !t.stick.active || t.stick.mag <= 0.18) return { thrust: false, left: false, right: false }
  const target = Math.atan2(t.stick.dx, -t.stick.dy) // stick push → heading (0 = up)
  const diff = Math.atan2(Math.sin(target - shipAngle), Math.cos(target - shipAngle)) // shortest signed turn
  return { thrust: t.stick.mag > 0.35, left: diff < -0.12, right: diff > 0.12 }
}

// Fold the optional touch controls into the keyboard intent for one step: the joystick
// ORs into thrust/turn, the buttons into attract/repel (hold both = vortex, like space +
// shift). No sim change — same Input shape, so sim.ts stays untouched and deterministic.
function mergeInput(kb: Input, t: TouchHandle | null, shipAngle: number): Input {
  const s = stickTurn(t, shipAngle)
  const btn = t?.buttons ?? { attract: false, repel: false, fire: false }
  return {
    thrust: kb.thrust || s.thrust,
    turnLeft: kb.turnLeft || s.left,
    turnRight: kb.turnRight || s.right,
    attract: kb.attract || btn.attract,
    repel: kb.repel || btn.repel,
    fire: kb.fire || btn.fire,
    pulse: false,
  }
}

const loop = createLoop(
  (dt) => {
    const merged = mergeInput(input.state, touch, world.ship.angle)
    // Always drain both pulse sources (no short-circuit) so a queued one doesn't linger
    // and fire later; only feed it to the sim when gather is in pulse mode.
    const kbPulse = input.consumePulse()
    const touchPulse = touch?.consumePulse() ?? false
    const pulse = kbPulse || touchPulse
    world = step(world, { ...merged, pulse: config.gather === 'pulse' ? pulse : false }, dt, config)
    // Spawn debris here (per fixed step), not in render: a shatter in a caught-up sub-step
    // is otherwise overwritten before the next draw and its debris would be lost.
    if (config.debris) for (const c of world.shatters) spawnShards(c.x, c.y)
  },
  () => {
    stepTrail()
    stepShards()
    draw(ctx, world, config, grains, ghosts, shards)
    if (showFps) updateFps() // UI-only overlay, measured per render frame (not per sim step)
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
