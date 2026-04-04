/**
 * A single outbound portal wall — a vertical grid of red line segments
 * that fades in based on proximity to the player.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-portal-boundary-design.md
 */
import * as THREE from 'three'

const WALL_COLOR = 0xff2222
const WALL_MAX_OPACITY = 0.6
const WALL_GRID_SEGMENTS = 20

/** Axis the wall is perpendicular to. */
export type WallAxis = 'x' | 'z'

/**
 * A single portal boundary wall.
 * Call {@link updateOpacity} each frame with the shuttle's distance to this wall.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-portal-boundary-design.md
 */
export class PortalBoundary {
  readonly mesh: THREE.LineSegments
  private readonly material: THREE.LineBasicMaterial

  /** The wall's fixed coordinate on its perpendicular axis. */
  readonly wallPosition: number

  /** Which axis this wall is perpendicular to. */
  readonly axis: WallAxis

  constructor(position: number, axis: WallAxis, width: number, height: number) {
    this.wallPosition = position
    this.axis = axis

    this.material = new THREE.LineBasicMaterial({
      color: WALL_COLOR,
      transparent: true,
      opacity: 0,
    })

    const geometry = this.createGridGeometry(width, height)
    this.mesh = new THREE.LineSegments(geometry, this.material)

    // Position and orient the wall
    if (axis === 'x') {
      this.mesh.position.set(position, 0, 0)
    } else {
      this.mesh.position.set(0, 0, position)
      this.mesh.rotation.y = Math.PI / 2
    }
  }

  /** Update wall opacity based on distance from the shuttle. 0 = invisible, 1 = closest. */
  updateOpacity(distance: number, visibilityDistance: number): void {
    if (distance >= visibilityDistance) {
      this.material.opacity = 0
    } else {
      const t = 1 - distance / visibilityDistance
      this.material.opacity = WALL_MAX_OPACITY * t
    }
  }

  /** Clean up geometry and material. */
  dispose(): void {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }

  private createGridGeometry(width: number, height: number): THREE.BufferGeometry {
    const vertices: number[] = []
    const halfWidth = width / 2
    const hStep = width / WALL_GRID_SEGMENTS
    const vStep = height / WALL_GRID_SEGMENTS

    // Horizontal lines (along width, at each height step)
    for (let row = 0; row <= WALL_GRID_SEGMENTS; row++) {
      const y = row * vStep
      vertices.push(-halfWidth, y, 0)
      vertices.push(halfWidth, y, 0)
    }

    // Vertical lines (along height, at each width step)
    for (let col = 0; col <= WALL_GRID_SEGMENTS; col++) {
      const x = -halfWidth + col * hStep
      vertices.push(x, 0, 0)
      vertices.push(x, height, 0)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    return geometry
  }
}
