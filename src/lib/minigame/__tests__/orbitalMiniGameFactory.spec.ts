import { describe, it, expect } from 'vitest'
import { createOrbitalMiniGame } from '../orbitalMiniGameFactory'
import { DefaultOrbitalMiniGame } from '../DefaultOrbitalMiniGame'
import { GasCollectionMiniGame } from '../gasCollection/GasCollectionMiniGame'
import { IceHarvestMiniGame } from '../iceHarvest/IceHarvestMiniGame'
import { MaintenanceMiniGame } from '../maintenance/MaintenanceMiniGame'
import { LogisticsRouteMiniGame } from '../logistics/LogisticsRouteMiniGame'
import { ProbeDeployMiniGame } from '../probeDeploy/ProbeDeployMiniGame'

describe('createOrbitalMiniGame', () => {
  it('returns ProbeDeployMiniGame for type "probe-deploy"', () => {
    const mg = createOrbitalMiniGame('mission-1', 'probe-deploy', 3, 'mercury')
    expect(mg).toBeInstanceOf(ProbeDeployMiniGame)
    expect(mg.missionId).toBe('mission-1')
  })

  it('passes planetId through to ProbeDeployMiniGame', () => {
    const mg = createOrbitalMiniGame('mission-1', 'probe-deploy', 2, 'uranus')
    expect(mg).toBeInstanceOf(ProbeDeployMiniGame)
    expect((mg as ProbeDeployMiniGame).planetId).toBe('uranus')
  })

  it('defaults planetId to mercury when not provided for probe-deploy', () => {
    const mg = createOrbitalMiniGame('mission-1', 'probe-deploy', 2)
    expect(mg).toBeInstanceOf(ProbeDeployMiniGame)
    expect((mg as ProbeDeployMiniGame).planetId).toBe('mercury')
  })

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
