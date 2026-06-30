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
  /** Motes are pulled toward the arena centre (a gravity well). */
  well: boolean
  /** Motes lose speed over time (drag). */
  friction: boolean
  /** Motes bounce off each other (billiards) instead of passing through. */
  moteCollision: boolean
  /** A static swirl field pushes the motes like currents. */
  flow: boolean
  /** Motion trails: `off`, a faint `dust`, or `full` shape outlines. */
  trails: 'dust' | 'full' | 'off'
  /** Whether the motes trail too (off = only the ship trails). */
  trailMotes: boolean
  /** Screen-shake on shatters. */
  shake: boolean
  /** Colour theme. */
  palette: 'copper' | 'mono' | 'neon'
}

export const DEFAULT_CONFIG: Config = {
  gather: 'pulse',
  edges: 'wrap',
  scatter: true,
  vortex: true,
  gun: false,
  chargedSplit: true,
  piercing: false,
  chainReaction: false,
  conduction: false,
  chargedRepel: false,
  bipolar: false,
  burst: false,
  stasis: false,
  well: false,
  friction: false,
  moteCollision: false,
  flow: false,
  trails: 'off',
  trailMotes: true,
  shake: false,
  palette: 'copper',
}
