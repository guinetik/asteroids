/**
 * Cosmetic paint gradient ramp pipeline.
 *
 * Builds a 1D `CanvasTexture` from a list of CSS hex stops and injects it into
 * supported PBR materials via `onBeforeCompile`. The shader samples the ramp
 * along a model-local axis (mesh-local position transformed back into vehicle-root
 * space), then multiplies the result onto the diffuse albedo with a configurable
 * mix strength. Per-channel paint colors set elsewhere are preserved; the ramp
 * is layered on top so panels read as slices of one continuous gradient instead
 * of three flat color bands.
 *
 * The same gradient ribbon shown in the cosmetic shop swatches is what flows
 * across the ship — the in-shop preview and the in-game model match.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-pimp-my-shuttle-paint-ramp.md
 */

import * as THREE from 'three'

/** Width of the 1D gradient strip uploaded to the GPU. */
const RAMP_TEXTURE_WIDTH = 256
/** Height of the gradient strip. Must be ≥ 1; small extra rows help filtering on some drivers. */
const RAMP_TEXTURE_HEIGHT = 4

/** Cache of `stops.join('|')` to a shared `CanvasTexture` so we don't rebuild per material. */
const rampTextureCache = new Map<string, THREE.CanvasTexture>()

/** Fallback rim color when a config omits one. White is a no-op when intensity is 0. */
const PAINT_RIM_DEFAULT_COLOR = /* @__PURE__ */ new THREE.Color(0xffffff)
/** Default Fresnel exponent — sharp halo at silhouette edges, dim across hull faces. */
const PAINT_RIM_POWER_DEFAULT = 2.5
/**
 * Default per-component detail weights `(seam, scuff, grain)`. All on means
 * "ship hull" character (panelled metal). Multitool / lander callers can dial
 * components to zero to skip them — e.g. a held mechanical prop wants grain
 * only, no panel seams.
 */
const PAINT_DETAIL_WEIGHTS_DEFAULT = /* @__PURE__ */ new THREE.Vector3(1, 1, 1)

/** Local-space axis the ramp samples along. */
export type PaintRampAxis = 'x' | 'y' | 'z'

/**
 * Bounds the ramp coordinate is normalized against. Axis values below `min`
 * sample stop 0; values above `max` sample the final stop.
 */
export interface PaintRampBounds {
  /** Minimum axis value (vehicle-local space). */
  readonly min: number
  /** Maximum axis value (vehicle-local space). */
  readonly max: number
}

/**
 * Per-material wiring needed to bind a ramp texture into a PBR shader.
 */
export interface PaintRampShaderConfig {
  /** Pre-built gradient texture (use {@link buildPaintRampTexture}). */
  readonly rampTexture: THREE.Texture
  /** Local axis the ramp flows along. */
  readonly axis: PaintRampAxis
  /** Vehicle-local axis bounds. */
  readonly axisBounds: PaintRampBounds
  /** Tint mix strength on top of the existing diffuse (0 = off, 1 = full ramp tint). */
  readonly strength: number
  /**
   * Mesh-local to vehicle-root-local transform captured at collection time.
   * The vertex shader applies this so the ramp lines up with the vehicle silhouette
   * regardless of mesh pivots or hierarchy.
   */
  readonly meshToVehicleLocal: THREE.Matrix4
  /**
   * Procedural panel-seam + scuff overlay strength (0 = off, 1 = full). Optional;
   * when zero or omitted the detail branch is short-circuited at near-zero cost.
   * Used in "replace mode" where the GLB diffuse map has been dropped and surface
   * detail must come from the shader instead of baked artwork.
   */
  readonly detailStrength?: number
  /**
   * Per-component detail weights `(seam, scuff, grain)` multiplied on top of
   * `detailStrength`. Default `(1, 1, 1)` keeps the original ship-hull look.
   * Setting a component to zero turns just that component off — e.g. the
   * multitool sets `(0, 0, 1)` for grain-only on a non-panelled prop. Optional.
   */
  readonly detailWeights?: THREE.Vector3
  /**
   * Optional rim-light tint (added to `totalEmissiveRadiance`). When omitted or
   * `rimIntensity` is zero, the rim contribution is short-circuited to zero so
   * the cost reduces to a `pow` and a multiply.
   */
  readonly rimColor?: THREE.Color
  /** Rim-light strength. 0 = off. Typical glowing-edge values: 0.5–1.5. Optional. */
  readonly rimIntensity?: number
  /**
   * Rim Fresnel falloff exponent (`pow(1 - dot(N, V), power)`). Higher values
   * yield a thinner, sharper edge; lower values bloom the rim across the hull.
   * Default `2.5`. Optional.
   */
  readonly rimPower?: number
  /**
   * Additive bias on the Fresnel term before `pow`. Negative values clip the
   * rim to grazing only; positive values raise the floor (entire ship glows
   * faintly). Default `0`. Optional.
   */
  readonly rimBias?: number
  /**
   * Self-illumination strength as a fraction of the paint's own diffuse color
   * added to `totalEmissiveRadiance`. Keeps the hull readable on the dark side
   * of a planet (no scene light) — the ship glows faintly in its own paint
   * color regardless of lighting. `0` disables the term. Typical: 0.05–0.15.
   * Optional.
   */
  readonly baseGlow?: number
}

