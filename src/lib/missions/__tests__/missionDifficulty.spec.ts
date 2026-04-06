import { describe, it, expect } from 'vitest'
import { computeMissionDifficulty } from '../missionDifficulty'
import type { UpgradeLevels } from '@/lib/upgrades'

describe('computeMissionDifficulty', () => {
  it('returns 1 for all level-0 upgrades', () => {
    const levels: UpgradeLevels = {
      shuttleFuelUpgrade: 0,
      shuttleBoosterEfficiencyUpgrade: 0,
      shuttleBrakeEfficiencyUpgrade: 0,
      shuttleThrustersEfficiencyUpgrade: 0,
      heatShieldResistance: 0,
      heatShieldArmor: 0,
    }
    expect(computeMissionDifficulty(levels)).toBe(1)
  })

  it('returns 10 for all level-3 upgrades', () => {
    const levels: UpgradeLevels = {
      shuttleFuelUpgrade: 3,
      shuttleBoosterEfficiencyUpgrade: 3,
      shuttleBrakeEfficiencyUpgrade: 3,
      shuttleThrustersEfficiencyUpgrade: 3,
      heatShieldResistance: 3,
      heatShieldArmor: 3,
    }
    expect(computeMissionDifficulty(levels)).toBe(10)
  })

  it('returns 4 for all level-1 upgrades', () => {
    const levels: UpgradeLevels = {
      shuttleFuelUpgrade: 1,
      shuttleBoosterEfficiencyUpgrade: 1,
      shuttleBrakeEfficiencyUpgrade: 1,
      shuttleThrustersEfficiencyUpgrade: 1,
      heatShieldResistance: 1,
      heatShieldArmor: 1,
    }
    expect(computeMissionDifficulty(levels)).toBe(4)
  })

  it('returns 7 for all level-2 upgrades', () => {
    const levels: UpgradeLevels = {
      shuttleFuelUpgrade: 2,
      shuttleBoosterEfficiencyUpgrade: 2,
      shuttleBrakeEfficiencyUpgrade: 2,
      shuttleThrustersEfficiencyUpgrade: 2,
      heatShieldResistance: 2,
      heatShieldArmor: 2,
    }
    expect(computeMissionDifficulty(levels)).toBe(7)
  })

  it('handles mixed levels (averages correctly)', () => {
    const levels: UpgradeLevels = {
      shuttleFuelUpgrade: 3,
      shuttleBoosterEfficiencyUpgrade: 0,
      shuttleBrakeEfficiencyUpgrade: 0,
      shuttleThrustersEfficiencyUpgrade: 0,
      heatShieldResistance: 0,
      heatShieldArmor: 0,
    }
    // avg = 3/6 = 0.5, floor(0.5/3*9)+1 = floor(1.5)+1 = 2
    expect(computeMissionDifficulty(levels)).toBe(2)
  })

  it('handles empty/undefined levels as 0', () => {
    expect(computeMissionDifficulty({})).toBe(1)
  })
})
