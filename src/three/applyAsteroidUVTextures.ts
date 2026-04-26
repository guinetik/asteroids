/**
 * UV-mapped material override for asteroid GLBs.
 *
 * Honors the artist's intent for matched model+texture packs: assigns the
 * five-slot PBR texture set to the material's standard PBR slots (`map`,
 * `normalMap`, `roughnessMap`, `aoMap`, `metalnessMap`) so Three.js samples
 * each texture using the GLB's authored UV coordinates. No triplanar
 * tiling, no vertex-color override — just standard PBR with the texture
 * landing exactly where the artist painted it.
 *
 * Used when {@link AsteroidSurfaceControllerOptions.surfaceUseEmbeddedUVs}
 * is `true`. Pairs with packs that ship textures designed for one specific
 * mesh (no tiling, unique features in unique spots).
 *
 * @author guinetik
 * @date 2026-04-26
 */
import * as THREE from 'three'

/** File-name convention shared with `applyAsteroidSurfaceModulator`. */
const TEXTURE_FILES = {
  color: 'color.jpg',
  normal: 'normal.jpg',
  roughness: 'roughness.jpg',
  ao: 'ao.jpg',
  metalness: 'metalness.jpg',
  emission: 'emission.jpg',
} as const

/**
 * Loads a texture configured for UV sampling. Unlike triplanar textures,
 * we don't set wrap modes (the model's UVs are in `[0, 1]` so wrapping
 * shouldn't matter), but we keep mipmaps + anisotropy for sane filtering.
 *
 * @param url - Texture URL.
 * @param colorSpace - sRGB for color/albedo, NoColorSpace for data.
 * @returns Configured texture.
 */
function loadUVTexture(url: string, colorSpace: THREE.ColorSpace): THREE.Texture {
  const tex = new THREE.TextureLoader().load(url, () => {
    tex.needsUpdate = true
  })
  tex.colorSpace = colorSpace
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.anisotropy = 16
  return tex
}

/**
 * Tries to load an optional UV texture; returns `null` if it 404s. Used
 * for `ao.jpg` and `metalness.jpg` which not every pack ships.
 *
 * @param url - Texture URL that may or may not exist.
 * @param colorSpace - Three.js color space.
 * @returns Texture or `null` if the source was missing.
 */
function loadOptionalUVTexture(url: string, colorSpace: THREE.ColorSpace): THREE.Texture {
  const tex = new THREE.TextureLoader().load(
    url,
    () => {
      tex.needsUpdate = true
    },
    undefined,
    () => {
      // Mark as never-uploadable: setting image to null keeps Three.js
      // from binding it. Caller checks `tex.image` to decide whether to
      // assign to a material slot.
      tex.image = null as unknown as HTMLImageElement
    },
  )
  tex.colorSpace = colorSpace
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.anisotropy = 16
  return tex
}

/** Loaded textures the caller is responsible for disposing. */
export interface AsteroidUVTextures {
  /** Loaded color/albedo texture (required). */
  colorMap: THREE.Texture
  /** Loaded normal texture (required). */
  normalMap: THREE.Texture
  /** Loaded roughness texture (required). */
  roughnessMap: THREE.Texture
  /** Loaded AO texture (`null` if missing). */
  aoMap: THREE.Texture | null
  /** Loaded metalness texture (`null` if missing). */
  metalnessMap: THREE.Texture | null
  /** Loaded emission texture (`null` if missing). */
  emissionMap: THREE.Texture | null
  /** Loaded high-frequency detail normal map for FPS-range grain (`null` if unused). */
  detailNormalMap: THREE.Texture | null
}

/** Sharpness of triplanar projection blending for the detail normal layer. */
const TRIPLANAR_BLEND_POWER = 16
/** Default triplanar repeat for the detail normal layer (cycles per object-space unit). */
const DEFAULT_DETAIL_REPEAT = 80
/** Default detail-normal blend strength, 0..1. */
const DEFAULT_DETAIL_NORMAL_STRENGTH = 0.6

/**
 * Optional FPS-range detail layer that overlays high-frequency normal-map
 * grain on top of the artist's UV-mapped macro. Only the normal channel is
 * sampled — color and roughness stay UV-mapped so the artist's painted look
 * reads at lander altitude.
 */
