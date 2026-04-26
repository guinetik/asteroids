/**
 * Surface-modulator material patch for asteroid GLBs.
 *
 * Sits on top of the painted vertex colors (`paintAsteroidByHeight`) and
 * adds three triplanar-sampled overlays without ever changing the asteroid's
 * hue or letting pixels blow out:
 *
 *   - **Color (grayscale modulator)** — desaturated to a single brightness
 *     value, then multiplied into the vertex color via an overlay-blend.
 *     Adds high-frequency "rocky grain" without shifting tone.
 *   - **Normal map** — tangent-space normal sampled triplanar via whiteout
 *     blending in object space. Provides the surface relief that vertex
 *     colors alone can't express.
 *   - **Roughness map** — green channel multiplied into material roughness
 *     so spec response varies across micro-terrain.
 *
 * One uniform repeat factor controls all three samples; one strength
 * controls the color modulator only (normal/roughness apply at full value).
 *
 * @author guinetik
 * @date 2026-04-25
 */
import * as THREE from 'three'

/** Default triplanar repeat (cycles per object-space unit). */
const DEFAULT_TEXTURE_REPEAT = 80
/** Default color-modulator strength (0..1). */
const DEFAULT_MODULATOR_STRENGTH = 0.45
/**
 * Default fraction of the modulator sample's chroma that bleeds through.
 * `0` = pure grayscale (texture's hue is desaturated before overlay; safe
 * for hue-locked palettes). `1` = full color (texture's hue tints the
 * vertex color, useful for ice / lava / other strongly-tinted surfaces).
 */
const DEFAULT_COLOR_BLEND = 0.0
/** Default ambient-occlusion strength (0..1). */
const DEFAULT_AO_STRENGTH = 1.0
/** Sharpness of triplanar projection blending. Higher = crisper transitions. */
const TRIPLANAR_BLEND_POWER = 16

/**
 * Convention: every asteroid surface-texture folder ships these files,
 * exact names, all `.jpg`:
 *
 *   - `color.jpg` (required) — albedo
 *   - `normal.jpg` (required) — tangent-space normal map
 *   - `roughness.jpg` (required) — grayscale roughness
 *   - `ao.jpg` (optional) — ambient occlusion; silent white fallback if absent
 *   - `metalness.jpg` (optional) — silent white fallback if absent
 *
 * Vendors using different naming (`albedo`, `metallic`, `.png`) need to
 * be renamed/converted before dropping in the folder. Keeps the loader
 * dead simple — one URL per map, no probing, no parallel races.
 */

/**
 * Builds a 1×1 canvas of a single color. Used as initial / fallback for
 * optional texture slots so the GPU sees an `HTMLCanvasElement` (compatible
 * with Three.js's standard `texSubImage2D` upload path) when the optional
 * file is missing.
 *
 * @param color - CSS color string, e.g. `'#fff'` (white = neutral multiply
 * for AO/metalness/color modulator) or `'#000'` (black = no contribution
 * for additive layers like emission).
 * @returns A 1×1 canvas filled with `color`.
 */
function makePixelCanvas(color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 1, 1)
  }
  return canvas
}

/**
 * Convenience: 1×1 white canvas for optional multiply-style slots (AO,
 * metalness, color modulator) where missing = neutral.
 *
 * @returns 1×1 white canvas.
 */
function makeWhitePixelCanvas(): HTMLCanvasElement {
  return makePixelCanvas('#fff')
}

/**
 * Convenience: 1×1 black canvas for optional additive slots (emission)
 * where missing = no contribution.
 *
 * @returns 1×1 black canvas.
 */
function makeBlackPixelCanvas(): HTMLCanvasElement {
  return makePixelCanvas('#000')
}

/**
 * Loads a required tiling texture configured for triplanar sampling.
 *
 * @param url - Texture URL.
 * @param colorSpace - Three.js color space.
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
 * Tries to load an optional tiling texture. The returned texture is
 * IMMEDIATELY usable: its initial image is a 1×1 white canvas (neutral
 * multiply, no effect). On successful load the image is swapped to the
 * real asset. On 404 / decode error the texture stays white — silent
 * fallback. Used for `ao.jpg` and `metalness.jpg`.
 *
 * @param url - Texture URL that may or may not exist.
 * @param colorSpace - Three.js color space.
 * @returns Texture safe to bind even if the source is missing.
 */
function loadOptionalTexture(
  url: string,
  colorSpace: THREE.ColorSpace,
  fallback: HTMLCanvasElement = makeWhitePixelCanvas(),
): THREE.Texture {
  const tex = new THREE.Texture(fallback)
  tex.colorSpace = colorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.anisotropy = 16
  tex.needsUpdate = true

  new THREE.ImageLoader().load(
    url,
    (image) => {
      tex.image = image as unknown as HTMLCanvasElement
      tex.needsUpdate = true
    },
    undefined,
    () => {
      // Silent — the white canvas is already in place.
    },
  )
  return tex
}

