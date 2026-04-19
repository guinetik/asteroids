/**
 * Post-processing pipeline for the level scene.
 *
 * Cold, clinical tone: subtle bloom on emissives, desaturated color grade
 * with cool shadow tint, mild chromatic aberration, vignette, and FXAA.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-atmosphere-effects-design.md
 */
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js'
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js'
import fullscreenQuadVertexShader from '@/three/shaders/postprocessing/fullscreenQuad.vert.glsl?raw'
import colorGradeFragmentShader from '@/three/shaders/postprocessing/colorGrade.frag.glsl?raw'
import chromaticAberrationFragmentShader from '@/three/shaders/postprocessing/chromaticAberration.frag.glsl?raw'

// ── Bloom ──
/** Bloom intensity. Low — only bright emissives glow. */
const BLOOM_STRENGTH = 0.3
/** Bloom spread radius. */
const BLOOM_RADIUS = 0.3
/** Minimum brightness for bloom. Only engine flames / lights bloom. */
const BLOOM_THRESHOLD = 0.9

// ── Color grade ──
/** How much to desaturate the image (0 = none, 1 = full grayscale). */
const DESATURATION = 0.15
/** Cool blue tint blended into shadow regions. */
const SHADOW_TINT_R = 0.6
const SHADOW_TINT_G = 0.7
const SHADOW_TINT_B = 0.9
/** Contrast S-curve intensity (1.0 = neutral). */
const CONTRAST = 1.05

// ── Chromatic aberration ──
/** Base CA offset. Very subtle — too high and stars turn magenta from RGB split. */
const CA_AMOUNT = 0.0005

// ── Vignette ──
const VIGNETTE_OFFSET = 1.2
const VIGNETTE_DARKNESS = 0.6

/**
 * Custom color-grade shader: desaturation + cool shadow tint + contrast.
 */
const ColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    desaturation: { value: DESATURATION },
    shadowTint: { value: new THREE.Vector3(SHADOW_TINT_R, SHADOW_TINT_G, SHADOW_TINT_B) },
    contrast: { value: CONTRAST },
  },
  vertexShader: fullscreenQuadVertexShader,
  fragmentShader: colorGradeFragmentShader,
}

/**
 * Custom chromatic aberration shader — radial RGB split from center.
 */
const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    amount: { value: CA_AMOUNT },
  },
  vertexShader: fullscreenQuadVertexShader,
  fragmentShader: chromaticAberrationFragmentShader,
}

/**
 * Manages the EffectComposer pipeline for the level scene.
 * Call {@link render} each frame instead of `renderer.render()`.
 */
export class LevelPostProcessing {
  private readonly composer: EffectComposer
  private readonly fxaaPass: ShaderPass
  private readonly bloomPass: UnrealBloomPass

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer)

    // 1. Render scene
    this.composer.addPass(new RenderPass(scene, camera))

    // 2. Bloom
    const size = renderer.getSize(new THREE.Vector2())
    this.bloomPass = new UnrealBloomPass(size, BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD)
    this.composer.addPass(this.bloomPass)

    // 3. Color grade
    this.composer.addPass(new ShaderPass(ColorGradeShader))

    // 4. Chromatic aberration
    this.composer.addPass(new ShaderPass(ChromaticAberrationShader))

    // 5. Vignette
    const vignettePass = new ShaderPass(VignetteShader)
    vignettePass.uniforms['offset']!.value = VIGNETTE_OFFSET
    vignettePass.uniforms['darkness']!.value = VIGNETTE_DARKNESS
    this.composer.addPass(vignettePass)

    // 6. FXAA (last)
    this.fxaaPass = new ShaderPass(FXAAShader)
    this.updateFxaaResolution(renderer)
    this.composer.addPass(this.fxaaPass)
  }

  /** Call this instead of renderer.render(). */
  render(): void {
    this.composer.render()
  }

  /** Update the render pass camera (e.g. when switching lander ↔ FPS). */
  setCamera(camera: THREE.Camera): void {
    const renderPass = this.composer.passes[0] as RenderPass
    renderPass.camera = camera
  }

  /** Must be called on window resize. */
  resize(width: number, height: number): void {
    this.composer.setSize(width, height)
    this.bloomPass.resolution.set(width, height)
    const pixelRatio = this.composer.renderer.getPixelRatio()
    this.fxaaPass.material.uniforms['resolution']!.value.set(
      1 / (width * pixelRatio),
      1 / (height * pixelRatio),
    )
  }

  /** Release GPU resources. */
  dispose(): void {
    this.composer.dispose()
  }

  private updateFxaaResolution(renderer: THREE.WebGLRenderer): void {
    const size = renderer.getSize(new THREE.Vector2())
    const pixelRatio = renderer.getPixelRatio()
    this.fxaaPass.material.uniforms['resolution']!.value.set(
      1 / (size.x * pixelRatio),
      1 / (size.y * pixelRatio),
    )
  }
}
