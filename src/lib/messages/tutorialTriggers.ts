/**
 * Pure predicates for one-time tutorial message triggers.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-startup-message-system-design.md
 */
import type { ThrusterState } from '@/lib/physics/thrusterSystem'

/**
 * Returns true when the main thrust bar has been meaningfully spent for the
 * first time from a player perspective.
 *
 * The bar does not need to hit literal zero; once the system can no longer
 * fire the thruster for a frame, the player has effectively exhausted it.
 *
 * @param thrustState - Current runtime state of the shuttle's thrust bar
 * @param canFire - Whether the main thruster still has enough charge to fire
 * @returns True when the bar has been used and can no longer fire
 */
export function isMainThrusterSpentForMessage(
  thrustState: ThrusterState,
  canFire: boolean,
): boolean {
  return thrustState.charge < thrustState.capacity && !canFire
}
