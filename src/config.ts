// Sandbox options — toggled live by the on-screen panel and read by the pure sim each
// step. Kept separate from World (game state) and Input (per-step intent): these are
// settings. DEFAULT_CONFIG is the current shipped behaviour, so step()'s default arg
// keeps existing callers (and tests) unchanged.

export interface Config {
  /** What the gather key does: a discrete `pulse` (tap) or a continuous `attract` (hold). */
  gather: 'attract' | 'pulse'
  /** Arena borders: entities `wrap` around (toroidal) or `bounce` off the edges. */
  edges: 'bounce' | 'wrap'
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
  /** Motes are pulled toward the arena centre (a gravity well). */
  well: boolean
  /** Motes lose speed over time (drag). */
  friction: boolean
  /** Motion trails: `off`, a faint `dust`, or long `full` streaks. */
  trails: 'dust' | 'full' | 'off'
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
  well: false,
  friction: false,
  trails: 'off',
  shake: false,
  palette: 'copper',
}
