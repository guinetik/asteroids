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
/** Number of radial segments on each canopy mesh. */
const CYLINDER_RADIAL_SEGMENTS = 24
/** Floor roughness for the textured standard material. */
const FLOOR_ROUGHNESS = 0.85
/** End-cap roughness for the textured standard material. */
const CAP_ROUGHNESS = 0.75
/** End-cap metalness for the textured standard material. */
const CAP_METALNESS = 0.15
/** Wall (canopy) roughness. */
const WALL_ROUGHNESS = 0.7
/** Wall (canopy) metalness. */
const WALL_METALNESS = 0.25
/** Floor texture tile density (repeats per world unit). */
const FLOOR_TEX_REPEATS_PER_UNIT = 0.5
/** Wall texture tile density around the half-circumference (repeats per world unit of arc length). */
const WALL_TEX_REPEATS_PER_UNIT_U = 0.18
/** Wall texture tile density along the cylinder axis (repeats per world unit). */
const WALL_TEX_REPEATS_PER_UNIT_V = 0.18
/** End-cap texture tile density (repeats per world unit). */
const CAP_TEX_REPEATS_PER_UNIT = 0.12
/** Floor albedo URL — checker pattern shared with the habitat. */
const FLOOR_COLOR_URL = '/textures/checkers/color.webp'
/** Floor normal URL. */
const FLOOR_NORMAL_URL = '/textures/checkers/normal.webp'
/** Floor roughness URL. */
const FLOOR_ROUGHNESS_URL = '/textures/checkers/roughness.webp'
/** Wall/cap albedo URL — plates pattern shared with the habitat. */
const PLATES_COLOR_URL = '/textures/plates/color.webp'
/** Wall/cap normal URL. */
const PLATES_NORMAL_URL = '/textures/plates/normal.webp'
/** Wall/cap roughness URL. */
const PLATES_ROUGHNESS_URL = '/textures/plates/roughness.webp'
/** Wall/cap metalness URL. */
const PLATES_METALNESS_URL = '/textures/plates/metalness.webp'
/** Floor normal-map strength. */
const FLOOR_NORMAL_SCALE = 0.3
/** Wall/cap normal-map strength. */
const PLATES_NORMAL_SCALE = 0.85
/**
 * Emissive intensity applied to walls and caps with the tint colour as the
 * emissive colour. The plates texture is dark by default; lifting the
 * emissive component pushes painted tones toward off-white the way the
 * habitat interior does (see `HABITAT_PAINT_WALL_EMISSIVE_INTENSITY`).
 */
const PLATES_EMISSIVE_INTENSITY = 0.08
/** Emissive lift for the deck so saturated palette tones don't read as washed-out grey. */
const FLOOR_EMISSIVE_INTENSITY = 0.12

// ---------------------------------------------------------------------------
// Door-frame constants.
// ---------------------------------------------------------------------------

/** Thickness (world units) of each rectangular door-frame jamb. */
const DOOR_FRAME_THICKNESS = 0.15
/** Depth (world units) of the door-frame jambs along the wall's normal. */
const DOOR_FRAME_DEPTH = 0.3
/** Door-frame albedo (medium-grey metallic jamb). */
const DOOR_FRAME_COLOR = 0x666666
/** Door-frame metalness. */
const DOOR_FRAME_METALNESS = 0.6
/** Door-frame roughness. */
const DOOR_FRAME_ROUGHNESS = 0.35

// ---------------------------------------------------------------------------
// Texture cache — load each map once and reuse across rooms.
// ---------------------------------------------------------------------------

const _textureLoader = new THREE.TextureLoader()
const _textureCache = new Map<string, THREE.Texture>()

/**
 * Lazily load a texture map and cache it. Forces `RepeatWrapping` so the
 * caller can set arbitrary `repeat` values on per-mesh clones.
 *
 * @param url - Public-relative texture URL.
 * @returns Shared texture instance.
 */
function loadStationTexture(url: string): THREE.Texture {
  let tex = _textureCache.get(url)
  if (tex) return tex
  tex = _textureLoader.load(url)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = url === FLOOR_COLOR_URL || url === PLATES_COLOR_URL ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace
  _textureCache.set(url, tex)
  return tex
}

