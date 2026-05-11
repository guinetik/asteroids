/**
 * Lifecycle tests for the scene-facing level disturbance director.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-level-disturbance-system-design.md
 */
import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import type { Enemy } from '@/lib/fps/enemy'
import type { ProjectileSystem } from '@/lib/fps/projectileSystem'
import { LevelDisturbanceDirector } from '@/lib/level/LevelDisturbanceDirector'
import type { Heightmap } from '@/lib/terrain/heightmap'
import type { BacteriophageController } from '@/three/BacteriophageController'
import type { ChimeraWalkerController } from '@/three/ChimeraWalkerController'
import type { SpireController } from '@/three/SpireController'

vi.mock('@/three/BacteriophageController', async () => {
  const THREE = await import('three')

  return {
    PHAGE_HIT_CENTER_Y: 1.6,
    BacteriophageController: class MockBacteriophageController {
      readonly group = new THREE.Group()
      enemy: Enemy
      deathComplete = false
      isMoving = false
      isAgitated = false

      constructor(enemy: Enemy, _visualOptions?: unknown) {
        this.enemy = enemy
      }

      flash(): void {}

      tick(): void {}

      retire(): void {}

      recycle(enemy: Enemy): void {
        this.enemy = enemy
      }

      dispose(): void {}
    },
  }
})

vi.mock('@/three/EnemyProjectileMeshPool', () => ({
  EnemyProjectileMeshPool: class MockEnemyProjectileMeshPool {
    /**
     * @param _scene - Unused stub prevents warm-up meshes from attaching to Vitest THREE scenes.
     */
    constructor(_scene: unknown) {}

    /** No-op — real pool attaches hidden meshes counted by `scene.children.length` tests below. */
    prewarm(): void {}

    acquire = (): void => {}

    release = (): void => {}

    disposeAll(): void {}
  },
}))

const TEST_SEED = 4813
/** Low tier mission — disturbance rolls bacteriophage only (stable unit harness). */
const TEST_DIFFICULTY_FOR_PHAGE_ONLY = 1
/** Crosses scout threshold even when difficulty‑1 lowers disturbance gain multiplication. */
const SCOUT_EXPLOSION_AMOUNT = 18
const MAX_LIVE_AMBIENT_ENEMIES = 5
const PATROL_COOLDOWN_SECONDS = 8
const ZERO_SECONDS = 0
const SURFACE_Y = 0
const PLAYER_POSITION = new THREE.Vector3(10, 2, -5)
const LANDER_POSITION = new THREE.Vector3(-100, 0, -100)

interface FakeProjectileSystem {
  addCalls: Enemy[]
  removeCalls: Enemy[]
  system: ProjectileSystem
}

interface FakePool {
  acquirePhageCalls: number
  releasePhageCalls: number
  freeCount: number
}

describe('LevelDisturbanceDirector', () => {
  it('registers spawned response enemies via the shared pool', () => {
    const harness = createDirectorHarness()

    harness.director.record({ type: 'explosion', amount: SCOUT_EXPLOSION_AMOUNT })
    harness.director.tick(ZERO_SECONDS, createActiveFrameContext())

    expect(harness.projectiles.addCalls).toHaveLength(1)
    expect(harness.fakePool.acquirePhageCalls).toBe(1)
    // Pool prewarms MAX_LIVE_AMBIENT_ENEMIES controllers, parented to the scene.
    expect(harness.scene.children).toHaveLength(MAX_LIVE_AMBIENT_ENEMIES)
    expect(harness.projectiles.addCalls[0]?.position.y).toBe(SURFACE_Y + 1.6)
  })

  it('caps live ambient enemies after repeated high disturbance responses', () => {
    const harness = createDirectorHarness()

    harness.director.record({ type: 'explosion', amount: 100 })
    harness.director.tick(ZERO_SECONDS, createActiveFrameContext())
    harness.director.tick(PATROL_COOLDOWN_SECONDS, createActiveFrameContext())
    harness.director.tick(PATROL_COOLDOWN_SECONDS, createActiveFrameContext())

    expect(harness.projectiles.addCalls).toHaveLength(MAX_LIVE_AMBIENT_ENEMIES)
    expect(harness.fakePool.acquirePhageCalls).toBe(MAX_LIVE_AMBIENT_ENEMIES)
    expect(harness.scene.children).toHaveLength(MAX_LIVE_AMBIENT_ENEMIES)
  })

  it('releases controllers back to the pool on liftoff reset', () => {
    const harness = createDirectorHarness()

    spawnFullResponse(harness.director)
    const spawnedEnemies = harness.projectiles.addCalls.slice()

    harness.director.resetForLiftoff()

    expect(harness.projectiles.removeCalls).toEqual(spawnedEnemies)
    expect(harness.fakePool.releasePhageCalls).toBe(spawnedEnemies.length)
    expect(harness.fakePool.freeCount).toBe(MAX_LIVE_AMBIENT_ENEMIES)
    // Pool keeps controllers in the scene tree for warm reuse.
    expect(harness.scene.children).toHaveLength(MAX_LIVE_AMBIENT_ENEMIES)
  })

  it('releases controllers back to the pool on dispose', () => {
    const harness = createDirectorHarness()

    spawnFullResponse(harness.director)
    const spawnedEnemies = harness.projectiles.addCalls.slice()

    harness.director.dispose()
    harness.director.dispose()

    expect(harness.projectiles.removeCalls).toEqual(spawnedEnemies)
    expect(harness.fakePool.releasePhageCalls).toBe(spawnedEnemies.length)
    expect(harness.fakePool.freeCount).toBe(MAX_LIVE_AMBIENT_ENEMIES)
  })
})

