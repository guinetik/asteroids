/**
 * Pure quality math for telescope alignment — no DOM, no RAF, no state.
 * Safe to call from both the class and the canvas component. Unit tested in
 * `__tests__/quality.spec.ts`.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-19-telescope-alignment-design.md
 */
import {
  MAX_FOCUS,
  MAX_CHROMA,
  MAX_POINTING,
  QUALITY_WEIGHT_FOCUS,
  QUALITY_WEIGHT_CHROMA,
  QUALITY_WEIGHT_POINTING,
  LED_AMBER_THRESHOLD,
  LED_GREEN_THRESHOLD,
} from './constants'
import type { KnobState, LedColor } from './types'

/**
 * Compute overall alignment quality in [0, 1] from the four knob values.
 * Pointing error is weighted highest because visual misalignment dominates
 * the player's read of "off".
 *
 * @param knobs - Current knob state.
 * @returns Weighted quality in [0, 1]. Assumes QUALITY_WEIGHT_* constants sum to 1.0 so perfect alignment returns exactly 1.
 */
export function computeQuality(knobs: KnobState): number {
  const focusErr = Math.abs(knobs.focus) / MAX_FOCUS
  const chromaErr = Math.abs(knobs.chroma) / MAX_CHROMA
  const axNorm = Math.abs(knobs.azimuth) / MAX_POINTING
  const ayNorm = Math.abs(knobs.elevation) / MAX_POINTING
  const pointingErr = Math.sqrt(axNorm * axNorm + ayNorm * ayNorm) / Math.SQRT2
  const weighted =
    QUALITY_WEIGHT_FOCUS * focusErr +
    QUALITY_WEIGHT_CHROMA * chromaErr +
    QUALITY_WEIGHT_POINTING * pointingErr
  return clamp01(1 - weighted)
}

/**
 * Compute the per-knob quality used for LED + mini-bar.
 *
 * @param value - Raw knob value (may be negative for pointing axes).
 * @param max - Maximum absolute value the knob reaches. Must be >= 0.
 * @returns Quality in [0, 1]; 1 when centered, 0 at max deflection.
 */
export function perKnobQuality(value: number, max: number): number {
  if (max <= 0) return 1
  return clamp01(1 - Math.abs(value) / max)
}

/**
 * Map a per-knob quality band to its LED color bucket.
 *
 * @param quality - Per-knob quality in [0, 1].
 * @returns The LED color bucket.
 */
export function ledColor(quality: number): LedColor {
  if (quality >= LED_GREEN_THRESHOLD) return 'green'
  if (quality >= LED_AMBER_THRESHOLD) return 'amber'
  return 'red'
}

/**
 * Clamp a value to the [0, 1] range.
 *
 * @param v - Input value.
 * @returns Clamped value.
 */
function clamp01(v: number): number {
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}
