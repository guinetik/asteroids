/**
 * Unit tests for {@link BunkerMinigame}.
 *
 * Covers deterministic state-driven parts: step list shape, step advancement,
 * wave progress accounting, completion / failure flags. Visuals (the scene
 * controller) are mocked — exercised end-to-end manually in the level view.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */
import { describe, it, expect, vi } from 'vitest'
import { BunkerMinigame } from '../BunkerMinigame'
import type { ConcreteObjective } from '@/lib/missions/types'

vi.mock('@/three/bunker/BunkerSceneController', () => {
  const fake = {
    activate: vi.fn(),
    deactivate: vi.fn(),
    tick: vi.fn(),
    dispose: vi.fn(),
    spawnWave: vi.fn(),
    enemyDirector: {
      enemies: [],
      tick: vi.fn(),
      despawnAll: vi.fn(),
    },
    hatch: { setOpen: vi.fn(), active: false },
    door: { setOpen: vi.fn() },
    playerSpawn: { x: 0, y: 0, z: 0 },
    hatchPosition: { x: 0, z: 0 },
    doorPosition: { x: 0, z: 5 },
    installEnemySpawnObserver: vi.fn(() => () => {}),
  }
  return { BunkerSceneController: vi.fn(() => fake) }
})

const baseObjective: ConcreteObjective = {
  type: 'bunker',
  x: 0,
  z: 0,
  waveCount: 3,
  reward: 5000,
}

/**
 * Construct a minigame instance via the test seam factory with stable
 * defaults. Keeps the individual `it` blocks free of boilerplate.
 */
function buildMinigame(): BunkerMinigame {
  return BunkerMinigame.createForTest({
    objectiveIndex: 0,
    objective: baseObjective,
    missionId: 'test-mission',
    factionTint: 0xffffff,
  })
}

describe('BunkerMinigame', () => {
  it('starts with all 6 steps, first one active', () => {
    const m = buildMinigame()
    expect(m.steps.length).toBe(6)
    expect(m.steps[0]!.active).toBe(true)
    expect(m.steps[0]!.complete).toBe(false)
  })

  it('advances steps as the player progresses', () => {
    const m = buildMinigame()
    m.advanceStepForTest(0) // travel
    m.advanceStepForTest(1) // land
    m.advanceStepForTest(2) // enter
    expect(m.steps[3]!.active).toBe(true)
  })

  it('progressCurrent / progressTotal track waves cleared', () => {
    const m = buildMinigame()
    m.startWavesForTest()
    expect(m.progressTotal).toBe(3)
    expect(m.progressCurrent).toBe(0)
    m.notifyWaveClearedForTest()
    expect(m.progressCurrent).toBe(1)
  })

  it('marks status=completed after extract', () => {
    const m = buildMinigame()
    m.completeForTest()
    expect(m.status).toBe('completed')
  })

  it('marks status=failed on player death', () => {
    const m = buildMinigame()
    m.onKillPlayer?.()
    expect(m.status).toBe('failed')
  })
})
