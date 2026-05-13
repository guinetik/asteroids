import { describe, expect, it } from 'vitest'
import {
  FALLBACK_ITEM_CATEGORY_BORDER,
  coerceInventoryItemCategory,
  getInventoryCategoryBorderUrl,
} from '../itemCategoryBorder'

describe('getInventoryCategoryBorderUrl', () => {
  it('maps each catalog category to a published border WebP basename', () => {
    expect(getInventoryCategoryBorderUrl('mineral')).toBe('/images/items/border_yellow.webp')
    expect(getInventoryCategoryBorderUrl('consumable')).toBe('/images/items/border_green.webp')
    expect(getInventoryCategoryBorderUrl('equipment')).toBe('/images/items/border_cyan.webp')
    expect(getInventoryCategoryBorderUrl('trade-good')).toBe('/images/items/border_orange.webp')
    expect(getInventoryCategoryBorderUrl('mission-material')).toBe('/images/items/border_purple.webp')
  })
})

describe('coerceInventoryItemCategory', () => {
  it('preserves known categories unchanged', () => {
    expect(coerceInventoryItemCategory('trade-good')).toBe('trade-good')
  })

  it('falls back to equipment for unknown legacy labels', () => {
    expect(coerceInventoryItemCategory('other')).toBe(FALLBACK_ITEM_CATEGORY_BORDER)
    expect(coerceInventoryItemCategory(undefined)).toBe(FALLBACK_ITEM_CATEGORY_BORDER)
  })
})
