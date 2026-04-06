import { describe, it, expect } from 'vitest'
import { SHOP_CATALOG, getBuyPrice, getSellPrice } from '../catalog'
import { getItemDefinition } from '@/lib/inventory/catalog'

describe('SHOP_CATALOG', () => {
  it('has listings and sell prices', () => {
    expect(SHOP_CATALOG.listings.length).toBeGreaterThan(0)
    expect(SHOP_CATALOG.sellPrices.length).toBeGreaterThan(0)
  })

  it('all listing itemIds exist in the item catalog', () => {
    for (const listing of SHOP_CATALOG.listings) {
      expect(getItemDefinition(listing.itemId)).toBeDefined()
    }
  })

  it('all sell price itemIds exist in the item catalog and are sellable', () => {
    for (const sp of SHOP_CATALOG.sellPrices) {
      const item = getItemDefinition(sp.itemId)
      expect(item).toBeDefined()
      expect(item!.sellable).toBe(true)
    }
  })

  it('all buy prices are positive', () => {
    for (const listing of SHOP_CATALOG.listings) {
      expect(listing.buyPrice).toBeGreaterThan(0)
    }
  })

  it('all sell prices are positive', () => {
    for (const sp of SHOP_CATALOG.sellPrices) {
      expect(sp.sellPrice).toBeGreaterThan(0)
    }
  })
})

describe('getBuyPrice', () => {
  it('returns correct price for fuel-cell', () => {
    expect(getBuyPrice('fuel-cell')).toBe(75)
  })

  it('returns undefined for unlisted item', () => {
    expect(getBuyPrice('olivine')).toBeUndefined()
  })
})

describe('getSellPrice', () => {
  it('returns correct price for iron-nickel-alloy', () => {
    expect(getSellPrice('iron-nickel-alloy')).toBe(12)
  })

  it('returns correct price for olivine', () => {
    expect(getSellPrice('olivine')).toBe(3)
  })

  it('returns undefined for non-sellable item', () => {
    expect(getSellPrice('fuel-cell')).toBeUndefined()
  })
})
