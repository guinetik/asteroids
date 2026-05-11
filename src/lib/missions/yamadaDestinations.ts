/**
 * Bunker Extract destination + timer selection. Most rolls deliver to Uranus
 * (local hop, gentle timer). A weighted minority pin Neptune or Saturn for the
 * "old patient, strange orbit" lore beat. Timer length scales with the
 * pickup-to-destination distance.
 *
 * @author guinetik
 * @date 2026-05-11
 * @spec docs/superpowers/specs/2026-05-11-yamada-mission-pool-design.md
 */

/** Pickup-distance to destination → timer length (seconds). Tuneable. */
const TIMER_BY_DESTINATION_SECONDS: Record<string, number> = {
  uranus: 240,
  neptune: 480,
  saturn: 600,
}

/** Default timer when an unknown destination is rolled. */
const DEFAULT_TIMER_SECONDS = 240

/** Roll threshold below which Uranus is the destination. */
const URANUS_ROLL_THRESHOLD = 0.7

/** Roll threshold below which Neptune is the destination (above URANUS_ROLL_THRESHOLD). */
const NEPTUNE_ROLL_THRESHOLD = 0.9

/** Result of a destination roll. */
export interface BunkerExtractDestinationPick {
  /** Destination planet id. */
  destinationPlanetId: string
  /** Countdown in seconds. */
  deliveryTimerSeconds: number
}

/**
 * Pick a destination + timer for a Bunker Extract drafted at the given host.
 * Weighted distribution: 70% Uranus, 20% Neptune, 10% Saturn.
 *
 * @param _hostPlanetId - Posting station (reserved for future per-host rules).
 * @param _difficulty - Mission difficulty (reserved for future scaling).
 * @param rand - Optional RNG injectable for tests.
 * @returns Destination pick.
 */
export function pickYamadaBunkerExtractDestination(
  _hostPlanetId: string,
  _difficulty: number,
  rand: () => number = Math.random,
): BunkerExtractDestinationPick {
  const roll = rand()
  const destinationPlanetId =
    roll < URANUS_ROLL_THRESHOLD
      ? 'uranus'
      : roll < NEPTUNE_ROLL_THRESHOLD
        ? 'neptune'
        : 'saturn'
  return {
    destinationPlanetId,
    deliveryTimerSeconds:
      TIMER_BY_DESTINATION_SECONDS[destinationPlanetId] ?? DEFAULT_TIMER_SECONDS,
  }
}
