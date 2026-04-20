/**
 * In-scene controller for the satellite servicing minigame.
 *
 * Attaches to a satellite POI during EVA, applies a red wireframe overlay to
 * each broken component, and runs a forward raycast from the FPS camera to
 * detect aim. The aimed component's wireframe turns orange and shows a
 * "[F] FIX" billboard; F-press while aimed calls `minigame.markRepaired`,
 * fades the overlay, and removes it. Completing all repairs fires the
 * minigame's `onComplete`, which the host pipes into its reward chain.
 *
 * @author guinetik
 * @date 2026-04-19
 * @spec docs/superpowers/specs/2026-04-19-eva-minigame-wiring-design.md
 */
import * as THREE from 'three'
import type { SatelliteServicingMiniGame } from '@/lib/minigame/satelliteServicing/SatelliteServicingMiniGame'
import type { ActiveVisitRelayMission } from '@/lib/missions/types'
import { validateManifest } from '@/lib/satellites/satelliteManifests'

/** Maximum raycast distance (world units) for aim detection. Rays longer than this don't highlight a component. */
const AIM_RAYCAST_MAX_DISTANCE = 15

/** Orange emissive color applied to the wireframe of the currently aimed-at broken component. */
const AIM_HIGHLIGHT_COLOR = 0xfb923c

/** Red emissive wireframe color for damaged components. */
const DAMAGE_WIREFRAME_COLOR = 0xf87171

/** Fade-out duration (seconds) applied to a wireframe when its component is repaired. */
const WIREFRAME_FADE_SECONDS = 0.5

/** Billboard canvas pixel dimensions — power-of-two-safe. */
const BILLBOARD_CANVAS_WIDTH = 256

/** Billboard canvas height in pixels. */
const BILLBOARD_CANVAS_HEIGHT = 64

/** Billboard sprite scale in world units — wide/short reads at normal EVA distances. */
const BILLBOARD_SCALE_X = 1.2

/** Billboard sprite scale Y in world units. */
const BILLBOARD_SCALE_Y = 0.3

/** Billboard vertical offset above each component's local origin (world units). */
const BILLBOARD_LOCAL_Y_OFFSET = 1.2

/** Starting opacity for the red wireframe overlay. */
const WIREFRAME_START_OPACITY = 0.9

/** Stroke width (px) of the border drawn on the FIX prompt canvas. */
const BORDER_STROKE_WIDTH = 2

/** Font size (px) for the FIX prompt label text. */
const FONT_SIZE_PX = 28

/** Stroke color for the FIX prompt panel border. */
const BORDER_COLOR = '#22d3ee'

/** Text fill color for the FIX prompt label. */
const TEXT_COLOR = '#cffafe'

/** Background fill for the FIX prompt panel. */
const PANEL_FILL = 'rgba(5, 7, 12, 0.8)'

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
}

/** Internal per-component state. Tracks the source object, damage overlay, prompt, and fade. */
interface DamagedComponent {
  /** Name of the rigged sub-object this component represents. */
  name: string
  /** Source Object3D on the POI tree — the wireframe overlay sits on top of this. */
  source: THREE.Object3D
  /** Red (or orange when aimed) wireframe overlay group. */
  wireframe: THREE.Object3D
  /** FIX-prompt billboard shown only when this component is the current aim target. */
  promptBillboard: THREE.Sprite
  /** Set to true when `markRepaired` fires for this component; drives the fade-out loop. */
  fading: boolean
  /** Elapsed fade seconds, capped at `WIREFRAME_FADE_SECONDS`. */
  fadeTimer: number
  /** Whether this component is the current aim target — drives wireframe color + prompt visibility. */
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

  /** Reused raycaster for per-frame aim detection. */
  private readonly _raycaster = new THREE.Raycaster()

  /** Reused forward vector sampled from the camera each frame. */
  private readonly _forward = new THREE.Vector3()

  /**
   * Attach to a scene + POI. Looks up each broken component by name, applies
   * a red wireframe overlay and a hidden FIX-prompt billboard above it. If
   * any manifest component is missing from the POI tree, logs a warning and
   * skips that component (so the rest of the mission stays playable).
   *
   * @param cfg - Attachment configuration.
   */
  attach(cfg: SatelliteRepairControllerConfig): void {
    this.cfg = cfg
    const brokenList = cfg.minigame.brokenComponents
    const validation = validateManifest(cfg.poiObject, brokenList)
    if (!validation.ok) {
      console.warn(
        '[SatelliteRepairController] Missing components on POI:',
        validation.missing,
      )
    }
    for (const name of validation.found) {
      const source = cfg.poiObject.getObjectByName(name)
      if (!source) continue
      const wireframe = this.buildWireframe(source)
      const promptBillboard = this.buildFixPrompt()
      promptBillboard.visible = false
      source.add(wireframe)
      source.add(promptBillboard)
      this.components.push({
        name,
        source,
        wireframe,
        promptBillboard,
        fading: false,
        fadeTimer: 0,
        aimed: false,
      })
    }
  }

