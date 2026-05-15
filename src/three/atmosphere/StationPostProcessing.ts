/**
 * Post-processing pipeline for the station interior — cool, sterile look.
 *
 * Pipeline (fused into one `EffectPass`, single fullscreen draw):
 *   bloom (mipmap blur) → ACES filmic tonemap → 3D LUT → saturation →
 *   contrast → vignette
 *
 * Tuned for tight indoor habitat spaces: tighter bloom (no skies / suns to
 * halo), desaturated grade, stronger vignette to frame the helmet visor.
 * The grade comes from a station-theme LUT, loaded once and spliced into
 * the fused pass when ready. Until then the pipeline runs un-LUT'd.
 *
 * @author guinetik
 * @date 2026-05-14
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */
import * as THREE from 'three'
import {
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
/** Bloom intensity. Tighter than the level — only fixture emissives bloom. */
const BLOOM_INTENSITY = 0.22
/** Threshold at which pixels start to bloom. */
const BLOOM_LUMINANCE_THRESHOLD = 0.35
/** Soft transition around the threshold so bloom doesn't pop on/off. */
const BLOOM_LUMINANCE_SMOOTHING = 0.12
/** Bloom kernel radius — tight halos befitting hard fluorescent fixtures. */
const BLOOM_RADIUS = 0.35

// ── Saturation / brightness / contrast ──
/** Range -1..+1. Slightly desaturated for a sterile, clinical read. */
const SATURATION = -0.15
/** Range -1..+1. Lift to keep corridor panels readable after tonemapping. */
const BRIGHTNESS = 0.12
/** Range -1..+1. Mild contrast so station shadow detail is not crushed. */
const CONTRAST = 0.08

// ── Vignette ──
/** Where the vignette starts to fall off. */
const VIGNETTE_OFFSET = 0.35
/** Darkness at the corners, kept light enough for indoor navigation. */
const VIGNETTE_DARKNESS = 0.45

// ── LUT ──
/** Public-folder URL for the default station 3D color LUT. */
const DEFAULT_STATION_LUT_URL = '/station.CUBE'

/** Constructor options for {@link StationPostProcessing}. */
export interface StationPostProcessingOptions {
  /** Public URL of the LUT to apply, e.g. `'/derelict.CUBE'`. */
  lutUrl?: string
}

/**
 * Manages the pmndrs `EffectComposer` pipeline for the station scene.
 * Call {@link render} each frame instead of `renderer.render()`.
 */
export class StationPostProcessing {
  private readonly composer: EffectComposer
  private readonly renderPass: RenderPass
  private readonly bloom: BloomEffect
  private readonly tonemap: ToneMappingEffect
  private readonly saturation: HueSaturationEffect
  private readonly contrast: BrightnessContrastEffect
  private readonly vignette: VignetteEffect
  private effectPass: EffectPass
  private lut: LUT3DEffect | null = null
  private currentCamera: THREE.Camera
  private disposed = false
  private readonly lutUrl: string

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    options: StationPostProcessingOptions = {},
  ) {
    this.currentCamera = camera
    this.lutUrl = options.lutUrl ?? DEFAULT_STATION_LUT_URL

    // HDR target — bright fixtures can exceed 1.0 in linear space so the
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

    // ACES_FILMIC's slight desaturation in highlights actually helps the
    // sterile read — bright corridor fixtures roll off toward white rather
    // than picking up colour cast from the LUT.
    this.tonemap = new ToneMappingEffect({
      mode: ToneMappingMode.ACES_FILMIC,
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
   * Load the station LUT and splice the `LUT3DEffect` into the fused pass.
   * Failures are non-fatal — the pipeline keeps running un-LUT'd.
   */
  private async loadLUT(): Promise<void> {
    try {
      const loader = new LUTCubeLoader()
      const texture = await loader.loadAsync(this.lutUrl)
      if (this.disposed) return
      // Tetrahedral interpolation gives smoother transitions between LUT
      // cells than the default trilinear sampling.
      this.lut = new LUT3DEffect(texture, { tetrahedralInterpolation: true })
      this.composer.removePass(this.effectPass)
      this.effectPass.dispose()
      this.effectPass = this.buildEffectPass()
      this.composer.addPass(this.effectPass)
      console.info('[StationPostProcessing] LUT applied:', this.lutUrl)
    } catch (err) {
      console.warn('[StationPostProcessing] LUT load failed', err)
    }
  }

  private buildEffectPass(): EffectPass {
    const effects = this.lut
      ? [this.bloom, this.tonemap, this.lut, this.saturation, this.contrast, this.vignette]
      : [this.bloom, this.tonemap, this.saturation, this.contrast, this.vignette]
    return new EffectPass(this.currentCamera, ...effects)
  }

  /** Call this instead of renderer.render(). */
  render(): void {
    this.composer.render()
  }

  /** Update the render pass camera (e.g. when switching cameras). */
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
