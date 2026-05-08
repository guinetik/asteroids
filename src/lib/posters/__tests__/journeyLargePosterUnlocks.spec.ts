import { describe, expect, it } from 'vitest'
import {
  getJourneyLargePosterVisibility,
  JOURNEY_LARGE_POSTER_CATALOG,
} from '@/lib/posters/journeyLargePosterUnlocks'

describe('journeyLargePosterUnlocks', () => {
  it('authors Act I then Act II journey frames', () => {
    expect(JOURNEY_LARGE_POSTER_CATALOG.map((p) => p.id)).toEqual([
      'journey-act1-wall',
      'journey-act2-wall',
    ])
  })

  it('maps journey achievements independently', () => {
    const visibility = getJourneyLargePosterVisibility(['journey-act-1-inner-system'])

    expect(visibility.map((row) => [row.poster.id, row.unlocked])).toEqual([
      ['journey-act1-wall', true],
      ['journey-act2-wall', false],
    ])
  })
})
