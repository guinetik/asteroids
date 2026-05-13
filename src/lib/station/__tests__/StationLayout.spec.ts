import { describe, expect, it } from 'vitest'
import {
  bboxOverlapsInterior,
  CORRIDOR_HALF_EXTENTS,
  type CorridorNode,
  corridorBBox,
  corridorPortWorldAnchor,
  corridorWorldPorts,
  type EntranceSpec,
  nativePortAnchor,
  portsMate,
  resolveLayout,
  roomBBox,
  roomEntranceWorldAnchor,
  ROOM_TILE_SIZE,
  type RoomSpec,
  rotateSide,
  rotateVec2,
  sideToYaw,
  type StationLayout,
  validateLayout,
} from '@/lib/station/StationLayout'

describe('rotateSide', () => {
  it('cycles cardinal sides clockwise when viewed from above', () => {
    expect(rotateSide('N', 0)).toBe('N')
    expect(rotateSide('N', 1)).toBe('E')
    expect(rotateSide('N', 2)).toBe('S')
    expect(rotateSide('N', 3)).toBe('W')
    expect(rotateSide('W', 1)).toBe('N')
  })
})

describe('rotateVec2', () => {
  it('rotates +X to -Z under +90° yaw (matches Three.js yaw around +Y)', () => {
    expect(rotateVec2({ x: 1, z: 0 }, 1)).toEqual({ x: 0, z: -1 })
  })

  it('rotates +Z to +X under +90° yaw', () => {
    expect(rotateVec2({ x: 0, z: 1 }, 1)).toEqual({ x: 1, z: 0 })
  })

  it('inverts under 180°', () => {
    expect(rotateVec2({ x: 2.5, z: -1.5 }, 2)).toEqual({ x: -2.5, z: 1.5 })
  })

  it('is identity under 0 turns', () => {
    expect(rotateVec2({ x: 1.23, z: -4.56 }, 0)).toEqual({ x: 1.23, z: -4.56 })
  })
})

describe('nativePortAnchor', () => {
  it('returns +Z half-extent for N port on the cross piece', () => {
    expect(nativePortAnchor('cross', 'N')).toEqual({ x: 0, z: CORRIDOR_HALF_EXTENTS.cross.z })
  })

  it('returns +X half-extent for E port on the window piece', () => {
    expect(nativePortAnchor('window', 'E')).toEqual({ x: CORRIDOR_HALF_EXTENTS.window.x, z: 0 })
  })

  it('throws when the side has no native port', () => {
    // Corner piece's native ports are S + W; N is closed (window wall).
    expect(() => nativePortAnchor('corner', 'N')).toThrow(/no native port/)
  })
})

describe('corridorWorldPorts', () => {
  it('returns all four sides for an unrotated cross', () => {
    const node: CorridorNode = { id: 'c1', kind: 'cross', anchor: { x: 0, z: 0 } }
    expect(corridorWorldPorts(node).sort()).toEqual(['E', 'N', 'S', 'W'])
  })

  it('rotates corner native ports (S, W) by 90° clockwise to (W, N)', () => {
    const node: CorridorNode = { id: 'c1', kind: 'corner', anchor: { x: 0, z: 0 }, yaw: 1 }
    expect(corridorWorldPorts(node).sort()).toEqual(['N', 'W'])
  })

  it('rotates window native ports (N, W, E) by 180° to (S, E, W)', () => {
    const node: CorridorNode = { id: 'c1', kind: 'window', anchor: { x: 0, z: 0 }, yaw: 2 }
    expect(corridorWorldPorts(node).sort()).toEqual(['E', 'S', 'W'])
  })
})

