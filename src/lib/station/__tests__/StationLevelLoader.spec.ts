/**
 * Tests for the pure-math parts of {@link StationLevelLoader}: JSON
 * validation and collider-geometry generation.
 *
 * @author guinetik
 * @date 2026-05-12
 */
import { describe, it, expect } from 'vitest'
import { validateStationLevel, buildStationColliderGeometry } from '../StationLevelLoader'
import type { StationLevelJson } from '../types'

const MINIMAL_LEVEL: StationLevelJson = {
  id: 'test',
  spawn: { room: 'a', pos: [0, 0, 0], yaw: 0 },
  exitHatch: { room: 'a', wall: '-z', centerY: 1.2 },
  rooms: [
    {
      id: 'a',
      size: [10, 3, 8],
      origin: [-5, 0, -4],
      material: 'm',
      openings: [{ to: 'b', wall: '+z', offset: 0, width: 2 }],
    },
    {
      id: 'b',
      size: [10, 3, 8],
      origin: [-5, 0, 4],
      material: 'm',
      openings: [{ to: 'a', wall: '-z', offset: 0, width: 2 }],
    },
  ],
  materials: { m: { floor: '#000', wall: '#111', ceiling: '#222' } },
  ambient: { color: '#fff', intensity: 0.3 },
}

describe('validateStationLevel', () => {
  it('accepts a well-formed level', () => {
    expect(() => validateStationLevel(MINIMAL_LEVEL)).not.toThrow()
  })

  it('rejects an opening whose target room does not exist', () => {
    const bad: StationLevelJson = {
      ...MINIMAL_LEVEL,
      rooms: [
        { ...MINIMAL_LEVEL.rooms[0]!, openings: [{ to: 'ghost', wall: '+z', offset: 0, width: 2 }] },
        MINIMAL_LEVEL.rooms[1]!,
      ],
    }
    expect(() => validateStationLevel(bad)).toThrow(/ghost/)
  })

  it('rejects an opening that is not mirrored on the other side', () => {
    const bad: StationLevelJson = {
      ...MINIMAL_LEVEL,
      rooms: [MINIMAL_LEVEL.rooms[0]!, { ...MINIMAL_LEVEL.rooms[1]!, openings: [] }],
    }
    expect(() => validateStationLevel(bad)).toThrow(/mirror/i)
  })

  it('rejects a room whose material key is missing from the materials map', () => {
    const bad: StationLevelJson = {
      ...MINIMAL_LEVEL,
      rooms: [{ ...MINIMAL_LEVEL.rooms[0]!, material: 'missing' }, MINIMAL_LEVEL.rooms[1]!],
    }
    expect(() => validateStationLevel(bad)).toThrow(/material/i)
  })

  it('rejects a hatch whose room does not exist', () => {
    const bad: StationLevelJson = {
      ...MINIMAL_LEVEL,
      exitHatch: { room: 'ghost', wall: '-z', centerY: 1.2 },
    }
    expect(() => validateStationLevel(bad)).toThrow(/ghost/)
  })
})

describe('buildStationColliderGeometry', () => {
  it('emits one floor per room with absolute world coordinates', () => {
    const { floors } = buildStationColliderGeometry(MINIMAL_LEVEL)
    expect(floors).toHaveLength(2)
    const a = floors.find((f) => f.minX === -5 && f.minZ === -4)
    expect(a).toBeDefined()
    expect(a!.maxX).toBe(5)
    expect(a!.maxZ).toBe(4)
    expect(a!.y).toBe(0)
  })

  it('emits wall AABBs split around openings (no AABB spans the opening width)', () => {
    const { walls } = buildStationColliderGeometry(MINIMAL_LEVEL)
    // Room A has a 2m-wide opening at z=4 centred on x=0. The +z wall of A
    // (z=4) should produce two segments: x∈[-5,-1] and x∈[1,5]. No segment
    // covers x∈[-1,1] at z=4.
    const aPlusZSegments = walls.filter((w) => w.minZ >= 4 - 0.2 && w.maxZ <= 4 + 0.2)
    expect(aPlusZSegments.length).toBeGreaterThanOrEqual(2)
    const spansOpening = aPlusZSegments.some((w) => w.minX < 0 && w.maxX > 0)
    expect(spansOpening).toBe(false)
  })

  it('does not emit a wall segment where two rooms share an opening', () => {
    const { walls } = buildStationColliderGeometry(MINIMAL_LEVEL)
    // No wall AABB should sit at z=4 spanning the opening x∈[-1,1].
    const blocking = walls.find(
      (w) => w.minZ < 4 && w.maxZ > 4 && w.minX <= -1 && w.maxX >= 1,
    )
    expect(blocking).toBeUndefined()
  })
})
