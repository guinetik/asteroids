import { describe, it, expect, beforeEach } from 'vitest'
import {
  createShopSession,
  tickShopSession,
  buyTradeGood,
  sellTradeGood,
  TRADE_GOOD_CHEAP_PRICE_THRESHOLD,
  TRADE_GOOD_MIN_STOCK_CHEAP,
  TRADE_GOOD_MIN_STOCK_EXPENSIVE,
  TRADE_GOODS_OFFER_SLOT_CAP,
  TRADE_GOOD_STOCK_MAX_CHEAP,
  TRADE_GOOD_STOCK_MAX_EXPENSIVE,
} from '../shopSession'
import {
  getTradeGood,
  getTradeGoodsByPlanet,
  getTradeGoodsExcludingPlanet,
} from '../tradeGoods'
import { createProfile } from '@/lib/player/profile'
import { createInventory, addItem } from '@/lib/inventory/inventory'
import { resetDemand } from '../planetDemand'
// Side-effect: register trade goods into item catalog
import '../tradeGoods'

describe('createShopSession', () => {
  it('creates a session with up to the offer cap of trade slots for Earth (full local pool)', () => {
    const earthPool = getTradeGoodsByPlanet('earth')
    const session = createShopSession('earth')
    expect(session.planetId).toBe('earth')
    expect(session.tradeSlots).toHaveLength(
      Math.min(TRADE_GOODS_OFFER_SLOT_CAP, earthPool.length),
    )
    expect(session.restockTimer).toBeNull()
    expect(session.allSoldOut).toBe(false)
  })

  it('all slots have distinct item ids', () => {
    const session = createShopSession('earth')
    const ids = session.tradeSlots.map((s) => s.itemId)
    expect(new Set(ids).size).toBe(session.tradeSlots.length)
  })

  it('all slots have stock > 0', () => {
    const session = createShopSession('jupiter')
    for (const slot of session.tradeSlots) {
      expect(slot.stock).toBeGreaterThan(0)
    }
  })

  it('stocks cheap trade goods with at least 10 units (zeppelin contract bulk buys)', () => {
    for (let i = 0; i < 30; i += 1) {
      for (const planetId of ['venus', 'earth', 'mars'] as const) {
        const session = createShopSession(planetId)
        for (const slot of session.tradeSlots) {
          const def = getTradeGood(slot.itemId)
          expect(def).toBeDefined()
          const minAllowed =
            def!.basePrice < TRADE_GOOD_CHEAP_PRICE_THRESHOLD
              ? TRADE_GOOD_MIN_STOCK_CHEAP
              : TRADE_GOOD_MIN_STOCK_EXPENSIVE
          const maxAllowed =
            def!.basePrice < TRADE_GOOD_CHEAP_PRICE_THRESHOLD
              ? TRADE_GOOD_STOCK_MAX_CHEAP
              : TRADE_GOOD_STOCK_MAX_EXPENSIVE
          expect(slot.stock).toBeGreaterThanOrEqual(minAllowed)
          expect(slot.stock).toBeLessThanOrEqual(maxAllowed)
        }
      }
    }
  })

  it('venus shows full local pool plus imports up to the global offer cap', () => {
    const venusPool = getTradeGoodsByPlanet('venus')
    const importPool = getTradeGoodsExcludingPlanet('venus')
    const session = createShopSession('venus')
    const local = session.tradeSlots.filter((slot) => !slot.isImported)
    const imported = session.tradeSlots.filter((slot) => slot.isImported)
    expect(local).toHaveLength(venusPool.length)
    const expectedImports = Math.min(
      TRADE_GOODS_OFFER_SLOT_CAP - venusPool.length,
      importPool.length,
    )
    expect(imported).toHaveLength(expectedImports)
    expect(session.tradeSlots).toHaveLength(venusPool.length + expectedImports)
    expect(new Set(session.tradeSlots.map((slot) => slot.itemId)).size).toBe(
      session.tradeSlots.length,
    )
    expect(imported.every((slot) => slot.originPlanetId && slot.originPlanetId !== 'venus')).toBe(
      true,
    )
  })
})

