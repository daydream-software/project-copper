// The pure view: draw(ctx, world, config) renders the world as stroked vector paths.
// Zero game logic — it only reads the world and writes the canvas. Everything is
// geometry; there are no image assets. The palette and trails are sandbox options.

import { FIELD_RANGE, PULSE_RANGE } from './sim'
import type { Config } from './config'
import type { Vec2 } from './geometry'
import type { FieldMode, World } from './entities'

interface Palette { bg: string, stroke: string, dim: string, charged: string }

const PALETTES: Record<Config['palette'], Palette> = {
  copper: { bg: '#0a0a0a', stroke: '#d98a44', dim: '#b87333', charged: '#f6c98a' },
  mono: { bg: '#0a0a0a', stroke: '#d6d6d6', dim: '#8a8a8a', charged: '#ffffff' },
  neon: { bg: '#05060d', stroke: '#36e3ff', dim: '#2487a3', charged: '#b6f5ff' },
}

const PULSE_FLASH = 0.35 // seconds the gather-pulse ripple stays visible

// Trail particles — owned and aged by main, drawn here. The canvas is fully cleared each
// frame and dead particles are dropped, so trails leave NO residue. `TrailDot` is a dust
// grain; `Ghost` is a faded snapshot of an entity's outline (the full trail).
export interface TrailDot { x: number, y: number, life: number, max: number, r: number, a: number }
export interface Ghost { x: number, y: number, angle: number, radius: number, shape: Vec2[], ship: boolean, life: number, max: number }

// The active palette for this frame — set at the top of draw(), read by the helpers.
let active: Palette = PALETTES.copper

