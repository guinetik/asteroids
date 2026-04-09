/**
 * Guards the `/map` route: requires a valid player profile in localStorage.
 *
 * @author guinetik
 * @date 2026-04-09
 * @spec docs/superpowers/specs/2026-04-03-player-profile-design.md
 */
import { loadProfile } from '@/lib/player/profile'

/**
 * Whether navigation to `/map` is allowed.
 *
 * @returns True when a valid player profile exists in localStorage.
 */
export function canAccessMapRoute(): boolean {
  if (typeof localStorage === 'undefined') return false
  return loadProfile() !== null
}
