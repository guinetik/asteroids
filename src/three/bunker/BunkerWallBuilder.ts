/**
 * Procedural bunker geometry — antechamber + corridor + arena.
 *
 * Builds box meshes around rectangular volumes whose dimensions match the spec.
 * Floor, ceiling, and wall families come from {@link BunkerInteriorMaterialSet}:
 * one floor + one ceiling atlas for all rooms, concrete for the foyer (antechamber) and
 * enemy staging rooms; foam for the loot room; blackwall for the corridor only; combat arena
 * walls use untextured matte black (floor/ceiling share the global floor/ceiling atlases).
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */
import * as THREE from 'three'

import {
  createBunkerTiledInteriorMaterialFromTemplate,
  BUNKER_TILE_CEILING_CYCLES_PER_METER,
  BUNKER_TILE_FLOOR_CYCLES_PER_METER,
  BUNKER_TILE_WALL_CYCLES_PER_METER,
  BUNKER_TEXTURE_CEILING_MAP_ANISOTROPY,
  type BunkerInteriorMaterialSet,
} from './BunkerInteriorMaterials'

/** Antechamber inner dimensions (world units). */
export const ANTECHAMBER = { width: 14, depth: 12, height: 11 }
/** Corridor inner dimensions. */
export const CORRIDOR = { width: 6, depth: 8, height: 11 }
/** Arena inner dimensions. */
export const ARENA = { width: 82, depth: 86, height: 13 }
/** Enemy staging room inner dimensions. */
export const ENEMY_ROOM = { width: 16, depth: 16, height: ARENA.height }
/** Loot room inner dimensions. */
export const LOOT_ROOM = { width: ARENA.width / 2, depth: ARENA.depth / 2, height: ARENA.height }
/** Wall thickness for all six faces of every volume. */
export const WALL_THICKNESS = 0.4
/** Combat arena interior — flat matte black, no tiling (see {@link buildRoom}). */
const ARENA_MATTE_COMBAT_HEX = 0x000000
/** Full roughness — diffuse black shell without spec highlights. */
const ARENA_MATTE_COMBAT_ROUGHNESS = 1
/** Non-metallic matte paint read. */
const ARENA_MATTE_COMBAT_METALNESS = 0
/** Inset from each arena corner (world units) where spawn pads sit. */
export const SPAWN_PAD_INSET = 7
/** Player capsule-center inset used when exposing walkable bunker bounds. */
export const WALKABLE_INSET = 0.6

/** Which packed wall texture set vertical faces use (floor/ceiling are shared). */
export type BunkerRoomWallKind =
  /** Antechamber — concrete (foyer before corridor / arena). */
  | 'foyer'
  /** Loot / reward room — foam. */
  | 'loot'
  /** Corridor only — textured blackwall (arena combat shell overrides with matte solid). */
  | 'default'

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
export type BunkerEnemyRoomId = 'east' | 'west'

/** Built geometry metadata for the loot room. */
export interface BunkerLootRoomGeometry {
  group: THREE.Group
  doorAnchor: THREE.Object3D
  walkableBounds: BunkerWalkableBounds
}

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
  /** Enemy staging rooms connected to the arena's east/west walls. */
  enemyRooms: readonly BunkerEnemyRoomGeometry[]
  /** Loot room connected to the arena's north wall. */
  lootRoom: BunkerLootRoomGeometry
  /** XZ position of the antechamber's exit hatch (floor center). */
  antechamberHatch: { x: number; z: number }
  /** Door slot — the scene controller fills this with a `BunkerDoorController`. */
  arenaDoorAnchor: THREE.Object3D
  /** Door slot — the scene controller fills this with an entrance door at the south wall of the antechamber. */
  entranceDoorAnchor: THREE.Object3D
  /** Player spawn point inside the antechamber when entering the bunker. */
  playerSpawn: THREE.Vector3
  /** Walkable room rectangles in bunker-local XZ space. */
  walkableBounds: readonly BunkerWalkableBounds[]
  /** Flat list of every wall mesh built by {@link buildBunkerGeometry} — used by the scene controller for explicit geometry disposal. */
  wallMeshes: ReadonlyArray<THREE.Mesh>
  /**
   * Per-mesh PBR clones with world-derived UV repeat — dispose before templates in
   * {@link BunkerSceneController.dispose}.
   */
  interiorMeshMaterials: ReadonlyArray<THREE.MeshStandardMaterial>
  /**
   * Shared untextured material for arena combat-shell meshes (`matteBlackInterior` option);
   * dispose via {@link THREE.MeshStandardMaterial.dispose} only — no packed maps.
   */
  arenaCombatSolidMaterial?: THREE.MeshStandardMaterial
}

