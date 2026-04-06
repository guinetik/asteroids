import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'

const DEFAULT_GRID_SIZE = 2000
const DEFAULT_GRID_RESOLUTION = 80
const GRID_COLOR = 0x333366
const GRID_OPACITY = 0.4

/**
 * Gaussian well parameters — ported from gcanvas spacetime demo.
 * VISUAL_DEPTH_SCALE controls how dramatically mass warps the grid.
 * Real spacetime curvature is imperceptible at solar system scale,
 * so we exaggerate while preserving correct mass ratios between bodies.
 */
const DEFAULT_VISUAL_DEPTH_SCALE = 160
const DEFAULT_VISUAL_WIDTH_SCALE = 200
const DEFAULT_MASS_EXPONENT = 0.5
const WELL_PULSE_SPEED = 1.5
const WELL_PULSE_AMOUNT = 0.08

/**
 * Mass in solar masses (M☉). Real ratios between bodies:
 * Sun = 1.0, Jupiter = 0.000955, Saturn = 0.000286, Earth = 0.000003
 * The visual deformation uses sqrt(mass) so even small planets show some effect.
 */
export interface GravitySource {
  x: number
  z: number
  mass: number // in solar masses (M☉)
  /**
   * Multiplies Gaussian σ (well radius on the sheet) for this source only; depth at the
   * center stays the same. Default 1. Map scene uses &gt;1 for gas giants.
   */
  wellWidthMultiplier?: number
}

/**
 * Per-frame tuning for wireframe deformation (map view passes camera-derived bounds).
 * Analytical {@link SpaceTimeGrid.getDepthAt} / {@link SpaceTimeGrid.getSlopeAt} ignore this;
 * only the line-mesh vertex pass uses it.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export interface SpaceTimeGridVisualDeformBudget {
  /**
   * Multiplies the resolution-based deform interval (integer, ≥1).
   * Use >1 when the camera is far (whole grid visible) to skip redundant work.
   */
  intervalScale: number
  /**
   * When true, only vertices inside the XZ cull rectangle (plus gravity wells) are
   * updated each pass; outer vertices are occasionally refreshed on a slower cycle.
   */
  useSpatialCull: boolean
  /** Center X of the view cull rectangle in world space. */
  cullCenterX: number
  /** Center Z of the view cull rectangle in world space. */
  cullCenterZ: number
  /** Half-width in X of the cull rectangle (before margin). */
  cullHalfExtentX: number
  /** Half-depth in Z of the cull rectangle (before margin). */
  cullHalfExtentZ: number
}

/** Expands the cull box so edge lines are less likely to “detach” from the frustum. */
const DEFORM_CULL_MARGIN = 1.22

/**
 * While spatial culling is on, run a full-grid deform every N deform passes so distant
 * wire does not stay stale if the camera or bodies change.
 */
const FULL_DEFORM_REFRESH_INTERVAL = 56

/** Minimum world radius around a body that always receives deform updates when culling. */
const SOURCE_INFLUENCE_RADIUS_MIN = 55

/** Multiplier on Gaussian σ (via width scale) for the always-update disk around a source. */
const SOURCE_INFLUENCE_SIGMA_MULT = 4.25