function createDirectorHarness(): {
  scene: THREE.Scene
  projectiles: FakeProjectileSystem
  fakePool: FakePool
  director: LevelDisturbanceDirector
} {
  const scene = new THREE.Scene()
  const projectiles = createFakeProjectileSystem()
  const heightmap = createFakeHeightmap()
  const { fakePool, pool } = createFakePool(scene)
  const director = new LevelDisturbanceDirector({
    scene,
    heightmap,
    projectileSystem: projectiles.system,
    missionDifficulty: TEST_DIFFICULTY_FOR_PHAGE_ONLY,
    seed: TEST_SEED,
    enemyControllerPool: pool,
  })

  return { scene, projectiles, fakePool, director }
}

function createFakeProjectileSystem(): FakeProjectileSystem {
  const addCalls: Enemy[] = []
  const removeCalls: Enemy[] = []
  const system = {
    addEnemy: (enemy: Enemy) => addCalls.push(enemy),
    removeEnemy: (enemy: Enemy) => removeCalls.push(enemy),
  } as unknown as ProjectileSystem

  return { addCalls, removeCalls, system }
}

function createFakeHeightmap(): Heightmap {
  return {
    heightAt: () => SURFACE_Y,
  } as unknown as Heightmap
}

function createFakePool(scene: THREE.Scene): {
  fakePool: FakePool
  pool: import('@/three/EnemyControllerPool').EnemyControllerPool
} {
  const fakePool: FakePool = {
    acquirePhageCalls: 0,
    releasePhageCalls: 0,
    freeCount: 0,
  }
  const phageFree: BacteriophageController[] = []
  // Prewarm the same number as MAX_LIVE_AMBIENT_ENEMIES so spawn caps line up.
  for (let i = 0; i < MAX_LIVE_AMBIENT_ENEMIES; i++) {
    const group = new THREE.Group()
    scene.add(group)
    phageFree.push({
      group,
      deathComplete: false,
      isMoving: false,
      isAgitated: false,
      tick: () => {},
      flash: () => {},
      recycle: () => {},
      retire: () => {},
      dispose: () => {},
    } as unknown as BacteriophageController)
  }
  fakePool.freeCount = phageFree.length

  const pool = {
    acquirePhage(enemy: Enemy): BacteriophageController | null {
      const ctrl = phageFree.pop()
      if (!ctrl) return null
      ;(ctrl as { enemy?: Enemy }).enemy = enemy
      fakePool.acquirePhageCalls++
      fakePool.freeCount = phageFree.length
      return ctrl
    },
    acquireChimera(): ChimeraWalkerController | null {
      return null
    },
    acquireSpire(): SpireController | null {
      return null
    },
    releasePhage(ctrl: BacteriophageController): void {
      phageFree.push(ctrl)
      fakePool.releasePhageCalls++
      fakePool.freeCount = phageFree.length
    },
    releaseChimera(): void {},
    releaseSpire(): void {},
    stageForPrewarm(): void {},
    unstageFromPrewarm(): void {},
    dispose(): void {},
  } as unknown as import('@/three/EnemyControllerPool').EnemyControllerPool

  return { fakePool, pool }
}

function createActiveFrameContext(): {
  evaActive: true
  playerPosition: THREE.Vector3
  landerPosition: THREE.Vector3
} {
  return {
    evaActive: true,
    playerPosition: PLAYER_POSITION,
    landerPosition: LANDER_POSITION,
  }
}

function spawnFullResponse(director: LevelDisturbanceDirector): void {
  director.record({ type: 'explosion', amount: 100 })
  director.tick(ZERO_SECONDS, createActiveFrameContext())
}
