/**
 * Visual layer for {@link DropSystem} pickups (viroid psychosphere etc.).
 *
 * Holds a single Three.js group whose children mirror the live
 * {@link PickupEntity} list returned by {@link DropSystem.pickups}. On
 * {@link tick} we add meshes for newly-spawned ids and dispose meshes whose
 * pickup was collected (or otherwise removed). This keeps allocations
 * bounded — there's never more geometry alive than there are open contracts
 * willing to drop loot.
 *
 * The pickup is rendered as a small emissive sphere with a slow vertical
 * bob and gentle rotation, which is enough to read at FPS distances; final
 * art can swap the geometry/material without changing this controller.
 *
 * @author guinetik
 * @date 2026-04-23
 * @spec docs/contracts-cinderline.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { DropSystem, PickupEntity } from '@/lib/fps/dropSystem'

const PICKUP_RADIUS = 0.32
const BOB_AMPLITUDE = 0.18
const BOB_FREQUENCY = 1.6
const ROTATION_SPEED = 1.8

/** Per-pickup visual state kept alongside the rendered mesh. */
interface PickupVisual {
  mesh: THREE.Mesh
  baseY: number
  bobOffset: number
}

/**
 * Renders the live pickup list from a {@link DropSystem} as floating spheres.
 * Add {@link group} to the scene root; call {@link tick} every frame.
 */
export class PsychospherePickupController implements Tickable {
  /** Scene-attachable group containing all live pickup meshes. */
  readonly group = new THREE.Group()

  private readonly visuals = new Map<number, PickupVisual>()
  private readonly geometry: THREE.SphereGeometry
  private readonly material: THREE.MeshStandardMaterial
  /**
   * Hidden mesh staged at construction so the renderer's shader precompile
   * pass sees the standard material variant. Without this, the first real
   * pickup spawn would compile the program on first draw — a multi-hundred
   * millisecond stall mid-combat.
   */
  private readonly warmupMesh: THREE.Mesh
  private elapsed = 0

  constructor(private readonly dropSystem: DropSystem) {
    this.geometry = new THREE.SphereGeometry(PICKUP_RADIUS, 16, 12)
    this.material = new THREE.MeshStandardMaterial({
      color: 0x6affc8,
      emissive: 0x2cf0a0,
      emissiveIntensity: 1.4,
      metalness: 0.1,
      roughness: 0.35,
    })
    this.warmupMesh = new THREE.Mesh(this.geometry, this.material)
    this.warmupMesh.visible = false
    this.warmupMesh.frustumCulled = false
    this.group.add(this.warmupMesh)
  }

  /**
   * Reconcile the visual list with the current {@link DropSystem.pickups}
   * snapshot, then animate live meshes (bob + rotation).
   *
   * @param dt - Frame delta in seconds.
   */
  tick(dt: number): void {
    this.elapsed += dt
    const live = this.dropSystem.pickups
    const seen = new Set<number>()

    for (const pickup of live) {
      seen.add(pickup.id)
      let visual = this.visuals.get(pickup.id)
      if (!visual) {
        visual = this.createVisual(pickup)
        this.visuals.set(pickup.id, visual)
      }
      const bob = Math.sin((this.elapsed + visual.bobOffset) * BOB_FREQUENCY) * BOB_AMPLITUDE
      visual.mesh.position.set(pickup.position.x, visual.baseY + bob, pickup.position.z)
      visual.mesh.rotation.y += ROTATION_SPEED * dt
    }

    if (this.visuals.size === seen.size) return
    for (const [id, visual] of this.visuals) {
      if (seen.has(id)) continue
      this.group.remove(visual.mesh)
      this.visuals.delete(id)
    }
  }

  /** Dispose all materials, geometry, and meshes (call on level teardown). */
  dispose(): void {
    this.group.remove(this.warmupMesh)
    for (const visual of this.visuals.values()) {
      this.group.remove(visual.mesh)
    }
    this.visuals.clear()
    this.geometry.dispose()
    this.material.dispose()
  }

  /**
   * Create a fresh mesh for a new pickup and add it to {@link group}.
   *
   * @param pickup - Domain entity sourced from {@link DropSystem.pickups}.
   * @returns Visual record for {@link visuals} bookkeeping.
   */
  private createVisual(pickup: PickupEntity): PickupVisual {
    const mesh = new THREE.Mesh(this.geometry, this.material)
    mesh.position.set(pickup.position.x, pickup.position.y, pickup.position.z)
    this.group.add(mesh)
    return {
      mesh,
      baseY: pickup.position.y,
      bobOffset: pickup.id * 0.37,
    }
  }
}
