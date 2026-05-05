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
import type { TradeGoodDefinition } from './tradeTypes'
import { getTradeGoodsByPlanet, getTradeGoodsExcludingPlanet } from './tradeGoods'
import { addItem, canFitItem, removeItem } from '@/lib/inventory/inventory'
import { spendCredits, addCredits, recordTradeCreditsEarned } from '@/lib/player/profile'
import { computeSellPrice } from './planetDemand'

/** Minimum restock timer duration in seconds. */
const RESTOCK_MIN_S = 120

/** Maximum restock timer duration in seconds. */
const RESTOCK_MAX_S = 240

/** Minimum stock for trade goods at or above {@link TRADE_GOOD_CHEAP_PRICE_THRESHOLD} base price. */
export const TRADE_GOOD_MIN_STOCK_EXPENSIVE = 5

/**
 * Minimum stock for trade goods below {@link TRADE_GOOD_CHEAP_PRICE_THRESHOLD} base price.
 * Must be at least the largest single-step buy count in authored `trade-goods` contract steps
 * (see `src/data/contracts/venusian-zeppelin-trade-loop.json`, 10 units per buy).
 */
export const TRADE_GOOD_MIN_STOCK_CHEAP = 10

/** Maximum units stocked per cheap-priced trade-good slot (zeppelin-scale bulk). */
export const TRADE_GOOD_STOCK_MAX_CHEAP = 50

/**
 * Maximum units stocked per expensive trade-good slot — half of {@link TRADE_GOOD_STOCK_MAX_CHEAP}
 * so rare goods stay scarcer than bulk commodities.
 */
export const TRADE_GOOD_STOCK_MAX_EXPENSIVE = 25

/**
 * Cap on distinct trade-good lines offered per station visit (pool size may be smaller).
 */
export const TRADE_GOODS_OFFER_SLOT_CAP = 50

/**
 * Base-price cutoff: goods below this roll {@link TRADE_GOOD_MIN_STOCK_CHEAP}–{@link TRADE_GOOD_STOCK_MAX_CHEAP} stock;
 * goods at or above roll a tighter expensive range.
 */
export const TRADE_GOOD_CHEAP_PRICE_THRESHOLD = 50

/**
 * Fraction of each good's catalog {@link TradeGoodDefinition.basePrice} charged when buying at its
 * source planet. Lower than 1 widens profit on resale where demand is high.
 */
const TRADE_GOOD_SOURCE_BUY_PRICE_FRACTION = 0.78
/** Fraction used for imported goods sold through the Venus marketplace. */
const TRADE_GOOD_IMPORTED_BUY_PRICE_FRACTION = 0.98

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

/** Shuttle hull repair cost in credits (any trading post). */
export const REPAIR_COST = 250

/** Lander hull repair cost in credits (any trading post — restores persisted lander HP). */
export const LANDER_REPAIR_COST = 200

/**
 * Base cost in credits for the first bribe-restock at any port. Each
 * subsequent bribe doubles the cost — see {@link getBribeCost}.
 *
 * Lucas's signature move from the Venusian Zeppelin loop: when the kiosk
 * is rolling the wrong goods (no drill bits, etc.), grease the dock
 * master to force a fresh inventory rotation.
 */
export const BRIBE_BASE_COST = 1000

/**
 * Pick trade-good slots for a planet.
 *
 * Non-Venus: shuffle the local production pool and take up to {@link TRADE_GOODS_OFFER_SLOT_CAP}
 * lines (typically every local good).
 *
 * Venus: full local pool plus random imports until {@link TRADE_GOODS_OFFER_SLOT_CAP} slots total.
 *
 * @param planetId - The planet whose trade goods pool to draw from.
 * @returns Trade good slots with randomized stock.
 */
function pickTradeSlots(planetId: string): TradeGoodSlot[] {
  const allGoods = getTradeGoodsByPlanet(planetId)
  const localSlots = allGoods.map((tg) => buildSlot(tg, false))
  if (planetId !== 'venus') {
    const shuffled = [...localSlots].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, Math.min(TRADE_GOODS_OFFER_SLOT_CAP, shuffled.length))
  }
  const importPool = getTradeGoodsExcludingPlanet('venus')
  const importBudget = Math.max(0, TRADE_GOODS_OFFER_SLOT_CAP - localSlots.length)
  const importSlots = [...importPool]
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(importBudget, importPool.length))
    .map((tg) => buildSlot(tg, true))
  return [...localSlots, ...importSlots]
}

/**
 * Build a shop slot with randomized stock and source/import price policy.
 */
