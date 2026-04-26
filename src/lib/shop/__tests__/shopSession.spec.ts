import { describe, it, expect, beforeEach } from 'vitest'
import { createShopSession, tickShopSession, buyTradeGood, sellTradeGood } from '../shopSession'
import { createProfile } from '@/lib/player/profile'
import { createInventory, addItem } from '@/lib/inventory/inventory'
import { resetDemand } from '../planetDemand'
import { getTradeGoodsByPlanet } from '../tradeGoods'
// Side-effect: register trade goods into item catalog
import '../tradeGoods'

describe('createShopSession', () => {
  it('creates a session with 3 trade slots for Earth', () => {
    const session = createShopSession('earth')
    expect(session.planetId).toBe('earth')
    expect(session.tradeSlots).toHaveLength(3)
    expect(session.restockTimer).toBeNull()
    expect(session.allSoldOut).toBe(false)
  })

  it('all 3 slots have distinct item ids', () => {
    const session = createShopSession('earth')
    const ids = session.tradeSlots.map((s) => s.itemId)
    expect(new Set(ids).size).toBe(3)
  })

  it('all slots have stock > 0', () => {
    const session = createShopSession('jupiter')
    for (const slot of session.tradeSlots) {
      expect(slot.stock).toBeGreaterThan(0)
    }
  })

  it('venus shows full local pool plus 3 imported goods', () => {
    const venusPool = getTradeGoodsByPlanet('venus')
    const session = createShopSession('venus')
    const local = session.tradeSlots.filter((slot) => !slot.isImported)
    const imported = session.tradeSlots.filter((slot) => slot.isImported)
    expect(local).toHaveLength(venusPool.length)
    expect(imported).toHaveLength(3)
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

    const result = buyTradeGood(session, profile, inventory, 5, 1)
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
