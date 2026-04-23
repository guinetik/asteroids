/**
 * Trade goods catalog loader.
 *
 * Imports trade-goods.json, validates entries, registers them
 * into the item catalog, and provides planet-based lookups.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-planet-shop-system-design.md
 */
import type { TradeGoodDefinition } from './tradeTypes'
import type { ItemDefinition } from '@/lib/inventory/types'
import { ITEM_CATALOG } from '@/lib/inventory/catalog'
import { PLANET_IDS } from '@/lib/planets/catalog'

import rawTradeGoods from '@/data/shop/trade-goods.json'

const tradeGoods = rawTradeGoods as unknown as TradeGoodDefinition[]

// Validate and register into item catalog
for (const tg of tradeGoods) {
  if (!tg.id || !tg.label || !tg.description || !tg.icon) {
    throw new Error(`Trade good "${tg.id}" missing required string fields`)
  }
  if (tg.basePrice <= 0) {
    throw new Error(`Trade good "${tg.id}" has non-positive basePrice`)
  }
  if (!PLANET_IDS.includes(tg.producedBy)) {
    throw new Error(`Trade good "${tg.id}" references unknown planet "${tg.producedBy}"`)
  }
  // Register as an item in the global catalog so inventory system works
  const itemDef: ItemDefinition = {
    id: tg.id,
    category: 'trade-good' as ItemDefinition['category'],
    label: tg.label,
    description: tg.description,
    icon: tg.icon,
    weightPerUnit: tg.weightPerUnit,
    maxStack: tg.maxStack,
    sellable: true,
  }
  ITEM_CATALOG[tg.id] = itemDef
}

/** All trade goods indexed by id. */
export const TRADE_GOODS: Record<string, TradeGoodDefinition> = Object.fromEntries(
  tradeGoods.map((tg) => [tg.id, tg]),
)

/** Get a trade good definition by id. */
export function getTradeGood(id: string): TradeGoodDefinition | undefined {
  return TRADE_GOODS[id]
}

/** Get the 5 trade goods produced by a planet. */
export function getTradeGoodsByPlanet(planetId: string): TradeGoodDefinition[] {
  return tradeGoods.filter((tg) => tg.producedBy === planetId)
}

/** Get all trade goods not produced by the given planet. */
export function getTradeGoodsExcludingPlanet(planetId: string): TradeGoodDefinition[] {
  return tradeGoods.filter((tg) => tg.producedBy !== planetId)
}
