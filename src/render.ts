// The pure view: draw(ctx, world) renders the world as stroked vector paths. Zero
// game logic, no allocation of game state — it only reads the world and writes the
// canvas. Everything is geometry; there are no image assets.

import { FIELD_RANGE, PULSE_RANGE } from './sim'
import type { FieldMode, World } from './entities'

const BG = '#0a0a0a'
const COPPER = '#d98a44'
const COPPER_DIM = '#b87333'
const CHARGED = '#f6c98a' // brighter copper for charged motes
const PULSE_FLASH = 0.35 // seconds the gather-pulse ripple stays visible

export function draw(ctx: CanvasRenderingContext2D, world: World): void {
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, world.width, world.height)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  drawField(ctx, world)
  drawAsteroids(ctx, world)
  drawBullets(ctx, world)
  drawShip(ctx, world)
  drawPulse(ctx, world)
}

// A gather pulse: a copper ring that collapses inward from PULSE_RANGE and fades —
// reads as a sharp inward tug.
function drawPulse(ctx: CanvasRenderingContext2D, world: World): void {
  const { ship } = world
  if (ship.pulseT >= PULSE_FLASH) return
  const k = ship.pulseT / PULSE_FLASH // 0 -> 1 across the flash
  ctx.strokeStyle = COPPER
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
  ctx.strokeStyle = ship.field === 'repel' ? COPPER_DIM : COPPER

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

  // Charge gauge: a copper arc around the ship that fills as the vortex winds up.
  if (ship.field === 'vortex') {
    ctx.lineWidth = 3
    ctx.strokeStyle = COPPER
    ctx.beginPath()
    ctx.arc(ship.pos.x, ship.pos.y, 30, -Math.PI / 2, -Math.PI / 2 + ship.charge * Math.PI * 2)
    ctx.stroke()
  }
}

function drawAsteroids(ctx: CanvasRenderingContext2D, world: World): void {
  for (const a of world.asteroids) {
    // Charged motes glow brighter/thicker — they split others (and spread via conduction).
    const charged = a.charge > 0
    ctx.strokeStyle = charged ? CHARGED : COPPER
    ctx.lineWidth = charged ? 3 : 2
    ctx.shadowBlur = charged ? 10 : 0
    ctx.shadowColor = charged ? CHARGED : 'transparent'
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
  ctx.fillStyle = COPPER
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

  ctx.strokeStyle = COPPER
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, -16) // nose (up)
  ctx.lineTo(11, 12) // back-right
  ctx.lineTo(0, 6) // tail notch
  ctx.lineTo(-11, 12) // back-left
  ctx.closePath()
  ctx.stroke()

  if (ship.thrusting) {
    ctx.strokeStyle = COPPER_DIM
    ctx.beginPath()
    ctx.moveTo(-5, 9)
    ctx.lineTo(0, 19)
    ctx.lineTo(5, 9)
    ctx.stroke()
  }

  ctx.restore()
}
