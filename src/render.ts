// The pure view: draw(ctx, world) renders the world as stroked vector paths. Zero
// game logic, no allocation of game state — it only reads the world and writes the
// canvas. Everything is geometry; there are no image assets.

import type { World } from './entities'

const BG = '#0a0a0a'
const COPPER = '#d98a44'
const COPPER_DIM = '#b87333'

export function draw(ctx: CanvasRenderingContext2D, world: World): void {
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, world.width, world.height)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  drawAsteroids(ctx, world)
  drawBullets(ctx, world)
  drawShip(ctx, world)
}

function drawAsteroids(ctx: CanvasRenderingContext2D, world: World): void {
  ctx.strokeStyle = COPPER
  ctx.lineWidth = 2
  for (const a of world.asteroids) {
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