/**
 * Copies `uv` to `uv2` when missing so Three.js `aoMap` shading works on box meshes.
 *
 * @param geometry - Closed box primitive from {@link THREE.BoxGeometry}.
 */
function ensureUv2ForAoMap(geometry: THREE.BufferGeometry): void {
  const uv = geometry.getAttribute('uv')
  if (uv && !geometry.getAttribute('uv2')) {
    geometry.setAttribute('uv2', uv.clone())
  }
}

/**
 * Builds a box mesh whose maps tile with **`repeat ≈ metersOnAxis × cyclesPerMeter`**
 * so tiny rooms and the arena retain the same physical tile size despite shared atlases.
 *
 * @param width  - `BoxGeometry` X extent (m).
 * @param height - `BoxGeometry` Y extent (m).
 * @param depth  - `BoxGeometry` Z extent (m).
 * @param template - Loaded template ({@link BunkerInteriorMaterialSet} slot); not used directly on the mesh.
 * @param repeatU - Multiplicative UV repeat across the primary horizontal span of large faces (`width`-like).
 * @param repeatV - Multiplicative UV repeat across the secondary span (`depth` or height).
 * @param disposableMats - Pushes the new material clone for teardown.
 * @param mapAnisotropyMax - Pass {@link BUNKER_TEXTURE_CEILING_MAP_ANISOTROPY} for ceiling templates only.
 */
function meshFromBoxWorldTiled(
  width: number,
  height: number,
  depth: number,
  template: THREE.MeshStandardMaterial,
  repeatU: number,
  repeatV: number,
  disposableMats: THREE.MeshStandardMaterial[],
  mapAnisotropyMax?: number,
): THREE.Mesh {
  const material = createBunkerTiledInteriorMaterialFromTemplate(
    template,
    repeatU,
    repeatV,
    mapAnisotropyMax,
  )
  disposableMats.push(material)
  const geom = new THREE.BoxGeometry(width, height, depth)
  ensureUv2ForAoMap(geom)
  return new THREE.Mesh(geom, material)
}

/**
 * Untextured interior shell mesh — arena combat room matte black slab.
 *
 * @param material - Shared instance (no AO map; UV2 omitted).
 */
function meshFromSolidInteriorBox(
  material: THREE.MeshStandardMaterial,
  width: number,
  height: number,
  depth: number,
): THREE.Mesh {
  const geom = new THREE.BoxGeometry(width, height, depth)
  return new THREE.Mesh(geom, material)
}

/**
 * One {@link THREE.MeshStandardMaterial} for floor, ceiling, and walls — no textures to dispose beyond the material itself.
 *
 * @returns Single-sided inverted box material suitable for inward-facing shells.
 */
function createArenaCombatMatteBlackMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: ARENA_MATTE_COMBAT_HEX,
    roughness: ARENA_MATTE_COMBAT_ROUGHNESS,
    metalness: ARENA_MATTE_COMBAT_METALNESS,
    side: THREE.BackSide,
    envMapIntensity: 0,
  })
}

/**
 * Build the bunker geometry rooted at the world origin. The arena is placed
 * north of the antechamber with the corridor between them.
 *
 * @param materials - Packed PBR sets (floor / ceiling / per-wall flavor)
 */
