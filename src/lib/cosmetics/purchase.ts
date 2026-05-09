/**
 * Pure purchase and apply rules for Pimp My Shuttle! cosmetics.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-30-pimp-my-shuttle-shop-design.md
 */

import type {
  CosmeticPurchaseResult,
  HabitatFurnitureApplianceKey,
  PlayerCosmetics,
  ShuttleTitlePurchaseResult,
} from './types'
import type { PlayerHabitatAppliances, PlayerProfile } from '@/lib/player/types'
import { findCosmeticOptionById, SHUTTLE_TITLE_SERVICE_OPTION_ID } from './catalog'
import {
  COSMETIC_CATEGORY_TO_FIELD,
  getPlayerCosmetics,
  normalizeShuttleTitle,
  playerOwnsCosmeticOption,
} from './profileCosmetics'
import { spendCredits } from '@/lib/player/profile'

/**
 * Copy profile with an updated cosmetics block.
 *
 * @param profile - Existing profile.
 * @param cosmetics - Next cosmetics snapshot.
 */
function withCosmetics(profile: PlayerProfile, cosmetics: PlayerCosmetics): PlayerProfile {
  return { ...profile, cosmetics }
}

/**
 * Default habitat-appliance flags used when a legacy profile is missing the
 * block. Mirrors `createDefaultHabitatAppliances` in `profile.ts` to avoid an
 * import cycle through the player profile module.
 */
function defaultHabitatAppliances(): PlayerHabitatAppliances {
  return {
    coffeeMachine: false,
    recordPlayer: false,
    refractorTelescope: false,
    loungeChair: false,
    arcadeMachine: false,
    catTower: false,
  }
}

/**
 * Copy the profile with a single habitat-appliance flag flipped to `true`.
 *
 * @param profile - Current profile.
 * @param appliance - Appliance key to enable.
 */
function withApplianceUnlocked(
  profile: PlayerProfile,
  appliance: HabitatFurnitureApplianceKey,
): PlayerProfile {
  const current = profile.habitatAppliances ?? defaultHabitatAppliances()
  if (current[appliance] === true) return profile
  return { ...profile, habitatAppliances: { ...current, [appliance]: true } }
}

/**
 * Apply selection fields for a cosmetic row the player already owns.
 *
 * @param profile - Current profile.
 * @param optionId - Cosmetic option id.
 */
function applyOptionToProfile(profile: PlayerProfile, optionId: string): PlayerProfile {
  const option = findCosmeticOptionById(optionId)
  if (!option || option.category === 'shuttle-title') return profile
  if (option.category === 'habitat-furniture') {
    if (!option.appliance) return profile
    return withApplianceUnlocked(profile, option.appliance)
  }
  const cosmetics = getPlayerCosmetics(profile)
  const field = COSMETIC_CATEGORY_TO_FIELD[option.category]
  return withCosmetics(profile, { ...cosmetics, [field]: optionId })
}

/**
 * Buy (or free-apply) a non-title cosmetic selection.
 *
 * @param profile - Current profile.
 * @param optionId - Cosmetic option id excluding the title registry flow.
 */
export function purchaseCosmeticOption(
  profile: PlayerProfile,
  optionId: string,
): CosmeticPurchaseResult {
  try {
    const option = findCosmeticOptionById(optionId)
    if (!option) {
      return { ok: false, profile, reason: 'unknown-option' }
    }
    if (option.category === 'shuttle-title') {
      return { ok: false, profile, reason: 'shuttle-title-use-rename' }
    }

    const cosmetics = getPlayerCosmetics(profile)

    // Habitat-furniture has no "active vs inactive" — owning the row IS the
    // unlock. Reject re-purchase, otherwise fall through to the spend path.
    if (option.category === 'habitat-furniture') {
      if (playerOwnsCosmeticOption(cosmetics, optionId)) {
        return { ok: false, profile, reason: 'already-active' }
      }
    } else {
      const activeId = cosmetics[COSMETIC_CATEGORY_TO_FIELD[option.category]]
      if (activeId === optionId) {
        return { ok: false, profile, reason: 'already-active' }
      }
      if (playerOwnsCosmeticOption(cosmetics, optionId)) {
        return { ok: true, profile: applyOptionToProfile(profile, optionId) }
      }
    }

    const wallet = option.price === 0 ? profile : spendCredits(profile, option.price)
    if (!wallet) {
      return { ok: false, profile, reason: 'insufficient-credits' }
    }

    const ownedList = [...cosmetics.ownedOptionIds]
    if (!ownedList.includes(optionId)) ownedList.push(optionId)
    let nextProfile = applyOptionToProfile(wallet, optionId)
    const nextCosmetics = getPlayerCosmetics(nextProfile)
    nextProfile = withCosmetics(nextProfile, { ...nextCosmetics, ownedOptionIds: ownedList })
    return { ok: true, profile: nextProfile }
  } catch {
    return { ok: false, profile, reason: 'malformed-catalog' }
  }
}

/**
 * Switch to an already-owned cosmetic without spending credits.
 *
 * @param profile - Current profile.
 * @param optionId - Cosmetic row id (`multitool-paint-graphite-bloom`, …).
 */
export function applyOwnedCosmetic(
  profile: PlayerProfile,
  optionId: string,
): CosmeticPurchaseResult {
  const option = findCosmeticOptionById(optionId)
  if (!option) return { ok: false, profile, reason: 'unknown-option' }
  if (option.category === 'shuttle-title') {
    return { ok: false, profile, reason: 'shuttle-title-use-rename' }
  }

  const cosmetics = getPlayerCosmetics(profile)

  // Habitat-furniture has no apply-different-row flow — every owned row stays
  // unlocked. Surface a soft `already-active` so the UI does nothing.
  if (option.category === 'habitat-furniture') {
    if (playerOwnsCosmeticOption(cosmetics, optionId)) {
      return { ok: false, profile, reason: 'already-active' }
    }
    return { ok: false, profile, reason: 'unknown-option' }
  }

  const activeId = cosmetics[COSMETIC_CATEGORY_TO_FIELD[option.category]]

  if (activeId === optionId) {
    return { ok: false, profile, reason: 'already-active' }
  }
  if (!playerOwnsCosmeticOption(cosmetics, optionId)) {
    return { ok: false, profile, reason: 'unknown-option' }
  }

  return { ok: true, profile: applyOptionToProfile(profile, optionId) }
}

/**
 * Spend credits to change the normalized shuttle title when it differs from the current value.
 *
 * @param profile - Current profile.
 * @param rawTitle - User supplied title string.
 */
export function purchaseShuttleTitle(
  profile: PlayerProfile,
  rawTitle: string,
): ShuttleTitlePurchaseResult {
  try {
    const service = findCosmeticOptionById(SHUTTLE_TITLE_SERVICE_OPTION_ID)
    if (!service || service.category !== 'shuttle-title') {
      return { ok: false, profile, reason: 'malformed-catalog' }
    }

    const normalized = normalizeShuttleTitle(rawTitle)
    if (normalized.length === 0) {
      return { ok: false, profile, reason: 'invalid-title' }
    }

    const cosmetics = getPlayerCosmetics(profile)
    if (cosmetics.shuttleTitle === normalized) {
      return { ok: false, profile, reason: 'already-active' }
    }

    const paid = spendCredits(profile, service.price)
    if (!paid) {
      return { ok: false, profile, reason: 'insufficient-credits' }
    }

    return {
      ok: true,
      profile: withCosmetics(paid, { ...cosmetics, shuttleTitle: normalized }),
    }
  } catch {
    return { ok: false, profile, reason: 'malformed-catalog' }
  }
}
