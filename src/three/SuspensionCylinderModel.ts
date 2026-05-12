/**
 * Placeholder Three.js model for the Yamada suspension cylinder — a large
 * vertical glass cylinder housing a sleeping pig, mounted on a base, with an
 * indicator strip. Shared by Bunker Protect (interactable — reboot) and
 * Bunker Extract (dispense source for the organ case).
 *
 * Real art is deferred. This placeholder uses primitive geometry + a
 * translucent emissive material so the gameplay can be built and tested
 * before final assets land.
 *
 * @author guinetik
 * @date 2026-05-11
 * @spec docs/superpowers/specs/2026-05-11-yamada-mission-pool-design.md
 */
import * as THREE from 'three'

/** World-space interaction range for the cylinder. Matches existing terminal range. */
export const CYLINDER_INTERACT_RANGE = 8.0

/** Visible cylinder height. */
const CYLINDER_HEIGHT = 4.0

/** Visible cylinder radius. */
const CYLINDER_RADIUS = 1.0

/** Base platform height. */
const BASE_HEIGHT = 0.4

/** Pale clinical green for the cylinder glass (Yamada palette). */
const GLASS_COLOR = 0x9be7c4

/** Calm Yamada green for the indicator strip. */
const INDICATOR_COLOR = 0x4dd17b

/** Dark grey for the base platform. */
const BASE_COLOR = 0x2a3a44

/** Skin tone for the suspended pig capsule. */
const PIG_COLOR = 0xeac4b8

/** Glass transparency / opacity / emissive tuning. */
const GLASS_OPACITY = 0.35
const GLASS_ROUGHNESS = 0.1
const GLASS_METALNESS = 0.1
const GLASS_EMISSIVE_INTENSITY = 0.15

/** Base mesh roughness. */
const BASE_ROUGHNESS = 0.7

/** Pig mesh roughness. */
const PIG_ROUGHNESS = 0.85

/** Radial / vertical / fill scale factors. */
const BASE_TOP_RADIUS_FACTOR = 1.4
const BASE_BOTTOM_RADIUS_FACTOR = 1.6
const GLASS_RADIAL_SEGMENTS = 32
const BASE_RADIAL_SEGMENTS = 24
const PIG_RADIUS_FACTOR = 0.6
const PIG_LENGTH_FACTOR = 0.45
const PIG_CAPS_SEGMENTS = 8
const PIG_RADIAL_SEGMENTS = 16
const INDICATOR_WIDTH_FACTOR = 0.3
const INDICATOR_HEIGHT_FACTOR = 0.05
const INDICATOR_THICKNESS = 0.05
const INDICATOR_VERTICAL_FRACTION = 0.9
const INDICATOR_FORWARD_OFFSET = 0.05

/**
 * Controller for the suspension cylinder. Owns a single root `THREE.Group`
 * that callers parent into the bunker scene at the desired world position.
 * The public field is named `group` to match `BunkerTableModel` so the two
 * can be used interchangeably as the bunker's central interactable.
 */
export class SuspensionCylinderModel {
  /** Root Object3D — parent into the bunker scene. */
  public readonly group: THREE.Group

  /** Indicator strip — toggle visibility during dispense animation. */
  private readonly indicator: THREE.Mesh

  /** Build the full placeholder hierarchy. */
  public constructor() {
    this.group = new THREE.Group()

    const baseGeom = new THREE.CylinderGeometry(
      CYLINDER_RADIUS * BASE_TOP_RADIUS_FACTOR,
      CYLINDER_RADIUS * BASE_BOTTOM_RADIUS_FACTOR,
      BASE_HEIGHT,
      BASE_RADIAL_SEGMENTS,
    )
    const baseMat = new THREE.MeshStandardMaterial({
      color: BASE_COLOR,
      roughness: BASE_ROUGHNESS,
    })
    const base = new THREE.Mesh(baseGeom, baseMat)
    base.position.y = BASE_HEIGHT * 0.5
    this.group.add(base)

    const glassGeom = new THREE.CylinderGeometry(
      CYLINDER_RADIUS,
      CYLINDER_RADIUS,
      CYLINDER_HEIGHT,
      GLASS_RADIAL_SEGMENTS,
      1,
      true,
    )
    const glassMat = new THREE.MeshStandardMaterial({
      color: GLASS_COLOR,
      transparent: true,
      opacity: GLASS_OPACITY,
      roughness: GLASS_ROUGHNESS,
      metalness: GLASS_METALNESS,
      emissive: GLASS_COLOR,
      emissiveIntensity: GLASS_EMISSIVE_INTENSITY,
      side: THREE.DoubleSide,
    })
    const glass = new THREE.Mesh(glassGeom, glassMat)
    glass.position.y = BASE_HEIGHT + CYLINDER_HEIGHT * 0.5
    this.group.add(glass)

    const pigGeom = new THREE.CapsuleGeometry(
      CYLINDER_RADIUS * PIG_RADIUS_FACTOR,
      CYLINDER_HEIGHT * PIG_LENGTH_FACTOR,
      PIG_CAPS_SEGMENTS,
      PIG_RADIAL_SEGMENTS,
    )
    const pigMat = new THREE.MeshStandardMaterial({
      color: PIG_COLOR,
      roughness: PIG_ROUGHNESS,
    })
    const pig = new THREE.Mesh(pigGeom, pigMat)
    pig.rotation.z = Math.PI / 2
    pig.position.y = BASE_HEIGHT + CYLINDER_HEIGHT * 0.5
    this.group.add(pig)

    const indicatorGeom = new THREE.BoxGeometry(
      CYLINDER_RADIUS * INDICATOR_WIDTH_FACTOR,
      CYLINDER_HEIGHT * INDICATOR_HEIGHT_FACTOR,
      INDICATOR_THICKNESS,
    )
    const indicatorMat = new THREE.MeshBasicMaterial({ color: INDICATOR_COLOR })
    this.indicator = new THREE.Mesh(indicatorGeom, indicatorMat)
    this.indicator.position.set(
      0,
      BASE_HEIGHT + CYLINDER_HEIGHT * INDICATOR_VERTICAL_FRACTION,
      CYLINDER_RADIUS + INDICATOR_FORWARD_OFFSET,
    )
    this.group.add(this.indicator)
  }

  /**
   * Set the indicator strip on/off — call during dispense beat to suggest
   * activity. Replace with a real animation in the art pass.
   *
   * @param active - Whether the indicator is lit.
   */
  public setIndicatorActive(active: boolean): void {
    this.indicator.visible = active
  }

  /** Dispose all geometry and materials owned by the controller. */
  public dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose())
        } else {
          obj.material.dispose()
        }
      }
    })
  }
}
