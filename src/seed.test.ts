import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SCHEMA, decodeSeed, encodeSeed } from './seed'
import { DEFAULT_CONFIG, type Config } from './config'
import { cfg } from './test-helpers'

// Every field set to a non-default (on-grid) value — round-tripping this proves the schema
// covers all of Config: a field missing from the schema would decode back to its default.
const ALL: Config = cfg({
  gather: 'attract', edges: 'circle', scatter: false, vortex: false,
  fieldRange: 300, fieldStrength: 1500, chargeTime: 2.5, vortexSwirl: 800,
  gun: true, chargedSplit: false, piercing: true, chainReaction: true, conduction: true,
  chargedRepel: true, bipolar: true, burst: true, stasis: true,
  moteCount: 12, moteSize: 60, moteDrift: 100,
  well: true, friction: true, moteCollision: true, flow: true,
  trails: 'full', trailMotes: false, shake: true, debris: true,
  pillarCount: 4, pillarSize: 56, palette: 'neon',
})

describe('settings seed', () => {
  it('round-trips every field through encode → decode', () => {
    expect(decodeSeed(encodeSeed(ALL))).toEqual(ALL)
  })

  it('the default config is a short seed that round-trips', () => {
    const seed = encodeSeed(DEFAULT_CONFIG)
    expect(seed.length).toBeLessThan(20) // a handful of base36 chars, not a JSON blob
    expect(decodeSeed(seed)).toEqual(DEFAULT_CONFIG)
  })

  it('rejects the wrong version or non-base36 junk', () => {
    expect(decodeSeed('9abcdef')).toBeNull() // wrong version char
    expect(decodeSeed('1 not base36 !')).toBeNull()
    expect(decodeSeed('')).toBeNull()
  })

  it('the num-field schema matches the slider ranges in index.html (no drift)', () => {
    const html = readFileSync('index.html', 'utf8')
    for (const field of SCHEMA) {
      if (field.kind !== 'num') continue
      const tag = new RegExp(`id="opt-${field.key}"[^>]*`, 'u').exec(html)?.[0] ?? ''
      const attr = (name: string): number => Number(new RegExp(`${name}="([\\d.]+)"`, 'u').exec(tag)?.[1])
      expect(field.min, `${field.key} min`).toBe(attr('min'))
      expect(field.step, `${field.key} step`).toBe(attr('step'))
      expect(field.count, `${field.key} count`).toBe(Math.round((attr('max') - attr('min')) / attr('step')) + 1)
    }
  })

  it('decodes any base36 body to an in-range config (self-bounding)', () => {
    const decoded = decodeSeed(`1${'z'.repeat(24)}`)
    expect(decoded).not.toBeNull()
    expect(decoded?.moteCount).toBeGreaterThanOrEqual(1)
    expect(decoded?.moteCount).toBeLessThanOrEqual(24)
    expect(['copper', 'mono', 'neon']).toContain(decoded?.palette)
  })
})
