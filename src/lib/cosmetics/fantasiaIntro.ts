/**
 * One-time Fantasia intro mail gated by eligible orbit arrivals.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-30-pimp-my-shuttle-shop-design.md
 */

import type { PlayerProfile } from '@/lib/player/types'
import { isPimpMyShuttleAvailable } from './availability'

/** Catalog id queued on first eligible planetary orbit arrival. */
export const FANTASIA_INTRO_MESSAGE_ID = 'fantasia-pimp-my-shuttle-intro'

/**
 * Marks {@link PlayerProfile.fantasiaCosmeticIntroSent} when the queued intro should trip.
 * Returns the same profile reference when no change should occur — callers gate side effects off
 * `next !== prev` before enqueueing ship mail delivery.
 *
 * @param profile - Persisted snapshot.
 * @param solarBodyOrPlanetKey - Orbit capture key (`mars`, `"sun"` is ignored).
 */
export function markFantasiaCosmeticIntroIfNeeded(
  profile: PlayerProfile,
  solarBodyOrPlanetKey: string,
): PlayerProfile {
  if (solarBodyOrPlanetKey === 'sun') return profile
  if (!isPimpMyShuttleAvailable(solarBodyOrPlanetKey)) return profile
  if (profile.fantasiaCosmeticIntroSent === true) return profile
  return {
    ...profile,
    fantasiaCosmeticIntroSent: true,
  }
}
