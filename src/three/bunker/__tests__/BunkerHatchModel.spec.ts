/**
 * Unit tests for {@link BunkerHatchModel}.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/bunker-hatch-scale.md
 */
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { BunkerHatchModel } from '../BunkerHatchModel'
import { LANDER_COLLISION_TOP_OFFSET } from '@/three/landerDimensions'
import { CollisionWorld } from '@/lib/physics/worldCollision'

const TINT = 0x66ccff
const MIN_CHUNKY_ENTRANCE_DIAMETER = 16
const BURIED_DEPTH = 6
const DOOR_MIN_BOTTOM_ABOVE_GROUND = 1
const DOOR_MAX_BOTTOM_ABOVE_GROUND = 2
const MIN_DOOR_WIDTH = 4
const MIN_DOOR_HEIGHT = 9
const MAX_PIPE_HEIGHT = LANDER_COLLISION_TOP_OFFSET * 3
const MIN_PIPE_HEIGHT = LANDER_COLLISION_TOP_OFFSET * 1.5
const MIN_PIPE_COLOR_CHANNEL = 0.35
const MAX_PIPE_METALNESS = 0.65
const MIN_PIPE_ROUGHNESS = 0.65
const MAX_PIPE_ENV_MAP_INTENSITY = 0.5
const FLOAT_EPSILON = 1e-4

describe('BunkerHatchModel', () => {
  it('builds a person-sized vertical pipe with a side entry door', () => {
    const hatch = new BunkerHatchModel(TINT)

    const body = hatch.group.getObjectByName('bunkerHatchBody')
    const door = hatch.group.getObjectByName('bunkerHatchDoor')
    const frame = hatch.group.getObjectByName('bunkerHatchDoorFrame')
    const light = hatch.group.getObjectByName('bunkerHatchDoorLight')
    const bounds = new THREE.Box3().setFromObject(hatch.group)
    const size = new THREE.Vector3()
    bounds.getSize(size)

    expect(body).toBeInstanceOf(THREE.Mesh)
    expect(door).toBeInstanceOf(THREE.Mesh)
    const bodyMesh = body as THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>
    expect(bodyMesh.material.side).toBe(THREE.DoubleSide)
    expect(bodyMesh.geometry.parameters.openEnded).toBe(false)
    expect(bodyMesh.material.color.r).toBeGreaterThanOrEqual(MIN_PIPE_COLOR_CHANNEL)
    expect(bodyMesh.material.color.g).toBeGreaterThanOrEqual(MIN_PIPE_COLOR_CHANNEL)
    expect(bodyMesh.material.color.b).toBeGreaterThanOrEqual(MIN_PIPE_COLOR_CHANNEL)
    expect(bodyMesh.material.metalness).toBeLessThanOrEqual(MAX_PIPE_METALNESS)
    expect(bodyMesh.material.roughness).toBeGreaterThanOrEqual(MIN_PIPE_ROUGHNESS)
    expect(bodyMesh.material.envMapIntensity).toBeLessThanOrEqual(MAX_PIPE_ENV_MAP_INTENSITY)
    expect(bodyMesh.material.map).toBeInstanceOf(THREE.Texture)
    expect(bodyMesh.material.normalMap).toBeInstanceOf(THREE.Texture)
    expect(bodyMesh.material.roughnessMap).toBeInstanceOf(THREE.Texture)
    expect(bodyMesh.material.metalnessMap).toBeInstanceOf(THREE.Texture)
    expect(bodyMesh.material.displacementMap).toBeInstanceOf(THREE.Texture)
    expect(bodyMesh.material.map?.colorSpace).toBe(THREE.SRGBColorSpace)
    expect(bodyMesh.material.normalMap?.colorSpace).toBe(THREE.NoColorSpace)
    expect(bodyMesh.material.map?.wrapS).toBe(THREE.RepeatWrapping)
    expect(bodyMesh.material.map?.wrapT).toBe(THREE.RepeatWrapping)
    expect(frame).toBeInstanceOf(THREE.Group)
    expect(light).toBeInstanceOf(THREE.PointLight)
    expect(hatch.group.getObjectByName('bunkerHatchRing')).toBeUndefined()
    expect(hatch.group.getObjectByName('bunkerHatchLeafA')).toBeUndefined()
    expect(hatch.group.getObjectByName('bunkerHatchLeafB')).toBeUndefined()
    const doorBounds = new THREE.Box3().setFromObject(door!)
    const doorSize = new THREE.Vector3()
    doorBounds.getSize(doorSize)

    expect(size.x).toBeGreaterThanOrEqual(MIN_CHUNKY_ENTRANCE_DIAMETER)
    expect(size.z).toBeGreaterThanOrEqual(MIN_CHUNKY_ENTRANCE_DIAMETER)
    expect(bounds.min.y).toBeLessThanOrEqual(-BURIED_DEPTH + FLOAT_EPSILON)
    expect(size.y).toBeGreaterThanOrEqual(MIN_PIPE_HEIGHT)
    expect(size.y).toBeLessThan(MAX_PIPE_HEIGHT)
    expect(doorSize.x).toBeGreaterThanOrEqual(MIN_DOOR_WIDTH)
    expect(doorSize.y).toBeGreaterThanOrEqual(MIN_DOOR_HEIGHT)
    expect(doorBounds.min.y).toBeGreaterThanOrEqual(DOOR_MIN_BOTTOM_ABOVE_GROUND)
    expect(doorBounds.min.y).toBeLessThanOrEqual(DOOR_MAX_BOTTOM_ABOVE_GROUND)

    hatch.dispose()
  })

  it('exposes a world AABB collider that blocks EVA and lander movement', () => {
    const hatch = new BunkerHatchModel(TINT)
    hatch.group.position.set(12, 4, -8)
    hatch.group.updateMatrixWorld(true)
    const world = new CollisionWorld(null)
    world.addCollider(hatch.createWorldCollider('surface-hatch'))

    const playerMove = world.moveCharacterXZ(
      { x: 12 - MIN_CHUNKY_ENTRANCE_DIAMETER, y: 4, z: -8 },
      MIN_CHUNKY_ENTRANCE_DIAMETER,
      0,
      4,
      4 + DOOR_MIN_BOTTOM_ABOVE_GROUND + MIN_DOOR_HEIGHT,
      {
        radius: 0.65,
        maxStepHeight: 0.45,
        maxClimbAngleRad: Math.PI * 0.24,
        substepDistance: 0.5,
        skinWidth: 0.05,
        airborneClearance: 0.45,
      },
    )
    const landerMove = world.moveDiscXZ(
      { x: 12 - MIN_CHUNKY_ENTRANCE_DIAMETER * 2, y: 4, z: -8 },
      MIN_CHUNKY_ENTRANCE_DIAMETER * 2,
      0,
      4,
      4 + LANDER_COLLISION_TOP_OFFSET,
      {
        radius: 9,
        skinWidth: 0.1,
        substepDistance: 1,
      },
    )
    const support = world.getHighestSupportUnderDisc(
      12,
      -8,
      4 - BURIED_DEPTH,
      4 + MAX_PIPE_HEIGHT,
      9,
    )

    expect(playerMove.touchedCollider).toBe(true)
    expect(playerMove.x).toBeLessThan(12)
    expect(landerMove.touchedCollider).toBe(true)
    expect(landerMove.blocked).toBe(true)
    expect(support.colliderId).toBe('surface-hatch')

    hatch.dispose()
  })
})
