/**
 * Published inventory-slot frame raster per {@link ItemCategory}, served from `/images/items/`.
 *
 * @author guinetik
 * @date 2026-05-13
 * @spec docs/superpowers/specs/2026-04-03-inventory-system-design.md
 */

import type { ItemCategory } from './types'

/**
 * Fallback category when manifest data is absent (unexpected runtime-only stacks).
 *
 * Mirrors default equipment tone (cyan slot frame).
 */
export const FALLBACK_ITEM_CATEGORY_BORDER: ItemCategory = 'equipment'

/** File base (no extension) under `public/images/items/` from the border build script. */
const ITEM_CATEGORY_TO_BORDER_BASENAME: Record<ItemCategory, string> = {
  mineral: 'border_yellow',
  consumable: 'border_green',
  equipment: 'border_cyan',
  'trade-good': 'border_orange',
  'mission-material': 'border_purple',
}

/**
 * Validates and normalizes a raw category string to {@link ItemCategory}.
 *
 * @param raw - Possibly invalid category (`undefined` when catalog lookup fails).
 * @returns A valid {@link ItemCategory} suitable for `/images/items/border_*.webp` lookups.
 */
export function coerceInventoryItemCategory(raw: string | undefined): ItemCategory {
  if (
    raw === 'mineral' ||
    raw === 'consumable' ||
    raw === 'equipment' ||
    raw === 'trade-good' ||
    raw === 'mission-material'
  ) {
    return raw
  }
  return FALLBACK_ITEM_CATEGORY_BORDER
}

/**
 * URL path segment for Vue `<img :src>` and CSS `background-image` (leading slash, no hash).
 *
 * @param category - Item classification from catalog.
 * @returns Absolute site path `/images/items/border_*.webp`.
 */
export function getInventoryCategoryBorderUrl(category: ItemCategory): string {
  const base = ITEM_CATEGORY_TO_BORDER_BASENAME[category]
  return `/images/items/${base}.webp`
}
