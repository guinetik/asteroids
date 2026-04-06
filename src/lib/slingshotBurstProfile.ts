/**
 * Helpers for slingshot burst-to-settle speed transitions.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-orbit-capture-slingshot-design.md
 */

/**
 * Returns the protected target speed at a given point in the settle window.
 *
 * @param burstSpeed - Immediate post-launch burst speed.
 * @param finalSpeed - Stable post-settle lane speed.
 * @param settleDuration - Duration of the settle window in seconds.
 * @param elapsedTime - Elapsed time since launch in seconds.
 * @returns Current protected speed target.
 */
export function getSlingshotSettleSpeed(
  burstSpeed: number,
  finalSpeed: number,
  settleDuration: number,
  elapsedTime: number,
): number {
  if (settleDuration <= 0) return finalSpeed

  const progress = Math.max(0, Math.min(1, elapsedTime / settleDuration))
  return burstSpeed + (finalSpeed - burstSpeed) * progress
}
