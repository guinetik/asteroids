/**
 * Player profile operations.
 *
 * Pure functions for creating, loading, saving, and updating player
 * profiles. All update functions return new profile objects — they
 * never mutate the input. localStorage is the only side effect,
 * isolated to saveProfile/loadProfile.
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-player-profile-design.md
 */
import type {
  BodyAccessState,
  PlayerAchievementStats,
  PlayerHabitatAppliances,
  PlayerProfile,
} from './types'
import { SLINGSHOT_JOURNEY_FEATURE_ID, WELCOME_JOURNEY_ID } from '@/lib/journeys'
import {
  createDefaultPlayerCosmetics,
  normalizePlayerCosmetics,
} from '@/lib/cosmetics/profileCosmetics'
import { PINNED_BODIES } from '@/lib/planets/catalog'

/** localStorage key for the player profile. */
export const PROFILE_STORAGE_KEY = 'asteroid-lander-profile'

/** Starting credits for a new player. */
const STARTING_CREDITS = 1000

/** Amount added to event counters when a single achievement event is recorded. */
const ACHIEVEMENT_COUNTER_INCREMENT = 1

/** Default access state assigned to every pinned body in fresh and migrated saves. */
const DEFAULT_BODY_ACCESS_STATE: BodyAccessState = 'restricted'

/** Display name used when the player submits empty whitespace (matches legacy map default). */
export const DEFAULT_PLAYER_DISPLAY_NAME = 'Pilot'

/** Lower bound of Sushi's love and hunger meters. */
export const SUSHI_NEEDS_MIN = 0

/** Upper bound of Sushi's love and hunger meters. */
export const SUSHI_NEEDS_MAX = 100

/** Lower bound of bowl servings (empty bowl). */
export const BOWL_SERVINGS_MIN = 0

/** Upper bound of bowl servings (one full bag). */
export const BOWL_SERVINGS_MAX = 10

/** Default Sushi love value seeded into fresh and migrating profiles. */
export const DEFAULT_SUSHI_LOVE = 25

/** Default Sushi hunger value seeded into fresh and migrating profiles.
 * Hunger semantics match love: 100 = freshly fed, 0 = starving. The needs
 * tick decays this over time and eating from the bowl restores it. */
export const DEFAULT_SUSHI_HUNGER = 75

/** Default bowl serving count for fresh and migrating profiles (empty until first feed). */
export const DEFAULT_BOWL_SERVINGS = 0

/** Default bladder value seeded into fresh and migrating profiles (relieved). */
export const DEFAULT_SUSHI_BLADDER = 0

/** Default tiredness value seeded into fresh and migrating profiles (rested). */
export const DEFAULT_SUSHI_TIRED = 0

/** Lower bound of the litterbox pollution counter (clean). */
export const LITTER_POLLUTION_MIN = 0

/** Upper bound of the litterbox pollution counter — chunk count at which Sushi refuses
 * to use the box and begs the player to clean it. */
export const LITTER_POLLUTION_MAX = 6

/** Default litterbox pollution seeded into fresh and migrating profiles (clean). */
export const DEFAULT_LITTER_POLLUTION = 0

/** Clamp a numeric value into the inclusive `[min, max]` interval. */
function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

/** Read a finite numeric save field, falling back to a default and clamping into range. */
function normalizeClampedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return clampNumber(value, min, max)
}

/** Upper bound for saved display name length after {@link normalizePlayerDisplayName}. */
export const MAX_PLAYER_DISPLAY_NAME_LENGTH = 48

/**
 * Trim input and enforce max length. Blank input becomes {@link DEFAULT_PLAYER_DISPLAY_NAME}.
 *
 * @param raw - Text from the name field (may include surrounding whitespace).
 * @returns The string stored on {@link PlayerProfile.name}.
 */
export function normalizePlayerDisplayName(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return DEFAULT_PLAYER_DISPLAY_NAME
  return trimmed.length <= MAX_PLAYER_DISPLAY_NAME_LENGTH
    ? trimmed
    : trimmed.slice(0, MAX_PLAYER_DISPLAY_NAME_LENGTH)
}

/**
 * Copy of the profile with {@link PlayerProfile.name} set from raw input.
 *
 * @param profile - Current profile.
 * @param raw - Same as {@link normalizePlayerDisplayName}.
 */
export function withPlayerDisplayName(profile: PlayerProfile, raw: string): PlayerProfile {
  return { ...profile, name: normalizePlayerDisplayName(raw) }
}

/**
 * Load or create a profile, apply the display name, and persist to localStorage.
 * Updating an existing save keeps credits and all other fields unchanged.
 *
 * @param raw - Text from the home-screen name field.
 * @returns The profile that was written (or would be written if storage is missing).
 */
export function savePlayerDisplayName(raw: string): PlayerProfile {
  const name = normalizePlayerDisplayName(raw)
  if (typeof localStorage === 'undefined') {
    return createProfile(name)
  }
  const existing = loadProfile()
  const profile = existing ? { ...existing, name } : createProfile(name)
  saveProfile(profile)
  markPlayerNameConfirmed()
  return profile
}

/**
 * Create the zeroed achievement stats block used by fresh and migrated profiles.
 *
 * @returns A new achievement stats object with mutable maps isolated per profile.
 */
function createDefaultAchievementStats(): PlayerAchievementStats {
  return {
    lifetimeCreditsEarned: 0,
    lifetimeCreditsSpent: 0,
    lifetimeTradeCreditsEarned: 0,
    lifetimeCargoIntakeCreditsEarned: 0,
    missionObjectivesCompletedByType: {},
    runtimeTipsShownCount: {},
    slingshotLaunches: 0,
    slingshotLaunchesByBody: {},
    gravitySurfStarts: 0,
    manifoldRides: 0,
    portalDepartures: 0,
    lifetimeWorldLineDistance: 0,
    maxSingleRunWorldLineDistance: 0,
    sushiPetCount: 0,
    sushiBowlRefillCount: 0,
  }
}

