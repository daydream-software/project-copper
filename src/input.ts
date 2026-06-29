// Keyboard → Input intent. The sim never touches the DOM: this module owns the
// listeners and exposes a single mutable `Input` the loop reads each frame.
//
// Gather is a discrete PULSE: tapping the gather key queues one pulse (auto-repeat is
// ignored, so holding the key doesn't machine-gun it). The loop drains it via
// consumePulse() so the impulse lands on exactly one fixed step. Holding gather *with*
// scatter is the vortex, so a pulse is suppressed when scatter is already held.

import type { Input } from './entities'

export interface InputHandle {
  readonly state: Input
  /** True once after each fresh gather-key press, then clears. Call once per step. */
  consumePulse: () => boolean
  dispose: () => void
}

export function createInput(target: Window): InputHandle {
  // `fire` stays in the intent but no key is bound to it — the bullet/split mechanic
  // is dormant. `pulse` is injected per step by the loop via consumePulse(), not here.
  const state: Input = { thrust: false, turnLeft: false, turnRight: false, attract: false, repel: false, pulse: false, fire: false }
  let pendingPulse = false

  const apply = (e: KeyboardEvent, down: boolean): void => {
    switch (e.key) {
      case 'ArrowUp':
      case 'w':
        state.thrust = down
        break
      case 'ArrowLeft':
        state.turnLeft = down
        break
      case 'ArrowRight':
        state.turnRight = down
        break
      case ' ':
        if (down && !e.repeat && !state.repel) pendingPulse = true
        state.attract = down
        break
      case 'Shift':
        state.repel = down
        break
      default:
        return
    }
    e.preventDefault()
  }

  const onDown = (e: KeyboardEvent): void => {
    apply(e, true)
  }
  const onUp = (e: KeyboardEvent): void => {
    apply(e, false)
  }
  target.addEventListener('keydown', onDown)
  target.addEventListener('keyup', onUp)

  return {
    state,
    consumePulse: () => {
      const p = pendingPulse
      pendingPulse = false
      return p
    },
    dispose: () => {
      target.removeEventListener('keydown', onDown)
      target.removeEventListener('keyup', onUp)
    },
  }
}
