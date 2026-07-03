// Touch → Input intent for coarse-pointer devices (phones/tablets). The keyboard path
// (input.ts) is untouched; this adds a left-thumb *floating* joystick (steer + thrust)
// and right-thumb action buttons (gather / scatter — hold both = vortex, exactly like
// space + shift). The sim never sees touch: this reports a stick vector, the two buttons'
// held state, and a one-shot gather pulse. main.ts folds them into the same Input the
// keyboard produces, so sim.ts and its determinism / seed / tests stay exactly as they are.
//
// Everything drawn here is a CSS circle / rounded outline themed from the palette vars —
// geometry, not assets, matching the copper-stroked look.

export interface TouchStick {
  /** A finger is on the joystick this frame. */
  active: boolean
  /** Push magnitude, 0 at the centre → 1 at the rim. */
  mag: number
  /** Push direction in screen space (dx right, dy down), each already ×mag — so (dx, dy)
   *  is the unit push scaled by mag, ready to convert to a heading. */
  dx: number
  dy: number
}

export interface TouchHandle {
  readonly stick: TouchStick
  /** Held state of the two action buttons (attract = gather key, repel = scatter). */
  readonly buttons: { attract: boolean, repel: boolean }
  /** True once per fresh gather tap (suppressed while scatter is held — that's a vortex,
   *  not a pulse), then clears. Drained once per fixed step, like input.consumePulse(). */
  consumePulse: () => boolean
  dispose: () => void
}

const JOY_MAX = 56 // px the thumb travels from the base centre at full push

export function createTouch(host: HTMLElement = document.body): TouchHandle {
  const stick: TouchStick = { active: false, mag: 0, dx: 0, dy: 0 }
  const buttons = { attract: false, repel: false }
  let pendingPulse = false

  // --- DOM (built here so index.html stays desktop-only; created only on touch) ---
  const root = document.createElement('div')
  root.className = 'touch-controls'

  const zone = document.createElement('div')
  zone.className = 'touch-joy-zone'

  const joy = document.createElement('div')
  joy.className = 'touch-joy'
  joy.hidden = true
  const base = document.createElement('div')
  base.className = 'touch-joy-base'
  const thumb = document.createElement('div')
  thumb.className = 'touch-joy-thumb'
  joy.append(base, thumb)

  const actions = document.createElement('div')
  actions.className = 'touch-actions'
  const scatter = document.createElement('button')
  scatter.className = 'touch-btn'
  scatter.type = 'button'
  scatter.textContent = 'scatter'
  const gather = document.createElement('button')
  gather.className = 'touch-btn'
  gather.type = 'button'
  gather.textContent = 'gather'
  actions.append(scatter, gather) // gather sits lowest — the primary, easiest-reach button

  root.append(zone, joy, actions)
  host.append(root)

  // --- Joystick: floating — the base springs to wherever the left zone is first touched,
  // the thumb tracks the finger (clamped to JOY_MAX), both vanish on release. ---
  let joyId: number | null = null
  let originX = 0
  let originY = 0

  const clearStick = (): void => {
    stick.active = false
    stick.mag = 0
    stick.dx = 0
    stick.dy = 0
  }

  const onZoneDown = (e: PointerEvent): void => {
    if (joyId !== null) return // one finger owns the stick
    joyId = e.pointerId
    zone.setPointerCapture(e.pointerId)
    originX = e.clientX
    originY = e.clientY
    joy.style.left = `${originX}px`
    joy.style.top = `${originY}px`
    joy.hidden = false
    thumb.style.transform = 'translate(0px, 0px)'
    stick.active = true
    stick.mag = 0
    stick.dx = 0
    stick.dy = 0
    e.preventDefault()
  }

  const onZoneMove = (e: PointerEvent): void => {
    if (e.pointerId !== joyId) return
    let dx = e.clientX - originX
    let dy = e.clientY - originY
    const d = Math.hypot(dx, dy)
    const clamped = Math.min(d, JOY_MAX)
    if (d > 0) {
      dx = (dx / d) * clamped
      dy = (dy / d) * clamped
    }
    thumb.style.transform = `translate(${dx}px, ${dy}px)`
    stick.dx = dx / JOY_MAX
    stick.dy = dy / JOY_MAX
    stick.mag = clamped / JOY_MAX
    e.preventDefault()
  }

  const onZoneUp = (e: PointerEvent): void => {
    if (e.pointerId !== joyId) return
    joyId = null
    joy.hidden = true
    clearStick()
  }

  zone.addEventListener('pointerdown', onZoneDown)
  zone.addEventListener('pointermove', onZoneMove)
  zone.addEventListener('pointerup', onZoneUp)
  zone.addEventListener('pointercancel', onZoneUp)

  // --- Action buttons: press = hold, release = let go. A gather press queues a pulse
  // only when scatter isn't already held (holding both is a vortex, not a stray pulse) —
  // mirroring the keyboard's space-with-shift rule in input.ts. ---
  const press = (which: 'gather' | 'scatter') => (e: PointerEvent): void => {
    if (which === 'gather') {
      if (!buttons.repel) pendingPulse = true
      buttons.attract = true
    } else {
      buttons.repel = true
    }
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault() // no synthetic click, no focus stealing, no double-tap zoom
  }
  const release = (which: 'gather' | 'scatter') => (): void => {
    if (which === 'gather') buttons.attract = false
    else buttons.repel = false
  }
  gather.addEventListener('pointerdown', press('gather'))
  gather.addEventListener('pointerup', release('gather'))
  gather.addEventListener('pointercancel', release('gather'))
  scatter.addEventListener('pointerdown', press('scatter'))
  scatter.addEventListener('pointerup', release('scatter'))
  scatter.addEventListener('pointercancel', release('scatter'))

  return {
    stick,
    buttons,
    consumePulse: (): boolean => {
      const p = pendingPulse
      pendingPulse = false
      return p
    },
    dispose: (): void => {
      root.remove() // listeners are on the removed nodes, so they go with them
    },
  }
}
