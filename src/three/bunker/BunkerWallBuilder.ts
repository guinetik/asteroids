/**
 * Procedural bunker geometry — antechamber + corridor + arena.
 *
 * Builds box meshes around three rectangular volumes whose dimensions match
 * the spec. All meshes share one {@link createBunkerGridMaterial} instance
 * via the `material` argument so the breathing animation stays coherent.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */
import * as THREE from 'three'

/** Antechamber inner dimensions (world units). */
export const ANTECHAMBER = { width: 14, depth: 12, height: 11 }
/** Corridor inner dimensions. */
export const CORRIDOR = { width: 6, depth: 8, height: 11 }
/** Arena inner dimensions. */
export const ARENA = { width: 82, depth: 86, height: 13 }
/** Enemy staging room inner dimensions. */
export const ENEMY_ROOM = { width: 16, depth: 16, height: ARENA.height }
/** Wall thickness for all six faces of every volume. */
export const WALL_THICKNESS = 0.4
/** Inset from each arena corner (world units) where spawn pads sit. */
export const SPAWN_PAD_INSET = 7
/** Player capsule-center inset used when exposing walkable bunker bounds. */
export const WALKABLE_INSET = 0.6

/** Axis-aligned walkable rectangle in bunker-local or world XZ space. */
export interface BunkerWalkableBounds {
  /** Minimum X coordinate where the player's capsule center may stand. */
  minX: number
  /** Maximum X coordinate where the player's capsule center may stand. */
  maxX: number
  /** Minimum Z coordinate where the player's capsule center may stand. */
  minZ: number
  /** Maximum Z coordinate where the player's capsule center may stand. */
  maxZ: number
}

/** Directional staging rooms connected to arena walls. */
export type BunkerEnemyRoomId = 'north' | 'east' | 'west'

/** Built geometry metadata for one enemy staging room. */
export interface BunkerEnemyRoomGeometry {
  /** Stable room id; each maps to one non-entry arena wall. */
  id: BunkerEnemyRoomId
  /** Room group, useful for debugging and future hide/show behavior. */
  group: THREE.Group
  /** Door anchor centered in the shared wall opening. */
  doorAnchor: THREE.Object3D
  /** Enemy spawn center in bunker-local XZ space. */
  spawnPadCenter: { x: number; z: number }
  /** Walkable room rectangle in bunker-local XZ space. */
  walkableBounds: BunkerWalkableBounds
}

/** Built bunker — root group plus references the controller cares about. */
export interface BunkerGeometry {
  /** Scene root — add this to the scene. */
  root: THREE.Group
  /** All six wall meshes per room, named for hide/show. */
  rooms: { antechamber: THREE.Group; corridor: THREE.Group; arena: THREE.Group }
  /** XZ centers of the four arena spawn pads in world space. */
  spawnPadCenters: ReadonlyArray<{ x: number; z: number }>
  /** Enemy staging rooms connected to the arena's north/east/west walls. */
  enemyRooms: readonly BunkerEnemyRoomGeometry[]
  /** XZ position of the antechamber's exit hatch (floor center). */
  antechamberHatch: { x: number; z: number }
  /** Door slot — the scene controller fills this with a `BunkerDoorController`. */
  arenaDoorAnchor: THREE.Object3D
  /** Player spawn point inside the antechamber when entering the bunker. */
  playerSpawn: THREE.Vector3
  /** Walkable room rectangles in bunker-local XZ space. */
  walkableBounds: readonly BunkerWalkableBounds[]
  /** Flat list of every wall mesh built by {@link buildBunkerGeometry} — used by the scene controller for explicit geometry disposal. */
  wallMeshes: ReadonlyArray<THREE.Mesh>
}

/**
 * Build the bunker geometry rooted at the world origin. The arena is placed
 * north of the antechamber with the corridor between them.
 *
 * @param material - Shared grid material for all six faces of every volume
 */
