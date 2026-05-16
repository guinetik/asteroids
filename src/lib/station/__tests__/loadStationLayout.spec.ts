import { describe, expect, it } from 'vitest'
import yamadaRaw from '../../../../public/data/stations/yamada-titania.json'
import ceresRaw from '../../../../public/data/stations/ceres-institute.json'
import microwaveRaw from '../../../../public/data/stations/microwave-test.json'
import { loadStationLayout } from '@/lib/station/loadStationLayout'
import { resolveLayout } from '@/lib/station/StationLayout'

describe('Yamada station layout', () => {
  it('loads + validates without throwing', () => {
    expect(() => loadStationLayout(yamadaRaw)).not.toThrow()
  })

  it('resolves into a placement plan with the expected pieces', () => {
    const layout = loadStationLayout(yamadaRaw)
    const plan = resolveLayout(layout)
    const ids = plan.map((p) => p.id).sort()
    expect(ids).toEqual([
      'c-e-bay-straight',
      'c-e-corner',
      'c-e-straight',
      'c-e-straight-2',
      'c-hub',
      'c-n-straight',
      'c-n-straight-2',
      'c-n-straight-3',
      'c-w-bay-straight',
      'c-w-corner',
      'c-w-straight',
      'c-w-straight-2',
      'r-bridge',
      'r-east-bay',
      'r-west-bay',
    ])
    const kinds = new Set(plan.map((p) => p.kind))
    expect(kinds).toEqual(new Set(['room', 'cross', 'corner', 'straight']))
  })
})

describe('Ceres Institute station layout', () => {
  it('loads + validates without throwing', () => {
    expect(() => loadStationLayout(ceresRaw)).not.toThrow()
  })

  it('resolves into the 2-isle T-hub placement plan', () => {
    const layout = loadStationLayout(ceresRaw)
    const plan = resolveLayout(layout)
    const ids = plan.map((p) => p.id).sort()
    expect(ids).toEqual(['c-e-straight', 'c-hub', 'c-w-straight', 'r-east', 'r-west'])
    const kinds = new Set(plan.map((p) => p.kind))
    expect(kinds).toEqual(new Set(['room', 'window', 'straight']))
  })
})

describe('Microwave test station layout', () => {
  it('preserves startup intro metadata for the station briefing HUD', () => {
    const layout = loadStationLayout({
      intro: microwaveRaw.intro,
      rooms: [],
      corridors: [],
    })

    expect(layout.intro?.title).toBe('Abandoned Security Outpost')
    expect(layout.intro?.body).toContain(
      'Somewhere in the station, a security terminal still holds the floor plan. Find the program before crossing to the vault keycard.',
    )
    expect(layout.intro?.status).toEqual(['DERELICT', 'AUX POWER OFFLINE', 'VAULT SEALED'])
  })

  it('stores heist briefing copy in the public microwave-test station data', () => {
    expect(microwaveRaw.intro.title).toBe('Abandoned Security Outpost')
    expect(microwaveRaw.intro.body.join(' ')).toContain('vault keycard')
    expect(microwaveRaw.intro.body.join(' ')).toContain('Restore the generator')
    expect(microwaveRaw.intro.body.join(' ')).not.toMatch(/microwave/i)
  })
})
