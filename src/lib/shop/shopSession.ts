/**
 * Shop session state management.
 *
 * Creates per-planet shop sessions with rotating trade good stock,
 * restock timers, and buy operations. Pure functions — no side effects.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-planet-shop-system-design.md
 */
import type { ShopSession, TradeGoodSlot } from './tradeTypes'
import type { PlayerProfile } from '@/lib/player/types'
import type { Inventory } from '@/lib/inventory/types'
import type { ShopResult } from './types'
import { getTradeGoodsByPlanet } from './tradeGoods'
import { addItem, canFitItem, removeItem } from '@/lib/inventory/inventory'
import { spendCredits, addCredits } from '@/lib/player/profile'
import { computeSellPrice } from './planetDemand'

/** Minimum restock timer duration in seconds. */
const RESTOCK_MIN_S = 120

/** Maximum restock timer duration in seconds. */
const RESTOCK_MAX_S = 240

/** Minimum stock for expensive goods. */
const STOCK_MIN = 5

/** Maximum stock for cheap goods. */
const STOCK_MAX = 20

/** Price threshold: goods below this get higher stock. */
const CHEAP_THRESHOLD = 50

/**
 * Fraction of each good's catalog {@link TradeGoodDefinition.basePrice} charged when buying at its
 * source planet. Lower than 1 widens profit on resale where demand is high.
 */
const TRADE_GOOD_SOURCE_BUY_PRICE_FRACTION = 0.85

/** Refuel cost in credits. */
export const REFUEL_COST = 100

/** Reserve shuttle fuel item id. */
export const RESERVE_FUEL_ID = 'shuttle-fuel-cell'

/** Reserve fuel cost in credits. */
export const RESERVE_FUEL_COST = 50

/** Lander fuel item id. */
export const LANDER_FUEL_ID = 'fuel-cell'

/** Lander fuel cost in credits. */
export const LANDER_FUEL_COST = 75

/** Hull repair cost in credits (Earth only). */
export const REPAIR_COST = 250

/**
 * Pick 3 random trade goods from a planet's 5-item pool.
 * Returns them as TradeGoodSlots with randomized stock.
 *
 * @param planetId - The planet whose trade goods pool to draw from.
 * @returns A tuple of 3 trade good slots.
 */
function pickTradeSlots(planetId: string): [TradeGoodSlot, TradeGoodSlot, TradeGoodSlot] {
  const allGoods = getTradeGoodsByPlanet(planetId)
  const shuffled = [...allGoods].sort(() => Math.random() - 0.5)
  const picked = shuffled.slice(0, 3)

  return picked.map((tg) => {
    const stock =
      tg.basePrice < CHEAP_THRESHOLD
        ? STOCK_MIN + Math.floor(Math.random() * (STOCK_MAX - STOCK_MIN + 1))
        : STOCK_MIN + Math.floor(Math.random() * (STOCK_MAX / 2 - STOCK_MIN + 1))
    return {
      itemId: tg.id,
      stock,
      price: Math.round(tg.basePrice * TRADE_GOOD_SOURCE_BUY_PRICE_FRACTION),
    }
  }) as [TradeGoodSlot, TradeGoodSlot, TradeGoodSlot]
}

/**
 * Generate a random restock duration between min and max.
 *
 * @returns Duration in seconds.
 */
function randomRestockDuration(): number {
  return RESTOCK_MIN_S + Math.random() * (RESTOCK_MAX_S - RESTOCK_MIN_S)
}

/**
 * Create a new shop session for a planet.
 *
 * @param planetId - The planet the player is orbiting.
 * @returns A fresh ShopSession with 3 random trade good slots.
 */
export function createShopSession(planetId: string): ShopSession {
  const tradeSlots = pickTradeSlots(planetId)
  return {
    planetId,
    tradeSlots,
    restockTimer: null,
    allSoldOut: false,
  }
}

/**
 * Tick the shop session restock timer.
 *
 * @param session - Current session.
 * @param dt - Delta time in seconds.
 * @returns Updated session (new object if changed).
 */
export function tickShopSession(session: ShopSession, dt: number): ShopSession {
  const allSoldOut = session.tradeSlots.every((slot) => slot.stock <= 0)

  if (allSoldOut && !session.restockTimer) {
    const total = randomRestockDuration()
    return { ...session, allSoldOut: true, restockTimer: { remaining: total, total } }
  }

  if (session.restockTimer) {
    const remaining = session.restockTimer.remaining - dt
    if (remaining <= 0) {
      const tradeSlots = pickTradeSlots(session.planetId)
      return { ...session, tradeSlots, restockTimer: null, allSoldOut: false }
    }
    return {
      ...session,
      allSoldOut,
      restockTimer: { ...session.restockTimer, remaining },
    }
  }

  return session
}

/**
 * Buy a trade good from a shop slot.
 *
 * @param session - Current shop session.
 * @param profile - Player profile.
 * @param inventory - Player inventory.
 * @param slotIndex - Which trade slot (0, 1, or 2).
 * @param quantity - Units to buy.
 * @returns Updated session, profile, and inventory.
 */
export function buyTradeGood(
  session: ShopSession,
  profile: PlayerProfile,
  inventory: Inventory,
  slotIndex: number,
  quantity: number,
): { ok: boolean; session: ShopSession; profile: PlayerProfile; inventory: Inventory; reason?: string } {
  const slot = session.tradeSlots[slotIndex]
  if (!slot) return { ok: false, session, profile, inventory, reason: 'Invalid slot index' }

  if (slot.stock < quantity) {
    return { ok: false, session, profile, inventory, reason: 'Insufficient stock' }
  }

  const totalCost = slot.price * quantity

  if (!canFitItem(inventory, slot.itemId, quantity)) {
    return { ok: false, session, profile, inventory, reason: 'Cannot fit item in inventory' }
  }

  const updatedProfile = spendCredits(profile, totalCost)
  if (!updatedProfile) {
    return { ok: false, session, profile, inventory, reason: 'Insufficient credits' }
  }

  const addResult = addItem(inventory, slot.itemId, quantity)
  if (!addResult.ok) {
    return { ok: false, session, profile, inventory, reason: addResult.reason }
  }

  const updatedSlots = [...session.tradeSlots] as [TradeGoodSlot, TradeGoodSlot, TradeGoodSlot]
  updatedSlots[slotIndex] = { ...slot, stock: slot.stock - quantity }
  const updatedSession = { ...session, tradeSlots: updatedSlots }

  return { ok: true, session: updatedSession, profile: updatedProfile, inventory: addResult.inventory }
}

/**
 * Sell an inventory item at the current planet's demand price.
 *
 * @param session - Current shop session (for planet id).
 * @param profile - Player profile.
 * @param inventory - Player inventory.
 * @param itemId - Item to sell.
 * @param quantity - Units to sell.
 * @returns Updated profile and inventory.
 */
export function sellTradeGood(
  session: ShopSession,
  profile: PlayerProfile,
  inventory: Inventory,
  itemId: string,
  quantity: number,
): ShopResult {
  const removeResult = removeItem(inventory, itemId, quantity)
  if (!removeResult.ok) {
    return { ok: false, profile, inventory, reason: removeResult.reason }
  }

  const pricePerUnit = computeSellPrice(session.planetId, itemId)
  if (pricePerUnit <= 0) {
    return { ok: false, profile, inventory, reason: 'Item has no sell value' }
  }

  const totalPayout = pricePerUnit * quantity
  const updatedProfile = addCredits(profile, totalPayout)

  return { ok: true, profile: updatedProfile, inventory: removeResult.inventory }
}