export function buildBunkerGeometry(material: THREE.ShaderMaterial): BunkerGeometry {
  const root = new THREE.Group()
  root.name = 'bunkerRoot'

  // Lay out z-axis as "depth" with antechamber at z=0, corridor next, arena last.
  const anteCenterZ = 0
  const corrCenterZ = ANTECHAMBER.depth / 2 + CORRIDOR.depth / 2
  const arenaCenterZ = corrCenterZ + CORRIDOR.depth / 2 + ARENA.depth / 2
  const northRoomCenterZ = arenaCenterZ + ARENA.depth / 2 + ENEMY_ROOM.depth / 2
  const eastRoomCenterX = ARENA.width / 2 + ENEMY_ROOM.width / 2
  const westRoomCenterX = -eastRoomCenterX

  // The corridor skips its north + south walls because they would be coplanar
  // with the antechamber's north wall (south end) and the arena's south wall
  // (north end), causing z-fighting under BackSide rendering. The adjacent
  // room end walls are split around the corridor width so opening the door
  // reveals the next space instead of a sealed wall.
  const ante = buildRoom('antechamber', ANTECHAMBER, 0, anteCenterZ, material, {
    northOpeningWidth: CORRIDOR.width,
  })
  const corr = buildRoom('corridor', CORRIDOR, 0, corrCenterZ, material, {
    skipNorth: true,
    skipSouth: true,
  })
  const arena = buildRoom('arena', ARENA, 0, arenaCenterZ, material, {
    northOpeningWidth: CORRIDOR.width,
    southOpeningWidth: CORRIDOR.width,
    eastOpeningWidth: CORRIDOR.width,
    eastOpeningCenterZ: arenaCenterZ,
    westOpeningWidth: CORRIDOR.width,
    westOpeningCenterZ: arenaCenterZ,
  })
  const northRoom = buildRoom('enemyRoomNorth', ENEMY_ROOM, 0, northRoomCenterZ, material, {
    southOpeningWidth: CORRIDOR.width,
  })
  const eastRoom = buildRoom('enemyRoomEast', ENEMY_ROOM, eastRoomCenterX, arenaCenterZ, material, {
    westOpeningWidth: CORRIDOR.width,
    westOpeningCenterZ: arenaCenterZ,
  })
  const westRoom = buildRoom('enemyRoomWest', ENEMY_ROOM, westRoomCenterX, arenaCenterZ, material, {
    eastOpeningWidth: CORRIDOR.width,
    eastOpeningCenterZ: arenaCenterZ,
  })
  root.add(ante.group, corr.group, arena.group, northRoom.group, eastRoom.group, westRoom.group)
  const wallMeshes = [
    ...ante.meshes,
    ...corr.meshes,
    ...arena.meshes,
    ...northRoom.meshes,
    ...eastRoom.meshes,
    ...westRoom.meshes,
  ]

  // Door anchor sits on the centerline of the antechamber's north wall band
  // (z ∈ [ANTECHAMBER.depth/2, ANTECHAMBER.depth/2 + WALL_THICKNESS]) so a
  // door mesh parented here doesn't overlap/z-fight with the wall faces.
  const arenaDoorAnchor = new THREE.Object3D()
  arenaDoorAnchor.position.set(0, 0, ANTECHAMBER.depth / 2 + WALL_THICKNESS / 2)
  root.add(arenaDoorAnchor)

  const northDoorAnchor = new THREE.Object3D()
  northDoorAnchor.position.set(0, 0, arenaCenterZ + ARENA.depth / 2 + WALL_THICKNESS / 2)
  root.add(northDoorAnchor)

  const eastDoorAnchor = new THREE.Object3D()
  eastDoorAnchor.position.set(ARENA.width / 2 + WALL_THICKNESS / 2, 0, arenaCenterZ)
  eastDoorAnchor.rotation.y = Math.PI / 2
  root.add(eastDoorAnchor)

  const westDoorAnchor = new THREE.Object3D()
  westDoorAnchor.position.set(-ARENA.width / 2 - WALL_THICKNESS / 2, 0, arenaCenterZ)
  westDoorAnchor.rotation.y = Math.PI / 2
  root.add(westDoorAnchor)

  // Spawn pads inset from the four arena corners.
  const halfW = ARENA.width / 2 - SPAWN_PAD_INSET
  const halfD = ARENA.depth / 2 - SPAWN_PAD_INSET
  const spawnPadCenters = [
    { x: -halfW, z: arenaCenterZ - halfD },
    { x: halfW, z: arenaCenterZ - halfD },
    { x: -halfW, z: arenaCenterZ + halfD },
    { x: halfW, z: arenaCenterZ + halfD },
  ]

  const enemyRooms: readonly BunkerEnemyRoomGeometry[] = [
    {
      id: 'north',
      group: northRoom.group,
      doorAnchor: northDoorAnchor,
      spawnPadCenter: { x: 0, z: northRoomCenterZ },
      walkableBounds: insetBounds(
        -ENEMY_ROOM.width / 2,
        ENEMY_ROOM.width / 2,
        arenaCenterZ + ARENA.depth / 2,
        northRoomCenterZ + ENEMY_ROOM.depth / 2,
        -WALKABLE_INSET,
      ),
    },
    {
      id: 'east',
      group: eastRoom.group,
      doorAnchor: eastDoorAnchor,
      spawnPadCenter: { x: eastRoomCenterX, z: arenaCenterZ },
      walkableBounds: insetBounds(
        ARENA.width / 2,
        eastRoomCenterX + ENEMY_ROOM.width / 2,
        arenaCenterZ - ENEMY_ROOM.depth / 2,
        arenaCenterZ + ENEMY_ROOM.depth / 2,
        WALKABLE_INSET,
      ),
    },
    {
      id: 'west',
      group: westRoom.group,
      doorAnchor: westDoorAnchor,
      spawnPadCenter: { x: westRoomCenterX, z: arenaCenterZ },
      walkableBounds: {
        minX: westRoomCenterX - ENEMY_ROOM.width / 2 + WALKABLE_INSET,
        maxX: -ARENA.width / 2 + WALKABLE_INSET,
        minZ: arenaCenterZ - ENEMY_ROOM.depth / 2 + WALKABLE_INSET,
        maxZ: arenaCenterZ + ENEMY_ROOM.depth / 2 - WALKABLE_INSET,
      },
    },
  ]

  return {
    root,
    rooms: { antechamber: ante.group, corridor: corr.group, arena: arena.group },
    spawnPadCenters,
    enemyRooms,
    antechamberHatch: { x: 0, z: anteCenterZ },
    arenaDoorAnchor,
    playerSpawn: new THREE.Vector3(0, 0, anteCenterZ - ANTECHAMBER.depth / 2 + 1.5),
    walkableBounds: [
      insetBounds(-ANTECHAMBER.width / 2, ANTECHAMBER.width / 2, -ANTECHAMBER.depth / 2, ANTECHAMBER.depth / 2),
      insetBounds(
        -CORRIDOR.width / 2,
        CORRIDOR.width / 2,
        ANTECHAMBER.depth / 2,
        ANTECHAMBER.depth / 2 + CORRIDOR.depth,
        -WALKABLE_INSET,
      ),
      insetBounds(
        -ARENA.width / 2,
        ARENA.width / 2,
        ANTECHAMBER.depth / 2 + CORRIDOR.depth,
        ANTECHAMBER.depth / 2 + CORRIDOR.depth + ARENA.depth,
      ),
    ],
    wallMeshes,
  }
}

