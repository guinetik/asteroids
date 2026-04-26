/**
 * Bake a Heightmap from a Three.js mesh by casting rays straight down at each grid cell.
 * Cells whose rays don't hit the mesh are marked invalid and set to OFF_SURFACE_HEIGHT.
 *
 * BVH-accelerated via `three-mesh-bvh`: a bounds tree is built on each mesh's
 * geometry before the bake loop, then reused for every raycast. Without this,
 * a 128×128 bake against a typical 8k-triangle asteroid would be ~128M triangle
 * tests; with BVH it's effectively O(rays × log N) and finishes in milliseconds.
 *
 * @author guinetik
 * @date 2026-04-23
 * @spec docs/superpowers/plans/2026-04-23-mesh-asteroid-terrain.md
 */
import * as THREE from 'three'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'
import { Heightmap } from './heightmap'

// Install BVH accelerators on Three.js prototypes. Safe to re-assign on
// subsequent module loads — both `computeBoundsTree` and `acceleratedRaycast`
// are the canonical three-mesh-bvh helpers.
;(
  THREE.BufferGeometry.prototype as unknown as {
    computeBoundsTree: typeof computeBoundsTree
  }
).computeBoundsTree = computeBoundsTree
;(
  THREE.BufferGeometry.prototype as unknown as {
    disposeBoundsTree: typeof disposeBoundsTree
  }
).disposeBoundsTree = disposeBoundsTree
;(THREE.Mesh.prototype as unknown as { raycast: typeof acceleratedRaycast }).raycast =
  acceleratedRaycast

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

  // Build BVH on every descendant mesh that doesn't already have one. This is
  // the O(triangles) cost paid once per bake; the 16k+ raycasts that follow
  // reuse it and stay O(log triangles) each.
  mesh.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return
    const geom = (child as THREE.Mesh).geometry
    const withBvh = geom as THREE.BufferGeometry & {
      boundsTree?: unknown
      computeBoundsTree?: () => void
    }
    if (!withBvh.boundsTree && withBvh.computeBoundsTree) {
      withBvh.computeBoundsTree()
    }
  })

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
