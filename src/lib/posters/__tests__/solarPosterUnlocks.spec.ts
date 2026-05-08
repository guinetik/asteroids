import { describe, expect, it } from 'vitest'
import {
  getSolarPosterById,
  getSolarPosterVisibility,
  getUnlockedSolarPosterIds,
  isSolarCompletionPosterUnlocked,
  SOLAR_COMPLETION_POSTER,
  SOLAR_POSTER_CATALOG,
} from '@/lib/posters/solarPosterUnlocks'

describe('solarPosterUnlocks', () => {
  it('keeps poster slots in fixed solar order', () => {
    expect(SOLAR_POSTER_CATALOG.map((poster) => poster.id)).toEqual([
      'sun',
      'mercury',
      'venus',
      'earth',
      'mars',
      'ceres',
      'jupiter',
      'saturn',
      'uranus',
      'neptune',
      'pluto',
    ])
  })

  it('maps achievement unlocks to poster visibility without closing locked holes', () => {
    const visibility = getSolarPosterVisibility([
      'exploration-orbit-jupiter',
      'exploration-orbit-mars',
    ])

    expect(visibility.map((row) => [row.poster.id, row.unlocked])).toEqual([
      ['sun', false],
      ['mercury', false],
      ['venus', false],
      ['earth', true],
      ['mars', true],
      ['ceres', false],
      ['jupiter', true],
      ['saturn', false],
      ['uranus', false],
      ['neptune', false],
      ['pluto', false],
    ])
  })

  it('returns unlocked poster ids including default visible posters', () => {
    expect(getUnlockedSolarPosterIds(['exploration-orbit-sun'])).toEqual(['sun', 'earth'])
  })

  it('unlocks the completion poster after every achievement-backed poster is visible', () => {
    const achievementIds = SOLAR_POSTER_CATALOG.flatMap((poster) =>
      poster.achievementId === null ? [] : [poster.achievementId],
    )
    const missingLastAchievement = achievementIds.slice(0, -1)

    expect(SOLAR_COMPLETION_POSTER.assetPath).toBe('/posters/001.webp')
    expect(isSolarCompletionPosterUnlocked(missingLastAchievement)).toBe(false)
    expect(isSolarCompletionPosterUnlocked(achievementIds)).toBe(true)
  })

  it('looks up poster definitions by id', () => {
    expect(getSolarPosterById('neptune')?.assetPath).toBe('/posters/neptune.webp')
    expect(getSolarPosterById('missing')).toBeNull()
  })
})
