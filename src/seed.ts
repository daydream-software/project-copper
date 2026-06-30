// A short seed that *is* the sandbox settings. Each setting is one digit in a mixed-radix
// number — a boolean is base 2, an option is its index, a slider is its step number, a colour
// its 24-bit value — so the whole Config packs into a single big integer rendered in base36.
// Self-bounding: every digit is taken modulo its radix on the way out, so any base36 string
// decodes to a valid Config rather than corrupting the sim.
//
// There is ONE format and we only ever EVOLVE it by APPENDING fields to the end of SCHEMA. A
// new field's index-0 value must be its default, so a shorter (older) seed simply reads the
// missing high digits as 0 = default — old seeds keep working with no migration. We never
// reorder fields or change a radix (that would shift every later digit). The leading tag char
// marks a Copper seed and never changes. Audio lives outside Config and the mote layout is the
// separate Reseed, so neither is in the seed.

import { DEFAULT_CONFIG, type Config } from './config'

const SEED_TAG = '1' // constant marker; the format only ever grows by appending, never bumps
const RGB = 0x1000000 // 24-bit colour space (#rrggbb)

export type Field =
  | { key: keyof Config, kind: 'bool' }
  | { key: keyof Config, kind: 'enum', options: readonly string[] }
  | { key: keyof Config, kind: 'num', min: number, step: number, count: number }
  | { key: keyof Config, kind: 'color' }

// `count` is the distinct slider values, (max − min) / step + 1; exported so a test asserts
// these match the actual slider ranges in index.html (they must not drift). APPEND ONLY.
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
  { key: 'customPalette', kind: 'bool' },
  { key: 'customBg', kind: 'color' },
  { key: 'customFront', kind: 'color' },
  { key: 'wellAnchor', kind: 'enum', options: ['centre', 'ship'] },
  { key: 'flowAnchor', kind: 'enum', options: ['centre', 'ship'] },
]

// #rrggbb ↔ 24-bit int (clamped).
function hexToInt(hex: string): number {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return Number.isFinite(n) ? Math.min(RGB - 1, Math.max(0, n)) : 0
}
function intToHex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

// How many distinct values this field's digit can take.
function radix(field: Field): number {
  if (field.kind === 'bool') return 2
  if (field.kind === 'enum') return field.options.length
  if (field.kind === 'color') return RGB
  return field.count
}

// The field's current value → its digit (always in [0, radix)).
function digitOf(field: Field, config: Config): number {
  const v = config[field.key]
  if (field.kind === 'bool') return typeof v === 'boolean' && v ? 1 : 0
  if (field.kind === 'enum') return typeof v === 'string' ? Math.max(0, field.options.indexOf(v)) : 0
  if (field.kind === 'color') return typeof v === 'string' ? hexToInt(v) : 0
  return typeof v === 'number' ? clamp(Math.round((v - field.min) / field.step), 0, field.count - 1) : 0
}

// A digit → the field's value (toFixed trims the float noise of e.g. 0.3 + 11 * 0.1).
function valueOf(field: Field, digit: number): boolean | number | string {
  if (field.kind === 'bool') return digit === 1
  if (field.kind === 'enum') return field.options[digit] ?? field.options[0]
  if (field.kind === 'color') return intToHex(digit)
  return Number((field.min + digit * field.step).toFixed(4))
}

/** The settings packed into a short seed string (tag char + base36 mixed-radix). */
export function encodeSeed(config: Config): string {
  let acc = 0n
  let mult = 1n
  for (const field of SCHEMA) {
    acc += BigInt(digitOf(field, config)) * mult
    mult *= BigInt(radix(field))
  }
  return SEED_TAG + acc.toString(36)
}

/** A seed back into a full Config, or null if it's the wrong tag / not base36. Every digit is
 * bounded by its radix, and a seed shorter than the schema reads the missing fields as their
 * defaults, so any decodable seed (old or new) yields a valid Config. */
export function decodeSeed(seed: string): Config | null {
  const s = seed.trim()
  if (!s.startsWith(SEED_TAG)) return null
  const body = s.slice(SEED_TAG.length)
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
