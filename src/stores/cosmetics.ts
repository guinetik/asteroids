/**
 * Cosmetic shop Pinia façade — magenta session pinning for future overlays (map controller remains source of truth).
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-30-pimp-my-shuttle-shop-design.md
 */
import { shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { PremiumTradeSession } from '@/lib/cosmetics/types'
import type { PlayerProfile } from '@/lib/player/types'
import {
  applyOwnedCosmetic,
  purchaseCosmeticOption,
  purchaseShuttleTitle,
} from '@/lib/cosmetics/purchase'
import { findCosmeticOptionById } from '@/lib/cosmetics/catalog'
import { sellPremiumTradeGood } from '@/lib/cosmetics/premiumTrade'
import { getPlayerCosmetics, playerOwnsCosmeticOption } from '@/lib/cosmetics/profileCosmetics'
import type { Inventory } from '@/lib/inventory/types'
import type { ShopResult } from '@/lib/shop/types'

/** Thin Pinia wrapper that keeps pure cosmetics helpers discoverable for future UI layers. */
export const useCosmeticsStore = defineStore('cosmetics', () => {
  /** Optional mirror of the active premium trade session (map controller still owns lifecycle). */
  const premiumTradeSession = shallowRef<PremiumTradeSession | null>(null)

  /**
   * @param session - Premium roll for the current eligible orbit (or null when cleared).
   */
  function setPremiumTradeSession(session: PremiumTradeSession | null): void {
    premiumTradeSession.value = session
  }

  /**
   * @param profile - Profile snapshot (Pinia player store or map UI copy).
   * @param optionId - Cosmetic row id.
   */
  function buyOption(profile: PlayerProfile, optionId: string) {
    return purchaseCosmeticOption(profile, optionId)
  }

  /**
   * @param profile - Profile snapshot.
   * @param optionId - Owned cosmetic id.
   */
  function applyOption(profile: PlayerProfile, optionId: string) {
    return applyOwnedCosmetic(profile, optionId)
  }

  /**
   * @param profile - Profile snapshot.
   * @param rawTitle - User-authored title string.
   */
  function renameShuttle(profile: PlayerProfile, rawTitle: string) {
    return purchaseShuttleTitle(profile, rawTitle)
  }

  /**
   * @param session - Active premium session (must match map orbit target).
   * @param profile - Profile snapshot.
   * @param inventory - Cargo hold snapshot.
   * @param itemId - Trade-good stack id.
   * @param quantity - Units to sell.
   */
  function sellPremiumTradeGoodAction(
    session: PremiumTradeSession,
    profile: PlayerProfile,
    inventory: Inventory,
    itemId: string,
    quantity: number,
  ): ShopResult {
    return sellPremiumTradeGood(session, profile, inventory, itemId, quantity)
  }

  /**
   * @param profile - Profile snapshot.
   * @param optionId - Cosmetic row id.
   */
  function canAffordOption(profile: PlayerProfile, optionId: string): boolean {
    const option = findCosmeticOptionById(optionId)
    if (!option) return false
    return profile.credits >= option.price
  }

  /**
   * @param profile - Profile snapshot.
   * @param optionId - Cosmetic row id.
   */
  function ownsOption(profile: PlayerProfile, optionId: string): boolean {
    return playerOwnsCosmeticOption(getPlayerCosmetics(profile), optionId)
  }

  return {
    premiumTradeSession,
    setPremiumTradeSession,
    buyOption,
    applyOption,
    renameShuttle,
    sellPremiumTradeGoodAction,
    canAffordOption,
    ownsOption,
  }
})