export interface AsteroidUVDetailOptions {
  /**
   * Folder containing a tileable `normal.jpg` (same convention as the main
   * surfaceTextures folder, but only `normal.jpg` is consumed).
   */
  folder: string
  /**
   * Triplanar repeat factor for the detail normal map, cycles per
   * object-space unit. Defaults to {@link DEFAULT_DETAIL_REPEAT}. Higher =
   * finer micro-relief at FPS range.
   */
  repeat?: number
  /**
   * Blend strength for the detail normal, 0..1. Defaults to
   * {@link DEFAULT_DETAIL_NORMAL_STRENGTH}. `0` disables; `1` lets the
   * detail dominate.
   */
  strength?: number
}

/**
 * Apply the five-slot PBR texture set to every `MeshStandardMaterial`
 * under `root`, using the GLB's authored UV coordinates. Replaces any
 * embedded color map with the loaded `color.jpg`. Each texture lands
 * exactly where the artist painted it.
 *
 * @param root - Asteroid scene root.
 * @param folder - Folder containing the convention-named texture files.
 * @param tint - Optional `[r, g, b]` multiplied into the sampled albedo
 * via `mat.color`. Use to push the body toward a hue (e.g. Psyche's
 * rumored gold core) while keeping the artist's surface detail. Defaults
 * to white (no tint).
 * @returns Loaded textures for later disposal.
 */