export function draw(ctx: CanvasRenderingContext2D, world: World, config: Config, grains: TrailDot[], ghosts: Ghost[]): void {
  active = PALETTES[config.palette]
  ctx.fillStyle = active.bg // full opaque clear — no fade residue ever
  ctx.fillRect(0, 0, world.width, world.height)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  if (config.edges === 'circle') {
    ctx.strokeStyle = active.dim
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(world.width / 2, world.height / 2, Math.min(world.width, world.height) / 2 - 1.5, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Trails (drawn under the crisp world): full = faded shape outlines; dust = grains.
  if (config.trails === 'full') drawGhosts(ctx, ghosts)
  else if (config.trails === 'dust') drawGrains(ctx, grains)

  drawField(ctx, world)
  drawAsteroids(ctx, world)
  drawBullets(ctx, world)
  drawShip(ctx, world)
  drawPulse(ctx, world)
}

// Dust grains: sparse fading dots (main decides the spawn pattern).
function drawGrains(ctx: CanvasRenderingContext2D, grains: TrailDot[]): void {
  ctx.fillStyle = active.stroke
  for (const p of grains) {
    ctx.globalAlpha = (p.life / p.max) * p.a
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

// Full trail: faded outline snapshots of each entity — its actual shape, ebbing away.
function drawGhosts(ctx: CanvasRenderingContext2D, ghosts: Ghost[]): void {
  ctx.strokeStyle = active.stroke
  ctx.lineWidth = 2
  for (const g of ghosts) {
    ctx.globalAlpha = (g.life / g.max) * 0.5
    ctx.save()
    ctx.translate(g.x, g.y)
    ctx.rotate(g.angle)
    ctx.beginPath()
    if (g.ship) {
      ctx.moveTo(0, -16)
      ctx.lineTo(11, 12)
      ctx.lineTo(0, 6)
      ctx.lineTo(-11, 12)
    } else {
      for (const [i, v] of g.shape.entries()) {
        if (i === 0) ctx.moveTo(v.x * g.radius, v.y * g.radius)
        else ctx.lineTo(v.x * g.radius, v.y * g.radius)
      }
    }
    ctx.closePath()
    ctx.stroke()
    ctx.restore()
  }
  ctx.globalAlpha = 1
}

// A gather pulse: a ring that collapses inward from PULSE_RANGE and fades — a sharp tug.
function drawPulse(ctx: CanvasRenderingContext2D, world: World): void {
  const { ship } = world
  if (ship.pulseT >= PULSE_FLASH) return
  const k = ship.pulseT / PULSE_FLASH // 0 -> 1 across the flash
  ctx.strokeStyle = active.stroke
  ctx.lineWidth = 2
  ctx.globalAlpha = 0.85 * (1 - k)
  ctx.beginPath()
  ctx.arc(ship.pos.x, ship.pos.y, (1 - k) * PULSE_RANGE, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 1
}

// Reach-ring dash pattern per mode: attract solid, repel dashed, vortex dotted.
function ringDash(mode: FieldMode): number[] {
  if (mode === 'repel') return [6, 9]
  if (mode === 'vortex') return [2, 8]
  return []
}

// The polarity field: faint tethers to the motes in reach, plus the reach ring
// (solid = attract, dashed = repel, dotted = vortex). Drawn under the motes and ship.
function drawField(ctx: CanvasRenderingContext2D, world: World): void {
  const { ship } = world
  if (ship.field === 'off') return
  ctx.strokeStyle = ship.field === 'repel' ? active.dim : active.stroke

  ctx.lineWidth = 1
  ctx.globalAlpha = 0.3
  for (const a of world.asteroids) {
    const dx = a.pos.x - ship.pos.x
    const dy = a.pos.y - ship.pos.y
    if (dx * dx + dy * dy < FIELD_RANGE * FIELD_RANGE) {
      ctx.beginPath()
      ctx.moveTo(ship.pos.x, ship.pos.y)
      ctx.lineTo(a.pos.x, a.pos.y)
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1

  // Reach ring — for the vortex it thickens as charge winds up.
  ctx.lineWidth = ship.field === 'vortex' ? 1.5 + ship.charge * 3 : 1.5
  ctx.setLineDash(ringDash(ship.field))
  ctx.beginPath()
  ctx.arc(ship.pos.x, ship.pos.y, FIELD_RANGE, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])

  // Charge gauge: an arc around the ship that fills as the vortex winds up.
  if (ship.field === 'vortex') {
    ctx.lineWidth = 3
    ctx.strokeStyle = active.stroke
    ctx.beginPath()
    ctx.arc(ship.pos.x, ship.pos.y, 30, -Math.PI / 2, -Math.PI / 2 + ship.charge * Math.PI * 2)
    ctx.stroke()
  }
}

function drawAsteroids(ctx: CanvasRenderingContext2D, world: World): void {
  for (const a of world.asteroids) {
    // Charged motes glow brighter/thicker — they split others (and spread via conduction).
    const charged = a.charge > 0
    ctx.strokeStyle = charged ? active.charged : active.stroke
    ctx.lineWidth = charged ? 3 : 2
    ctx.shadowBlur = charged ? 10 : 0
    ctx.shadowColor = charged ? active.charged : 'transparent'
    ctx.save()
    ctx.translate(a.pos.x, a.pos.y)
    ctx.rotate(a.angle)
    ctx.beginPath()
    for (const [i, v] of a.shape.entries()) {
      const x = v.x * a.radius
      const y = v.y * a.radius
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.stroke()
    ctx.restore()
  }
  ctx.shadowBlur = 0 // don't let the charged-mote glow bleed into the bullets/ship
}

function drawBullets(ctx: CanvasRenderingContext2D, world: World): void {
  ctx.fillStyle = active.stroke
  for (const b of world.bullets) {
    ctx.beginPath()
    ctx.arc(b.pos.x, b.pos.y, 2.5, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawShip(ctx: CanvasRenderingContext2D, world: World): void {
  const { ship } = world
  ctx.save()
  ctx.translate(ship.pos.x, ship.pos.y)
  ctx.rotate(ship.angle)

  ctx.strokeStyle = active.stroke
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, -16) // nose (up)
  ctx.lineTo(11, 12) // back-right
  ctx.lineTo(0, 6) // tail notch
  ctx.lineTo(-11, 12) // back-left
  ctx.closePath()
  ctx.stroke()

  if (ship.thrusting) {
    ctx.strokeStyle = active.dim
    ctx.beginPath()
    ctx.moveTo(-5, 9)
    ctx.lineTo(0, 19)
    ctx.lineTo(5, 9)
    ctx.stroke()
  }

  ctx.restore()
}
