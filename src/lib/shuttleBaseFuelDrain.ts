/**
 * Passive fuel drain for always-on shuttle systems.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-map-shuttle-player-design.md
 */
import { getCurrentUpgradeValue } from './upgrades'

/** Upgrade id that controls passive shuttle systems drain. */
export const SHUTTLE_FUEL_UPGRADE_ID = 'shuttleFuelUpgrade'

/**
 * Compute passive shuttle fuel drain for a frame.
 *
 * @param dt - Frame delta in seconds.
 * @param drainEnabled - Whether passive shuttle systems should consume fuel this frame.
 * @returns Fuel units to consume this frame.
 */
export function computeShuttleBaseFuelDrain(dt: number, drainEnabled: boolean): number {
  if (!drainEnabled) return 0
  return Math.max(0, dt) * getCurrentUpgradeValue(SHUTTLE_FUEL_UPGRADE_ID)
}
