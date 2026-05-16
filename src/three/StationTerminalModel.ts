/**
 * GLB-backed station terminal kiosk used inside the station interior.
 *
 * Loads `/models/station_terminal.glb` and wires the authored
 * `terminal_screen` mesh as a controllable emissive panel: cycles through
 * procedural glyphs while idle, and can swap to an arbitrary `<canvas>`
 * (e.g. the hazard-room map) on demand.
 *
 * Mirrors the public surface of {@link TerminalModel} so it can drop in
 * behind the existing `'terminal'` station-prop kind without touching
 * `StationBuilder`. The outdoor survey terminal still uses the procedural
 * `TerminalModel`; only the station prop is upgraded.
 *
 * @author guinetik
 * @date 2026-05-15
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */
import * as THREE from 'three'
import type { WorldCollider } from '@/lib/physics/worldCollision'
import { loadAnimatedGLB } from '@/three/loadGLB'

/** Asset URL for the optimized station terminal GLB. */
const STATION_TERMINAL_MODEL_URL = '/models/station_terminal.glb'

/** Authored node name of the screen sub-mesh inside the GLB. */
const SCREEN_NODE_NAME = 'terminal_screen'

/** Keyboard-folded pose time on the terminal GLB timeline, in seconds. */
const TERMINAL_KEYBOARD_FOLDED_TIME = 2

/** First frame of the keyboard fold-back authored range, in seconds. */
const TERMINAL_KEYBOARD_FOLD_BACK_START_TIME = 0

/** Fully-open terminal timeline time after player interaction, in seconds. */
const TERMINAL_KEYBOARD_OPEN_TIME = 5

/** Playback speed multiplier for the terminal keyboard timeline. */
const TERMINAL_KEYBOARD_ANIMATION_SPEED = 3

/** Native model height in world units (post-optimization, see GLB bbox). */
const STATION_TERMINAL_NATIVE_HEIGHT = 1.84

/** Native model lateral half-width on X (post-optimization, see GLB bbox). */
export const STATION_TERMINAL_BASE_HALF_X = 0.41

/** Native model lateral half-depth on Z (post-optimization, see GLB bbox). */
export const STATION_TERMINAL_BASE_HALF_Z = 0.61

/** Default emissive screen color — matches `TerminalModel`'s teal idle. */
const SCREEN_DEFAULT_COLOR = 0x00ffcc

/** Default emissive screen intensity. */
const SCREEN_EMISSIVE_INTENSITY = 1.4

/** Off-axis screen base albedo — kept dark so the emissive carries the look. */
const SCREEN_BASE_COLOR = 0x031412

/** Idle glyph canvas resolution (square). */
const GLYPH_CANVAS_SIZE = 256

/** Seconds each glyph stays visible before cycling to the next. */
const GLYPH_CYCLE_SECONDS = 0.75

/** Stroke width of canvas glyphs in pixels. */
const GLYPH_STROKE_WIDTH = 14

/** Glyph stroke colour — high-contrast violet, matches `TerminalModel`. */
const GLYPH_INK_COLOR = '#1b0030'

/** Outer radius of canvas glyphs as a fraction of canvas half-extent. */
const GLYPH_OUTER_RADIUS_FRACTION = 0.62

/** Inner radius of canvas glyphs as a fraction of canvas half-extent. */
const GLYPH_INNER_RADIUS_FRACTION = 0.22

/** Tick radius of canvas glyphs as a fraction of canvas half-extent. */
const GLYPH_TICK_RADIUS_FRACTION = 0.4

/**
 * Three.js terminal model backed by an authored GLB. Construct, await
 * {@link load}, then add {@link group} to the scene.
 */
export class StationTerminalModel {
  /** Public scene-graph node — host scene parents this into its room. */
  readonly group: THREE.Group

  private inner: THREE.Group | null = null
  private screenMaterial: THREE.MeshStandardMaterial | null = null
  private idleTexture: THREE.CanvasTexture | null = null
  private idleCanvas: HTMLCanvasElement | null = null
  private idleContext: CanvasRenderingContext2D | null = null
  private mapTexture: THREE.CanvasTexture | null = null
  private mapActive = false
  private glyphElapsed = 0
  private glyphIndex = 0
  private loadStarted = false
  private loaded = false
  private animationMixer: THREE.AnimationMixer | null = null
  private animationAction: THREE.AnimationAction | null = null
  private animationTime = TERMINAL_KEYBOARD_FOLDED_TIME
  private animationTargetTime = TERMINAL_KEYBOARD_FOLDED_TIME
  private animationPlaying = false