export function buildBunkerGeometry(materials: BunkerInteriorMaterialSet): BunkerGeometry {
  const root = new THREE.Group()
  root.name = 'bunkerRoot'
  const interiorMeshMaterials: THREE.MeshStandardMaterial[] = []
  /** Shared with arena shell + enemy-room door jambs — one GPU material, diffuse-only. */
  const sharedCombatShellMatte = createArenaCombatMatteBlackMaterial()

  // Lay out z-axis as "depth" with antechamber at z=0, corridor next, arena last.
  const anteCenterZ = 0
  const corrCenterZ = ANTECHAMBER.depth / 2 + CORRIDOR.depth / 2
  const arenaCenterZ = corrCenterZ + CORRIDOR.depth / 2 + ARENA.depth / 2
  const northRoomCenterZ = arenaCenterZ + ARENA.depth / 2 + LOOT_ROOM.depth / 2
  const eastRoomCenterX = ARENA.width / 2 + ENEMY_ROOM.width / 2
  const westRoomCenterX = -eastRoomCenterX

  // The corridor skips its north + south walls because they would be coplanar
  // with the antechamber's north wall (south end) and the arena's south wall
  // (north end), causing z-fighting under BackSide rendering. The adjacent
  // room end walls are split around the corridor width so opening the door
  // reveals the next space instead of a sealed wall.
  const ante = buildRoom('antechamber', ANTECHAMBER, 0, anteCenterZ, materials, interiorMeshMaterials, 'foyer', {
    northOpeningWidth: CORRIDOR.width,
    southOpeningWidth: CORRIDOR.width,
  })
  const corr = buildRoom('corridor', CORRIDOR, 0, corrCenterZ, materials, interiorMeshMaterials, 'default', {
    skipNorth: true,
    skipSouth: true,
  })
  const arena = buildRoom('arena', ARENA, 0, arenaCenterZ, materials, interiorMeshMaterials, 'default', {
    northOpeningWidth: CORRIDOR.width,
    southOpeningWidth: CORRIDOR.width,
    eastOpeningWidth: CORRIDOR.width,
    eastOpeningCenterZ: arenaCenterZ,
    westOpeningWidth: CORRIDOR.width,
    westOpeningCenterZ: arenaCenterZ,
    matteBlackInterior: true,
    sharedMatteShellMaterial: sharedCombatShellMatte,
  })
  const northRoom = buildRoom('lootRoom', LOOT_ROOM, 0, northRoomCenterZ, materials, interiorMeshMaterials, 'loot', {
    southOpeningWidth: CORRIDOR.width,
  })
  const eastRoom = buildRoom(
    'enemyRoomEast',
    ENEMY_ROOM,
    eastRoomCenterX,
    arenaCenterZ,
    materials,
    interiorMeshMaterials,
    'foyer',
    {
      westOpeningWidth: CORRIDOR.width,
      westOpeningCenterZ: arenaCenterZ,
      matteFlankWestWallOpening: sharedCombatShellMatte,
    },
  )
  const westRoom = buildRoom(
    'enemyRoomWest',
    ENEMY_ROOM,
    westRoomCenterX,
    arenaCenterZ,
    materials,
    interiorMeshMaterials,
    'foyer',
    {
      eastOpeningWidth: CORRIDOR.width,
      eastOpeningCenterZ: arenaCenterZ,
      matteFlankEastWallOpening: sharedCombatShellMatte,
    },
  )
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

  const entranceDoorAnchor = new THREE.Object3D()
  entranceDoorAnchor.position.set(0, 0, -ANTECHAMBER.depth / 2 - WALL_THICKNESS / 2)
  root.add(entranceDoorAnchor)

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

  const lootRoomGeom: BunkerLootRoomGeometry = {
    group: northRoom.group,
    doorAnchor: northDoorAnchor,
    walkableBounds: {
      minX: -LOOT_ROOM.width / 2 + WALKABLE_INSET,
      maxX: LOOT_ROOM.width / 2 - WALKABLE_INSET,
      minZ: arenaCenterZ + ARENA.depth / 2 - WALKABLE_INSET,
      maxZ: northRoomCenterZ + LOOT_ROOM.depth / 2 - 8, // Leave room for table/chests collision
    },
  }

  return {
    root,
    rooms: { antechamber: ante.group, corridor: corr.group, arena: arena.group },
    spawnPadCenters,
    enemyRooms,
    lootRoom: lootRoomGeom,
    antechamberHatch: { x: 0, z: anteCenterZ },
    arenaDoorAnchor,
    entranceDoorAnchor,
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
    interiorMeshMaterials,
    arenaCombatSolidMaterial: arena.sharedMatteMaterial ?? sharedCombatShellMatte,
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
 * @param materials - Floor / ceiling / wall families from the interior loader.
 * @param disposableMats - Accumulates per-mesh material clones for GPU disposal.
 * @param wallKind - Vertical surface texture (foyer / loot / default).
 * @param options  - Optional flags to skip or split the north / south end walls.
 * Arena may set `matteBlackInterior` for an untextured combat shell (shared matte black).
 */
function buildRoom(
  name: string,
  dims: { width: number; depth: number; height: number },
  cx: number,
  cz: number,
  materials: BunkerInteriorMaterialSet,
  disposableMats: THREE.MeshStandardMaterial[],
  wallKind: BunkerRoomWallKind,
  options: {
    skipNorth?: boolean
    skipSouth?: boolean
    northOpeningWidth?: number
    southOpeningWidth?: number
    eastOpeningWidth?: number
    eastOpeningCenterZ?: number
    westOpeningWidth?: number
    westOpeningCenterZ?: number
    matteBlackInterior?: boolean
    /**
     * Arena-only: reuse one matte shell instance from {@link buildBunkerGeometry} so staging
     * doors can share the same material for flanking strips (see matte flank fields).
     */
    sharedMatteShellMaterial?: THREE.MeshStandardMaterial
    /**
     * Enemy staging rooms — east wall (positive local X): segments beside the arena doorway use
     * diffuse matte (`solidMode`) instead of tiled blackwall.
     */
    matteFlankEastWallOpening?: THREE.MeshStandardMaterial
    /** Same pattern for the west wall (arena opening on west side). */
    matteFlankWestWallOpening?: THREE.MeshStandardMaterial
  } = {},
): { group: THREE.Group; meshes: THREE.Mesh[]; sharedMatteMaterial?: THREE.MeshStandardMaterial } {
  const g = new THREE.Group()
  g.name = name
  const t = WALL_THICKNESS
  const meshes: THREE.Mesh[] = []

  if (options.matteBlackInterior) {
    const combatMat = options.sharedMatteShellMaterial ?? createArenaCombatMatteBlackMaterial()
    /** Floor + ceiling reuse the packed atlases; walls only stay matte solid black. */
    const floorRepeatUArena = dims.width * BUNKER_TILE_FLOOR_CYCLES_PER_METER
    const floorRepeatVArena = dims.depth * BUNKER_TILE_FLOOR_CYCLES_PER_METER
    const floor = meshFromBoxWorldTiled(
      dims.width,
      t,
      dims.depth,
      materials.floor,
      floorRepeatUArena,
      floorRepeatVArena,
      disposableMats,
    )
    floor.position.set(cx, -t / 2, cz)
    g.add(floor)
    meshes.push(floor)

    const ceilRepeatUArena = dims.width * BUNKER_TILE_CEILING_CYCLES_PER_METER
    const ceilRepeatVArena = dims.depth * BUNKER_TILE_CEILING_CYCLES_PER_METER
    const ceil = meshFromBoxWorldTiled(
      dims.width,
      t,
      dims.depth,
      materials.ceiling,
      ceilRepeatUArena,
      ceilRepeatVArena,
      disposableMats,
      BUNKER_TEXTURE_CEILING_MAP_ANISOTROPY,
    )
    ceil.position.set(cx, dims.height + t / 2, cz)
    g.add(ceil)
    meshes.push(ceil)

    if (!options.skipNorth) {
      addEndWallSegments({
        group: g,
        meshes,
        disposableMats,
        material: combatMat,
        solidMode: true,
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
        disposableMats,
        material: combatMat,
        solidMode: true,
        width: dims.width,
        height: dims.height,
        centerX: cx,
        centerZ: cz - dims.depth / 2 - t / 2,
        openingWidth: options.southOpeningWidth,
      })
    }

    addSideWallSegments({
      group: g,
      meshes,
      disposableMats,
      material: combatMat,
      solidMode: true,
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
      disposableMats,
      material: combatMat,
      solidMode: true,
      depth: dims.depth,
      height: dims.height,
      centerX: cx - dims.width / 2 - t / 2,
      centerZ: cz,
      openingWidth: options.westOpeningWidth,
      openingCenterZ: options.westOpeningCenterZ,
    })

    return { group: g, meshes, sharedMatteMaterial: combatMat }
  }

  const wallMat =
    wallKind === 'foyer'
      ? materials.wallFoyer
      : wallKind === 'loot'
        ? materials.wallLoot
        : materials.wallDefault

  const floorRepeatU = dims.width * BUNKER_TILE_FLOOR_CYCLES_PER_METER
  const floorRepeatV = dims.depth * BUNKER_TILE_FLOOR_CYCLES_PER_METER

  // Floor + ceiling
  const floor = meshFromBoxWorldTiled(
    dims.width,
    t,
    dims.depth,
    materials.floor,
    floorRepeatU,
    floorRepeatV,
    disposableMats,
  )
  floor.position.set(cx, -t / 2, cz)
  g.add(floor)
  meshes.push(floor)

  const ceilRepeatU = dims.width * BUNKER_TILE_CEILING_CYCLES_PER_METER
  const ceilRepeatV = dims.depth * BUNKER_TILE_CEILING_CYCLES_PER_METER

  const ceil = meshFromBoxWorldTiled(
    dims.width,
    t,
    dims.depth,
    materials.ceiling,
    ceilRepeatU,
    ceilRepeatV,
    disposableMats,
    BUNKER_TEXTURE_CEILING_MAP_ANISOTROPY,
  )
  ceil.position.set(cx, dims.height + t / 2, cz)
  g.add(ceil)
  meshes.push(ceil)

  // North + south walls (along x-axis) — optional so adjacent rooms can
  // close off the end without coplanar z-fighting.
  if (!options.skipNorth) {
    addEndWallSegments({
      group: g,
      meshes,
      disposableMats,
      material: wallMat,
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
      disposableMats,
      material: wallMat,
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
    disposableMats,
    material: wallMat,
    depth: dims.depth,
    height: dims.height,
    centerX: cx + dims.width / 2 + t / 2,
    centerZ: cz,
    openingWidth: options.eastOpeningWidth,
    openingCenterZ: options.eastOpeningCenterZ,
    openingFlankMaterial: options.matteFlankEastWallOpening,
    openingFlankSolidMode: Boolean(options.matteFlankEastWallOpening),
  })

  addSideWallSegments({
    group: g,
    meshes,
    disposableMats,
    material: wallMat,
    depth: dims.depth,
    height: dims.height,
    centerX: cx - dims.width / 2 - t / 2,
    centerZ: cz,
    openingWidth: options.westOpeningWidth,
    openingCenterZ: options.westOpeningCenterZ,
    openingFlankMaterial: options.matteFlankWestWallOpening,
    openingFlankSolidMode: Boolean(options.matteFlankWestWallOpening),
  })

  return { group: g, meshes }
}

/**
 * Create one solid east/west wall or two split segments around a doorway.
 *
 * @param opts - Wall dimensions, parent, material, and optional opening.
 * @param opts.solidMode - When true, `material` is a shared matte shell (no per-face texture clones).
 */
function addSideWallSegments(opts: {
  group: THREE.Group
  meshes: THREE.Mesh[]
  disposableMats: THREE.MeshStandardMaterial[]
  material: THREE.MeshStandardMaterial
  solidMode?: boolean
  depth: number
  height: number
  centerX: number
  centerZ: number
  openingWidth?: number
  openingCenterZ?: number
  /** Replaces `material`/`solidMode` for split segments only (door jambs to arena combat box). */
  openingFlankMaterial?: THREE.MeshStandardMaterial
  openingFlankSolidMode?: boolean
}): void {
  const openingWidth = opts.openingWidth ?? 0
  if (openingWidth <= 0 || opts.openingCenterZ === undefined) {
    addSideWallMesh(opts, opts.depth, opts.centerZ)
    return
  }

  const flankMat = opts.openingFlankMaterial
  const flankOpts = flankMat
    ? {
        ...opts,
        material: flankMat,
        solidMode: opts.openingFlankSolidMode ?? false,
      }
    : opts

  const wallMinZ = opts.centerZ - opts.depth / 2
  const wallMaxZ = opts.centerZ + opts.depth / 2
  const openingMinZ = opts.openingCenterZ - openingWidth / 2
  const openingMaxZ = opts.openingCenterZ + openingWidth / 2
  const southDepth = openingMinZ - wallMinZ
  const northDepth = wallMaxZ - openingMaxZ

  if (southDepth > 0) addSideWallMesh(flankOpts, southDepth, wallMinZ + southDepth / 2)
  if (northDepth > 0) addSideWallMesh(flankOpts, northDepth, openingMaxZ + northDepth / 2)
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
    disposableMats: THREE.MeshStandardMaterial[]
    material: THREE.MeshStandardMaterial
    solidMode?: boolean
    height: number
    centerX: number
  },
  depth: number,
  centerZ: number,
): void {
  let wall: THREE.Mesh
  if (opts.solidMode) {
    wall = meshFromSolidInteriorBox(opts.material, WALL_THICKNESS, opts.height, depth)
  } else {
    const rw = BUNKER_TILE_WALL_CYCLES_PER_METER
    wall = meshFromBoxWorldTiled(
      WALL_THICKNESS,
      opts.height,
      depth,
      opts.material,
      depth * rw,
      opts.height * rw,
      opts.disposableMats,
    )
  }
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
  disposableMats: THREE.MeshStandardMaterial[]
  material: THREE.MeshStandardMaterial
  solidMode?: boolean
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
    disposableMats: THREE.MeshStandardMaterial[]
    material: THREE.MeshStandardMaterial
    solidMode?: boolean
    height: number
    centerZ: number
  },
  width: number,
  centerX: number,
): void {
  let wall: THREE.Mesh
  if (opts.solidMode) {
    wall = meshFromSolidInteriorBox(opts.material, width, opts.height, WALL_THICKNESS)
  } else {
    const rw = BUNKER_TILE_WALL_CYCLES_PER_METER
    wall = meshFromBoxWorldTiled(
      width,
      opts.height,
      WALL_THICKNESS,
      opts.material,
      width * rw,
      opts.height * rw,
      opts.disposableMats,
    )
  }
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