/**
 * Build the wall meshes for one rectangular room centered at (cx, cz)
 * with floor at y=0 and ceiling at y=`dims.height`. By default all six
 * faces (floor, ceiling, N, S, E, W) are emitted; pass `skipNorth` /
 * `skipSouth` to omit a longitudinal end wall when the caller knows an
 * adjacent room will close it off (avoids coplanar z-fighting). Pass
 * `northOpeningWidth` / `southOpeningWidth` to split an end wall around a
 * centered doorway instead of sealing the corridor. East/west openings split
 * side walls around a Z-centered doorway.
 *
 * @param name     - Room name, set as the THREE.Group `name` for hide/show.
 * @param dims     - Inner width / depth / height in world units.
 * @param cx       - Center X.
 * @param cz       - Center Z.
 * @param material - Shared grid material applied to every face.
 * @param options  - Optional flags to skip or split the north / south end walls.
 */
function buildRoom(
  name: string,
  dims: { width: number; depth: number; height: number },
  cx: number,
  cz: number,
  material: THREE.ShaderMaterial,
  options: {
    skipNorth?: boolean
    skipSouth?: boolean
    northOpeningWidth?: number
    southOpeningWidth?: number
    eastOpeningWidth?: number
    eastOpeningCenterZ?: number
    westOpeningWidth?: number
    westOpeningCenterZ?: number
  } = {},
): { group: THREE.Group; meshes: THREE.Mesh[] } {
  const g = new THREE.Group()
  g.name = name
  const t = WALL_THICKNESS
  const meshes: THREE.Mesh[] = []

  // Floor + ceiling
  const floor = new THREE.Mesh(new THREE.BoxGeometry(dims.width, t, dims.depth), material)
  floor.position.set(cx, -t / 2, cz)
  g.add(floor)
  meshes.push(floor)

  const ceil = new THREE.Mesh(new THREE.BoxGeometry(dims.width, t, dims.depth), material)
  ceil.position.set(cx, dims.height + t / 2, cz)
  g.add(ceil)
  meshes.push(ceil)

  // North + south walls (along x-axis) — optional so adjacent rooms can
  // close off the end without coplanar z-fighting.
  if (!options.skipNorth) {
    addEndWallSegments({
      group: g,
      meshes,
      material,
      width: dims.width,
      height: dims.height,
      centerX: cx,
      centerZ: cz + dims.depth / 2 + t / 2,
      openingWidth: options.northOpeningWidth,
    })
  }

  if (!options.skipSouth) {
    addEndWallSegments({
      group: g,
      meshes,
      material,
      width: dims.width,
      height: dims.height,
      centerX: cx,
      centerZ: cz - dims.depth / 2 - t / 2,
      openingWidth: options.southOpeningWidth,
    })
  }

  // East + west walls (along z-axis)
  addSideWallSegments({
    group: g,
    meshes,
    material,
    depth: dims.depth,
    height: dims.height,
    centerX: cx + dims.width / 2 + t / 2,
    centerZ: cz,
    openingWidth: options.eastOpeningWidth,
    openingCenterZ: options.eastOpeningCenterZ,
  })

  addSideWallSegments({
    group: g,
    meshes,
    material,
    depth: dims.depth,
    height: dims.height,
    centerX: cx - dims.width / 2 - t / 2,
    centerZ: cz,
    openingWidth: options.westOpeningWidth,
    openingCenterZ: options.westOpeningCenterZ,
  })

  return { group: g, meshes }
}

