/**
 * Stable keys for solar-system bodies used in orbit-first-visit tracking.
 *
 * Orbit capture uses display names; achievements and save data use ids (`planet.id`, `"sun"`).
 *
 * @author guinetik
 * @date 2026-04-12
 * @spec docs/superpowers/specs/2026-04-03-player-profile-design.md
 */

import { SOLAR_BODIES, SUN } from '@/lib/planets/catalog'

/**
 * Map a capture body's display name to the key stored in {@link PlayerProfile.orbitedSolarBodies}.
 *
 * @param name - {@link import('@/lib/orbitCapture').CaptureBody.name} from the active orbit target.
 * @returns Planet id, `"sun"`, or `null` if unknown.
 */
export function orbitBodyKeyFromCaptureName(name: string): string | null {
  if (name === SUN.name) return 'sun'
  const planet = SOLAR_BODIES.find((p) => p.name === name)
  return planet ? planet.id : null
}
