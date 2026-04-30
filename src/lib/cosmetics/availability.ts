/**
 * Planet eligibility helpers for the Pimp My Shuttle! cosmetic shop.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-30-pimp-my-shuttle-shop-design.md
 */

import { getPimpMyShuttleConfig } from './catalog'

/**
 * Returns true when the player's map orbit target planets id may show the magenta kiosk.
 *
 * @param planetId - Lowercase planet id (`mars`, …) or null when not orbiting.
 */
export function isPimpMyShuttleAvailable(planetId: string | null | undefined): boolean {
  if (!planetId || planetId.trim() === '') return false
  const { availablePlanetIds } = getPimpMyShuttleConfig()
  return availablePlanetIds.includes(planetId)
}