/** Loaded textures the caller is responsible for disposing. */
export interface AsteroidSurfaceModulatorTextures {
  /** Loaded color texture. */
  colorMap: THREE.Texture
  /** Loaded normal texture. */
  normalMap: THREE.Texture
  /** Loaded roughness texture. */
  roughnessMap: THREE.Texture
  /** Loaded ambient-occlusion texture (white-fallback if `ao.jpg` is missing). */
  aoMap: THREE.Texture
  /** Loaded metalness texture (white-fallback if `metalness.jpg` is missing). */
  metalnessMap: THREE.Texture
  /** Loaded emission texture (black-fallback if `emission.jpg` is missing). */
  emissionMap: THREE.Texture
}

/** Configuration for the modulator patch. */
export interface AsteroidSurfaceModulatorOptions {
  /**
   * Folder containing `color.jpg`, `normal.png`, `roughness.jpg`. Files
   * are loaded as `${folder}/color.jpg` etc.
   */
  folder: string
  /** Triplanar repeat factor. Defaults to {@link DEFAULT_TEXTURE_REPEAT}. */
  repeat?: number
  /** Color-modulator strength, 0..1. Defaults to {@link DEFAULT_MODULATOR_STRENGTH}. */
  strength?: number
  /**
   * Fraction of the modulator's chroma that survives to the diffuse, 0..1.
   * Defaults to 0 (grayscale-only — preserves the hue-locking guard). Push
   * up for biomes where you WANT the texture's tint (icy-green, lava-red).
   */
  colorBlend?: number
  /**
   * Ambient-occlusion blend strength, 0..1. `0` disables AO entirely. `1`
   * applies the AO sample at full effect (dark pixels of `ao.jpg` darken
   * the diffuse, bright pixels leave it untouched). Defaults to 1.
   */
  aoStrength?: number
  /**
   * Emission contribution multiplier. `0` disables the emission map. `1+`
   * brightens the lava-glow (or whatever emission.jpg encodes) added on
   * top of the lit color. Defaults to 1.
   */
  emissionStrength?: number
}

/**
 * Patch every `MeshStandardMaterial` under `root` with the triplanar surface
 * modulator overlay. Adds the three texture samples on top of whatever
 * vertex colors / base color the material already carries.
 *
 * @param root - Asteroid scene root (already painted with vertex colors).
 * @param options - Folder path and tuning.
 * @returns The loaded textures so the caller can dispose them on teardown.
 */
