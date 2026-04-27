/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { RocketSurveyState, type SurveyQuotaSnapshot } from '../rocketSurveyState'

const ALWAYS_FOUND = (itemId: string) => ({ spawnIndex: itemId === 'olivine' ? 1 : 2 })

const QUOTA_OLIVINE_PENDING: SurveyQuotaSnapshot = { itemId: 'olivine', minedKg: 0, targetKg: 10 }
const QUOTA_IRON_PENDING: SurveyQuotaSnapshot = { itemId: 'iron', minedKg: 0, targetKg: 10 }
const QUOTA_OLIVINE_COMPLETE: SurveyQuotaSnapshot = {
  itemId: 'olivine',
  minedKg: 10,
  targetKg: 10,
}

describe('RocketSurveyState', () => {
  let state: RocketSurveyState

  beforeEach(() => {
    state = new RocketSurveyState({ rockAvailability: ALWAYS_FOUND })
  })

  it('initialises in idle phase with no scan target', () => {
    expect(state.phase).toBe('idle')
    expect(state.surveyHp).toBe(0)
    expect(state.targetItemId).toBeNull()
  })

  it('moves to exhausted when all quotas are met via setQuotas', () => {
    state.setQuotas([QUOTA_OLIVINE_COMPLETE])
    expect(state.phase).toBe('exhausted')
  })

  it('stays idle when at least one quota has remaining work', () => {
    state.setQuotas([QUOTA_OLIVINE_PENDING, QUOTA_OLIVINE_COMPLETE])
    expect(state.phase).toBe('idle')
  })

  it('returns null and stays idle when no scannable mineral exists', () => {
    state.setQuotas([])
    const result = state.scienceHit()
    expect(result).toBeNull()
    expect(state.phase).toBe('idle')
  })

  it('transitions idle → ramping on the first hit and initialises survey HP', () => {
    state.setQuotas([QUOTA_OLIVINE_PENDING, QUOTA_IRON_PENDING])
    const result = state.scienceHit()
    expect(result).not.toBeNull()
    expect(result!.phase).toBe('ramping')
    expect(result!.justRevealed).toBe(false)
    expect(result!.surveyHp).toBe(28)
    expect(result!.surveyHpInitial).toBe(32)
    expect(result!.targetItemId).toBe('olivine')
    expect(state.phase).toBe('ramping')
    expect(state.targetItemId).toBe('olivine')
  })

  it('decrements survey HP per hit while in ramping', () => {
    state.setQuotas([QUOTA_OLIVINE_PENDING])
    state.scienceHit() // hp 32 -> 28
    state.scienceHit() // hp 28 -> 24
    const result = state.scienceHit() // hp 24 -> 20
    expect(result!.phase).toBe('ramping')
    expect(result!.surveyHp).toBe(20)
    expect(result!.justRevealed).toBe(false)
  })

  it('returns null while exhausted', () => {
    state.setQuotas([QUOTA_OLIVINE_COMPLETE])
    expect(state.scienceHit()).toBeNull()
  })
})