/**
 * Normalize persisted achievement stats, dropping malformed values.
 *
 * @param raw - Unknown save field from localStorage.
 * @returns A complete achievement stats block with finite non-negative numbers.
 */
function normalizeAchievementStats(raw: unknown): PlayerAchievementStats {
  const defaults = createDefaultAchievementStats()
  if (raw === undefined || raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaults
  }

  const stats = raw as Record<string, unknown>
  return {
    lifetimeCreditsEarned:
      normalizeNonNegativeNumber(stats['lifetimeCreditsEarned']) ?? defaults.lifetimeCreditsEarned,
    lifetimeCreditsSpent:
      normalizeNonNegativeNumber(stats['lifetimeCreditsSpent']) ?? defaults.lifetimeCreditsSpent,
    lifetimeTradeCreditsEarned:
      normalizeNonNegativeNumber(stats['lifetimeTradeCreditsEarned']) ??
      defaults.lifetimeTradeCreditsEarned,
    lifetimeCargoIntakeCreditsEarned:
      normalizeNonNegativeNumber(stats['lifetimeCargoIntakeCreditsEarned']) ??
      defaults.lifetimeCargoIntakeCreditsEarned,
    missionObjectivesCompletedByType: normalizeNumericMap(
      stats['missionObjectivesCompletedByType'],
    ),
    runtimeTipsShownCount: normalizeNumericMap(stats['runtimeTipsShownCount']),
    slingshotLaunches:
      normalizeNonNegativeNumber(stats['slingshotLaunches']) ?? defaults.slingshotLaunches,
    slingshotLaunchesByBody: normalizeNumericMap(stats['slingshotLaunchesByBody']),
    gravitySurfStarts:
      normalizeNonNegativeNumber(stats['gravitySurfStarts']) ?? defaults.gravitySurfStarts,
    manifoldRides: normalizeNonNegativeNumber(stats['manifoldRides']) ?? defaults.manifoldRides,
    portalDepartures:
      normalizeNonNegativeNumber(stats['portalDepartures']) ?? defaults.portalDepartures,
    lifetimeWorldLineDistance:
      normalizeNonNegativeNumber(stats['lifetimeWorldLineDistance']) ??
      defaults.lifetimeWorldLineDistance,
    maxSingleRunWorldLineDistance:
      normalizeNonNegativeNumber(stats['maxSingleRunWorldLineDistance']) ??
      defaults.maxSingleRunWorldLineDistance,
    sushiPetCount:
      normalizeNonNegativeNumber(stats['sushiPetCount']) ?? defaults.sushiPetCount,
    sushiBowlRefillCount:
      normalizeNonNegativeNumber(stats['sushiBowlRefillCount']) ?? defaults.sushiBowlRefillCount,
  }
}

/**
 * Normalize a number from persisted profile state.
 *
 * @param value - Unknown saved value.
 * @returns The value when finite and non-negative, otherwise null.
 */
function normalizeNonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * Copy a persisted string-keyed numeric map, excluding malformed entries.
 *
 * @param raw - Unknown save field from localStorage.
 * @returns A new map containing only finite non-negative numeric values.
 */
function normalizeNumericMap(raw: unknown): Record<string, number> {
  const result: Record<string, number> = {}
  if (raw === undefined || raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return result
  }

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      result[key] = value
    }
  }
  return result
}

/**
 * Check whether a profile stat delta is finite and positive.
 *
 * @param amount - Candidate stat delta.
 * @returns True when the amount should be recorded.
 */
function isPositiveFiniteAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0
}

/**
 * Return a string-keyed count map with one key incremented.
 *
 * @param map - Existing count map.
 * @param key - Map key to increment.
 * @returns A new map with the key's count incremented by one.
 */
function incrementCountMap(map: Record<string, number>, key: string): Record<string, number> {
  return {
    ...map,
    [key]: (map[key] ?? 0) + ACHIEVEMENT_COUNTER_INCREMENT,
  }
}

/**
 * Read achievement stats from a profile-like object and seed defaults when absent.
 *
 * @param profile - Current profile, possibly from a legacy in-memory test fixture.
 * @returns Existing stats or a fresh zeroed stats block.
 */
function getAchievementStats(profile: PlayerProfile): PlayerAchievementStats {
  return (profile as Partial<PlayerProfile>).achievementStats ?? createDefaultAchievementStats()
}

/**
 * Validate and migrate JSON from localStorage into {@link PlayerProfile}.
 *
 * @param data - Parsed JSON value.
 * @returns A profile, or null if the shape is invalid.
 */
