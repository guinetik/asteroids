/**
 * Planet demand and pricing system.
 *
 * Loads the demand matrix, applies ±20% variance on a global
 * timer, and computes sell prices and desirability pips.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-planet-shop-system-design.md
 */
import type { DemandEntry } from './tradeTypes'
import { getTradeGood } from './tradeGoods'
import { getSellPrice } from './catalog'

import rawDemand from '@/data/shop/planet-demand.json'

/** Maximum desirability pip rating. */
const MAX_PIPS = 5

/** Variance range applied to demand multipliers (±20%). */
const VARIANCE_RANGE = 0.2

/** Global demand refresh interval in seconds (~5 minutes). */
export const DEMAND_REFRESH_INTERVAL_S = 300

/** Fallback multiplier for trade goods a planet doesn't specifically demand. */
const JUNK_MULTIPLIER = 0.5

/**
 * When a mineral has no explicit demand row for the current planet, sell at catalog
 * base × this multiplier (before route premium). Trade goods still use junk pricing
 * if undemanded — minerals stay broadly sellable everywhere.
 */
const MINERAL_BASELINE_MULTIPLIER = 1.0

/** Multiplier at or below this is treated as "no premium" for mineral demand pips. */
const MINERAL_PIP_NEUTRAL_THRESHOLD = 1.05

/**
 * Extra payout on trade-good sales after demand is applied. Shop buys use a sub-1 fraction of
 * catalog base price, so this widens route profit margins.
 */
const TRADE_ROUTE_SELL_PREMIUM_MULTIPLIER = 1.22

// ─── Internal state ─────────────────────────────────────────────────────────

/** Internal structure for each planet's demand data loaded from JSON. */
interface PlanetDemandData {
  /** List of demand entries for this planet. */
  demands: DemandEntry[]
}

const demandMap: Record<string, PlanetDemandData> = rawDemand as unknown as Record<
  string,
  PlanetDemandData
>

/** Per-item variance offsets keyed by `planetId:itemId`. Randomized on refresh. */
let varianceMap: Record<string, number> = {}

/** Time accumulator for global demand refresh. */
let demandTimer = 0

/**
 * Randomize all variance offsets.
 */
export function refreshDemandVariance(): void {
  varianceMap = {}
  for (const [planetId, data] of Object.entries(demandMap)) {
    for (const entry of data.demands) {
      const key = `${planetId}:${entry.itemId}`
      varianceMap[key] = (Math.random() * 2 - 1) * VARIANCE_RANGE
    }
  }
}

// Initialize variance on module load
refreshDemandVariance()

/**
 * Tick the global demand timer. Refreshes variance when the interval elapses.
 *
 * @param dt - Delta time in seconds.
 * @returns True if variance was refreshed this tick.
 */
export function tickDemandTimer(dt: number): boolean {
  demandTimer += dt
  if (demandTimer >= DEMAND_REFRESH_INTERVAL_S) {
    demandTimer = 0
    refreshDemandVariance()
    return true
  }
  return false
}

/**
 * Reset the demand timer and variance (used on death/restart).
 */
export function resetDemand(): void {
  demandTimer = 0
  refreshDemandVariance()
}

/**
 * Demand multiplier from the matrix including ±variance, or undefined if this planet
 * has no row for the item.
 *
 * @param planetId - Planet where the player is selling.
 * @param itemId - Trade good or mineral item id.
 * @returns Effective multiplier, or undefined when not listed for this planet.
 */
function getDemandEntryMultiplier(planetId: string, itemId: string): number | undefined {
  const data = demandMap[planetId]
  if (!data) return undefined

  const entry = data.demands.find((d) => d.itemId === itemId)
  if (!entry) return undefined

  const key = `${planetId}:${itemId}`
  const variance = varianceMap[key] ?? 0
  return entry.multiplier * (1 + variance)
}

/**
 * Get the current demand multiplier for trade goods at a planet.
 * Returns the junk multiplier (0.5) if the planet doesn't want the item.
 *
 * @param planetId - Planet where the player is selling.
 * @param itemId - Trade good id.
 * @returns Current demand multiplier with variance applied.
 */
export function getDemandMultiplier(planetId: string, itemId: string): number {
  const m = getDemandEntryMultiplier(planetId, itemId)
  if (m !== undefined) return m
  return JUNK_MULTIPLIER
}

/**
 * Sell-price multiplier for mined minerals: explicit demand rows pay a premium;
 * otherwise stations buy at baseline catalog value (no junk penalty).
 *
 * @param planetId - Planet where the player is selling.
 * @param itemId - Mineral inventory item id.
 */
function getMineralSellMultiplier(planetId: string, itemId: string): number {
  const m = getDemandEntryMultiplier(planetId, itemId)
  if (m !== undefined) return m
  return MINERAL_BASELINE_MULTIPLIER
}

/**
 * Compute the sell price for an item at a planet.
 * Trade goods use the demand matrix with junk pricing when undemanded.
 * Minerals use catalog base prices from shop.json × mineral demand × route premium.
 *
 * @param planetId - Planet where the player is selling.
 * @param itemId - Item id (trade good or mineral).
 * @returns Credit value per unit, or 0 if the item has no sell value.
 */
export function computeSellPrice(planetId: string, itemId: string): number {
  const tg = getTradeGood(itemId)
  if (tg) {
    const multiplier = getDemandMultiplier(planetId, itemId)
    return Math.round(tg.basePrice * multiplier * TRADE_ROUTE_SELL_PREMIUM_MULTIPLIER)
  }

  const mineralBase = getSellPrice(itemId)
  if (mineralBase !== undefined) {
    const multiplier = getMineralSellMultiplier(planetId, itemId)
    return Math.round(mineralBase * multiplier * TRADE_ROUTE_SELL_PREMIUM_MULTIPLIER)
  }

  return 0
}

/**
 * Map a demand multiplier (trade or mineral) to 1–5 pips.
 *
 * @param multiplier - Effective demand multiplier including variance.
 */
function multiplierToPips(multiplier: number): number {
  if (multiplier <= JUNK_MULTIPLIER) return 0
  const pips = Math.round(((multiplier - 1.0) / 3.0) * (MAX_PIPS - 1)) + 1
  return Math.max(0, Math.min(MAX_PIPS, pips))
}

/**
 * Compute desirability pips (0–5) for an item at a planet.
 *
 * @param planetId - Planet where the player is selling.
 * @param itemId - Trade good or mineral id.
 * @returns Integer pip count 0–5.
 */
export function getDesirabilityPips(planetId: string, itemId: string): number {
  const tg = getTradeGood(itemId)
  if (tg) {
    const multiplier = getDemandMultiplier(planetId, itemId)
    return multiplierToPips(multiplier)
  }

  const mineralBase = getSellPrice(itemId)
  if (mineralBase === undefined) return 0

  const multiplier = getMineralSellMultiplier(planetId, itemId)
  if (multiplier <= MINERAL_PIP_NEUTRAL_THRESHOLD) return 0

  return multiplierToPips(multiplier)
}
