/**
 * Shared types for the telescope alignment minigame.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-19-telescope-alignment-design.md
 */

/** Current values of all four alignment knobs in their native units (px). */
export interface KnobState {
  /** Focus knob value in [0, MAX_FOCUS]. Raw blur radius. */
  focus: number
  /** Chromatic aberration knob value in [0, MAX_CHROMA]. Channel split in px. */
  chroma: number
  /** Azimuth (horizontal) pointing offset in [-MAX_POINTING, +MAX_POINTING]. */
  azimuth: number
  /** Elevation (vertical) pointing offset in [-MAX_POINTING, +MAX_POINTING]. */
  elevation: number
}

/** Parameters of one axis's ambient drift sinusoid. */
export interface DriftConfig {
  /** Oscillator frequency in Hz. */
  freq: number
  /** Phase offset in radians so each axis wobbles independently. */
  phase: number
  /** Amplitude as a fraction of the knob's range. */
  amp: number
}

/** Static info about a telescope target shown in the eyepiece. */
export interface TelescopeTarget {
  /** Public image filename under `/minigames/telescope/`. */
  image: string
  /** Large label shown above the eyepiece — e.g. `JWST L2 — DEEP FIELD`. */
  label: string
  /** Flavor caption faded in after lock-in. */
  caption: string
}

/** LED color bucket assigned to a per-knob quality band. */
export type LedColor = 'red' | 'amber' | 'green'