function buildSlot(tg: TradeGoodDefinition, isImported: boolean): TradeGoodSlot {
  const stock =
    tg.basePrice < TRADE_GOOD_CHEAP_PRICE_THRESHOLD
      ? TRADE_GOOD_MIN_STOCK_CHEAP +
        Math.floor(
          Math.random() * (TRADE_GOOD_STOCK_MAX_CHEAP - TRADE_GOOD_MIN_STOCK_CHEAP + 1),
        )
      : TRADE_GOOD_MIN_STOCK_EXPENSIVE +
        Math.floor(
          Math.random() *
            (TRADE_GOOD_STOCK_MAX_EXPENSIVE - TRADE_GOOD_MIN_STOCK_EXPENSIVE + 1),
        )
  const price = Math.round(
    tg.basePrice *
      (isImported ? TRADE_GOOD_IMPORTED_BUY_PRICE_FRACTION : TRADE_GOOD_SOURCE_BUY_PRICE_FRACTION),
  )
  return {
    itemId: tg.id,
    stock,
    price,
    ...(isImported ? { isImported: true, originPlanetId: tg.producedBy } : {}),
  }
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
 * @returns A fresh ShopSession with planet-specific trade good slots.
 */
export function createShopSession(planetId: string): ShopSession {
  const tradeSlots = pickTradeSlots(planetId)
  return {
    planetId,
    tradeSlots,
    restockTimer: null,
    allSoldOut: false,
    bribeCount: 0,
  }
}

/**
 * Cost in credits of the *next* bribe-restock for the given session.
 *
 * Doubles each time: 1000, 2000, 4000, 8000, … (`BRIBE_BASE_COST * 2^bribeCount`).
 *
 * @param session - Current shop session.
 * @returns Credits required to bribe-restock right now.
 */
export function getBribeCost(session: ShopSession): number {
  return BRIBE_BASE_COST * 2 ** session.bribeCount
}

/**
 * Bribe the dock master to force-reroll trade goods. Spends the bribe
 * cost from the player's wallet, replaces the trade slots with a fresh
 * `pickTradeSlots` roll, increments `bribeCount` (so the next bribe
 * doubles), and clears any active restock timer.
 *
 * Per-port-arrival semantics: `bribeCount` lives on the session and is
 * reset to 0 by the next {@link createShopSession} when the player
 * re-enters orbit at a planet.
 *
 * @param session - Current shop session.
 * @param profile - Player profile (for credit spend).
 * @returns Result with updated session and profile, or `ok: false` with
 *   a reason when the player can't afford the bribe.
 */
export function bribeRestockShop(
  session: ShopSession,
  profile: PlayerProfile,
): {
  ok: boolean
  session: ShopSession
  profile: PlayerProfile
  reason?: string
} {
  const cost = getBribeCost(session)
  const updatedProfile = spendCredits(profile, cost)
  if (!updatedProfile) {
    return { ok: false, session, profile, reason: 'Insufficient credits' }
  }

  const tradeSlots = pickTradeSlots(session.planetId)
  const updatedSession: ShopSession = {
    ...session,
    tradeSlots,
    restockTimer: null,
    allSoldOut: false,
    bribeCount: session.bribeCount + 1,
  }

  return { ok: true, session: updatedSession, profile: updatedProfile }
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
 * @param slotIndex - Which trade slot index in the current session.
 * @param quantity - Units to buy.
 * @returns Updated session, profile, and inventory.
 */
export function buyTradeGood(
  session: ShopSession,
  profile: PlayerProfile,
  inventory: Inventory,
  slotIndex: number,
  quantity: number,
): {
  ok: boolean
  session: ShopSession
  profile: PlayerProfile
  inventory: Inventory
  reason?: string
} {
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

  const updatedSlots = [...session.tradeSlots]
  updatedSlots[slotIndex] = { ...slot, stock: slot.stock - quantity }
  const updatedSession = { ...session, tradeSlots: updatedSlots }

  return {
    ok: true,
    session: updatedSession,
    profile: updatedProfile,
    inventory: addResult.inventory,
  }
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
  if (quantity <= 0) {
    return { ok: false, profile, inventory, reason: 'Quantity must be positive' }
  }

  const removeResult = removeItem(inventory, itemId, quantity)
  if (!removeResult.ok) {
    return { ok: false, profile, inventory, reason: removeResult.reason }
  }

  const pricePerUnit = computeSellPrice(session.planetId, itemId)
  if (pricePerUnit <= 0) {
    return { ok: false, profile, inventory, reason: 'Item has no sell value' }
  }

  const totalPayout = pricePerUnit * quantity
  const creditedProfile = addCredits(profile, totalPayout)
  const updatedProfile = recordTradeCreditsEarned(creditedProfile, totalPayout)

  return { ok: true, profile: updatedProfile, inventory: removeResult.inventory }
}
