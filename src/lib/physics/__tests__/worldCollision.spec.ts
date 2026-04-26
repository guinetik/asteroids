import { describe, expect, it } from 'vitest'
import { Heightmap } from '@/lib/terrain/heightmap'
import { CollisionWorld } from '@/lib/physics/worldCollision'

function createRampHeightmap(gradient: number): Heightmap {
  const resolution = 64
  const worldSize = 20
  const heightmap = new Heightmap(resolution, worldSize)
  const half = worldSize / 2

  for (let gz = 0; gz < resolution; gz++) {
    for (let gx = 0; gx < resolution; gx++) {
      const x = (gx / (resolution - 1)) * worldSize - half
      heightmap.set(gx, gz, Math.max(0, (x + 4) * gradient))
    }
  }

  return heightmap
}

describe('CollisionWorld', () => {
  it('allows traversal across gentle terrain', () => {
    const world = new CollisionWorld(createRampHeightmap(0.2))

    const result = world.moveCharacterXZ({ x: -4, y: 0, z: 0 }, 3, 0, 0, 1.7, {
      radius: 0.65,
      maxStepHeight: 0.45,
      maxClimbAngleRad: Math.PI * 0.24,
      substepDistance: 0.35,
      skinWidth: 0.05,
      airborneClearance: 0.45,
    })

    expect(result.x).toBeGreaterThan(-1.5)
    expect(result.blocked).toBe(false)
    expect(result.groundWalkable).toBe(true)
  })

  it('still reports steep terrain as non-walkable without hard-blocking movement', () => {
    const world = new CollisionWorld(createRampHeightmap(2.2))

    const result = world.moveCharacterXZ({ x: -3.8, y: 0.4, z: 0 }, 2.8, 0, 0.4, 2.1, {
      radius: 0.65,
      maxStepHeight: 0.45,
      maxClimbAngleRad: Math.PI * 0.24,
      substepDistance: 0.35,
      skinWidth: 0.05,
      airborneClearance: 0.45,
    })

    expect(result.blocked).toBe(false)
    expect(result.x).toBeGreaterThan(-1.5)
    expect(result.groundWalkable).toBe(false)
  })

  it('pushes the character out of registered solid colliders', () => {
    const world = new CollisionWorld(createRampHeightmap(0))
    world.addCollider({
      kind: 'sphere',
      center: { x: 0, y: 0, z: 0 },
      radius: 1.25,
      minY: -1,
      maxY: 3,
    })

    const result = world.moveCharacterXZ({ x: -3, y: 0, z: 0 }, 3.2, 0, 0, 1.7, {
      radius: 0.65,
      maxStepHeight: 0.45,
      maxClimbAngleRad: Math.PI * 0.24,
      substepDistance: 0.35,
      skinWidth: 0.05,
      airborneClearance: 0.45,
    })

    expect(result.touchedCollider).toBe(true)
    expect(result.x).toBeLessThanOrEqual(-1.95)
  })

  it('pushes a moving disc out of registered solid colliders', () => {
    const world = new CollisionWorld(createRampHeightmap(0))
    world.addCollider({
      id: 'shuttle',
      kind: 'aabb',
      min: { x: -2, y: -1, z: -2 },
      max: { x: 2, y: 4, z: 2 },
    })

    const result = world.moveDiscXZ({ x: -6, y: 0, z: 0 }, 8, 0, 0, 6, {
      radius: 1.5,
      skinWidth: 0.1,
      substepDistance: 0.5,
    })

    expect(result.touchedCollider).toBe(true)
    expect(result.blocked).toBe(true)
    expect(result.x).toBeLessThanOrEqual(-3.5)
  })

  it('returns collider top surfaces as support under a disc', () => {
    const world = new CollisionWorld(createRampHeightmap(0))
    world.addCollider({
      id: 'shuttle',
      kind: 'aabb',
      min: { x: -2, y: 10, z: -2 },
      max: { x: 2, y: 14, z: 2 },
    })

    const support = world.getHighestSupportUnderDisc(0, 0, 0, 20, 1.5)

    expect(support.colliderId).toBe('shuttle')
    expect(support.height).toBe(14)
    expect(support.normal.y).toBe(1)
  })

  it('does not treat collider tops far above the body as immediate support', () => {
    const world = new CollisionWorld(createRampHeightmap(0))
    world.addCollider({
      id: 'shuttle',
      kind: 'aabb',
      min: { x: -2, y: 40, z: -2 },
      max: { x: 2, y: 50, z: 2 },
    })

    const support = world.getHighestSupportUnderDisc(0, 0, 0, 10, 1.5)

    expect(support.colliderId).toBe(null)
    expect(support.height).toBe(0)
  })
})
