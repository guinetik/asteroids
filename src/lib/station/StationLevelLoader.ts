/**
 * Loader for the cylindrical-room station-interior level format.
 * Validates the JSON, computes collider geometry (room floor AABBs +
 * doorway passage rectangles), and builds a Three.js group of habitat-
 * style meshes (half-cylinder glass canopy + flat deck + D-shaped end
 * caps + wireframe girders) — one per room.
 *
 * Mirrors the visual pattern of {@link HabitatInteriorScene.buildCylinder}
 * and {@link HabitatInteriorScene.buildGirders} from
 * `src/three/HabitatInteriorScene.ts:2580-2692`.
 *
 * @author guinetik
 * @date 2026-05-12
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */
import * as THREE from 'three'
import type {
  StationDoorJson,
  StationDoorWall,
  StationLevelJson,
  StationMaterialJson,
  StationRoomAxis,
  StationRoomJson,
} from './types'
import { StationCollider, type StationFloor, type StationRect } from './StationCollider'

// ---------------------------------------------------------------------------
// Rendering constants — verbatim from the habitat scene.
// ---------------------------------------------------------------------------

/** Y of the walkable deck. All cylinders sit on this plane. */
export const FLOOR_Y = 0
/** Vertical thickness of the deck (world units). Top of the floor box sits at FLOOR_Y. */
export const FLOOR_THICKNESS = 0.12
/** Tint colour of the glass canopy. */
const GLASS_COLOR = 0x88ccff
/** Transparency of the glass canopy (0 = fully transparent, 1 = opaque). */
const GLASS_OPACITY = 0.15
/** Roughness of the glass canopy. */
const GLASS_ROUGHNESS = 0.05
/** Metalness of the glass canopy. */
const GLASS_METALNESS = 0.1
/** Colour of the metallic wireframe girders. */
const GIRDER_COLOR = 0x888888
/** How far inside the cylinder radius the girder rings sit. */
const GIRDER_INSET = 0.05
/** Number of radial segments on each canopy mesh. */
const CYLINDER_RADIAL_SEGMENTS = 24
/** Number of height steps used for the girder rings. */
const GIRDER_SEGMENTS_HEIGHT = 6
/** Number of radial steps per girder arc. */
const GIRDER_SEGMENTS_RADIAL = 12
/** Floor roughness for the standard material. */
const FLOOR_ROUGHNESS = 0.85
/** End-cap roughness for the standard material. */
const CAP_ROUGHNESS = 0.75
/** End-cap metalness for the standard material. */
const CAP_METALNESS = 0.15

// ---------------------------------------------------------------------------
// Geometry helpers — pure math, no Three.js types.
// ---------------------------------------------------------------------------

/** Tolerance (world units) for door-vs-cap and floor-adjacency checks. */
const ADJACENCY_EPSILON = 1e-3
/** Default doorway height when one isn't supplied (sanity fallback). */
const DEFAULT_DOOR_HEIGHT = 2.2
/** Min dimension passed to BoxGeometry so degenerate meshes don't crash. */
const MIN_BOX_DIM = 0.01
/** Thickness (world units) of the passage rectangle straddling a doorway. */
const PASSAGE_DEPTH = 0.6

