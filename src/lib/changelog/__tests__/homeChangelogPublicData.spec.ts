import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

interface HomeChangelogUpdate {
  title: string
  date: string
  backgroundImage: string
  description: string
  changes: string[]
}

function loadHomeChangelogUpdates(): HomeChangelogUpdate[] {
  const filePath = join(process.cwd(), 'public/data/changelog/home-updates.json')
  return JSON.parse(readFileSync(filePath, 'utf8')) as HomeChangelogUpdate[]
}

describe('home prelude changelog JSON', () => {
  it('includes The Habitat Update with expected launch notes', () => {
    const updates = loadHomeChangelogUpdates()
    const habitat = updates.find((update) => update.title === 'The Habitat Update')

    expect(habitat?.date).toBe('May 13, 2026')
    expect(habitat?.description).toMatch(/habitat/i)
    expect(habitat?.changes).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/walk/i),
        expect.stringMatching(/second ship passenger/i),
        expect.stringMatching(/achievements/i),
        expect.stringMatching(/Fantasia/i),
      ]),
    )
  })

  it('includes the Pimp My Ride Update for Fantasia shop cosmetics', () => {
    const updates = loadHomeChangelogUpdates()
    const pimpMyRide = updates.find((update) => update.title === 'Pimp My Ride Update')

    expect(pimpMyRide?.date).toBe('May 05, 2026')
    expect(pimpMyRide?.description).toMatch(/Fantasia/i)
    expect(pimpMyRide?.changes).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/cosmetics shop/i),
        expect.stringMatching(/paint/i),
        expect.stringMatching(/thruster/i),
      ]),
    )
  })

  it('includes the Launch Update for the May 01 release', () => {
    const updates = loadHomeChangelogUpdates()
    const launch = updates.find((update) => update.title === 'Launch Update')

    expect(launch?.date).toBe('May 01, 2026')
    expect(launch?.backgroundImage).toBe('/og-image.png')
    expect(launch?.changes).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/planetary orrery/i),
        expect.stringMatching(/gravity/i),
        expect.stringMatching(/procedural asteroids/i),
        expect.stringMatching(/story/i),
      ]),
    )
  })

  it('contains only entries the index prelude can render', () => {
    const updates = loadHomeChangelogUpdates()

    expect(updates.length).toBeGreaterThan(0)
    for (const update of updates) {
      expect(update.title.trim()).not.toBe('')
      expect(update.date.trim()).not.toBe('')
      expect(update.backgroundImage).toMatch(/^\/.+\.(webp|png|jpg|jpeg)$/)
      expect(update.description.trim()).not.toBe('')
      expect(update.changes.length).toBeGreaterThan(0)
    }
  })
})
