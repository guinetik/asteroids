/**
 * Loader for the data-driven station-interior level format. Validates the
 * JSON, computes collider geometry (floor rects + wall AABBs with openings
 * removed), and builds a Three.js group of room meshes + the exit hatch.
 *
 * @author guinetik
 * @date 2026-05-12
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */
import * as THREE from 'three'
import type {
  OpeningWall,
  StationLevelJson,
  StationMaterialJson,
  StationOpeningJson,
  StationRoomJson,
} from './types'
import {
  StationCollider,
  type StationFloor,
  type StationWallAabb,
} from './StationCollider'

/** Wall thickness used when generating AABBs and box-geometry meshes. */
const WALL_THICKNESS = 0.2

/** Wall height used for box-geometry meshes. */
const WALL_MESH_HEIGHT = 3

/** Floor mesh roughness for the standard material. */
const FLOOR_ROUGHNESS = 0.85

/** Ceiling mesh roughness for the standard material. */
const CEILING_ROUGHNESS = 0.9

/** Wall mesh tint applied to every wall box-geometry. */
const WALL_MESH_TINT = 0x5a4a3e

/** Minimum dimension passed to BoxGeometry so degenerate walls do not crash. */
const MIN_BOX_DIM = 0.01

/** Result of {@link buildStationColliderGeometry}. */
export interface StationColliderGeometry {
  /** Floor rectangles, one per room. */
  floors: StationFloor[]
  /** Wall AABBs with openings removed. */
  walls: StationWallAabb[]
}

/** Built level returned by {@link loadStationLevel}. */
export interface StationLevel {
  /** Root Three.js group containing every mesh. */
  group: THREE.Group
  /** Collider for player movement. */
  collider: StationCollider
  /** World-space spawn position. */
  spawnPos: THREE.Vector3
  /** Spawn yaw (radians, 0 = facing +Z). */
  spawnYaw: number
  /** World-space hatch centre. */
  hatchPos: THREE.Vector3
  /** Hatch yaw (radians, 0 = facing +Z). The hatch faces into the room. */
  hatchYaw: number
}

/**
 * Throw if the level is structurally invalid. Catches the bugs that JSON
 * editors are most likely to introduce: missing rooms, lopsided openings,
 * dangling material keys.
 *
 * @param level - Parsed JSON.
 */
export function validateStationLevel(level: StationLevelJson): void {
  const roomIds = new Set(level.rooms.map((r) => r.id))

  // Hatch room exists.
  if (!roomIds.has(level.exitHatch.room)) {
    throw new Error(`exitHatch.room "${level.exitHatch.room}" is not a known room`)
  }

  // Spawn room exists.
  if (!roomIds.has(level.spawn.room)) {
    throw new Error(`spawn.room "${level.spawn.room}" is not a known room`)
  }

  for (const room of level.rooms) {
    // Material key exists.
    if (!level.materials[room.material]) {
      throw new Error(`room "${room.id}" references unknown material "${room.material}"`)
    }
    for (const op of room.openings) {
      // Target room exists.
      if (!roomIds.has(op.to)) {
        throw new Error(`room "${room.id}" opening leads to unknown room "${op.to}"`)
      }
      // Mirror exists in the target room.
      const target = level.rooms.find((r) => r.id === op.to)!
      const oppositeWall = oppositeOf(op.wall)
      const mirrored = target.openings.find(
        (o) => o.to === room.id && o.wall === oppositeWall && o.width === op.width,
      )
      if (!mirrored) {
        throw new Error(
          `opening from "${room.id}" to "${op.to}" is not mirrored back on the "${oppositeWall}" wall of "${op.to}"`,
        )
      }
    }
  }
}

/**
 * Compute floor rectangles and wall AABBs with openings removed.
 * Each wall is split into 0–2 segments around the cumulative span of any
 * openings on that wall.
 *
 * @param level - Validated JSON.
 * @returns Floor rectangles and wall AABBs in world space.
 */
