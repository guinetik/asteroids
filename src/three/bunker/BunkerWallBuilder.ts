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
export const ANTECHAMBER = { width: 8, depth: 8, height: 5 }
/** Corridor inner dimensions. */
export const CORRIDOR = { width: 3, depth: 4, height: 4 }
/** Arena inner dimensions. */
export const ARENA = { width: 30, depth: 30, height: 7 }
/** Wall thickness for all six faces of every volume. */
export const WALL_THICKNESS = 0.4
/** Inset from each arena corner (world units) where spawn pads sit. */
export const SPAWN_PAD_INSET = 4

/** Built bunker — root group plus references the controller cares about. */
export interface BunkerGeometry {
  /** Scene root — add this to the scene. */
  root: THREE.Group
  /** All six wall meshes per room, named for hide/show. */
  rooms: { antechamber: THREE.Group; corridor: THREE.Group; arena: THREE.Group }
  /** XZ centers of the four arena spawn pads in world space. */
  spawnPadCenters: ReadonlyArray<{ x: number; z: number }>
  /** XZ position of the antechamber's exit hatch (floor center). */
  antechamberHatch: { x: number; z: number }
  /** Door slot — the scene controller fills this with a `BunkerDoorController`. */
  arenaDoorAnchor: THREE.Object3D
  /** Player spawn point inside the antechamber when entering the bunker. */
  playerSpawn: THREE.Vector3
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

  const ante = buildRoom('antechamber', ANTECHAMBER, 0, anteCenterZ, material)
  const corr = buildRoom('corridor', CORRIDOR, 0, corrCenterZ, material)
  const arena = buildRoom('arena', ARENA, 0, arenaCenterZ, material)
  root.add(ante, corr, arena)

  // Door anchor sits on the corridor's antechamber-facing wall (between ante and corridor).
  const arenaDoorAnchor = new THREE.Object3D()
  arenaDoorAnchor.position.set(0, 0, ANTECHAMBER.depth / 2)
  root.add(arenaDoorAnchor)

  // Spawn pads inset from the four arena corners.
  const halfW = ARENA.width / 2 - SPAWN_PAD_INSET
  const halfD = ARENA.depth / 2 - SPAWN_PAD_INSET
  const spawnPadCenters = [
    { x: -halfW, z: arenaCenterZ - halfD },
    { x: halfW, z: arenaCenterZ - halfD },
    { x: -halfW, z: arenaCenterZ + halfD },
    { x: halfW, z: arenaCenterZ + halfD },
  ]

  return {
    root,
    rooms: { antechamber: ante, corridor: corr, arena },
    spawnPadCenters,
    antechamberHatch: { x: 0, z: anteCenterZ },
    arenaDoorAnchor,
    playerSpawn: new THREE.Vector3(0, 0, anteCenterZ - ANTECHAMBER.depth / 2 + 1.5),
  }
}

/**
 * Build the six wall meshes for one rectangular room centered at (cx, cz)
 * with floor at y=0 and ceiling at y=`dims.height`.
 *
 * @param name     - Room name, set as the THREE.Group `name` for hide/show.
 * @param dims     - Inner width / depth / height in world units.
 * @param cx       - Center X.
 * @param cz       - Center Z.
 * @param material - Shared grid material applied to every face.
 */
function buildRoom(
  name: string,
  dims: { width: number; depth: number; height: number },
  cx: number,
  cz: number,
  material: THREE.ShaderMaterial,
): THREE.Group {
  const g = new THREE.Group()
  g.name = name
  const t = WALL_THICKNESS

  // Floor + ceiling
  const floor = new THREE.Mesh(new THREE.BoxGeometry(dims.width, t, dims.depth), material)
  floor.position.set(cx, -t / 2, cz)
  g.add(floor)

  const ceil = new THREE.Mesh(new THREE.BoxGeometry(dims.width, t, dims.depth), material)
  ceil.position.set(cx, dims.height + t / 2, cz)
  g.add(ceil)

  // North + south walls (along x-axis)
  const north = new THREE.Mesh(new THREE.BoxGeometry(dims.width, dims.height, t), material)
  north.position.set(cx, dims.height / 2, cz + dims.depth / 2 + t / 2)
  g.add(north)

  const south = new THREE.Mesh(new THREE.BoxGeometry(dims.width, dims.height, t), material)
  south.position.set(cx, dims.height / 2, cz - dims.depth / 2 - t / 2)
  g.add(south)

  // East + west walls (along z-axis)
  const east = new THREE.Mesh(new THREE.BoxGeometry(t, dims.height, dims.depth), material)
  east.position.set(cx + dims.width / 2 + t / 2, dims.height / 2, cz)
  g.add(east)

  const west = new THREE.Mesh(new THREE.BoxGeometry(t, dims.height, dims.depth), material)
  west.position.set(cx - dims.width / 2 - t / 2, dims.height / 2, cz)
  g.add(west)

  return g
}
