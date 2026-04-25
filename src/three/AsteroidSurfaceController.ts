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

/** Sharpness of triplanar projection blending. Higher = crisper transitions. */
const TRIPLANAR_BLEND_POWER = 16
/** Default triplanar repeat used when no JSON override is supplied. */
const DEFAULT_TRIPLANAR_REPEAT = 1.5
/**
 * Default softness factor mixing asteroid `visual.baseColor` with white so a
 * dark body still reads under the level's sun.
 */
const DEFAULT_MATERIAL_TINT_STRENGTH = 0.35

/**
 * Loads a single tiling color texture configured for triplanar sampling.
 *
 * @param url - Albedo URL.
 * @returns Loaded sRGB {@link THREE.Texture} set to repeat wrapping.
 */
function loadAlbedoTexture(url: string): THREE.Texture {
  const tex = new THREE.TextureLoader().load(url)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

/**
 * Patches a `MeshStandardMaterial` so its `map` texture is sampled via
 * triplanar projection in object space rather than mesh UVs. Source asteroid
 * GLBs ship with degenerate UVs, so triplanar bypasses them entirely. The
 * three projections are blended by `pow(abs(normal), POWER)` to keep
 * transitions sharp, and per-axis offsets decorrelate the three samples so
 * blend zones don't reveal repeated features.
 *
 * @param material - Material whose `map` should be sampled triplanar-style.
 * @param scale - Repeat factor in cycles per object-space unit.
 */
function applyTriplanarMaterial(material: THREE.MeshStandardMaterial, scale: number): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTriplanarScale = { value: scale }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vTriplanarPos;\nvarying vec3 vTriplanarNormal;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvTriplanarPos = position;\nvTriplanarNormal = normal;',
      )

    const fragmentHeader = `\nuniform float uTriplanarScale;\nvarying vec3 vTriplanarPos;\nvarying vec3 vTriplanarNormal;\n`

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>' + fragmentHeader)
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec3 _tpAbsN = abs(normalize(vTriplanarNormal));
          vec3 _tpBlend = pow(_tpAbsN, vec3(${TRIPLANAR_BLEND_POWER}.0));
          _tpBlend /= dot(_tpBlend, vec3(1.0)) + 1e-5;
          vec2 _tpUvX = vTriplanarPos.zy * uTriplanarScale + vec2(0.17, 0.0);
          vec2 _tpUvY = vTriplanarPos.xz * uTriplanarScale + vec2(0.0, 0.43);
          vec2 _tpUvZ = vTriplanarPos.xy * uTriplanarScale + vec2(0.71, 0.29);
          vec4 _tpCx = texture2D(map, _tpUvX);
          vec4 _tpCy = texture2D(map, _tpUvY);
          vec4 _tpCz = texture2D(map, _tpUvZ);
          vec4 sampledDiffuseColor = _tpCx * _tpBlend.x + _tpCy * _tpBlend.y + _tpCz * _tpBlend.z;
          diffuseColor *= sampledDiffuseColor;
        #endif`,
      )
  }
}

/** Options for constructing an {@link AsteroidSurfaceController}. */
export interface AsteroidSurfaceControllerOptions {
  /** URL path to the asteroid GLB. Defaults to {@link DEFAULT_ASTEROID_MODEL_PATH}. */
  modelPath?: string
  /** Heightmap bake parameters. */
  bake: BakeHeightmapFromMeshOptions
  /** Uniform scale applied to the loaded model before baking. Default 1. */
  scale?: number
  /**
   * URL to a single tiling color/albedo texture applied to the asteroid.
   * Triplanar-sampled in object space to avoid relying on the GLB's UVs.
   */
  texturePath?: string
  /**
   * Repeat factor for triplanar texture sampling — cycles per object-space
   * unit. Lower = larger features across the surface.
   */
  textureRepeat?: number
  /**
   * Soft material tint from `asteroid.visual.baseColor`. Mixed toward white by
   * {@link materialTintStrength} so a dark body like Bennu gets character
   * without rendering pitch black.
   */
  materialTint?: readonly [number, number, number]
  /**
   * Blend factor for {@link materialTint}: `0` = pure white (texture only),
   * `1` = full baseColor multiply. Defaults to {@link DEFAULT_MATERIAL_TINT_STRENGTH}.
   */
  materialTintStrength?: number
  /** Material metalness scalar from `asteroid.visual.metalness`. */
  metalness?: number
  /** Material roughness scalar from `asteroid.visual.roughnessMap`. */
  roughness?: number
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
 * @param options - Model path, texture, and bake parameters.
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

  const repeat = options.textureRepeat ?? DEFAULT_TRIPLANAR_REPEAT
  const albedoMap = options.texturePath ? loadAlbedoTexture(options.texturePath) : null
  const tintStrength = options.materialTintStrength ?? DEFAULT_MATERIAL_TINT_STRENGTH
  const tint = options.materialTint
  const tintR = tint ? 1 + (tint[0] - 1) * tintStrength : 1
  const tintG = tint ? 1 + (tint[1] - 1) * tintStrength : 1
  const tintB = tint ? 1 + (tint[2] - 1) * tintStrength : 1

  scene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return
    const material = (child as THREE.Mesh).material
    const materials = Array.isArray(material) ? material : [material]
    for (const mat of materials) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue
      mat.map?.dispose()
      if (albedoMap) {
        mat.map = albedoMap
        applyTriplanarMaterial(mat, repeat)
      }
      mat.color.setRGB(tintR, tintG, tintB)
      if (options.metalness !== undefined) {
        mat.metalness = options.metalness
      }
      if (options.roughness !== undefined) {
        mat.roughness = options.roughness
      }
      mat.needsUpdate = true
    }
  })

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
      albedoMap?.dispose()
    },
  }
}