/**
 * Space-time grid on the XZ plane with gravitational well deformation.
 * Vertices warp downward near massive bodies using a Gaussian profile,
 * creating the classic "rubber sheet" visualization of curved spacetime.
 *
 * Math ported from gcanvas spacetime demo (Gaussian well model).
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export class SpaceTimeGrid implements Tickable {
  readonly mesh: THREE.LineSegments

  private readonly geometry: THREE.BufferGeometry
  private readonly basePositions: Float32Array
  private readonly sources: GravitySource[] = []
  private readonly staticSources: GravitySource[] = []
  private time = 0
  private frameCounter = 0
  /** Base deform cadence from resolution (see constructor). */
  private readonly baseUpdateInterval: number
  /** Integer ≥1 — set from {@link SpaceTimeGrid.setVisualDeformBudget}. */
  private intervalScaleEffective = 1
  private visualBudget: SpaceTimeGridVisualDeformBudget | null = null
  private spatialCullPassCounter = 0
  private readonly gridSize: number
  private readonly gridResolution: number
  private readonly depthScale: number
  private readonly widthScale: number
  private readonly massExponent: number

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
    // Deform every Nth frame. Higher resolution grids can skip more frames.
    // Gravity wells move at orbital speed so even 1fps deformation looks smooth.
    this.baseUpdateInterval = gridResolution > 150 ? 4 : gridResolution > 100 ? 3 : 1
    this.geometry = this.createGridGeometry()
    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute
    this.basePositions = new Float32Array(posAttr.array as Float32Array)

    const material = new THREE.LineBasicMaterial({
      color: GRID_COLOR,
      transparent: true,
      opacity: GRID_OPACITY,
    })

    this.mesh = new THREE.LineSegments(this.geometry, material)
  }

  addSource(source: GravitySource): void {
    this.sources.push(source)
  }

  /** Add a source that persists across clearSources() calls (e.g. the Sun). */
  addStaticSource(source: GravitySource): void {
    this.staticSources.push(source)
  }

  clearSources(): void {
    this.sources.length = 0
  }

  /**
   * Sets how aggressively the wireframe vertex pass skips work (map view).
   * Pass `null` to restore defaults (full grid, minimum interval).
   *
   * @param budget - Camera-driven LOD, or `null` for shuttle / other scenes.
   */
  setVisualDeformBudget(budget: SpaceTimeGridVisualDeformBudget | null): void {
    this.visualBudget = budget
    this.intervalScaleEffective =
      budget === null ? 1 : Math.max(1, Math.ceil(budget.intervalScale))
  }

  /**
   * Rebuilds all line vertices immediately (e.g. grid toggled visible).
   */
  forceFullVisualDeform(): void {
    this.frameCounter = 0
    this.spatialCullPassCounter = 0
    if (this.mesh.visible) {
      this.deformGrid(true)
    }
  }

  tick(dt: number): void {
    this.time += dt
    if (!this.mesh.visible) {
      return
    }

    this.frameCounter++
    const threshold = this.baseUpdateInterval * this.intervalScaleEffective
    if (this.frameCounter >= threshold) {
      this.frameCounter = 0
      this.deformGrid(false)
    }
  }

  dispose(): void {
    this.geometry.dispose()
    ;(this.mesh.material as THREE.LineBasicMaterial).dispose()
  }

  /**
   * Gaussian well depth at a point.
   * depth = A * exp(-r²/2σ²)
   * More mass = wider and deeper well (pow(mass, exponent) scaling).
   * Includes subtle pulsing animation.
   */
  getDepthAt(x: number, z: number): number {
    let totalDepth = 0
    const pulse = 1 + WELL_PULSE_AMOUNT * Math.sin(this.time * WELL_PULSE_SPEED)

    for (let s = 0; s < 2; s++) {
      const arr = s === 0 ? this.staticSources : this.sources
      for (const source of arr) {
        const dx = x - source.x
        const dz = z - source.z
        const rSquared = dx * dx + dz * dz

        const widthMul = source.wellWidthMultiplier ?? 1
        const massFactor = Math.sign(source.mass) * Math.pow(Math.abs(source.mass), this.massExponent)
        const sigma = this.widthScale * massFactor * widthMul
        const amplitude = this.depthScale * massFactor * pulse

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
    const pulse = 1 + WELL_PULSE_AMOUNT * Math.sin(this.time * WELL_PULSE_SPEED)

    for (let s = 0; s < 2; s++) {
      const arr = s === 0 ? this.staticSources : this.sources
      for (const source of arr) {
        const dx = x - source.x
        const dz = z - source.z
        const rSquared = dx * dx + dz * dz

        const widthMul = source.wellWidthMultiplier ?? 1
        const massFactor = Math.sign(source.mass) * Math.pow(Math.abs(source.mass), this.massExponent)
        const sigma = this.widthScale * massFactor * widthMul
        const sigmaSq = sigma * sigma
        const amplitude = this.depthScale * massFactor * pulse
        const depth = amplitude * Math.exp(-rSquared / (2 * sigmaSq))

        // Gradient points toward the source (downhill into the well)
        gradX += depth * -dx / sigmaSq
        gradZ += depth * -dz / sigmaSq
      }
    }

    // Dot with movement direction: positive = moving downhill
    return gradX * dirX + gradZ * dirZ
  }

  /**
   * @param forceAllVertices - When true, ignores spatial cull (full refresh).
   */
  private deformGrid(forceAllVertices: boolean): void {
    if (!this.mesh.visible) {
      return
    }

    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute
    const positions = posAttr.array as Float32Array

    const budget = this.visualBudget
    const useCull = !forceAllVertices && budget !== null && budget.useSpatialCull
    let doFull = forceAllVertices || !useCull

    if (useCull) {
      this.spatialCullPassCounter++
      if (this.spatialCullPassCounter >= FULL_DEFORM_REFRESH_INTERVAL) {
        this.spatialCullPassCounter = 0
        doFull = true
      }
    }

    const halfW =
      budget === null ? 0 : Math.max(0, budget.cullHalfExtentX) * DEFORM_CULL_MARGIN
    const halfH =
      budget === null ? 0 : Math.max(0, budget.cullHalfExtentZ) * DEFORM_CULL_MARGIN
    const cx = budget?.cullCenterX ?? 0
    const cz = budget?.cullCenterZ ?? 0

    for (let i = 0; i < positions.length; i += 3) {
      const x = this.basePositions[i]!
      const z = this.basePositions[i + 2]!

      if (!doFull && useCull) {
        const inBox = Math.abs(x - cx) <= halfW && Math.abs(z - cz) <= halfH
        if (!inBox && !this.isNearGravitySource(x, z)) {
          continue
        }
      }

      positions[i] = x
      positions[i + 1] = -this.getDepthAt(x, z)
      positions[i + 2] = z
    }

    posAttr.needsUpdate = true
  }

  /** True if (x,z) lies inside an influence disk of any current gravity source. */
  private isNearGravitySource(x: number, z: number): boolean {
    for (let s = 0; s < 2; s++) {
      const arr = s === 0 ? this.staticSources : this.sources
      for (const source of arr) {
        const dx = x - source.x
        const dz = z - source.z
        const rSquared = dx * dx + dz * dz
        const widthMul = source.wellWidthMultiplier ?? 1
        const massFactor = Math.pow(Math.abs(source.mass), this.massExponent)
        const radius = Math.max(
          SOURCE_INFLUENCE_RADIUS_MIN,
          SOURCE_INFLUENCE_SIGMA_MULT * this.widthScale * massFactor * widthMul,
        )
        if (rSquared <= radius * radius) {
          return true
        }
      }
    }
    return false
  }

  /**
   * Build a grid of line segments on the XZ plane.
   * Creates both horizontal and vertical lines as LineSegments pairs.
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
