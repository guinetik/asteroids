/**
 * Bunker / station loot chest, backed by an authored GLB.
 *
 * The asset ships in its open pose (cover + cover_decals tilted back ~45°).
 * Load-time we snap the cover to identity (closed) and capture the
 * authored quaternion as the open pose. `open()` then hinges the cover
 * via slerp on a smoothstep curve and recolours the emissive trim to
 * the looted cyan. There is no close animation — once looted, the
 * chest stays open.
 *
 * @author guinetik
 * @date 2026-05-16
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */
import * as THREE from 'three'
import { loadGLB } from '@/three/loadGLB'

/** Asset URL for the optimised chest GLB. */
const CHEST_MODEL_URL = '/models/chest.glb'

/** Emissive colour applied to the chest trim once it has been looted. */
const LOOTED_EMISSIVE_COLOR = 0x5ce7ff

/**
 * envMapIntensity bump applied to the chest's authored materials. The
 * GLB ships at default 1.0, but the bunker's procedural surroundings
 * dim their IBL contribution heavily — bumping the chest here keeps it
 * readable under the scene's spotty point lights.
 */
const CHEST_ENV_MAP_INTENSITY = 4

/** Upper bound on authored roughness so the chest still picks up rim highlights. */
const CHEST_MAX_ROUGHNESS = 0.5

/** Multiplier applied to authored base colour to lift the albedo. */
const CHEST_COLOR_BOOST = 1.6

/** Self-illumination floor so the chest reads even in unlit corners. */
const CHEST_EMISSIVE_FLOOR = 0x202020

/**
 * Yaw applied to the loaded GLB so the chest's lock face aligns with the
 * group's local -Z axis (Three.js default "forward"). This lets call
 * sites reason about chest facing in the usual way without knowing the
 * Sketchfab asset's authoring orientation.
 */
const CHEST_BASE_YAW = Math.PI / 2

/** Authored node names for the lid pieces that hinge open. */
const COVER_NODE_NAMES = ['cover', 'cover_decals'] as const

/** Seconds the lid takes to swing from closed to fully open. */
const OPEN_DURATION_SECONDS = 0.5

/**
 * Lid pose state: identity quaternion is the closed pose, captured
 * authored quaternion is the open pose. Per-node entries so each cover
 * piece slerps from its own closed/open snapshot.
 */
interface LidHinge {
  /** Live scene node that gets rotated each tick. */
  node: THREE.Object3D
  /** Closed pose (identity in the GLB's authoring convention). */
  closed: THREE.Quaternion
  /** Open pose captured from the GLB's default-open authoring. */
  open: THREE.Quaternion
}

/**
 * Smoothstep easing (`3t² − 2t³`) for the lid swing. Gives the hinge a
 * natural ease-in / ease-out without the cost of a real animation curve.
 *
 * @param t - Linear progress in `[0, 1]`.
 * @returns Eased progress in `[0, 1]`.
 */
function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}

/**
 * Three.js model for the bunker / station loot chest. Construct, add
 * {@link group} to the scene, optionally await {@link load}.
 */
export class BunkerChestModel {
  /** Public scene-graph node — host scene parents this into its room. */
  readonly group = new THREE.Group()

  /** Whether {@link open} has been triggered. Drives interaction prompts. */
  opened = false

  private inner: THREE.Group | null = null
  private emissiveMaterials: THREE.MeshStandardMaterial[] = []
  private hinges: LidHinge[] = []
  private hingeProgress = 0
  private hingeTarget = 0
  private loaded = false
  private loadStarted = false

  /** Build an empty wrapper and start streaming the GLB. */
  constructor() {
    this.group.name = 'bunkerChest'
    void this.load()
  }

  /**
   * Stream the GLB, capture lid open/closed poses, and collect emissive
   * materials for the looted recolour. Idempotent.
   */
  async load(): Promise<void> {
    if (this.loadStarted) return
    this.loadStarted = true

    const inner = await loadGLB(CHEST_MODEL_URL)
    this.inner = inner
    inner.rotation.y = CHEST_BASE_YAW
    this.group.add(inner)
    this.captureLidHinges(inner)
    this.centerAndGround(inner)
    // Collect trim materials FIRST — brightenMaterials applies an
    // emissive floor to non-trim slots which would otherwise sweep
    // every material into the looted-recolour set.
    this.collectEmissiveMaterials(inner)
    this.brightenMaterials(inner)

    this.loaded = true
  }