/** Internal uniforms held on a material so we can swap textures without recompiling. */
interface PaintRampUniformBag {
  /** Current ramp texture sampler value. */
  readonly uPaintRamp: { value: THREE.Texture }
  /** Min/max axis bounds packed as `(min, max)`. */
  readonly uPaintRampBounds: { value: THREE.Vector2 }
  /** Tint mix strength. */
  readonly uPaintRampStrength: { value: number }
  /** Mesh-local → vehicle-local transform. */
  readonly uPaintRampMatrix: { value: THREE.Matrix4 }
  /** Procedural detail overlay strength (0 = off). */
  readonly uPaintDetailStrength: { value: number }
  /** Per-component detail weights `(seam, scuff, grain)`. Default `(1, 1, 1)`. */
  readonly uPaintDetailWeights: { value: THREE.Vector3 }
  /** Rim-light color added to `totalEmissiveRadiance`. */
  readonly uPaintRimColor: { value: THREE.Color }
  /** Rim-light strength. 0 = off (multiplied with the Fresnel term). */
  readonly uPaintRimIntensity: { value: number }
  /** Rim Fresnel exponent. */
  readonly uPaintRimPower: { value: number }
  /** Rim Fresnel additive bias. */
  readonly uPaintRimBias: { value: number }
  /** Self-illumination strength (paint color fraction added to emissive). */
  readonly uPaintBaseGlow: { value: number }
}

/**
 * Three.js stores per-material `userData` as `Record<string, unknown>`.
 * We attach our uniform bag and a recompile flag under known keys.
 */
interface PaintRampUserData {
  /** Uniform bag shared between OBC closure and any external mutators. */
  paintRampUniforms?: PaintRampUniformBag
  /** Last `axis` we compiled with — changing this forces a recompile. */
  paintRampAxis?: PaintRampAxis
}

/**
 * Build (or return a cached) 1D gradient texture from CSS hex stops.
 *
 * @param stops - Hex color stops (`#rrggbb`). Must contain at least one entry.
 */
export function buildPaintRampTexture(stops: readonly string[]): THREE.CanvasTexture {
  const safeStops = stops.length > 0 ? stops : ['#ffffff']
  const cacheKey = safeStops.join('|')
  const cached = rampTextureCache.get(cacheKey)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = RAMP_TEXTURE_WIDTH
  canvas.height = RAMP_TEXTURE_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('paintRampShader: 2D canvas context unavailable')
  }
  const grad = ctx.createLinearGradient(0, 0, RAMP_TEXTURE_WIDTH, 0)
  if (safeStops.length === 1) {
    grad.addColorStop(0, safeStops[0]!)
    grad.addColorStop(1, safeStops[0]!)
  } else {
    safeStops.forEach((stop, idx) => {
      grad.addColorStop(idx / (safeStops.length - 1), stop)
    })
  }
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, RAMP_TEXTURE_WIDTH, RAMP_TEXTURE_HEIGHT)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true

  rampTextureCache.set(cacheKey, texture)
  return texture
}

/**
 * Compute a vehicle-local axis bounding range across a list of mesh→vehicle
 * transforms paired with their mesh geometries.
 *
 * @param entries - Pairs of geometry and the mesh→vehicle-local transform.
 * @param axis - Axis to project onto.
 */
