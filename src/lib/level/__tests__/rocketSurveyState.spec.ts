/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RocketSurveyState, type SurveyQuotaSnapshot } from '../rocketSurveyState'

const ALWAYS_FOUND = (itemId: string) => ({ spawnIndex: itemId === 'olivine' ? 1 : 2 })
const NEVER_FOUND = () => null

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
})
