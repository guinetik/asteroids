import { describe, it, expect } from 'vitest'
import { TRADE_GOODS, getTradeGood, getTradeGoodsByPlanet } from '../tradeGoods'
import { PLANET_IDS } from '@/lib/planets/catalog'
import { getItemDefinition } from '@/lib/inventory/catalog'

describe('TRADE_GOODS', () => {
  it('has 51 trade goods total', () => {
    expect(Object.keys(TRADE_GOODS).length).toBe(51)
  })

  it('every planet has at least 5 goods', () => {
    for (const planetId of PLANET_IDS) {
      const goods = getTradeGoodsByPlanet(planetId)
      expect(goods.length).toBeGreaterThanOrEqual(5)
    }
  })

  it('cat-food is produced on Earth', () => {
    const tg = getTradeGood('cat-food')
    expect(tg).toBeDefined()
    expect(tg!.producedBy).toBe('earth')
  })

  it('all trade goods have positive base prices', () => {
    for (const tg of Object.values(TRADE_GOODS)) {
      expect(tg.basePrice).toBeGreaterThan(0)
    }
  })

  it('all trade goods are registered in the item catalog', () => {
    for (const tg of Object.values(TRADE_GOODS)) {
      const item = getItemDefinition(tg.id)
      expect(item).toBeDefined()
      expect(item!.category).toBe('trade-good')
      expect(item!.sellable).toBe(true)
    }
  })
})

describe('getTradeGood', () => {
  it('returns a known trade good', () => {
    const tg = getTradeGood('heat-resistant-alloys')
    expect(tg).toBeDefined()
    expect(tg!.producedBy).toBe('mercury')
  })

  it('returns undefined for unknown id', () => {
    expect(getTradeGood('nonexistent')).toBeUndefined()
  })
})
