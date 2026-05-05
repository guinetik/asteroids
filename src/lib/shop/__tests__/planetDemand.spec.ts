import { describe, it, expect, beforeEach } from 'vitest'
import {
  getDemandMultiplier,
  computeSellPrice,
  getDesirabilityPips,
  resetDemand,
  tickDemandTimer,
  DEMAND_REFRESH_INTERVAL_S,
  TRADE_ROUTE_SELL_PREMIUM_MULTIPLIER,
} from '../planetDemand'
// Ensure trade goods are loaded (side-effect import)
import '../tradeGoods'

describe('getDemandMultiplier', () => {
  beforeEach(() => resetDemand())

  it('returns a multiplier > 1 for demanded items', () => {
    const m = getDemandMultiplier('mercury', 'cryogenic-coolants')
    expect(m).toBeGreaterThan(1)
    expect(m).toBeLessThan(5)
  })

  it('returns junk multiplier (0.5) for items not demanded', () => {
    const m = getDemandMultiplier('mercury', 'entertainment-media')
    expect(m).toBe(0.5)
  })

  it('returns junk multiplier for unknown planet', () => {
    expect(getDemandMultiplier('unknown-planet', 'cryogenic-coolants')).toBe(0.5)
  })
})

describe('computeSellPrice', () => {
  beforeEach(() => resetDemand())

  it('returns base × multiplier × route sell premium for a demanded item', () => {
    const price = computeSellPrice('mercury', 'cryogenic-coolants')
    const premium = TRADE_ROUTE_SELL_PREMIUM_MULTIPLIER
    expect(price).toBeGreaterThanOrEqual(Math.round(80 * 3.0 * 0.8 * premium))
    expect(price).toBeLessThanOrEqual(Math.round(80 * 3.0 * 1.2 * premium))
  })

  it('returns junk price for non-demanded trade goods', () => {
    const price = computeSellPrice('mercury', 'entertainment-media')
    expect(price).toBe(Math.round(15 * 0.5 * TRADE_ROUTE_SELL_PREMIUM_MULTIPLIER))
  })

  it('returns 0 for unknown items', () => {
    expect(computeSellPrice('mercury', 'nonexistent')).toBe(0)
  })

  it('applies mineral catalog base × demand × premium for belt metals', () => {
    const ceresNiFe = computeSellPrice('ceres', 'iron-nickel-alloy')
    const marsNiFe = computeSellPrice('mars', 'iron-nickel-alloy')
    expect(ceresNiFe).toBeGreaterThan(marsNiFe)
    const premium = TRADE_ROUTE_SELL_PREMIUM_MULTIPLIER
    expect(marsNiFe).toBe(Math.round(34 * 1.0 * premium))
  })

  it('prices troilite higher where chemistry clusters demand sulfur feedstock', () => {
    const venus = computeSellPrice('venus', 'troilite')
    const mars = computeSellPrice('mars', 'troilite')
    expect(venus).toBeGreaterThan(mars)
  })
})

describe('getDesirabilityPips', () => {
  beforeEach(() => resetDemand())

  it('returns 0 for non-demanded items', () => {
    expect(getDesirabilityPips('mercury', 'entertainment-media')).toBe(0)
  })

  it('returns 1-5 for demanded items', () => {
    const pips = getDesirabilityPips('mercury', 'cryogenic-coolants')
    expect(pips).toBeGreaterThanOrEqual(1)
    expect(pips).toBeLessThanOrEqual(5)
  })

  it('returns 0 for unknown items', () => {
    expect(getDesirabilityPips('mercury', 'nonexistent')).toBe(0)
  })

  it('returns 0 pips for minerals at baseline demand (no premium row)', () => {
    expect(getDesirabilityPips('mars', 'iron-nickel-alloy')).toBe(0)
  })

  it('returns pips when a mineral has explicit demand', () => {
    const pips = getDesirabilityPips('ceres', 'iron-nickel-alloy')
    expect(pips).toBeGreaterThanOrEqual(1)
    expect(pips).toBeLessThanOrEqual(5)
  })
})

describe('tickDemandTimer', () => {
  beforeEach(() => resetDemand())

  it('does not refresh before interval', () => {
    expect(tickDemandTimer(10)).toBe(false)
  })

  it('refreshes when interval elapses', () => {
    expect(tickDemandTimer(DEMAND_REFRESH_INTERVAL_S)).toBe(true)
  })
})
