/**
 * Unit tests for {@link BunkerSceneController}.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */
import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'

vi.mock('@/three/loadGLB', () => ({
  loadGLB: vi.fn().mockResolvedValue(new THREE.Group()),
}))

import { BunkerSceneController } from '../BunkerSceneController'
import { PHAGE_HIT_CENTER_Y } from '@/three/BacteriophageController'
import type { EnemyProjectileSystem } from '@/lib/fps/enemyProjectileSystem'
import {
  ANTECHAMBER,
  ARENA,
  CORRIDOR,
  SPAWN_PAD_INSET,
  WALL_THICKNESS,
  buildBunkerGeometry,
} from '../BunkerWallBuilder'
import { createTestBunkerInteriorMaterialSet } from '../BunkerInteriorMaterials'

const TINT = 0x66ccff
const ROOT_X = 100
const ROOT_Y = 20
const ROOT_Z = -50
const PLAYER_RADIUS_INSET = 0.6
const DOORWAY_Z = ANTECHAMBER.depth / 2 + WALL_THICKNESS / 2
const ARENA_ENTRY_Z = ANTECHAMBER.depth / 2 + WALL_THICKNESS + CORRIDOR.depth + WALL_THICKNESS / 2
const VERTICAL_WALL_MIN_HEIGHT = 1
const LETHAL_DAMAGE = 9999
const DEATH_ANIMATION_SECONDS = 1.3
const PREVIOUS_ARENA_WIDTH = 58
const PREVIOUS_ARENA_DEPTH = 60
const ENEMY_ROOM_COUNT = 2
const STAGED_SPAWN_STEP_SECONDS = 1.25
const BASE_BACTERIOPHAGE_HP = 75
const HARD_MAGENTA_SILHOUETTE = 0xb000ff
const HARD_AMBER_FEATURE = 0xff9d00