/**
 * Clone a cached texture and apply a per-mesh UV repeat. Cloning keeps the
 * shared GPU image but lets each mesh tile it at its own density.
 *
 * @param url - Texture URL.
 * @param repeatU - Tiles across the U axis.
 * @param repeatV - Tiles across the V axis.
 * @returns Per-mesh texture clone with `repeat` set.
 */
function tiledTexture(url: string, repeatU: number, repeatV: number): THREE.Texture {
  const tex = loadStationTexture(url).clone()
  tex.needsUpdate = true
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeatU, repeatV)
  return tex
}

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
  group.add(buildCanopy(room, mat))
  group.add(buildFloor(room, mat))
  group.add(buildEndCap(room, true, mat))
  group.add(buildEndCap(room, false, mat))
  for (const door of room.doors) {
    group.add(buildDoorFrame(room, door))
  }
  return group
}

/**
 * One contiguous span along the canopy axis (in room-local axis coordinates,
 * i.e. centred around 0). Each segment becomes its own CylinderGeometry.
 */
interface CanopySegment {
  /** Start position along the axis, room-local (range −length/2..+length/2). */
  start: number
  /** End position along the axis, room-local. */
  end: number
}

/**
 * Compute canopy segments along the room's axis, skipping Z-ranges that fall
 * inside any curved-wall doorway. Returns a single full-length segment if no
 * curved-wall doors exist.
 *
 * @param room - Room definition.
 * @returns Sorted, non-overlapping segments covering the canopy axis.
 */
function computeCanopySegments(room: StationRoomJson): CanopySegment[] {
  const halfLen = room.length / 2
  const curveDoors = room.doors.filter((d) => !isCapWall(d.wall))
  if (curveDoors.length === 0) {
    return [{ start: -halfLen, end: halfLen }]
  }
  // Curved-wall doors are centred on the room's axis-local 0 (the cylinder's
  // mid-length) by convention, with `width` along the cylinder axis. Compute
  // each door's [start, end] window and subtract from the full span.
  const gaps: { start: number; end: number }[] = curveDoors
    .map((d) => {
      const half = d.width / 2
      return { start: -half, end: half }
    })
    .sort((a, b) => a.start - b.start)
  // Merge overlapping gaps.
  const merged: { start: number; end: number }[] = []
  for (const g of gaps) {
    const last = merged[merged.length - 1]
    if (last && g.start <= last.end) {
      last.end = Math.max(last.end, g.end)
    } else {
      merged.push({ ...g })
    }
  }
  const segments: CanopySegment[] = []
  let cursor = -halfLen
  for (const g of merged) {
    const gStart = Math.max(g.start, -halfLen)
    const gEnd = Math.min(g.end, halfLen)
    if (gStart > cursor) segments.push({ start: cursor, end: gStart })
    cursor = Math.max(cursor, gEnd)
  }
  if (cursor < halfLen) segments.push({ start: cursor, end: halfLen })
  return segments
}

/**
 * Half-cylinder solid wall/roof. Open-ended (no top/bottom caps), top
 * semicircle only, rotated so its axis maps to the room's chosen world
 * axis. Textured with the `plates` PBR set, tiled around the
 * circumference and along the cylinder axis. When the room has curved-wall
 * doors, the canopy is split into multiple Z-segments leaving floor-to-
 * ceiling slots where doorways live.
 *
 * @param room - Room definition.
 * @param mat - Resolved material palette (provides wall tint).
 * @returns Wall mesh or group positioned in world space.
 */
function buildCanopy(room: StationRoomJson, mat: StationMaterialJson): THREE.Object3D {
  const segments = computeCanopySegments(room)
  const group = new THREE.Group()
  group.name = `station-canopy:${room.id}`
  for (const seg of segments) {
    const segLen = seg.end - seg.start
    if (segLen <= MIN_BOX_DIM) continue
    const segMid = (seg.start + seg.end) / 2
    const mesh = buildCanopySegmentMesh(room, mat, segLen, segMid)
    group.add(mesh)
  }
  return group
}