export function computePaintRampBounds(
  entries: ReadonlyArray<{
    /** Mesh geometry whose vertices are projected. */
    readonly geometry: THREE.BufferGeometry
    /** Mesh-local → vehicle-local transform applied before projection. */
    readonly meshToVehicleLocal: THREE.Matrix4
  }>,
  axis: PaintRampAxis,
): PaintRampBounds {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  const tmp = new THREE.Box3()
  for (const entry of entries) {
    if (!entry.geometry.boundingBox) {
      entry.geometry.computeBoundingBox()
    }
    const bb = entry.geometry.boundingBox
    if (!bb) continue
    tmp.copy(bb).applyMatrix4(entry.meshToVehicleLocal)
    if (tmp.min[axis] < min) min = tmp.min[axis]
    if (tmp.max[axis] > max) max = tmp.max[axis]
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    return { min: -1, max: 1 }
  }
  return { min, max }
}

/**
 * Compute the matrix that maps mesh-local positions into the local space of a
 * vehicle root. Both objects must already be present in the same scene tree.
 *
 * @param mesh - Painted mesh in the vehicle hierarchy.
 * @param vehicleRoot - GLB scene root for the vehicle (e.g. loaded GLB scene).
 */
export function computeMeshToVehicleLocal(
  mesh: THREE.Object3D,
  vehicleRoot: THREE.Object3D,
): THREE.Matrix4 {
  vehicleRoot.updateMatrixWorld(true)
  const rootInverse = vehicleRoot.matrixWorld.clone().invert()
  return rootInverse.multiply(mesh.matrixWorld)
}

/**
 * Attach the ramp shader to a material the first time, or update its uniforms
 * if the material was already prepared. Materials whose shader pipeline does
 * not expose `onBeforeCompile` (rare) are skipped silently.
 *
 * Calling this with a different `axis` than was previously applied forces a
 * recompile so the vertex shader picks up the new component swizzle.
 *
 * @param material - Cloned PBR material assigned to a single mesh.
 * @param config - Ramp wiring for this material.
 */
