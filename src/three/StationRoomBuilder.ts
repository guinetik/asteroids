/**
 * Parametric station room built from the modular hallway asset pack.
 *
 * A room of size `(width × depth)` (counted in wall pieces along each
 * axis) is assembled from three pieces:
 *
 * - `roof_entrance.glb` — used twice per tile cell: once as a floor
 *   (flat face up) and once as a ceiling (structured face down). The
 *   asset's default orientation already puts the flat face on +Y, so no
 *   rotation is needed for either role; only the Y position differs.
 * - `wall.glb` — placed around the perimeter, rotated 90° around Y on
 *   the north/south edges so its long axis aligns with X.
 *
 * The room is centred on the XZ origin with the floor surface at `y = 0`
 * and the ceiling at `y = WALL_HEIGHT`.
 *
 * @author guinetik
 * @date 2026-05-13
 */
import { Group, Vector3 } from 'three'
import { loadGLB } from '@/three/loadGLB'
import { StationEntrance, type EntranceSpec } from '@/three/StationEntrance'

/** Path to the wall piece GLB. */
const WALL_URL = '/models/station/pieces/wall.glb'
/** Path to the floor/ceiling tile piece GLB. */
const TILE_URL = '/models/station/pieces/roof_entrance.glb'
/** Path to the column / corner piece GLB. */
const CORNER_URL = '/models/station/pieces/corner.glb'
/** Path to the specialised entrance wall piece (wall with door hole). */
const ENTRANCE_URL = '/models/station/pieces/entrance.glb'
/** Path to the door piece that fits the entrance hole. */
const DOOR_URL = '/models/station/pieces/door.glb'

/**
 * Floor/ceiling tile pitch in world units. The asset's bounding box is
 * ~4.40 m wide but the visible flat top is smaller — its structured
 * underside hangs outside the slab. Placing tiles at 4.0 m overlaps the
 * underhang (hidden below the floor) and lets the slab tops abut cleanly,
 * matching the seamless look in the source pack demo.
 */
const TILE_SIZE = 3.85
/** Floor/ceiling tile half-thickness along Y (asset is ~1.06 m thick). */
const TILE_HALF_THICK = 0.53
/**
 * Vertical raise applied to the floor tile so its visible top covers the
 * wall's dark base trim (small black notches between the panel and the
 * ground). Adjust until the floor surface meets the wall just below the
 * `B1` panel.
 */
const FLOOR_RAISE = 0.25
/** Wall piece height in world units. */
const WALL_HEIGHT = 2.93
/** Wall piece half-thickness along its short axis. */
const WALL_HALF_THICK = 0.79
/** Corner piece half-height along Y (asset spans ~2.86 m tall). */
const CORNER_HALF_HEIGHT = 1.43
/**
 * Extra overlap above the ceiling plane the top-storey corner stretches
 * into, so the column tip seats into the ceiling structure and no light
 * can leak past the slab edge.
 */
const CORNER_TOP_BLEED = 0.1
/** Corner piece push-out distance from the floor edge along each axis. */
const CORNER_HALF_BASE = -0.1
/**
 * Extra outward push-out applied to every storey above the ground floor.
 * Compensates for the upper-storey walls (which are flipped 180°) sitting
 * a hair closer to the room interior than the corner column expects.
 */
const CORNER_UPPER_STOREY_PUSH = 0.5
/**
 * Downward offset applied to every storey above the ground floor so the
 * upper-storey corner overlaps the storey below it a touch — hides the
 * thin horizontal seam between stacked corner pieces.
 */
const CORNER_UPPER_STOREY_DROP = 0.29
/**
 * Extra yaw applied to every corner instance because the asset's natural
 * forward direction (column-body side) loaded backwards in the GLB
 * viewer. Tune in 90° steps if the column ends up pointing the wrong way.
 */
