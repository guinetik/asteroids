import { describe, it, expect } from 'vitest'
import { createOrbitalMiniGame } from '../orbitalMiniGameFactory'
import { DefaultOrbitalMiniGame } from '../DefaultOrbitalMiniGame'
import { GasCollectionMiniGame } from '../gasCollection/GasCollectionMiniGame'

const DEFAULT_TYPES = [
  'probe-deploy',
  'logistics',
  'chemistry',
  'ice-harvest',
  'maintenance',
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

  it('returns DefaultOrbitalMiniGame for unknown type', () => {
    const mg = createOrbitalMiniGame('mission-2', 'unknown-future-type', 1)
    expect(mg).toBeInstanceOf(DefaultOrbitalMiniGame)
    expect(mg.missionId).toBe('mission-2')
  })
})
