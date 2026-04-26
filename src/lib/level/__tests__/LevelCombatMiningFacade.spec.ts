import { describe, expect, it, vi } from 'vitest'
import { Vector3 } from 'three'
import { LevelCombatMiningFacade } from '../LevelCombatMiningFacade'

describe('LevelCombatMiningFacade', () => {
  it('registers rocks and handles drill hits through persistence + feedback', () => {
    const projectileSystem = {
      addRock: vi.fn(),
      removeRock: vi.fn(),
      onRockHit: null as ((spawnIndex: number, position: Vector3) => void) | null,
    }
    const rockYieldSystem = {
      registerRock: vi.fn(),
      mineRock: vi.fn(() => ({ itemId: 'olivine', kgGranted: 1.2, depleted: false })),
      onConsume: null as ((spawnIndex: number) => void) | null,
      onMineralExtracted: null as ((itemId: string, kg: number, spawnIndex: number) => void) | null,
    }
    const surfaceRocks = {
      spawns: [{ diameter: 3 }],
      buildColliders: vi.fn(() => [
        {
          center: { x: 1, y: 2, z: 3 },
          radius: 4,
        },
      ]),
      getRockRadius: vi.fn(() => 2),
      getRockCenter: vi.fn((_spawnIndex: number, _heightmap: unknown, out: Vector3) =>
        out.set(1, 2, 3),
      ),
      hideRock: vi.fn(),
      flashRock: vi.fn(),
    }
    const impactEmitter = { emit: vi.fn() }
    const tractorEmitter = { emit: vi.fn() }
    const multiTool = {
      getMuzzleWorldPosition: vi.fn((out: Vector3) => out.set(5, 2, 3)),
    }
    const persistence = {
      persistInventoryPickup: vi.fn(() => ({ ok: true, label: 'Olivine', quantity: 1 })),
    }
    const levelAudio = {
      stopMiningSizzle: vi.fn(),
      notifyRockMelt: vi.fn(),
      notifyResourcePickup: vi.fn(),
      keepMiningSizzleAlive: vi.fn(),
    }

    const facade = new LevelCombatMiningFacade(
      {
        projectileSystem: projectileSystem as never,
        rockYieldSystem: rockYieldSystem as never,
        surfaceRocks: surfaceRocks as never,
        heightmap: {} as never,
        impactEmitter: impactEmitter as never,
        tractorEmitter: tractorEmitter as never,
        multiTool: multiTool as never,
        persistence: persistence as never,
        levelAudio: levelAudio as never,
      },
      {
        onResourcePickup: vi.fn(),
        onResourcePickupFailed: vi.fn(),
        onRemoveRockCollider: vi.fn(),
        getElapsedSeconds: () => 12.5,
        onProspectProgress: vi.fn(),
        onProspectComplete: vi.fn(),
      },
    )

    facade.registerRocks()
    facade.attach()
    projectileSystem.onRockHit?.(0, new Vector3(1, 2, 3))

    expect(rockYieldSystem.registerRock).toHaveBeenCalledWith({ spawnIndex: 0, diameter: 3 })
    expect(projectileSystem.addRock).toHaveBeenCalledWith({
      spawnIndex: 0,
      cx: 1,
      cy: 2,
      cz: 3,
      radius: 4,
    })
    expect(rockYieldSystem.mineRock).toHaveBeenCalledWith(0)
    expect(surfaceRocks.flashRock).toHaveBeenCalledWith(0)
    expect(levelAudio.keepMiningSizzleAlive).toHaveBeenCalledWith(12.5)
    expect(levelAudio.notifyResourcePickup).not.toHaveBeenCalled()

    rockYieldSystem.onMineralExtracted?.('olivine', 1.2, 0)
    expect(persistence.persistInventoryPickup).toHaveBeenCalledWith('olivine', 1)
    expect(levelAudio.notifyResourcePickup).toHaveBeenCalledTimes(1)
  })
})