function normalizeLoadedProfile(data: unknown): PlayerProfile | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null
  const p = data as Partial<PlayerProfile>
  if (typeof p.name !== 'string' || typeof p.credits !== 'number') return null

  const completedMissionCount =
    typeof p.completedMissionCount === 'number' ? p.completedMissionCount : 0
  let visitedAsteroids: Record<string, number> = {}
  if (
    p.visitedAsteroids !== undefined &&
    p.visitedAsteroids !== null &&
    typeof p.visitedAsteroids === 'object' &&
    !Array.isArray(p.visitedAsteroids)
  ) {
    visitedAsteroids = p.visitedAsteroids as Record<string, number>
  }

  let orbitedSolarBodies: Record<string, number> = {}
  if (
    p.orbitedSolarBodies !== undefined &&
    p.orbitedSolarBodies !== null &&
    typeof p.orbitedSolarBodies === 'object' &&
    !Array.isArray(p.orbitedSolarBodies)
  ) {
    orbitedSolarBodies = p.orbitedSolarBodies as Record<string, number>
  }

  const lastDockedPlanetId =
    typeof p.lastDockedPlanetId === 'string' && p.lastDockedPlanetId.trim().length > 0
      ? p.lastDockedPlanetId
      : 'earth'

  /**
   * Saves written before `hasSeenIntro` existed are treated as already onboarded so existing
   * players are not forced through the intro again.
   */
  const hasSeenIntro = typeof p.hasSeenIntro === 'boolean' ? p.hasSeenIntro : true

  let unlockedFastTravelPlanets: string[] = []
  if (Array.isArray(p.unlockedFastTravelPlanets)) {
    unlockedFastTravelPlanets = p.unlockedFastTravelPlanets.filter(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0,
    )
  }

  const missionPayMultipliers: Record<string, number> = {}
  if (
    p.missionPayMultipliers !== undefined &&
    p.missionPayMultipliers !== null &&
    typeof p.missionPayMultipliers === 'object' &&
    !Array.isArray(p.missionPayMultipliers)
  ) {
    for (const [planetId, value] of Object.entries(
      p.missionPayMultipliers as Record<string, unknown>,
    )) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        missionPayMultipliers[planetId] = value
      }
    }
  }

  const bodyAccess = normalizeBodyAccess(p.bodyAccess)

  const shuttleBuffs: Record<string, number> = {}
  if (
    p.shuttleBuffs !== undefined &&
    p.shuttleBuffs !== null &&
    typeof p.shuttleBuffs === 'object' &&
    !Array.isArray(p.shuttleBuffs)
  ) {
    for (const [buffId, value] of Object.entries(p.shuttleBuffs as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        shuttleBuffs[buffId] = value
      }
    }
  }

  const disabledGiverIds: Record<string, true> = {}
  if (
    p.disabledGiverIds !== undefined &&
    p.disabledGiverIds !== null &&
    typeof p.disabledGiverIds === 'object' &&
    !Array.isArray(p.disabledGiverIds)
  ) {
    for (const [giverId, value] of Object.entries(p.disabledGiverIds as Record<string, unknown>)) {
      if (value === true) disabledGiverIds[giverId] = true
    }
  }

  const activeStoryFlags: Record<string, true> = {}
  if (
    p.activeStoryFlags !== undefined &&
    p.activeStoryFlags !== null &&
    typeof p.activeStoryFlags === 'object' &&
    !Array.isArray(p.activeStoryFlags)
  ) {
    for (const [flag, value] of Object.entries(p.activeStoryFlags as Record<string, unknown>)) {
      if (value === true) activeStoryFlags[flag] = true
    }
  }

  const hasJourneyFields =
    Array.isArray(p.completedJourneyIds) ||
    (p.journeyStepProgress !== undefined &&
      p.journeyStepProgress !== null &&
      typeof p.journeyStepProgress === 'object' &&
      !Array.isArray(p.journeyStepProgress)) ||
    Array.isArray(p.unlockedFeatureIds)

  let completedJourneyIds: string[] = []
  if (Array.isArray(p.completedJourneyIds)) {
    completedJourneyIds = p.completedJourneyIds.filter(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0,
    )
  } else if (!hasJourneyFields && hasSeenIntro) {
    completedJourneyIds = [WELCOME_JOURNEY_ID]
  }

  const journeyStepProgress: Record<string, string[]> = {}
  if (
    p.journeyStepProgress !== undefined &&
    p.journeyStepProgress !== null &&
    typeof p.journeyStepProgress === 'object' &&
    !Array.isArray(p.journeyStepProgress)
  ) {
    for (const [journeyId, stepIds] of Object.entries(
      p.journeyStepProgress as Record<string, unknown>,
    )) {
      if (!Array.isArray(stepIds)) continue
      journeyStepProgress[journeyId] = stepIds.filter(
        (entry): entry is string => typeof entry === 'string' && entry.length > 0,
      )
    }
  }

  let unlockedFeatureIds: string[] = []
  if (Array.isArray(p.unlockedFeatureIds)) {
    unlockedFeatureIds = p.unlockedFeatureIds.filter(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0,
    )
  } else if (!hasJourneyFields && hasSeenIntro) {
    unlockedFeatureIds = [SLINGSHOT_JOURNEY_FEATURE_ID]
  }

  let announcedJourneyStartIds: string[] = []
  if (Array.isArray(p.announcedJourneyStartIds)) {
    announcedJourneyStartIds = p.announcedJourneyStartIds.filter(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0,
    )
  } else if (hasSeenIntro) {
    // Legacy profiles that already played past the intro shouldn't re-see
    // the "Welcome" begin-banner. Seed with every journey that is already
    // in `completedJourneyIds` plus the welcome journey id — the welcome
    // banner only makes sense for fresh saves from this point forward.
    announcedJourneyStartIds = [...completedJourneyIds, WELCOME_JOURNEY_ID]
  }

  let journeyStartReadyIds: string[] = []
  if (Array.isArray(p.journeyStartReadyIds)) {
    journeyStartReadyIds = p.journeyStartReadyIds.filter(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0,
    )
  }

  const shuttleHullHp =
    typeof p.shuttleHullHp === 'number' && Number.isFinite(p.shuttleHullHp) && p.shuttleHullHp >= 0
      ? p.shuttleHullHp
      : undefined
  const landerHullHp =
    typeof p.landerHullHp === 'number' && Number.isFinite(p.landerHullHp) && p.landerHullHp >= 0
      ? p.landerHullHp
      : undefined

  const cosmetics = normalizePlayerCosmetics(p.cosmetics)
  const fantasiaCosmeticIntroSent =
    typeof p.fantasiaCosmeticIntroSent === 'boolean' ? p.fantasiaCosmeticIntroSent : false
  const habitatAppliances = normalizeHabitatAppliances(p.habitatAppliances)

  const sushiLove = normalizeClampedNumber(
    p.sushiLove,
    DEFAULT_SUSHI_LOVE,
    SUSHI_NEEDS_MIN,
    SUSHI_NEEDS_MAX,
  )
  const sushiHunger = normalizeClampedNumber(
    p.sushiHunger,
    DEFAULT_SUSHI_HUNGER,
    SUSHI_NEEDS_MIN,
    SUSHI_NEEDS_MAX,
  )
  const bowlServings = normalizeClampedNumber(
    p.bowlServings,
    DEFAULT_BOWL_SERVINGS,
    BOWL_SERVINGS_MIN,
    BOWL_SERVINGS_MAX,
  )
  const sushiBladder = normalizeClampedNumber(
    p.sushiBladder,
    DEFAULT_SUSHI_BLADDER,
    SUSHI_NEEDS_MIN,
    SUSHI_NEEDS_MAX,
  )
  const sushiTired = normalizeClampedNumber(
    p.sushiTired,
    DEFAULT_SUSHI_TIRED,
    SUSHI_NEEDS_MIN,
    SUSHI_NEEDS_MAX,
  )
  const litterPollution = Math.round(
    normalizeClampedNumber(
      p.litterPollution,
      DEFAULT_LITTER_POLLUTION,
      LITTER_POLLUTION_MIN,
      LITTER_POLLUTION_MAX,
    ),
  )

  return {
    name: p.name,
    credits: p.credits,
    completedMissionCount,
    visitedAsteroids,
    achievementStats: normalizeAchievementStats(p.achievementStats),
    orbitedSolarBodies,
    lastDockedPlanetId,
    hasSeenIntro,
    unlockedFastTravelPlanets,
    missionPayMultipliers,
    bodyAccess,
    completedJourneyIds,
    journeyStepProgress,
    unlockedFeatureIds,
    announcedJourneyStartIds,
    journeyStartReadyIds,
    shuttleBuffs,
    disabledGiverIds,
    activeStoryFlags: Object.keys(activeStoryFlags).length > 0 ? activeStoryFlags : undefined,
    cosmetics,
    fantasiaCosmeticIntroSent,
    habitatAppliances,
    sushiLove,
    sushiHunger,
    bowlServings,
    sushiBladder,
    sushiTired,
    litterPollution,
    ...(shuttleHullHp !== undefined ? { shuttleHullHp } : {}),
    ...(landerHullHp !== undefined ? { landerHullHp } : {}),
  }
}

