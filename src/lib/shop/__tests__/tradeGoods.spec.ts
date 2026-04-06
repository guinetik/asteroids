import { describe, it, expect } from 'vitest'
import { TRADE_GOODS, getTradeGood, getTradeGoodsByPlanet } from '../tradeGoods'
import { PLANET_IDS } from '@/lib/planets/catalog'
import { getItemDefinition } from '@/lib/inventory/catalog'

describe('TRADE_GOODS', () => {
  it('has 50 trade goods total', () => {
    expect(Object.keys(TRADE_GOODS).length).toBe(50)
  })

  it('every planet has exactly 5 goods', () => {
    for (const planetId of PLANET_IDS) {
      const goods = getTradeGoodsByPlanet(planetId)
      expect(goods.length, `${planetId} should have 5 goods`).toBe(5)
    }
  })

  it('all trade goods have positive base prices', () => {
    for (const tg of Object.values(TRADE_GOODS)) {
      expect(tg.basePrice, `${tg.id} basePrice`).toBeGreaterThan(0)
    }
  })

  it('all trade goods are registered in the item catalog', () => {
    for (const tg of Object.values(TRADE_GOODS)) {
      const item = getItemDefinition(tg.id)
      expect(item, `${tg.id} should be in item catalog`).toBeDefined()
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