describe('corridorPortWorldAnchor', () => {
  it('returns null when the corridor has no port on the requested side', () => {
    const corner: CorridorNode = { id: 'c1', kind: 'corner', anchor: { x: 0, z: 0 } }
    // Corner's native ports are S + W; the N face is the window wall.
    expect(corridorPortWorldAnchor(corner, 'N')).toBeNull()
  })

  it('places the cross N port at anchor + +Z half-extent', () => {
    const node: CorridorNode = { id: 'c1', kind: 'cross', anchor: { x: 5, z: 10 } }
    const port = corridorPortWorldAnchor(node, 'N')
    expect(port).not.toBeNull()
    expect(port?.anchor).toEqual({ x: 5, z: 10 + CORRIDOR_HALF_EXTENTS.cross.z })
    expect(port?.outwardYaw).toBe(0)
  })

  it('places a rotated cross port at the right world side', () => {
    // Yaw=1 rotates native E to world S. The cross E port at yaw=0 sits at
    // +X half-extent; after yaw=1 its world anchor should sit at -Z
    // half-extent (i.e. world S).
    const node: CorridorNode = { id: 'c1', kind: 'cross', anchor: { x: 0, z: 0 }, yaw: 1 }
    const port = corridorPortWorldAnchor(node, 'S')
    expect(port?.anchor).toEqual({ x: 0, z: -CORRIDOR_HALF_EXTENTS.cross.x })
  })

  it('handles the window piece rectangular dimensions correctly', () => {
    const node: CorridorNode = { id: 'c1', kind: 'window', anchor: { x: 0, z: 0 } }
    expect(corridorPortWorldAnchor(node, 'E')?.anchor).toEqual({
      x: CORRIDOR_HALF_EXTENTS.window.x,
      z: 0,
    })
    expect(corridorPortWorldAnchor(node, 'N')?.anchor).toEqual({
      x: 0,
      z: CORRIDOR_HALF_EXTENTS.window.z,
    })
  })
})

describe('portsMate', () => {
  it('matches when anchors coincide and outward directions are opposite', () => {
    const a = { anchor: { x: 5, z: 0 }, outwardYaw: 1 as const } // E
    const b = { anchor: { x: 5, z: 0 }, outwardYaw: 3 as const } // W
    expect(portsMate(a, b)).toBe(true)
  })

  it('rejects ports that face the same direction', () => {
    const a = { anchor: { x: 5, z: 0 }, outwardYaw: 1 as const }
    const b = { anchor: { x: 5, z: 0 }, outwardYaw: 1 as const }
    expect(portsMate(a, b)).toBe(false)
  })

  it('rejects ports that are not co-located', () => {
    const a = { anchor: { x: 5, z: 0 }, outwardYaw: 1 as const }
    const b = { anchor: { x: 5.1, z: 0 }, outwardYaw: 3 as const }
    expect(portsMate(a, b)).toBe(false)
  })
})

describe('sideToYaw', () => {
  it('maps cardinal sides to N=0, E=1, S=2, W=3', () => {
    expect(sideToYaw('N')).toBe(0)
    expect(sideToYaw('E')).toBe(1)
    expect(sideToYaw('S')).toBe(2)
    expect(sideToYaw('W')).toBe(3)
  })
})

