/**
 * Premium trade-good intake math layered on top of normal planet demand pricing.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-30-pimp-my-shuttle-shop-design.md
 */

import type { PremiumTradeSession } from './types'
import type { Inventory } from '@/lib/inventory/types'
import type { PlayerProfile } from '@/lib/player/types'
import { getPimpMyShuttleConfig } from './catalog'
import { computeSellPrice, getDesirabilityPips } from '@/lib/shop/planetDemand'
import type { ShopResult } from '@/lib/shop/types'
import { getTradeGood } from '@/lib/shop/tradeGoods'
import { removeItem } from '@/lib/inventory/inventory'
import {
  addCredits,
  recordCargoIntakeCreditsEarned,
  recordTradeCreditsEarned,
} from '@/lib/player/profile'

/** Shared five-pip cap with {@link planetDemand}. */
const MAX_DESIRABILITY_PIPS = 5

/**
 * Roll one premium multiplier for the player's current orbital visit at Fantasia's kiosk.
 *
 * @param planetId - Orbiting planet id (`mars`, …).
 * @param rollVisitMultiplier - Injectable RNG hook for deterministic tests.
 */
export function createPremiumTradeSession(
  planetId: string,
  rollVisitMultiplier?: () => number,
): PremiumTradeSession {
  const { visitMargin } = getPimpMyShuttleConfig().premiumTrade
  const roll =
    rollVisitMultiplier ??
    ((): number =>
      visitMargin.minMultiplier +
      Math.random() * (visitMargin.maxMultiplier - visitMargin.minMultiplier))
  const premiumMultiplier = roll()
  return { planetId, premiumMultiplier }
}

/**
 * Returns true when the premium buyer accepts this inventory id for magenta intake.
 *
 * @param itemId - Cargo stack id (`helium-3-crate`, …).
 */
export function isPremiumBuyerItem(itemId: string): boolean {
  const tuning = getPimpMyShuttleConfig().premiumTrade
  const tradeGood = getTradeGood(itemId)
  return Boolean(tradeGood && tuning.acceptedCategories.includes('trade-good'))
}

/**
 * Credits per unit after demand routing and the Fantasia premium multiplier (rounded integer).
 *
 * @param session - Visit session anchored to a planet and rolled multiplier.
 * @param itemId - Trade good inventory id.
 */
export function computePremiumSellPrice(session: PremiumTradeSession, itemId: string): number {
  const baseline = computeSellPrice(session.planetId, itemId)
  return Math.round(baseline * session.premiumMultiplier)
}

/**
 * Desirability pip count boosted by Fantasia's minimum bonus, capped at five.
 *
 * @param session - Visit session anchored to the planet pricing context.
 * @param itemId - Trade good inventory id.
 */
export function getPremiumDesirabilityPips(session: PremiumTradeSession, itemId: string): number {
  const bonus = getPimpMyShuttleConfig().premiumTrade.minimumPipBonus
  const baseline = getDesirabilityPips(session.planetId, itemId)
  return Math.min(MAX_DESIRABILITY_PIPS, baseline + bonus)
}

/**
 * Sell cargo through Fantasia's premium route (trade goods accepted by tuning only).
 *
 * @param session - Premium visit session rolled for this orbit.
 * @param profile - Player credits snapshot.
 * @param inventory - Mutable cargo hold snapshot.
 * @param itemId - Stack id being sold.
 * @param quantity - Units removed on success (must be positive).
 */
export function sellPremiumTradeGood(
  session: PremiumTradeSession,
  profile: PlayerProfile,
  inventory: Inventory,
  itemId: string,
  quantity: number,
): ShopResult {
  if (quantity <= 0) {
    return { ok: false, profile, inventory, reason: 'Quantity must be positive' }
  }
  if (!isPremiumBuyerItem(itemId)) {
    return {
      ok: false,
      profile,
      inventory,
      reason: 'Premium buyer does not accept this item category',
    }
  }

  const pricePerUnit = computePremiumSellPrice(session, itemId)
  if (pricePerUnit <= 0) {
    return { ok: false, profile, inventory, reason: 'Item has no sell value' }
  }

  const removeResult = removeItem(inventory, itemId, quantity)
  if (!removeResult.ok) {
    return { ok: false, profile, inventory, reason: removeResult.reason }
  }

  const totalPayout = pricePerUnit * quantity
  let nextProfile = addCredits(profile, totalPayout)
  nextProfile = recordTradeCreditsEarned(nextProfile, totalPayout)
  nextProfile = recordCargoIntakeCreditsEarned(nextProfile, totalPayout)

  return {
    ok: true,
    profile: nextProfile,
    inventory: removeResult.inventory,
  }
}