describe('BunkerSceneController', () => {
  it('keeps the entrance vault door visible and closed initially', () => {
    const controller = new BunkerSceneController({
      tint: TINT,
      scene: new THREE.Scene(),
      interiorMaterials: createTestBunkerInteriorMaterialSet(),
    })

    expect(controller.hatch.group.visible).toBe(true)
    // Testing targetOpen is hard without exposing it, but we know it's not open.
  })

  it('makes the arena wider and longer without changing its height', () => {
    expect(ARENA.width).toBeGreaterThan(PREVIOUS_ARENA_WIDTH)
    expect(ARENA.depth).toBeGreaterThan(PREVIOUS_ARENA_DEPTH)
    expect(ARENA.height).toBe(13)
  })

  it('builds three enemy staging rooms on the non-entry arena walls', () => {
    const geometry = buildBunkerGeometry(createTestBunkerInteriorMaterialSet())
    const enemyRooms =
      (
        geometry as {
          enemyRooms?: readonly {
            id: string
            doorAnchor: THREE.Object3D
            spawnPadCenter: { x: number; z: number }
          }[]
        }
      ).enemyRooms ?? []

    expect(enemyRooms.map((room) => room.id).sort()).toEqual(['east', 'west'])
    expect(enemyRooms).toHaveLength(ENEMY_ROOM_COUNT)
    for (const room of enemyRooms) {
      expect(
        hasWallAt(geometry.wallMeshes, room.doorAnchor.position.x, room.doorAnchor.position.z),
      ).toBe(false)
    }
  })

  it('opens a different staging door for each wave split', () => {
    const controller = new BunkerSceneController({
      tint: TINT,
      scene: new THREE.Scene(),
      interiorMaterials: createTestBunkerInteriorMaterialSet(),
    })
    controller.setRootWorldPosition(ROOT_X, ROOT_Y, ROOT_Z)

    controller.openWaveRoom(0)
    controller.spawnWave(['bacteriophage', 'spire', 'chimera'])

    expect(controller.enemyDirector.enemies).toHaveLength(1)
    const firstRoom = controller.activeEnemyRoomBounds!
    expectEnemyInside(controller.enemyDirector.enemies[0]!.enemy.position, firstRoom)

    controller.tick(STAGED_SPAWN_STEP_SECONDS)
    expect(controller.enemyDirector.enemies).toHaveLength(2)
    const secondRoom = controller.activeEnemyRoomBounds!
    expect(secondRoom).not.toEqual(firstRoom)
    expectEnemyInside(controller.enemyDirector.enemies[1]!.enemy.position, secondRoom)

    controller.tick(STAGED_SPAWN_STEP_SECONDS)
    expect(controller.enemyDirector.enemies).toHaveLength(3)
    const thirdRoom = controller.activeEnemyRoomBounds!
    expect(thirdRoom).not.toEqual(secondRoom)
    expect(thirdRoom).toEqual(firstRoom)
    expectEnemyInside(controller.enemyDirector.enemies[2]!.enemy.position, thirdRoom)
  })

  it('fires enemy projectiles from ranged bunker enemies', () => {
    const controller = new BunkerSceneController({
      tint: TINT,
      scene: new THREE.Scene(),
      interiorMaterials: createTestBunkerInteriorMaterialSet(),
    })
    controller.spawnWave(['spire'])
    const handle = controller.enemyDirector.enemies[0]!
    handle.lastOutput = {
      ...handle.lastOutput,
      wantsToFire: true,
      isChasing: true,
      aimTargetX: handle.enemy.position.x + 20,
      aimTargetY: handle.enemy.position.y,
      aimTargetZ: handle.enemy.position.z,
    }

    const enemyProjectileSystem = (
      controller as unknown as { enemyProjectileSystem?: EnemyProjectileSystem }
    ).enemyProjectileSystem
    expect(enemyProjectileSystem).toBeDefined()
    controller.tick(0.016)

    expect(enemyProjectileSystem!.projectileCount).toBe(1)
  })

  it('fires bunker chimera walkers as a visible three-shot burst', () => {
    const controller = new BunkerSceneController({
      tint: TINT,
      scene: new THREE.Scene(),
      interiorMaterials: createTestBunkerInteriorMaterialSet(),
    })
    controller.spawnWave(['chimera'])
    const handle = controller.enemyDirector.enemies[0]!
    handle.lastOutput = {
      ...handle.lastOutput,
      wantsToFire: true,
      isChasing: true,
      aimTargetX: handle.enemy.position.x + 20,
      aimTargetY: handle.enemy.position.y,
      aimTargetZ: handle.enemy.position.z,
    }

    const enemyProjectileSystem = (
      controller as unknown as { enemyProjectileSystem?: EnemyProjectileSystem }
    ).enemyProjectileSystem
    expect(enemyProjectileSystem).toBeDefined()
    controller.tick(0.016)

    expect(enemyProjectileSystem!.projectileCount).toBe(1)
    enemyProjectileSystem!.tick(0.14)
    expect(enemyProjectileSystem!.projectileCount).toBe(2)
    enemyProjectileSystem!.tick(0.14)
    expect(enemyProjectileSystem!.projectileCount).toBe(3)
  })

  it('scales bunker enemy health by mission difficulty', () => {
    const mediumController = new BunkerSceneController({
      tint: TINT,
      scene: new THREE.Scene(),
      difficulty: 5,
      interiorMaterials: createTestBunkerInteriorMaterialSet(),
    })
    const hardController = new BunkerSceneController({
      tint: TINT,
      scene: new THREE.Scene(),
      difficulty: 10,
      interiorMaterials: createTestBunkerInteriorMaterialSet(),
    })

    mediumController.spawnWave(['bacteriophage'])
    hardController.spawnWave(['bacteriophage'])

    expect(mediumController.enemyDirector.enemies[0]!.enemy.maxHp).toBe(BASE_BACTERIOPHAGE_HP * 3)
    expect(mediumController.enemyDirector.enemies[0]!.enemy.hp).toBe(BASE_BACTERIOPHAGE_HP * 3)
    expect(hardController.enemyDirector.enemies[0]!.enemy.maxHp).toBe(BASE_BACTERIOPHAGE_HP * 5)
    expect(hardController.enemyDirector.enemies[0]!.enemy.hp).toBe(BASE_BACTERIOPHAGE_HP * 5)
  })

  it('passes hard visual palettes to bunker enemy controllers at high difficulty', () => {
    const controller = new BunkerSceneController({
      tint: TINT,
      scene: new THREE.Scene(),
      difficulty: 10,
      interiorMaterials: createTestBunkerInteriorMaterialSet(),
    })

    controller.spawnWave(['spire'])

    expect(shaderColors(controller)).toEqual(
      expect.arrayContaining([HARD_MAGENTA_SILHOUETTE, HARD_AMBER_FEATURE]),
    )
  })

  it('spawns wave enemies on world-space arena pads after moving the bunker root', () => {
    const controller = new BunkerSceneController({
      tint: TINT,
      scene: new THREE.Scene(),
      interiorMaterials: createTestBunkerInteriorMaterialSet(),
    })
    controller.setRootWorldPosition(ROOT_X, ROOT_Y, ROOT_Z)

    controller.spawnWave(['bacteriophage'])

    const enemy = controller.enemyDirector.enemies[0]!.enemy
    const arenaCenterZ = ANTECHAMBER.depth / 2 + CORRIDOR.depth + ARENA.depth / 2
    const firstPadX = -(ARENA.width / 2 - SPAWN_PAD_INSET)
    const firstPadZ = arenaCenterZ - (ARENA.depth / 2 - SPAWN_PAD_INSET)
    expect(enemy.position.x).toBe(ROOT_X + firstPadX)
    expect(enemy.position.y).toBe(ROOT_Y + PHAGE_HIT_CENTER_Y)
    expect(enemy.position.z).toBe(ROOT_Z + firstPadZ)
  })

  it('exposes walkable bounds per room so narrow spaces do not inherit arena width', () => {
    const controller = new BunkerSceneController({
      tint: TINT,
      scene: new THREE.Scene(),
      interiorMaterials: createTestBunkerInteriorMaterialSet(),
    })
    controller.setRootWorldPosition(ROOT_X, ROOT_Y, ROOT_Z)

    const expected = [
      {
        minX: ROOT_X - ANTECHAMBER.width / 2 + PLAYER_RADIUS_INSET,
        maxX: ROOT_X + ANTECHAMBER.width / 2 - PLAYER_RADIUS_INSET,
        minZ: ROOT_Z - ANTECHAMBER.depth / 2 + PLAYER_RADIUS_INSET,
        maxZ: ROOT_Z + ANTECHAMBER.depth / 2 - PLAYER_RADIUS_INSET,
      },
      {
        minX: ROOT_X - CORRIDOR.width / 2 + PLAYER_RADIUS_INSET,
        maxX: ROOT_X + CORRIDOR.width / 2 - PLAYER_RADIUS_INSET,
        minZ: ROOT_Z + ANTECHAMBER.depth / 2 - PLAYER_RADIUS_INSET,
        maxZ: ROOT_Z + ANTECHAMBER.depth / 2 + CORRIDOR.depth + PLAYER_RADIUS_INSET,
      },
      {
        minX: ROOT_X - ARENA.width / 2 + PLAYER_RADIUS_INSET,
        maxX: ROOT_X + ARENA.width / 2 - PLAYER_RADIUS_INSET,
        minZ: ROOT_Z + ANTECHAMBER.depth / 2 + CORRIDOR.depth + PLAYER_RADIUS_INSET,
        maxZ: ROOT_Z + ANTECHAMBER.depth / 2 + CORRIDOR.depth + ARENA.depth - PLAYER_RADIUS_INSET,
      },
    ]
    expect(controller.walkableBounds.length).toBe(expected.length)
    for (let i = 0; i < expected.length; i++) {
      expect(controller.walkableBounds[i]!.minX).toBeCloseTo(expected[i]!.minX)
      expect(controller.walkableBounds[i]!.maxX).toBeCloseTo(expected[i]!.maxX)
      expect(controller.walkableBounds[i]!.minZ).toBeCloseTo(expected[i]!.minZ)
      expect(controller.walkableBounds[i]!.maxZ).toBeCloseTo(expected[i]!.maxZ)
    }
  })

  it('leaves doorway openings instead of sealing the corridor behind doors', () => {
    const geometry = buildBunkerGeometry(createTestBunkerInteriorMaterialSet())

    expect(hasWallAt(geometry.wallMeshes, 0, DOORWAY_Z)).toBe(false)
    expect(hasWallAt(geometry.wallMeshes, 0, ARENA_ENTRY_Z)).toBe(false)
  })

  it('detects arena entry only after the player crosses into the arena room', () => {
    const controller = new BunkerSceneController({
      tint: TINT,
      scene: new THREE.Scene(),
      interiorMaterials: createTestBunkerInteriorMaterialSet(),
    })
    controller.setRootWorldPosition(ROOT_X, ROOT_Y, ROOT_Z)
    const arenaStartZ = ROOT_Z + ANTECHAMBER.depth / 2 + CORRIDOR.depth

    expect(controller.isPlayerInArena(ROOT_X, arenaStartZ - PLAYER_RADIUS_INSET)).toBe(false)
    expect(controller.isPlayerInArena(ROOT_X, arenaStartZ + PLAYER_RADIUS_INSET)).toBe(true)
  })

  it('ticks enemy death animations and despawns dead enemies after they finish', () => {
    const projectileSystem = {
      addEnemy: () => {},
      removeEnemy: () => {},
    }
    const controller = new BunkerSceneController({
      tint: TINT,
      scene: new THREE.Scene(),
      projectileSystem: projectileSystem as never,
      interiorMaterials: createTestBunkerInteriorMaterialSet(),
    })
    controller.spawnWave(['bacteriophage'])
    const handle = controller.enemyDirector.enemies[0]!

    handle.enemy.takeDamage(LETHAL_DAMAGE)
    controller.tick(DEATH_ANIMATION_SECONDS)

    expect(controller.enemyDirector.enemies).toHaveLength(0)
  })
})

