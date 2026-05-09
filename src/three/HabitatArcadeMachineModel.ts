/**
 * Free-standing arcade machine placed next to the cockpit table. Optional
 * appliance — only loaded when the player profile has the corresponding
 * habitat-appliance unlock flag.
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */
import * as THREE from 'three'
import { loadGLB } from '@/three/loadGLB'

/** Asset URL for the arcade machine GLB. */
const ARCADE_MACHINE_MODEL_URL = '/models/arcade_machine.glb'

/**
 * Target longest-dimension size of the arcade machine in world units. Tall enough
 * to read as a real cabinet without poking the canopy at the cockpit end.
 */
const ARCADE_MACHINE_TARGET_LONGEST_DIMENSION = 1.92

/** Maximum metalness clamp for imported PBR materials. */
const ARCADE_MACHINE_METALNESS_CLAMP = 0.45

/** Minimum roughness clamp for imported PBR materials. */
const ARCADE_MACHINE_ROUGHNESS_CLAMP = 0.55

/** Maximum emissive intensity allowed on imported materials (CRT glow / marquee). */
const ARCADE_MACHINE_EMISSIVE_CLAMP = 0.6

/**
 * Arcade machine model wrapper. Drops the inner GLB so its base sits at
 * group-local Y=0; callers place {@link group} at the desired floor spot.
 */
export class HabitatArcadeMachineModel {
  /** Public scene-graph node — host scene parents this into the cabin. */
  readonly group: THREE.Group

  /** Inner GLB scene root once loaded. */
  private inner: THREE.Group | null = null

  /** Cached world-space bbox used for player obstacle collision. */
  private readonly worldAabb = new THREE.Box3()

  /** Guards against repeated load() calls. */
  private loaded = false

  /** Build an empty wrapper. Call {@link load} before adding {@link group} to the scene. */
  constructor() {
    this.group = new THREE.Group()
    this.group.name = 'habitatArcadeMachine'
  }

  /**
   * Stream the GLB, normalize materials, and scale to
   * {@link ARCADE_MACHINE_TARGET_LONGEST_DIMENSION}. Idempotent.
   */
  async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true

    const inner = await loadGLB(ARCADE_MACHINE_MODEL_URL)
    this.tameMaterials(inner)

    const tempBox = new THREE.Box3().setFromObject(inner)
    const size = tempBox.getSize(new THREE.Vector3())
    const longest = Math.max(size.x, size.y, size.z)
    if (longest > 0) {
      inner.scale.setScalar(ARCADE_MACHINE_TARGET_LONGEST_DIMENSION / longest)
    }

    inner.updateMatrixWorld(true)
    const scaledBox = new THREE.Box3().setFromObject(inner)
    const centre = scaledBox.getCenter(new THREE.Vector3())
    inner.position.x -= centre.x
    inner.position.z -= centre.z
    inner.position.y -= scaledBox.min.y

    this.group.add(inner)
    this.inner = inner
  }

  /**
   * Recompute the cached world-space AABB. Call after any change to
   * {@link group}'s transform so {@link getCollisionAabb} reflects the new pose.
   */
  refreshAabb(): void {
    this.group.updateMatrixWorld(true)
    if (this.inner) this.worldAabb.setFromObject(this.group)
    else this.worldAabb.makeEmpty()
  }

  /**
   * Returns the cached world-space AABB. Callers should treat the returned value as
   * read-only — clone it before mutating.
   */
  getCollisionAabb(): Readonly<THREE.Box3> {
    return this.worldAabb
  }

  /** True once the arcade machine GLB has been successfully requested for this wrapper. */
  isLoaded(): boolean {
    return this.loaded && this.inner !== null
  }

  /** Release the inner GLB geometries and materials. */
  dispose(): void {
    if (!this.inner) return
    this.inner.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        for (const mat of mats) mat.dispose()
      }
    })
    this.group.remove(this.inner)
    this.inner = null
  }

  /**
   * Tame imported PBR materials so the asset reads under cabin lighting without
   * chrome highlights or runway-bright marquee glow.
   *
   * @param root - Loaded GLB scene group.
   */
  private tameMaterials(root: THREE.Group): void {
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) return
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const mat of mats) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.metalness = Math.min(mat.metalness, ARCADE_MACHINE_METALNESS_CLAMP)
          mat.roughness = Math.max(mat.roughness, ARCADE_MACHINE_ROUGHNESS_CLAMP)
          if (mat.emissiveIntensity > ARCADE_MACHINE_EMISSIVE_CLAMP) {
            mat.emissiveIntensity = ARCADE_MACHINE_EMISSIVE_CLAMP
          }
          mat.needsUpdate = true
        }
      }
    })
  }
}
