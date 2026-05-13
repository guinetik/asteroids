/**
 * Space-time grid on the XZ plane with gravitational well deformation.
 * Vertices warp downward near massive bodies using a Gaussian profile,
 * creating the classic "rubber sheet" visualization of curved spacetime.
 *
 * Deformation runs entirely on the GPU via a ShaderMaterial — the CPU only
 * keeps the source list in sync via uniform packing each frame. Analytical
 * helpers ({@link SpaceTimeGrid.getDepthAt}, {@link SpaceTimeGrid.getSlopeAt})
 * stay on the CPU for physics consumers (gravity-surfing, ship Y-follow).
 *
 * @author guinetik
 * @date 2026-04-29
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import spaceTimeGridVertexShader from '@/three/shaders/spaceTimeGrid.vert.glsl?raw'
import spaceTimeGridFragmentShader from '@/three/shaders/spaceTimeGrid.frag.glsl?raw'

const DEFAULT_GRID_SIZE = 2000
const DEFAULT_GRID_RESOLUTION = 150
const GRID_COLOR = 0x333366
const GRID_OPACITY = 0.4

/** Scales how much of the local well must come from an anomaly to reach full white. */
const ANOMALY_LINE_WHITE_FRAC_SCALE = 1.12

/**
 * Normalizes anomaly-only depth into [0,1] white blend (absolute floor so the core reads).
 */
const ANOMALY_LINE_WHITE_DEPTH_SCALE = 0.065

/** Weight for {@link ANOMALY_LINE_WHITE_DEPTH_SCALE} term vs fractional blend. */
const ANOMALY_LINE_WHITE_ABS_WEIGHT = 0.65

/**
 * Gaussian well parameters — ported from gcanvas spacetime demo.
 * VISUAL_DEPTH_SCALE controls how dramatically mass warps the grid.
 * Real spacetime curvature is imperceptible at solar system scale,
 * so we exaggerate while preserving correct mass ratios between bodies.
 */
const DEFAULT_VISUAL_DEPTH_SCALE = 160
const DEFAULT_VISUAL_WIDTH_SCALE = 200
const DEFAULT_MASS_EXPONENT = 0.5
/** Rad/s — only applied to moving wells; static sources (e.g. Sun) stay steady. */
const WELL_PULSE_SPEED = 1.5

/** Peak fractional amplitude swing for moving wells only. */
const WELL_PULSE_AMOUNT = 0.08

/**
 * Radial vignette: alpha holds at 1 until {@link EDGE_FADE_START_RATIO} × halfGridSize,
 * then smooth-fades to 0 by {@link EDGE_FADE_END_RATIO} × halfGridSize. Hides the square
 * 2000-unit grid boundary at extreme camera angles by feathering it into a soft disk.
 */
const EDGE_FADE_START_RATIO = 0.5
/** Outer fade radius — beyond this, the grid is fully transparent. */
const EDGE_FADE_END_RATIO = 0.92

/**
 * Hard cap matching `MAX_SOURCES` in `spaceTimeGrid.vert.glsl`. Sources past this
 * index are dropped from the visual pass only — CPU getters still see them all,
 * so physics never diverges from the rendered grid except in the (rare) overflow.
 */
const MAX_SHADER_SOURCES = 32

/**
 * Mass in solar masses (M☉). Real ratios between bodies:
 * Sun = 1.0, Jupiter = 0.000955, Saturn = 0.000286, Earth = 0.000003
 * The visual deformation uses sqrt(mass) so even small planets show some effect.
 */
export interface GravitySource {
  /** World-space X coordinate of the source on the XZ plane. */
  x: number
  /** World-space Z coordinate of the source on the XZ plane. */
  z: number
  /** Mass in solar masses (M☉). Negative values produce upward bulges (e.g. portals). */
  mass: number
  /**
   * Multiplies Gaussian σ (well radius on the sheet) for this source only; depth at the
   * center stays the same. Default 1. Map scene uses &gt;1 for gas giants.
   */
  wellWidthMultiplier?: number
  /**
   * Multiplies well depth (Gaussian amplitude) only; default 1. Map anomalies use &gt;1
   * so depressions read stronger without widening σ as much.
   */
  wellDepthMultiplier?: number
  /**
   * When true, Gaussian contribution tints the wire white where it dominates (map anomalies).
   */
  isFabricAnomaly?: boolean
}

