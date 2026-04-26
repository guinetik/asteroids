/**
 * In-scene controller for the satellite servicing minigame.
 *
 * Attaches to a satellite POI during EVA, applies a red wireframe overlay to
 * each broken component, and runs a forward raycast from the FPS camera to
 * detect aim. The aimed component's wireframe turns orange; pressing F while
 * aimed flips the wireframe to green, holds for {@link REPAIR_HOLD_SECONDS},
 * then removes it and marks the component repaired. Prompt text is surfaced
 * through the EVA HUD via the {@link SatelliteRepairControllerConfig.onAimPromptChange}
 * callback rather than a 3D billboard. Completing all repairs fires
 * `minigame.onComplete`, which the host pipes into its reward chain.
 *
 * @author guinetik
 * @date 2026-04-19
 * @spec docs/superpowers/specs/2026-04-19-eva-minigame-wiring-design.md
 */
import * as THREE from 'three'
import type { SatelliteServicingMiniGame } from '@/lib/minigame/satelliteServicing/SatelliteServicingMiniGame'
import type { ActiveVisitRelayMission } from '@/lib/missions/types'
import { validateManifest } from '@/lib/satellites/satelliteManifests'
import { Timer } from '@/lib/Timer'

/** Maximum raycast distance (world units) for aim detection. Rays longer than this don't highlight a component. */
const AIM_RAYCAST_MAX_DISTANCE = 15

/** Orange emissive color applied to the wireframe of the currently aimed-at broken component. */
const AIM_HIGHLIGHT_COLOR = 0xfb923c

/** Red emissive wireframe color for damaged components. */
const DAMAGE_WIREFRAME_COLOR = 0xf87171

/** Wireframe overlay opacity — fixed, no fade. */
const WIREFRAME_OPACITY = 0.9

/** Seconds the repaired wireframe stays visible (green) before being removed. */
const REPAIR_HOLD_SECONDS = 2

/** Green color applied to a component's wireframe during the post-repair hold. */
const REPAIR_COMPLETE_COLOR = 0x4ade80

/** Configuration passed to `SatelliteRepairController.attach`. */
export interface SatelliteRepairControllerConfig {
  /** POI root — walked for named rigged sub-objects. */
  poiObject: THREE.Object3D
  /** Provider of the FPS camera used for raycast aim detection. May return null between frames if the camera is being swapped. */
  getCamera: () => THREE.Camera | null
  /** True while the F-press should register as a repair attempt. */
  isFixKeyPressed: () => boolean
  /** The minigame instance — controller calls `markRepaired(name)` on success. */
  minigame: SatelliteServicingMiniGame
  /** The active mission — reserved for future use (mission-specific tuning). */
  mission: ActiveVisitRelayMission
  /**
   * Called when the aim state transitions between "nothing aimed" and "aimed
   * at a broken component". Host routes the payload into the EVA HUD prompt
   * channel so the player sees "[F] FIX" only while aiming at a fixable part.
   * Fires with null to clear the prompt.
   */
  onAimPromptChange?: (prompt: string | null) => void
}

/** Internal per-component state. Tracks the source object, damage overlay, and repair progress. */
interface DamagedComponent {
  /** Name of the rigged sub-object this component represents. */
  name: string
  /** Source Object3D on the POI tree — the wireframe overlay sits on top of this. */
  source: THREE.Object3D
  /** Red (or orange when aimed, green when repaired) wireframe overlay group. */
  wireframe: THREE.Object3D
  /** Set to true when repair is initiated; prevents further aim-pick and normal logic. */
  fading: boolean
  /** Whether this component is the current aim target — drives wireframe color. */
  aimed: boolean
}

/**
 * Controller-side skeleton for the satellite servicing minigame.
 *
 * Usage:
 * ```ts
 * const controller = new SatelliteRepairController()
 * controller.attach({ poiObject, getCamera, isFixKeyPressed, minigame, mission })
 * // …later, per frame…
 * controller.tick(dt)
 * // …on minigame.onComplete or forced abort…
 * controller.dispose()
 * ```
 *
 * @author guinetik
 * @date 2026-04-19
 * @spec docs/superpowers/specs/2026-04-19-eva-minigame-wiring-design.md
 */
