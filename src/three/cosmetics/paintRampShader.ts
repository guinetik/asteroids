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

  if (existing && !axisChanged) {
    existing.uPaintRamp.value = config.rampTexture
    existing.uPaintRampBounds.value.set(config.axisBounds.min, config.axisBounds.max)
    existing.uPaintRampStrength.value = config.strength
    existing.uPaintRampMatrix.value.copy(config.meshToVehicleLocal)
    return
  }

  const uniforms: PaintRampUniformBag = {
    uPaintRamp: { value: config.rampTexture },
    uPaintRampBounds: {
      value: new THREE.Vector2(config.axisBounds.min, config.axisBounds.max),
    },
    uPaintRampStrength: { value: config.strength },
    uPaintRampMatrix: { value: config.meshToVehicleLocal.clone() },
  }
  userData.paintRampUniforms = uniforms
  userData.paintRampAxis = config.axis

  const axisSwizzle = config.axis

  material.onBeforeCompile = (shader): void => {
    shader.uniforms.uPaintRamp = uniforms.uPaintRamp
    shader.uniforms.uPaintRampBounds = uniforms.uPaintRampBounds
    shader.uniforms.uPaintRampStrength = uniforms.uPaintRampStrength
    shader.uniforms.uPaintRampMatrix = uniforms.uPaintRampMatrix

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'uniform mat4 uPaintRampMatrix;',
          'varying float vPaintRampU;',
        ].join('\n'),
      )
      .replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          `vPaintRampU = (uPaintRampMatrix * vec4(position, 1.0)).${axisSwizzle};`,
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
          'varying float vPaintRampU;',
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
          '  diffuseColor.rgb *= mix(vec3(1.0), rampColor, uPaintRampStrength);',
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
