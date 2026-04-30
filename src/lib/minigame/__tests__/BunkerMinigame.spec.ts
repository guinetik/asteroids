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
        setPlayerPosition: vi.fn(),
        onContactDamage: null as
          | ((handle: { enemy: { position: { x: number; z: number } } }, damage: number) => void)
          | null,
      },
      enemyProjectileSystem: {
        tick: vi.fn(),
        setPlayerPosition: vi.fn(),
        onPlayerHit: null as ((damage: number, sourceX: number, sourceZ: number) => void) | null,
      },
      hatch: { setOpen: vi.fn(), active: false, group: { visible: false } },
      door: { setOpen: vi.fn() },
      lootDoor: { setOpen: vi.fn() },
      table: { group: { position: { x: 0, z: 0 } } },
      chests: [
        { opened: false, open: vi.fn(), group: { position: { x: 100, z: 100 } } },
        { opened: false, open: vi.fn(), group: { position: { x: 100, z: 100 } } },
      ],
      openWaveRoom: vi.fn(),
      closeWaveRoom: vi.fn(),
      hasPendingWaveSpawns: false,
      activeEnemyRoomBounds: null as {
        minX: number
        maxX: number
        minZ: number
        maxZ: number
      } | null,
      lootRoomBounds: { minX: -5, maxX: 5, minZ: 30, maxZ: 40 },
      playerSpawn: { x: 0, y: 0, z: 0 },
      rootWorldPosition: { x: 0, y: 0, z: 0 },
      hatchPosition: { x: 0, z: 0 },
      doorPosition: { x: 0, z: 5 },
      walkableBounds: [
        { minX: -4, maxX: 4, minZ: -4, maxZ: 4 },
        { minX: -2, maxX: 2, minZ: 4, maxZ: 10 },
        { minX: -10, maxX: 10, minZ: 10, maxZ: 30 },
      ],
      isPlayerInArena: vi.fn(() => false),
      installEnemySpawnObserver: vi.fn(() => () => {}),
    },
  }
})

vi.mock('@/three/bunker/BunkerSceneController', () => ({
  BunkerSceneController: vi.fn(function () {
    return fakeSceneInstance
  }),
}))

vi.mock('@/three/bunker/BunkerInteriorMaterials', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/three/bunker/BunkerInteriorMaterials')>()
  return {
    ...mod,
    loadBunkerInteriorMaterials: vi.fn(() =>
      Promise.resolve(mod.createTestBunkerInteriorMaterialSet()),
    ),
  }
})

const baseObjective: ConcreteObjective = {
  type: 'bunker',
  x: 0,
  z: 0,
  waveCount: 3,
  reward: 5000,
}

const fakeProjectileSystem = {
  addEnemy: vi.fn(),
  removeEnemy: vi.fn(),
}

/**
 * Construct a minigame instance via the test seam factory with stable
 * defaults. Keeps the individual `it` blocks free of boilerplate.
 */
