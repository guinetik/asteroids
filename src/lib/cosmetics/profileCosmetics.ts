/**
 * Default cosmetics block, profile migration, shuttle title normalization, and ownership helpers.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-30-pimp-my-shuttle-shop-design.md
 */

import type { CosmeticCategory, PlayerCosmetics } from './types'
import type { PlayerProfile } from '@/lib/player/types'
import { findCosmeticOptionById, getCosmeticOptions, listAllCosmeticOptions } from './catalog'

/** Maximum visible characters persisted for a custom shuttle title. */
export const SHUTTLE_TITLE_MAX_VISIBLE_CHARS = 24

/** Collapse internal whitespace to single spaces when trimming titles. */
const TITLE_WHITESPACE_COLLAPSE = /\s+/g

/**
 * Default starter ids chosen from the first row of each non-title category in catalog file order.
 *
 * @param category - Cosmetic category.
 */
function firstOptionIdForCategory(category: CosmeticCategory): string {
  const rows = getCosmeticOptions(category)
  const first = rows[0]
  if (!first) {
    throw new Error(`cosmetics profile: missing catalog rows for '${category}'`)
  }
  return first.id
}

/**
 * Build the initial ownership + active selection block for a fresh profile save.
 */
export function createDefaultPlayerCosmetics(): PlayerCosmetics {
  const shuttlePaintjobId = firstOptionIdForCategory('shuttle-paintjob')
  const landerPaintjobId = firstOptionIdForCategory('lander-paintjob')
  const vehicleFlagId = firstOptionIdForCategory('vehicle-flag')
  const shuttleThrusterTrailId = firstOptionIdForCategory('shuttle-thruster-trail')
  const landerThrusterTrailId = firstOptionIdForCategory('lander-thruster-trail')
  const multitoolPaintjobId = firstOptionIdForCategory('multitool-paintjob')
  const habitatInteriorId = firstOptionIdForCategory('habitat-interior')

  const starterOwned = [
    shuttlePaintjobId,
    landerPaintjobId,
    vehicleFlagId,
    shuttleThrusterTrailId,
    landerThrusterTrailId,
    multitoolPaintjobId,
    habitatInteriorId,
  ]

  return {
    ownedOptionIds: starterOwned,
    shuttlePaintjobId,
    landerPaintjobId,
    shuttleTitle: '',
    vehicleFlagId,
    shuttleThrusterTrailId,
    landerThrusterTrailId,
    multitoolPaintjobId,
    habitatInteriorId,
  }
}

/**
 * Normalize a raw title from the UI: trim edges, collapse whitespace, hard cap length.
 * Returns empty string when nothing remains (invalid purchase target).
 *
 * @param rawTitle - User input from the rename field.
 */
export function normalizeShuttleTitle(rawTitle: string): string {
  const collapsed = rawTitle.trim().replace(TITLE_WHITESPACE_COLLAPSE, ' ')
  if (collapsed.length === 0) return ''
  if (collapsed.length <= SHUTTLE_TITLE_MAX_VISIBLE_CHARS) return collapsed
  return collapsed.slice(0, SHUTTLE_TITLE_MAX_VISIBLE_CHARS)
}

/**
 * Returns every unique category tab that has at least one catalog row.
 */
export function getCosmeticCategories(): readonly CosmeticCategory[] {
  const categories = new Set<CosmeticCategory>()
  for (const option of listAllCosmeticOptions()) {
    categories.add(option.category)
  }
  return [...categories]
}

/**
 * Read cosmetics from a profile, falling back to defaults when absent.
 *
 * @param profile - Active player profile.
 */
export function getPlayerCosmetics(profile: PlayerProfile): PlayerCosmetics {
  return profile.cosmetics ?? createDefaultPlayerCosmetics()
}

/**
 * Returns true when the option id is listed in {@link PlayerCosmetics.ownedOptionIds}.
 *
 * @param cosmetics - Active cosmetics block.
 * @param optionId - Catalog cosmetic id.
 */
export function playerOwnsCosmeticOption(cosmetics: PlayerCosmetics, optionId: string): boolean {
  return cosmetics.ownedOptionIds.includes(optionId)
}