export class SatelliteRepairController {
  private cfg: SatelliteRepairControllerConfig | null = null
  private components: DamagedComponent[] = []
  private prevFixKey = false

  /** Tracks whether any component was aimed at on the previous frame. */
  private prevHasAimed = false

  /** Reused raycaster for per-frame aim detection. */
  private readonly _raycaster = new THREE.Raycaster()

  /** Reused forward vector sampled from the camera each frame. */
  private readonly _forward = new THREE.Vector3()

  /**
   * Attach to a scene + POI. Looks up each broken component by name and applies
   * a red wireframe overlay. If any manifest component is missing from the POI
   * tree, logs a warning and skips that component (so the rest of the mission
   * stays playable).
   *
   * @param cfg - Attachment configuration.
   */
  attach(cfg: SatelliteRepairControllerConfig): void {
    this.cfg = cfg
    const brokenList = cfg.minigame.brokenComponents
    const validation = validateManifest(cfg.poiObject, brokenList)
    if (!validation.ok) {
      console.warn('[SatelliteRepairController] Missing components on POI:', validation.missing)
    }
    for (const name of validation.found) {
      const source = cfg.poiObject.getObjectByName(name)
      if (!source) continue
      const wireframe = this.buildWireframe(source)
      source.add(wireframe)
      this.components.push({
        name,
        source,
        wireframe,
        fading: false,
        aimed: false,
      })
    }
  }

  /**
   * Per-frame update. Runs a forward raycast from the FPS camera to detect
   * which broken component the player is aiming at, turns its wireframe orange,
   * and on F-press triggers the green-hold repair sequence.
   *
   * @param dt - Delta time in seconds (unused post-fade-removal; kept for interface symmetry).
   */
  tick(_dt: number): void {
    if (!this.cfg) return
    const camera = this.cfg.getCamera()

    // Find the aimed-at component via a forward raycast from the camera. The
    // raycast hits MESH descendants of each component's source node; we match
    // back to the component by ancestry.
    let aimed: DamagedComponent | null = null
    if (camera) {
      camera.getWorldDirection(this._forward)
      this._raycaster.set(camera.position, this._forward)
      this._raycaster.far = AIM_RAYCAST_MAX_DISTANCE
      aimed = this.pickAimedComponent()
    }

    // Apply aim state changes — swap wireframe color when entering/leaving aim.
    for (const c of this.components) {
      if (c.fading) {
        c.aimed = false
        continue
      }
      const nowAimed = c === aimed
      if (nowAimed !== c.aimed) {
        c.aimed = nowAimed
        this.setWireframeColor(c.wireframe, nowAimed ? AIM_HIGHLIGHT_COLOR : DAMAGE_WIREFRAME_COLOR)
      }
    }

    // Emit aim-prompt transitions to the host so the EVA HUD shows "[F] FIX"
    // only while the player is looking at a repairable component.
    const hasAimed = aimed != null
    if (hasAimed !== this.prevHasAimed) {
      this.prevHasAimed = hasAimed
      this.cfg.onAimPromptChange?.(hasAimed ? '[F] FIX' : null)
    }

    // F edge-trigger: while aimed at a broken component, flip it to the
    // green "repaired" state, hold for REPAIR_HOLD_SECONDS, then remove the
    // wireframe and mark the repair. Deferring `markRepaired` until after the
    // hold lets the green celebration play out before the mission completes
    // and the controller is disposed.
    const fixPressed = this.cfg.isFixKeyPressed()
    const fixJustPressed = fixPressed && !this.prevFixKey
    this.prevFixKey = fixPressed
    if (fixJustPressed && aimed) {
      aimed.fading = true
      aimed.aimed = false
      this.setWireframeColor(aimed.wireframe, REPAIR_COMPLETE_COLOR)
      const name = aimed.name
      const wireframeRef = aimed.wireframe
      Timer.after(REPAIR_HOLD_SECONDS, () => {
        if (wireframeRef.parent) wireframeRef.parent.remove(wireframeRef)
        // If the controller was disposed during the hold (player exited EVA),
        // `this.cfg` is null — skip the repair mark so the mission state stays
        // consistent with "no partial progress persisted."
        if (this.cfg) this.cfg.minigame.markRepaired(name)
      })
    }
  }

