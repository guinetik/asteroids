/**
 * Player profile data model.
 *
 * Defines the structure for player save data persisted to localStorage.
 * Credits are the only currency — earned from missions, spent in the
 * shop (separate system).
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-player-profile-design.md
 */

/** Player save data persisted to localStorage. */
export interface PlayerProfile {
  /** Player display name. Set at profile creation. */
  name: string
  /** Current credit balance. Earned from missions, spent in the shop. */
  credits: number
  /** Total missions completed across all types. Used for difficulty scaling. */
  completedMissionCount: number
  /** Asteroid ID → mission visit count. Incremented once per mission, not per landing. */
  visitedAsteroids: Record<string, number>
}
