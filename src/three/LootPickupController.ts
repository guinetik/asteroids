/**
 * Unified visual layer for {@link LootSystem} pickups. Renders all loot types
 * (health=red, oxygen=blue, RTG=yellow, psychosphere=cyan) as emissive bobbing
 * orbs. Supports dynamic scene root switching for bunker geometry.root vs
 * surface main scene while preserving world positions. Reconciles visual list
 * with live pickups each tick, bounded allocations.
 *
 * Replaces PsychospherePickupController; follows same bob/rotation pattern.
 *
 * @author guinetik
 * @date 2026-04-28
 * @spec docs/superpowers/specs/2026-04-28-loot-drop-system-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { LootSystem, LootPickup, LootType } from '@/lib/fps/lootSystem'

const PICKUP_RADIUS = 0.32
const BOB_AMPLITUDE = 0.18
const BOB_FREQUENCY = 1.6
const ROTATION_SPEED = 1.8

/** Color + emissive per loot type (no magic numbers). */
const LOOT_COLOR_MAP: Record<LootType, { color: number; emissive: number }> = {
  health: { color: 0xff4444, emissive: 0xaa0000 },
  oxygen: { color: 0x4488ff, emissive: 0x0044aa },
  rtg: { color: 0xffdd44, emissive: 0xaa8800 },
  psychosphere: { color: 0x6affc8, emissive: 0x2cf0a0 },
} as const

/** Per-pickup visual state kept alongside the rendered mesh. */
interface PickupVisual {
  mesh: THREE.Mesh
  baseY: number
  bobOffset: number
}

/**
 * Renders the live pickup list from a {@link LootSystem} as colored floating
 * orbs. The {@link group} should be added to the appropriate scene root
 * (surface scene or bunker.geometry.root). Call {@link tick} every frame.
 * Supports {@link setRoot} for bunker/surface switching.
 */
export class LootPickupController implements Tickable {
  /** Scene-attachable group containing all live pickup meshes. */
  readonly group = new THREE.Group()

  private readonly visuals = new Map<number, PickupVisual>()
  private readonly geometry: THREE.SphereGeometry
  private readonly materials = new Map<LootType, THREE.MeshStandardMaterial>()
  /**
   * Hidden mesh staged at construction so the renderer's shader precompile
   * pass sees the standard material variant. Without this, the first real
   * pickup spawn would compile the program on first draw — a multi-hundred
   * millisecond stall mid-combat.
   */
  private readonly warmupMesh: THREE.Mesh
  private currentRoot: THREE.Object3D | null = null
  private elapsed = 0

  constructor(
    private readonly lootSystem: LootSystem,
    /** Optional initial root (e.g. bunker.geometry.root). Caller can use setRoot later. */
    root?: THREE.Object3D
  ) {
    this.geometry = new THREE.SphereGeometry(PICKUP_RADIUS, 16, 12)

    // Pre-create one material per loot type for colored emissive orbs
    for (const [type, spec] of Object.entries(LOOT_COLOR_MAP)) {
      const material = new THREE.MeshStandardMaterial({
        color: spec.color,
        emissive: spec.emissive,
        emissiveIntensity: 1.4,
        metalness: 0.1,
        roughness: 0.35,
      })
      this.materials.set(type as LootType, material)
    }

    const psychoMaterial = this.materials.get('psychosphere')!
    this.warmupMesh = new THREE.Mesh(this.geometry, psychoMaterial)
    this.warmupMesh.visible = false
    this.warmupMesh.frustumCulled = false
    this.group.add(this.warmupMesh)

    if (root) {
      this.setRoot(root)
    }
  }

  /**
   * Reconcile the visual list with the current {@link LootSystem.pickups}
   * snapshot (colored by type), then animate live meshes (bob + rotation).
   * Handles dynamic root by converting world positions to local coords.
   *
   * @param dt - Frame delta in seconds.
   */
  tick(dt: number): void {
    this.elapsed += dt
    const live = this.lootSystem.pickups
    const seen = new Set<number>()

    for (const pickup of live) {
      seen.add(pickup.id)
      let visual = this.visuals.get(pickup.id)
      if (!visual) {
        visual = this.createVisual(pickup)
        this.visuals.set(pickup.id, visual)
      }
      const bob = Math.sin((this.elapsed + visual.bobOffset) * BOB_FREQUENCY) * BOB_AMPLITUDE

      let x = pickup.position.x
      let y = visual.baseY + bob
      let z = pickup.position.z
      if (this.currentRoot) {
        const r = this.currentRoot.position
        x -= r.x
        y -= r.y
        z -= r.z
      }

      visual.mesh.position.set(x, y, z)
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

    for (const material of this.materials.values()) {
      material.dispose()
    }
    this.materials.clear()
    this.geometry.dispose()
  }

  /**
   * Change the parent root for this controller's group (e.g. switch from
   * main scene to bunker.geometry.root on descent). Updates coordinate
   * transform for existing and future pickups.
   */
  setRoot(root: THREE.Object3D): void {
    if (this.currentRoot === root) return
    if (this.currentRoot !== null) {
      this.currentRoot.remove(this.group)
    }
    root.add(this.group)
    this.currentRoot = root
  }

  /**
   * Create a fresh mesh for a new pickup using type-specific material.
   *
   * @param pickup - Domain entity from {@link LootSystem.pickups}.
   * @returns Visual record for {@link visuals} bookkeeping.
   */
  private createVisual(pickup: LootPickup): PickupVisual {
    const material = this.materials.get(pickup.type) || this.materials.get('psychosphere')!
    const mesh = new THREE.Mesh(this.geometry, material)
    mesh.position.set(pickup.position.x, pickup.position.y, pickup.position.z)
    this.group.add(mesh)
    return {
      mesh,
      baseY: pickup.position.y,
      bobOffset: pickup.id * 0.37,
    }
  }
}