/**
 * Build a single half-cylinder canopy segment positioned at `segMid` along
 * the room's axis (room-local), with `segLen` length.
 *
 * @param room - Room definition.
 * @param mat - Resolved material palette.
 * @param segLen - Segment length along the cylinder axis.
 * @param segMid - Segment midpoint along the cylinder axis (room-local).
 * @returns Canopy segment mesh in world space.
 */
function buildCanopySegmentMesh(
  room: StationRoomJson,
  mat: StationMaterialJson,
  segLen: number,
  segMid: number,
): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(
    room.radius,
    room.radius,
    segLen,
    CYLINDER_RADIAL_SEGMENTS,
    1,
    true,
    Math.PI / 2,
    Math.PI,
  )
  const arcLen = Math.PI * room.radius
  const repeatU = Math.max(1, Math.round(arcLen * WALL_TEX_REPEATS_PER_UNIT_U))
  const repeatV = Math.max(1, Math.round(segLen * WALL_TEX_REPEATS_PER_UNIT_V))
  const colorMap = tiledTexture(PLATES_COLOR_URL, repeatU, repeatV)
  const normalMap = tiledTexture(PLATES_NORMAL_URL, repeatU, repeatV)
  const roughnessMap = tiledTexture(PLATES_ROUGHNESS_URL, repeatU, repeatV)
  const metalnessMap = tiledTexture(PLATES_METALNESS_URL, repeatU, repeatV)
  const matl = new THREE.MeshStandardMaterial({
    color: mat.cap,
    map: colorMap,
    normalMap,
    normalScale: new THREE.Vector2(PLATES_NORMAL_SCALE, PLATES_NORMAL_SCALE),
    roughnessMap,
    metalnessMap,
    roughness: WALL_ROUGHNESS,
    metalness: WALL_METALNESS,
    emissive: new THREE.Color(mat.cap),
    emissiveIntensity: PLATES_EMISSIVE_INTENSITY,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geo, matl)
  // Rotate so the cylinder's Y (its axis in local space) maps to world axis.
  // After rotation, world Z (or X) along the cylinder axis comes from the
  // local Y of the geometry, which is already centred. Offset by `segMid`
  // along that world axis.
  if (room.axis === 'z') {
    mesh.rotation.x = Math.PI / 2
    mesh.position.set(room.center[0], FLOOR_Y, room.center[2] + segMid)
  } else {
    mesh.rotation.z = Math.PI / 2
    mesh.position.set(room.center[0] + segMid, FLOOR_Y, room.center[2])
  }
  mesh.receiveShadow = true
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
  const repeatX = Math.max(1, Math.round(width * FLOOR_TEX_REPEATS_PER_UNIT))
  const repeatZ = Math.max(1, Math.round(room.length * FLOOR_TEX_REPEATS_PER_UNIT))
  // For axis-X rooms the box is rotated 90° in world (length runs along X),
  // but the floor's top face UVs come from BoxGeometry's +Y face which uses
  // the box's local (x, z). Map our world repeats to that local layout.
  const tilesU = room.axis === 'z' ? repeatX : repeatZ
  const tilesV = room.axis === 'z' ? repeatZ : repeatX
  const colorMap = tiledTexture(FLOOR_COLOR_URL, tilesU, tilesV)
  const normalMap = tiledTexture(FLOOR_NORMAL_URL, tilesU, tilesV)
  const roughnessMap = tiledTexture(FLOOR_ROUGHNESS_URL, tilesU, tilesV)
  const matl = new THREE.MeshStandardMaterial({
    color: mat.floor,
    map: colorMap,
    normalMap,
    normalScale: new THREE.Vector2(FLOOR_NORMAL_SCALE, FLOOR_NORMAL_SCALE),
    roughnessMap,
    roughness: FLOOR_ROUGHNESS,
    emissive: new THREE.Color(mat.floor),
    emissiveIntensity: FLOOR_EMISSIVE_INTENSITY,
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
  const repeatCap = Math.max(1, Math.round(r * 2 * CAP_TEX_REPEATS_PER_UNIT))
  const colorMap = tiledTexture(PLATES_COLOR_URL, repeatCap, repeatCap)
  const normalMap = tiledTexture(PLATES_NORMAL_URL, repeatCap, repeatCap)
  const roughnessMap = tiledTexture(PLATES_ROUGHNESS_URL, repeatCap, repeatCap)
  const metalnessMap = tiledTexture(PLATES_METALNESS_URL, repeatCap, repeatCap)
  const matl = new THREE.MeshStandardMaterial({
    color: mat.cap,
    map: colorMap,
    normalMap,
    normalScale: new THREE.Vector2(PLATES_NORMAL_SCALE, PLATES_NORMAL_SCALE),
    roughnessMap,
    metalnessMap,
    roughness: CAP_ROUGHNESS,
    metalness: CAP_METALNESS,
    emissive: new THREE.Color(mat.cap),
    emissiveIntensity: PLATES_EMISSIVE_INTENSITY,
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
 * Build a metallic rectangular door frame (three jambs: top, left, right) at
 * the doorway opening. The frame protrudes from the wall on both sides so it
 * reads as a clear architectural element. End-cap doors get a frame in the
 * cap's plane; curved-wall doors get a portal in the X/Z plane perpendicular
 * to the wall's outward normal.
 *
 * @param room - Room hosting the door.
 * @param door - Door definition.
 * @returns Group of three jamb meshes positioned in world space.
 */
function buildDoorFrame(room: StationRoomJson, door: StationDoorJson): THREE.Group {
  const group = new THREE.Group()
  group.name = `station-door-frame:${room.id}:${door.wall}`
  const halfW = door.width / 2
  const h = door.height > 0 ? door.height : DEFAULT_DOOR_HEIGHT
  const t = DOOR_FRAME_THICKNESS
  const d = DOOR_FRAME_DEPTH
  const matl = new THREE.MeshStandardMaterial({
    color: DOOR_FRAME_COLOR,
    metalness: DOOR_FRAME_METALNESS,
    roughness: DOOR_FRAME_ROUGHNESS,
    side: THREE.DoubleSide,
  })

  // Build the three jambs in a local frame where:
  //   - local X is across the door (width axis),
  //   - local Y is up,
  //   - local Z is the wall normal (depth axis).
  // Then we translate + rotate the group to align with the door's world
  // position and orientation.
  const topGeo = new THREE.BoxGeometry(door.width + t * 2, t, d)
  const top = new THREE.Mesh(topGeo, matl)
  top.position.set(0, h + t / 2, 0)
  group.add(top)

  const sideGeo = new THREE.BoxGeometry(t, h + t, d)
  const left = new THREE.Mesh(sideGeo, matl)
  left.position.set(-halfW - t / 2, (h + t) / 2 - t / 2, 0)
  group.add(left)
  const right = new THREE.Mesh(sideGeo, matl)
  right.position.set(halfW + t / 2, (h + t) / 2 - t / 2, 0)
  group.add(right)

  // Position + orient at the door's world location.
  const [cx, , cz] = room.center
  const halfLen = room.length / 2
  switch (door.wall) {
    case '+zCap':
      group.position.set(cx, FLOOR_Y, cz + halfLen)
      // Local X = world X (across), local Z = world Z (wall normal). No rotation.
      break
    case '-zCap':
      group.position.set(cx, FLOOR_Y, cz - halfLen)
      break
    case '+xCap':
      group.position.set(cx + halfLen, FLOOR_Y, cz)
      // Wall normal is world +X; rotate around Y so local Z → world X.
      group.rotation.y = Math.PI / 2
      break
    case '-xCap':
      group.position.set(cx - halfLen, FLOOR_Y, cz)
      group.rotation.y = -Math.PI / 2
      break
    case '+xCurve':
      // Curved wall door on an axis-'z' room. Door is at world X = cx + radius,
      // centred along Z at the room centre (z = cz). Wall normal is +X.
      group.position.set(cx + room.radius, FLOOR_Y, cz)
      group.rotation.y = Math.PI / 2
      break
    case '-xCurve':
      group.position.set(cx - room.radius, FLOOR_Y, cz)
      group.rotation.y = -Math.PI / 2
      break
    case '+zCurve':
      // Curved wall door on an axis-'x' room. Door is at world Z = cz + radius.
      group.position.set(cx, FLOOR_Y, cz + room.radius)
      break
    case '-zCurve':
      group.position.set(cx, FLOOR_Y, cz - room.radius)
      break
  }
  return group
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

