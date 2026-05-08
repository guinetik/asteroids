/**
 * Table-side habitat poster catalog (three slots above the mess table).
 *
 * @author guinetik
 * @date 2026-05-08
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */
import rawTablePosterCatalog from '@/data/posters/table-posters.json'
import {
  isSolarPosterUnlocked,
  validatePosterCatalog,
  type SolarPosterDefinition,
  type SolarPosterId,
} from '@/lib/posters/solarPosterUnlocks'

/**
 * Visibility row for a table poster after comparing authored data with unlocked achievements.
 */
export interface TablePosterVisibility {
  /** Authored poster slot definition. */
  readonly poster: SolarPosterDefinition
  /** Whether the poster image should be visible inside its frame. */
  readonly unlocked: boolean
}

const rawTable = rawTablePosterCatalog as readonly SolarPosterDefinition[]

/** Posters on the front-cap wall, centered above the table (lander → EVA → shuttle). */
export const TABLE_POSTER_CATALOG: readonly SolarPosterDefinition[] = rawTable

/**
 * Builds visibility for the three table posters while preserving authored order.
 *
 * @param unlockedAchievementIds - Persisted achievement ids used to unlock poster slots.
 * @param posters - Poster catalog, defaulting to {@link TABLE_POSTER_CATALOG}.
 * @returns Visibility rows in fixed display order.
 */
export function getTablePosterVisibility(
  unlockedAchievementIds: readonly string[],
  posters: readonly SolarPosterDefinition[] = TABLE_POSTER_CATALOG,
): TablePosterVisibility[] {
  return posters.map((poster) => ({
    poster,
    unlocked: isSolarPosterUnlocked(poster, unlockedAchievementIds),
  }))
}

/**
 * Returns table poster ids whose image planes should currently be visible.
 *
 * @param unlockedAchievementIds - Persisted achievement ids from profile storage.
 * @param posters - Poster catalog, defaulting to {@link TABLE_POSTER_CATALOG}.
 * @returns Visible poster ids in catalog order.
 */
export function getUnlockedTablePosterIds(
  unlockedAchievementIds: readonly string[],
  posters: readonly SolarPosterDefinition[] = TABLE_POSTER_CATALOG,
): SolarPosterId[] {
  return getTablePosterVisibility(unlockedAchievementIds, posters)
    .filter((row) => row.unlocked)
    .map((row) => row.poster.id)
}

validatePosterCatalog(TABLE_POSTER_CATALOG)
