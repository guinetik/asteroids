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
  /**
   * Total finite positive credits earned only through Fantasia's Cargo Intake (premium buyer tab),
   * e.g. `800` after a trade-good sale there — separate from yellow-dock trade totals.
   */
  lifetimeCargoIntakeCreditsEarned: number
  /** Mission objective type → completion count, e.g. `{ survey: 2 }` after two survey objectives. */
  missionObjectivesCompletedByType: Record<string, number>
  /**
   * Runtime mission-tip id → number of completed missions in which this tip was shown,
   * for example `{ oxygenLow: 1 }` after one completed mission where O2 dipped below half.
   * Used to retire each runtime tip after a fixed completed-mission budget.
   */
  runtimeTipsShownCount: Record<string, number>
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
  /**
   * Total times the player has pet Sushi the cat across the lifetime of this profile,
   * e.g. `25` after twenty-five pets. Drives the "Beloved" achievement.
   */
  sushiPetCount: number
  /**
   * Total times the player has refilled Sushi's bowl from empty (zero servings) across
   * the lifetime of this profile, e.g. `3` after three from-empty refills. Topping off a
   * non-empty bowl does not increment this counter — the achievement only counts true
   * empty-bowl rescues.
   */
  sushiBowlRefillCount: number
  /** Total runs started for each cabinet ROM, keyed by ROM id (e.g. `'asteroids': 4`). */
  arcadeRunsByRom: Record<string, number>
  /** Best single-run score reached on each cabinet ROM. */
  arcadeBestScoreByRom: Record<string, number>
  /** Best wave reached in a single run on each cabinet ROM. */
  arcadeBestWaveByRom: Record<string, number>
  /**
   * Lifetime counts of named in-ROM events, keyed first by ROM id and then by
   * event id (e.g. `arcadeEventCountsByRom.asteroids.saucerKill = 7`).
   */
  arcadeEventCountsByRom: Record<string, Record<string, number>>
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
  /** Active habitat interior paint row id. */
  readonly habitatInteriorId: string
}

/**
 * Optional habitat appliance unlock flags. Each flag gates a counter-top prop on
 * the hatch-wall sideboard — when `false`, the corresponding GLB is not fetched
 * and the model is not added to the scene.
 */
export interface PlayerHabitatAppliances {
  /** When true, the counter-top coffee machine GLB loads and renders on the sideboard. */
  readonly coffeeMachine: boolean
  /** When true, the counter-top record player GLB loads and renders on the sideboard. */
  readonly recordPlayer: boolean
  /** When true, the free-standing refractor telescope GLB loads in the −X "sun corner" of the cabin. */
  readonly refractorTelescope: boolean
  /** When true, the lounge chair GLB loads in the −X / −Z corner between the telescope and hatch walls. */
  readonly loungeChair: boolean
  /** When true, the arcade machine GLB loads next to the cockpit table on the −X side. */
  readonly arcadeMachine: boolean
  /** When true, the cat tower GLB loads beside the bedside locker on the +X side. */
  readonly catTower: boolean
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
  /** Most recently completed asteroid mission body id, or null before the first completion. */
  lastVisitedAsteroidId?: string | null
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
  /**
   * Sushi the cat's affection meter, clamped to [0, 100]. Decays slowly while the player
   * is away from the habitat; replenished by interactions in later phases. Defaults to 75.
   */
  sushiLove: number
  /**
   * Sushi's hunger meter, clamped to [0, 100]. 0 means stuffed; 100 means famished.
   * Rises continuously with time and is reduced when Sushi eats from the bowl. Defaults to 75.
   */
  sushiHunger: number
  /**
   * Servings remaining in Sushi's bowl, clamped to [0, 10]. Decremented by Sushi's eating
   * routine; refilled by feeding the bowl with one bag of cat food (10 servings). Defaults to 0.
   */
  bowlServings: number
  /**
   * Sushi's bladder/litter need, clamped to [0, 100]. 0 means relieved; rises with time
   * until Sushi visits the litterbox, then resets to 0. Defaults to 0.
   */
  sushiBladder: number
  /**
   * Sushi's tiredness meter, clamped to [0, 100]. 0 means rested; rises while Sushi
   * sprints after the laser pointer and resets to 0 when he wakes from a nap inside
   * the cat house. Defaults to 0.
   */
  sushiTired: number
  /**
   * Number of waste chunks accumulated in the litterbox, clamped to [0, 6]. Increments
   * each time Sushi visits the litter; resets to 0 when the player empties it. When at
   * the cap, Sushi refuses to use the box and begs the player to clean it. Defaults to 0.
   */
  litterPollution: number
  /**
   * Habitat appliance unlock flags. Sideboard + moon lamp are baseline cabin furniture
   * and always present — these flags only gate optional counter-top props (coffee
   * machine, record player) so their GLBs are not fetched until unlocked. Optional in
   * the type because legacy saves are migrated by {@link normalizeLoadedProfile}.
   */
  habitatAppliances?: PlayerHabitatAppliances
}
