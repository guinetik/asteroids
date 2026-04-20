/**
 * Ambient drift for telescope alignment knobs. Each axis wobbles at its own
 * frequency so the player sees a constant gentle drift — defensible as the
 * "telescope is never perfectly still" flavor. Amplitude is bounded so drift
 * alone cannot push quality above LOCK_THRESHOLD from a losing state.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-19-telescope-alignment-design.md
 */
import type { DriftConfig } from './types'

/**
 * Compute the drift offset for one axis at a given time.
 *
 * @param time - Elapsed seconds since the overlay opened.
 * @param config - Drift oscillator parameters.
 * @param range - The knob's maximum value (used to scale amp to native units).
 * @returns Drift offset in the same units as the knob.
 */
export function computeDrift(time: number, config: DriftConfig, range: number): number {
  return Math.sin(time * config.freq + config.phase) * range * config.amp
}
