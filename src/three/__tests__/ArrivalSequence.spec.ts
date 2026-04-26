import { describe, expect, it } from 'vitest'
import { ARRIVAL_SEQUENCE_DURATION } from '@/three/ArrivalSequence'

describe('ARRIVAL_SEQUENCE_DURATION', () => {
  it('totals to 1.5 establish + 4.0 transition + 3.5 approach + 1.5 flip + 1.5 doors + 1.8 detach + 1.0 fadeout', () => {
    expect(ARRIVAL_SEQUENCE_DURATION).toBeCloseTo(14.8, 5)
  })
})