/**
 * Create one solid east/west wall or two split segments around a doorway.
 *
 * @param opts - Wall dimensions, parent, material, and optional opening.
 */
function addSideWallSegments(opts: {
  group: THREE.Group
  meshes: THREE.Mesh[]
  material: THREE.ShaderMaterial
  depth: number
  height: number
  centerX: number
  centerZ: number
  openingWidth?: number
  openingCenterZ?: number
}): void {
  const openingWidth = opts.openingWidth ?? 0
  if (openingWidth <= 0 || opts.openingCenterZ === undefined) {
    addSideWallMesh(opts, opts.depth, opts.centerZ)
    return
  }

  const wallMinZ = opts.centerZ - opts.depth / 2
  const wallMaxZ = opts.centerZ + opts.depth / 2
  const openingMinZ = opts.openingCenterZ - openingWidth / 2
  const openingMaxZ = opts.openingCenterZ + openingWidth / 2
  const southDepth = openingMinZ - wallMinZ
  const northDepth = wallMaxZ - openingMaxZ

  if (southDepth > 0) addSideWallMesh(opts, southDepth, wallMinZ + southDepth / 2)
  if (northDepth > 0) addSideWallMesh(opts, northDepth, openingMaxZ + northDepth / 2)
}

/**
 * Add a single east/west wall segment.
 *
 * @param opts - Shared wall metadata.
 * @param depth - Segment depth along local Z.
 * @param centerZ - Segment center Z.
 */
function addSideWallMesh(
  opts: {
    group: THREE.Group
    meshes: THREE.Mesh[]
    material: THREE.ShaderMaterial
    height: number
    centerX: number
  },
  depth: number,
  centerZ: number,
): void {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICKNESS, opts.height, depth), opts.material)
  wall.position.set(opts.centerX, opts.height / 2, centerZ)
  opts.group.add(wall)
  opts.meshes.push(wall)
}

/**
 * Create one solid end wall or two split segments around a centered doorway.
 *
 * @param opts - Wall dimensions, parent, material, and optional opening width.
 */
function addEndWallSegments(opts: {
  group: THREE.Group
  meshes: THREE.Mesh[]
  material: THREE.ShaderMaterial
  width: number
  height: number
  centerX: number
  centerZ: number
  openingWidth?: number
}): void {
  const openingWidth = opts.openingWidth ?? 0
  if (openingWidth <= 0) {
    addEndWallMesh(opts, opts.width, opts.centerX)
    return
  }

  const segmentWidth = (opts.width - openingWidth) / 2
  if (segmentWidth <= 0) return
  const centerOffset = openingWidth / 2 + segmentWidth / 2
  addEndWallMesh(opts, segmentWidth, opts.centerX - centerOffset)
  addEndWallMesh(opts, segmentWidth, opts.centerX + centerOffset)
}

/**
 * Add a single north/south wall segment.
 *
 * @param opts - Shared wall metadata.
 * @param width - Segment width along local X.
 * @param centerX - Segment center X.
 */
function addEndWallMesh(
  opts: {
    group: THREE.Group
    meshes: THREE.Mesh[]
    material: THREE.ShaderMaterial
    height: number
    centerZ: number
  },
  width: number,
  centerX: number,
): void {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(width, opts.height, WALL_THICKNESS), opts.material)
  wall.position.set(centerX, opts.height / 2, opts.centerZ)
  opts.group.add(wall)
  opts.meshes.push(wall)
}

/**
 * Apply the shared player-center inset to a local walkable rectangle.
 *
 * @param minX - Raw minimum X edge.
 * @param maxX - Raw maximum X edge.
 * @param minZ - Raw minimum Z edge.
 * @param maxZ - Raw maximum Z edge.
 * @param zInset - Optional Z inset override for connector rectangles.
 */
function insetBounds(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  zInset = WALKABLE_INSET,
): BunkerWalkableBounds {
  return {
    minX: minX + WALKABLE_INSET,
    maxX: maxX - WALKABLE_INSET,
    minZ: minZ + zInset,
    maxZ: maxZ - zInset,
  }
}