export function applyPaintRampShader(
  material: THREE.Material,
  config: PaintRampShaderConfig,
): void {
  const supportsOnBeforeCompile = typeof material.onBeforeCompile === 'function'
  if (!supportsOnBeforeCompile && material.onBeforeCompile === undefined) {
    return
  }

  const userData = material.userData as PaintRampUserData
  const existing = userData.paintRampUniforms
  const axisChanged = userData.paintRampAxis !== undefined && userData.paintRampAxis !== config.axis
  const detailStrength = config.detailStrength ?? 0
  const detailWeights = config.detailWeights ?? PAINT_DETAIL_WEIGHTS_DEFAULT
  const rimIntensity = config.rimIntensity ?? 0
  const rimPower = config.rimPower ?? PAINT_RIM_POWER_DEFAULT
  const rimBias = config.rimBias ?? 0
  const rimColor = config.rimColor ?? PAINT_RIM_DEFAULT_COLOR
  const baseGlow = config.baseGlow ?? 0

  if (existing && !axisChanged) {
    existing.uPaintRamp.value = config.rampTexture
    existing.uPaintRampBounds.value.set(config.axisBounds.min, config.axisBounds.max)
    existing.uPaintRampStrength.value = config.strength
    existing.uPaintRampMatrix.value.copy(config.meshToVehicleLocal)
    existing.uPaintDetailStrength.value = detailStrength
    existing.uPaintDetailWeights.value.copy(detailWeights)
    existing.uPaintRimColor.value.copy(rimColor)
    existing.uPaintRimIntensity.value = rimIntensity
    existing.uPaintRimPower.value = rimPower
    existing.uPaintRimBias.value = rimBias
    existing.uPaintBaseGlow.value = baseGlow
    return
  }

  const uniforms: PaintRampUniformBag = {
    uPaintRamp: { value: config.rampTexture },
    uPaintRampBounds: {
      value: new THREE.Vector2(config.axisBounds.min, config.axisBounds.max),
    },
    uPaintRampStrength: { value: config.strength },
    uPaintRampMatrix: { value: config.meshToVehicleLocal.clone() },
    uPaintDetailStrength: { value: detailStrength },
    uPaintDetailWeights: { value: detailWeights.clone() },
    uPaintRimColor: { value: rimColor.clone() },
    uPaintRimIntensity: { value: rimIntensity },
    uPaintRimPower: { value: rimPower },
    uPaintRimBias: { value: rimBias },
    uPaintBaseGlow: { value: baseGlow },
  }
  userData.paintRampUniforms = uniforms
  userData.paintRampAxis = config.axis

  const axisSwizzle = config.axis

  material.onBeforeCompile = (shader): void => {
    shader.uniforms.uPaintRamp = uniforms.uPaintRamp
    shader.uniforms.uPaintRampBounds = uniforms.uPaintRampBounds
    shader.uniforms.uPaintRampStrength = uniforms.uPaintRampStrength
    shader.uniforms.uPaintRampMatrix = uniforms.uPaintRampMatrix
    shader.uniforms.uPaintDetailStrength = uniforms.uPaintDetailStrength
    shader.uniforms.uPaintDetailWeights = uniforms.uPaintDetailWeights
    shader.uniforms.uPaintRimColor = uniforms.uPaintRimColor
    shader.uniforms.uPaintRimIntensity = uniforms.uPaintRimIntensity
    shader.uniforms.uPaintRimPower = uniforms.uPaintRimPower
    shader.uniforms.uPaintRimBias = uniforms.uPaintRimBias
    shader.uniforms.uPaintBaseGlow = uniforms.uPaintBaseGlow

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'uniform mat4 uPaintRampMatrix;',
          'varying float vPaintRampU;',
          'varying vec3 vPaintLocalPos;',
        ].join('\n'),
      )
      .replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          'vPaintLocalPos = (uPaintRampMatrix * vec4(position, 1.0)).xyz;',
          `vPaintRampU = vPaintLocalPos.${axisSwizzle};`,
        ].join('\n'),
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'uniform sampler2D uPaintRamp;',
          'uniform vec2 uPaintRampBounds;',
          'uniform float uPaintRampStrength;',
          'uniform float uPaintDetailStrength;',
          'uniform vec3 uPaintDetailWeights;',
          'uniform vec3 uPaintRimColor;',
          'uniform float uPaintRimIntensity;',
          'uniform float uPaintRimPower;',
          'uniform float uPaintRimBias;',
          'uniform float uPaintBaseGlow;',
          'varying float vPaintRampU;',
          'varying vec3 vPaintLocalPos;',
          'float paintHash21(vec2 p) {',
          '  p = fract(p * vec2(123.34, 456.21));',
          '  p += dot(p, p + 45.32);',
          '  return fract(p.x * p.y);',
          '}',
        ].join('\n'),
      )
      .replace(
        '#include <map_fragment>',
        [
          '#include <map_fragment>',
          '{',
          '  float rampRange = max(uPaintRampBounds.y - uPaintRampBounds.x, 0.0001);',
          '  float t = clamp((vPaintRampU - uPaintRampBounds.x) / rampRange, 0.0, 1.0);',
          '  vec3 rampColor = texture2D(uPaintRamp, vec2(t, 0.5)).rgb;',
          '  vec3 paintDetail = vec3(1.0);',
          '  if (uPaintDetailStrength > 0.0) {',
          '    float seamCount = 8.0;',
          '    float seam = abs(fract(t * seamCount + 0.5) - 0.5);',
          '    float seamMask = smoothstep(0.0, 0.012, seam);',
          '    float seamShadeRaw = mix(0.78, 1.0, seamMask);',
          '    float seamShade = mix(1.0, seamShadeRaw, uPaintDetailWeights.x);',
          '    vec2 scuffCell = floor(vPaintLocalPos.xy * 0.06);',
          '    float scuffNoise = paintHash21(scuffCell);',
          '    float scuffShadeRaw = mix(0.94, 1.0, smoothstep(0.4, 0.78, scuffNoise));',
          '    float scuffShade = mix(1.0, scuffShadeRaw, uPaintDetailWeights.y);',
          '    vec2 grainCell = floor(vPaintLocalPos.xy * 0.4 + vPaintLocalPos.zz * 0.4);',
          '    float grainNoise = paintHash21(grainCell);',
          '    float grainShadeRaw = mix(0.97, 1.0, grainNoise);',
          '    float grainShade = mix(1.0, grainShadeRaw, uPaintDetailWeights.z);',
          '    paintDetail = vec3(seamShade * scuffShade * grainShade);',
          '    paintDetail = mix(vec3(1.0), paintDetail, uPaintDetailStrength);',
          '  }',
          '  diffuseColor.rgb *= mix(vec3(1.0), rampColor, uPaintRampStrength) * paintDetail;',
          '}',
        ].join('\n'),
      )
      .replace(
        '#include <emissivemap_fragment>',
        [
          '#include <emissivemap_fragment>',
          '{',
          '  if (uPaintRimIntensity > 0.0) {',
          '    vec3 rimN = normalize(vNormal);',
          '    vec3 rimV = normalize(vViewPosition);',
          '    float rimFresnel = 1.0 - clamp(dot(rimN, rimV), 0.0, 1.0);',
          '    float rimShape = pow(clamp(rimFresnel + uPaintRimBias, 0.0, 1.0),',
          '                          max(uPaintRimPower, 0.0001));',
          '    totalEmissiveRadiance += uPaintRimColor * (rimShape * uPaintRimIntensity);',
          '  }',
          '  if (uPaintBaseGlow > 0.0) {',
          '    totalEmissiveRadiance += diffuseColor.rgb * uPaintBaseGlow;',
          '  }',
          '}',
        ].join('\n'),
      )
  }
  material.needsUpdate = true
}