/**
 * Default habitat-appliance unlock flags assigned to every fresh and migrated profile.
 * Both optional counter-top props start locked — gameplay events flip them on later.
 */
function createDefaultHabitatAppliances(): PlayerHabitatAppliances {
  return { coffeeMachine: false, recordPlayer: false, refractorTelescope: false }
}

/**
 * Validate and migrate a persisted habitat-appliances block. Unknown shapes (and
 * legacy saves missing the field entirely) fall back to {@link createDefaultHabitatAppliances}.
 *
 * @param raw - Unknown save field from localStorage.
 */
function normalizeHabitatAppliances(raw: unknown): PlayerHabitatAppliances {
  const defaults = createDefaultHabitatAppliances()
  if (raw === undefined || raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaults
  }
  const r = raw as Record<string, unknown>
  return {
    coffeeMachine: typeof r.coffeeMachine === 'boolean' ? r.coffeeMachine : defaults.coffeeMachine,
    recordPlayer: typeof r.recordPlayer === 'boolean' ? r.recordPlayer : defaults.recordPlayer,
    refractorTelescope:
      typeof r.refractorTelescope === 'boolean'
        ? r.refractorTelescope
        : defaults.refractorTelescope,
  }
}

/**
 * Normalize persisted body-access state and seed missing pinned body ids.
 *
 * @param raw - Unknown save field from localStorage.
 * @returns A complete pinned-body access map.
 */
function normalizeBodyAccess(raw: unknown): Record<string, BodyAccessState> {
  const access: Record<string, BodyAccessState> = {}
  if (raw !== undefined && raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [bodyId, value] of Object.entries(raw as Record<string, unknown>)) {
      if (isBodyAccessState(value)) access[bodyId] = value
    }
  }
  for (const body of PINNED_BODIES) {
    access[body.id] ??= DEFAULT_BODY_ACCESS_STATE
  }
  return access
}

/**
 * Runtime guard for persisted body access values.
 *
 * @param value - Unknown saved value.
 * @returns True when value is a supported {@link BodyAccessState}.
 */
function isBodyAccessState(value: unknown): value is BodyAccessState {
  return (
    value === 'restricted' ||
    value === 'unrestricted' ||
    value === 'liberated' ||
    value === 'destroyed'
  )
}

/** Create a fresh profile with starting credits. */
export function createProfile(name: string): PlayerProfile {
  return {
    name,
    credits: STARTING_CREDITS,
    completedMissionCount: 0,
    visitedAsteroids: {},
    achievementStats: createDefaultAchievementStats(),
    orbitedSolarBodies: {},
    lastDockedPlanetId: 'earth',
    hasSeenIntro: false,
    unlockedFastTravelPlanets: [],
    missionPayMultipliers: {},
    bodyAccess: normalizeBodyAccess(undefined),
    completedJourneyIds: [],
    journeyStepProgress: {},
    unlockedFeatureIds: [],
    announcedJourneyStartIds: [],
    journeyStartReadyIds: [],
    shuttleBuffs: {},
    disabledGiverIds: {},
    cosmetics: createDefaultPlayerCosmetics(),
    fantasiaCosmeticIntroSent: false,
    habitatAppliances: createDefaultHabitatAppliances(),
    sushiLove: DEFAULT_SUSHI_LOVE,
    sushiHunger: DEFAULT_SUSHI_HUNGER,
    bowlServings: DEFAULT_BOWL_SERVINGS,
    sushiBladder: DEFAULT_SUSHI_BLADDER,
    sushiTired: DEFAULT_SUSHI_TIRED,
    litterPollution: DEFAULT_LITTER_POLLUTION,
  }
}

