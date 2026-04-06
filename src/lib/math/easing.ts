/**
 * Common scalar easing helpers for animation timelines.
 *
 * @author guinetik
 * @date 2026-04-06
 */

/**
 * Smooth ease-in-out curve (cubic).
 *
 * @param t - Input in the range 0–1.
 * @returns Eased output in the range 0–1.
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}
