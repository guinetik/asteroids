import { describe, it, expect } from 'vitest'
import { createOrbitalMiniGame } from '../orbitalMiniGameFactory'
import { DefaultOrbitalMiniGame } from '../DefaultOrbitalMiniGame'
import { GasCollectionMiniGame } from '../gasCollection/GasCollectionMiniGame'
import { IceHarvestMiniGame } from '../iceHarvest/IceHarvestMiniGame'
import { MaintenanceMiniGame } from '../maintenance/MaintenanceMiniGame'
import { LogisticsRouteMiniGame } from '../logistics/LogisticsRouteMiniGame'

const DEFAULT_TYPES = [
  'probe-deploy',
]

describe('createOrbitalMiniGame', () => {
  it.each(DEFAULT_TYPES)(
    'returns DefaultOrbitalMiniGame for type "%s"',
    (minigameType) => {
      const mg = createOrbitalMiniGame('mission-1', minigameType, 3)
      expect(mg.status).toBe('active')
      expect(mg.missionId).toBe('mission-1')
      expect(mg).toBeInstanceOf(DefaultOrbitalMiniGame)
    },
  )

  it('returns GasCollectionMiniGame for type "gas-collection"', () => {
    const mg = createOrbitalMiniGame('mission-1', 'gas-collection', 5)
    expect(mg).toBeInstanceOf(GasCollectionMiniGame)
    expect(mg.missionId).toBe('mission-1')
    expect(mg.progressTotal).toBe(5)
  })

  it('returns IceHarvestMiniGame for type "ice-harvest"', () => {
    const mg = createOrbitalMiniGame('mission-1', 'ice-harvest', 4)
    expect(mg).toBeInstanceOf(IceHarvestMiniGame)
    expect(mg.missionId).toBe('mission-1')
    expect(mg.progressTotal).toBe(4)
  })

  it('returns GasCollectionMiniGame for type "chemistry"', () => {
    const mg = createOrbitalMiniGame('mission-1', 'chemistry', 3)
    expect(mg).toBeInstanceOf(GasCollectionMiniGame)
    expect(mg.missionId).toBe('mission-1')
    expect(mg.progressTotal).toBe(3)
  })

  it('returns MaintenanceMiniGame for type "maintenance"', () => {
    const mg = createOrbitalMiniGame('mission-1', 'maintenance', 3)
    expect(mg).toBeInstanceOf(MaintenanceMiniGame)
    expect(mg.missionId).toBe('mission-1')
    expect(mg.progressTotal).toBe(4) // fixed target count, not gatherQuantity
  })

  it('returns LogisticsRouteMiniGame for type "logistics"', () => {
    const mg = createOrbitalMiniGame('mission-1', 'logistics', 4)
    expect(mg).toBeInstanceOf(LogisticsRouteMiniGame)
    expect(mg.missionId).toBe('mission-1')
    expect(mg.progressTotal).toBe(4)
  })

  it('returns DefaultOrbitalMiniGame for unknown type', () => {
    const mg = createOrbitalMiniGame('mission-2', 'unknown-future-type', 1)
    expect(mg).toBeInstanceOf(DefaultOrbitalMiniGame)
    expect(mg.missionId).toBe('mission-2')
  })
})