describe('roomEntranceWorldAnchor', () => {
  const room: RoomSpec = { id: 'r1', width: 4, depth: 3, anchor: { x: 0, z: 0 } }

  it('places a south entrance on the −Z face at the centred tile column', () => {
    const entrance: EntranceSpec = {
      side: 'S',
      index: 1,
      prompt: 'F  Leave',
      event: 'station:exit',
    }
    const halfD = (room.depth * ROOM_TILE_SIZE) / 2
    // width=4 → col centres at −1.5T, −0.5T, +0.5T, +1.5T (T = tile pitch).
    const expectedX = (1 - (4 - 1) / 2) * ROOM_TILE_SIZE
    expect(roomEntranceWorldAnchor(room, entrance)).toEqual({
      anchor: { x: expectedX, z: -halfD },
      outwardYaw: sideToYaw('S'),
    })
  })

  it('places an east entrance on the +X face', () => {
    const entrance: EntranceSpec = { side: 'E', index: 0, prompt: '', event: '' }
    const halfW = (room.width * ROOM_TILE_SIZE) / 2
    const expectedZ = (0 - (room.depth - 1) / 2) * ROOM_TILE_SIZE
    expect(roomEntranceWorldAnchor(room, entrance)).toEqual({
      anchor: { x: halfW, z: expectedZ },
      outwardYaw: sideToYaw('E'),
    })
  })

  it('rotates the entrance world side with the room yaw', () => {
    const rotated: RoomSpec = { ...room, yaw: 1 } // 90° CW
    const entrance: EntranceSpec = { side: 'S', index: 1, prompt: '', event: '' }
    // The south face under +90° yaw becomes the west face.
    expect(roomEntranceWorldAnchor(rotated, entrance).outwardYaw).toBe(sideToYaw('W'))
  })

  it('translates the entrance with the room anchor', () => {
    const offset: RoomSpec = { ...room, anchor: { x: 100, z: -50 } }
    const entrance: EntranceSpec = { side: 'N', index: 2, prompt: '', event: '' }
    const halfD = (offset.depth * ROOM_TILE_SIZE) / 2
    const expectedX = (2 - (offset.width - 1) / 2) * ROOM_TILE_SIZE
    expect(roomEntranceWorldAnchor(offset, entrance).anchor).toEqual({
      x: 100 + expectedX,
      z: -50 + halfD,
    })
  })

  it('mates with a corridor port placed at the same world anchor', () => {
    // Room south entrance at world (0, -halfD). To mate, a corridor's N
    // port must sit at the same XZ. A `cross` corridor's N port sits at
    // (centre.x, centre.z + halfZ_extent) so place the corridor centre
    // at (0, -halfD - halfZ_extent).
    const halfD = (room.depth * ROOM_TILE_SIZE) / 2
    const corridor: CorridorNode = {
      id: 'c1',
      kind: 'cross',
      anchor: { x: 0, z: -halfD - CORRIDOR_HALF_EXTENTS.cross.z },
    }
    const entrance: EntranceSpec = { side: 'S', index: 1, prompt: '', event: '' }
    // The entrance is at index 1 → not at x=0. Move the corridor to match.
    const entranceAnchor = roomEntranceWorldAnchor(room, entrance)
    corridor.anchor = {
      x: entranceAnchor.anchor.x,
      z: entranceAnchor.anchor.z - CORRIDOR_HALF_EXTENTS.cross.z,
    }
    const corridorPort = corridorPortWorldAnchor(corridor, 'N')
    expect(corridorPort).not.toBeNull()
    expect(portsMate(entranceAnchor, corridorPort!)).toBe(true)
  })
})

describe('bbox helpers', () => {
  it('roomBBox returns the AABB around the room anchor', () => {
    const room: RoomSpec = { id: 'r', width: 3, depth: 2, anchor: { x: 10, z: -5 } }
    const halfW = (3 * ROOM_TILE_SIZE) / 2
    const halfD = (2 * ROOM_TILE_SIZE) / 2
    expect(roomBBox(room)).toEqual({
      id: 'r',
      minX: 10 - halfW,
      maxX: 10 + halfW,
      minZ: -5 - halfD,
      maxZ: -5 + halfD,
    })
  })

  it('roomBBox swaps X/Z when yaw is odd', () => {
    const room: RoomSpec = { id: 'r', width: 3, depth: 2, anchor: { x: 0, z: 0 }, yaw: 1 }
    const halfW = (3 * ROOM_TILE_SIZE) / 2
    const halfD = (2 * ROOM_TILE_SIZE) / 2
    // X half-extent comes from depth tiles after the 90° rotation.
    expect(roomBBox(room).maxX - roomBBox(room).minX).toBeCloseTo(2 * halfD)
    expect(roomBBox(room).maxZ - roomBBox(room).minZ).toBeCloseTo(2 * halfW)
  })

  it('corridorBBox sizes from the piece kind and swaps on odd yaw', () => {
    const node: CorridorNode = { id: 'c', kind: 'window', anchor: { x: 0, z: 0 } }
    const bbox = corridorBBox(node)
    expect(bbox.maxX - bbox.minX).toBeCloseTo(2 * CORRIDOR_HALF_EXTENTS.window.x)
    expect(bbox.maxZ - bbox.minZ).toBeCloseTo(2 * CORRIDOR_HALF_EXTENTS.window.z)

    const rotated: CorridorNode = { ...node, yaw: 1 }
    const rbbox = corridorBBox(rotated)
    expect(rbbox.maxX - rbbox.minX).toBeCloseTo(2 * CORRIDOR_HALF_EXTENTS.window.z)
    expect(rbbox.maxZ - rbbox.minZ).toBeCloseTo(2 * CORRIDOR_HALF_EXTENTS.window.x)
  })

  it('bboxOverlapsInterior accepts edge-only touching as non-overlap', () => {
    const a = { id: 'a', minX: 0, maxX: 5, minZ: 0, maxZ: 5 }
    const b = { id: 'b', minX: 5, maxX: 10, minZ: 0, maxZ: 5 }
    expect(bboxOverlapsInterior(a, b)).toBe(false)
  })

  it('bboxOverlapsInterior detects positive-area interior overlap', () => {
    const a = { id: 'a', minX: 0, maxX: 5, minZ: 0, maxZ: 5 }
    const b = { id: 'b', minX: 4, maxX: 10, minZ: 4, maxZ: 10 }
    expect(bboxOverlapsInterior(a, b)).toBe(true)
  })
})

