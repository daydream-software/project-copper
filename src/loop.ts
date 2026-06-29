// A fixed-timestep game loop. The sim advances in fixed `1/stepHz` slices via an
// accumulator, decoupled from the render rate, so behaviour is identical regardless
// of frame rate (and the sim stays deterministic — see sim.ts).

export interface Loop {
  start: () => void
  stop: () => void
}

const MAX_FRAME = 0.25 // clamp elapsed time to avoid a spiral of death after a stall

export function createLoop(step: (dt: number) => void, draw: () => void, stepHz = 120): Loop {
  const fixedDt = 1 / stepHz
  let acc = 0
  let last = 0
  let raf = 0
  let running = false

  const frame = (now: number): void => {
    if (!running) return
    const elapsed = last === 0 ? 0 : (now - last) / 1000
    last = now
    acc += Math.min(elapsed, MAX_FRAME)
    while (acc >= fixedDt) {
      step(fixedDt)
      acc -= fixedDt
    }
    draw()
    raf = requestAnimationFrame(frame)
  }

  return {
    start: (): void => {
      if (running) return
      running = true
      last = 0
      raf = requestAnimationFrame(frame)
    },
    stop: (): void => {
      running = false
      cancelAnimationFrame(raf)
    },
  }
}
