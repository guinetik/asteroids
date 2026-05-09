import { describe, expect, it } from 'vitest'
import { createInventory, addItem } from '@/lib/inventory/inventory'
import { createProfile } from '@/lib/player/profile'
import {
  computePremiumSellPrice,
  createPremiumTradeSession,
  getPremiumDesirabilityPips,
  isPremiumBuyerItem,
  sellPremiumTradeGood,
} from '@/lib/cosmetics/premiumTrade'
import { computeSellPrice, getDesirabilityPips } from '@/lib/shop/planetDemand'

/** Deterministic payout multiplier exercised in payout math coverage. */
const PREMIUM_PAYOUT_SCALAR = 2

/** Rolled multiplier for pip bonus assertions (ignored by payout math herein). */
const PREMIUM_SESSION_PLACEHOLDER_MULTIPLIER = 1.1

/** Visit roll stub exercised when asserting sell-side credits + inventory deltas. */
const PREMIUM_SALE_UNIT_MULTIPLIER = 1.09

/** Units sold together while validating stack removal remains clean. */
const PREMIUM_SALE_UNITS = 4

/** Matches `minimumPipBonus` in `src/data/cosmetics/pimp-my-shuttle.json`. */
const PREMIUM_PIP_CONFIGURED_MINIMUM_BONUS = 2

/** Shared cap with planet demand tooling. */
const MAX_DESIRABILITY_PIP_COUNT = 5

describe('premium trade tuning', () => {
  const MARS_ORBIT_BODY_ID = 'mars'
  const TRADE_SAMPLE_ID = 'biocultures'

  it('computes deterministic premium payouts from a rolled multiplier', () => {
    const baseline = computeSellPrice(MARS_ORBIT_BODY_ID, TRADE_SAMPLE_ID)
    const session = createPremiumTradeSession(MARS_ORBIT_BODY_ID, () => PREMIUM_PAYOUT_SCALAR)
    expect(computePremiumSellPrice(session, TRADE_SAMPLE_ID)).toBe(
      Math.round(baseline * PREMIUM_PAYOUT_SCALAR),
    )
  })

  it('adds configured pip bonus with a firm five-pip cap', () => {
    const baseline = getDesirabilityPips(MARS_ORBIT_BODY_ID, TRADE_SAMPLE_ID)
    const session = createPremiumTradeSession(
      MARS_ORBIT_BODY_ID,
      () => PREMIUM_SESSION_PLACEHOLDER_MULTIPLIER,
    )
    const premium = getPremiumDesirabilityPips(session, TRADE_SAMPLE_ID)
    expect(premium).toBe(
      Math.min(MAX_DESIRABILITY_PIP_COUNT, baseline + PREMIUM_PIP_CONFIGURED_MINIMUM_BONUS),
    )
  })

  it('accepts tuned trade-good cargo for premium resale', () => {
    expect(isPremiumBuyerItem(TRADE_SAMPLE_ID)).toBe(true)
    expect(isPremiumBuyerItem('olivine')).toBe(false)
  })

  it('sells biocultures for credits without leaving ghost stacks', () => {
    const session = createPremiumTradeSession(
      MARS_ORBIT_BODY_ID,
      () => PREMIUM_SALE_UNIT_MULTIPLIER,
    )
    const pricePerUnit = computePremiumSellPrice(session, TRADE_SAMPLE_ID)

    const profile = createProfile('Fantasia Tester')
    const startingTradeLifetime = profile.achievementStats.lifetimeTradeCreditsEarned

    let inventory = createInventory()
    const stocked = addItem(inventory, TRADE_SAMPLE_ID, PREMIUM_SALE_UNITS)
    expect(stocked.ok).toBe(true)
    if (!stocked.ok) return
    inventory = stocked.inventory

    const sale = sellPremiumTradeGood(
      session,
      profile,
      inventory,
      TRADE_SAMPLE_ID,
      PREMIUM_SALE_UNITS,
    )
    expect(sale.ok).toBe(true)
    if (!sale.ok) return

    const payout = pricePerUnit * PREMIUM_SALE_UNITS
    expect(sale.profile.credits).toBe(profile.credits + payout)
    expect(sale.profile.achievementStats.lifetimeTradeCreditsEarned).toBe(
      startingTradeLifetime + payout,
    )
    expect(sale.profile.achievementStats.lifetimeCargoIntakeCreditsEarned).toBe(payout)
    expect(sale.inventory.stacks.find((s) => s.itemId === TRADE_SAMPLE_ID)).toBeUndefined()

    const rejectsMineral = sellPremiumTradeGood(session, profile, createInventory(), 'olivine', 1)
    expect(rejectsMineral.ok).toBe(false)
  })
})
