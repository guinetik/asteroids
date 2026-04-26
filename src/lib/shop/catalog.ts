/**
 * Shop catalog loader.
 *
 * Imports shop pricing JSON at build time, validates all item
 * references against the inventory catalog, and exports price
 * lookup helpers.
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-shop-system-design.md
 */
import type { ShopCatalog } from './types'
import { getItemDefinition } from '@/lib/inventory/catalog'

import shopData from '@/data/shop/shop.json'

/** Ensures every listing references a real item and sane prices. */
function validateCatalog(catalog: ShopCatalog): ShopCatalog {
  for (const listing of catalog.listings) {
    const item = getItemDefinition(listing.itemId)
    if (!item) {
      throw new Error(`Shop listing references unknown item "${listing.itemId}"`)
    }
    if (listing.buyPrice <= 0) {
      throw new Error(`Shop listing "${listing.itemId}" has non-positive buyPrice`)
    }
  }
  for (const sp of catalog.sellPrices) {
    const item = getItemDefinition(sp.itemId)
    if (!item) {
      throw new Error(`Shop sell price references unknown item "${sp.itemId}"`)
    }
    if (!item.sellable) {
      throw new Error(`Shop sell price "${sp.itemId}" is not sellable in item catalog`)
    }
    if (sp.sellPrice <= 0) {
      throw new Error(`Shop sell price "${sp.itemId}" has non-positive sellPrice`)
    }
  }
  return catalog
}

/** Validated shop catalog with buy listings and sell prices. */
export const SHOP_CATALOG: ShopCatalog = validateCatalog(shopData as unknown as ShopCatalog)

/** Get the buy price for an item, or undefined if not sold by the shop. */
export function getBuyPrice(itemId: string): number | undefined {
  const listing = SHOP_CATALOG.listings.find((l) => l.itemId === itemId)
  return listing?.buyPrice
}

/** Get the sell price for an item, or undefined if the shop doesn't buy it. */
export function getSellPrice(itemId: string): number | undefined {
  const sp = SHOP_CATALOG.sellPrices.find((s) => s.itemId === itemId)
  return sp?.sellPrice
}
