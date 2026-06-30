// Sandbox options — toggled live by the on-screen panel and read by the pure sim each
// step. Kept separate from World (game state) and Input (per-step intent): these are
// settings. DEFAULT_CONFIG is the current shipped behaviour, so step()'s default arg
// keeps existing callers (and tests) unchanged.

export interface Config {
  /** What the gather key does: a discrete `pulse` (tap) or a continuous `attract` (hold). */
  gather: 'attract' | 'pulse'
  /** Arena bounds: `wrap` (toroidal), `bounce` off the rectangle, `kill` motes at the
   * edge, or a `circle` arena (everything bounces off a centred circle). */
  edges: 'bounce' | 'circle' | 'kill' | 'wrap'
  /** Scatter (repel) enabled. */
  scatter: boolean
  /** Vortex (gather + scatter held) enabled. */
  vortex: boolean
  /** Reach of the continuous field (attract / scatter / vortex), px. */
  fieldRange: number
  /** Field acceleration at the centre, px/s² (falls linearly to 0 at the edge). */
  fieldStrength: number
  /** Seconds of held vortex needed to wind up to full charge. */
  chargeTime: number
  /** Tangential orbit / fling speed at full vortex charge, px/s. */
  vortexSwirl: number
  /** The dormant gun: firing bullets (press F) that split asteroids. */
  gun: boolean
  /** Charged motes split uncharged ones on contact. */
  chargedSplit: boolean
  /** A charged mote survives a hit (keeps its charge, pierces) instead of shattering. */
  piercing: boolean
  /** Split fragments are born charged, so a hit can cascade. */
  chainReaction: boolean
  /** Charge spreads to touched motes instead of shattering them (overrides split). */
  conduction: boolean
  /** Charged motes push each other apart. */
  chargedRepel: boolean
  /** Charged motes interact by polarity: opposite poles attract, like poles repel. */
  bipolar: boolean
  /** A shatter releases an outward shockwave that shoves nearby motes. */
  burst: boolean
  /** Charged motes freeze in place (stasis). */
  stasis: boolean
  /** How many motes the field is kept topped up to. */
  moteCount: number
  /** Base radius of a freshly-spawned mote, px. */
  moteSize: number
  /** Max drift speed of a freshly-spawned mote, px/s. */
  moteDrift: number
  /** How many static pillar obstacles to place (0 = none). */
  pillarCount: number
  /** Radius of each pillar, px. */
  pillarSize: number
  /** Motes are pulled toward the arena centre (a gravity well). */
  well: boolean
  /** Where the gravity well pulls toward: the arena `centre` or the `ship` (it follows). */
  wellAnchor: 'centre' | 'ship'
  /** Motes lose speed over time (drag). */
  friction: boolean
  /** Motes bounce off each other (billiards) instead of passing through. */
  moteCollision: boolean
  /** A static swirl field pushes the motes like currents. */
  flow: boolean
  /** Where the flow field is anchored: the fixed world (`centre`) or the `ship` (it follows). */
  flowAnchor: 'centre' | 'ship'
  /** Motion trails: `off`, a faint `dust`, or `full` shape outlines. */
  trails: 'dust' | 'full' | 'off'
  /** Whether the motes trail too (off = only the ship trails). */
  trailMotes: boolean
  /** Screen-shake on shatters. */
  shake: boolean
  /** Line-shard debris flung from each shatter (a view-only flourish). */
  debris: boolean
  /** Colour theme — used when `customPalette` is off. */
  palette: 'copper' | 'mono' | 'neon'
  /** Use the custom background + foreground colours below instead of the named palette. */
  customPalette: boolean
  /** Custom background colour, `#rrggbb` (only meaningful when customPalette is on; encoded
   * into the seed only then, so non-custom seeds stay short). */
  customBg: string
  /** Custom foreground colour, `#rrggbb` — dim and charged tones are derived from it. */
  customFront: string
}

export const DEFAULT_CONFIG: Config = {
  gather: 'pulse',
  edges: 'wrap',
  scatter: true,
  vortex: true,
  fieldRange: 260,
  fieldStrength: 1100,
  chargeTime: 1.4,
  vortexSwirl: 640,
  gun: false,
  chargedSplit: true,
  piercing: false,
  chainReaction: false,
  conduction: false,
  chargedRepel: false,
  bipolar: false,
  burst: false,
  stasis: false,
  moteCount: 6,
  moteSize: 48,
  moteDrift: 60,
  pillarCount: 0,
  pillarSize: 40,
  well: false,
  wellAnchor: 'centre',
  friction: false,
  moteCollision: false,
  flow: false,
  flowAnchor: 'centre',
  trails: 'off',
  trailMotes: true,
  shake: false,
  debris: false,
  palette: 'copper',
  customPalette: false,
  customBg: '#0a0a0a',
  customFront: '#d98a44',
}
