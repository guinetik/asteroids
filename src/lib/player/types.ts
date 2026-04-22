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
  /**
   * Planet id or `"sun"` → 1 after the player has entered orbit around that body at least once on
   * the solar map. Used for exploration achievements only; not incremented on repeat visits.
   */
  orbitedSolarBodies: Record<string, number>
  /**
   * Planet id used for map respawn placement after refresh or death. Updated when orbit capture
   * completes around a real planet; excludes the Sun.
   */
  lastDockedPlanetId: string | null
  /**
   * After the opening map intro cinematic has played once, this is true and that cinematic is
   * skipped on later visits. Independent of ship mail — Marta/Jay timing uses the message system.
   */
  hasSeenIntro: boolean
  /**
   * Planet ids the player has unlocked for fast travel from the solar map.
   * Granted by contract reward effects of type `'fast-travel'`.
   */
  unlockedFastTravelPlanets: string[]
  /**
   * Per-planet reward multiplier applied when crediting any mission whose giver is that planet.
   * Defaults to `1` for missing entries; `2` after USC partnership unlocks Earth, etc.
   */
  missionPayMultipliers: Record<string, number>
  /** Journey ids already completed. */
  completedJourneyIds: string[]
  /** Per-journey completed step ids for resumable journey progress. */
  journeyStepProgress: Record<string, string[]>
  /** Feature ids unlocked by journey completion. */
  unlockedFeatureIds: string[]
  /**
   * Shuttle hull HP on the solar map (temperature, radiation, impacts).
   * Omitted or `undefined` in older saves — treated as full until the first sync.
   */
  shuttleHullHp?: number
  /**
   * Lander hull HP carried between asteroid missions.
   * Omitted or `undefined` in older saves — treated as full on next landing.
   */
  landerHullHp?: number
}
