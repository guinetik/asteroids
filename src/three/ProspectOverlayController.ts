/**
 * Wireframe overlay that fades in over a rock as the science gun
 * prospects it, locks at full opacity once analysed, and disposes when
 * the rock is consumed.
 *
 * The overlay is a per-rock {@link THREE.Mesh} that shares geometry
 * with the underlying {@link THREE.InstancedMesh} and applies the
 * exact per-instance matrix, so the wireframe traces the visible rock
 * silhouette / position / rotation / scale precisely. Lazily created
 * on first science hit — rocks the player never scans cost nothing.
 *
 * @author guinetik
 * @date 2026-04-26
 * @spec docs/superpowers/specs/2026-04-26-science-rock-prospecting-design.md
 */
import * as THREE from 'three'
import type { SurfaceRockController } from '@/three/controllers/SurfaceRockController'

/** Wireframe overlay color (matches science mode green). */
const WIREFRAME_COLOR = 0x22c55e
/** Maximum opacity reached as science HP approaches 0. */
const WIREFRAME_MAX_OPACITY = 0.7
/** Final opacity when the rock is fully prospected. */
const WIREFRAME_FULL_OPACITY = 0.9
/** Polygon offset factor — keeps the wireframe from z-fighting the rock surface. */
const POLYGON_OFFSET_FACTOR = -1
/** Polygon offset units — keeps the wireframe from z-fighting the rock surface. */
const POLYGON_OFFSET_UNITS = -1
/** Per-axis scale factor applied to the overlay so it sits just outside the rock skin. */
const WIREFRAME_SCALE_PADDING = 1.02

/**
 * Per-rock prospect wireframe overlay.
 *
 * @author guinetik
 * @date 2026-04-26
 * @spec docs/superpowers/specs/2026-04-26-science-rock-prospecting-design.md
 */
export class ProspectOverlayController {
  private readonly scene: THREE.Scene
  private readonly surfaceRocks: SurfaceRockController
  /** spawnIndex → overlay mesh + material. */
  private readonly overlays = new Map<
    number,
    { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial }
  >()

  constructor(scene: THREE.Scene, surfaceRocks: SurfaceRockController) {
    this.scene = scene
    this.surfaceRocks = surfaceRocks
  }

  /**
   * Update overlay opacity as a rock accumulates science hits. Lazily
   * creates the overlay mesh on the first call for `spawnIndex`.
   */
  updateProgress(spawnIndex: number, scienceHp: number, initialScienceHp: number): void {
    const overlay = this.overlays.get(spawnIndex) ?? this.createOverlay(spawnIndex)
    if (!overlay) return
    const ratio = initialScienceHp <= 0 ? 1 : 1 - scienceHp / initialScienceHp
    overlay.material.opacity = THREE.MathUtils.clamp(
      ratio * WIREFRAME_MAX_OPACITY,
      0,
      WIREFRAME_MAX_OPACITY,
    )
    overlay.material.needsUpdate = true
  }

  /** Lock the overlay at full opacity once the rock is fully prospected. */
  markProspected(spawnIndex: number): void {
    const overlay = this.overlays.get(spawnIndex) ?? this.createOverlay(spawnIndex)
    if (!overlay) return
    overlay.material.opacity = WIREFRAME_FULL_OPACITY
    overlay.material.needsUpdate = true
  }

  /**
   * Tear down the overlay for a consumed rock. The overlay's geometry
   * is borrowed from the {@link THREE.InstancedMesh} so it is *not*
   * disposed here — only the wireframe material we own.
   */
  remove(spawnIndex: number): void {
    const overlay = this.overlays.get(spawnIndex)
    if (!overlay) return
    this.scene.remove(overlay.mesh)
    overlay.material.dispose()
    this.overlays.delete(spawnIndex)
  }

  /** Tear down every overlay (e.g. on scene exit). */
  dispose(): void {
    for (const spawnIndex of Array.from(this.overlays.keys())) {
      this.remove(spawnIndex)
    }
  }

  /** Create the overlay mesh for `spawnIndex`. Returns null if the rock is unknown. */
  private createOverlay(
    spawnIndex: number,
  ): { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial } | null {
    const transform = this.surfaceRocks.getRockInstanceTransform(spawnIndex)
    if (!transform) return null

    const material = new THREE.MeshBasicMaterial({
      color: WIREFRAME_COLOR,
      wireframe: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: POLYGON_OFFSET_FACTOR,
      polygonOffsetUnits: POLYGON_OFFSET_UNITS,
    })

    const mesh = new THREE.Mesh(transform.geometry, material)
    mesh.matrixAutoUpdate = false
    mesh.applyMatrix4(transform.matrix)
    // Tiny outward scale so the wireframe sits just outside the rock skin
    // even when the polygon offset isn't enough on extreme angles.
    mesh.scale.multiplyScalar(WIREFRAME_SCALE_PADDING)
    mesh.updateMatrix()
    mesh.frustumCulled = true
    this.scene.add(mesh)

    const entry = { mesh, material }
    this.overlays.set(spawnIndex, entry)
    return entry
  }
}
