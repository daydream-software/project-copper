// A small seeded PRNG (mulberry32). PURE and deterministic: a given seed always
// yields the same sequence — so an arena (seeded asteroid field) is reproducible
// and the sim is unit-testable.
//
// The state is a single 32-bit integer carried in the `Rng` object. It is
// SERIALISABLE: store `rng.s` in the world, and `makeRng(storedState)` resumes the
// exact same stream. The `Rng` is mutable for ergonomics (each draw advances `s`);
// callers keep the sim pure by capturing the final `s` back into the world.

export interface Rng {
  /** Current 32-bit state. Persist this; pass it to makeRng to resume. */
  s: number
}

/** Build an Rng from a seed (or a previously stored state). */
export function makeRng(seedOrState: number): Rng {
  return { s: seedOrState | 0 }
}

/** Next float in [0, 1). Advances the state. */
export function random(r: Rng): number {
  // eslint-disable-next-line no-param-reassign -- Rng is a mutable cursor by design: random() advances r.s; callers capture the state back into the immutable world (see header).
  r.s = (r.s + 0x6d2b79f5) | 0
  let t = Math.imul(r.s ^ (r.s >>> 15), 1 | r.s)
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Integer in [0, maxExclusive). */
export function int(r: Rng, maxExclusive: number): number {
  return Math.floor(random(r) * maxExclusive)
}

/** Integer in [min, maxInclusive]. */
export function range(r: Rng, min: number, maxInclusive: number): number {
  return min + int(r, maxInclusive - min + 1)
}
