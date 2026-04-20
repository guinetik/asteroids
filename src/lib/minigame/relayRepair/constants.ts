/**
 * Tuning constants for the relay repair minigame. Every numeric value the
 * class, math modules, and canvas reach for is named here — no magic
 * numbers leak to callers.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-relay-repair-design.md
 */

/** Grid column count. Matches prototype. */
export const GRID_COLS = 5

/** Grid row count. Matches prototype. */
export const GRID_ROWS = 3

/** SVG cell side length in px at base resolution. */
export const CELL_PX = 96

/** Node (pipe hub) radius as a fraction of CELL_PX. */
export const NODE_RADIUS_PCT = 0.36

/** Ideal path length through the default puzzle — divisor for partial quality. */
export const IDEAL_PATH_LENGTH = 11

/** Quality cap when the wave has not reached the sink yet. */
export const QUALITY_CAP_WITHOUT_SINK = 0.94

/** Active-cell weight applied to partial quality before the cap. */
export const QUALITY_SCALE = 0.9

/** Minimum quality required to press E and lock in. */
export const LOCK_THRESHOLD = 0.95

/** Lock-in animation duration in ms — matches prototype's 450ms. */
export const LOCK_ANIMATION_MS = 450

/** Caption fade-in duration in ms after lock-in completes. */
export const CAPTION_FADE_MS = 1200

/** Wiggle sine amplitude in px perpendicular to the pipe axis. */
export const WIGGLE_AMPLITUDE_PX = 2.8

/** Wiggle wavelength in px along the pipe axis. */
export const WIGGLE_WAVELENGTH_PX = 16

/** Wiggle travel speed multiplier — higher = faster flow. */
export const WIGGLE_SPEED = 5.5

/** Minimum number of sample points for a wiggle path. */
export const WIGGLE_MIN_STEPS = 6

/** Approximate px per wiggle sample above the minimum. */
export const WIGGLE_PX_PER_STEP = 3

/** Shared palette mirrored from prototype line 42. */
export const COLOR = {
  /** Deep panel background. */
  bg: '#05070c',
  /** Secondary panel fill. */
  panel: '#0a0f1a',
  /** Primary text. */
  text: '#cffafe',
  /** Primary cyan stroke. */
  cyan: '#22d3ee',
  /** Hover/focus cyan stroke. */
  cyanBright: '#7dd3fc',
  /** Dim cyan for inactive pipes. */
  cyanDim: 'rgba(103, 232, 249, 0.3)',
  /** Border rule color. */
  border: 'rgba(34, 211, 238, 0.25)',
  /** Success / locked-in green. */
  green: '#34d399',
  /** Warning amber. */
  amber: '#fbbf24',
  /** Dead-end red (reserved — prototype uses amber for dead ends). */
  red: '#f87171',
  /** Grid line color. */
  grid: 'rgba(34, 211, 238, 0.06)',
} as const
