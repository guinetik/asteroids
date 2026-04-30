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
 * @spec docs/superpowers/specs/2026-04-30-pimp-my-shuttle-shop-design.md
 */

/** Per-body access state for contract-pinned bodies. */
export type BodyAccessState = 'restricted' | 'unrestricted' | 'liberated' | 'destroyed'

/** Lifetime counters used by achievement evaluators. */
export interface PlayerAchievementStats {
  /** Total finite positive credits granted to the player, e.g. `500` after one mission payout. */
  lifetimeCreditsEarned: number
  /** Total finite positive credits successfully spent by the player, e.g. `300` after one shop buy. */
  lifetimeCreditsSpent: number
  /** Total finite positive credits earned specifically through trade, e.g. `250` from a route sale. */
  lifetimeTradeCreditsEarned: number
  /** Mission objective type → completion count, e.g. `{ survey: 2 }` after two survey objectives. */
  missionObjectivesCompletedByType: Record<string, number>
  /** Total successful slingshot launches across all gravity bodies, e.g. `3`. */
  slingshotLaunches: number
  /** Gravity body id → slingshot launch count, e.g. `{ sun: 1 }`. */
  slingshotLaunchesByBody: Record<string, number>
  /** Total gravity-surf start events, e.g. `1` when the player begins one surf. */
  gravitySurfStarts: number
  /** Total manifold ride events, e.g. `4` after four rides. */
  manifoldRides: number
  /** Total portal departures, e.g. `2` after leaving through two portals. */
  portalDepartures: number
  /** Sum of finite positive world-line segment distances traveled, e.g. `1200`. */
  lifetimeWorldLineDistance: number
  /** Longest finite positive single-run world-line distance reached, e.g. `250`. */
  maxSingleRunWorldLineDistance: number
}

/** Owned + active cosmetic selections for Pimp My Shuttle! (persisted on {@link PlayerProfile}). */
export interface PlayerCosmetics {
  /** Option ids purchased or seeded as starter defaults. */
  readonly ownedOptionIds: readonly string[]
  /** Active shuttle paint catalog id. */
  readonly shuttlePaintjobId: string
  /** Active lander paint catalog id. */
  readonly landerPaintjobId: string
  /** Custom transponder title (normalized empty string allowed when unset). */
  readonly shuttleTitle: string
  /** Shuttle + lander shared flag decal id. */
  readonly vehicleFlagId: string
  /** Active shuttle thruster trail id. */
  readonly shuttleThrusterTrailId: string
  /** Active lander thruster trail id. */
  readonly landerThrusterTrailId: string
  /** Active multitool paint row id (future binding). */
  readonly multitoolPaintjobId: string
}

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
  /** Lifetime achievement counters persisted with the profile and migrated for legacy saves. */
  achievementStats: PlayerAchievementStats
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
  /**
   * Pinned body id to access state. Example: `{ hektor: 'restricted' }` keeps 624 Hektor absent
   * from the rendered map until contract state flips it.
   */
  bodyAccess: Record<string, BodyAccessState>
  /** Journey ids already completed. */
  completedJourneyIds: string[]
  /** Per-journey completed step ids for resumable journey progress. */
  journeyStepProgress: Record<string, string[]>
  /** Feature ids unlocked by journey completion. */
  unlockedFeatureIds: string[]
  /**
   * Journey ids whose "JOURNEY BEGINS" banner has already fired for this profile.
   * Prevents the intro banner from replaying on reload once shown.
   */
  announcedJourneyStartIds: string[]
  /**
   * Journey ids whose `startTrigger` gate has been satisfied. Journeys with a
   * `startTrigger` are hidden from HUD + announcement until their id appears
   * here. Journeys without a `startTrigger` are always ready.
   */
  journeyStartReadyIds: string[]
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
  /**
   * Permanent multiplicative buffs granted by contract reward effects of type
   * `'shuttle-buff'`. Keyed by buffId (e.g. `'jovianEmpowerment'`). Plan 7
   * applies the math; this plan only persists.
   */
  shuttleBuffs?: Record<string, number>
  /**
   * Giver ids disabled by contract reward effects of type `'disable-giver'`.
   * Plan 7 enforces the suppression at the mission-board level; this plan
   * only persists.
   */
  disabledGiverIds?: Record<string, true>
  /**
   * Story flags set by contract outcomes (and future Act 3 events). Read by
   * giver/mission surfacing to gate post-resolution content.
   */
  activeStoryFlags?: Record<string, true>
  /**
   * Whether the player has seen the Jovian transmit epilogue video. Set on
   * Continue. Once `true`, the video never replays — even on save reload.
   */
  seenJovianEpilogue?: boolean
  /** Cosmetic selections for Pimp My Shuttle! (persisted with credits spend). */
  cosmetics?: PlayerCosmetics
  /**
   * When true, Fantasia's one-time magenta shop intro mail has been queued for this profile.
   * Cleared only by profile resets — prevents duplicate transmissions on later eligible orbits.
   */
  fantasiaCosmeticIntroSent?: boolean
}
