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
import type { ShopCatalog, ShopListing } from './types'
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

/**
 * Whether a shop listing is available at the given planet id.
 * Listings without an `availableOnPlanets` allowlist (or with an empty one) are
 * considered universally available; listings with an allowlist must include
 * `planetId` to be sold at that port.
 *
 * @param listing - Shop listing entry from the catalog.
 * @param planetId - Planet id of the active shop session, e.g. `'earth'`.
 * @returns True when the listing is available at this planet.
 */
export function isListingAvailableAtPlanet(listing: ShopListing, planetId: string): boolean {
  const allow = listing.availableOnPlanets
  if (allow === undefined || allow.length === 0) return true
  return allow.includes(planetId)
}

/**
 * Return the buy listings stocked at the given planet id, applying per-listing
 * `availableOnPlanets` allowlists. Universal listings appear at every planet.
 *
 * @param planetId - Planet id of the active shop session, e.g. `'earth'`.
 * @returns Listings the player can purchase at this port.
 */
export function getListingsForPlanet(planetId: string): readonly ShopListing[] {
  return SHOP_CATALOG.listings.filter((l) => isListingAvailableAtPlanet(l, planetId))
}

/** Get the sell price for an item, or undefined if the shop doesn't buy it. */
export function getSellPrice(itemId: string): number | undefined {
  const sp = SHOP_CATALOG.sellPrices.find((s) => s.itemId === itemId)
  return sp?.sellPrice
}
