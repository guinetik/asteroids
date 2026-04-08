/**
 * Tests for upgrade purchase credit checks.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/superpowers/specs/2026-04-07-upgrade-system-design.md
 */
import { describe, expect, it } from 'vitest'
import { createProfile } from '@/lib/player/profile'
import { tryPurchaseNextUpgradeLevel } from '../upgradePurchase'

describe('tryPurchaseNextUpgradeLevel', () => {
  it('buys level 1 when at 0 with enough credits', () => {
    const profile = createProfile('Test')
    const result = tryPurchaseNextUpgradeLevel(profile, 'shuttleThrusterEfficiency', 0)
    expect(result).toEqual({
      ok: true,
      newLevel: 1,
      creditsSpent: 500,
      profile: expect.objectContaining({ credits: profile.credits - 500 }),
    })
  })

  it('fails at max level', () => {
    const profile = createProfile('Test')
    const result = tryPurchaseNextUpgradeLevel(profile, 'shuttleThrusterEfficiency', 3)
    expect(result).toEqual({ ok: false, reason: 'max_level' })
  })

  it('fails with insufficient credits', () => {
    const profile = { ...createProfile('Test'), credits: 100 }
    const result = tryPurchaseNextUpgradeLevel(profile, 'shuttleRadiationResistance', 0)
    expect(result).toEqual({ ok: false, reason: 'insufficient_credits' })
  })
})