export function applyAsteroidSurfaceModulator(
  root: THREE.Object3D,
  options: AsteroidSurfaceModulatorOptions,
): AsteroidSurfaceModulatorTextures {
  const folder = options.folder.replace(/\/$/, '')
  const repeat = options.repeat ?? DEFAULT_TEXTURE_REPEAT
  const strength = options.strength ?? DEFAULT_MODULATOR_STRENGTH
  const colorBlend = options.colorBlend ?? DEFAULT_COLOR_BLEND
  const aoStrength = options.aoStrength ?? DEFAULT_AO_STRENGTH
  const emissionStrength = options.emissionStrength ?? 1

  // Strict naming convention — folder must contain color.jpg, normal.jpg,
  // roughness.jpg. ao.jpg and metalness.jpg are optional (white fallback).
  const colorMap = loadTilingTexture(`${folder}/color.jpg`, THREE.SRGBColorSpace)
  const normalMap = loadTilingTexture(`${folder}/normal.jpg`, THREE.NoColorSpace)
  const roughnessMap = loadTilingTexture(`${folder}/roughness.jpg`, THREE.NoColorSpace)
  const aoMap = loadOptionalTexture(`${folder}/ao.jpg`, THREE.NoColorSpace)
  const metalnessMap = loadOptionalTexture(`${folder}/metalness.jpg`, THREE.NoColorSpace)
  const emissionMap = loadOptionalTexture(
    `${folder}/emission.jpg`,
    THREE.SRGBColorSpace,
    makeBlackPixelCanvas(),
  )

  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return
    const mesh = child as THREE.Mesh
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of materials) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uModColorMap = { value: colorMap }
        shader.uniforms.uModNormalMap = { value: normalMap }
        shader.uniforms.uModRoughnessMap = { value: roughnessMap }
        shader.uniforms.uModAOMap = { value: aoMap }
        shader.uniforms.uModMetalnessMap = { value: metalnessMap }
        shader.uniforms.uModRepeat = { value: repeat }
        shader.uniforms.uModStrength = { value: strength }
        shader.uniforms.uModColorBlend = { value: colorBlend }
        shader.uniforms.uModAOStrength = { value: aoStrength }
        shader.uniforms.uModEmissionMap = { value: emissionMap }
        shader.uniforms.uModEmissionStrength = { value: emissionStrength }

        // Pass local position + normal as varyings for triplanar in fragment.
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            '#include <common>\nvarying vec3 vModPos;\nvarying vec3 vModNormal;',
          )
          .replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\nvModPos = position;\nvModNormal = normal;',
          )

        const fragmentHeader =
          '\nuniform sampler2D uModColorMap;\nuniform sampler2D uModNormalMap;' +
          '\nuniform sampler2D uModRoughnessMap;\nuniform sampler2D uModAOMap;' +
          '\nuniform sampler2D uModMetalnessMap;\nuniform sampler2D uModEmissionMap;' +
          '\nuniform float uModRepeat;\nuniform float uModStrength;' +
          '\nuniform float uModColorBlend;\nuniform float uModAOStrength;' +
          '\nuniform float uModEmissionStrength;\nuniform mat3 normalMatrix;' +
          '\nvarying vec3 vModPos;\nvarying vec3 vModNormal;\n'

        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>' + fragmentHeader)
          .replace(
            '#include <map_fragment>',
            `// Triplanar grayscale modulator on top of vColor / diffuse.
            vec3 _modAbsN = abs(normalize(vModNormal));
            vec3 _modBlend = pow(_modAbsN, vec3(${TRIPLANAR_BLEND_POWER}.0));
            _modBlend /= dot(_modBlend, vec3(1.0)) + 1e-5;
            vec2 _modUvX = vModPos.zy * uModRepeat + vec2(0.17, 0.0);
            vec2 _modUvY = vModPos.xz * uModRepeat + vec2(0.0, 0.43);
            vec2 _modUvZ = vModPos.xy * uModRepeat + vec2(0.71, 0.29);
            vec3 _modCx = texture2D(uModColorMap, _modUvX).rgb;
            vec3 _modCy = texture2D(uModColorMap, _modUvY).rgb;
            vec3 _modCz = texture2D(uModColorMap, _modUvZ).rgb;
            vec3 _modColor = _modCx * _modBlend.x + _modCy * _modBlend.y + _modCz * _modBlend.z;
            // Blend between grayscale luminance and full RGB based on uModColorBlend.
            // 0 = pure grayscale (hue-locked), 1 = full color (texture's hue tints diffuse).
            float _modGray = dot(_modColor, vec3(0.299, 0.587, 0.114));
            vec3 _modSample = mix(vec3(_modGray), _modColor, uModColorBlend);
            // Overlay blend centered on 0.5: dark = dim, light = brighten.
            vec3 _modOverlay = mix(vec3(1.0), _modSample * 2.0, uModStrength);
            diffuseColor.rgb *= _modOverlay;
            // Ambient-occlusion multiply: dark crevices in the AO sample
            // darken the diffuse, bright/exposed surfaces leave it untouched.
            float _aoX = texture2D(uModAOMap, _modUvX).g;
            float _aoY = texture2D(uModAOMap, _modUvY).g;
            float _aoZ = texture2D(uModAOMap, _modUvZ).g;
            float _aoSample = _aoX * _modBlend.x + _aoY * _modBlend.y + _aoZ * _modBlend.z;
            diffuseColor.rgb *= mix(1.0, _aoSample, uModAOStrength);`,
          )
          .replace(
            '#include <roughnessmap_fragment>',
            `float roughnessFactor = roughness;
            #ifdef USE_ROUGHNESSMAP
              vec4 texelRoughness = texture2D(roughnessMap, vRoughnessMapUv);
              roughnessFactor *= texelRoughness.g;
            #endif
            vec3 _rmAbsN = abs(normalize(vModNormal));
            vec3 _rmBlend = pow(_rmAbsN, vec3(${TRIPLANAR_BLEND_POWER}.0));
            _rmBlend /= dot(_rmBlend, vec3(1.0)) + 1e-5;
            vec2 _rmUvX = vModPos.zy * uModRepeat + vec2(0.17, 0.0);
            vec2 _rmUvY = vModPos.xz * uModRepeat + vec2(0.0, 0.43);
            vec2 _rmUvZ = vModPos.xy * uModRepeat + vec2(0.71, 0.29);
            float _rmRx = texture2D(uModRoughnessMap, _rmUvX).g;
            float _rmRy = texture2D(uModRoughnessMap, _rmUvY).g;
            float _rmRz = texture2D(uModRoughnessMap, _rmUvZ).g;
            float _rmDetail = _rmRx * _rmBlend.x + _rmRy * _rmBlend.y + _rmRz * _rmBlend.z;
            roughnessFactor *= mix(1.0, _rmDetail * 2.0, 0.5);`,
          )
          .replace(
            '#include <metalnessmap_fragment>',
            `float metalnessFactor = metalness;
            #ifdef USE_METALNESSMAP
              vec4 texelMetalness = texture2D(metalnessMap, vMetalnessMapUv);
              metalnessFactor *= texelMetalness.b;
            #endif
            // Triplanar metalness map — multiplies the JSON metalness so the
            // map varies the body spatially while the JSON sets the global.
            vec3 _mmAbsN = abs(normalize(vModNormal));
            vec3 _mmBlend = pow(_mmAbsN, vec3(${TRIPLANAR_BLEND_POWER}.0));
            _mmBlend /= dot(_mmBlend, vec3(1.0)) + 1e-5;
            vec2 _mmUvX = vModPos.zy * uModRepeat + vec2(0.17, 0.0);
            vec2 _mmUvY = vModPos.xz * uModRepeat + vec2(0.0, 0.43);
            vec2 _mmUvZ = vModPos.xy * uModRepeat + vec2(0.71, 0.29);
            float _mmMx = texture2D(uModMetalnessMap, _mmUvX).b;
            float _mmMy = texture2D(uModMetalnessMap, _mmUvY).b;
            float _mmMz = texture2D(uModMetalnessMap, _mmUvZ).b;
            float _mmDetail = _mmMx * _mmBlend.x + _mmMy * _mmBlend.y + _mmMz * _mmBlend.z;
            metalnessFactor *= _mmDetail;`,
          )
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
            // Triplanar emission map — only the lit areas of emission.jpg
            // glow (typically lava cracks). Added to totalEmissiveRadiance
            // so it survives even when the material has no uniform emissive.
            vec3 _emAbsN = abs(normalize(vModNormal));
            vec3 _emBlend = pow(_emAbsN, vec3(${TRIPLANAR_BLEND_POWER}.0));
            _emBlend /= dot(_emBlend, vec3(1.0)) + 1e-5;
            vec2 _emUvX = vModPos.zy * uModRepeat + vec2(0.17, 0.0);
            vec2 _emUvY = vModPos.xz * uModRepeat + vec2(0.0, 0.43);
            vec2 _emUvZ = vModPos.xy * uModRepeat + vec2(0.71, 0.29);
            vec3 _emCx = texture2D(uModEmissionMap, _emUvX).rgb;
            vec3 _emCy = texture2D(uModEmissionMap, _emUvY).rgb;
            vec3 _emCz = texture2D(uModEmissionMap, _emUvZ).rgb;
            vec3 _emColor = _emCx * _emBlend.x + _emCy * _emBlend.y + _emCz * _emBlend.z;
            totalEmissiveRadiance += _emColor * uModEmissionStrength;`,
          )
          .replace(
            '#include <normal_fragment_maps>',
            `// Whiteout-blended triplanar tangent-space normals into object space.
            vec3 _npAbsN = abs(normalize(vModNormal));
            vec3 _npSignN = sign(vModNormal);
            vec3 _npBlend = pow(_npAbsN, vec3(${TRIPLANAR_BLEND_POWER}.0));
            _npBlend /= dot(_npBlend, vec3(1.0)) + 1e-5;
            vec2 _npUvX = vModPos.zy * uModRepeat + vec2(0.17, 0.0);
            vec2 _npUvY = vModPos.xz * uModRepeat + vec2(0.0, 0.43);
            vec2 _npUvZ = vModPos.xy * uModRepeat + vec2(0.71, 0.29);
            vec3 _npNx = texture2D(uModNormalMap, _npUvX).xyz * 2.0 - 1.0;
            vec3 _npNy = texture2D(uModNormalMap, _npUvY).xyz * 2.0 - 1.0;
            vec3 _npNz = texture2D(uModNormalMap, _npUvZ).xyz * 2.0 - 1.0;
            vec3 _npObjNx = vec3(_npNx.z + _npAbsN.x, _npNx.y, _npNx.x);
            vec3 _npObjNy = vec3(_npNy.x, _npNy.z + _npAbsN.y, _npNy.y);
            vec3 _npObjNz = vec3(_npNz.x, _npNz.y, _npNz.z + _npAbsN.z);
            _npObjNx.x *= _npSignN.x;
            _npObjNy.y *= _npSignN.y;
            _npObjNz.z *= _npSignN.z;
            vec3 _npObjN = normalize(
              _npObjNx * _npBlend.x + _npObjNy * _npBlend.y + _npObjNz * _npBlend.z
            );
            normal = normalize(normalMatrix * _npObjN);`,
          )
      }
      mat.needsUpdate = true
    }
  })

  return { colorMap, normalMap, roughnessMap, aoMap, metalnessMap, emissionMap }
}
