import { describe, it, expect } from 'vitest'
import { computeMissionDifficulty } from '../missionDifficulty'
import { UPGRADE_DEFINITIONS, type UpgradeId, type UpgradeLevels } from '@/lib/upgrades'

/** Helper: set all upgrades to the same level. */
function allAtLevel(level: number): UpgradeLevels {
  const levels: UpgradeLevels = {}
  for (const id of Object.keys(UPGRADE_DEFINITIONS) as UpgradeId[]) {
    levels[id] = level
  }
  return levels
}

describe('computeMissionDifficulty', () => {
  it('returns 1 for all level-0 upgrades', () => {
    expect(computeMissionDifficulty(allAtLevel(0))).toBe(1)
  })

  it('returns 10 for all level-3 upgrades', () => {
    expect(computeMissionDifficulty(allAtLevel(3))).toBe(10)
  })

  it('returns 4 for all level-1 upgrades', () => {
    expect(computeMissionDifficulty(allAtLevel(1))).toBe(4)
  })

  it('returns 7 for all level-2 upgrades', () => {
    expect(computeMissionDifficulty(allAtLevel(2))).toBe(7)
  })

  it('handles mixed levels (averages correctly)', () => {
    // 1 upgrade at level 3, rest 0 → low average → difficulty 1
    const levels: UpgradeLevels = { shuttleSystemsEfficiency: 3 }
    expect(computeMissionDifficulty(levels)).toBe(1)
  })

  it('handles empty/undefined levels as 0', () => {
    expect(computeMissionDifficulty({})).toBe(1)
  })
})