  /** Build an empty wrapper. {@link load} must be called before use. */
  constructor() {
    this.group = new THREE.Group()
    this.group.name = 'stationTerminal'
    void this.load()
  }

  /** World-space position helper, mirrors `TerminalModel.position`. */
  get position(): THREE.Vector3 {
    return this.group.position
  }

  /**
   * Stream the GLB and wire the screen material. Idempotent — repeated
   * calls return the same in-flight promise.
   */
  async load(): Promise<void> {
    if (this.loadStarted) return
    this.loadStarted = true

    const { scene: inner, animations } = await loadAnimatedGLB(STATION_TERMINAL_MODEL_URL)
    this.inner = inner
    this.group.add(inner)
    this.bindKeyboardAnimation(inner, animations)

    const screen = inner.getObjectByName(SCREEN_NODE_NAME)
    if (screen instanceof THREE.Mesh) {
      this.bindScreenMesh(screen)
    } else {
      console.warn(
        `[StationTerminalModel] '${SCREEN_NODE_NAME}' node not found or not a Mesh; ` +
          'screen UI will be inert.',
      )
    }

    this.loaded = true
  }

  /** Whether the GLB has finished loading. */
  isLoaded(): boolean {
    return this.loaded
  }

  /**
   * Place this terminal at a world position. Matches the `TerminalModel`
   * signature so callers can swap models without changing placement code.
   *
   * @param x - World X.
   * @param groundY - Floor Y at (x, z) — the GLB's base sits here.
   * @param z - World Z.
   */
  placeAt(x: number, groundY: number, z: number): void {
    this.group.position.set(x, groundY, z)
  }

  /**
   * Advance the cycling idle glyph. No-op while a map overlay is active.
   *
   * @param dt - Frame delta in seconds.
   */
  tick(dt: number): void {
    this.tickKeyboardAnimation(dt)
    if (this.mapActive || !this.idleContext || !this.idleTexture) return
    this.glyphElapsed += dt
    while (this.glyphElapsed >= GLYPH_CYCLE_SECONDS) {
      this.glyphElapsed -= GLYPH_CYCLE_SECONDS
      this.glyphIndex = (this.glyphIndex + 1) % 3
      this.drawIdleGlyph(this.glyphIndex)
      this.idleTexture.needsUpdate = true
    }
  }

  /**
   * Play the keyboard reveal authored after the folded idle pose.
   */
  playInteractAnimation(): void {
    this.playKeyboardSegment(TERMINAL_KEYBOARD_FOLDED_TIME, TERMINAL_KEYBOARD_OPEN_TIME)
  }

  /**
   * Play the fold-back authored at the start of the GLB timeline.
   */
  playLeaveAnimation(): void {
    this.playKeyboardSegment(TERMINAL_KEYBOARD_FOLD_BACK_START_TIME, TERMINAL_KEYBOARD_FOLDED_TIME)
  }

  /**
   * Mount a `<canvas>` as the screen texture, hiding the cycling idle
   * glyph. Idempotent — subsequent calls swap the canvas behind the same
   * texture and force-update.
   *
   * @param canvas - Pre-drawn canvas source. Caller owns its lifetime.
   */
  showMapTexture(canvas: HTMLCanvasElement): void {
    if (!this.screenMaterial) return
    if (!this.mapTexture) {
      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.minFilter = THREE.LinearFilter
      texture.magFilter = THREE.LinearFilter
      this.mapTexture = texture
    } else {
      this.mapTexture.image = canvas
      this.mapTexture.needsUpdate = true
    }
    this.screenMaterial.map = this.mapTexture
    this.screenMaterial.emissiveMap = this.mapTexture
    this.screenMaterial.needsUpdate = true
    this.mapActive = true
  }

  /** Restore the cycling idle glyph. Safe to call when no map is mounted. */
  hideMapTexture(): void {
    if (!this.screenMaterial || !this.idleTexture) return
    this.screenMaterial.map = this.idleTexture
    this.screenMaterial.emissiveMap = this.idleTexture
    this.screenMaterial.needsUpdate = true
    this.mapActive = false
  }

  /**
   * Override the screen emissive color at runtime — drives status cues
   * (idle teal, success green, warning yellow, error red).
   *
   * @param hex - 24-bit RGB hex color (e.g. `0x00ffcc`).
   */
  setScreenEmissive(hex: number): void {
    if (!this.screenMaterial) return
    this.screenMaterial.emissive.setHex(hex)
  }

