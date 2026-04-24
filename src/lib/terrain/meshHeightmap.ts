/**
 * Bake a Heightmap from a Three.js mesh by casting rays straight down at each grid cell.
 * Cells whose rays don't hit the mesh are marked invalid and set to OFF_SURFACE_HEIGHT.
 *
 * @author guinetik
 * @date 2026-04-23
 * @spec docs/superpowers/plans/2026-04-23-mesh-asteroid-terrain.md
 */
import * as THREE from 'three'
import { Heightmap } from './heightmap'

/** Sentinel Y value written to cells where the bake ray missed the mesh. */
export const OFF_SURFACE_HEIGHT = -1e4

/** Options controlling how a mesh is sampled into a heightmap. */
export interface BakeHeightmapFromMeshOptions {
  /** Grid resolution (cells per axis). Higher = sharper, slower. */
  resolution: number
  /** World-space extent of the heightmap, centred at origin. */
  worldSize: number
  /** Y altitude each downward ray starts from. Must be above the mesh's highest point. */
  rayStartAltitude: number
}

/**
 * Bake a heightmap by raycasting downward at each grid cell.
 *
 * @param mesh - Asteroid mesh to sample. Must have computed bounding volumes (usually already true from glTF loaders).
 * @param options - Resolution, world extent, and ray start altitude.
 * @returns A fully-populated Heightmap with per-cell validity flags.
 */
export function bakeHeightmapFromMesh(
  mesh: THREE.Object3D,
  options: BakeHeightmapFromMeshOptions,
): Heightmap {
  const { resolution, worldSize, rayStartAltitude } = options
  const hm = new Heightmap(resolution, worldSize)
  const raycaster = new THREE.Raycaster()
  ;(raycaster as unknown as { firstHitOnly: boolean }).firstHitOnly = true
  const down = new THREE.Vector3(0, -1, 0)
  const origin = new THREE.Vector3()
  const half = worldSize / 2
  const step = worldSize / (resolution - 1)

  for (let gz = 0; gz < resolution; gz++) {
    const z = -half + gz * step
    for (let gx = 0; gx < resolution; gx++) {
      const x = -half + gx * step
      origin.set(x, rayStartAltitude, z)
      raycaster.set(origin, down)
      const hits = raycaster.intersectObject(mesh, true)
      const first = hits[0]
      if (!first) {
        hm.set(gx, gz, OFF_SURFACE_HEIGHT)
        hm.setValid(gx, gz, false)
        continue
      }
      hm.set(gx, gz, first.point.y)
      hm.setValid(gx, gz, true)
    }
  }

  return hm
}
