import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'

const GRID_SIZE = 2000
const GRID_RESOLUTION = 80
const GRID_COLOR = 0x333366
const GRID_OPACITY = 0.4

/** Gaussian well parameters — ported from gcanvas spacetime demo */
const WELL_DEPTH = 75
const WELL_WIDTH = 4.0
const WELL_PULSE_SPEED = 1.5
const WELL_PULSE_AMOUNT = 0.08
const GRID_SCALE = 15

interface GravitySource {
  x: number
  z: number
  mass: number
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

  constructor() {
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

  tick(dt: number): void {
    this.time += dt
    this.deformGrid()
  }

  dispose(): void {
    this.geometry.dispose()
    ;(this.mesh.material as THREE.LineBasicMaterial).dispose()
  }

  /**
   * Gaussian well depth at a point.
   * depth = A * exp(-r²/2σ²)
   * More mass = wider and deeper well (sqrt scaling).
   * Includes subtle pulsing animation.
   */
  getDepthAt(x: number, z: number): number {
    let totalDepth = 0

    for (const source of this.sources) {
      const dx = x - source.x
      const dz = z - source.z
      const rSquared = dx * dx + dz * dz

      const sigma = WELL_WIDTH * Math.sqrt(source.mass) * GRID_SCALE
      const baseAmplitude = WELL_DEPTH * Math.sqrt(source.mass)

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
    const halfSize = GRID_SIZE / 2
    const step = GRID_SIZE / GRID_RESOLUTION
    const vertices: number[] = []

    // Lines along X (rows)
    for (let i = 0; i <= GRID_RESOLUTION; i++) {
      const z = -halfSize + i * step
      for (let j = 0; j < GRID_RESOLUTION; j++) {
        const x1 = -halfSize + j * step
        const x2 = x1 + step
        vertices.push(x1, 0, z, x2, 0, z)
      }
    }

    // Lines along Z (columns)
    for (let i = 0; i <= GRID_RESOLUTION; i++) {
      const x = -halfSize + i * step
      for (let j = 0; j < GRID_RESOLUTION; j++) {
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
