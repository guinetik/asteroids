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
import { loadGLB } from './loadGLB'

/** Configuration for the habitat module. */
export interface HabitatConfig {
  /** Cylinder radius */
  radius: number
  /** Cylinder length */
  length: number
  /** Position in parent space */
  position: THREE.Vector3
}

/** Target height for furniture models inside the cylinder. */
const FURNITURE_TARGET_HEIGHT = 110
/** Vertical offset — sits on the "floor" of the cylinder. */
const FURNITURE_FLOOR_Y = -55

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
          Math.cos(a1) * r,
          y,
          Math.sin(a1) * r,
          Math.cos(a2) * r,
          y,
          Math.sin(a2) * r,
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

  /**
   * Load and place furniture models inside the habitat cylinder.
   *
   * Both models are auto-scaled to fit the cylinder interior
   * and positioned in local cylinder space (pre-rotation).
   * The cylinder is rotated z = PI/2, so its axis runs along X.
   * In pre-rotation space: Y = cylinder axis, X/Z = cross-section.
   *
   * @param config - The same config used for the cylinder
   */
  async loadFurniture(config: HabitatConfig): Promise<void> {
    const { position } = config

    const [bedModel, tableModel] = await Promise.all([
      loadGLB('/models/bed.glb'),
      loadGLB('/models/table.glb'),
    ])

    // --- Bed: center of the cylinder (statement piece) ---
    const bedBox = new THREE.Box3().setFromObject(bedModel)
    const bedSize = bedBox.getSize(new THREE.Vector3())
    const bedMaxDim = Math.max(bedSize.x, bedSize.y, bedSize.z)
    const bedScale = FURNITURE_TARGET_HEIGHT / bedMaxDim
    bedModel.scale.setScalar(bedScale)

    // Rotate bed: tip 90° on X, flip so mattress faces up
    bedModel.rotation.set(Math.PI / 2, 0, 0)

    // Re-measure after scale+rotation and center on origin
    bedBox.setFromObject(bedModel)
    const bedCenter = bedBox.getCenter(new THREE.Vector3())
    bedModel.position.sub(bedCenter)

    // Place at cylinder center, on the floor
    // In pre-rotation space (before z=PI/2): Y = along cylinder axis
    const bedPivot = new THREE.Group()
    bedPivot.add(bedModel)
    bedPivot.position.copy(position)
    bedModel.position.z = FURNITURE_FLOOR_Y // floor of cross-section
    bedPivot.rotation.z = Math.PI / 2 // match cylinder rotation
    this.group.add(bedPivot)

    // --- Table: back wall (tank side, negative along axis) ---
    const tableBox = new THREE.Box3().setFromObject(tableModel)
    const tableSize = tableBox.getSize(new THREE.Vector3())
    const tableMaxDim = Math.max(tableSize.x, tableSize.y, tableSize.z)
    const tableScale = (FURNITURE_TARGET_HEIGHT * 1.4) / tableMaxDim
    tableModel.scale.setScalar(tableScale)

    // Rotate table: tip 90° on X, spin 180° on Y to face front
    tableModel.rotation.set(Math.PI / 2, Math.PI, 0)

    // Re-measure after scale+rotation and center on origin
    tableBox.setFromObject(tableModel)
    const tableCenter = tableBox.getCenter(new THREE.Vector3())
    tableModel.position.sub(tableCenter)

    // Place against tank-side wall
    const tablePivot = new THREE.Group()
    tablePivot.add(tableModel)
    tablePivot.position.copy(position)
    tablePivot.position.x -= 100 // this moves it closer to the fuel tank
    tablePivot.position.y += 0 // near tank wall
    tableModel.position.z = FURNITURE_FLOOR_Y // floor of cross-section
    tablePivot.rotation.z = Math.PI / 2 // match cylinder rotation
    this.group.add(tablePivot)
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
