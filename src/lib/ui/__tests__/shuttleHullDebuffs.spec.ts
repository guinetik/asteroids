import { describe, expect, it } from 'vitest'
import { buildShuttleHullDebuffs } from '../shuttleHullDebuffs'

describe('buildShuttleHullDebuffs', () => {
  it('places radiation, gravity, and heat as compact hull debuffs', () => {
    expect(
      buildShuttleHullDebuffs({
        temperature: 100,
        temperatureVisible: true,
        radiation: { zone: 3, damageActive: true, visible: true },
        gravity: { proximity: 0.8, bodyName: 'Sun', visible: true },
      }),
    ).toEqual([
      {
        id: 'radiation',
        label: 'RAD CRIT - EXPOSED',
        tone: 'radiation',
      },
      {
        id: 'gravity',
        label: 'GRAV CRIT - Sun',
        tone: 'gravity',
      },
      {
        id: 'heat',
        label: 'HEAT 100°',
        tone: 'heat',
      },
    ])
  })

  it('places freezing as a hull debuff without radiation', () => {
    expect(
      buildShuttleHullDebuffs({
        temperature: -42.4,
        temperatureVisible: true,
        radiation: { zone: 0, damageActive: false, visible: false },
        gravity: { proximity: 0, bodyName: null, visible: false },
      }),
    ).toEqual([
      {
        id: 'freeze',
        label: 'FREEZE 42°',
        tone: 'freeze',
      },
    ])
  })

  it('omits inactive debuffs', () => {
    expect(
      buildShuttleHullDebuffs({
        temperature: 0,
        temperatureVisible: false,
        radiation: { zone: 0, damageActive: false, visible: false },
        gravity: { proximity: 0, bodyName: null, visible: false },
      }),
    ).toEqual([])
  })
})
