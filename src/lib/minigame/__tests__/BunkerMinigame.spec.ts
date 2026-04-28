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

const { fakeSceneInstance } = vi.hoisted(() => {
  return {
    fakeSceneInstance: {
      activate: vi.fn(),
      deactivate: vi.fn(),
      tick: vi.fn(),
      dispose: vi.fn(),
      spawnWave: vi.fn(),
      enemyDirector: {
        enemies: [] as { enemy: { alive: boolean } }[],
        tick: vi.fn(),
        despawnAll: vi.fn(),
      },
      hatch: { setOpen: vi.fn(), active: false },
      door: { setOpen: vi.fn() },
      playerSpawn: { x: 0, y: 0, z: 0 },
      hatchPosition: { x: 0, z: 0 },
      doorPosition: { x: 0, z: 5 },
      installEnemySpawnObserver: vi.fn(() => () => {}),
    },
  }
})

vi.mock('@/three/bunker/BunkerSceneController', () => ({
  BunkerSceneController: vi.fn(function () {
    return fakeSceneInstance
  }),
}))

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
  // Reset shared mock state between builds so spawn-counts don't leak.
  fakeSceneInstance.spawnWave.mockClear()
  fakeSceneInstance.enemyDirector.enemies = []
  return BunkerMinigame.createForTest({
    objectiveIndex: 0,
    objective: baseObjective,
    missionId: 'test-mission',
    factionTint: 0xffffff,
    difficulty: 1,
  })
}

describe('BunkerMinigame', () => {
  it('starts with all 4 steps, first one active', () => {
    const m = buildMinigame()
    expect(m.steps.length).toBe(4)
    expect(m.steps[0]!.active).toBe(true)
    expect(m.steps[0]!.complete).toBe(false)
  })

  it('advances steps as the player progresses', () => {
    const m = buildMinigame()
    m.advanceStepForTest(0) // land
    m.advanceStepForTest(1) // enter
    m.advanceStepForTest(2) // clear waves
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

  it('spawns the wave roster once on entry to wave-active', () => {
    fakeSceneInstance.spawnWave.mockClear()
    fakeSceneInstance.enemyDirector.enemies = []
    // The test-seam factory wires `null` as the scene, so wave-active spawn
    // branches can't fire through it. Use the production `create()` path —
    // the BunkerSceneController is module-mocked above, so we still get a
    // hermetic instance.
    const m = BunkerMinigame.create({
      objectiveIndex: 0,
      objective: baseObjective,
      missionId: 'test-mission',
      factionTint: 0xffffff,
      threeScene: {} as never,
      difficulty: 1,
    })

    m.notifyDescended() // steps 0+1 complete + activate + state → antechamber-idle
    m.notifyArenaDoorInteract() // state → wave-active

    // First tick: should spawn the wave roster.
    m.tick(0.016, {} as never)
    expect(fakeSceneInstance.spawnWave).toHaveBeenCalledTimes(1)

    // Subsequent ticks should NOT re-spawn while enemies are still alive.
    m.tick(0.016, {} as never)
    m.tick(0.016, {} as never)
    expect(fakeSceneInstance.spawnWave).toHaveBeenCalledTimes(1)
  })

  it('fires wave-cleared when all enemies are dead and progress increments', () => {
    fakeSceneInstance.spawnWave.mockClear()
    fakeSceneInstance.enemyDirector.enemies = []
    const m = BunkerMinigame.create({
      objectiveIndex: 0,
      objective: baseObjective,
      missionId: 'test-mission',
      factionTint: 0xffffff,
      threeScene: {} as never,
      difficulty: 1,
    })

    m.notifyDescended()
    m.notifyArenaDoorInteract()
    m.tick(0.016, {} as never) // spawn

    // Simulate the wave being cleared: replace the enemies array with dead handles.
    fakeSceneInstance.enemyDirector.enemies = [{ enemy: { alive: false } }]
    expect(m.progressCurrent).toBe(0)

    m.tick(0.016, {} as never)
    expect(m.progressCurrent).toBe(1)
  })
})
