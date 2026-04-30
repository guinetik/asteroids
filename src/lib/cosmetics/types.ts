/**
 * Cosmetics domain types — Pimp My Shuttle! catalog shapes, profile cosmetics, and results.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-30-pimp-my-shuttle-shop-design.md
 */

import type { PlayerProfile } from '@/lib/player/types'
import type { ShopResult } from '@/lib/shop/types'

export type { PlayerCosmetics } from '@/lib/player/types'

/**
 * Catalog category ids. Each maps to a persisted {@link PlayerCosmetics} selection field
 * except `'shuttle-title'`, which uses {@link PlayerCosmetics.shuttleTitle}.
 */
export type CosmeticCategory =
  | 'shuttle-paintjob'
  | 'lander-paintjob'
  | 'shuttle-title'
  | 'vehicle-flag'
  | 'shuttle-thruster-trail'
  | 'lander-thruster-trail'
  | 'multitool-paintjob'

/**
 * One purchasable cosmetics row (shader-like preview via {@link CosmeticOptionData.gradientStops}).
 */
export interface CosmeticOptionData {
  /** Stable id referenced by the profile and ownership list. */
  readonly id: string
  /** Owning tab / {@link PlayerCosmetics} field discriminator. */
  readonly category: CosmeticCategory
  /** Player-facing name (Destiny shader tone). */
  readonly label: string
  /** Short flavor line in the shop UI. */
  readonly description: string
  /** Credit price for first purchase (`0` = bundled default row); re-apply is free when already owned. */
  readonly price: number
  /** CSS hex color stops used for compact gradient swatches (`#rrggbb`). */
  readonly gradientStops: readonly string[]
  /** Optional emoji used for curated flag selections. */
  readonly emoji?: string
}

/**
 * Premium buyer tuning for Fantasia's cargo intake wrapper.
 */
export interface PremiumTradeTuning {
  /** Inventory taxonomy accepted by the buyer (trade goods only in v1). */
  readonly acceptedCategories: readonly string[]
  /**
   * Extra desirability pips added after normal routing pips before the five-pip clamp.
   * Example: `2` bumps a 3-pip good to 5 capped.
   */
  readonly minimumPipBonus: number
  /** Numeric range for {@link PremiumTradeSession.premiumMultiplier} rolled once per orbit visit. */
  readonly visitMargin: {
    /** Inclusive floor for the randomized multiplier (> 1). */
    readonly minMultiplier: number
    /** Inclusive ceiling for the randomized multiplier (> min). */
    readonly maxMultiplier: number
  }
}

/**
 * Full validated cosmetics JSON payload for Pimp My Shuttle!
 */
export interface CosmeticShopCatalog {
  /** Stable shop id referenced in tooling and tests (`pimp-my-shuttle`). */
  readonly id: string
  /** Title shown above the magenta panel. */
  readonly label: string
  /** UI theme slug used by CSS modifiers (`magenta`). */
  readonly theme: string
  /** Planet ids (`mars`, …) eligible for the magenta orbital shop HUD. */
  readonly availablePlanetIds: readonly string[]
  /** Cargo intake tuning layered on planet demand routing. */
  readonly premiumTrade: PremiumTradeTuning
  /** All cosmetic rows including title registry and flags. */
  readonly options: readonly CosmeticOptionData[]
}

/**
 * Shop header config returned without the option list (for lightweight consumers).
 */
export type CosmeticShopConfig = Pick<
  CosmeticShopCatalog,
  'id' | 'label' | 'theme' | 'availablePlanetIds' | 'premiumTrade'
>

/**
 * Randomized premium buyer state created when entering an eligible orbit around a planet.
 */
export interface PremiumTradeSession {
  /** Planet id matching the current orbit target. */
  readonly planetId: string
  /** Multiplier applied on top of normal yellow-shop sell prices for accepted goods. */
  readonly premiumMultiplier: number
}

/** Failure reasons for cosmetic option purchases. */
export type CosmeticPurchaseFailReason =
  | 'unknown-option'
  | 'already-active'
  | 'insufficient-credits'
  | 'malformed-catalog'
  | 'shuttle-title-use-rename'

/** Failure reasons for shuttle title purchases. */
export type ShuttleTitlePurchaseFailReason =
  | 'invalid-title'
  | 'already-active'
  | 'insufficient-credits'
  | 'malformed-catalog'

/**
 * Result of attempting to buy or apply a catalog option (non-title categories).
 */
export type CosmeticPurchaseResult =
  | { ok: true; profile: PlayerProfile }
  | {
      ok: false
      profile: PlayerProfile
      reason: CosmeticPurchaseFailReason
    }

/**
 * Result of purchasing a normalized shuttle title string.
 */
export type ShuttleTitlePurchaseResult =
  | { ok: true; profile: PlayerProfile }
  | {
      ok: false
      profile: PlayerProfile
      reason: ShuttleTitlePurchaseFailReason
    }

/**
 * Result of selling into Fantasia's premium intake (mirrors {@link ShopResult}).
 */
export type PremiumTradeResult = ShopResult