/**
 * Return a copy of the profile with `sushiLove` adjusted by `delta` and clamped to
 * `[SUSHI_NEEDS_MIN, SUSHI_NEEDS_MAX]`. Non-finite deltas are treated as zero.
 *
 * @param profile - Current profile.
 * @param delta - Signed amount to apply, e.g. `+5` for petting Sushi or `-1` for decay.
 * @returns Updated profile (same reference when value is unchanged).
 */
export function addSushiLove(profile: PlayerProfile, delta: number): PlayerProfile {
  const safeDelta = Number.isFinite(delta) ? delta : 0
  const next = clampNumber(profile.sushiLove + safeDelta, SUSHI_NEEDS_MIN, SUSHI_NEEDS_MAX)
  if (next === profile.sushiLove) return profile
  return { ...profile, sushiLove: next }
}

/**
 * Return a copy of the profile with `sushiHunger` adjusted by `delta` and clamped to
 * `[SUSHI_NEEDS_MIN, SUSHI_NEEDS_MAX]`. Non-finite deltas are treated as zero.
 *
 * @param profile - Current profile.
 * @param delta - Signed amount to apply, e.g. `+1` for hunger rise or `-25` for feeding.
 * @returns Updated profile (same reference when value is unchanged).
 */
export function addSushiHunger(profile: PlayerProfile, delta: number): PlayerProfile {
  const safeDelta = Number.isFinite(delta) ? delta : 0
  const next = clampNumber(profile.sushiHunger + safeDelta, SUSHI_NEEDS_MIN, SUSHI_NEEDS_MAX)
  if (next === profile.sushiHunger) return profile
  return { ...profile, sushiHunger: next }
}

/**
 * Return a copy of the profile with `sushiBladder` adjusted by `delta` and clamped to
 * `[SUSHI_NEEDS_MIN, SUSHI_NEEDS_MAX]`. Non-finite deltas are treated as zero.
 *
 * @param profile - Current profile.
 * @param delta - Signed amount to apply, e.g. `+2` for bladder rise or `-100` to relieve.
 * @returns Updated profile (same reference when value is unchanged).
 */
export function addSushiBladder(profile: PlayerProfile, delta: number): PlayerProfile {
  const safeDelta = Number.isFinite(delta) ? delta : 0
  const current = profile.sushiBladder ?? DEFAULT_SUSHI_BLADDER
  const next = clampNumber(current + safeDelta, SUSHI_NEEDS_MIN, SUSHI_NEEDS_MAX)
  if (next === current) return profile
  return { ...profile, sushiBladder: next }
}

/**
 * Return a copy of the profile with `sushiTired` adjusted by `delta` and clamped to
 * `[SUSHI_NEEDS_MIN, SUSHI_NEEDS_MAX]`. Non-finite deltas are treated as zero.
 *
 * @param profile - Current profile.
 * @param delta - Signed amount, e.g. `+8 * dt` while chasing the laser or `-100` on wake.
 * @returns Updated profile (same reference when value is unchanged).
 */
export function addSushiTired(profile: PlayerProfile, delta: number): PlayerProfile {
  const safeDelta = Number.isFinite(delta) ? delta : 0
  const current = profile.sushiTired ?? DEFAULT_SUSHI_TIRED
  const next = clampNumber(current + safeDelta, SUSHI_NEEDS_MIN, SUSHI_NEEDS_MAX)
  if (next === current) return profile
  return { ...profile, sushiTired: next }
}

/**
 * Return a copy of the profile with `litterPollution` adjusted by `delta` and clamped
 * to `[LITTER_POLLUTION_MIN, LITTER_POLLUTION_MAX]`. Non-finite deltas are treated as
 * zero. Result is rounded to integer chunks.
 *
 * @param profile - Current profile.
 * @param delta - Signed amount, e.g. `+1` after Sushi uses the litter or `-6` to empty.
 * @returns Updated profile (same reference when value is unchanged).
 */
export function addLitterPollution(profile: PlayerProfile, delta: number): PlayerProfile {
  const safeDelta = Number.isFinite(delta) ? delta : 0
  const current = profile.litterPollution ?? DEFAULT_LITTER_POLLUTION
  const next = Math.round(
    clampNumber(current + safeDelta, LITTER_POLLUTION_MIN, LITTER_POLLUTION_MAX),
  )
  if (next === current) return profile
  return { ...profile, litterPollution: next }
}

/**
 * Return a copy of the profile with `litterPollution` set to `n` and clamped/rounded
 * into `[LITTER_POLLUTION_MIN, LITTER_POLLUTION_MAX]`.
 *
 * @param profile - Current profile.
 * @param n - Target chunk count, e.g. `0` after the player empties the box.
 * @returns Updated profile (same reference when value is unchanged).
 */
export function setLitterPollution(profile: PlayerProfile, n: number): PlayerProfile {
  const next = Math.round(clampNumber(n, LITTER_POLLUTION_MIN, LITTER_POLLUTION_MAX))
  if (next === profile.litterPollution) return profile
  return { ...profile, litterPollution: next }
}

/**
 * Return a copy of the profile with `bowlServings` set to `n` and clamped to
 * `[BOWL_SERVINGS_MIN, BOWL_SERVINGS_MAX]`. Non-finite values clamp to the minimum.
 *
 * @param profile - Current profile.
 * @param n - Target serving count, e.g. `10` after feeding a fresh bag.
 * @returns Updated profile (same reference when value is unchanged).
 */
export function setBowlServings(profile: PlayerProfile, n: number): PlayerProfile {
  const next = clampNumber(n, BOWL_SERVINGS_MIN, BOWL_SERVINGS_MAX)
  if (next === profile.bowlServings) return profile
  return { ...profile, bowlServings: next }
}

