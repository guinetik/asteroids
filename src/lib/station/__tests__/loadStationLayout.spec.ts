import { describe, expect, it } from 'vitest'
import yamadaRaw from '../../../../public/data/stations/yamada-titania.json'
import ceresRaw from '../../../../public/data/stations/ceres-institute.json'
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
