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
/** Default detail-texture repeat — high so visible tiling fades at lander altitude. */
const DEFAULT_DETAIL_REPEAT = 60
/** Default detail-texture overlay strength, 0..1. */
const DEFAULT_DETAIL_STRENGTH = 0.7
/** Default strength of the detail normal map. */
const DEFAULT_DETAIL_NORMAL_STRENGTH = 1.0
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
  return loadTilingTexture(url, THREE.SRGBColorSpace)
}

/**
 * Loads a linear tiling texture (normal/roughness/AO) configured for triplanar
 * sampling.
 *
 * @param url - Texture URL (data, not color).
 * @returns Loaded linear {@link THREE.Texture} set to repeat wrapping.
 */
function loadDataTexture(url: string): THREE.Texture {
  return loadTilingTexture(url, THREE.NoColorSpace)
}

/**
 * Common loader: configures wrap, mipmaps, anisotropy. Caller picks color space.
 *
 * @param url - Texture URL.
 * @param colorSpace - Three.js color space (sRGB for albedo, NoColorSpace for data).
 * @returns Configured texture.
 */
function loadTilingTexture(url: string, colorSpace: THREE.ColorSpace): THREE.Texture {
  const tex = new THREE.TextureLoader().load(url, () => {
    tex.needsUpdate = true
  })
  tex.colorSpace = colorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.anisotropy = 16
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
interface TriplanarShaderOptions {
  /** Repeat factor for the macro `map` texture. */
  scale: number
  /** Optional detail color texture multiplied over the macro at high frequency. */
  detailMap: THREE.Texture | null
  /** Detail-texture repeat factor (cycles per object-space unit). */
  detailScale: number
  /** Detail overlay strength, 0..1. */
  detailStrength: number
  /** Optional detail normal map sampled triplanar. */
  detailNormalMap: THREE.Texture | null
  /** Detail normal-map strength scalar. */
  detailNormalStrength: number
  /** Optional detail roughness map sampled triplanar. */
  detailRoughnessMap: THREE.Texture | null
}

/**
 * Patches a `MeshStandardMaterial` so its `map` texture is sampled via
 * triplanar projection in object space rather than mesh UVs. Optionally
 * overlays a high-frequency detail texture on top to add grain at FPS range
 * without affecting the macro silhouette at lander altitude (mipmaps fade the
 * detail tiling at distance).
 *
 * @param material - Material whose `map` should be sampled triplanar-style.
 * @param opts - Macro repeat plus optional detail-texture configuration.
 */
function applyTriplanarMaterial(
  material: THREE.MeshStandardMaterial,
  opts: TriplanarShaderOptions,
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTriplanarScale = { value: opts.scale }
    shader.uniforms.uDetailScale = { value: opts.detailScale }
    shader.uniforms.uDetailStrength = { value: opts.detailStrength }
    shader.uniforms.uDetailNormalStrength = { value: opts.detailNormalStrength }
    if (opts.detailMap) shader.uniforms.uDetailMap = { value: opts.detailMap }
    if (opts.detailNormalMap) shader.uniforms.uDetailNormalMap = { value: opts.detailNormalMap }
    if (opts.detailRoughnessMap) {
      shader.uniforms.uDetailRoughnessMap = { value: opts.detailRoughnessMap }
    }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vTriplanarPos;\nvarying vec3 vTriplanarNormal;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvTriplanarPos = position;\nvTriplanarNormal = normal;',
      )

    const detailDefines: string[] = []
    let detailUniforms = ''
    if (opts.detailMap) {
      detailUniforms += '\nuniform sampler2D uDetailMap;'
      detailDefines.push('#define USE_TRIPLANAR_DETAIL 1')
    }
    if (opts.detailNormalMap) {
      detailUniforms += '\nuniform sampler2D uDetailNormalMap;'
      detailDefines.push('#define USE_TRIPLANAR_DETAIL_NORMAL 1')
    }
    if (opts.detailRoughnessMap) {
      detailUniforms += '\nuniform sampler2D uDetailRoughnessMap;'
      detailDefines.push('#define USE_TRIPLANAR_DETAIL_ROUGHNESS 1')
    }
    const fragmentHeader =
      '\nuniform float uTriplanarScale;\nuniform float uDetailScale;\nuniform float uDetailStrength;\nuniform float uDetailNormalStrength;\nuniform mat3 normalMatrix;' +
      detailUniforms +
      '\n' +
      detailDefines.join('\n') +
      '\nvarying vec3 vTriplanarPos;\nvarying vec3 vTriplanarNormal;\n'

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
          #ifdef USE_TRIPLANAR_DETAIL
            vec2 _tpDx = vTriplanarPos.zy * uDetailScale + vec2(0.13, 0.0);
            vec2 _tpDy = vTriplanarPos.xz * uDetailScale + vec2(0.0, 0.31);
            vec2 _tpDz = vTriplanarPos.xy * uDetailScale + vec2(0.59, 0.41);
            vec4 _tpDcx = texture2D(uDetailMap, _tpDx);
            vec4 _tpDcy = texture2D(uDetailMap, _tpDy);
            vec4 _tpDcz = texture2D(uDetailMap, _tpDz);
            vec3 _tpDetail = (_tpDcx * _tpBlend.x + _tpDcy * _tpBlend.y + _tpDcz * _tpBlend.z).rgb;
            vec3 _tpOverlay = mix(vec3(1.0), _tpDetail * 2.0, uDetailStrength);
            sampledDiffuseColor.rgb *= _tpOverlay;
          #endif
          diffuseColor *= sampledDiffuseColor;
        #endif`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = roughness;
        #ifdef USE_ROUGHNESSMAP
          vec4 texelRoughness = texture2D(roughnessMap, vRoughnessMapUv);
          roughnessFactor *= texelRoughness.g;
        #endif
        #ifdef USE_TRIPLANAR_DETAIL_ROUGHNESS
          vec3 _rpAbsN = abs(normalize(vTriplanarNormal));
          vec3 _rpBlend = pow(_rpAbsN, vec3(${TRIPLANAR_BLEND_POWER}.0));
          _rpBlend /= dot(_rpBlend, vec3(1.0)) + 1e-5;
          vec2 _rpDx = vTriplanarPos.zy * uDetailScale + vec2(0.13, 0.0);
          vec2 _rpDy = vTriplanarPos.xz * uDetailScale + vec2(0.0, 0.31);
          vec2 _rpDz = vTriplanarPos.xy * uDetailScale + vec2(0.59, 0.41);
          float _rpRx = texture2D(uDetailRoughnessMap, _rpDx).g;
          float _rpRy = texture2D(uDetailRoughnessMap, _rpDy).g;
          float _rpRz = texture2D(uDetailRoughnessMap, _rpDz).g;
          float _rpDetail = _rpRx * _rpBlend.x + _rpRy * _rpBlend.y + _rpRz * _rpBlend.z;
          // Multiply with bias toward 1.0 so neutral roughness map (~0.5) doesn't crush spec.
          roughnessFactor *= mix(1.0, _rpDetail * 2.0, 0.5);
        #endif`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#ifdef USE_TRIPLANAR_DETAIL_NORMAL
          vec3 _npAbsN = abs(normalize(vTriplanarNormal));
          vec3 _npSignN = sign(vTriplanarNormal);
          vec3 _npBlend = pow(_npAbsN, vec3(${TRIPLANAR_BLEND_POWER}.0));
          _npBlend /= dot(_npBlend, vec3(1.0)) + 1e-5;
          vec2 _npDx = vTriplanarPos.zy * uDetailScale + vec2(0.13, 0.0);
          vec2 _npDy = vTriplanarPos.xz * uDetailScale + vec2(0.0, 0.31);
          vec2 _npDz = vTriplanarPos.xy * uDetailScale + vec2(0.59, 0.41);
          vec3 _npNx = texture2D(uDetailNormalMap, _npDx).xyz * 2.0 - 1.0;
          vec3 _npNy = texture2D(uDetailNormalMap, _npDy).xyz * 2.0 - 1.0;
          vec3 _npNz = texture2D(uDetailNormalMap, _npDz).xyz * 2.0 - 1.0;
          _npNx.xy *= uDetailNormalStrength;
          _npNy.xy *= uDetailNormalStrength;
          _npNz.xy *= uDetailNormalStrength;
          // Whiteout: reorient each tangent normal into object space, sum z with geometry.
          vec3 _npObjNx = vec3(_npNx.z + _npAbsN.x, _npNx.y, _npNx.x);
          vec3 _npObjNy = vec3(_npNy.x, _npNy.z + _npAbsN.y, _npNy.y);
          vec3 _npObjNz = vec3(_npNz.x, _npNz.y, _npNz.z + _npAbsN.z);
          _npObjNx.x *= _npSignN.x;
          _npObjNy.y *= _npSignN.y;
          _npObjNz.z *= _npSignN.z;
          vec3 _npObjN = normalize(
            _npObjNx * _npBlend.x + _npObjNy * _npBlend.y + _npObjNz * _npBlend.z
          );
          normal = normalize(normalMatrix * _npObjN);
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
   * Optional detail texture URL multiplied over {@link texturePath} for FPS
   * close-up grain. See {@link AsteroidSurface.detailTexturePath} in
   * `lib/asteroids/types.ts` for the design notes.
   */
  detailTexturePath?: string
  /** Detail-texture repeat (cycles per object-space unit). */
  detailRepeat?: number
  /** Detail-texture overlay strength, 0..1. */
  detailStrength?: number
  /** Optional tangent-space normal map applied to the detail layer. */
  detailNormalPath?: string
  /** Detail normal-map strength scalar (default 1). */
  detailNormalStrength?: number
  /** Optional roughness map applied to the detail layer. */
  detailRoughnessPath?: string
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
   * When true, leave the GLB's embedded materials and textures untouched —
   * skip albedo/normal/roughness assignment, tinting, and triplanar shader
   * patching. Used in tandem with the pipeline's `ASTEROID_PRESERVE_TEXTURES`
   * mode for testing whether a source GLB's authored material works directly.
   */
  useEmbeddedTexture?: boolean
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

  const useEmbedded = options.useEmbeddedTexture === true
  const repeat = options.textureRepeat ?? DEFAULT_TRIPLANAR_REPEAT
  const albedoMap =
    !useEmbedded && options.texturePath ? loadAlbedoTexture(options.texturePath) : null
  const detailMap =
    !useEmbedded && options.detailTexturePath
      ? loadAlbedoTexture(options.detailTexturePath)
      : null
  const detailNormalMap =
    !useEmbedded && options.detailNormalPath ? loadDataTexture(options.detailNormalPath) : null
  const detailRoughnessMap =
    !useEmbedded && options.detailRoughnessPath
      ? loadDataTexture(options.detailRoughnessPath)
      : null
  const detailRepeat = options.detailRepeat ?? DEFAULT_DETAIL_REPEAT
  const detailStrength = options.detailStrength ?? DEFAULT_DETAIL_STRENGTH
  const detailNormalStrength = options.detailNormalStrength ?? DEFAULT_DETAIL_NORMAL_STRENGTH
  const tintStrength = options.materialTintStrength ?? DEFAULT_MATERIAL_TINT_STRENGTH
  const tint = options.materialTint
  const tintR = tint ? 1 + (tint[0] - 1) * tintStrength : 1
  const tintG = tint ? 1 + (tint[1] - 1) * tintStrength : 1
  const tintB = tint ? 1 + (tint[2] - 1) * tintStrength : 1

  if (!useEmbedded) {
    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return
      const material = (child as THREE.Mesh).material
      const materials = Array.isArray(material) ? material : [material]
      for (const mat of materials) {
        if (!(mat instanceof THREE.MeshStandardMaterial)) continue
        mat.map?.dispose()
        if (albedoMap) {
          mat.map = albedoMap
          applyTriplanarMaterial(mat, {
            scale: repeat,
            detailMap,
            detailScale: detailRepeat,
            detailStrength,
            detailNormalMap,
            detailNormalStrength,
            detailRoughnessMap,
          })
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
      albedoMap?.dispose()
      detailMap?.dispose()
      detailNormalMap?.dispose()
      detailRoughnessMap?.dispose()
    },
  }
}
