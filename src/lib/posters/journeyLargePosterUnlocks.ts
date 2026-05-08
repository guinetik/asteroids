/**
 * Large journey posters — Act I on the hatch wall (−Z), Act II on the mess bulkhead (+Z).
 * Same scale as the solar completion frame.
 *
 * @author guinetik
 * @date 2026-05-08
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */
import rawJourneyLargePosters from '@/data/posters/journey-large-posters.json'
import {
  isSolarPosterUnlocked,
  validatePosterCatalog,
  type SolarPosterDefinition,
  type SolarPosterId,
} from '@/lib/posters/solarPosterUnlocks'

/** Authored rows for {@link JOURNEY_LARGE_POSTER_CATALOG} (Act I then Act II display order). */
export interface JourneyLargePosterVisibility {
  /** Poster definition for one wall-mounted journey frame. */
  readonly poster: SolarPosterDefinition
  /** Whether the poster image should be visible. */
  readonly unlocked: boolean
}

const raw = rawJourneyLargePosters as readonly SolarPosterDefinition[]

/**
 * Act I journey art beside the solar grid on the −Z hatch wall; Act II flanking the mess console
 * on the +Z bulkhead (large format, same baseline Y as the solar completion frame).
 */
export const JOURNEY_LARGE_POSTER_CATALOG: readonly SolarPosterDefinition[] = raw

/**
 * Visibility for journey wall posters in Act I → Act II catalog order.
 *
 * @param unlockedAchievementIds - Persisted achievement ids from profile storage.
 * @param posters - Catalog, defaulting to {@link JOURNEY_LARGE_POSTER_CATALOG}.
 */
export function getJourneyLargePosterVisibility(
  unlockedAchievementIds: readonly string[],
  posters: readonly SolarPosterDefinition[] = JOURNEY_LARGE_POSTER_CATALOG,
): JourneyLargePosterVisibility[] {
  return posters.map((poster) => ({
    poster,
    unlocked: isSolarPosterUnlocked(poster, unlockedAchievementIds),
  }))
}

/**
 * Returns visible journey wall poster ids in port → starboard order.
 *
 * @param unlockedAchievementIds - Persisted achievement ids.
 * @param posters - Catalog, defaulting to {@link JOURNEY_LARGE_POSTER_CATALOG}.
 */
export function getUnlockedJourneyLargePosterIds(
  unlockedAchievementIds: readonly string[],
  posters: readonly SolarPosterDefinition[] = JOURNEY_LARGE_POSTER_CATALOG,
): SolarPosterId[] {
  return getJourneyLargePosterVisibility(unlockedAchievementIds, posters)
    .filter((row) => row.unlocked)
    .map((row) => row.poster.id)
}

validatePosterCatalog(JOURNEY_LARGE_POSTER_CATALOG)
if (JOURNEY_LARGE_POSTER_CATALOG.length !== 2) {
  throw new Error('journey large posters: expected exactly two rows (port Act I, starboard Act II)')
}
