import { describe, it, expect } from 'vitest'
import { createOrbitalMiniGame } from '../orbitalMiniGameFactory'
import { DefaultOrbitalMiniGame } from '../DefaultOrbitalMiniGame'

const ALL_MINIGAME_TYPES = [
  'gas-collection',
  'probe-deploy',
  'logistics',
  'chemistry',
  'ice-harvest',
  'maintenance',
]

describe('createOrbitalMiniGame', () => {
  it.each(ALL_MINIGAME_TYPES)(
    'returns a valid OrbitalMiniGame for type "%s"',
    (minigameType) => {
      const mg = createOrbitalMiniGame('mission-1', minigameType)
      expect(mg.status).toBe('active')
      expect(mg.missionId).toBe('mission-1')
      expect(mg).toBeInstanceOf(DefaultOrbitalMiniGame)
    },
  )

  it('returns DefaultOrbitalMiniGame for unknown type', () => {
    const mg = createOrbitalMiniGame('mission-2', 'unknown-future-type')
    expect(mg).toBeInstanceOf(DefaultOrbitalMiniGame)
    expect(mg.missionId).toBe('mission-2')
  })
})
