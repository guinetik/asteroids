import * as THREE from 'three'
import type { SpaceTimeGrid } from './SpaceTimeGrid'

const RING_SEGMENTS = 64
const DEFAULT_RING_COLOR = 0xff2222
const DEFAULT_RING_OPACITY = 0.5

/**
 * Visual ring showing a radius around a body.
 * Follows the spacetime grid curvature so it sits on the well surface.
 * Pluggable — attach to any Object3D. Used for influence and event horizon rings.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export class GravityRing {
  readonly ring: THREE.LineLoop
  private readonly radius: number
  private spaceTimeGrid: SpaceTimeGrid | null = null

  constructor(radius: number, color = DEFAULT_RING_COLOR, opacity = DEFAULT_RING_OPACITY) {
    this.radius = radius

    const positions = new Float32Array((RING_SEGMENTS + 1) * 3)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
    })

    this.ring = new THREE.LineLoop(geometry, material)
    this.ring.frustumCulled = false
  }

  setSpaceTimeGrid(grid: SpaceTimeGrid): void {
    this.spaceTimeGrid = grid
    this.update(0, 0, 0)
  }

  /**
   * Update ring vertex positions to follow grid curvature.
   * Call after the parent object moves or the grid deforms.
   *
   * @param parentX - World X of the parent body
   * @param parentY - World Y of the parent body
   * @param parentZ - World Z of the parent body
   */
  update(parentX: number, parentY: number, parentZ: number): void {
    const posAttr = this.ring.geometry.getAttribute('position') as THREE.BufferAttribute
    const positions = posAttr.array as Float32Array

    for (let i = 0; i <= RING_SEGMENTS; i++) {
      const angle = (i / RING_SEGMENTS) * Math.PI * 2
      const localX = Math.cos(angle) * this.radius
      const localZ = Math.sin(angle) * this.radius
      const wx = parentX + localX
      const wz = parentZ + localZ
      const wy = this.spaceTimeGrid
        ? -this.spaceTimeGrid.getDepthAt(wx, wz) + 0.5
        : 0.5

      // Positions relative to parent
      positions[i * 3] = localX
      positions[i * 3 + 1] = wy - parentY
      positions[i * 3 + 2] = localZ
    }

    posAttr.needsUpdate = true
  }

  dispose(): void {
    this.ring.geometry.dispose()
    ;(this.ring.material as THREE.LineBasicMaterial).dispose()
  }
}
