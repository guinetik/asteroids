/**
 * Tuning constants for the telescope alignment minigame. Every numeric used
 * by the class, the quality math, and the canvas component is declared here
 * — no magic numbers leak to callers.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-19-telescope-alignment-design.md
 */

/** Maximum blur radius in px — clamps `focus` knob range to [0, MAX_FOCUS]. */
export const MAX_FOCUS = 16

/** Maximum chromatic aberration offset in px — clamps `chroma` to [0, MAX_CHROMA]. */
export const MAX_CHROMA = 12

/** Maximum pointing offset in px per axis — `azimuth` and `elevation` live in [-MAX_POINTING, +MAX_POINTING]. */
export const MAX_POINTING = 60

/** Quality threshold at which the lock-in prompt lights up. */
export const LOCK_THRESHOLD = 0.95

/** Coarse adjustment step applied on a plain key press. */
export const STEP_COARSE = 1.0

/** Multiplier applied to STEP_COARSE when Shift is held for fine adjust. */
export const STEP_FINE_MUL = 0.25

/** Coarse step for pointing axes (larger range than focus/chroma). */
export const STEP_POINTING = 2.5

/** Weight applied to focus error in the quality formula. */
export const QUALITY_WEIGHT_FOCUS = 0.3

/** Weight applied to chroma error in the quality formula. */
export const QUALITY_WEIGHT_CHROMA = 0.25

/** Weight applied to pointing error in the quality formula. */
export const QUALITY_WEIGHT_POINTING = 0.45

/** LED turns green when per-knob quality >= this threshold. */
export const LED_GREEN_THRESHOLD = 0.85

/** LED is amber between this threshold and LED_GREEN_THRESHOLD; red below. */
export const LED_AMBER_THRESHOLD = 0.4

/** Maximum drift amplitude as a fraction of a knob's range. Drift alone cannot break LOCK_THRESHOLD. */
export const DRIFT_AMP_PCT = 0.015

/** Lock-in animation duration in ms — knobs animate to zero over this span. */
export const LOCK_ANIMATION_MS = 400

/** Caption fade-in duration in ms after lock-in completes. */
export const CAPTION_FADE_MS = 1200

/** Diameter of the eyepiece clip-path circle in px. */
export const EYEPIECE_DIAMETER_PX = 780

/** Per-axis drift oscillator frequency (Hz) and phase offset. */
export const DRIFT_FOCUS = { freq: 0.73, phase: 0.0, amp: 0.012 } as const

/** Chromatic aberration drift oscillator. */
export const DRIFT_CHROMA = { freq: 1.03, phase: 1.5, amp: DRIFT_AMP_PCT } as const

/** Azimuth drift oscillator. */
export const DRIFT_AZIMUTH = { freq: 0.61, phase: 2.7, amp: DRIFT_AMP_PCT } as const

/** Elevation drift oscillator. */
export const DRIFT_ELEVATION = { freq: 0.82, phase: 4.1, amp: DRIFT_AMP_PCT } as const

/** Shared palette used by the canvas — matches spec §2.4 and prototype inline palette. */
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
  /** Dim cyan for inactive chrome. */
  cyanDim: 'rgba(103, 232, 249, 0.5)',
  /** Border rule color. */
  border: 'rgba(34, 211, 238, 0.25)',
  /** Success / locked-in green. */
  green: '#34d399',
  /** Warning amber. */
  amber: '#fbbf24',
  /** Error / high-error red. */
  red: '#f87171',
} as const
