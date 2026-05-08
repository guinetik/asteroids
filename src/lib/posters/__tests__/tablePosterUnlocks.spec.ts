import { describe, expect, it } from 'vitest'
import { getTablePosterVisibility, TABLE_POSTER_CATALOG } from '@/lib/posters/tablePosterUnlocks'

describe('tablePosterUnlocks', () => {
  it('keeps only mission-line posters above the mess table', () => {
    expect(TABLE_POSTER_CATALOG.map((p) => p.id)).toEqual(['lander', 'eva', 'shuttle'])
  })

  it('maps mission achievements to poster visibility', () => {
    const visibility = getTablePosterVisibility([
      'exploration-three-asteroids',
      'missions-eva-five',
    ])

    expect(visibility.map((row) => [row.poster.id, row.unlocked])).toEqual([
      ['lander', true],
      ['eva', true],
      ['shuttle', false],
    ])
  })
})
