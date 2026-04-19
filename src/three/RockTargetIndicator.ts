/**
 * Mineable-rock HP bar indicator.
 *
 * Renders a single billboard sprite with a canvas-textured HP bar plus
 * the mineral label of the rock the player is currently aiming at
 * with the drill mode active. Mirrors the per-hostage HP bar in
 * `FpsHostageController`, but uses one shared sprite that hops
 * between targets — there can be hundreds of mineable rocks per
 * level and we never need more than one bar on screen at a time.
 *
 * @author guinetik
 * @date 2026-04-18
 */
import * as THREE from 'three'

/** Canvas dimensions for the generated HP bar texture. */
const CANVAS_W = 192
const CANVAS_H = 48

/** World-space size of the sprite. Tuned to read at typical drill range. */
const SPRITE_W = 5.2
const SPRITE_H = 1.3

/**
 * Padding above the rock's silhouette before the bar's bottom edge,
 * in world units. The actual sprite center sits at
 * `rockCenter.y + rockRadius + SURFACE_PADDING + SPRITE_H * 0.5` so
 * even a 24m boulder gets the bar clearly above its top instead of
 * floating inside it.
 */
const SURFACE_PADDING = 0.6
/** Minimum lift above the rock center when no radius is supplied. */
const MIN_VERTICAL_OFFSET = 1.6

/** Bar fill colors per remaining-HP fraction. */
const COLOR_HEALTHY = '#66ffee'
const COLOR_MID = '#ffd166'
const COLOR_LOW = '#ff6b6b'
const COLOR_BG = 'rgba(8, 14, 18, 0.72)'
const COLOR_BORDER = 'rgba(102, 255, 238, 0.55)'

const MID_THRESHOLD = 0.6
const LOW_THRESHOLD = 0.3

/** Snapshot of the rock the indicator is currently tracking. */
export interface RockTargetSnapshot {
  spawnIndex: number
  centerX: number
  centerY: number
  centerZ: number
  /**
   * Collision-sphere radius of the rock in world units. Used to lift
   * the sprite above the rock's silhouette so big spawns don't have
   * the bar floating inside them. Optional — falls back to a flat
   * minimum offset when omitted.
   */
  radius?: number
  remainingKg: number
  totalKg: number
  label: string
}

/**
 * Single-sprite HP/label indicator for the actively-targeted rock.
 *
 * Lifecycle:
 *   - `setTarget(snapshot)` — show the bar at the snapshot position.
 *   - `setTarget(null)` — hide the bar.
 *   - `dispose()` — free the canvas + sprite resources.
 */
export class RockTargetIndicator {
  readonly sprite: THREE.Sprite
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly texture: THREE.CanvasTexture
  private currentSpawnIndex: number | null = null
  private lastRemaining = Number.NaN
  private lastTotal = Number.NaN
  private lastLabel: string | null = null

  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.width = CANVAS_W
    this.canvas.height = CANVAS_H
    const ctx = this.canvas.getContext('2d')
    if (!ctx) {
      throw new Error('RockTargetIndicator: 2D canvas context unavailable')
    }
    this.ctx = ctx
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    const material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    })
    this.sprite = new THREE.Sprite(material)
    this.sprite.scale.set(SPRITE_W, SPRITE_H, 1)
    this.sprite.visible = false
    this.sprite.renderOrder = 10
  }

  /**
   * Update the indicator. Pass `null` to hide it.
   * Idempotent — when the same target is passed in subsequent frames
   * only the position is rewritten; the canvas is only redrawn when
   * the visible HP changes.
   */
  setTarget(snapshot: RockTargetSnapshot | null): void {
    if (!snapshot) {
      this.hide()
      return
    }
    this.sprite.visible = true
    const lift = snapshot.radius !== undefined
      ? snapshot.radius + SURFACE_PADDING + SPRITE_H * 0.5
      : MIN_VERTICAL_OFFSET + SPRITE_H * 0.5
    this.sprite.position.set(
      snapshot.centerX,
      snapshot.centerY + lift,
      snapshot.centerZ,
    )
    const remainingChanged =
      snapshot.spawnIndex !== this.currentSpawnIndex
      || snapshot.label !== this.lastLabel
      || Math.abs(snapshot.remainingKg - this.lastRemaining) >= 0.5
      || snapshot.totalKg !== this.lastTotal
    if (remainingChanged) {
      this.currentSpawnIndex = snapshot.spawnIndex
      this.lastRemaining = snapshot.remainingKg
      this.lastTotal = snapshot.totalKg
      this.lastLabel = snapshot.label
      this.redraw(snapshot)
    }
  }

  /** Hide the bar without disposing it; ready to be retargeted. */
  hide(): void {
    if (!this.sprite.visible) return
    this.sprite.visible = false
    this.currentSpawnIndex = null
    this.lastRemaining = Number.NaN
    this.lastTotal = Number.NaN
    this.lastLabel = null
  }

  dispose(): void {
    this.sprite.material.map?.dispose()
    ;(this.sprite.material as THREE.SpriteMaterial).dispose()
    this.texture.dispose()
    this.sprite.removeFromParent()
  }

  /** Repaint the canvas texture with the current snapshot. */
  private redraw(snapshot: RockTargetSnapshot): void {
    const ctx = this.ctx
    const w = CANVAS_W
    const h = CANVAS_H
    ctx.clearRect(0, 0, w, h)

    const barH = 14
    const barX = 6
    const barY = h - barH - 6
    const barW = w - barX * 2

    ctx.fillStyle = COLOR_BG
    ctx.fillRect(0, 0, w, h)

    ctx.fillStyle = '#cffaf0'
    ctx.font = 'bold 18px "Datatype", ui-monospace, monospace'
    ctx.textBaseline = 'top'
    ctx.fillText(snapshot.label.toUpperCase(), barX, 4, barW)

    const ratio = snapshot.totalKg > 0
      ? Math.max(0, Math.min(1, snapshot.remainingKg / snapshot.totalKg))
      : 0

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
    ctx.fillRect(barX, barY, barW, barH)

    ctx.fillStyle = ratio > MID_THRESHOLD ? COLOR_HEALTHY
      : ratio > LOW_THRESHOLD ? COLOR_MID
      : COLOR_LOW
    ctx.fillRect(barX, barY, barW * ratio, barH)

    ctx.strokeStyle = COLOR_BORDER
    ctx.lineWidth = 1
    ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, barH - 1)

    ctx.fillStyle = '#cffaf0'
    ctx.font = '11px "Datatype", ui-monospace, monospace'
    ctx.textBaseline = 'bottom'
    ctx.textAlign = 'right'
    ctx.fillText(
      `${Math.ceil(snapshot.remainingKg)} / ${Math.round(snapshot.totalKg)} KG`,
      w - barX,
      barY - 1,
    )
    ctx.textAlign = 'left'

    this.texture.needsUpdate = true
  }
}
