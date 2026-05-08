/**
 * Solar poster catalog and achievement visibility helpers.
 *
 * @author guinetik
 * @date 2026-05-07
 * @spec docs/superpowers/specs/2026-04-03-player-profile-design.md
 */
import rawSolarPosterCatalog from '@/data/posters/solar-posters.json'

/**
 * Authored poster slot id. Values come from `src/data/posters/solar-posters.json`,
 * e.g. `'mars'` or `'jupiter'`.
 */
export type SolarPosterId = string

/**
 * Authored poster slot shown on the habitat solar poster wall.
 */
export interface SolarPosterDefinition {
  /** Stable slot id, valid as a lookup key, e.g. `'saturn'`. */
  readonly id: SolarPosterId
  /** Solar body progress key, matching achievement orbit keys, e.g. `'sun'` or `'mars'`. */
  readonly bodyKey: string
  /** Human-readable body name used for object names and debugging, e.g. `'Mercury'`. */
  readonly label: string
  /** Public poster image URL served by Vite, e.g. `'/posters/venus.webp'`. */
  readonly assetPath: string
  /**
   * Achievement id that unlocks this poster, e.g. `'exploration-orbit-neptune'`.
   * `null` means the poster is available by default.
   */
  readonly achievementId: string | null
  /** Whether this poster is visible before checking achievements, e.g. Earth starts visible. */
  readonly defaultUnlocked: boolean
}

/**
 * Visibility row for a poster slot after comparing authored data with unlocked achievements.
 */
export interface SolarPosterVisibility {
  /** Authored poster slot definition. */
  readonly poster: SolarPosterDefinition
  /** Whether the poster image should be visible inside its frame. */
  readonly unlocked: boolean
}

/**
 * Large completion poster awarded after every achievement-backed solar poster unlocks.
 */
export interface SolarCompletionPosterDefinition {
  /** Stable id for the completion poster, e.g. `'solar-completion'`. */
  readonly id: string
  /** Human-readable poster name used for object names and debugging. */
  readonly label: string
  /** Public poster image URL served by Vite, e.g. `'/posters/001.webp'`. */
  readonly assetPath: string
}

const rawCatalog = rawSolarPosterCatalog as readonly SolarPosterDefinition[]

/** Solar poster slots in display order from the Sun outward. */
export const SOLAR_POSTER_CATALOG: readonly SolarPosterDefinition[] = rawCatalog

/** Large completion poster shown after all achievement-backed solar posters unlock. */
export const SOLAR_COMPLETION_POSTER: SolarCompletionPosterDefinition = {
  id: 'solar-completion',
  label: 'Solar Completion',
  assetPath: getCompletionPosterAssetPath(rawCatalog),
}

/**
 * Validate the authored poster catalog when this module loads.
 *
 * @param posters - Poster definitions to validate.
 * @throws {Error} When duplicate ids or malformed rows are detected.
 */
function validateSolarPosterCatalog(posters: readonly SolarPosterDefinition[]): void {
  const ids = new Set<string>()
  for (const poster of posters) {
    if (!poster.id.trim()) throw new Error('solar posters: missing poster id')
    if (ids.has(poster.id)) throw new Error(`solar posters: duplicate poster id "${poster.id}"`)
    ids.add(poster.id)
    if (!poster.bodyKey.trim()) {
      throw new Error(`solar posters: "${poster.id}" missing bodyKey`)
    }
    if (!poster.label.trim()) {
      throw new Error(`solar posters: "${poster.id}" missing label`)
    }
    if (!poster.assetPath.startsWith('/posters/')) {
      throw new Error(`solar posters: "${poster.id}" assetPath must point at /posters/`)
    }
    if (poster.achievementId !== null && !poster.achievementId.trim()) {
      throw new Error(`solar posters: "${poster.id}" has blank achievementId`)
    }
  }
}

/**
 * Returns true when a poster should show its image for the provided achievements.
 *
 * @param poster - Authored poster definition to evaluate.
 * @param unlockedAchievementIds - Persisted achievement ids, e.g. from `loadUnlockedAchievementIds`.
 * @returns Whether the poster image should be visible.
 */
export function isSolarPosterUnlocked(
  poster: SolarPosterDefinition,
  unlockedAchievementIds: readonly string[],
): boolean {
  if (poster.defaultUnlocked) return true
  if (poster.achievementId === null) return false
  return new Set(unlockedAchievementIds).has(poster.achievementId)
}

/**
 * Builds the full wall visibility model while preserving authored solar order.
 *
 * @param unlockedAchievementIds - Persisted achievement ids used to unlock poster slots.
 * @param posters - Poster catalog, defaulting to {@link SOLAR_POSTER_CATALOG}.
 * @returns Visibility rows in fixed display order.
 */
export function getSolarPosterVisibility(
  unlockedAchievementIds: readonly string[],
  posters: readonly SolarPosterDefinition[] = SOLAR_POSTER_CATALOG,
): SolarPosterVisibility[] {
  return posters.map((poster) => ({
    poster,
    unlocked: isSolarPosterUnlocked(poster, unlockedAchievementIds),
  }))
}

/**
 * Returns the poster ids whose image planes should currently be visible.
 *
 * @param unlockedAchievementIds - Persisted achievement ids used to unlock poster slots.
 * @param posters - Poster catalog, defaulting to {@link SOLAR_POSTER_CATALOG}.
 * @returns Visible poster ids, e.g. `['earth', 'jupiter']`.
 */
export function getUnlockedSolarPosterIds(
  unlockedAchievementIds: readonly string[],
  posters: readonly SolarPosterDefinition[] = SOLAR_POSTER_CATALOG,
): SolarPosterId[] {
  return getSolarPosterVisibility(unlockedAchievementIds, posters)
    .filter((row) => row.unlocked)
    .map((row) => row.poster.id)
}

/**
 * Returns true when every achievement-backed poster in the supplied catalog is unlocked.
 *
 * @param unlockedAchievementIds - Persisted achievement ids used to unlock poster slots.
 * @param posters - Poster catalog, defaulting to {@link SOLAR_POSTER_CATALOG}.
 * @returns Whether the large completion poster should be visible.
 */
export function isSolarCompletionPosterUnlocked(
  unlockedAchievementIds: readonly string[],
  posters: readonly SolarPosterDefinition[] = SOLAR_POSTER_CATALOG,
): boolean {
  const unlocked = new Set(unlockedAchievementIds)
  return posters.every((poster) => poster.achievementId === null || unlocked.has(poster.achievementId))
}

/**
 * Finds one poster definition by id.
 *
 * @param id - Poster id to look up, e.g. `'pluto'`.
 * @param posters - Poster catalog, defaulting to {@link SOLAR_POSTER_CATALOG}.
 * @returns Matching poster definition, or `null` when absent.
 */
export function getSolarPosterById(
  id: SolarPosterId,
  posters: readonly SolarPosterDefinition[] = SOLAR_POSTER_CATALOG,
): SolarPosterDefinition | null {
  return posters.find((poster) => poster.id === id) ?? null
}

/**
 * Select the authored source art for the completion poster.
 *
 * @param posters - Poster definitions to search.
 * @returns Asset path for the Sun preview poster, e.g. `'/posters/001.webp'`.
 * @throws {Error} When the Sun poster is missing from the catalog.
 */
function getCompletionPosterAssetPath(posters: readonly SolarPosterDefinition[]): string {
  const sunPoster = posters.find((poster) => poster.id === 'sun')
  if (!sunPoster) throw new Error('solar posters: missing sun poster for completion art')
  return sunPoster.assetPath
}

validateSolarPosterCatalog(SOLAR_POSTER_CATALOG)
