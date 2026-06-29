// Keyboard → Input intent. The sim never touches the DOM: this module owns the
// listeners and exposes a single mutable `Input` the loop reads each frame.

import type { Input } from './entities'

export interface InputHandle {
  readonly state: Input
  dispose: () => void
}

export function createInput(target: Window): InputHandle {
  // `fire` stays in the intent but no key is bound to it — the bullet/split
  // mechanic is dormant while we feel out the polarity field.
  const state: Input = { thrust: false, turnLeft: false, turnRight: false, attract: false, repel: false, fire: false }

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
    dispose: () => {
      target.removeEventListener('keydown', onDown)
      target.removeEventListener('keyup', onUp)
    },
  }
}
