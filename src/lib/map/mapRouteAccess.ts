/**
 * Guards the `/map` route: requires a valid player profile in localStorage,
 * or an inbound Vibe Jam portal arrival (`?portal=true`).
 *
 * @author guinetik
 * @date 2026-04-09
 * @spec docs/superpowers/specs/2026-04-03-player-profile-design.md
 */
import { loadProfile } from '@/lib/player/profile'

/**
 * Whether the current URL carries a Vibe Jam portal arrival flag.
 * Checked without instantiating `VibePortal` to keep this module dependency-free.
 */
function isPortalArrival(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('portal') === 'true'
}

/**
 * Whether navigation to `/map` is allowed.
 *
 * Passes when either:
 * - A valid player profile exists in localStorage, or
 * - The player arrived via a Vibe Jam portal (`?portal=true`), in which case
 *   `MapViewController` will create and persist a fresh profile from the portal params.
 *
 * @returns True when access should be granted.
 */
export function canAccessMapRoute(): boolean {
  if (typeof localStorage === 'undefined') return false
  return loadProfile() !== null || isPortalArrival()
}