/**
 * Attach or repair a {@link PlayerCosmetics} block without mutating unrelated profile fields.
 *
 * @param cosmetics - Unknown save payload.
 */
export function normalizePlayerCosmetics(cosmetics: unknown): PlayerCosmetics {
  const defaults = createDefaultPlayerCosmetics()
  if (cosmetics === undefined || cosmetics === null || typeof cosmetics !== 'object') {
    return defaults
  }

  const raw = cosmetics as Record<string, unknown>
  const ownedRaw = raw['ownedOptionIds']

  let ownedOptionIds: string[] = [...defaults.ownedOptionIds]
  if (Array.isArray(ownedRaw)) {
    const filtered = ownedRaw.filter(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0,
    )
    if (filtered.length > 0) ownedOptionIds = [...new Set(filtered)]
  }

  const readId = (field: string, fallback: string): string => {
    const v = raw[field]
    if (typeof v !== 'string' || v.trim() === '') return fallback
    const option = findCosmeticOptionById(v)
    return option ? v : fallback
  }

  const shuttleTitleRaw = raw['shuttleTitle']
  const shuttleTitle =
    typeof shuttleTitleRaw === 'string'
      ? normalizeShuttleTitle(shuttleTitleRaw)
      : defaults.shuttleTitle

  const merged: PlayerCosmetics = {
    ownedOptionIds,
    shuttlePaintjobId: readId('shuttlePaintjobId', defaults.shuttlePaintjobId),
    landerPaintjobId: readId('landerPaintjobId', defaults.landerPaintjobId),
    shuttleTitle,
    vehicleFlagId: readId('vehicleFlagId', defaults.vehicleFlagId),
    shuttleThrusterTrailId: readId('shuttleThrusterTrailId', defaults.shuttleThrusterTrailId),
    landerThrusterTrailId: readId('landerThrusterTrailId', defaults.landerThrusterTrailId),
    multitoolPaintjobId: readId('multitoolPaintjobId', defaults.multitoolPaintjobId),
    habitatInteriorId: readId('habitatInteriorId', defaults.habitatInteriorId),
  }

  /**
   * Guarantee every active selection can be applied: seed missing ownership for selections that
   * still exist in-catalog (legacy installs may omit `ownedOptionIds`).
   */
  const requiredOwned = [
    merged.shuttlePaintjobId,
    merged.landerPaintjobId,
    merged.vehicleFlagId,
    merged.shuttleThrusterTrailId,
    merged.landerThrusterTrailId,
    merged.multitoolPaintjobId,
    merged.habitatInteriorId,
  ]

  let nextOwned = merged.ownedOptionIds
  for (const candidate of requiredOwned) {
    if (!nextOwned.includes(candidate)) {
      nextOwned = [...nextOwned, candidate]
    }
  }

  const freeSkuIds = listAllCosmeticOptions()
    .filter((option) => option.price === 0)
    .map((option) => option.id)
  for (const freeId of freeSkuIds) {
    if (!nextOwned.includes(freeId)) {
      nextOwned = [...nextOwned, freeId]
    }
  }

  return { ...merged, ownedOptionIds: nextOwned }
}

/**
 * Return the active cosmetic id applied for a category; shuttle title reads the string field.
 *
 * @param cosmetics - Cosmetics state.
 * @param category - Category to inspect.
 */
export function getActiveCosmeticOptionId(
  cosmetics: PlayerCosmetics,
  category: CosmeticCategory,
): string | undefined {
  if (category === 'shuttle-paintjob') return cosmetics.shuttlePaintjobId
  if (category === 'lander-paintjob') return cosmetics.landerPaintjobId
  if (category === 'vehicle-flag') return cosmetics.vehicleFlagId
  if (category === 'shuttle-thruster-trail') return cosmetics.shuttleThrusterTrailId
  if (category === 'lander-thruster-trail') return cosmetics.landerThrusterTrailId
  if (category === 'multitool-paintjob') return cosmetics.multitoolPaintjobId
  if (category === 'habitat-interior') return cosmetics.habitatInteriorId
  return undefined
}