/**
 * Return a copy of the profile with {@link PlayerProfile.hasSeenIntro} set to true (intro cinematic seen).
 *
 * @param profile - Current profile.
 */
export function markMapIntroSeen(profile: PlayerProfile): PlayerProfile {
  return { ...profile, hasSeenIntro: true }
}

/**
 * Read the access state for a pinned body from a profile.
 *
 * @param profile - Current profile.
 * @param bodyId - Pinned body id, e.g. `'hektor'`.
 * @returns Access state, defaulting to `'restricted'` when absent.
 */
export function getBodyAccess(profile: PlayerProfile, bodyId: string): BodyAccessState {
  return profile.bodyAccess[bodyId] ?? DEFAULT_BODY_ACCESS_STATE
}

/**
 * Determine whether a contract-pinned body should exist in the planetarium scene.
 *
 * @param state - Current saved access state for the pinned body.
 * @returns True for rendered states, false when the body should be absent from map systems.
 */
export function isBodyRendered(state: BodyAccessState): boolean {
  return state === 'unrestricted' || state === 'liberated'
}

/**
 * Return a copy of the profile with a pinned body's access state updated.
 *
 * @param profile - Current profile.
 * @param bodyId - Pinned body id, e.g. `'hektor'`.
 * @param state - New body access state.
 * @returns Updated profile.
 */
export function setBodyAccess(
  profile: PlayerProfile,
  bodyId: string,
  state: BodyAccessState,
): PlayerProfile {
  if (profile.bodyAccess[bodyId] === state) return profile
  return {
    ...profile,
    bodyAccess: {
      ...profile.bodyAccess,
      [bodyId]: state,
    },
  }
}

/** Serialize and save the profile to localStorage. */
export function saveProfile(profile: PlayerProfile): void {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
}

/** localStorage key set after the player submits their callsign in the name-entry dialog. */
const NAME_CONFIRMED_STORAGE_KEY = 'asteroid-lander-name-confirmed'

/**
 * True once the player has submitted their callsign in the name-entry dialog. Returns
 * false for fresh sessions, refreshes that landed on the dialog without submitting,
 * and saves predating this flag (so legacy 'Pilot' placeholders re-prompt once).
 */
export function isPlayerNameConfirmed(): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(NAME_CONFIRMED_STORAGE_KEY) === 'true'
}

/** Mark the player's display name as confirmed so future loads skip the name-entry dialog. */
export function markPlayerNameConfirmed(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(NAME_CONFIRMED_STORAGE_KEY, 'true')
}

