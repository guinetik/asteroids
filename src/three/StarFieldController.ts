import * as THREE from 'three'

const DEFAULT_STAR_COUNT = 3000
const DEFAULT_STAR_SPHERE_RADIUS = 10000
const DEFAULT_STAR_SIZE = 3

/** Optional config for customizing the starfield. */
export interface StarFieldConfig {
  /** Number of stars. Default 3000. */
  count?: number
  /** Radius of the star sphere. Default 10000. */
  radius?: number
  /** Point size. Default 3. */
  size?: number
}

/**
 * Static particle star background rendered as a sphere of random points.
 * Provides depth parallax as the camera moves through the scene.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export class StarFieldController {
  readonly points: THREE.Points

  constructor(config?: StarFieldConfig) {
    const starCount = config?.count ?? DEFAULT_STAR_COUNT
    const sphereRadius = config?.radius ?? DEFAULT_STAR_SPHERE_RADIUS
    const starSize = config?.size ?? DEFAULT_STAR_SIZE
    const positions = new Float32Array(starCount * 3)

    for (let i = 0; i < starCount; i++) {
      const i3 = i * 3
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = sphereRadius * (0.8 + Math.random() * 0.2)

      positions[i3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i3 + 2] = r * Math.cos(phi)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: starSize,
      sizeAttenuation: true,
      depthWrite: false,
    })

    this.points = new THREE.Points(geometry, material)
  }

  dispose(): void {
    this.points.geometry.dispose()
    ;(this.points.material as THREE.PointsMaterial).dispose()
  }
}