export function applyAsteroidUVTextures(
  root: THREE.Object3D,
  folder: string,
  tint: readonly [number, number, number] = [1, 1, 1],
  detailOptions?: AsteroidUVDetailOptions,
): AsteroidUVTextures {
  const trimmedFolder = folder.replace(/\/$/, '')
  const colorMap = loadUVTexture(`${trimmedFolder}/${TEXTURE_FILES.color}`, THREE.SRGBColorSpace)
  const normalMap = loadUVTexture(`${trimmedFolder}/${TEXTURE_FILES.normal}`, THREE.NoColorSpace)
  const roughnessMap = loadUVTexture(
    `${trimmedFolder}/${TEXTURE_FILES.roughness}`,
    THREE.NoColorSpace,
  )
  const aoMap = loadOptionalUVTexture(`${trimmedFolder}/${TEXTURE_FILES.ao}`, THREE.NoColorSpace)
  const metalnessMap = loadOptionalUVTexture(
    `${trimmedFolder}/${TEXTURE_FILES.metalness}`,
    THREE.NoColorSpace,
  )
  const emissionMap = loadOptionalUVTexture(
    `${trimmedFolder}/${TEXTURE_FILES.emission}`,
    THREE.SRGBColorSpace,
  )

  // Optional triplanar detail normal layer for FPS-range grain. Only the
  // normal map is consumed — color and roughness stay UV-mapped so the
  // artist's macro pattern still drives the look at lander altitude.
  let detailNormalMap: THREE.Texture | null = null
  let detailRepeat = DEFAULT_DETAIL_REPEAT
  let detailStrength = DEFAULT_DETAIL_NORMAL_STRENGTH
  if (detailOptions) {
    const detailFolder = detailOptions.folder.replace(/\/$/, '')
    detailNormalMap = loadUVTexture(`${detailFolder}/${TEXTURE_FILES.normal}`, THREE.NoColorSpace)
    detailNormalMap.wrapS = THREE.RepeatWrapping
    detailNormalMap.wrapT = THREE.RepeatWrapping
    detailRepeat = detailOptions.repeat ?? DEFAULT_DETAIL_REPEAT
    detailStrength = detailOptions.strength ?? DEFAULT_DETAIL_NORMAL_STRENGTH
  }

  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return
    const mesh = child as THREE.Mesh
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of materials) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue
      mat.map?.dispose()
      mat.map = colorMap
      mat.normalMap = normalMap
      mat.roughnessMap = roughnessMap
      // AO needs uv2 in older three.js, but newer versions reuse uv1. We
      // pass the texture through; if the mesh lacks proper AO UVs the
      // contribution is just zero (acceptable degrade).
      mat.aoMap = aoMap.image ? aoMap : null
      mat.metalnessMap = metalnessMap.image ? metalnessMap : null
      // Emission map present → set emissive to white so the map drives the
      // glow color per-pixel (Three.js does `emission = emissive * map.rgb`).
      // Absent → leave whatever JSON `emissive` set up.
      if (emissionMap.image) {
        mat.emissiveMap = emissionMap
        mat.emissive.setRGB(1, 1, 1)
      }
      // Set the per-pixel multiplier — Three.js does `diffuse = color * map`,
      // so a warm tint here shifts the body's hue without touching the
      // artist's per-pixel detail.
      mat.color.setRGB(tint[0], tint[1], tint[2])
      // Disable vertex colors — the textures are the source of truth.
      mat.vertexColors = false

      if (detailNormalMap) {
        // Patch the shader to add a triplanar normal-map sample on top of
        // the UV-mapped normal. Color/roughness stay 100% UV-driven; only
        // the surface "bumpiness" gets the high-frequency overlay so FPS
        // close-ups have crisp micro-relief without tiling away the
        // artist's macro pattern.
        const detailNormalRef = detailNormalMap
        mat.onBeforeCompile = (shader) => {
          shader.uniforms.uUVDetailNormalMap = { value: detailNormalRef }
          shader.uniforms.uUVDetailRepeat = { value: detailRepeat }
          shader.uniforms.uUVDetailStrength = { value: detailStrength }

          shader.vertexShader = shader.vertexShader
            .replace(
              '#include <common>',
              '#include <common>\nvarying vec3 vUVDPos;\nvarying vec3 vUVDNormal;',
            )
            .replace(
              '#include <begin_vertex>',
              '#include <begin_vertex>\nvUVDPos = position;\nvUVDNormal = normal;',
            )

          shader.fragmentShader = shader.fragmentShader
            .replace(
              '#include <common>',
              '#include <common>\nuniform sampler2D uUVDetailNormalMap;\nuniform float uUVDetailRepeat;\nuniform float uUVDetailStrength;\nuniform mat3 normalMatrix;\nvarying vec3 vUVDPos;\nvarying vec3 vUVDNormal;',
            )
            .replace(
              '#include <normal_fragment_maps>',
              `#include <normal_fragment_maps>
              // Triplanar detail-normal overlay. Sample the tileable
              // normal map across three projection planes, blend by
              // surface direction, sum into the existing UV-mapped
              // normal in object space, renormalize.
              vec3 _udAbsN = abs(normalize(vUVDNormal));
              vec3 _udSignN = sign(vUVDNormal);
              vec3 _udBlend = pow(_udAbsN, vec3(${TRIPLANAR_BLEND_POWER}.0));
              _udBlend /= dot(_udBlend, vec3(1.0)) + 1e-5;
              vec2 _udUvX = vUVDPos.zy * uUVDetailRepeat + vec2(0.17, 0.0);
              vec2 _udUvY = vUVDPos.xz * uUVDetailRepeat + vec2(0.0, 0.43);
              vec2 _udUvZ = vUVDPos.xy * uUVDetailRepeat + vec2(0.71, 0.29);
              vec3 _udNx = texture2D(uUVDetailNormalMap, _udUvX).xyz * 2.0 - 1.0;
              vec3 _udNy = texture2D(uUVDetailNormalMap, _udUvY).xyz * 2.0 - 1.0;
              vec3 _udNz = texture2D(uUVDetailNormalMap, _udUvZ).xyz * 2.0 - 1.0;
              _udNx.xy *= uUVDetailStrength;
              _udNy.xy *= uUVDetailStrength;
              _udNz.xy *= uUVDetailStrength;
              vec3 _udObjNx = vec3(_udNx.z + _udAbsN.x, _udNx.y, _udNx.x);
              vec3 _udObjNy = vec3(_udNy.x, _udNy.z + _udAbsN.y, _udNy.y);
              vec3 _udObjNz = vec3(_udNz.x, _udNz.y, _udNz.z + _udAbsN.z);
              _udObjNx.x *= _udSignN.x;
              _udObjNy.y *= _udSignN.y;
              _udObjNz.z *= _udSignN.z;
              vec3 _udObjN = normalize(
                _udObjNx * _udBlend.x + _udObjNy * _udBlend.y + _udObjNz * _udBlend.z
              );
              // Sum macro normal (in view space) with detail (object
              // space converted to view space) and renormalize.
              normal = normalize(normal + normalize(normalMatrix * _udObjN));`,
            )
        }
      }

      mat.needsUpdate = true
    }
  })

  return {
    colorMap,
    normalMap,
    roughnessMap,
    aoMap: aoMap.image ? aoMap : null,
    metalnessMap: metalnessMap.image ? metalnessMap : null,
    emissionMap: emissionMap.image ? emissionMap : null,
    detailNormalMap,
  }
}