/**
 * Update only the gradient texture on an already-prepared material.
 * No-op if the material was never wired through {@link applyPaintRampShader}.
 *
 * @param material - Material previously prepared by {@link applyPaintRampShader}.
 * @param rampTexture - Replacement gradient texture (typically from the cache).
 */
export function updatePaintRampTexture(
  material: THREE.Material,
  rampTexture: THREE.Texture,
): void {
  const userData = material.userData as PaintRampUserData
  const uniforms = userData.paintRampUniforms
  if (!uniforms) return
  uniforms.uPaintRamp.value = rampTexture
}

/**
 * Adjust ramp tint, procedural detail, and self-illumination strengths on the
 * fly. Setting all three to zero short-circuits the shader injection at
 * runtime — the chunks still run but their results all multiply by zero, so
 * the material renders identically to its base PBR pipeline. Useful for
 * reverting to a stock factory finish without forcing a shader recompile.
 *
 * @param material - Material previously prepared by {@link applyPaintRampShader}.
 * @param strength - Ramp tint mix strength (0 = off).
 * @param detailStrength - Procedural detail strength (0 = off).
 * @param baseGlow - Self-illumination strength as a fraction of paint color
 *   (0 = off). Optional; defaults to 0 so existing call sites keep their
 *   behaviour.
 */
export function setPaintRampStrength(
  material: THREE.Material,
  strength: number,
  detailStrength: number,
  baseGlow = 0,
): void {
  const userData = material.userData as PaintRampUserData
  const uniforms = userData.paintRampUniforms
  if (!uniforms) return
  uniforms.uPaintRampStrength.value = strength
  uniforms.uPaintDetailStrength.value = detailStrength
  uniforms.uPaintBaseGlow.value = baseGlow
}

/**
 * Update the per-component detail weights on an already-prepared material.
 * Each component (`x`=seam, `y`=scuff, `z`=grain) is multiplied on top of the
 * master `detailStrength`, so setting a component to zero kills only that
 * component while leaving the others active. Used by the multitool to request
 * grain-only detail (no panel seams on a non-panelled mechanical prop).
 *
 * @param material - Material previously prepared by {@link applyPaintRampShader}.
 * @param weights - `(seam, scuff, grain)` weights — typically each in `[0, 1]`.
 */
export function setPaintRampDetailWeights(
  material: THREE.Material,
  weights: THREE.Vector3,
): void {
  const userData = material.userData as PaintRampUserData
  const uniforms = userData.paintRampUniforms
  if (!uniforms) return
  uniforms.uPaintDetailWeights.value.copy(weights)
}

/**
 * Update the rim-light uniforms on an already-prepared material. Setting
 * `intensity` to zero short-circuits the rim branch in the shader, so this is
 * also how the bypass path turns rim glow off without recompiling.
 *
 * @param material - Material previously prepared by {@link applyPaintRampShader}.
 * @param color - Rim tint added to `totalEmissiveRadiance` before tonemapping.
 * @param intensity - Rim strength multiplier (0 = off).
 * @param power - Fresnel exponent. Higher = thinner edge. Typical 1.5–4.
 * @param bias - Additive Fresnel bias. Negative trims rim to grazing only.
 */
export function setPaintRampRim(
  material: THREE.Material,
  color: THREE.Color,
  intensity: number,
  power: number,
  bias: number,
): void {
  const userData = material.userData as PaintRampUserData
  const uniforms = userData.paintRampUniforms
  if (!uniforms) return
  uniforms.uPaintRimColor.value.copy(color)
  uniforms.uPaintRimIntensity.value = intensity
  uniforms.uPaintRimPower.value = power
  uniforms.uPaintRimBias.value = bias
}
