import { describe, expect, it } from 'vitest'
import { axisDelta, bound, outlineRadius, overlap, wrap, wrapImages } from './geometry'

// A regular octagon at a fixed magnitude (unit vertices) — a known outline for the
// shape-aware helpers, where makeShape's randomness can't give a precise threshold.
const ring = (mag: number) => [...Array(8).keys()].map((i) => {
  const a = (i / 8) * Math.PI * 2
  return { x: Math.cos(a) * mag, y: Math.sin(a) * mag }
})

describe('geometry', () => {
  it('wrap folds coordinates into [0, size)', () => {
    expect(wrap(-5, 100)).toBe(95)
    expect(wrap(105, 100)).toBe(5)
    expect(wrap(50, 100)).toBe(50)
    expect(wrap(100, 100)).toBe(0)
  })

  it('overlap is true only when circles intersect', () => {
    expect(overlap({ x: 0, y: 0 }, 5, { x: 0, y: 8 }, 4)).toBe(true) // gap 8 < 9
    expect(overlap({ x: 0, y: 0 }, 5, { x: 0, y: 8 }, 2)).toBe(false) // gap 8 > 7
  })

  it('bound wraps / bounces / kills against the rectangle', () => {
    expect(bound(105, 50, 5, 0, 0, 100, 100, 'wrap')).toEqual({ x: 5, y: 50, vx: 5, vy: 0, dead: false })
    expect(bound(105, 50, 5, 0, 0, 100, 100, 'bounce')).toEqual({ x: 95, y: 50, vx: -5, vy: 0, dead: false })
    expect(bound(105, 50, 5, 0, 0, 100, 100, 'kill').dead).toBe(true)
    expect(bound(50, 50, 5, 0, 0, 100, 100, 'kill').dead).toBe(false) // in bounds
  })

  it('bound reflects off the circle arena', () => {
    const b = bound(110, 50, 10, 0, 0, 100, 100, 'circle') // outside the r=50 circle at (50,50)
    expect(b.x).toBeLessThan(110) // pulled back onto the circle
    expect(b.vx).toBeLessThan(0) // velocity reflected inward
  })

  it('axisDelta is the minimum-image delta when wrapping', () => {
    expect(axisDelta(795, 5, 800, true)).toBe(10) // across the seam, not -790
    expect(axisDelta(795, 5, 800, false)).toBe(-790) // raw difference when not wrapping
    expect(axisDelta(300, 380, 800, true)).toBe(80) // mid-arena → unchanged
  })

  it('wrapImages draws a straddling entity on the opposite edge (seamless wrap)', () => {
    expect(wrapImages(400, 300, 30, 800, 600)).toEqual([{ x: 400, y: 300 }]) // centred → one copy
    const left = wrapImages(5, 300, 30, 800, 600) // pokes past x=0
    expect(left).toContainEqual({ x: 5, y: 300 })
    expect(left).toContainEqual({ x: 805, y: 300 }) // mirrored a full width to the right
    expect(wrapImages(5, 5, 30, 800, 600)).toHaveLength(4) // a corner straddles both axes
  })

  it('outlineRadius follows the shape, not the bounding circle', () => {
    const blob = ring(0.7) // a regular octagon at 0.7 of the radius
    expect(outlineRadius(blob, 30, 0, 1, 0)).toBeCloseTo(21) // 0.7 × 30 toward +x
    expect(outlineRadius(blob, 30, Math.PI / 3, 0, -1)).toBeCloseTo(21) // uniform → rotation-invariant
    expect(outlineRadius([], 30, 0, 1, 0)).toBe(30) // shapeless → bounding circle
  })
})
