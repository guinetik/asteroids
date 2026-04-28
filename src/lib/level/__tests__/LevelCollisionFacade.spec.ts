import { describe, expect, it } from 'vitest'
import type { Heightmap } from '@/lib/terrain/heightmap'
import { LevelCollisionFacade } from '../LevelCollisionFacade'

function createHeightmap(height: number): Heightmap {
  return {
    heightAt: () => height,
  } as unknown as Heightmap
}

describe('LevelCollisionFacade', () => {
  it('registers and clears static colliders', () => {
    const facade = new LevelCollisionFacade()
    const world = facade.initialize(createHeightmap(12))

    facade.registerStaticColliders([
      {
        id: 'box-a',
        kind: 'aabb',
        min: { x: -1, y: 0, z: -1 },
        max: { x: 1, y: 2, z: 1 },
      },
    ])

    expect(
      world.moveDiscXZ({ x: 0, y: 0, z: 0 }, 0, 0, 0, 2, {
        radius: 0.5,
        skinWidth: 0,
        substepDistance: 1,
      }).touchedCollider,
    ).toBe(true)

    facade.clearStaticColliders()

    expect(
      world.moveDiscXZ({ x: 0, y: 0, z: 0 }, 0, 0, 0, 2, {
        radius: 0.5,
        skinWidth: 0,
        substepDistance: 1,
      }).touchedCollider,
    ).toBe(false)
  })

  it('replaces rock colliders by spawn index and removes them cleanly', () => {
    const facade = new LevelCollisionFacade()
    const world = facade.initialize(createHeightmap(0))

    facade.registerSurfaceRockCollider(3, {
      id: 'rock-3a',
      kind: 'aabb',
      min: { x: -1, y: 0, z: -1 },
      max: { x: 1, y: 2, z: 1 },
    })
    facade.registerSurfaceRockCollider(3, {
      id: 'rock-3b',
      kind: 'aabb',
      min: { x: 10, y: 0, z: 10 },
      max: { x: 12, y: 2, z: 12 },
    })

    expect(
      world.moveDiscXZ({ x: 0, y: 0, z: 0 }, 0, 0, 0, 2, {
        radius: 0.5,
        skinWidth: 0,
        substepDistance: 1,
      }).touchedCollider,
    ).toBe(false)
    expect(
      world.moveDiscXZ({ x: 11, y: 0, z: 11 }, 0, 0, 0, 2, {
        radius: 0.5,
        skinWidth: 0,
        substepDistance: 1,
      }).touchedCollider,
    ).toBe(true)

    facade.removeSurfaceRockCollider(3)

    expect(
      world.moveDiscXZ({ x: 11, y: 0, z: 11 }, 0, 0, 0, 2, {
        radius: 0.5,
        skinWidth: 0,
        substepDistance: 1,
      }).touchedCollider,
    ).toBe(false)
  })

  it('registers and clears objective prop colliders separately from rocks', () => {
    const facade = new LevelCollisionFacade()
    const world = facade.initialize(createHeightmap(0))

    facade.registerSurfaceRockCollider(1, {
      id: 'rock-1',
      kind: 'aabb',
      min: { x: 10, y: 0, z: 10 },
      max: { x: 12, y: 2, z: 12 },
    })
    facade.registerObjectiveColliders([
      {
        id: 'terminal-1',
        kind: 'aabb',
        min: { x: -1, y: 0, z: -1 },
        max: { x: 1, y: 3, z: 1 },
      },
    ])

    expect(
      world.moveDiscXZ({ x: 0, y: 0, z: 0 }, 0, 0, 0, 2, {
        radius: 0.5,
        skinWidth: 0,
        substepDistance: 1,
      }).touchedCollider,
    ).toBe(true)

    facade.clearObjectiveColliders()

    expect(
      world.moveDiscXZ({ x: 0, y: 0, z: 0 }, 0, 0, 0, 2, {
        radius: 0.5,
        skinWidth: 0,
        substepDistance: 1,
      }).touchedCollider,
    ).toBe(false)
    expect(
      world.moveDiscXZ({ x: 11, y: 0, z: 11 }, 0, 0, 0, 2, {
        radius: 0.5,
        skinWidth: 0,
        substepDistance: 1,
      }).touchedCollider,
    ).toBe(true)
  })

  it('replaces objective prop colliders without clearing static colliders', () => {
    const facade = new LevelCollisionFacade()
    const world = facade.initialize(createHeightmap(0))

    facade.registerStaticColliders([
      {
        id: 'lander',
        kind: 'aabb',
        min: { x: 20, y: 0, z: 20 },
        max: { x: 22, y: 2, z: 22 },
      },
    ])
    facade.registerObjectiveColliders([
      {
        id: 'terminal-old',
        kind: 'aabb',
        min: { x: -1, y: 0, z: -1 },
        max: { x: 1, y: 3, z: 1 },
      },
    ])
    facade.registerObjectiveColliders([
      {
        id: 'terminal-new',
        kind: 'aabb',
        min: { x: 5, y: 0, z: 5 },
        max: { x: 7, y: 3, z: 7 },
      },
    ])

    expect(
      world.moveDiscXZ({ x: 0, y: 0, z: 0 }, 0, 0, 0, 2, {
        radius: 0.5,
        skinWidth: 0,
        substepDistance: 1,
      }).touchedCollider,
    ).toBe(false)
    expect(
      world.moveDiscXZ({ x: 6, y: 0, z: 6 }, 0, 0, 0, 2, {
        radius: 0.5,
        skinWidth: 0,
        substepDistance: 1,
      }).touchedCollider,
    ).toBe(true)
    expect(
      world.moveDiscXZ({ x: 21, y: 0, z: 21 }, 0, 0, 0, 2, {
        radius: 0.5,
        skinWidth: 0,
        substepDistance: 1,
      }).touchedCollider,
    ).toBe(true)
  })

  it('appends objective prop colliders without clearing existing objective blockers', () => {
    const facade = new LevelCollisionFacade()
    const world = facade.initialize(createHeightmap(0))

    facade.registerObjectiveColliders([
      {
        id: 'terminal',
        kind: 'aabb',
        min: { x: -1, y: 0, z: -1 },
        max: { x: 1, y: 3, z: 1 },
      },
    ])
    facade.addObjectiveCollider({
      id: 'surface-hatch',
      kind: 'aabb',
      min: { x: 9, y: 0, z: 9 },
      max: { x: 11, y: 8, z: 11 },
    })

    expect(
      world.moveDiscXZ({ x: 0, y: 0, z: 0 }, 0, 0, 0, 2, {
        radius: 0.5,
        skinWidth: 0,
        substepDistance: 1,
      }).touchedCollider,
    ).toBe(true)
    expect(
      world.moveDiscXZ({ x: 10, y: 0, z: 10 }, 0, 0, 0, 2, {
        radius: 0.5,
        skinWidth: 0,
        substepDistance: 1,
      }).touchedCollider,
    ).toBe(true)
  })

  it('builds an EVA spawn from terrain support when the world exists', () => {
    const facade = new LevelCollisionFacade()
    facade.initialize(createHeightmap(25))

    expect(
      facade.buildEvaSpawnPosition({ x: 4, y: 10, z: -3 }, { fallbackOffsetX: 8, topYOffset: 12 }),
    ).toEqual({ x: 4, y: 37, z: -3 })
  })

  it('falls back to a side-step EVA spawn before collision initialization', () => {
    const facade = new LevelCollisionFacade()

    expect(
      facade.buildEvaSpawnPosition({ x: 4, y: 10, z: -3 }, { fallbackOffsetX: 8, topYOffset: 12 }),
    ).toEqual({ x: 12, y: 10, z: -3 })
  })
})
