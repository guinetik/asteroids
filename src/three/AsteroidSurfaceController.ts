/**
 * GLB-backed asteroid surface. Loads a model, applies the seeded rotation
 * lottery and uniform scale, normalizes embedded materials for sane PBR
 * response, and bakes a collision heightmap from the resulting geometry.
 *
 * Trusts whatever materials and textures the source GLB ships with — the
 * normalization pipeline (`scripts/normalize-asteroid-glbs.mjs` with
 * `ASTEROID_PRESERVE_TEXTURES=1`) bakes the per-asteroid look into the model
 * itself. No runtime texture override, no triplanar shader patching.
 *
 * @author guinetik
 * @date 2026-04-23
 * @spec docs/superpowers/plans/2026-04-23-mesh-asteroid-terrain.md
 */
import * as THREE from 'three'
import { fixMaterials, loadGLB } from './loadGLB'
import { paintAsteroidByHeight } from './paintAsteroidByHeight'
import {
  applyAsteroidSurfaceModulator,
  type AsteroidSurfaceModulatorTextures,
} from './applyAsteroidSurfaceModulator'
import { applyAsteroidUVTextures, type AsteroidUVTextures } from './applyAsteroidUVTextures'
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
   * Optional Euler rotation (radians, XYZ order) applied to the asteroid
   * BEFORE the bake. Lets callers pick a different "up" face per mission via
   * a seeded rotation lottery so missions on the same GLB don't all land on
   * the same slice of rock.
   */
  rotation?: { x: number; y: number; z: number }
  /**
   * Per-asteroid tint as `[r, g, b]` in `[0, 1]`. When provided, the loaded
   * GLB is painted with vertex colors interpolated between a valley shade
   * (`baseColor * valleyTone`) and a peak shade (`baseColor * peakTone`)
   * based on each vertex's radial distance from the asteroid center.
   * Embedded textures are stripped — the painted vertex colors drive the
   * look. Omit to keep whatever the GLB ships with.
   */
  baseColor?: readonly [number, number, number]
  /**
   * Multiplier on `baseColor` at the darkest vertex. Defaults to 0.55. Push
   * up toward 1.0 for uniformly-bright bodies (ice, fresh snow) where
   * peak/valley contrast doesn't make physical sense.
   */
  valleyTone?: number
  /** Multiplier on `baseColor` at the brightest vertex. Defaults to 1.25. */
  peakTone?: number
  /**
   * Optional folder containing a triplet of tileable surface textures
   * (`color.jpg`, `normal.png`, `roughness.jpg`). When provided, applied as
   * a triplanar overlay on top of the painted vertex colors — color is
   * desaturated to a brightness modulator, normal/roughness drive PBR relief.
   */
  surfaceTextures?: string
  /**
   * When `true`, the textures in {@link surfaceTextures} are applied via
   * the GLB's authored UV coordinates (standard PBR slots: `map`,
   * `normalMap`, etc.) instead of triplanar tiling. Use this for matched
   * model+texture packs where the artist painted unique features at
   * specific UV positions and triplanar would tile away their work.
   *
   * Implies: no triplanar shader patching, no vertex-color paint, no
   * `surfaceModulatorStrength` / `surfaceTextureRepeat` (those are
   * triplanar-specific). Skips `paintAsteroidByHeight` entirely.
   */
  surfaceUseEmbeddedUVs?: boolean
  /**
   * Optional folder for an FPS-range detail layer used in UV mode. Only
   * the folder's `normal.jpg` is consumed and is sampled triplanar at
   * high frequency to add micro-relief at close range without tiling
   * away the artist's macro pattern.
   */
  surfaceDetailFolder?: string
  /** Triplanar repeat for the detail normal layer. Defaults to 80. */
  surfaceDetailRepeat?: number
  /** Detail-normal blend strength, 0..1. Defaults to 0.6. */
  surfaceDetailNormalStrength?: number
  /** Triplanar repeat factor for {@link surfaceTextures}. Defaults to 80. */
  surfaceTextureRepeat?: number
  /** Color-modulator strength, 0..1. Defaults to 0.45. */
  surfaceModulatorStrength?: number
  /**
   * Fraction of the modulator's chroma that bleeds through, 0..1. `0`
   * keeps the texture fully desaturated (hue-locked). `1` lets the
   * texture's color tint the surface (e.g. teal ice, red lava). Default 0.
   */
  surfaceModulatorColorBlend?: number
  /** Ambient-occlusion strength, 0..1. Defaults to 1. */
  surfaceAOStrength?: number
  /**
   * Emission contribution multiplier for the optional `emission.jpg`. `0`
   * disables emission entirely. `1` is the natural texture brightness;
   * push above 1 to make lava cracks pop. Defaults to 1.
   */
  surfaceEmissionStrength?: number
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
 * @param options - Model path, scale, optional rotation, and bake parameters.
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
  fixMaterials(scene)

  // Two mutually-exclusive material paths:
  //
  //   - UV mode (matched model+texture packs): bind the textures to the
  //     standard PBR slots and let Three.js sample them via the GLB's
  //     authored UVs. No vertex-color paint, no triplanar — the artist's
  //     unique features land where they painted them.
  //
  //   - Modulator mode (default): paint vertex colors from baseColor, then
  //     overlay tileable textures via triplanar projection. Works for any
  //     mesh regardless of UV quality, but tiles away artist-painted detail.
  let surfaceModulatorTextures: AsteroidSurfaceModulatorTextures | null = null
  let surfaceUVTextures: AsteroidUVTextures | null = null
  if (options.surfaceUseEmbeddedUVs && options.surfaceTextures) {
    // baseColor doubles as a per-pixel tint multiplier in UV mode (we don't
    // paint vertex colors here). Use to push the body toward a hue without
    // overwriting the artist's surface detail.
    surfaceUVTextures = applyAsteroidUVTextures(
      scene,
      options.surfaceTextures,
      options.baseColor,
      options.surfaceDetailFolder
        ? {
            folder: options.surfaceDetailFolder,
            repeat: options.surfaceDetailRepeat,
            strength: options.surfaceDetailNormalStrength,
          }
        : undefined,
    )
  } else {
    if (options.baseColor) {
      paintAsteroidByHeight(scene, options.baseColor, options.valleyTone, options.peakTone)
    }
    if (options.surfaceTextures) {
      surfaceModulatorTextures = applyAsteroidSurfaceModulator(scene, {
        folder: options.surfaceTextures,
        repeat: options.surfaceTextureRepeat,
        strength: options.surfaceModulatorStrength,
        colorBlend: options.surfaceModulatorColorBlend,
        aoStrength: options.surfaceAOStrength,
        emissionStrength: options.surfaceEmissionStrength,
      })
    }
  }

  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh
      mesh.castShadow = true
      mesh.receiveShadow = true
    }
  })
  scene.updateMatrixWorld(true)
  group.add(scene)

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
      surfaceModulatorTextures?.colorMap.dispose()
      surfaceModulatorTextures?.normalMap.dispose()
      surfaceModulatorTextures?.roughnessMap.dispose()
      surfaceModulatorTextures?.aoMap.dispose()
      surfaceModulatorTextures?.metalnessMap.dispose()
      surfaceModulatorTextures?.emissionMap.dispose()
      surfaceUVTextures?.colorMap.dispose()
      surfaceUVTextures?.normalMap.dispose()
      surfaceUVTextures?.roughnessMap.dispose()
      surfaceUVTextures?.aoMap?.dispose()
      surfaceUVTextures?.metalnessMap?.dispose()
      surfaceUVTextures?.emissionMap?.dispose()
      surfaceUVTextures?.detailNormalMap?.dispose()
    },
  }
}