/** Result of {@link buildStationColliderGeometry}. */
export interface StationColliderGeometry {
  /** Walkable floor rectangle per room. */
  floors: StationFloor[]
  /** Passage rectangles bridging adjacent rooms through each doorway. */
  passages: StationRect[]
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
 * Compute a room's walkable floor footprint in world coordinates.
 * For `axis: 'z'` rooms, the floor is `[centre.x ± R, centre.z ± L/2]`.
 * For `axis: 'x'` rooms, the X and Z extents swap.
 *
 * @param room - Room to compute the floor for.
 * @returns Floor rectangle in world XZ.
 */
export function roomFloorRect(room: StationRoomJson): StationFloor {
  const [cx, , cz] = room.center
  const halfLen = room.length / 2
  if (room.axis === 'z') {
    return {
      minX: cx - room.radius,
      maxX: cx + room.radius,
      minZ: cz - halfLen,
      maxZ: cz + halfLen,
      y: FLOOR_Y,
    }
  }
  return {
    minX: cx - halfLen,
    maxX: cx + halfLen,
    minZ: cz - room.radius,
    maxZ: cz + room.radius,
    y: FLOOR_Y,
  }
}

/**
 * Compute the world-space passage rectangle for a doorway. The rectangle
 * straddles the room's wall plane along that wall's normal so it overlaps
 * both rooms' floor rects (allowing seamless transit).
 *
 * @param room - Parent room.
 * @param door - Doorway on that room.
 * @returns Passage rectangle on the floor plane.
 */
export function doorPassageRect(room: StationRoomJson, door: StationDoorJson): StationRect {
  const floor = roomFloorRect(room)
  const halfW = door.width / 2
  const halfDepth = PASSAGE_DEPTH
  const cx = (floor.minX + floor.maxX) / 2
  const cz = (floor.minZ + floor.maxZ) / 2
  switch (door.wall) {
    case '+xCap':
      // Cap perpendicular to X at maxX. Door is centred on Z=cz.
      return {
        minX: floor.maxX - halfDepth,
        maxX: floor.maxX + halfDepth,
        minZ: cz - halfW,
        maxZ: cz + halfW,
      }
    case '-xCap':
      return {
        minX: floor.minX - halfDepth,
        maxX: floor.minX + halfDepth,
        minZ: cz - halfW,
        maxZ: cz + halfW,
      }
    case '+zCap':
      return {
        minX: cx - halfW,
        maxX: cx + halfW,
        minZ: floor.maxZ - halfDepth,
        maxZ: floor.maxZ + halfDepth,
      }
    case '-zCap':
      return {
        minX: cx - halfW,
        maxX: cx + halfW,
        minZ: floor.minZ - halfDepth,
        maxZ: floor.minZ + halfDepth,
      }
    case '+xCurve':
      // Curved wall on +X side of an axis-'z' cylinder. Floor edge at maxX.
      return {
        minX: floor.maxX - halfDepth,
        maxX: floor.maxX + halfDepth,
        minZ: cz - halfW,
        maxZ: cz + halfW,
      }
    case '-xCurve':
      return {
        minX: floor.minX - halfDepth,
        maxX: floor.minX + halfDepth,
        minZ: cz - halfW,
        maxZ: cz + halfW,
      }
    case '+zCurve':
      // Curved wall on +Z side of an axis-'x' cylinder. Floor edge at maxZ.
      return {
        minX: cx - halfW,
        maxX: cx + halfW,
        minZ: floor.maxZ - halfDepth,
        maxZ: floor.maxZ + halfDepth,
      }
    case '-zCurve':
      return {
        minX: cx - halfW,
        maxX: cx + halfW,
        minZ: floor.minZ - halfDepth,
        maxZ: floor.minZ + halfDepth,
      }
  }
}

/** True iff the wall side is one of the four end caps. */
function isCapWall(wall: StationDoorWall): boolean {
  return wall === '+xCap' || wall === '-xCap' || wall === '+zCap' || wall === '-zCap'
}

/** True iff `wall` is a valid side for a cylinder running along `axis`. */
function wallMatchesAxis(wall: StationDoorWall, axis: StationRoomAxis): boolean {
  if (axis === 'z') {
    return wall === '+zCap' || wall === '-zCap' || wall === '+xCurve' || wall === '-xCurve'
  }
  return wall === '+xCap' || wall === '-xCap' || wall === '+zCurve' || wall === '-zCurve'
}

/** Opposite-side mapping for door mirroring. */
function oppositeWall(wall: StationDoorWall): StationDoorWall {
  switch (wall) {
    case '+xCap': return '-xCap'
    case '-xCap': return '+xCap'
    case '+zCap': return '-zCap'
    case '-zCap': return '+zCap'
    case '+xCurve': return '-xCurve'
    case '-xCurve': return '+xCurve'
    case '+zCurve': return '-zCurve'
    case '-zCurve': return '+zCurve'
  }
}

/**
 * Throw if the level is structurally invalid. Catches the bugs JSON
 * editors are most likely to introduce: missing rooms, mismatched wall
 * sides, lopsided doors, dangling material keys.
 *
 * @param level - Parsed JSON.
 */
export function validateStationLevel(level: StationLevelJson): void {
  const roomIds = new Set(level.rooms.map((r) => r.id))

  if (!roomIds.has(level.exitHatch.room)) {
    throw new Error(`exitHatch.room "${level.exitHatch.room}" is not a known room`)
  }
  if (!isCapWall(level.exitHatch.wall)) {
    throw new Error(`exitHatch.wall "${level.exitHatch.wall}" must be an end cap (+xCap/-xCap/+zCap/-zCap)`)
  }
  if (!roomIds.has(level.spawn.room)) {
    throw new Error(`spawn.room "${level.spawn.room}" is not a known room`)
  }

  for (const room of level.rooms) {
    if (!level.materials[room.material]) {
      throw new Error(`room "${room.id}" references unknown material "${room.material}"`)
    }
    if (room.radius <= 0 || room.length <= 0) {
      throw new Error(`room "${room.id}" must have positive radius and length`)
    }
    for (const door of room.doors) {
      if (!wallMatchesAxis(door.wall, room.axis)) {
        throw new Error(
          `room "${room.id}" door wall "${door.wall}" is invalid for axis "${room.axis}"`,
        )
      }
      if (!roomIds.has(door.to)) {
        throw new Error(`room "${room.id}" door leads to unknown room "${door.to}"`)
      }
      const target = level.rooms.find((r) => r.id === door.to)!
      const mirrorWall = oppositeWall(door.wall)
      const myRect = doorPassageRect(room, door)
      const mirrored = target.doors.find((d) => {
        if (d.to !== room.id) return false
        if (d.width !== door.width) return false
        const theirRect = doorPassageRect(target, d)
        const cxA = (myRect.minX + myRect.maxX) / 2
        const czA = (myRect.minZ + myRect.maxZ) / 2
        const cxB = (theirRect.minX + theirRect.maxX) / 2
        const czB = (theirRect.minZ + theirRect.maxZ) / 2
        // Mirror walls must either match the opposite side OR sit on a
        // compatible adjacent side (cap↔curve when the rooms abut at right
        // angles). We require the passage centres to coincide in world XZ.
        const mirrorMatches = d.wall === mirrorWall || isCapVsCurveMatch(door.wall, d.wall)
        return (
          mirrorMatches &&
          Math.abs(cxA - cxB) <= ADJACENCY_EPSILON &&
          Math.abs(czA - czB) <= ADJACENCY_EPSILON
        )
      })
      if (!mirrored) {
        throw new Error(
          `door from "${room.id}" to "${door.to}" is not mirrored back with matching width and world-space centre`,
        )
      }
    }
  }
}

/**
 * Two door walls match across rooms when their floor-plane normals are
 * collinear and opposite, even if one is a cap and the other is a curve
 * (which happens when one cylinder's end-cap abuts another cylinder's
 * curved wall at right angles).
 */
function isCapVsCurveMatch(a: StationDoorWall, b: StationDoorWall): boolean {
  const pairs: [StationDoorWall, StationDoorWall][] = [
    ['+xCap', '-xCurve'],
    ['-xCap', '+xCurve'],
    ['+xCurve', '-xCap'],
    ['-xCurve', '+xCap'],
    ['+zCap', '-zCurve'],
    ['-zCap', '+zCurve'],
    ['+zCurve', '-zCap'],
    ['-zCurve', '+zCap'],
  ]
  return pairs.some(([x, y]) => x === a && y === b)
}

/**
 * Compute room floor rectangles and per-doorway passage rectangles.
 *
 * @param level - Validated JSON.
 * @returns Floor rects + passage rects in world space.
 */
export function buildStationColliderGeometry(level: StationLevelJson): StationColliderGeometry {
  const floors: StationFloor[] = []
  const passages: StationRect[] = []
  for (const room of level.rooms) {
    floors.push(roomFloorRect(room))
    for (const door of room.doors) {
      passages.push(doorPassageRect(room, door))
    }
  }
  return { floors, passages }
}

// ---------------------------------------------------------------------------
// Mesh builders.
// ---------------------------------------------------------------------------

/**
 * Build a Three.js group of habitat-style meshes for the entire level —
 * one half-cylinder canopy + floor + end caps + girders per room.
 *
 * @param level - Validated JSON.
 * @returns Root group containing every mesh.
 */
export function buildStationMeshes(level: StationLevelJson): THREE.Group {
  const root = new THREE.Group()
  root.name = `station:${level.id}`
  for (const room of level.rooms) {
    const mat = level.materials[room.material]!
    root.add(buildHabitatStyleRoom(room, mat))
  }
  return root
}

/**
 * Build all meshes for a single cylindrical room as a child group.
 *
 * @param room - Room definition.
 * @param mat - Resolved material palette.
 * @returns Group containing the canopy, floor, caps, and girders.
 */
export function buildHabitatStyleRoom(
  room: StationRoomJson,
  mat: StationMaterialJson,
): THREE.Group {
  const group = new THREE.Group()
  group.name = `station-room:${room.id}`
  group.add(buildCanopy(room))
  group.add(buildFloor(room, mat))
  group.add(buildEndCap(room, true, mat))
  group.add(buildEndCap(room, false, mat))
  group.add(buildGirders(room))
  return group
}

/**
 * Half-cylinder glass canopy. Open-ended, top semicircle only, rotated so
 * its axis maps to the room's chosen world axis.
 *
 * @param room - Room definition.
 * @returns Canopy mesh positioned in world space.
 */
function buildCanopy(room: StationRoomJson): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(
    room.radius,
    room.radius,
    room.length,
    CYLINDER_RADIAL_SEGMENTS,
    1,
    true,
    Math.PI / 2,
    Math.PI,
  )
  const matl = new THREE.MeshPhysicalMaterial({
    color: GLASS_COLOR,
    transparent: true,
    opacity: GLASS_OPACITY,
    roughness: GLASS_ROUGHNESS,
    metalness: GLASS_METALNESS,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(geo, matl)
  // Rotate so the cylinder's Y (its axis in local space) maps to world axis.
  if (room.axis === 'z') {
    mesh.rotation.x = Math.PI / 2
  } else {
    mesh.rotation.z = Math.PI / 2
  }
  mesh.position.set(room.center[0], FLOOR_Y, room.center[2])
  return mesh
}

/**
 * Flat floor box spanning the full diameter of the cylinder along its
 * perpendicular axis and its full length along the axis. Top face sits
 * exactly at `FLOOR_Y`.
 *
 * @param room - Room definition.
 * @param mat - Resolved material palette.
 * @returns Floor mesh positioned in world space.
 */
function buildFloor(room: StationRoomJson, mat: StationMaterialJson): THREE.Mesh {
  const width = 2 * room.radius
  let geo: THREE.BoxGeometry
  if (room.axis === 'z') {
    geo = new THREE.BoxGeometry(Math.max(width, MIN_BOX_DIM), FLOOR_THICKNESS, Math.max(room.length, MIN_BOX_DIM))
  } else {
    geo = new THREE.BoxGeometry(Math.max(room.length, MIN_BOX_DIM), FLOOR_THICKNESS, Math.max(width, MIN_BOX_DIM))
  }
  const matl = new THREE.MeshStandardMaterial({
    color: mat.floor,
    roughness: FLOOR_ROUGHNESS,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geo, matl)
  mesh.position.set(room.center[0], FLOOR_Y - FLOOR_THICKNESS / 2, room.center[2])
  mesh.receiveShadow = true
  return mesh
}

/**
 * D-shaped end-cap on one end of the cylinder. Optionally cuts a
 * doorway rectangle when a door is declared on this end.
 *
 * @param room - Room definition.
 * @param isPositiveEnd - True for the cap at +axis (e.g. +zCap), false for −axis.
 * @param mat - Resolved material palette.
 * @returns End-cap mesh positioned + rotated in world space.
 */
function buildEndCap(
  room: StationRoomJson,
  isPositiveEnd: boolean,
  mat: StationMaterialJson,
): THREE.Mesh {
  const r = room.radius
  const shape = new THREE.Shape()
  shape.moveTo(-r, 0)
  shape.absarc(0, 0, r, Math.PI, 0, true)
  shape.lineTo(-r, 0)

  // Punch a door hole if one matches this end.
  const capWall: StationDoorWall =
    room.axis === 'z' ? (isPositiveEnd ? '+zCap' : '-zCap') : isPositiveEnd ? '+xCap' : '-xCap'
  const door = room.doors.find((d) => d.wall === capWall)
  if (door) {
    const halfW = door.width / 2
    const h = door.height > 0 ? door.height : DEFAULT_DOOR_HEIGHT
    const hole = new THREE.Path()
    hole.moveTo(-halfW, 0)
    hole.lineTo(halfW, 0)
    hole.lineTo(halfW, h)
    hole.lineTo(-halfW, h)
    hole.lineTo(-halfW, 0)
    shape.holes.push(hole)
  }

  const geo = new THREE.ShapeGeometry(shape, CYLINDER_RADIAL_SEGMENTS)
  const matl = new THREE.MeshStandardMaterial({
    color: mat.cap,
    roughness: CAP_ROUGHNESS,
    metalness: CAP_METALNESS,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geo, matl)

  // Position + orient the cap in world space.
  const halfLen = room.length / 2
  const [cx, , cz] = room.center
  if (room.axis === 'z') {
    if (isPositiveEnd) {
      mesh.position.set(cx, FLOOR_Y, cz + halfLen)
      mesh.rotation.y = Math.PI
    } else {
      mesh.position.set(cx, FLOOR_Y, cz - halfLen)
    }
  } else {
    if (isPositiveEnd) {
      mesh.position.set(cx + halfLen, FLOOR_Y, cz)
      mesh.rotation.y = -Math.PI / 2
    } else {
      mesh.position.set(cx - halfLen, FLOOR_Y, cz)
      mesh.rotation.y = Math.PI / 2
    }
  }
  return mesh
}

/**
 * Wireframe girder rings on the upper semicircle of the canopy. Mirrors
 * the habitat scene's {@link HabitatInteriorScene.buildGirders} math.
 *
 * @param room - Room definition.
 * @returns LineSegments mesh.
 */
function buildGirders(room: StationRoomJson): THREE.LineSegments {
  const verts: number[] = []
  const r = room.radius - GIRDER_INSET
  const halfLen = room.length / 2
  const [cx, , cz] = room.center
  const axisZ = room.axis === 'z'

  // Horizontal half-circle arcs at each height step (top half only).
  for (let h = 0; h <= GIRDER_SEGMENTS_HEIGHT; h++) {
    const t = -halfLen + (h / GIRDER_SEGMENTS_HEIGHT) * room.length
    for (let s = 0; s < GIRDER_SEGMENTS_RADIAL; s++) {
      const a1 = (s / GIRDER_SEGMENTS_RADIAL) * Math.PI
      const a2 = ((s + 1) / GIRDER_SEGMENTS_RADIAL) * Math.PI
      // (perpendicular, vertical) plane coordinates.
      const p1 = Math.cos(a1) * r
      const v1 = FLOOR_Y + Math.sin(a1) * r
      const p2 = Math.cos(a2) * r
      const v2 = FLOOR_Y + Math.sin(a2) * r
      if (axisZ) {
        verts.push(cx + p1, v1, cz + t, cx + p2, v2, cz + t)
      } else {
        verts.push(cx + t, v1, cz + p1, cx + t, v2, cz + p2)
      }
    }
  }

  // Vertical bars along the axis at each radial step.
  for (let s = 0; s <= GIRDER_SEGMENTS_RADIAL; s++) {
    const a = (s / GIRDER_SEGMENTS_RADIAL) * Math.PI
    const p = Math.cos(a) * r
    const v = FLOOR_Y + Math.sin(a) * r
    for (let h = 0; h < GIRDER_SEGMENTS_HEIGHT; h++) {
      const t1 = -halfLen + (h / GIRDER_SEGMENTS_HEIGHT) * room.length
      const t2 = -halfLen + ((h + 1) / GIRDER_SEGMENTS_HEIGHT) * room.length
      if (axisZ) {
        verts.push(cx + p, v, cz + t1, cx + p, v, cz + t2)
      } else {
        verts.push(cx + t1, v, cz + p, cx + t2, v, cz + p)
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  const matl = new THREE.LineBasicMaterial({ color: GIRDER_COLOR })
  return new THREE.LineSegments(geo, matl)
}

// ---------------------------------------------------------------------------
// Top-level loader.
// ---------------------------------------------------------------------------

/**
 * Load a parsed station JSON into a complete `StationLevel`: meshes,
 * collider, spawn transform, hatch transform.
 *
 * @param level - Parsed and validated JSON.
 * @returns Group, collider, spawn and hatch transforms.
 */
export function loadStationLevel(level: StationLevelJson): StationLevel {
  validateStationLevel(level)
  const geometry = buildStationColliderGeometry(level)
  const collider = new StationCollider(geometry.floors, geometry.passages)
  const group = buildStationMeshes(level)

  const spawnPos = new THREE.Vector3(level.spawn.pos[0], level.spawn.pos[1], level.spawn.pos[2])
  const hatchRoom = level.rooms.find((r) => r.id === level.exitHatch.room)!
  const hatchPos = hatchAnchorWorldPosition(hatchRoom, level.exitHatch.wall, level.exitHatch.centerY)
  const hatchYaw = hatchFacingYaw(level.exitHatch.wall)

  return { group, collider, spawnPos, spawnYaw: level.spawn.yaw, hatchPos, hatchYaw }
}

/**
 * Compute the world-space centre point of an end-cap-mounted hatch.
 *
 * @param room - Room hosting the hatch.
 * @param wall - End cap the hatch sits on.
 * @param centerY - Hatch centre Y in world units.
 * @returns World position of the hatch centre.
 */
function hatchAnchorWorldPosition(
  room: StationRoomJson,
  wall: StationDoorWall,
  centerY: number,
): THREE.Vector3 {
  if (!isCapWall(wall)) {
    throw new Error(`hatch wall "${wall}" is not an end cap`)
  }
  const [cx, , cz] = room.center
  const halfLen = room.length / 2
  if (wall === '+zCap') return new THREE.Vector3(cx, centerY, cz + halfLen)
  if (wall === '-zCap') return new THREE.Vector3(cx, centerY, cz - halfLen)
  if (wall === '+xCap') return new THREE.Vector3(cx + halfLen, centerY, cz)
  return new THREE.Vector3(cx - halfLen, centerY, cz)
}

/** Yaw (radians) so a hatch on the given end cap faces into the room. */
function hatchFacingYaw(wall: StationDoorWall): number {
  if (wall === '+zCap') return Math.PI
  if (wall === '-zCap') return 0
  if (wall === '+xCap') return -Math.PI / 2
  return Math.PI / 2
}