  /**
   * Build the analytic collision volume used by station lateral movement.
   * Mirrors `TerminalModel.createWorldCollider` so callers don't need to
   * special-case the GLB-backed variant.
   *
   * @param id - Stable collider id for debug and ignore filters.
   * @returns Lazy world-space AABB collider.
   */
  createWorldCollider(id: string): WorldCollider {
    return {
      id,
      kind: 'aabb',
      min: () => ({
        x: this.group.position.x - STATION_TERMINAL_BASE_HALF_X,
        y: this.group.position.y,
        z: this.group.position.z - STATION_TERMINAL_BASE_HALF_Z,
      }),
      max: () => ({
        x: this.group.position.x + STATION_TERMINAL_BASE_HALF_X,
        y: this.group.position.y + STATION_TERMINAL_NATIVE_HEIGHT,
        z: this.group.position.z + STATION_TERMINAL_BASE_HALF_Z,
      }),
      enabled: () => this.group.visible,
    }
  }

  /** Release GPU resources. */
  dispose(): void {
    this.animationMixer?.stopAllAction()
    if (this.inner) {
      this.inner.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          const mats = Array.isArray(child.material) ? child.material : [child.material]
          for (const m of mats) if (m instanceof THREE.Material) m.dispose()
        }
      })
    }
    this.idleTexture?.dispose()
    this.mapTexture?.dispose()
  }

  private bindScreenMesh(mesh: THREE.Mesh): void {
    this.idleCanvas = document.createElement('canvas')
    this.idleCanvas.width = GLYPH_CANVAS_SIZE
    this.idleCanvas.height = GLYPH_CANVAS_SIZE
    this.idleContext = this.idleCanvas.getContext('2d')
    this.drawIdleGlyph(this.glyphIndex)

    const idleTexture = new THREE.CanvasTexture(this.idleCanvas)
    idleTexture.colorSpace = THREE.SRGBColorSpace
    idleTexture.minFilter = THREE.LinearFilter
    idleTexture.magFilter = THREE.LinearFilter
    this.idleTexture = idleTexture

    const material = new THREE.MeshStandardMaterial({
      color: SCREEN_BASE_COLOR,
      emissive: SCREEN_DEFAULT_COLOR,
      emissiveIntensity: SCREEN_EMISSIVE_INTENSITY,
      emissiveMap: idleTexture,
      map: idleTexture,
      metalness: 0,
      roughness: 0.72,
      toneMapped: false,
    })
    this.screenMaterial = material
    mesh.material = material
    this.regenerateScreenUVs(mesh)
  }

  /**
   * Bind the first authored GLB animation and pin the keyboard at its
   * folded idle pose. The station terminal asset owns a single timeline.
   */
  private bindKeyboardAnimation(
    root: THREE.Group,
    animations: ReadonlyArray<THREE.AnimationClip>,
  ): void {
    const clip = animations[0]
    if (!clip) return
    const mixer = new THREE.AnimationMixer(root)
    const action = mixer.clipAction(clip)
    action.loop = THREE.LoopOnce
    action.clampWhenFinished = true
    action.enabled = true
    action.setEffectiveWeight(1)
    action.play()
    this.animationMixer = mixer
    this.animationAction = action
    this.seekKeyboardAnimation(TERMINAL_KEYBOARD_FOLDED_TIME)
  }

  /**
   * Start a timeline segment. The authored terminal animation uses
   * absolute time ranges rather than separate named clips.
   */
  private playKeyboardSegment(fromSeconds: number, toSeconds: number): void {
    if (!this.animationAction || !this.animationMixer) return
    this.animationTime = fromSeconds
    this.animationTargetTime = toSeconds
    this.animationPlaying = true
    this.seekKeyboardAnimation(fromSeconds)
  }

  /**
   * Step the active keyboard segment and clamp on its final pose.
   */
  private tickKeyboardAnimation(dt: number): void {
    if (!this.animationPlaying) return
    const direction = Math.sign(this.animationTargetTime - this.animationTime)
    if (direction === 0) {
      this.animationPlaying = false
      return
    }
    this.animationTime += dt * TERMINAL_KEYBOARD_ANIMATION_SPEED * direction
    const reached =
      direction > 0
        ? this.animationTime >= this.animationTargetTime
        : this.animationTime <= this.animationTargetTime
    if (reached) {
      this.animationTime = this.animationTargetTime
      this.animationPlaying = false
    }
    this.seekKeyboardAnimation(this.animationTime)
  }

  /**
   * Apply an exact time on the terminal's authored timeline.
   */
  private seekKeyboardAnimation(timeSeconds: number): void {
    if (!this.animationAction || !this.animationMixer) return
    this.animationAction.time = timeSeconds
    this.animationMixer.update(0)
  }

  /**
   * Replace the screen mesh's authored UVs with a planar projection that
   * spans the full canvas. The original mesh is UV-unwrapped onto a kiosk
   * texture atlas, so a screen-space canvas would otherwise sample one
   * tiny atlas region and read as uniform colour.
   *
   * Picks the projection plane by finding the local-space axis with the
   * smallest bounding-box extent (the screen's normal axis), then maps
   * the remaining two axes into [0, 1].
   */
  private regenerateScreenUVs(mesh: THREE.Mesh): void {
    const geo = mesh.geometry
    const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!pos) return
    geo.computeBoundingBox()
    const bbox = geo.boundingBox
    if (!bbox) return
    const size = bbox.getSize(new THREE.Vector3())
    const minExtent = Math.min(size.x, size.y, size.z)
    const projectAxes: ['x' | 'y' | 'z', 'x' | 'y' | 'z'] =
      minExtent === size.z ? ['x', 'y'] : minExtent === size.y ? ['x', 'z'] : ['z', 'y']
    const [uAxis, vAxis] = projectAxes
    const uRange = size[uAxis] || 1
    const vRange = size[vAxis] || 1
    const uMin = bbox.min[uAxis]
    const vMin = bbox.min[vAxis]

    const readAxis = (i: number, axis: 'x' | 'y' | 'z'): number =>
      axis === 'x' ? pos.getX(i) : axis === 'y' ? pos.getY(i) : pos.getZ(i)
    const uvs = new Float32Array(pos.count * 2)
    for (let i = 0; i < pos.count; i++) {
      uvs[i * 2] = (readAxis(i, uAxis) - uMin) / uRange
      uvs[i * 2 + 1] = (readAxis(i, vAxis) - vMin) / vRange
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  }

  private drawIdleGlyph(index: number): void {
    const ctx = this.idleContext
    if (!ctx) return
    const size = GLYPH_CANVAS_SIZE
    const cx = size / 2
    const cy = size / 2
    const half = size / 2
    const outerR = half * GLYPH_OUTER_RADIUS_FRACTION
    const innerR = half * GLYPH_INNER_RADIUS_FRACTION
    const tickR = half * GLYPH_TICK_RADIUS_FRACTION

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)
    ctx.strokeStyle = GLYPH_INK_COLOR
    ctx.fillStyle = GLYPH_INK_COLOR
    ctx.lineWidth = GLYPH_STROKE_WIDTH
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (index === 0) this.drawOrbitGlyph(ctx, cx, cy, outerR, innerR, tickR)
    else if (index === 1) this.drawDiamondGlyph(ctx, cx, cy, outerR, innerR, tickR)
    else this.drawWingGlyph(ctx, cx, cy, outerR, tickR)
  }

  private drawOrbitGlyph(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    outerR: number,
    innerR: number,
    tickR: number,
  ): void {
    ctx.beginPath()
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2)
    ctx.stroke()

    const segs: [number, number, number, number][] = [
      [cx - innerR, cy - innerR, cx, cy - outerR],
      [cx, cy - outerR, cx + innerR, cy - innerR],
      [cx - outerR, cy, cx - tickR, cy],
      [cx + tickR, cy, cx + outerR, cy],
      [cx - innerR, cy + innerR, cx + innerR, cy + innerR],
    ]
    for (const [x1, y1, x2, y2] of segs) {
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
  }

  private drawDiamondGlyph(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    outerR: number,
    innerR: number,
    tickR: number,
  ): void {
    ctx.beginPath()
    ctx.moveTo(cx, cy - outerR)
    ctx.lineTo(cx + outerR, cy)
    ctx.lineTo(cx, cy + outerR)
    ctx.lineTo(cx - outerR, cy)
    ctx.closePath()
    ctx.stroke()

    const bars: [number, number, number, number][] = [
      [cx - tickR, cy - tickR, cx + tickR, cy - tickR],
      [cx - tickR, cy + tickR, cx + tickR, cy + tickR],
      [cx, cy - innerR, cx, cy + innerR],
    ]
    for (const [x1, y1, x2, y2] of bars) {
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
  }

  private drawWingGlyph(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    outerR: number,
    tickR: number,
  ): void {
    ctx.beginPath()
    ctx.arc(cx, cy, tickR, 0, Math.PI * 2)
    ctx.stroke()

    const wings: [number, number, number, number][] = [
      [cx - outerR, cy - tickR, cx - tickR, cy],
      [cx - tickR, cy, cx - outerR, cy + tickR],
      [cx + tickR, cy, cx + outerR, cy - tickR],
      [cx + tickR, cy, cx + outerR, cy + tickR],
      [cx, cy - outerR, cx, cy + outerR],
    ]
    for (const [x1, y1, x2, y2] of wings) {
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
  }
}
