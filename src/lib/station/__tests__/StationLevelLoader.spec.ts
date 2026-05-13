/**
 * Tests for the pure-math parts of {@link StationLevelLoader}: JSON
 * validation and collider-geometry generation.
 *
 * @author guinetik
 * @date 2026-05-12
 */
import { describe, it, expect } from 'vitest'
import {
  validateStationLevel,
  buildStationColliderGeometry,
  roomFloorRect,
  doorPassageRect,
} from '../StationLevelLoader'
import type { StationLevelJson } from '../types'

const MINIMAL_LEVEL: StationLevelJson = {
  id: 'test',
  spawn: { room: 'foyer', pos: [0, 0, 0], yaw: 0 },
  exitHatch: { room: 'foyer', wall: '-zCap', centerY: 1.6 },
  rooms: [
    {
      id: 'foyer',
      axis: 'z',
      radius: 5,
      length: 14,
      center: [0, 0, 0],
      material: 'm',
      doors: [
        { to: 'margaret', wall: '-xCurve', width: 1.8, height: 2.2 },
        { to: 'pig', wall: '+zCap', width: 1.8, height: 2.2 },
      ],
    },
    {
      id: 'margaret',
      axis: 'x',
      radius: 5,
      length: 10,
      center: [-10, 0, 0],
      material: 'm',
      doors: [{ to: 'foyer', wall: '+xCap', width: 1.8, height: 2.2 }],
    },
    {
      id: 'pig',
      axis: 'z',
      radius: 5,
      length: 12,
      center: [0, 0, 13],
      material: 'm',
      doors: [{ to: 'foyer', wall: '-zCap', width: 1.8, height: 2.2 }],
    },
  ],
  materials: { m: { floor: '#ccc', cap: '#eee' } },
  ambient: { color: '#fff', intensity: 0.7 },
}

describe('validateStationLevel', () => {
  it('accepts a well-formed level', () => {
    expect(() => validateStationLevel(MINIMAL_LEVEL)).not.toThrow()
  })

  it('rejects a door whose target room does not exist', () => {
    const bad: StationLevelJson = {
      ...MINIMAL_LEVEL,
      rooms: [
        {
          ...MINIMAL_LEVEL.rooms[0]!,
          doors: [{ to: 'ghost', wall: '+zCap', width: 1.8, height: 2.2 }],
        },
        MINIMAL_LEVEL.rooms[1]!,
        MINIMAL_LEVEL.rooms[2]!,
      ],
    }
    expect(() => validateStationLevel(bad)).toThrow(/ghost/)
  })

  it('rejects a door whose wall does not match the room axis', () => {
    const bad: StationLevelJson = {
      ...MINIMAL_LEVEL,
      rooms: [
        {
          ...MINIMAL_LEVEL.rooms[0]!,
          // axis 'z' room cannot expose a +xCap.
          doors: [{ to: 'margaret', wall: '+xCap', width: 1.8, height: 2.2 }],
        },
        MINIMAL_LEVEL.rooms[1]!,
        MINIMAL_LEVEL.rooms[2]!,
      ],
    }
    expect(() => validateStationLevel(bad)).toThrow(/invalid for axis/i)
  })

  it('rejects a door that is not mirrored on the other side', () => {
    const bad: StationLevelJson = {
      ...MINIMAL_LEVEL,
      rooms: [
        MINIMAL_LEVEL.rooms[0]!,
        { ...MINIMAL_LEVEL.rooms[1]!, doors: [] },
        MINIMAL_LEVEL.rooms[2]!,
      ],
    }
    expect(() => validateStationLevel(bad)).toThrow(/mirror/i)
  })

  it('rejects a room whose material key is missing from the materials map', () => {
    const bad: StationLevelJson = {
      ...MINIMAL_LEVEL,
      rooms: [
        { ...MINIMAL_LEVEL.rooms[0]!, material: 'missing' },
        MINIMAL_LEVEL.rooms[1]!,
        MINIMAL_LEVEL.rooms[2]!,
      ],
    }
    expect(() => validateStationLevel(bad)).toThrow(/material/i)
  })

  it('rejects a hatch mounted on a curve wall', () => {
    const bad: StationLevelJson = {
      ...MINIMAL_LEVEL,
      exitHatch: { room: 'foyer', wall: '-xCurve', centerY: 1.6 },
    }
    expect(() => validateStationLevel(bad)).toThrow(/end cap/i)
  })
})

describe('roomFloorRect', () => {
  it('produces world-space floor for axis-z rooms', () => {
    const r = roomFloorRect(MINIMAL_LEVEL.rooms[0]!)
    expect(r.minX).toBe(-5)
    expect(r.maxX).toBe(5)
    expect(r.minZ).toBe(-7)
    expect(r.maxZ).toBe(7)
  })

  it('swaps axes for axis-x rooms', () => {
    const r = roomFloorRect(MINIMAL_LEVEL.rooms[1]!)
    expect(r.minX).toBe(-15)
    expect(r.maxX).toBe(-5)
    expect(r.minZ).toBe(-5)
    expect(r.maxZ).toBe(5)
  })
})

describe('doorPassageRect', () => {
  it('straddles a +xCap doorway between two rooms', () => {
    const margaret = MINIMAL_LEVEL.rooms[1]!
    const door = margaret.doors[0]!
    const p = doorPassageRect(margaret, door)
    // Centred on x=-5, z=0.
    expect((p.minX + p.maxX) / 2).toBeCloseTo(-5)
    expect((p.minZ + p.maxZ) / 2).toBeCloseTo(0)
    expect(p.maxZ - p.minZ).toBeCloseTo(door.width)
  })

  it('straddles a -xCurve doorway on an axis-z room at the door width', () => {
    const foyer = MINIMAL_LEVEL.rooms[0]!
    const door = foyer.doors.find((d) => d.wall === '-xCurve')!
    const p = doorPassageRect(foyer, door)
    expect((p.minX + p.maxX) / 2).toBeCloseTo(-5)
    expect(p.maxZ - p.minZ).toBeCloseTo(door.width)
  })
})

describe('buildStationColliderGeometry', () => {
  it('emits one floor per room in world coordinates', () => {
    const { floors } = buildStationColliderGeometry(MINIMAL_LEVEL)
    expect(floors).toHaveLength(3)
    const foyer = floors.find((f) => f.minX === -5 && f.maxX === 5 && f.minZ === -7)
    expect(foyer).toBeDefined()
  })

  it('emits one passage rectangle per declared door', () => {
    const { passages } = buildStationColliderGeometry(MINIMAL_LEVEL)
    // Foyer has 2 doors, Margaret 1, Pig 1 => 4 passages total.
    expect(passages).toHaveLength(4)
  })
})
