/**
 * Survey terminal — placeholder cube rendered at flat zone centers
 * for survey objectives. Player interacts in EVA to start/deliver surveys.
 *
 * @author guinetik
 * @date 2026-04-07
 * @spec docs/superpowers/specs/2026-04-07-survey-objective-design.md
 */
import * as THREE from 'three'

/** Terminal box width (X axis). */
const TERMINAL_WIDTH = 2

/** Terminal box height (Y axis). */
const TERMINAL_HEIGHT = 3

/** Terminal box depth (Z axis). */
const TERMINAL_DEPTH = 1

/** Base color — dark metallic. */
const TERMINAL_COLOR = 0x334455

/** Emissive screen color — teal glow on front face. */
const SCREEN_COLOR = 0x00ffcc

/** Screen emissive intensity. */
const SCREEN_INTENSITY = 0.4

/** Interaction range — EVA player must be within this distance (world units). */
export const TERMINAL_INTERACT_RANGE = 8

/**
 * A survey terminal placed at a flat zone.
 * Currently a placeholder cube with a glowing screen face.
 *
 * @author guinetik
 * @date 2026-04-07
 */
export class TerminalModel {
  /** The Three.js group containing the terminal mesh. */
  readonly group: THREE.Group

  /** World-space position of this terminal. */
  get position(): THREE.Vector3 {
    return this.group.position
  }

  constructor() {
    this.group = new THREE.Group()

    // Body — dark metallic box
    const bodyGeo = new THREE.BoxGeometry(TERMINAL_WIDTH, TERMINAL_HEIGHT, TERMINAL_DEPTH)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: TERMINAL_COLOR,
      metalness: 0.7,
      roughness: 0.3,
    })
    const body = new THREE.Mesh(bodyGeo, bodyMat)
    body.position.y = TERMINAL_HEIGHT / 2
    body.castShadow = true
    body.receiveShadow = true
    this.group.add(body)

    // Screen — emissive front face indicator
    const screenGeo = new THREE.PlaneGeometry(TERMINAL_WIDTH * 0.7, TERMINAL_HEIGHT * 0.3)
    const screenMat = new THREE.MeshStandardMaterial({
      color: SCREEN_COLOR,
      emissive: SCREEN_COLOR,
      emissiveIntensity: SCREEN_INTENSITY,
    })
    const screen = new THREE.Mesh(screenGeo, screenMat)
    screen.position.set(0, TERMINAL_HEIGHT * 0.65, TERMINAL_DEPTH / 2 + 0.01)
    this.group.add(screen)
  }

  /**
   * Place this terminal at a world position on the terrain.
   *
   * @param x - World X.
   * @param groundY - Ground height at (x, z).
   * @param z - World Z.
   */
  placeAt(x: number, groundY: number, z: number): void {
    this.group.position.set(x, groundY, z)
  }

  /** Dispose geometry and materials. */
  dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (child.material instanceof THREE.Material) child.material.dispose()
      }
    })
  }
}
