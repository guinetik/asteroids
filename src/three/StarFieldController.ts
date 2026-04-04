import * as THREE from 'three'

const STAR_COUNT = 3000
const STAR_SPHERE_RADIUS = 10000
const STAR_SIZE = 3

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

  constructor() {
    const positions = new Float32Array(STAR_COUNT * 3)

    for (let i = 0; i < STAR_COUNT; i++) {
      const i3 = i * 3
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = STAR_SPHERE_RADIUS * (0.8 + Math.random() * 0.2)

      positions[i3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i3 + 2] = r * Math.cos(phi)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: STAR_SIZE,
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
