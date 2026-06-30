// A short seed that *is* the sandbox settings. Each setting is one digit in a mixed-radix
// number — a boolean is base 2, an option is its index, a slider is its step number — so the
// whole Config packs into a single big integer rendered in base36 (a ~14-char seed). Tiny,
// order-stable, and self-bounding: every digit is taken modulo its radix on the way out, so
// any string of base36 chars decodes to a valid Config rather than corrupting the sim. The
// leading version char lets a format change reject old seeds cleanly. Audio settings live
// outside Config, and the mote layout is the separate Reseed — neither is in the seed.

import { DEFAULT_CONFIG, type Config } from './config'

const SEED_VERSION = '1'

export type Field =
  | { key: keyof Config, kind: 'bool' }
  | { key: keyof Config, kind: 'enum', options: readonly string[] }
  | { key: keyof Config, kind: 'num', min: number, step: number, count: number }

// Fixed order — encode and decode both walk it; appending a field needs a version bump.
// `count` is the number of distinct slider values: (max − min) / step + 1. Exported so a
// test can assert these match the actual slider ranges in index.html (they must not drift).
export const SCHEMA: readonly Field[] = [
  { key: 'gather', kind: 'enum', options: ['pulse', 'attract'] },
  { key: 'edges', kind: 'enum', options: ['wrap', 'bounce', 'kill', 'circle'] },
  { key: 'scatter', kind: 'bool' },
  { key: 'vortex', kind: 'bool' },
  { key: 'fieldRange', kind: 'num', min: 120, step: 10, count: 31 },
  { key: 'fieldStrength', kind: 'num', min: 200, step: 50, count: 45 },
  { key: 'chargeTime', kind: 'num', min: 0.3, step: 0.1, count: 38 },
  { key: 'vortexSwirl', kind: 'num', min: 200, step: 20, count: 46 },
  { key: 'gun', kind: 'bool' },
  { key: 'chargedSplit', kind: 'bool' },
  { key: 'piercing', kind: 'bool' },
  { key: 'chainReaction', kind: 'bool' },
  { key: 'conduction', kind: 'bool' },
  { key: 'chargedRepel', kind: 'bool' },
  { key: 'bipolar', kind: 'bool' },
  { key: 'burst', kind: 'bool' },
  { key: 'stasis', kind: 'bool' },
  { key: 'moteCount', kind: 'num', min: 1, step: 1, count: 24 },
  { key: 'moteSize', kind: 'num', min: 20, step: 2, count: 31 },
  { key: 'moteDrift', kind: 'num', min: 0, step: 10, count: 17 },
  { key: 'well', kind: 'bool' },
  { key: 'friction', kind: 'bool' },
  { key: 'moteCollision', kind: 'bool' },
  { key: 'flow', kind: 'bool' },
  { key: 'trails', kind: 'enum', options: ['off', 'dust', 'full'] },
  { key: 'trailMotes', kind: 'bool' },
  { key: 'shake', kind: 'bool' },
  { key: 'debris', kind: 'bool' },
  { key: 'pillarCount', kind: 'num', min: 0, step: 1, count: 7 },
  { key: 'pillarSize', kind: 'num', min: 24, step: 2, count: 29 },
  { key: 'palette', kind: 'enum', options: ['copper', 'mono', 'neon'] },
]

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

// How many distinct values this field's digit can take.
function radix(field: Field): number {
  if (field.kind === 'bool') return 2
  if (field.kind === 'enum') return field.options.length
  return field.count
}

// The field's current value → its digit (always in [0, radix)).
function digitOf(field: Field, config: Config): number {
  const v = config[field.key]
  if (field.kind === 'bool') return typeof v === 'boolean' && v ? 1 : 0
  if (field.kind === 'enum') return typeof v === 'string' ? Math.max(0, field.options.indexOf(v)) : 0
  return typeof v === 'number' ? clamp(Math.round((v - field.min) / field.step), 0, field.count - 1) : 0
}

// A digit → the field's value (toFixed trims the float noise of e.g. 0.3 + 11 * 0.1).
function valueOf(field: Field, digit: number): boolean | number | string {
  if (field.kind === 'bool') return digit === 1
  if (field.kind === 'enum') return field.options[digit] ?? field.options[0]
  return Number((field.min + digit * field.step).toFixed(4))
}

/** The settings packed into a short seed string (version char + base36 mixed-radix). */
export function encodeSeed(config: Config): string {
  let acc = 0n
  let mult = 1n
  for (const field of SCHEMA) {
    acc += BigInt(digitOf(field, config)) * mult
    mult *= BigInt(radix(field))
  }
  return SEED_VERSION + acc.toString(36)
}

/** A seed back into a full Config, or null if it's the wrong version / not base36. Every
 * digit is bounded by its radix, so a decodable seed always yields a valid Config. */
export function decodeSeed(seed: string): Config | null {
  const s = seed.trim()
  if (!s.startsWith(SEED_VERSION)) return null
  const body = s.slice(SEED_VERSION.length)
  if (!/^[0-9a-z]*$/u.test(body)) return null
  let acc = 0n
  for (const ch of body) acc = acc * 36n + BigInt(Number.parseInt(ch, 36))
  const out: Record<string, unknown> = {}
  for (const field of SCHEMA) {
    const r = BigInt(radix(field))
    out[field.key] = valueOf(field, Number(acc % r))
    acc /= r
  }
  return { ...DEFAULT_CONFIG, ...out }
}
