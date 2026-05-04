/**
 * Post-processing pipeline for the level scene — "Mass Effect" look.
 *
 * Pipeline (fused into one `EffectPass`, single fullscreen draw):
 *   bloom (mipmap blur) → ACES filmic tonemap → 3D LUT → saturation → contrast → vignette
 *
 * The HDR linear buffer + ACES tonemap is what gives bright lights a filmic
 * roll-off into white. Bloom runs on linear HDR; tonemap converts to LDR;
 * the LUT (loaded async from `/lut.CUBE`) re-grades the LDR image; saturation
 * and contrast then sit at low values for fine touch-up; vignette frames the
 * shot. Until the LUT finishes loading the pipeline runs without it.
 *
 * @author guinetik
 * @date 2026-04-28
 * @spec docs/superpowers/specs/2026-04-06-atmosphere-effects-design.md
 */
import * as THREE from 'three'
import {
  BlendFunction,
  BloomEffect,
  BrightnessContrastEffect,
  EffectComposer,
  EffectPass,
  HueSaturationEffect,
  LUT3DEffect,
  LUTCubeLoader,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  VignetteTechnique,
} from 'postprocessing'

// ── Bloom ──
/** Bloom intensity. Subtle halo on emissives only. */
const BLOOM_INTENSITY = 0.35
/** Threshold at which pixels start to bloom. ACES already lifts highlights. */
const BLOOM_LUMINANCE_THRESHOLD = 0.25
/** Soft transition around the threshold so bloom doesn't pop on/off. */
const BLOOM_LUMINANCE_SMOOTHING = 0.15
/** Bloom kernel radius (smaller = tighter halo). */
const BLOOM_RADIUS = 0.5

// ── Saturation / brightness / contrast ──
/** Range -1..+1. AGX preserves chroma better than ACES — keep a real lift. */
const SATURATION = 0.5
/** Range -1..+1. Slight negative trim. */
const BRIGHTNESS = 0.1
/** Range -1..+1. Mid contrast bump. */
const CONTRAST = 0.25

// ── Vignette ──
/** Where the vignette starts to fall off (lower = larger dark ring). */
const VIGNETTE_OFFSET = 0.25
/** Darkness at the corners. Subtle so playable terrain stays readable. */
const VIGNETTE_DARKNESS = 0.75

// ── LUT ──
/** Default public-folder URL for the 3D color LUT. Loaded async. */
const DEFAULT_LUT_URL = '/lut.CUBE'

/**
 * Manages the pmndrs `EffectComposer` pipeline for the level scene.
 * Call {@link render} each frame instead of `renderer.render()`.
 */
