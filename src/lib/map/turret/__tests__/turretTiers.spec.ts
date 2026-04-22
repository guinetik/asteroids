import { describe, it, expect } from 'vitest'
import { pickTier, TURRET_TIERS } from '../turretTiers'

describe('pickTier', () => {
  it('returns small for radius below small cutoff', () => {
    expect(pickTier(0.05).id).toBe('small')
    expect(pickTier(0.14).id).toBe('small')
  })

  it('returns medium for radius between small and medium cutoffs', () => {
    expect(pickTier(0.16).id).toBe('medium')
    expect(pickTier(0.27).id).toBe('medium')
  })

  it('returns large for radius above medium cutoff', () => {
    expect(pickTier(0.29).id).toBe('large')
    expect(pickTier(1000).id).toBe('large')
  })

  it('exposes tier HP and lootId', () => {
    expect(TURRET_TIERS.small.hpKg).toBeGreaterThan(0)
    expect(TURRET_TIERS.medium.hpKg).toBeGreaterThan(TURRET_TIERS.small.hpKg)
    expect(TURRET_TIERS.large.hpKg).toBeGreaterThan(TURRET_TIERS.medium.hpKg)
    expect(TURRET_TIERS.small.lootId).toBe('asteroid-belt-small')
    expect(TURRET_TIERS.medium.lootId).toBe('asteroid-belt-medium')
    expect(TURRET_TIERS.large.lootId).toBe('asteroid-belt-large')
  })
})
