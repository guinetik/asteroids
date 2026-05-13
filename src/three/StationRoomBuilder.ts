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
import { Group } from 'three'
import { loadGLB } from '@/three/loadGLB'

/** Path to the wall piece GLB. */
const WALL_URL = '/models/station/pieces/wall.glb'
/** Path to the floor/ceiling tile piece GLB. */
const TILE_URL = '/models/station/pieces/roof_entrance.glb'
/** Path to the column / corner piece GLB. */
const CORNER_URL = '/models/station/pieces/corner.glb'

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

/** Specification for the room to be generated. */
export interface StationRoomLayout {
  /** Number of wall pieces along the X axis. */
  width: number
  /** Number of wall pieces along the Z axis. */
  depth: number
  /** Number of wall pieces stacked vertically (defaults to 1). */
  height?: number
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
}

/**
 * Load the three station pieces and assemble a parametric room of size
 * `width × depth` tiles, centred on the XZ origin.
 *
 * @param layout - Tile counts along the X (width) and Z (depth) axes.
 * @returns Built room with its root group and final dimensions.
 */
export async function buildStationRoom(layout: StationRoomLayout): Promise<StationRoom> {
  const [wallSrc, tileSrc, cornerSrc] = await Promise.all([
    loadGLB(WALL_URL),
    loadGLB(TILE_URL),
    loadGLB(CORNER_URL),
  ])

  const { width, depth } = layout
  const stackHeight = Math.max(1, layout.height ?? 1)
  const roomHeight = WALL_HEIGHT * stackHeight
  const halfWidth = (width * TILE_SIZE) / 2
  const halfDepth = (depth * TILE_SIZE) / 2

  const group = new Group()
  group.name = 'StationRoom'

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

    // North + south walls (run along X).
    for (let col = 0; col < width; col++) {
      const x = (col - (width - 1) / 2) * TILE_SIZE

      const wallSouth = wallSrc.clone(true)
      wallSouth.position.set(x, wallY, -halfDepth - WALL_HALF_THICK)
      wallSouth.rotation.y = -Math.PI / 2 + upperFlip
      group.add(wallSouth)

      const wallNorth = wallSrc.clone(true)
      wallNorth.position.set(x, wallY, halfDepth + WALL_HALF_THICK)
      wallNorth.rotation.y = Math.PI / 2 + upperFlip
      group.add(wallNorth)
    }

    // East + west walls (run along Z).
    for (let row = 0; row < depth; row++) {
      const z = (row - (depth - 1) / 2) * TILE_SIZE

      const wallWest = wallSrc.clone(true)
      wallWest.position.set(-halfWidth - WALL_HALF_THICK, wallY, z)
      wallWest.rotation.y = upperFlip
      group.add(wallWest)

      const wallEast = wallSrc.clone(true)
      wallEast.position.set(halfWidth + WALL_HALF_THICK, wallY, z)
      wallEast.rotation.y = Math.PI + upperFlip
      group.add(wallEast)
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
    const cornerTopTarget = isTopStorey ? roomHeight + CORNER_TOP_BLEED : baseCornerY + CORNER_HALF_HEIGHT
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
  }
}
