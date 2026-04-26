/**
 * Wireframe overlay that fades in over a rock as the science gun
 * prospects it, locks at full opacity once analysed, and disposes when
 * the rock is consumed.
 *
 * The overlay is a per-rock {@link THREE.Mesh} parented to the scene at
 * the rock's world position. Geometry is cloned from the rock instance's
 * source `THREE.InstancedMesh` so the wireframe traces the actual rock
 * silhouette. Lazily created on first science hit — rocks the player
 * never scans cost nothing.
 *
 * @author guinetik
 * @date 2026-04-26
 * @spec docs/superpowers/specs/2026-04-26-science-rock-prospecting-design.md
 */
import * as THREE from 'three'
import type { SurfaceRockController } from '@/three/controllers/SurfaceRockController'
import type { Heightmap } from '@/lib/terrain/heightmap'

/** Wireframe overlay color (matches science mode green). */
const WIREFRAME_COLOR = 0x22c55e
/** Maximum opacity reached as science HP approaches 0. */
const WIREFRAME_MAX_OPACITY = 0.7
/** Final opacity when the rock is fully prospected. */
const WIREFRAME_FULL_OPACITY = 0.9
/** Polygon offset factor / units to lift wireframe above the rock surface. */
const POLYGON_OFFSET_FACTOR = -1
const POLYGON_OFFSET_UNITS = -1

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
  private readonly heightmap: Heightmap
  /** spawnIndex → overlay mesh + material. */
  private readonly overlays = new Map<
    number,
    { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial }
  >()
  /** Reused scratch — rock world center. */
  private readonly _center = new THREE.Vector3()

  constructor(scene: THREE.Scene, surfaceRocks: SurfaceRockController, heightmap: Heightmap) {
    this.scene = scene
    this.surfaceRocks = surfaceRocks
    this.heightmap = heightmap
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

  /** Tear down the overlay for a consumed rock. */
  remove(spawnIndex: number): void {
    const overlay = this.overlays.get(spawnIndex)
    if (!overlay) return
    this.scene.remove(overlay.mesh)
    overlay.material.dispose()
    overlay.mesh.geometry.dispose()
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
    const center = this.surfaceRocks.getRockCenter(spawnIndex, this.heightmap, this._center)
    if (!center) return null
    const radius = this.surfaceRocks.getRockRadius(spawnIndex)
    if (radius === null) return null

    // A low-poly icosphere is enough to read as "wireframe scan" without
    // duplicating the GLB instance geometry. Rotated subtly per-rock so
    // adjacent prospected rocks don't form a pattern.
    const geometry = new THREE.IcosahedronGeometry(radius, 1)

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

    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(center)
    mesh.rotation.set(
      (spawnIndex * 0.317) % (Math.PI * 2),
      (spawnIndex * 0.521) % (Math.PI * 2),
      (spawnIndex * 0.733) % (Math.PI * 2),
    )
    mesh.frustumCulled = true
    this.scene.add(mesh)

    const entry = { mesh, material }
    this.overlays.set(spawnIndex, entry)
    return entry
  }
}