describe('buyTradeGood', () => {
  it('buys 1 item: credits debited, stock decremented, item in inventory', () => {
    const session = createShopSession('earth')
    const profile = createProfile('Joe')
    const inventory = createInventory()
    const slot = session.tradeSlots[0]!

    const result = buyTradeGood(session, profile, inventory, 0, 1)

    expect(result.ok).toBe(true)
    expect(result.profile.credits).toBe(1000 - slot.price)
    expect(result.session.tradeSlots[0]!.stock).toBe(slot.stock - 1)
    expect(result.inventory.stacks).toHaveLength(1)
    expect(result.inventory.stacks[0]!.itemId).toBe(slot.itemId)
  })

  it('fails with insufficient credits', () => {
    const session = createShopSession('pluto')
    const profile = createProfile('Joe')
    // Pluto goods cost 100-200, spend most credits first
    const poorProfile = { ...profile, credits: 1 }
    const inventory = createInventory()

    const result = buyTradeGood(session, poorProfile, inventory, 0, 1)

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('credits')
  })

  it('fails when stock is insufficient', () => {
    const session = createShopSession('earth')
    const profile = createProfile('Joe')
    const inventory = createInventory()

    const result = buyTradeGood(session, profile, inventory, 0, 9999)

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('stock')
  })

  it('fails for invalid slot index', () => {
    const session = createShopSession('earth')
    const profile = createProfile('Joe')
    const inventory = createInventory()

    const result = buyTradeGood(session, profile, inventory, session.tradeSlots.length, 1)
    expect(result.ok).toBe(false)
  })
})

describe('sellTradeGood', () => {
  beforeEach(() => resetDemand())

  it('sells an item at demand price', () => {
    const session = createShopSession('mercury')
    const profile = createProfile('Joe')
    const inv = addItem(createInventory(), 'cryogenic-coolants', 10).inventory

    const result = sellTradeGood(session, profile, inv, 'cryogenic-coolants', 5)

    expect(result.ok).toBe(true)
    expect(result.profile.credits).toBeGreaterThan(1000)
    expect(result.inventory.stacks[0]!.quantity).toBe(5)
  })

  it('tracks trade-only credits from successful sales', () => {
    const session = createShopSession('earth')
    const profile = createProfile('Joe')
    const inventory = addItem(createInventory(), 'cryogenic-coolants', 10).inventory

    const result = sellTradeGood(session, profile, inventory, 'cryogenic-coolants', 5)

    expect(result.ok).toBe(true)
    expect(result.profile.achievementStats.lifetimeTradeCreditsEarned).toBe(
      result.profile.credits - profile.credits,
    )
  })

  it('rejects zero-quantity sales without changing profile or inventory', () => {
    const session = createShopSession('earth')
    const profile = createProfile('Joe')
    const inventory = addItem(createInventory(), 'cryogenic-coolants', 10).inventory

    const result = sellTradeGood(session, profile, inventory, 'cryogenic-coolants', 0)

    expect(result.ok).toBe(false)
    expect(result.profile.credits).toBe(profile.credits)
    expect(result.profile.achievementStats.lifetimeTradeCreditsEarned).toBe(
      profile.achievementStats.lifetimeTradeCreditsEarned,
    )
    expect(result.inventory).toEqual(inventory)
  })

  it('rejects negative-quantity sales without changing profile or inventory', () => {
    const session = createShopSession('earth')
    const profile = createProfile('Joe')
    const inventory = addItem(createInventory(), 'cryogenic-coolants', 10).inventory

    const result = sellTradeGood(session, profile, inventory, 'cryogenic-coolants', -1)

    expect(result.ok).toBe(false)
    expect(result.profile.credits).toBe(profile.credits)
    expect(result.profile.achievementStats.lifetimeTradeCreditsEarned).toBe(
      profile.achievementStats.lifetimeTradeCreditsEarned,
    )
    expect(result.inventory).toEqual(inventory)
  })

  it('fails when item not in inventory', () => {
    const session = createShopSession('mercury')
    const profile = createProfile('Joe')
    const inventory = createInventory()

    const result = sellTradeGood(session, profile, inventory, 'cryogenic-coolants', 1)
    expect(result.ok).toBe(false)
  })
})

describe('tickShopSession', () => {
  it('starts restock timer when all slots sold out', () => {
    let session = createShopSession('earth')
    session = {
      ...session,
      tradeSlots: session.tradeSlots.map((s) => ({ ...s, stock: 0 })) as typeof session.tradeSlots,
    }

    const updated = tickShopSession(session, 0)
    expect(updated.allSoldOut).toBe(true)
    expect(updated.restockTimer).not.toBeNull()
  })

  it('restocks when timer expires', () => {
    let session = createShopSession('earth')
    session = {
      ...session,
      tradeSlots: session.tradeSlots.map((s) => ({ ...s, stock: 0 })) as typeof session.tradeSlots,
    }

    session = tickShopSession(session, 0)
    const timer = session.restockTimer!

    const restocked = tickShopSession(session, timer.remaining + 1)
    expect(restocked.restockTimer).toBeNull()
    expect(restocked.allSoldOut).toBe(false)
    for (const slot of restocked.tradeSlots) {
      expect(slot.stock).toBeGreaterThan(0)
    }
  })

  it('does nothing when stock is still available', () => {
    const session = createShopSession('earth')
    const updated = tickShopSession(session, 10)
    expect(updated).toBe(session)
  })
})
