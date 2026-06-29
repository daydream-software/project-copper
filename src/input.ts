// Keyboard → Input intent. The sim never touches the DOM: this module owns the
// listeners and exposes a single mutable `Input` the loop reads each frame.

import type { Input } from './entities'

export interface InputHandle {
  readonly state: Input
  dispose: () => void
}

export function createInput(target: Window): InputHandle {
  const state: Input = { thrust: false, turnLeft: false, turnRight: false, fire: false }

  const apply = (e: KeyboardEvent, down: boolean): void => {
    switch (e.key) {
      case 'ArrowUp':
      case 'w':
        state.thrust = down
        break
      case 'ArrowLeft':
      case 'a':
        state.turnLeft = down
        break
      case 'ArrowRight':
      case 'd':
        state.turnRight = down
        break
      case ' ':
        state.fire = down
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