function buildMinigame(): BunkerMinigame {
  // Reset shared mock state between builds so spawn-counts don't leak.
  fakeSceneInstance.spawnWave.mockClear()
  fakeSceneInstance.activate.mockClear()
  fakeSceneInstance.deactivate.mockClear()
  fakeSceneInstance.enemyDirector.setPlayerPosition.mockClear()
  fakeSceneInstance.enemyProjectileSystem.setPlayerPosition.mockClear()
  fakeSceneInstance.enemyProjectileSystem.tick.mockClear()
  fakeSceneInstance.enemyProjectileSystem.onPlayerHit = null
  fakeSceneInstance.isPlayerInArena.mockReset()
  fakeSceneInstance.isPlayerInArena.mockReturnValue(false)
  fakeSceneInstance.openWaveRoom.mockClear()
  fakeSceneInstance.closeWaveRoom.mockClear()
  fakeSceneInstance.hatch.setOpen.mockClear()
  fakeSceneInstance.hatch.active = false
  fakeSceneInstance.hatch.group.visible = false
  fakeSceneInstance.hasPendingWaveSpawns = false
  fakeSceneInstance.activeEnemyRoomBounds = null
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
    expect(m.steps.length).toBe(5)
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

  it('hides the surface hatch while inside the bunker and restores it after extract', () => {
    const hatch = {
      active: false,
      group: { visible: true },
      setOpen: vi.fn(),
    }
    const m = buildMinigame()
    m.setSurfaceHatch(hatch as never, { x: 0, z: 0 })

    m.notifyDescended()
    expect(hatch.group.visible).toBe(false)

    m.completeForTest()
    expect(hatch.group.visible).toBe(true)
  })

  it('keeps the interior extraction hatch hidden until the player exits', async () => {
    fakeSceneInstance.hatch.group.visible = false
    fakeSceneInstance.hatch.setOpen.mockClear()
    fakeSceneInstance.isPlayerInArena.mockReset()
    fakeSceneInstance.isPlayerInArena.mockReturnValue(true)
    fakeSceneInstance.enemyDirector.enemies = []
    const m = await BunkerMinigame.create({
      objectiveIndex: 0,
      objective: baseObjective,
      missionId: 'test-mission',
      factionTint: 0xffffff,
      threeScene: {} as never,
      projectileSystem: fakeProjectileSystem as never,
      difficulty: 1,
    })
    m.notifyDescended()
    expect(fakeSceneInstance.hatch.setOpen).toHaveBeenCalledWith(false)

    m.notifyArenaDoorInteract()
    for (let wave = 0; wave < 3; wave++) {
      m.tick(999, {
        levelState: 'bunker-interior',
        landerPosition: null,
        landerGrounded: false,
        playerPosition: { x: 0, y: 0, z: 10 },
        interactPressed: false,
        terminalInteractPressed: false,
      })
      fakeSceneInstance.enemyDirector.enemies = [{ enemy: { alive: false } }]
      m.tick(0.016, {
        levelState: 'bunker-interior',
        landerPosition: null,
        landerGrounded: false,
        playerPosition: { x: 0, y: 0, z: 10 },
        interactPressed: false,
        terminalInteractPressed: false,
      })
    }

    expect(fakeSceneInstance.hatch.setOpen).toHaveBeenCalledWith(false)

    m.tick(999, {
      levelState: 'bunker-interior',
      landerPosition: null,
      landerGrounded: false,
      playerPosition: { x: 0, y: 0, z: 0 },
      interactPressed: false,
      terminalInteractPressed: false,
    })

    // First interact with the terminal
    m.tick(0.016, {
      levelState: 'bunker-interior',
      landerPosition: null,
      landerGrounded: false,
      playerPosition: { x: 0, y: 0, z: 0 },
      interactPressed: false,
      terminalInteractPressed: true,
    })

    const exit = vi.fn()
    m.onExit = exit

    // Next interact with the exit hatch
    m.tick(0.016, {
      levelState: 'bunker-interior',
      landerPosition: null,
      landerGrounded: false,
      playerPosition: { x: 0, y: 0, z: 0 },
      interactPressed: false,
      terminalInteractPressed: true,
    })

    expect(exit).toHaveBeenCalledTimes(1)
    expect(fakeSceneInstance.hatch.setOpen).toHaveBeenCalledWith(true)
  })

  it('deactivates the bunker scene and clears the prompt after extracting', async () => {
    const prompt = vi.fn()
    const m = await BunkerMinigame.create({
      objectiveIndex: 0,
      objective: baseObjective,
      missionId: 'test-mission',
      factionTint: 0xffffff,
      threeScene: {} as never,
      projectileSystem: fakeProjectileSystem as never,
      difficulty: 1,
    })
    m.onPrompt = prompt
    const state = (
      m as unknown as {
        state: {
          current: string
          notifyActivated(): void
          notifyDoorInteracted(): void
          notifyArenaEntered(): void
          notifyWaveCleared(): void
          tick(dt: number): void
        }
      }
    ).state
    state.notifyActivated()
    state.notifyDoorInteracted()
    state.notifyArenaEntered()
    while (state.current !== 'exit-prompt') {
      if (state.current === 'wave-active') state.notifyWaveCleared()
      else state.tick(999)
    }

    m.notifyExitInteract()

    expect(fakeSceneInstance.deactivate).toHaveBeenCalledTimes(1)
    expect(prompt).toHaveBeenLastCalledWith(null)
    expect(m.status).toBe('completed')
  })

  it('marks status=failed on player death', () => {
    const m = buildMinigame()
    m.onKillPlayer?.()
    expect(m.status).toBe('failed')
  })

  it('opens the door without spawning until the player enters the arena', async () => {
    fakeSceneInstance.spawnWave.mockClear()
    fakeSceneInstance.enemyDirector.enemies = []
    // The test-seam factory wires `null` as the scene, so wave-active spawn
    // branches can't fire through it. Use the production `create()` path —
    // the BunkerSceneController is module-mocked above, so we still get a
    // hermetic instance.
    const m = await BunkerMinigame.create({
      objectiveIndex: 0,
      objective: baseObjective,
      missionId: 'test-mission',
      factionTint: 0xffffff,
      threeScene: {} as never,
      projectileSystem: fakeProjectileSystem as never,
      difficulty: 1,
    })

    m.notifyDescended() // steps 0+1 complete + activate + state → antechamber-idle
    m.notifyArenaDoorInteract() // state → arena-entry

    m.tick(0.016, {
      levelState: 'bunker-interior',
      playerPosition: { x: 0, y: 0, z: 6 },
    } as never)
    expect(fakeSceneInstance.spawnWave).not.toHaveBeenCalled()

    fakeSceneInstance.isPlayerInArena.mockReturnValue(true)
    m.tick(0.016, {
      levelState: 'bunker-interior',
      playerPosition: { x: 0, y: 0, z: 14 },
    } as never)
    expect(fakeSceneInstance.spawnWave).toHaveBeenCalledTimes(1)

    // Subsequent ticks should NOT re-spawn while enemies are still alive.
    m.tick(0.016, {} as never)
    m.tick(0.016, {} as never)
    expect(fakeSceneInstance.spawnWave).toHaveBeenCalledTimes(1)
  })

  it('keeps the corridor out of walkable bounds until the door opens', async () => {
    const m = await BunkerMinigame.create({
      objectiveIndex: 0,
      objective: baseObjective,
      missionId: 'test-mission',
      factionTint: 0xffffff,
      threeScene: {} as never,
      projectileSystem: fakeProjectileSystem as never,
      difficulty: 1,
    })

    m.notifyDescended()
    expect(m.bunkerWalkableBounds).toEqual([fakeSceneInstance.walkableBounds[0]])

    m.notifyArenaDoorInteract()
    expect(m.bunkerWalkableBounds).toEqual(fakeSceneInstance.walkableBounds)
  })

  it('opens the current wave staging room and exposes it for collision', async () => {
    const stagingBounds = { minX: 8, maxX: 14, minZ: 14, maxZ: 24 }
    const m = await BunkerMinigame.create({
      objectiveIndex: 0,
      objective: baseObjective,
      missionId: 'test-mission',
      factionTint: 0xffffff,
      threeScene: {} as never,
      projectileSystem: fakeProjectileSystem as never,
      difficulty: 1,
    })

    m.notifyDescended()
    m.notifyArenaDoorInteract()
    fakeSceneInstance.isPlayerInArena.mockReturnValue(true)
    fakeSceneInstance.activeEnemyRoomBounds = stagingBounds
    m.tick(0.016, {
      levelState: 'bunker-interior',
      playerPosition: { x: 0, y: 0, z: 14 },
    } as never)

    expect(fakeSceneInstance.openWaveRoom).toHaveBeenCalledWith(0)
    expect(m.bunkerWalkableBounds).toContain(stagingBounds)
  })

  it('closes the wave staging room after the wave is cleared', async () => {
    const m = await BunkerMinigame.create({
      objectiveIndex: 0,
      objective: baseObjective,
      missionId: 'test-mission',
      factionTint: 0xffffff,
      threeScene: {} as never,
      projectileSystem: fakeProjectileSystem as never,
      difficulty: 1,
    })

    m.notifyDescended()
    m.notifyArenaDoorInteract()
    fakeSceneInstance.isPlayerInArena.mockReturnValue(true)
    m.tick(0.016, {
      levelState: 'bunker-interior',
      playerPosition: { x: 0, y: 0, z: 14 },
    } as never)
    fakeSceneInstance.closeWaveRoom.mockClear()
    fakeSceneInstance.enemyDirector.enemies = [{ enemy: { alive: false } }]
    m.tick(0.016, {
      levelState: 'bunker-interior',
      playerPosition: { x: 0, y: 0, z: 14 },
    } as never)

    expect(fakeSceneInstance.closeWaveRoom).toHaveBeenCalled()
  })

  it('does not clear a wave while staged enemies are still queued', async () => {
    const m = await BunkerMinigame.create({
      objectiveIndex: 0,
      objective: baseObjective,
      missionId: 'test-mission',
      factionTint: 0xffffff,
      threeScene: {} as never,
      projectileSystem: fakeProjectileSystem as never,
      difficulty: 1,
    })

    m.notifyDescended()
    m.notifyArenaDoorInteract()
    fakeSceneInstance.isPlayerInArena.mockReturnValue(true)
    fakeSceneInstance.hasPendingWaveSpawns = true
    m.tick(0.016, {
      levelState: 'bunker-interior',
      playerPosition: { x: 0, y: 0, z: 14 },
    } as never)
    fakeSceneInstance.closeWaveRoom.mockClear()
    fakeSceneInstance.enemyDirector.enemies = [{ enemy: { alive: false } }]
    m.tick(0.016, {
      levelState: 'bunker-interior',
      playerPosition: { x: 0, y: 0, z: 14 },
    } as never)

    expect(m.progressCurrent).toBe(0)
    expect(fakeSceneInstance.closeWaveRoom).not.toHaveBeenCalled()
  })

  it('feeds the bunker player position into the enemy director', async () => {
    fakeSceneInstance.enemyDirector.setPlayerPosition.mockClear()
    const m = await BunkerMinigame.create({
      objectiveIndex: 0,
      objective: baseObjective,
      missionId: 'test-mission',
      factionTint: 0xffffff,
      threeScene: {} as never,
      projectileSystem: fakeProjectileSystem as never,
      difficulty: 1,
    })

    m.notifyDescended()
    m.tick(0.016, {
      levelState: 'bunker-interior',
      playerPosition: { x: 11, y: 2, z: 13 },
    } as never)

    expect(fakeSceneInstance.enemyDirector.setPlayerPosition).toHaveBeenCalledWith(11, 2, 13)
  })

  it('forwards bunker contact damage to the player damage callback', async () => {
    const onDamagePlayer = vi.fn()
    const m = await BunkerMinigame.create({
      objectiveIndex: 0,
      objective: baseObjective,
      missionId: 'test-mission',
      factionTint: 0xffffff,
      threeScene: {} as never,
      projectileSystem: fakeProjectileSystem as never,
      difficulty: 1,
    })
    m.onDamagePlayer = onDamagePlayer

    fakeSceneInstance.enemyDirector.onContactDamage?.({ enemy: { position: { x: 4, z: 9 } } }, 12)

    expect(onDamagePlayer).toHaveBeenCalledWith(12, 4, 9, 'contact')
  })

  it('forwards bunker enemy projectile damage to the player damage callback', async () => {
    const onDamagePlayer = vi.fn()
    const m = await BunkerMinigame.create({
      objectiveIndex: 0,
      objective: baseObjective,
      missionId: 'test-mission',
      factionTint: 0xffffff,
      threeScene: {} as never,
      projectileSystem: fakeProjectileSystem as never,
      difficulty: 1,
    })
    m.onDamagePlayer = onDamagePlayer

    fakeSceneInstance.enemyProjectileSystem.onPlayerHit?.(9, 7, 11)

    expect(onDamagePlayer).toHaveBeenCalledWith(9, 7, 11, 'projectile')
  })

  it('feeds bunker player position into enemy projectile collision', async () => {
    const m = await BunkerMinigame.create({
      objectiveIndex: 0,
      objective: baseObjective,
      missionId: 'test-mission',
      factionTint: 0xffffff,
      threeScene: {} as never,
      projectileSystem: fakeProjectileSystem as never,
      difficulty: 1,
    })

    m.notifyDescended()
    m.tick(0.016, {
      levelState: 'bunker-interior',
      playerPosition: { x: 11, y: 2, z: 13 },
    } as never)

    expect(fakeSceneInstance.enemyProjectileSystem.setPlayerPosition).toHaveBeenCalledWith(
      11,
      2,
      13,
    )
    expect(fakeSceneInstance.enemyProjectileSystem.tick).toHaveBeenCalledWith(0.016)
  })

  it('fires wave-cleared when all enemies are dead and progress increments', async () => {
    fakeSceneInstance.spawnWave.mockClear()
    fakeSceneInstance.enemyDirector.enemies = []
    fakeSceneInstance.hasPendingWaveSpawns = false
    const m = await BunkerMinigame.create({
      objectiveIndex: 0,
      objective: baseObjective,
      missionId: 'test-mission',
      factionTint: 0xffffff,
      threeScene: {} as never,
      projectileSystem: fakeProjectileSystem as never,
      difficulty: 1,
    })

    m.notifyDescended()
    m.notifyArenaDoorInteract()
    fakeSceneInstance.isPlayerInArena.mockReturnValue(true)
    m.tick(0.016, {
      levelState: 'bunker-interior',
      playerPosition: { x: 0, y: 0, z: 14 },
    } as never) // spawn

    // Simulate the wave being cleared: replace the enemies array with dead handles.
    fakeSceneInstance.enemyDirector.enemies = [{ enemy: { alive: false } }]
    expect(m.progressCurrent).toBe(0)

    m.tick(0.016, {
      levelState: 'bunker-interior',
      playerPosition: { x: 0, y: 0, z: 14 },
    } as never)
    expect(m.progressCurrent).toBe(1)
  })
})
