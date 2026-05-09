/**
 * Random helpers for deterministic arcade Asteroids tests and browser play.
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-05-09-arcade-asteroids-design.md
 */

import type { RandomSource } from './types'

/** Default random source used in normal browser play. */
export const defaultRandomSource: RandomSource = () => Math.random()

/**
 * Return a random number in the inclusive-low, exclusive-high range.
 *
 * @param random - Source returning values in [0, 1).
 * @param min - Lower bound.
 * @param max - Upper bound.
 */
export function randomRange(random: RandomSource, min: number, max: number): number {
  return min + (max - min) * random()
}

/**
 * Return either -1 or +1 from a random source.
 *
 * @param random - Source returning values in [0, 1).
 */
export function randomSign(random: RandomSource): -1 | 1 {
  return random() < 0.5 ? -1 : 1
}