const CORNER_BASE_YAW = Math.PI
/**
 * Ceiling tile centre Y. The default ceiling tile has its structured
 * (`B1`-side) face on −Y; placing the tile centre at the wall top so the
 * structured half overlaps the upper portion of the wall hides the seam
 * and keeps pipes visible inside the room.
 */
const CEILING_CENTER_Y = WALL_HEIGHT

/**
 * Extra yaw applied to every entrance instance so the door-hole face
 * points into the room. The entrance asset's long axis is X (vs wall's
 * Z), so it lines up on N/S sides at 0° and on E/W sides at ±90° — this
 * constant handles any 180° flip needed beyond that base mapping.
 */
const ENTRANCE_BASE_YAW = 0
/**
 * Local-frame Y offset applied to the door child so it sits in the
 * entrance's hole with its bottom near the floor. Tune empirically once
 * the entrance is on screen.
 */
const DOOR_LOCAL_Y = -0.1
/**
 * Local-frame Z offset applied to the door child. Negative pushes the
 * door deeper into the entrance frame (away from the room interior).
 */
const DOOR_LOCAL_Z = -0.55
/**
 * Hinge offset from door centre along local X (door bbox half-width is
 * ~0.65 m). The door swings around this edge.
 */
const DOOR_HINGE_OFFSET_X = -0.65
/**
 * Outward push applied to entrance slots so the frame sits flush with
 * the surrounding wall surface rather than extruding into the room.
 * Positive values move the entrance further away from the room interior
 * along the side's outward normal.
 */
const ENTRANCE_PUSH = 0.85
/** Vertical raise applied to entrance slots, in addition to the storey wallY. */
const ENTRANCE_RAISE = 0.2
/**
 * Outward distance (measured from the room edge along the entrance side's
 * normal) where the porch floor tile is dropped. Lets the player step out
 * onto solid floor when looking through the open door.
 */
const ENTRANCE_PORCH_OFFSET = TILE_SIZE / 2

/** Specification for the room to be generated. */
export interface StationRoomLayout {
  /** Number of wall pieces along the X axis. */
  width: number
  /** Number of wall pieces along the Z axis. */
  depth: number
  /** Number of wall pieces stacked vertically (defaults to 1). */
  height?: number
  /** Entrance slots that replace plain walls with `entrance.glb` + door. */
  entrances?: EntranceSpec[]
}

/** Result of {@link buildStationRoom}. */
export interface StationRoom {
  /** Root group containing every floor/ceiling/wall instance. */
  group: Group
  /** Tile count along X (echoes the requested width). */
  width: number
  /** Tile count along Z (echoes the requested depth). */
  depth: number
  /** Tile XZ footprint in world units. */
  tileSize: number
  /** Vertical distance between floor surface and ceiling bottom. */
  wallHeight: number
  /** Number of wall pieces stacked vertically. */
  stackHeight: number
  /** Total interior height (wallHeight × stackHeight). */
  roomHeight: number
  /** Inner-room half extent along X (floor-edge X). */
  halfWidth: number
  /** Inner-room half extent along Z (floor-edge Z). */
  halfDepth: number
  /** Runtime entrance instances the controller iterates each tick. */
  entrances: StationEntrance[]
}

/**
 * Load the three station pieces and assemble a parametric room of size
 * `width × depth` tiles, centred on the XZ origin.
 *
 * @param layout - Tile counts along the X (width) and Z (depth) axes.
 * @returns Built room with its root group and final dimensions.
 */