export class LevelPostProcessing {
  private readonly composer: EffectComposer
  private readonly renderPass: RenderPass
  private readonly bloom: BloomEffect
  private readonly tonemap: ToneMappingEffect
  private readonly saturation: HueSaturationEffect
  private readonly contrast: BrightnessContrastEffect
  private readonly vignette: VignetteEffect
  private readonly bloomDefaultBlend: BlendFunction
  private effectPass: EffectPass
  private lut: LUT3DEffect | null = null
  private currentCamera: THREE.Camera
  private disposed = false
  private readonly lutUrl: string
  /** Loaded asteroid/contract LUT — driven by level surface state. */
  private levelLutTexture: THREE.Texture | null = null
  /**
   * Loaded default LUT (`/lut.CUBE`). Preloaded only when the level's LUT
   * URL differs from the default so {@link setBunkerLutOverride} can swap
   * synchronously without a load hitch on bunker entry. When the level is
   * already on the default LUT this stays `null` and the override is a
   * cheap no-op.
   */
  private defaultLutTexture: THREE.Texture | null = null
  /** Whether {@link setBunkerLutOverride} is currently active. */
  private bunkerLutOverrideActive = false

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    options: { lutUrl?: string } = {},
  ) {
    this.currentCamera = camera
    this.lutUrl = options.lutUrl ?? DEFAULT_LUT_URL

    // HDR target — bright lights can exceed 1.0 in linear space so the ACES
    // tonemap gets real highlight data to roll off, instead of clamped 8-bit.
    this.composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
    })

    this.renderPass = new RenderPass(scene, camera)
    this.composer.addPass(this.renderPass)

    this.bloom = new BloomEffect({
      intensity: BLOOM_INTENSITY,
      luminanceThreshold: BLOOM_LUMINANCE_THRESHOLD,
      luminanceSmoothing: BLOOM_LUMINANCE_SMOOTHING,
      mipmapBlur: true,
      radius: BLOOM_RADIUS,
    })
    this.bloomDefaultBlend = this.bloom.blendMode.blendFunction

    // AGX preserves color saturation better than ACES_FILMIC, which famously
    // desaturates bright colors as part of its film-safe range compression.
    // For a vibrant ME look, AGX > ACES.
    this.tonemap = new ToneMappingEffect({
      mode: ToneMappingMode.UNCHARTED2,
    })

    this.saturation = new HueSaturationEffect({
      saturation: SATURATION,
    })

    this.contrast = new BrightnessContrastEffect({
      brightness: BRIGHTNESS,
      contrast: CONTRAST,
    })

    this.vignette = new VignetteEffect({
      technique: VignetteTechnique.DEFAULT,
      offset: VIGNETTE_OFFSET,
      darkness: VIGNETTE_DARKNESS,
    })

    this.effectPass = this.buildEffectPass()
    this.composer.addPass(this.effectPass)

    void this.loadLUT()
  }

  /**
   * Load the level LUT (and the default LUT, if different) and splice the
   * `LUT3DEffect` into the fused pass. Bunker entry can then hot-swap to
   * the default LUT via {@link setBunkerLutOverride} without re-loading.
   *
   * Failures are non-fatal — the pipeline keeps running un-LUT'd.
   */
  private async loadLUT(): Promise<void> {
    try {
      const loader = new LUTCubeLoader()
      this.levelLutTexture = await loader.loadAsync(this.lutUrl)
      if (this.disposed) return

      // Preload default LUT alongside the level LUT so bunker entry can
      // override synchronously. Skip when the level is already using the
      // default — the override path will fall back to `levelLutTexture`
      // (same instance) so no extra fetch is needed.
      if (this.lutUrl !== DEFAULT_LUT_URL) {
        this.defaultLutTexture = await loader.loadAsync(DEFAULT_LUT_URL)
        if (this.disposed) return
      }

      const initialTexture = this.bunkerLutOverrideActive
        ? (this.defaultLutTexture ?? this.levelLutTexture)
        : this.levelLutTexture
      // Tetrahedral interpolation gives smoother transitions between LUT
      // cells — subtle LUT character shows through instead of being averaged
      // out by trilinear sampling.
      this.lut = new LUT3DEffect(initialTexture, { tetrahedralInterpolation: true })
      this.composer.removePass(this.effectPass)
      this.effectPass.dispose()
      this.effectPass = this.buildEffectPass()
      this.composer.addPass(this.effectPass)
      console.info('[LevelPostProcessing] LUT applied:', this.lutUrl)
    } catch (err) {
      console.warn('[LevelPostProcessing] LUT load failed', err)
    }
  }

  /**
   * While the player is inside a bunker, force the default `/lut.CUBE`
   * grade regardless of the asteroid/contract LUT chosen for the surface.
   * Bunker interiors are dark technical spaces — orange/red asteroid LUTs
   * make them read as if they were still lit by the surface.
   *
   * Hot-swaps the texture on the existing {@link LUT3DEffect}, so the
   * fused effect-pass shader does not recompile (provided both LUTs share
   * the same size, which is the case for all `.CUBE` files in `public/`).
   *
   * @param active - `true` to force default LUT, `false` to restore level LUT.
   */
  setBunkerLutOverride(active: boolean): void {
    this.bunkerLutOverrideActive = active
    if (!this.lut) return
    const target = active
      ? (this.defaultLutTexture ?? this.levelLutTexture)
      : this.levelLutTexture
    if (target) {
      this.lut.setLUT(target)
    }
  }

  private buildEffectPass(): EffectPass {
    const effects = this.lut
      ? [this.bloom, this.tonemap, this.lut, this.saturation, this.contrast, this.vignette]
      : [this.bloom, this.tonemap, this.saturation, this.contrast, this.vignette]
    return new EffectPass(this.currentCamera, ...effects)
  }

  /**
   * Bunker interiors are dark and tight; the bloom mip pyramid still costs
   * bandwidth even when nothing is bright. Skips bloom while active by
   * setting its blend function to {@link BlendFunction.SKIP}; everything
   * else stays so tone continuity with EVA holds.
   *
   * @param _active - When true, bloom is skipped inside the fused pass.
   */
  setBunkerInteriorReducedPipeline(_active: boolean): void {
    //this.bloom.blendMode.blendFunction = _active ? BlendFunction.SKIP : this.bloomDefaultBlend
    this.bloom.blendMode.blendFunction = this.bloomDefaultBlend
  }

  /** Call this instead of renderer.render(). */
  render(): void {
    this.composer.render()
  }

  /** Update the render pass camera (e.g. when switching lander ↔ FPS). */
  setCamera(camera: THREE.Camera): void {
    this.currentCamera = camera
    this.renderPass.mainCamera = camera
    this.effectPass.mainCamera = camera
  }

  /** Must be called on window resize. */
  resize(width: number, height: number): void {
    this.composer.setSize(width, height)
  }

  /** Release GPU resources. */
  dispose(): void {
    this.disposed = true
    this.composer.dispose()
  }
}
