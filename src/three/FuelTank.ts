/**
 * Visual fuel tank with a level indicator strip on top.
 *
 * Reusable component: an opaque metallic cylinder with a colored
 * plane on top that scales with the fuel ratio. Attach to any
 * scene and call {@link update} each frame with the current ratio.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd.md
 */
import * as THREE from 'three'

/** Configuration for a fuel tank visual. */
export interface FuelTankConfig {
  /** Cylinder radius in parent units */
  radius: number
  /** Cylinder length in parent units */
  length: number
  /** Position in parent space */
  position: THREE.Vector3
  /** Tank body color */
  color?: number
}

/**
 * Metallic cylinder with a fuel-level indicator strip on top.
 * The strip scales and shifts to drain from one end, with
 * green→yellow→red color coding.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd.md
 */
export class FuelTank {
  readonly group = new THREE.Group()

  private readonly indicator: THREE.Mesh
  private readonly indicatorMat: THREE.MeshStandardMaterial
  private readonly indicatorLength: number
  private readonly baseX: number

  constructor(config: FuelTankConfig) {
    const { radius, length, position } = config
    const tankColor = config.color ?? 0xcccccc

    // Opaque outer tank
    const tankGeo = new THREE.CylinderGeometry(radius, radius, length, 16)
    const tankMat = new THREE.MeshStandardMaterial({
      color: tankColor,
      metalness: 0.8,
      roughness: 0.3,
    })
    const tank = new THREE.Mesh(tankGeo, tankMat)
    tank.position.copy(position)
    tank.rotation.z = Math.PI / 2
    this.group.add(tank)

    // Fuel level indicator — slightly smaller cylinder inside the tank
    this.indicatorLength = length - 10
    const indicatorRadius = radius * 0.85
    const indicatorGeo = new THREE.CylinderGeometry(indicatorRadius, indicatorRadius, this.indicatorLength, 16)
    // Solid, depth-tested indicator. Previously used `depthTest: false` + `renderOrder`
    // to force the fuel colour to render on top of the tank shell (visible from inside
    // the cargo bay). That side effect also leaked the indicator through the shuttle
    // chassis when viewed from outside — drawing neon cylinders floating on the hull.
    // Normal opaque material lets the chassis properly occlude it.
    this.indicatorMat = new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      emissive: 0x00ff88,
      emissiveIntensity: 0.55,
      metalness: 0.2,
      roughness: 0.45,
    })
    this.indicator = new THREE.Mesh(indicatorGeo, this.indicatorMat)
    this.indicator.position.copy(position)
    this.indicator.rotation.z = Math.PI / 2
    this.indicator.visible = false
    this.baseX = position.x
    this.group.add(this.indicator)
  }

  /** Show or hide the indicator (e.g. when doors open/close). */
  setVisible(visible: boolean): void {
    this.indicator.visible = visible
  }

  /**
   * Update the fuel level display.
   * @param ratio - Fuel ratio 0–1 (0 = empty, 1 = full)
   */
  update(ratio: number): void {
    if (!this.indicator.visible) return

    const clamped = Math.max(0.01, ratio)
    this.indicator.scale.y = clamped

    // Drain from the nose end, anchored at the lander end (-X)
    const halfLength = this.indicatorLength / 2
    const offset = halfLength * (1 - clamped)
    this.indicator.position.x = this.baseX - offset

    // Color: green → yellow → red. Keep emissive in sync so the colour change reads
    // under the cargo-bay lighting when the player peeks in.
    const r = ratio < 0.5 ? 1 : 1 - (ratio - 0.5) * 2
    const g = ratio > 0.5 ? 1 : ratio * 2
    this.indicatorMat.color.setRGB(r, g, 0.2)
    this.indicatorMat.emissive.setRGB(r, g, 0.2)
  }

  dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    })
  }
}
