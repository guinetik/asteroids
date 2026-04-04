/**
 * Renders a {@link Heightmap} as a wireframe line-segment grid on the XZ plane.
 * Pure renderer — all terrain math lives in the Heightmap.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/plans/2026-04-04-terrain-system.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { Heightmap } from '@/lib/terrain/heightmap'

const DEFAULT_GRID_RESOLUTION = 80
const GRID_COLOR = 0x665544
const GRID_OPACITY = 0.5

/**
 * Wireframe terrain renderer that reads heights from a {@link Heightmap}.
 * Delegates all terrain math (height, normal, slope) to the heightmap.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/plans/2026-04-04-terrain-system.md
 */
export class TerrainGrid implements Tickable {
  readonly mesh: THREE.LineSegments
  private readonly geometry: THREE.BufferGeometry
  private readonly heightmap: Heightmap

  constructor(heightmap: Heightmap, gridResolution = DEFAULT_GRID_RESOLUTION) {
    this.heightmap = heightmap
    this.geometry = this.createGridGeometry(heightmap.worldSize, gridResolution)
    this.applyHeights()

    const material = new THREE.LineBasicMaterial({
      color: GRID_COLOR,
      transparent: true,
      opacity: GRID_OPACITY,
    })
    this.mesh = new THREE.LineSegments(this.geometry, material)
  }

  /** Delegates to the underlying heightmap. */
  getHeightAt(x: number, z: number): number {
    return this.heightmap.heightAt(x, z)
  }

  tick(_dt: number): void {
    // Static terrain — no per-frame updates
  }

  dispose(): void {
    this.geometry.dispose()
    ;(this.mesh.material as THREE.LineBasicMaterial).dispose()
  }

  private applyHeights(): void {
    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute
    const positions = posAttr.array as Float32Array

    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 1] = this.heightmap.heightAt(positions[i]!, positions[i + 2]!)
    }

    posAttr.needsUpdate = true
    this.geometry.computeBoundingSphere()
  }

  private createGridGeometry(worldSize: number, resolution: number): THREE.BufferGeometry {
    const halfSize = worldSize / 2
    const step = worldSize / resolution
    const vertices: number[] = []

    for (let i = 0; i <= resolution; i++) {
      const z = -halfSize + i * step
      for (let j = 0; j < resolution; j++) {
        const x1 = -halfSize + j * step
        const x2 = x1 + step
        vertices.push(x1, 0, z, x2, 0, z)
      }
    }

    for (let i = 0; i <= resolution; i++) {
      const x = -halfSize + i * step
      for (let j = 0; j < resolution; j++) {
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