export async function buildStationRoom(layout: StationRoomLayout): Promise<StationRoom> {
  const entranceSpecs = layout.entrances ?? []
  const needsEntrance = entranceSpecs.length > 0

  const [wallSrc, tileSrc, cornerSrc, entranceSrc, doorSrc] = await Promise.all([
    loadGLB(WALL_URL),
    loadGLB(TILE_URL),
    loadGLB(CORNER_URL),
    needsEntrance ? loadGLB(ENTRANCE_URL) : Promise.resolve(null),
    needsEntrance ? loadGLB(DOOR_URL) : Promise.resolve(null),
  ])

  const { width, depth } = layout
  const stackHeight = Math.max(1, layout.height ?? 1)
  const roomHeight = WALL_HEIGHT * stackHeight
  const halfWidth = (width * TILE_SIZE) / 2
  const halfDepth = (depth * TILE_SIZE) / 2

  const group = new Group()
  group.name = 'StationRoom'

  /** Fast lookup: `${side}:${index}:${storey}` → spec. */
  const entranceLookup = new Map<string, EntranceSpec>()
  for (const spec of entranceSpecs) {
    entranceLookup.set(`${spec.side}:${spec.index}:${spec.storey ?? 0}`, spec)
  }
  const entrances: StationEntrance[] = []

  // Floor + ceiling tiles. Default orientation already puts the flat
  // face on +Y, so both roles share the same rotation.
  for (let col = 0; col < width; col++) {
    for (let row = 0; row < depth; row++) {
      const x = (col - (width - 1) / 2) * TILE_SIZE
      const z = (row - (depth - 1) / 2) * TILE_SIZE

      const floor = tileSrc.clone(true)
      floor.position.set(x, -TILE_HALF_THICK + FLOOR_RAISE, z)
      group.add(floor)

      const ceiling = tileSrc.clone(true)
      ceiling.position.set(x, CEILING_CENTER_Y + (stackHeight - 1) * WALL_HEIGHT, z)
      group.add(ceiling)
    }
  }

  // Stack `stackHeight` wall pieces vertically. Storey 0 has the
  // detailed (`B1`) face pointing into the room; every storey above
  // gets an extra 180° around Y so the plain side faces in — this
  // hides the seam where two `B1` panels would otherwise meet and
  // breaks the visual repetition.
  for (let storey = 0; storey < stackHeight; storey++) {
    const wallY = WALL_HEIGHT / 2 + storey * WALL_HEIGHT
    const upperFlip = storey === 0 ? 0 : Math.PI

    /**
     * Place either a plain wall or an entrance slot at the given side
     * + index for the current storey. Centralises the entrance lookup
     * so every perimeter side branches the same way.
     */
    const placeSlot = (
      side: 'N' | 'S' | 'E' | 'W',
      index: number,
      x: number,
      z: number,
      wallYaw: number,
      entranceYaw: number,
    ): void => {
      const spec = entranceLookup.get(`${side}:${index}:${storey}`)
      if (spec && entranceSrc && doorSrc) {
        // Push the entrance outward along the side's normal so the frame
        // sits flush with the surrounding wall rather than poking into
        // the room. South/North push along Z, East/West along X — sign
        // matches the slot's outward normal.
        const pushX = side === 'E' ? ENTRANCE_PUSH : side === 'W' ? -ENTRANCE_PUSH : 0
        const pushZ = side === 'N' ? ENTRANCE_PUSH : side === 'S' ? -ENTRANCE_PUSH : 0

        // Porch floor — one extra floor tile just outside the door so
        // the player sees solid floor through the open hatch instead of
        // an empty void. Only emitted on the ground storey.
        if (storey === 0) {
          const porchOutX =
            side === 'E' ? halfWidth + ENTRANCE_PORCH_OFFSET
            : side === 'W' ? -halfWidth - ENTRANCE_PORCH_OFFSET
            : x
          const porchOutZ =
            side === 'N' ? halfDepth + ENTRANCE_PORCH_OFFSET
            : side === 'S' ? -halfDepth - ENTRANCE_PORCH_OFFSET
            : z
          const porch = tileSrc.clone(true)
          porch.position.set(porchOutX, -TILE_HALF_THICK + FLOOR_RAISE, porchOutZ)
          group.add(porch)
        }

        const slot = new Group()
        slot.position.set(x + pushX, wallY + ENTRANCE_RAISE, z + pushZ)
        slot.rotation.y = entranceYaw + ENTRANCE_BASE_YAW
        const entrance = entranceSrc.clone(true)
        slot.add(entrance)

        // Door wrapped in a hinge group whose origin sits on the door's
        // edge so `hinge.rotation.y` swings the door around that edge
        // instead of spinning it about its centre.
        const hinge = new Group()
        hinge.position.set(DOOR_HINGE_OFFSET_X, DOOR_LOCAL_Y, DOOR_LOCAL_Z)
        const door = doorSrc.clone(true)
        door.position.set(-DOOR_HINGE_OFFSET_X, 0, 0)
        hinge.add(door)
        slot.add(hinge)
        group.add(slot)
        entrances.push(
          new StationEntrance(
            slot,
            new Vector3(x + pushX, wallY + ENTRANCE_RAISE, z + pushZ),
            spec.prompt,
            spec.event,
            hinge,
            spec.openStyle ?? 'full',
          ),
        )
        return
      }
      const wall = wallSrc.clone(true)
      wall.position.set(x, wallY, z)
      wall.rotation.y = wallYaw
      group.add(wall)
    }

    // North + south walls (run along X).
    for (let col = 0; col < width; col++) {
      const x = (col - (width - 1) / 2) * TILE_SIZE
      placeSlot('S', col, x, -halfDepth - WALL_HALF_THICK, -Math.PI / 2 + upperFlip, 0)
      placeSlot('N', col, x, halfDepth + WALL_HALF_THICK, Math.PI / 2 + upperFlip, Math.PI)
    }

    // East + west walls (run along Z).
    for (let row = 0; row < depth; row++) {
      const z = (row - (depth - 1) / 2) * TILE_SIZE
      placeSlot('W', row, -halfWidth - WALL_HALF_THICK, z, upperFlip, Math.PI / 2)
      placeSlot('E', row, halfWidth + WALL_HALF_THICK, z, Math.PI + upperFlip, -Math.PI / 2)
    }

    // Four corner columns per storey. Each corner is placed just outside
    // the floor bounds so its column body fills the gap between the two
    // perpendicular wall rows. Per-corner yaw rotates the L-shape so its
    // inside angle faces back into the room.
    const corners: ReadonlyArray<{ sx: number; sz: number; yaw: number }> = [
      { sx: -1, sz: -1, yaw: 0 },
      { sx: 1, sz: -1, yaw: -Math.PI / 2 },
      { sx: 1, sz: 1, yaw: Math.PI },
      { sx: -1, sz: 1, yaw: Math.PI / 2 },
    ]
    const cornerPush = CORNER_HALF_BASE + storey * CORNER_UPPER_STOREY_PUSH
    const baseCornerY = wallY - storey * CORNER_UPPER_STOREY_DROP
    // For the topmost storey, stretch the corner upward so its tip seats
    // into the ceiling and no light leaks past the slab edge. Bottom of
    // the corner stays where it was so the overlap with the storey below
    // is preserved.
    const isTopStorey = storey === stackHeight - 1
    const cornerBottomY = baseCornerY - CORNER_HALF_HEIGHT
    const cornerTopTarget = isTopStorey
      ? roomHeight + CORNER_TOP_BLEED
      : baseCornerY + CORNER_HALF_HEIGHT
    const stretchedHeight = cornerTopTarget - cornerBottomY
    const cornerScaleY = stretchedHeight / (CORNER_HALF_HEIGHT * 2)
    const cornerY = (cornerBottomY + cornerTopTarget) / 2

    for (const { sx, sz, yaw } of corners) {
      const corner = cornerSrc.clone(true)
      corner.position.set(sx * (halfWidth + cornerPush), cornerY, sz * (halfDepth + cornerPush))
      corner.rotation.y = yaw + CORNER_BASE_YAW
      corner.scale.y = cornerScaleY
      group.add(corner)
    }
  }

  return {
    group,
    width,
    depth,
    tileSize: TILE_SIZE,
    wallHeight: WALL_HEIGHT,
    stackHeight,
    roomHeight,
    halfWidth,
    halfDepth,
    entrances,
  }
}
