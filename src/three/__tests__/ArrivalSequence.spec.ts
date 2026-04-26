import { describe, expect, it } from 'vitest'
import { ARRIVAL_SEQUENCE_DURATION } from '@/three/ArrivalSequence'

describe('ARRIVAL_SEQUENCE_DURATION', () => {
  it('includes the establish phase plus the original 15.5s timeline', () => {
    expect(ARRIVAL_SEQUENCE_DURATION).toBeCloseTo(17.5, 5)
  })
})