/**
 * Per-frame tuning for wireframe deformation. Retained for API compatibility — the
 * GPU shader runs every visible frame at full resolution, so culling and interval
 * scaling are unnecessary and ignored.
 *
 * @author guinetik
 * @date 2026-04-29
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export interface SpaceTimeGridVisualDeformBudget {
  /** Multiplies the resolution-based deform interval (ignored under shader deform). */
  intervalScale: number
  /** When true, only vertices near the camera are updated (ignored under shader deform). */
  useSpatialCull: boolean
  /** Center X of the view cull rectangle in world space (ignored). */
  cullCenterX: number
  /** Center Z of the view cull rectangle in world space (ignored). */
  cullCenterZ: number
  /** Half-width in X of the cull rectangle (ignored). */
  cullHalfExtentX: number
  /** Half-depth in Z of the cull rectangle (ignored). */
  cullHalfExtentZ: number
}

/** Converts a 24-bit RGB hex to normalized `[r,g,b]` for grid tinting. */
function gridHexToRgbUnit(hex: number): [number, number, number] {
  const r = ((hex >> 16) & 255) / 255
  const g = ((hex >> 8) & 255) / 255
  const b = (hex & 255) / 255
  return [r, g, b]
}

/**
 * GPU-deformed space-time grid. Geometry is uploaded once at construction;
 * per-frame work is just packing the source list into two `vec4` uniform arrays
 * and bumping a time uniform.
 */
export class SpaceTimeGrid implements Tickable {
  readonly mesh: THREE.LineSegments

  private readonly geometry: THREE.BufferGeometry
  private readonly material: THREE.ShaderMaterial
  private readonly sources: GravitySource[] = []
  private readonly staticSources: GravitySource[] = []
  private time = 0
  private readonly gridSize: number
  private readonly gridResolution: number
  private readonly depthScale: number
  private readonly widthScale: number
  private readonly massExponent: number
  /** Packed `(x, z, mass, depthMul)` × MAX_SHADER_SOURCES — backing store for `uSourceA`. */
  private readonly uSourceA: Float32Array
  /** Packed `(widthMul, isMoving, isAnomaly, _pad)` × MAX_SHADER_SOURCES — backing store for `uSourceB`. */
  private readonly uSourceB: Float32Array

  constructor(
    gridSize = DEFAULT_GRID_SIZE,
    gridResolution = DEFAULT_GRID_RESOLUTION,
    depthScale = DEFAULT_VISUAL_DEPTH_SCALE,
    widthScale = DEFAULT_VISUAL_WIDTH_SCALE,
    massExponent = DEFAULT_MASS_EXPONENT,
  ) {
    this.gridSize = gridSize
    this.gridResolution = gridResolution
    this.depthScale = depthScale
    this.widthScale = widthScale
    this.massExponent = massExponent
    this.uSourceA = new Float32Array(MAX_SHADER_SOURCES * 4)
    this.uSourceB = new Float32Array(MAX_SHADER_SOURCES * 4)

    this.geometry = this.createGridGeometry()

    const halfGrid = gridSize / 2
    const [br, bg, bb] = gridHexToRgbUnit(GRID_COLOR)
    this.material = new THREE.ShaderMaterial({
      vertexShader: spaceTimeGridVertexShader,
      fragmentShader: spaceTimeGridFragmentShader,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uDepthScale: { value: depthScale },
        uWidthScale: { value: widthScale },
        uMassExponent: { value: massExponent },
        uPulseSpeed: { value: WELL_PULSE_SPEED },
        uPulseAmount: { value: WELL_PULSE_AMOUNT },
        uSourceCount: { value: 0 },
        uSourceA: { value: this.uSourceA },
        uSourceB: { value: this.uSourceB },
        uBaselineColor: { value: new THREE.Vector3(br, bg, bb) },
        uOpacity: { value: GRID_OPACITY },
        uAnomFracScale: { value: ANOMALY_LINE_WHITE_FRAC_SCALE },
        uAnomDepthScale: { value: ANOMALY_LINE_WHITE_DEPTH_SCALE },
        uAnomAbsWeight: { value: ANOMALY_LINE_WHITE_ABS_WEIGHT },
        uFadeStart: { value: halfGrid * EDGE_FADE_START_RATIO },
        uFadeEnd: { value: halfGrid * EDGE_FADE_END_RATIO },
      },
    })

