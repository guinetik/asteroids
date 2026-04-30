/**
 * Tests for the special-mission registry.
 *
 * @author guinetik
 * @date 2026-04-29
 * @spec docs/superpowers/specs/2026-04-29-jovian-hektor-mission-routing-design.md
 */
import { describe, expect, it } from 'vitest'
import { getSpecialMissionById, SPECIAL_MISSIONS } from '../specialMissions'

describe('SPECIAL_MISSIONS registry', () => {
  it('includes consortium-certification (regression)', () => {
    expect(getSpecialMissionById('consortium-certification')).toBeTruthy()
  })

  it('includes the four Jovian special missions', () => {
    const ids = [
      'jovian-prospection-hektor-photometry',
      'jovian-prospection-hektor-dan',
      'jovian-prospection-saturn-photometry',
      'jovian-prospection-saturn-dan',
    ]
    for (const id of ids) {
      expect(getSpecialMissionById(id), `expected ${id} in registry`).toBeTruthy()
    }
  })

  it('returns deep-cloned missions (mutation does not leak)', () => {
    const a = getSpecialMissionById('jovian-prospection-hektor-photometry')
    const b = getSpecialMissionById('jovian-prospection-hektor-photometry')
    expect(a).not.toBe(b)
    if (a) a.totalReward = 999999
    expect(b?.totalReward).not.toBe(999999)
  })

  it('all five missions are kind: "special"', () => {
    for (const mission of SPECIAL_MISSIONS) {
      expect(mission.kind).toBe('special')
    }
  })
})
