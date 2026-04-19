/**
 * Glowing deposit crate prop, shared between collect and gather objectives.
 *
 * Encapsulates the small two-mesh "package" visual (body + emissive trim)
 * so both minigames can spawn the same crate without duplicating the
 * geometry or material definitions. The owner is responsible for
 * adding the `group` to the scene and calling `dispose` when done.
 *
 * @author guinetik
 * @date 2026-04-18
 * @spec docs/superpowers/specs/2026-04-18-gather-mission-design.md
 */
import * as THREE from 'three'

const CRATE_WIDTH = 4.6
const CRATE_HEIGHT = 3.0
const CRATE_DEPTH = 3.0

/** Visual / material overrides for {@link DepositCrateModel}. */
export interface DepositCrateOptions {
  /** Hex color for the crate body. Defaults to a deep teal collect-mission tone. */
  baseColor?: number
  /** Hex color for the emissive trim band. Defaults to bright cyan. */
  trimColor?: number
}

/**
 * Lightweight wrapper around the crate hierarchy. Pure visual — no
 * gameplay logic. The minigames that own it apply position via
 * {@link placeAt} and toggle visibility on completion.
 */
export class DepositCrateModel {
  readonly group = new THREE.Group()
  private readonly bodyMaterial: THREE.MeshStandardMaterial
  private readonly trimMaterial: THREE.MeshStandardMaterial
  private readonly bodyGeometry: THREE.BoxGeometry
  private readonly trimGeometry: THREE.BoxGeometry

  constructor(options: DepositCrateOptions = {}) {
    const baseColor = options.baseColor ?? 0x12303a
    const trimColor = options.trimColor ?? 0x5ce7ff

    this.bodyGeometry = new THREE.BoxGeometry(CRATE_WIDTH, CRATE_HEIGHT, CRATE_DEPTH)
    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color: baseColor,
      metalness: 0.55,
      roughness: 0.42,
    })
    const body = new THREE.Mesh(this.bodyGeometry, this.bodyMaterial)
    body.position.y = CRATE_HEIGHT / 2
    body.castShadow = true
    body.receiveShadow = true
    this.group.add(body)

    this.trimGeometry = new THREE.BoxGeometry(CRATE_WIDTH + 0.08, 0.16, CRATE_DEPTH + 0.08)
    this.trimMaterial = new THREE.MeshStandardMaterial({
      color: trimColor,
      emissive: trimColor,
      emissiveIntensity: 0.8,
    })
    const trim = new THREE.Mesh(this.trimGeometry, this.trimMaterial)
    trim.position.y = CRATE_HEIGHT - 0.25
    this.group.add(trim)
  }

  /** Plant the crate on the surface at world coords `(x, z)` with `groundY` as base. */
  placeAt(x: number, z: number, groundY: number): void {
    this.group.position.set(x, groundY, z)
  }

  /** Toggle the entire crate group on/off without removing it from the scene. */
  setVisible(visible: boolean): void {
    this.group.visible = visible
  }

  /** Dispose all owned geometries and materials. Caller removes from scene. */
  dispose(): void {
    this.bodyGeometry.dispose()
    this.trimGeometry.dispose()
    this.bodyMaterial.dispose()
    this.trimMaterial.dispose()
  }
}