    this.mesh = new THREE.LineSegments(this.geometry, this.material)
  }

  /** Append a moving gravity source — receives the orbital pulse modulation. */
  addSource(source: GravitySource): void {
    this.sources.push(source)
  }

  /** Add a source that persists across {@link SpaceTimeGrid.clearSources} calls (e.g. the Sun). */
  addStaticSource(source: GravitySource): void {
    this.staticSources.push(source)
  }

  /** Remove all moving sources; static sources are untouched. */
  clearSources(): void {
    this.sources.length = 0
  }

  /**
   * Restores default line opacity and baseline tint (e.g. tactical map closed).
   * With shader deform, anomaly tinting is recomputed every frame from the
   * current source list, so this only resets the material-level overrides.
   */
  applyBaselineLineAppearance(): void {
    this.material.uniforms.uOpacity!.value = GRID_OPACITY
    const baselineColor = this.material.uniforms.uBaselineColor!.value as THREE.Vector3
    const [br, bg, bb] = gridHexToRgbUnit(GRID_COLOR)
    baselineColor.set(br, bg, bb)
    this.material.transparent = true
  }

  /**
   * Retained for API compatibility. Shader deform runs every visible frame at full
   * resolution, so the budget is ignored.
   *
   * @param _budget - Camera-driven LOD hint, no longer consumed.
   */
  setVisualDeformBudget(_budget: SpaceTimeGridVisualDeformBudget | null): void {
    // No-op: shader-based deform processes all vertices on the GPU each frame.
  }

  /**
   * Forces an immediate uniform resync. Cheap; mostly preserved so callers that
   * toggled grid visibility do not need conditional logic.
   */
  forceFullVisualDeform(): void {
    if (this.mesh.visible) {
      this.syncSourceUniforms()
    }
  }

  /** Frame tick — advances animation time and repacks the source uniform arrays. */
  tick(dt: number): void {
    this.time += dt
    if (!this.mesh.visible) {
      return
    }
    this.material.uniforms.uTime!.value = this.time
    this.syncSourceUniforms()
  }

  /** Releases GPU resources held by the grid mesh. */
  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }

  /**
   * Gaussian well depth at a point (CPU mirror of the vertex shader sum).
   * depth = A * exp(-r²/2σ²)
   * More mass = wider and deeper well (pow(mass, exponent) scaling).
   * Moving bodies use a subtle amplitude pulse; static sources (Sun) do not.
   *
   * @param x - World-space X position to sample.
   * @param z - World-space Z position to sample.
   */
  getDepthAt(x: number, z: number): number {
    let totalDepth = 0
    const movingPulse = 1 + WELL_PULSE_AMOUNT * Math.sin(this.time * WELL_PULSE_SPEED)

    for (let s = 0; s < 2; s++) {
      const arr = s === 0 ? this.staticSources : this.sources
      const amplitudePulse = s === 0 ? 1 : movingPulse
      for (const source of arr) {
        const dx = x - source.x
        const dz = z - source.z
        const rSquared = dx * dx + dz * dz

        const widthMul = source.wellWidthMultiplier ?? 1
        const depthMul = source.wellDepthMultiplier ?? 1
        const massFactor =
          Math.sign(source.mass) * Math.pow(Math.abs(source.mass), this.massExponent)
        const sigma = this.widthScale * massFactor * widthMul
        const amplitude = this.depthScale * massFactor * amplitudePulse * depthMul

        totalDepth += amplitude * Math.exp(-rSquared / (2 * sigma * sigma))
      }
    }

    return totalDepth
  }

  /**
   * Directional slope of the gravity well at a point.
   * Returns how much depth changes per unit distance in the given direction.
   * Positive = going downhill (toward a well), negative = going uphill (away).
   *
   * @param x - World X position
   * @param z - World Z position
   * @param dirX - Normalized movement direction X
   * @param dirZ - Normalized movement direction Z
   */
  getSlopeAt(x: number, z: number, dirX: number, dirZ: number): number {
    // Analytical gradient of the Gaussian: ∂depth/∂x = depth * (sx - x) / σ²
    let gradX = 0
    let gradZ = 0
    const movingPulse = 1 + WELL_PULSE_AMOUNT * Math.sin(this.time * WELL_PULSE_SPEED)

    for (let s = 0; s < 2; s++) {
      const arr = s === 0 ? this.staticSources : this.sources
      const amplitudePulse = s === 0 ? 1 : movingPulse
      for (const source of arr) {
        const dx = x - source.x
        const dz = z - source.z
        const rSquared = dx * dx + dz * dz

        const widthMul = source.wellWidthMultiplier ?? 1
        const depthMul = source.wellDepthMultiplier ?? 1
        const massFactor =
          Math.sign(source.mass) * Math.pow(Math.abs(source.mass), this.massExponent)
        const sigma = this.widthScale * massFactor * widthMul
        const sigmaSq = sigma * sigma
        const amplitude = this.depthScale * massFactor * amplitudePulse * depthMul
        const depth = amplitude * Math.exp(-rSquared / (2 * sigmaSq))

        // Gradient points toward the source (downhill into the well)
        gradX += (depth * -dx) / sigmaSq
        gradZ += (depth * -dz) / sigmaSq
      }
    }

    // Dot with movement direction: positive = moving downhill
    return gradX * dirX + gradZ * dirZ
  }

  /**
   * Packs `staticSources` then `sources` into the uniform Float32Arrays. Called
   * every visible tick — the underlying typed arrays are referenced by the
   * uniform `value` slots, so mutating them in place is sufficient for upload.
   */
  private syncSourceUniforms(): void {
    const a = this.uSourceA
    const b = this.uSourceB
    let idx = 0

    for (const source of this.staticSources) {
      if (idx >= MAX_SHADER_SOURCES) {
        break
      }
      this.writeSourceSlot(a, b, idx, source, false)
      idx++
    }
    for (const source of this.sources) {
      if (idx >= MAX_SHADER_SOURCES) {
        break
      }
      this.writeSourceSlot(a, b, idx, source, true)
      idx++
    }

    this.material.uniforms.uSourceCount!.value = idx
  }

  /** Writes one source into slot `idx` of the packed uniform arrays. */
  private writeSourceSlot(
    a: Float32Array,
    b: Float32Array,
    idx: number,
    source: GravitySource,
    isMoving: boolean,
  ): void {
    const off = idx * 4
    a[off] = source.x
    a[off + 1] = source.z
    a[off + 2] = source.mass
    a[off + 3] = source.wellDepthMultiplier ?? 1
    b[off] = source.wellWidthMultiplier ?? 1
    b[off + 1] = isMoving ? 1 : 0
    b[off + 2] = source.isFabricAnomaly ? 1 : 0
    b[off + 3] = 0
  }

  /**
   * Build a flat grid of line segments on the XZ plane. The geometry is
   * uploaded once and never re-touched — vertex deformation happens in the
   * vertex shader using the source uniform arrays.
   */
  private createGridGeometry(): THREE.BufferGeometry {
    const halfSize = this.gridSize / 2
    const step = this.gridSize / this.gridResolution
    const vertices: number[] = []

    // Lines along X (rows)
    for (let i = 0; i <= this.gridResolution; i++) {
      const z = -halfSize + i * step
      for (let j = 0; j < this.gridResolution; j++) {
        const x1 = -halfSize + j * step
        const x2 = x1 + step
        vertices.push(x1, 0, z, x2, 0, z)
      }
    }

    // Lines along Z (columns)
    for (let i = 0; i <= this.gridResolution; i++) {
      const x = -halfSize + i * step
      for (let j = 0; j < this.gridResolution; j++) {
        const z1 = -halfSize + j * step
        const z2 = z1 + step
        vertices.push(x, 0, z1, x, 0, z2)
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    return geometry
  }
}
