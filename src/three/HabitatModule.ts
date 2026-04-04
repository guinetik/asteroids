/**
 * Glass habitat cylinder for the shuttle cargo bay.
 *
 * Transparent cylinder with a metallic wireframe girder overlay.
 * This is where the player "lives" during transit. Will eventually
 * support a Vue overlay UI when clicked.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd.md
 */
import * as THREE from 'three'

/** Configuration for the habitat module. */
export interface HabitatConfig {
  /** Cylinder radius */
  radius: number
  /** Cylinder length */
  length: number
  /** Position in parent space */
  position: THREE.Vector3
}

const GLASS_COLOR = 0x88ccff
const GLASS_OPACITY = 0.15
const GIRDER_COLOR = 0x888888
const GIRDER_SEGMENTS_RADIAL = 12
const GIRDER_SEGMENTS_HEIGHT = 6

/**
 * Transparent glass cylinder with metallic wireframe girders.
 * Add {@link group} to the scene. Call {@link setVisible} to
 * show/hide with the cargo doors.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd.md
 */
export class HabitatModule {
  readonly group = new THREE.Group()

  constructor(config: HabitatConfig) {
    const { radius, length, position } = config

    // Glass shell — transparent blue tint
    const glassGeo = new THREE.CylinderGeometry(radius, radius, length, 24, 1, true)
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: GLASS_COLOR,
      transparent: true,
      opacity: GLASS_OPACITY,
      roughness: 0.05,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const glass = new THREE.Mesh(glassGeo, glassMat)
    glass.position.copy(position)
    glass.rotation.z = Math.PI / 2
    this.group.add(glass)

    // Solid end cap — tank side only (cockpit side uses the model's door)
    const capGeo = new THREE.CircleGeometry(radius, 24)
    const capMat = new THREE.MeshStandardMaterial({
      color: 0xaaaaaa,
      metalness: 0.6,
      roughness: 0.4,
      side: THREE.DoubleSide,
    })
    const capBack = new THREE.Mesh(capGeo, capMat)
    capBack.position.set(position.x - length / 2, position.y, position.z)
    capBack.rotation.y = Math.PI / 2
    this.group.add(capBack)

    // Wireframe girder — top-half arc only (visible through open doors)
    const girderVerts: number[] = []
    const r = radius + 0.5
    const halfLen = length / 2
    const arcStart = 0 // top of cylinder in pre-rotation space = +Z
    const arcEnd = Math.PI // half circle

    // Horizontal arcs (top half only)
    for (let h = 0; h <= GIRDER_SEGMENTS_HEIGHT; h++) {
      const y = -halfLen + (h / GIRDER_SEGMENTS_HEIGHT) * length
      for (let s = 0; s < GIRDER_SEGMENTS_RADIAL; s++) {
        const a1 = arcStart + (s / GIRDER_SEGMENTS_RADIAL) * arcEnd
        const a2 = arcStart + ((s + 1) / GIRDER_SEGMENTS_RADIAL) * arcEnd
        girderVerts.push(
          Math.cos(a1) * r, y, Math.sin(a1) * r,
          Math.cos(a2) * r, y, Math.sin(a2) * r,
        )
      }
    }

    // Vertical bars (top half only)
    for (let s = 0; s <= GIRDER_SEGMENTS_RADIAL; s++) {
      const a = arcStart + (s / GIRDER_SEGMENTS_RADIAL) * arcEnd
      const cx = Math.cos(a) * r
      const cz = Math.sin(a) * r
      for (let h = 0; h < GIRDER_SEGMENTS_HEIGHT; h++) {
        const y1 = -halfLen + (h / GIRDER_SEGMENTS_HEIGHT) * length
        const y2 = -halfLen + ((h + 1) / GIRDER_SEGMENTS_HEIGHT) * length
        girderVerts.push(cx, y1, cz, cx, y2, cz)
      }
    }

    const girderGeo = new THREE.BufferGeometry()
    girderGeo.setAttribute('position', new THREE.Float32BufferAttribute(girderVerts, 3))
    const girderMat = new THREE.LineBasicMaterial({ color: GIRDER_COLOR })
    const girder = new THREE.LineSegments(girderGeo, girderMat)
    girder.position.copy(position)
    girder.rotation.z = Math.PI / 2
    this.group.add(girder)
  }

  /** Show or hide the habitat (e.g. when doors open/close). */
  setVisible(visible: boolean): void {
    this.group.visible = visible
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