/**
 * Check whether any vertical wall mesh covers an XZ point in local bunker space.
 *
 * @param meshes - Wall meshes from the bunker geometry.
 * @param x - Local bunker X to probe.
 * @param z - Local bunker Z to probe.
 */
function hasWallAt(meshes: readonly THREE.Mesh[], x: number, z: number): boolean {
  for (const mesh of meshes) {
    const box = new THREE.Box3().setFromObject(mesh)
    if (box.max.y - box.min.y < VERTICAL_WALL_MIN_HEIGHT) continue
    if (x >= box.min.x && x <= box.max.x && z >= box.min.z && z <= box.max.z) return true
  }
  return false
}

/**
 * Collect TRON shader primary colors from a bunker scene controller.
 *
 * @param controller - Controller whose private geometry root is inspected.
 */
function shaderColors(controller: BunkerSceneController): number[] {
  const root = (controller as unknown as { geometry: { root: THREE.Object3D } }).geometry.root
  const colors: number[] = []
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      if (!(material instanceof THREE.ShaderMaterial)) continue
      const color = material.uniforms['uColor']?.value
      if (color instanceof THREE.Color) colors.push(color.getHex())
    }
  })
  return colors
}

/**
 * Assert an enemy position falls within a world-space room rectangle.
 *
 * @param position - Enemy world position.
 * @param bounds - Active staging-room bounds.
 */
function expectEnemyInside(
  position: THREE.Vector3,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
): void {
  expect(position.x).toBeGreaterThanOrEqual(bounds.minX)
  expect(position.x).toBeLessThanOrEqual(bounds.maxX)
  expect(position.z).toBeGreaterThanOrEqual(bounds.minZ)
  expect(position.z).toBeLessThanOrEqual(bounds.maxZ)
}