export function buildStationColliderGeometry(level: StationLevelJson): StationColliderGeometry {
  const floors: StationFloor[] = []
  const walls: StationWallAabb[] = []

  for (const room of level.rooms) {
    const [w, , d] = room.size
    const [ox, oy, oz] = room.origin
    const minX = ox
    const maxX = ox + w
    const minZ = oz
    const maxZ = oz + d

    floors.push({ minX, maxX, minZ, maxZ, y: oy })

    for (const wall of ['+x', '-x', '+z', '-z'] as const) {
      const openings = room.openings.filter((o) => o.wall === wall)
      walls.push(...wallSegmentsForWall(room, wall, openings))
    }
  }

  return { floors, walls }
}

/** Return the wall on the opposite side of the room. */
function oppositeOf(w: OpeningWall): OpeningWall {
  if (w === '+x') return '-x'
  if (w === '-x') return '+x'
  if (w === '+z') return '-z'
  return '+z'
}

/**
 * Split one room wall into 0–2 wall AABBs based on the openings on it.
 * Wall thickness is added so the segment becomes a thin AABB rather than a
 * zero-volume plane.
 */
function wallSegmentsForWall(
  room: StationRoomJson,
  wall: OpeningWall,
  openings: StationOpeningJson[],
): StationWallAabb[] {
  const [w, , d] = room.size
  const [ox, , oz] = room.origin

  // Coordinates of the wall plane and its perpendicular span.
  let plane: number
  let perpMin: number
  let perpMax: number
  const axisIsX = wall === '+x' || wall === '-x'
  if (wall === '+x') {
    plane = ox + w
    perpMin = oz
    perpMax = oz + d
  } else if (wall === '-x') {
    plane = ox
    perpMin = oz
    perpMax = oz + d
  } else if (wall === '+z') {
    plane = oz + d
    perpMin = ox
    perpMax = ox + w
  } else {
    plane = oz
    perpMin = ox
    perpMax = ox + w
  }

  // Sort openings by their start along the wall and build covered intervals
  // in the perpendicular axis. `offset` is centre-from-wall-centre.
  const wallCenter = (perpMin + perpMax) / 2
  const intervals = openings
    .map((o) => {
      const c = wallCenter + o.offset
      return { min: c - o.width / 2, max: c + o.width / 2 }
    })
    .sort((a, b) => a.min - b.min)

  // Walk the wall from perpMin to perpMax, emitting segments between
  // intervals. Each emitted segment becomes a thin AABB on the wall plane.
  const segments: { min: number; max: number }[] = []
  let cursor = perpMin
  for (const iv of intervals) {
    if (iv.min > cursor) segments.push({ min: cursor, max: iv.min })
    cursor = Math.max(cursor, iv.max)
  }
  if (cursor < perpMax) segments.push({ min: cursor, max: perpMax })

  return segments.map((s) => {
    if (axisIsX) {
      return {
        minX: plane - WALL_THICKNESS / 2,
        maxX: plane + WALL_THICKNESS / 2,
        minZ: s.min,
        maxZ: s.max,
      }
    }
    return {
      minX: s.min,
      maxX: s.max,
      minZ: plane - WALL_THICKNESS / 2,
      maxZ: plane + WALL_THICKNESS / 2,
    }
  })
}

/**
 * Build a Three.js group of meshes for the level: floor, ceiling, and the
 * wall AABBs (drawn as box geometry) per room, plus per-room ambient tint.
 * The actual exit-hatch mesh is owned by `StationHatchController` and is
 * added to the scene separately by the view controller.
 *
 * @param level - Validated JSON.
 * @param geometry - Pre-computed collider geometry.
 * @returns Root group containing every mesh.
 */
export function buildStationMeshes(
  level: StationLevelJson,
  geometry: StationColliderGeometry,
): THREE.Group {
  const group = new THREE.Group()
  group.name = `station:${level.id}`

  for (const room of level.rooms) {
    const mat = level.materials[room.material]!
    group.add(buildRoomFloorMesh(room, mat))
    group.add(buildRoomCeilingMesh(room, mat))
  }

  for (const wall of geometry.walls) {
    group.add(buildWallMesh(wall))
  }

  return group
}

