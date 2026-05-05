import { describe, it, expect } from 'vitest'
import mineral from '@/data/missions/ceres-institute-mineral-analysis.json'
import dan from '@/data/missions/ceres-institute-dan.json'

describe('Ceres Institute mission grants', () => {
  it('mineral grants ceres-mineral-results-crate with replenish flag', () => {
    expect(mineral.grantsItemOnComplete).toEqual({
      itemId: 'ceres-mineral-results-crate',
      count: 1,
      replenishWhileStepOpen: true,
    })
  })
  it('dan grants ceres-dan-results-crate with replenish flag', () => {
    expect(dan.grantsItemOnComplete).toEqual({
      itemId: 'ceres-dan-results-crate',
      count: 1,
      replenishWhileStepOpen: true,
    })
  })
})