  /**
   * Per-frame update. Runs a forward raycast from the FPS camera to detect
   * which broken component the player is aiming at, turns its wireframe orange,
   * shows the FIX prompt, and on F-press triggers the repair stub.
   *
   * @param dt - Delta time in seconds.
   */
  tick(dt: number): void {
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

    // Apply aim state changes — swap wireframe color when entering/leaving aim,
    // toggle billboard visibility so only the aimed component shows its FIX prompt.
    for (const c of this.components) {
      if (c.fading) {
        c.aimed = false
        c.promptBillboard.visible = false
        continue
      }
      const nowAimed = c === aimed
      if (nowAimed !== c.aimed) {
        c.aimed = nowAimed
        this.setWireframeColor(c.wireframe, nowAimed ? AIM_HIGHLIGHT_COLOR : DAMAGE_WIREFRAME_COLOR)
      }
      c.promptBillboard.visible = nowAimed
    }

    // F edge-trigger: only while the player is actively aiming at a broken component.
    const fixPressed = this.cfg.isFixKeyPressed()
    const fixJustPressed = fixPressed && !this.prevFixKey
    this.prevFixKey = fixPressed
    if (fixJustPressed && aimed) {
      aimed.fading = true
      aimed.promptBillboard.visible = false
      this.cfg.minigame.markRepaired(aimed.name)
    }

    // Fade loop — unchanged from the proximity version.
    for (const c of this.components) {
      if (!c.fading) continue
      c.fadeTimer += dt
      const t = Math.min(1, c.fadeTimer / WIREFRAME_FADE_SECONDS)
      this.setWireframeOpacity(c.wireframe, WIREFRAME_START_OPACITY * (1 - t))
      if (t >= 1 && c.wireframe.parent) {
        c.wireframe.parent.remove(c.wireframe)
      }
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
   * Detach and dispose every overlay/prompt. Safe to call multiple times.
   */
  dispose(): void {
    for (const c of this.components) {
      if (c.wireframe.parent) c.wireframe.parent.remove(c.wireframe)
      if (c.promptBillboard.parent) c.promptBillboard.parent.remove(c.promptBillboard)
      this.disposeObject(c.wireframe)
      this.disposeObject(c.promptBillboard)
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
          opacity: WIREFRAME_START_OPACITY,
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
   * Build a canvas-textured sprite saying "[F] FIX". Visible toggling lives
   * in `tick`. Positioned slightly above the component's local origin.
   *
   * @returns Billboard sprite ready to parent under a component source.
   */
  private buildFixPrompt(): THREE.Sprite {
    const canvas = document.createElement('canvas')
    canvas.width = BILLBOARD_CANVAS_WIDTH
    canvas.height = BILLBOARD_CANVAS_HEIGHT
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = PANEL_FILL
    ctx.fillRect(0, 0, BILLBOARD_CANVAS_WIDTH, BILLBOARD_CANVAS_HEIGHT)
    ctx.strokeStyle = BORDER_COLOR
    ctx.lineWidth = BORDER_STROKE_WIDTH
    ctx.strokeRect(
      BORDER_STROKE_WIDTH / 2,
      BORDER_STROKE_WIDTH / 2,
      BILLBOARD_CANVAS_WIDTH - BORDER_STROKE_WIDTH,
      BILLBOARD_CANVAS_HEIGHT - BORDER_STROKE_WIDTH,
    )
    ctx.fillStyle = TEXT_COLOR
    ctx.font = `bold ${FONT_SIZE_PX}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('[F] FIX', BILLBOARD_CANVAS_WIDTH / 2, BILLBOARD_CANVAS_HEIGHT / 2)
    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true })
    const sprite = new THREE.Sprite(material)
    sprite.scale.set(BILLBOARD_SCALE_X, BILLBOARD_SCALE_Y, 1)
    sprite.position.set(0, BILLBOARD_LOCAL_Y_OFFSET, 0)
    // The FIX prompt is a child of the component's source node, so it lives in the
    // path of our aim-detection raycast. Sprites require `raycaster.camera` to be
    // set, which we don't use — we only intersect against source meshes to detect
    // aim. Skip sprite intersection entirely.
    sprite.raycast = () => {}
    return sprite
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
   * Tween every mesh material's opacity inside `wireframe`.
   *
   * @param wireframe - Overlay group previously built by `buildWireframe`.
   * @param opacity - Target opacity, 0..1.
   */
  private setWireframeOpacity(wireframe: THREE.Object3D, opacity: number): void {
    wireframe.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = opacity
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
      const sprite = child as THREE.Sprite
      if (sprite.isSprite) {
        const sm = sprite.material
        if (sm.map) sm.map.dispose()
        sm.dispose()
      }
    })
  }
}