/** Build the horizontal floor plane mesh for one room. */
function buildRoomFloorMesh(room: StationRoomJson, mat: StationMaterialJson): THREE.Mesh {
  const [w, , d] = room.size
  const [ox, oy, oz] = room.origin
  const geo = new THREE.PlaneGeometry(w, d)
  const m = new THREE.MeshStandardMaterial({ color: mat.floor, roughness: FLOOR_ROUGHNESS })
  const mesh = new THREE.Mesh(geo, m)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(ox + w / 2, oy, oz + d / 2)
  mesh.receiveShadow = true
  return mesh
}

/** Build the horizontal ceiling plane mesh for one room. */
function buildRoomCeilingMesh(room: StationRoomJson, mat: StationMaterialJson): THREE.Mesh {
  const [w, h, d] = room.size
  const [ox, oy, oz] = room.origin
  const geo = new THREE.PlaneGeometry(w, d)
  const m = new THREE.MeshStandardMaterial({ color: mat.ceiling, roughness: CEILING_ROUGHNESS })
  const mesh = new THREE.Mesh(geo, m)
  mesh.rotation.x = Math.PI / 2
  mesh.position.set(ox + w / 2, oy + h, oz + d / 2)
  return mesh
}

/** Build a thin box-geometry mesh for one wall AABB. */
function buildWallMesh(wall: StationWallAabb): THREE.Mesh {
  const w = wall.maxX - wall.minX
  const d = wall.maxZ - wall.minZ
  const h = WALL_MESH_HEIGHT
  const geo = new THREE.BoxGeometry(Math.max(w, MIN_BOX_DIM), h, Math.max(d, MIN_BOX_DIM))
  const m = new THREE.MeshStandardMaterial({ color: WALL_MESH_TINT, roughness: FLOOR_ROUGHNESS })
  const mesh = new THREE.Mesh(geo, m)
  mesh.position.set((wall.minX + wall.maxX) / 2, h / 2, (wall.minZ + wall.maxZ) / 2)
  mesh.castShadow = false
  mesh.receiveShadow = true
  return mesh
}

/**
 * Load a parsed station JSON into a complete `StationLevel`.
 *
 * @param level - Validated JSON.
 * @returns Group, collider, spawn and hatch transforms.
 */
export function loadStationLevel(level: StationLevelJson): StationLevel {
  validateStationLevel(level)
  const geometry = buildStationColliderGeometry(level)
  const collider = new StationCollider(geometry.floors, geometry.walls)
  const group = buildStationMeshes(level, geometry)

  const spawnPos = new THREE.Vector3(level.spawn.pos[0], level.spawn.pos[1], level.spawn.pos[2])
  const hatchRoom = level.rooms.find((r) => r.id === level.exitHatch.room)!
  const hatchPos = hatchAnchorWorldPosition(hatchRoom, level.exitHatch.wall, level.exitHatch.centerY)
  const hatchYaw = hatchFacingYaw(level.exitHatch.wall)

  return { group, collider, spawnPos, spawnYaw: level.spawn.yaw, hatchPos, hatchYaw }
}

/** Compute the world-space centre point of a wall-mounted hatch. */
function hatchAnchorWorldPosition(
  room: StationRoomJson,
  wall: OpeningWall,
  centerY: number,
): THREE.Vector3 {
  const [w, , d] = room.size
  const [ox, oy, oz] = room.origin
  const cx = ox + w / 2
  const cz = oz + d / 2
  if (wall === '+x') return new THREE.Vector3(ox + w, oy + centerY, cz)
  if (wall === '-x') return new THREE.Vector3(ox, oy + centerY, cz)
  if (wall === '+z') return new THREE.Vector3(cx, oy + centerY, oz + d)
  return new THREE.Vector3(cx, oy + centerY, oz)
}

/** Yaw (radians) so a hatch on the given wall faces into the room. */
function hatchFacingYaw(wall: OpeningWall): number {
  // The hatch sits on a wall and faces into the room.
  if (wall === '+x') return -Math.PI / 2
  if (wall === '-x') return Math.PI / 2
  if (wall === '+z') return Math.PI
  return 0
}
