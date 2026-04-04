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
}

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
  private time = 0
  private frameCounter = 0
  private readonly updateInterval: number
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
    this.updateInterval = gridResolution > 150 ? 4 : gridResolution > 100 ? 2 : 1
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

  clearSources(): void {
    this.sources.length = 0
  }

  tick(dt: number): void {
    this.time += dt
    this.frameCounter++
    if (this.frameCounter >= this.updateInterval) {
      this.frameCounter = 0
      this.deformGrid()
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

    for (const source of this.sources) {
      const dx = x - source.x
      const dz = z - source.z
      const rSquared = dx * dx + dz * dz

      const massFactor = Math.pow(source.mass, this.massExponent)
      const sigma = this.widthScale * massFactor
      const baseAmplitude = this.depthScale * massFactor

      const pulse = 1 + WELL_PULSE_AMOUNT * Math.sin(this.time * WELL_PULSE_SPEED)
      const amplitude = baseAmplitude * pulse

      totalDepth += amplitude * Math.exp(-rSquared / (2 * sigma * sigma))
    }

    return totalDepth
  }

  private deformGrid(): void {
    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute
    const positions = posAttr.array as Float32Array

    for (let i = 0; i < positions.length; i += 3) {
      const x = this.basePositions[i]!
      const z = this.basePositions[i + 2]!

      // Deform Y downward based on gravitational well
      positions[i] = x
      positions[i + 1] = -this.getDepthAt(x, z)
      positions[i + 2] = z
    }

    posAttr.needsUpdate = true
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