  /**
   * Raycast against every non-fading damaged component's source subtree and
   * return the component whose source tree has the closest mesh intersection.
   * Returns null if no broken component is in the ray's path.
   *
   * @returns The aimed-at component, or null when no broken component is hit.
   */
  private pickAimedComponent(): DamagedComponent | null {
    let nearest: DamagedComponent | null = null
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const c of this.components) {
      if (c.fading) continue
      const hits = this._raycaster.intersectObject(c.source, true)
      // Filter hits that actually belong to the source mesh — exclude wireframe
      // overlay geometry so the raycast doesn't self-hit our own red mesh clones.
      for (const hit of hits) {
        if (this.isWireframeDescendant(hit.object)) continue
        if (hit.distance < nearestDistance) {
          nearestDistance = hit.distance
          nearest = c
        }
        // Take only the closest surface point for this component; don't scan deeper.
        break
      }
    }
    return nearest
  }

  /**
   * True when `obj` lives under any component's wireframe group. Used to
   * reject self-hits during the aim raycast.
   *
   * @param obj - Object3D to test.
   * @returns Whether the object is inside a wireframe overlay.
   */
  private isWireframeDescendant(obj: THREE.Object3D): boolean {
    for (const c of this.components) {
      let cur: THREE.Object3D | null = obj
      while (cur) {
        if (cur === c.wireframe) return true
        cur = cur.parent
      }
    }
    return false
  }

  /**
   * Detach and dispose every overlay. Safe to call multiple times.
   */
  dispose(): void {
    // Tell the host to clear any aim prompt it was displaying for us.
    this.cfg?.onAimPromptChange?.(null)
    this.prevHasAimed = false
    for (const c of this.components) {
      if (c.wireframe.parent) c.wireframe.parent.remove(c.wireframe)
      this.disposeObject(c.wireframe)
    }
    this.components = []
    this.cfg = null
  }

  /**
   * Walk `source`, clone each mesh, swap in a red wireframe material, and
   * return the group. Transforms follow because the group is parented to
   * `source` at attach time.
   *
   * @param source - Component root to mirror as a wireframe overlay.
   * @returns Group of wireframe clones in source-local space.
   */
  private buildWireframe(source: THREE.Object3D): THREE.Object3D {
    const group = new THREE.Group()
    source.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return
      const mesh = obj as THREE.Mesh
      const clone = new THREE.Mesh(
        mesh.geometry,
        new THREE.MeshBasicMaterial({
          color: DAMAGE_WIREFRAME_COLOR,
          wireframe: true,
          transparent: true,
          opacity: WIREFRAME_OPACITY,
          depthTest: true,
          depthWrite: false,
        }),
      )
      clone.matrixAutoUpdate = false
      // Copy world transform into the clone, then invert the source world so
      // the overlay sits exactly on top when added as a child of `source`.
      mesh.updateWorldMatrix(true, false)
      source.updateWorldMatrix(true, false)
      const inv = new THREE.Matrix4().copy(source.matrixWorld).invert()
      clone.matrix.multiplyMatrices(inv, mesh.matrixWorld)
      group.add(clone)
    })
    return group
  }

  /**
   * Set every wireframe mesh material's base color.
   *
   * @param wireframe - Overlay group previously built by `buildWireframe`.
   * @param hex - Target color as a 24-bit hex number.
   */
  private setWireframeColor(wireframe: THREE.Object3D, hex: number): void {
    wireframe.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.color.setHex(hex)
    })
  }

  /**
   * Dispose geometry + materials under `obj`. Shared geometry is NOT disposed
   * because the base mesh still uses it.
   *
   * @param obj - Object3D whose descendants should have materials/textures freed.
   */
  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh) {
        // Geometry is shared with the source mesh — do not dispose here.
        const mat = mesh.material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else if (mat) mat.dispose()
      }
    })
  }
}
