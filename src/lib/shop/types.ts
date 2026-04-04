/**
 * Shop system data model.
 *
 * Defines buy listings, sell prices, and the result type for
 * shop transactions. The shop buys minerals from the player
 * and sells consumables/supplies.
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-shop-system-design.md
 */
import type { PlayerProfile } from '@/lib/player/types'
import type { Inventory } from '@/lib/inventory/types'

/** An item the shop sells to the player. */
export interface ShopListing {
  /** References an ItemDefinition.id from the item catalog. */
  itemId: string
  /** Credits the player pays to purchase 1 unit. */
  buyPrice: number
}

/** A price the shop pays for an item the player sells. */
export interface SellPrice {
  /** References an ItemDefinition.id. Must have sellable: true. */
  itemId: string
  /** Credits the player receives per unit sold. */
  sellPrice: number
}

/** The full shop catalog loaded from JSON. */
export interface ShopCatalog {
  /** Items available for purchase. */
  listings: ShopListing[]
  /** Prices the shop pays for player's items. */
  sellPrices: SellPrice[]
}

/** Result of a buy or sell transaction. */
export interface ShopResult {
  /** Whether the transaction succeeded. */
  ok: boolean
  /** Player profile after transaction (unchanged if ok is false). */
  profile: PlayerProfile
  /** Inventory after transaction (unchanged if ok is false). */
  inventory: Inventory
  /** Explanation when ok is false. */
  reason?: string
}