  /** Whether the GLB has finished loading. */
  isLoaded(): boolean {
    return this.loaded
  }

  /**
   * Per-frame tick — advances the lid hinge swing toward its target.
   * Host scenes wire this from their own update loop.
   *
   * @param dt - Frame delta in seconds.
   */
  tick(dt: number): void {
    if (this.hinges.length === 0) return
    if (this.hingeProgress === this.hingeTarget) return

    const step = dt / OPEN_DURATION_SECONDS
    if (this.hingeTarget > this.hingeProgress) {
      this.hingeProgress = Math.min(this.hingeTarget, this.hingeProgress + step)
    } else {
      this.hingeProgress = Math.max(this.hingeTarget, this.hingeProgress - step)
    }

    const eased = smoothstep(this.hingeProgress)
    for (const hinge of this.hinges) {
      hinge.node.quaternion.slerpQuaternions(hinge.closed, hinge.open, eased)
    }
  }

  /**
   * Hinge the lid open over {@link OPEN_DURATION_SECONDS} and recolour
   * the emissive trim cyan. Subsequent calls are no-ops — there is no
   * close animation.
   */
  open(): void {
    if (this.opened) return
    this.opened = true
    this.hingeTarget = 1

    for (const mat of this.emissiveMaterials) {
      mat.color?.setHex(LOOTED_EMISSIVE_COLOR)
      mat.emissive.setHex(LOOTED_EMISSIVE_COLOR)
    }
  }

  /** Release GPU resources. */
  dispose(): void {
    if (this.inner) {
      this.inner.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          const mats = Array.isArray(child.material) ? child.material : [child.material]
          for (const m of mats) if (m instanceof THREE.Material) m.dispose()
        }
      })
    }
    this.inner = null
    this.emissiveMaterials = []
    this.hinges = []
  }

  /**
   * Find the lid pieces by name, capture their authored open pose, and
   * snap them to the closed pose (identity quaternion). The artist
   * modelled the cover with its geometry origin at the rear hinge edge,
   * so identity = lid sitting flush on the chest body.
   */
  private captureLidHinges(inner: THREE.Group): void {
    for (const name of COVER_NODE_NAMES) {
      const node = inner.getObjectByName(name)
      if (!node) continue
      const open = node.quaternion.clone()
      const closed = new THREE.Quaternion()
      node.quaternion.copy(closed)
      this.hinges.push({ node, closed, open })
    }
  }

  /**
   * Translate the loaded GLB so its bounding-box centre sits on the
   * group's X/Z origin and its base rests at Y=0. Sketchfab pivots are
   * usually off-axis, which makes placement math drift otherwise.
   */
  private centerAndGround(inner: THREE.Group): void {
    inner.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(inner)
    if (box.isEmpty()) return
    const center = box.getCenter(new THREE.Vector3())
    inner.position.x -= center.x
    inner.position.z -= center.z
    inner.position.y -= box.min.y
  }

  /**
   * Boost IBL response and clamp roughness on every standard material
   * so the chest reads clearly under the scene's point-light rig
   * instead of falling into the same dim band as procedural props.
   */
  private brightenMaterials(inner: THREE.Group): void {
    inner.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) return
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const m of mats) {
        if (m instanceof THREE.MeshStandardMaterial) {
          m.envMapIntensity = CHEST_ENV_MAP_INTENSITY
          m.roughness = Math.min(m.roughness, CHEST_MAX_ROUGHNESS)
          m.color.multiplyScalar(CHEST_COLOR_BOOST)
          // Lift only un-emissive trim slots; leave the looted-state
          // emissive (collected below) untouched.
          if (!m.emissive || m.emissive.getHex() === 0) {
            m.emissive.setHex(CHEST_EMISSIVE_FLOOR)
            m.emissiveIntensity = 1
          }
          m.needsUpdate = true
        }
      }
    })
  }

  /**
   * Walk the loaded scene and collect every material with an active
   * emissive colour. Those are the trim materials that get swapped to
   * the looted cyan on {@link open}.
   */
  private collectEmissiveMaterials(inner: THREE.Group): void {
    inner.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) return
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const m of mats) {
        if (m instanceof THREE.MeshStandardMaterial && m.emissive && m.emissive.getHex() > 0) {
          this.emissiveMaterials.push(m)
        }
      }
    })
  }
}