/** Load the profile from localStorage. Returns null if missing or corrupted. */
export function loadProfile(): PlayerProfile | null {
  const raw = localStorage.getItem(PROFILE_STORAGE_KEY)
  if (raw === null) return null
  try {
    return normalizeLoadedProfile(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

/**
 * Return a new profile with credits increased by a finite positive amount.
 *
 * @param profile - Current profile.
 * @param amount - Credits to add, e.g. `500` for a mission payout.
 * @returns Updated profile, or the same profile when amount is not positive and finite.
 */
export function addCredits(profile: PlayerProfile, amount: number): PlayerProfile {
  if (!isPositiveFiniteAmount(amount)) return profile
  const achievementStats = getAchievementStats(profile)
  return {
    ...profile,
    credits: profile.credits + amount,
    achievementStats: {
      ...achievementStats,
      lifetimeCreditsEarned: achievementStats.lifetimeCreditsEarned + amount,
    },
  }
}

/**
 * Return a new profile with credits decreased when the player can afford the purchase.
 *
 * @param profile - Current profile.
 * @param amount - Credits to spend, e.g. `300` for a shop purchase.
 * @returns Updated profile, or null when amount is invalid or balance is insufficient.
 */
export function spendCredits(profile: PlayerProfile, amount: number): PlayerProfile | null {
  if (!isPositiveFiniteAmount(amount) || profile.credits < amount) return null
  const achievementStats = getAchievementStats(profile)
  return {
    ...profile,
    credits: profile.credits - amount,
    achievementStats: {
      ...achievementStats,
      lifetimeCreditsSpent: achievementStats.lifetimeCreditsSpent + amount,
    },
  }
}

/**
 * Record credits earned from trade without changing the current balance.
 *
 * @param profile - Current profile.
 * @param amount - Trade credits earned, e.g. `250` from selling cargo.
 * @returns Updated profile, or the same profile when amount is not positive and finite.
 */
export function recordTradeCreditsEarned(profile: PlayerProfile, amount: number): PlayerProfile {
  if (!isPositiveFiniteAmount(amount)) return profile
  const achievementStats = getAchievementStats(profile)
  return {
    ...profile,
    achievementStats: {
      ...achievementStats,
      lifetimeTradeCreditsEarned: achievementStats.lifetimeTradeCreditsEarned + amount,
    },
  }
}

/**
 * Record credits earned from Fantasia's Cargo Intake tab without changing the balance again
 * (balance is already updated by {@link addCredits} on the same sale).
 *
 * @param profile - Current profile.
 * @param amount - Premium intake payout total, e.g. `1200` after selling stacked trade goods.
 * @returns Updated profile, or the same profile when amount is not positive and finite.
 */
export function recordCargoIntakeCreditsEarned(
  profile: PlayerProfile,
  amount: number,
): PlayerProfile {
  if (!isPositiveFiniteAmount(amount)) return profile
  const achievementStats = getAchievementStats(profile)
  return {
    ...profile,
    achievementStats: {
      ...achievementStats,
      lifetimeCargoIntakeCreditsEarned:
        achievementStats.lifetimeCargoIntakeCreditsEarned + amount,
    },
  }
}

/**
 * Record one completed mission objective of a specific type.
 *
 * @param profile - Current profile.
 * @param objectiveType - Objective type id, e.g. `'survey'`.
 * @returns Updated profile, or the same profile when objectiveType is blank.
 */
export function recordMissionObjectiveComplete(
  profile: PlayerProfile,
  objectiveType: string,
): PlayerProfile {
  if (objectiveType.trim().length === 0) return profile
  const achievementStats = getAchievementStats(profile)
  return {
    ...profile,
    achievementStats: {
      ...achievementStats,
      missionObjectivesCompletedByType: incrementCountMap(
        achievementStats.missionObjectivesCompletedByType,
        objectiveType,
      ),
    },
  }
}

/**
 * Record a batch of runtime mission-tip ids that fired during one completed mission.
 * Each id increments the tip's lifetime show count; blank ids are ignored.
 *
 * @param profile - Current profile.
 * @param ids - Runtime tip ids dispatched in the just-completed mission.
 * @returns Updated profile, or the same profile when nothing valid was passed.
 */
export function recordRuntimeTipsShown(
  profile: PlayerProfile,
  ids: readonly string[],
): PlayerProfile {
  const valid = ids.filter((id) => typeof id === 'string' && id.trim().length > 0)
  if (valid.length === 0) return profile
  const achievementStats = getAchievementStats(profile)
  let runtimeTipsShownCount = achievementStats.runtimeTipsShownCount
  for (const id of valid) {
    runtimeTipsShownCount = incrementCountMap(runtimeTipsShownCount, id)
  }
  return {
    ...profile,
    achievementStats: {
      ...achievementStats,
      runtimeTipsShownCount,
    },
  }
}

/**
 * Record one successful slingshot launch around a gravity body.
 *
 * @param profile - Current profile.
 * @param bodyId - Gravity body id, e.g. `'sun'`.
 * @returns Updated profile, or the same profile when bodyId is blank.
 */
export function recordSlingshotLaunch(profile: PlayerProfile, bodyId: string): PlayerProfile {
  if (bodyId.trim().length === 0) return profile
  const achievementStats = getAchievementStats(profile)
  return {
    ...profile,
    achievementStats: {
      ...achievementStats,
      slingshotLaunches: achievementStats.slingshotLaunches + ACHIEVEMENT_COUNTER_INCREMENT,
      slingshotLaunchesByBody: incrementCountMap(achievementStats.slingshotLaunchesByBody, bodyId),
    },
  }
}

/**
 * Record one gravity-surf start event.
 *
 * @param profile - Current profile.
 * @returns Updated profile with only achievement stats changed.
 */
export function recordGravitySurfStart(profile: PlayerProfile): PlayerProfile {
  const achievementStats = getAchievementStats(profile)
  return {
    ...profile,
    achievementStats: {
      ...achievementStats,
      gravitySurfStarts: achievementStats.gravitySurfStarts + ACHIEVEMENT_COUNTER_INCREMENT,
    },
  }
}

/**
 * Record one manifold ride event.
 *
 * @param profile - Current profile.
 * @returns Updated profile with only achievement stats changed.
 */
export function recordManifoldRide(profile: PlayerProfile): PlayerProfile {
  const achievementStats = getAchievementStats(profile)
  return {
    ...profile,
    achievementStats: {
      ...achievementStats,
      manifoldRides: achievementStats.manifoldRides + ACHIEVEMENT_COUNTER_INCREMENT,
    },
  }
}

/**
 * Record one portal departure event.
 *
 * @param profile - Current profile.
 * @returns Updated profile with only achievement stats changed.
 */
export function recordPortalDeparture(profile: PlayerProfile): PlayerProfile {
  const achievementStats = getAchievementStats(profile)
  return {
    ...profile,
    achievementStats: {
      ...achievementStats,
      portalDepartures: achievementStats.portalDepartures + ACHIEVEMENT_COUNTER_INCREMENT,
    },
  }
}

/**
 * Record world-line travel distance totals for achievement evaluation.
 *
 * @param profile - Current profile.
 * @param segmentDistance - Distance traveled by the latest segment, e.g. `100`.
 * @param currentRunDistance - Total distance reached by the current run, e.g. `250`.
 * @returns Updated profile, or the same profile when either distance is not positive and finite.
 */
export function recordWorldLineDistance(
  profile: PlayerProfile,
  segmentDistance: number,
  currentRunDistance: number,
): PlayerProfile {
  if (!isPositiveFiniteAmount(segmentDistance) || !isPositiveFiniteAmount(currentRunDistance)) {
    return profile
  }
  const achievementStats = getAchievementStats(profile)
  return {
    ...profile,
    achievementStats: {
      ...achievementStats,
      lifetimeWorldLineDistance: achievementStats.lifetimeWorldLineDistance + segmentDistance,
      maxSingleRunWorldLineDistance: Math.max(
        achievementStats.maxSingleRunWorldLineDistance,
        currentRunDistance,
      ),
    },
  }
}

/**
 * Record one successful pet of Sushi the cat. Increments the lifetime pet counter on
 * the achievement stats block; the love meter delta is the caller's responsibility.
 *
 * @param profile - Current profile.
 * @returns Updated profile with `achievementStats.sushiPetCount` incremented by one.
 */
export function recordSushiPet(profile: PlayerProfile): PlayerProfile {
  const achievementStats = getAchievementStats(profile)
  return {
    ...profile,
    achievementStats: {
      ...achievementStats,
      sushiPetCount: achievementStats.sushiPetCount + ACHIEVEMENT_COUNTER_INCREMENT,
    },
  }
}

/**
 * Record one bowl refill performed while the bowl was empty. Top-offs while the bowl
 * still has servings should not call this — only true empty-bowl rescues count toward
 * the "Bowl-Filler" achievement.
 *
 * @param profile - Current profile.
 * @returns Updated profile with `achievementStats.sushiBowlRefillCount` incremented by one.
 */
export function recordSushiBowlRefill(profile: PlayerProfile): PlayerProfile {
  const achievementStats = getAchievementStats(profile)
  return {
    ...profile,
    achievementStats: {
      ...achievementStats,
      sushiBowlRefillCount: achievementStats.sushiBowlRefillCount + ACHIEVEMENT_COUNTER_INCREMENT,
    },
  }
}

/** Return a new profile with completedMissionCount incremented by 1. */
export function recordMissionComplete(profile: PlayerProfile): PlayerProfile {
  return { ...profile, completedMissionCount: profile.completedMissionCount + 1 }
}

/** Return a new profile with the visit count for the given asteroid incremented by 1. */
export function recordAsteroidVisit(profile: PlayerProfile, asteroidId: string): PlayerProfile {
  const currentCount = profile.visitedAsteroids[asteroidId] ?? 0
  return {
    ...profile,
    visitedAsteroids: {
      ...profile.visitedAsteroids,
      [asteroidId]: currentCount + 1,
    },
  }
}

/**
 * Mark a solar map body as visited for first-orbit achievements if not already recorded.
 *
 * @param profile - Current profile.
 * @param bodyKey - Planet id from the planetarium catalog or `"sun"`.
 * @returns Same profile reference when already orbited; otherwise a copy with `orbitedSolarBodies` set.
 */
export function recordSolarBodyFirstOrbit(profile: PlayerProfile, bodyKey: string): PlayerProfile {
  if ((profile.orbitedSolarBodies[bodyKey] ?? 0) > 0) return profile
  return {
    ...profile,
    orbitedSolarBodies: {
      ...profile.orbitedSolarBodies,
      [bodyKey]: 1,
    },
  }
}

/** Return a copy of the profile with the map respawn planet updated. */
export function setLastDockedPlanet(profile: PlayerProfile, planetId: string): PlayerProfile {
  if (profile.lastDockedPlanetId === planetId) return profile
  return { ...profile, lastDockedPlanetId: planetId }
}

/**
 * Return a copy of the profile with `planetId` added to the fast-travel unlock list.
 * No-op when the planet is already unlocked.
 *
 * @param profile - Current profile.
 * @param planetId - Planet id to unlock for fast travel.
 */
export function unlockFastTravelPlanet(profile: PlayerProfile, planetId: string): PlayerProfile {
  if (profile.unlockedFastTravelPlanets.includes(planetId)) return profile
  return {
    ...profile,
    unlockedFastTravelPlanets: [...profile.unlockedFastTravelPlanets, planetId],
  }
}

/**
 * Return a copy of the profile with the per-planet mission pay multiplier updated.
 * Higher of existing/new is kept so a contract reward never downgrades a previous bonus.
 *
 * @param profile - Current profile.
 * @param planetId - Planet whose missions receive the multiplier.
 * @param multiplier - Numeric multiplier (e.g. `2` for 2x pay).
 */
export function setMissionPayMultiplier(
  profile: PlayerProfile,
  planetId: string,
  multiplier: number,
): PlayerProfile {
  const existing = profile.missionPayMultipliers[planetId] ?? 1
  const next = Math.max(existing, multiplier)
  if (next === existing && planetId in profile.missionPayMultipliers) return profile
  return {
    ...profile,
    missionPayMultipliers: {
      ...profile.missionPayMultipliers,
      [planetId]: next,
    },
  }
}

/**
 * Resolve the per-planet pay multiplier (defaults to `1` when no contract has unlocked one).
 *
 * @param profile - Current profile.
 * @param planetId - Giver planet id (e.g. `'earth'`).
 * @returns Multiplier applied to mission credit rewards.
 */
export function getMissionPayMultiplier(profile: PlayerProfile, planetId: string | null): number {
  if (!planetId) return 1
  return profile.missionPayMultipliers[planetId] ?? 1
}

/**
 * Set or replace a shuttle-buff multiplier on the profile.
 *
 * @param profile - Current profile.
 * @param buffId - Buff id from the reward effect (e.g. `'jovianEmpowerment'`).
 * @param multiplier - New multiplier value.
 * @returns Profile with the buff applied (existing entry replaced).
 */
export function setShuttleBuff(
  profile: PlayerProfile,
  buffId: string,
  multiplier: number,
): PlayerProfile {
  const next: Record<string, number> = { ...profile.shuttleBuffs, [buffId]: multiplier }
  return { ...profile, shuttleBuffs: next }
}

/**
 * Mark a giver id as disabled (plan 7 reads this to suppress mission board entries).
 *
 * @param profile - Current profile.
 * @param giverId - Giver id from the reward effect (e.g. `'jovian-society'`).
 * @returns Profile with the giver disabled.
 */
export function disableGiver(profile: PlayerProfile, giverId: string): PlayerProfile {
  if (profile.disabledGiverIds?.[giverId] === true) return profile
  const next: Record<string, true> = { ...profile.disabledGiverIds, [giverId]: true }
  return { ...profile, disabledGiverIds: next }
}

/**
 * Set a story flag on the player profile. Idempotent — re-setting an existing
 * flag is a no-op. Returns a new profile object (does not mutate input).
 *
 * @param profile - Source profile.
 * @param flag - Stable string id (e.g. `'jovianContractTampered'`).
 * @returns Profile with `activeStoryFlags[flag] = true`.
 */
export function setStoryFlag(profile: PlayerProfile, flag: string): PlayerProfile {
  const existing = profile.activeStoryFlags ?? {}
  if (existing[flag] === true) return profile
  return {
    ...profile,
    activeStoryFlags: { ...existing, [flag]: true as const },
  }
}

/**
 * Check whether a story flag is set on the player profile.
 *
 * @param profile - Profile to check.
 * @param flag - Flag id.
 * @returns `true` when the flag is set, `false` otherwise.
 */
export function hasStoryFlag(profile: PlayerProfile, flag: string): boolean {
  return profile.activeStoryFlags?.[flag] === true
}
