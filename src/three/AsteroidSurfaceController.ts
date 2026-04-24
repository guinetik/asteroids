/**
 * GLB-backed asteroid surface. Loads a model, bakes a collision heightmap from
 * its geometry via downward raycasting, and exposes both the render group and
 * the baked heightmap. Replaces the procedural TerrainMesh + generateTerrain
 * pair for the level scene.
 *
 * @author guinetik
 * @date 2026-04-23
 * @spec docs/superpowers/plans/2026-04-23-mesh-asteroid-terrain.md
 */
import * as THREE from 'three'
import { fixMaterials, loadGLB } from './loadGLB'
import {
  bakeHeightmapFromMesh,
  type BakeHeightmapFromMeshOptions,
} from '@/lib/terrain/meshHeightmap'
import type { Heightmap } from '@/lib/terrain/heightmap'

/** Public URL path for the default asteroid mesh. */
export const DEFAULT_ASTEROID_MODEL_PATH = '/models/asteroid.glb'

/** Options for constructing an {@link AsteroidSurfaceController}. */
export interface AsteroidSurfaceControllerOptions {
  /** URL path to the asteroid GLB. Defaults to {@link DEFAULT_ASTEROID_MODEL_PATH}. */
  modelPath?: string
  /** Heightmap bake parameters. */
  bake: BakeHeightmapFromMeshOptions
  /** Uniform scale applied to the loaded model before baking. Default 1. */
  scale?: number
  /**
   * Optional albedo texture URL. When provided, overrides the GLB's embedded
   * baseColor map on every mesh so each asteroid can have its own look while
   * sharing one GLB. The GLB's normal / roughness / metallic maps are kept
   * intact so surface relief still reads.
   */
  texturePath?: string
  /**
   * UV repeat factor for {@link texturePath}. Applied as `texture.repeat.set(n, n)`
   * so the albedo tiles instead of stretching. Default 1 = no tiling.
   */
  textureRepeat?: number
  /**
   * Optional Euler rotation (radians, XYZ order) applied to the asteroid
   * BEFORE the bake. Lets callers pick a different "up" face per mission via
   * a seeded rotation lottery so missions on the same GLB don't all land on
   * the same slice of rock.
   */
  rotation?: { x: number; y: number; z: number }
}

/** Result bundle from {@link createAsteroidSurface}. */
export interface AsteroidSurfaceControllerResult {
  /** Root scene group for the asteroid. Add this to the scene graph. */
  group: THREE.Group
  /** Baked heightmap for physics/queries. */
  heightmap: Heightmap
  /** Dispose GPU resources. */
  dispose: () => void
}

/**
 * Load the GLB, scale it, bake a heightmap from it, and return a render group
 * plus the heightmap. The returned group is ready to be added to the scene.
 *
 * @param options - Model path, bake parameters, and optional uniform scale.
 * @returns A group, heightmap, and dispose function.
 */
export async function createAsteroidSurface(
  options: AsteroidSurfaceControllerOptions,
): Promise<AsteroidSurfaceControllerResult> {
  const modelPath = options.modelPath ?? DEFAULT_ASTEROID_MODEL_PATH
  const scene = await loadGLB(modelPath)

  const group = new THREE.Group()
  group.name = 'asteroidSurface'
  if (options.rotation) {
    scene.rotation.set(options.rotation.x, options.rotation.y, options.rotation.z)
  }
  if (options.scale !== undefined && options.scale !== 1) {
    scene.scale.setScalar(options.scale)
  }
  // Fix common GLB material issues (double-sided rendering, cap specular + env
  // map intensity so the baked baseColor/normal textures aren't washed out by
  // the scene environment map).
  fixMaterials(scene)

  // Optionally override the GLB's embedded baseColor map so each asteroid can
  // have its own look. Normal / roughness stay intact so surface relief reads.
  let overrideMap: THREE.Texture | null = null
  if (options.texturePath) {
    overrideMap = new THREE.TextureLoader().load(options.texturePath)
    overrideMap.colorSpace = THREE.SRGBColorSpace
    overrideMap.wrapS = THREE.RepeatWrapping
    overrideMap.wrapT = THREE.RepeatWrapping
    const repeat = options.textureRepeat ?? 1
    overrideMap.repeat.set(repeat, repeat)
    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return
      const material = (child as THREE.Mesh).material
      const materials = Array.isArray(material) ? material : [material]
      for (const mat of materials) {
        if (!(mat instanceof THREE.MeshStandardMaterial)) continue
        // Dispose the GLB's embedded baseColor — we're replacing it.
        mat.map?.dispose()
        mat.map = overrideMap
        // Neutralise any baked-in tint so the texture renders true to source.
        mat.color.setRGB(1, 1, 1)
        mat.needsUpdate = true
      }
    })
  }

  // Shadow flags mirror the old TerrainMesh defaults.
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh
      mesh.castShadow = true
      mesh.receiveShadow = true
    }
  })
  scene.updateMatrixWorld(true)
  group.add(scene)

  // Raycast against the (already transformed) scene. bakeHeightmapFromMesh
  // walks descendants via intersectObject(mesh, true).
  const heightmap = bakeHeightmapFromMesh(scene, options.bake)

  return {
    group,
    heightmap,
    dispose: () => {
      group.traverse((child) => {
        if ('geometry' in child) {
          (child as THREE.Mesh).geometry?.dispose()
        }
        if ('material' in child) {
          const mat = (child as THREE.Mesh).material
          if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose())
          } else if (mat) {
            (mat as THREE.Material).dispose()
          }
        }
      })
      overrideMap?.dispose()
    },
  }
}
