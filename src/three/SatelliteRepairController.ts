/**
 * In-scene controller for the satellite servicing minigame.
 *
 * Attaches to a satellite POI during EVA, applies a red wireframe overlay to
 * each broken component, detects when the EVA player drifts into interact
 * range of a still-broken component, shows a "FIX [F]" billboard, and on
 * F-press stubs the repair (marks the component repaired, fades the overlay,
 * calls `minigame.markRepaired`). The real drag mechanic lands in a later
 * plan; this skeleton ships the end-to-end loop with a single-press stub.
 *
 * @author guinetik
 * @date 2026-04-19
 * @spec docs/superpowers/specs/2026-04-19-eva-minigame-wiring-design.md
 */
import * as THREE from 'three'
import type { SatelliteServicingMiniGame } from '@/lib/minigame/satelliteServicing/SatelliteServicingMiniGame'
import type { ActiveVisitRelayMission } from '@/lib/missions/types'
import { validateManifest } from '@/lib/satellites/satelliteManifests'

/** Distance (world units) within which a FIX prompt appears above a broken component. */
const FIX_PROMPT_RANGE = 2.5

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
  /** Source of the EVA player world position for proximity checks. */
  getPlayerPosition: () => THREE.Vector3
  /** True while the F-press should register as a repair attempt. */
  isFixKeyPressed: () => boolean
  /** The minigame instance — controller calls `markRepaired(name)` on success. */
  minigame: SatelliteServicingMiniGame
  /** The active mission — reserved for future use (mission-specific tuning). */
  mission: ActiveVisitRelayMission
}

/** Internal per-component state. Tracks the source object, damage overlay, prompt, and fade. */
interface DamagedComponent {
  /** Named sub-object identifier matching the satellite manifest. */
  name: string
  /** The original POI sub-object being overlaid. */
  source: THREE.Object3D
  /** Red wireframe group parented under `source`. */
  wireframe: THREE.Object3D
  /** Billboard sprite parented under `source`, toggled in proximity. */
  promptBillboard: THREE.Sprite
  /** True once a repair is triggered — drives fade animation. */
  fading: boolean
  /** Accumulated time since fade started, in seconds. */
  fadeTimer: number
}

/**
 * Controller-side skeleton for the satellite servicing minigame.
 *
 * Usage:
 * ```ts
 * const controller = new SatelliteRepairController()
 * controller.attach({ poiObject, getPlayerPosition, isFixKeyPressed, minigame, mission })
 * // …later, per frame…
 * controller.tick(dt)
 * // …on minigame.onComplete or forced abort…
 * controller.dispose()
 * ```
 *
 * @author guinetik
 * @date 2026-04-19
 */
export class SatelliteRepairController {
  private cfg: SatelliteRepairControllerConfig | null = null
  private components: DamagedComponent[] = []
  private prevFixKey = false

  /** Reused scratch vector for per-component player-distance checks in `tick`. */
  private readonly _tmpPlayerDist = new THREE.Vector3()

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
      })
    }
  }

  /**
   * Per-frame update. Runs proximity detection for broken components, shows
   * the FIX prompt on the nearest in-range one, and applies the single-press
   * stub repair when the F key transitions pressed.
   *
   * @param dt - Delta time in seconds.
   */
  tick(dt: number): void {
    if (!this.cfg) return
    const player = this.cfg.getPlayerPosition()

    let nearest: DamagedComponent | null = null
    let nearestDist = FIX_PROMPT_RANGE
    for (const c of this.components) {
      if (c.fading) continue
      c.source.getWorldPosition(this._tmpPlayerDist)
      const d = this._tmpPlayerDist.distanceTo(player)
      if (d < nearestDist) {
        nearest = c
        nearestDist = d
      }
    }

    // Hide prompts on every component; reveal only the nearest in-range.
    for (const c of this.components) {
      c.promptBillboard.visible = c === nearest && !c.fading
    }

    const fixPressed = this.cfg.isFixKeyPressed()
    const fixJustPressed = fixPressed && !this.prevFixKey
    this.prevFixKey = fixPressed
    if (fixJustPressed && nearest) {
      nearest.fading = true
      nearest.promptBillboard.visible = false
      this.cfg.minigame.markRepaired(nearest.name)
    }

    // Drive fade + wireframe removal.
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
    return sprite
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