describe('validateLayout', () => {
  it('rejects a room entrance whose index is out of range', () => {
    const layout: StationLayout = {
      rooms: [
        {
          id: 'r1',
          width: 3,
          depth: 3,
          anchor: { x: 0, z: 0 },
          entrances: [{ side: 'N', index: 5, prompt: '', event: '' }],
        },
      ],
      corridors: [],
    }
    expect(() => validateLayout(layout)).toThrow(/out of range/)
  })

  it('rejects two entrances at the same slot on the same room', () => {
    const layout: StationLayout = {
      rooms: [
        {
          id: 'r1',
          width: 3,
          depth: 3,
          anchor: { x: 0, z: 0 },
          entrances: [
            { side: 'S', index: 1, prompt: '', event: '' },
            { side: 'S', index: 1, prompt: '', event: '' },
          ],
        },
      ],
      corridors: [],
    }
    expect(() => validateLayout(layout)).toThrow(/two entrances at slot/)
  })

  it('rejects a corridor port declared on a closed native side', () => {
    const layout: StationLayout = {
      rooms: [],
      corridors: [
        {
          id: 'c1',
          kind: 'corner',
          anchor: { x: 0, z: 0 },
          ports: { N: { kind: 'sealed' } }, // corner has S+W natively; N is the window wall
        },
      ],
    }
    expect(() => validateLayout(layout)).toThrow(/no opening/)
  })

  it('rejects an entrance target pointing at a non-existent corridor', () => {
    const layout: StationLayout = {
      rooms: [
        {
          id: 'r1',
          width: 3,
          depth: 3,
          anchor: { x: 0, z: 0 },
          entrances: [
            {
              side: 'S',
              index: 1,
              prompt: '',
              event: '',
              target: { kind: 'corridor', nodeId: 'nope', worldSide: 'N' },
            },
          ],
        },
      ],
      corridors: [],
    }
    expect(() => validateLayout(layout)).toThrow(/unknown corridor/)
  })

  it('rejects a corridor↔room edge where reciprocity disagrees', () => {
    // Room thinks it connects to corridor's N port, but the corridor's
    // N port points at a *different* room.
    const layout: StationLayout = {
      rooms: [
        {
          id: 'r1',
          width: 3,
          depth: 3,
          anchor: { x: 0, z: -ROOM_TILE_SIZE * 1.5 - CORRIDOR_HALF_EXTENTS.cross.z },
          entrances: [
            {
              side: 'N',
              index: 1,
              prompt: '',
              event: '',
              target: { kind: 'corridor', nodeId: 'c1', worldSide: 'S' },
            },
          ],
        },
      ],
      corridors: [
        {
          id: 'c1',
          kind: 'cross',
          anchor: { x: 0, z: 0 },
          ports: {
            S: { kind: 'room', roomId: 'r1', entranceIndex: 99 }, // wrong index
          },
        },
      ],
    }
    expect(() => validateLayout(layout)).toThrow(/reciprocal mismatch/)
  })

  it('rejects two pieces whose bounding boxes overlap in volume', () => {
    // Two rooms placed on top of each other.
    const layout: StationLayout = {
      rooms: [
        { id: 'r1', width: 3, depth: 3, anchor: { x: 0, z: 0 } },
        { id: 'r2', width: 3, depth: 3, anchor: { x: 1, z: 1 } },
      ],
      corridors: [],
    }
    expect(() => validateLayout(layout)).toThrow(/overlapping bounding boxes/)
  })

  it('rejects a corridor↔corridor edge whose anchors do not line up', () => {
    // c1's E port mates with c2's W port — but c2 is placed too far
    // away, so geometric mating fails even though reciprocity is fine.
    const layout: StationLayout = {
      rooms: [],
      corridors: [
        {
          id: 'c1',
          kind: 'cross',
          anchor: { x: 0, z: 0 },
          ports: { E: { kind: 'corridor', nodeId: 'c2', worldSide: 'W' } },
        },
        {
          id: 'c2',
          kind: 'cross',
          anchor: { x: 100, z: 0 }, // way too far
          ports: { W: { kind: 'corridor', nodeId: 'c1', worldSide: 'E' } },
        },
      ],
    }
    expect(() => validateLayout(layout)).toThrow(/does not geometrically mate/)
  })

  it('accepts a well-formed corridor↔room layout', () => {
    // Room sits south of a cross corridor. The room's N entrance world
    // anchor must coincide with the corridor's S port world anchor.
    const halfRoomD = (3 * ROOM_TILE_SIZE) / 2
    const corridorZ = halfRoomD + CORRIDOR_HALF_EXTENTS.cross.z
    const layout: StationLayout = {
      rooms: [
        {
          id: 'r1',
          width: 3,
          depth: 3,
          anchor: { x: 0, z: 0 },
          entrances: [
            {
              side: 'N',
              index: 1,
              prompt: '',
              event: '',
              target: { kind: 'corridor', nodeId: 'c1', worldSide: 'S' },
            },
          ],
        },
      ],
      corridors: [
        {
          id: 'c1',
          kind: 'cross',
          // index 1 of width=3 → centred (col offset 0), so corridor sits on x=0.
          anchor: { x: 0, z: corridorZ },
          ports: { S: { kind: 'room', roomId: 'r1', entranceIndex: 0 } },
        },
      ],
    }
    expect(() => validateLayout(layout)).not.toThrow()
  })
})

describe('resolveLayout', () => {
  it('emits one record per room + corridor in declaration order', () => {
    const layout: StationLayout = {
      rooms: [{ id: 'r1', width: 4, depth: 3, anchor: { x: 0, z: 0 } }],
      corridors: [
        {
          id: 'c1',
          kind: 'cross',
          // Isolated pieces — no edges, so no reciprocity required.
          anchor: { x: 50, z: 50 },
          ports: {},
        },
      ],
    }
    expect(resolveLayout(layout)).toEqual([
      { id: 'r1', kind: 'room', anchor: { x: 0, z: 0 }, yaw: 0 },
      { id: 'c1', kind: 'cross', anchor: { x: 50, z: 50 }, yaw: 0 },
    ])
  })

  it('runs validation and surfaces its errors', () => {
    const layout: StationLayout = {
      rooms: [],
      corridors: [
        {
          id: 'c1',
          kind: 'corner',
          anchor: { x: 0, z: 0 },
          ports: { N: { kind: 'sealed' } }, // N is the window wall on a corner
        },
      ],
    }
    expect(() => resolveLayout(layout)).toThrow(/no opening/)
  })
})
