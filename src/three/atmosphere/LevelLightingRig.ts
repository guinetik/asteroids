/**
 * Data-driven lighting rig for asteroid levels.
 *
 * Creates sun (shadow-mapped), hemisphere fill, and rim lights
 * from per-asteroid AtmosphereContext config. Replaces hardcoded
 * lights that were previously created in LevelViewController.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-atmosphere-effects-design.md
 */
import * as THREE from 'three'
import type { AtmosphereContext } from './AtmosphereContext'
import { FPS_VIEWMODEL_LAYER } from '@/three/FpsCamera'

/**
 * Shadow map resolution in pixels (width and height). Halved from 2048
 * in the v4 perf pass — the shadow render pass is fragment-bound on the
 * map size, so 1024 is ¼ the cost. Edges become slightly chunkier on
 * very long shadows but at typical EVA viewing distances the difference
 * is hard to spot against the rocky terrain.
 *
 * @spec docs/superpowers/specs/2026-04-18-fps-perf-fixes-design.md (v4)
 */
const SHADOW_MAP_SIZE = 1024
/**
 * Shadow camera frustum half-size in world units. The frustum follows
 * the focus point set by {@link LevelLightingRig.setFocus}, so we can
 * keep this tight — only fragments within ±SHADOW_FRUSTUM of the lander
 * need to be in the depth pass for landing-altitude shadows to read.
 * At 1024² shadow map size that's ~0.39 world units per texel, sharp
 * enough for a readable lander silhouette during descent.
 */
const SHADOW_FRUSTUM = 200
/**
 * Shadow bias. Sized for the {@link SHADOW_FRUSTUM}/{@link SHADOW_MAP_SIZE}
 * texel ratio — too tight (e.g. -0.0005 against the previous 3000-unit
 * frustum) caused peter-panning where the shadow detached from the
 * caster and never appeared on the ground.
 */
const SHADOW_BIAS = -0.001
/**
 * Bias applied along the surface normal — pushes the shadow sample
 * point slightly off the surface to fight self-shadowing acne on
 * grazing angles without re-introducing peter-panning.
 */
const SHADOW_NORMAL_BIAS = 0.05
/** Rim light intensity — subtle backlight to separate silhouettes. */
const RIM_INTENSITY = 0.3
/** Rim light cool-blue tint. */
const RIM_COLOR = 0x6688cc
/** Distance to place the directional light source from origin. */
const SUN_DISTANCE = 500
/** Equirect texture width (height = half). 256×128 is plenty after PMREM. */
const ENV_TEXTURE_WIDTH = 256
/** Dim the sky sun tint so the envmap doesn't double-count direct light. */
const ENV_SKY_INTENSITY = 0.6
/** Floor multiplier keeps ground pickup non-black on very dark asteroids. */
const ENV_GROUND_MIN = 0.1
/** Ground brightness relative to baseColor. */
const ENV_GROUND_INTENSITY = 0.35
/** Overall envmap contribution to PBR materials. 1.0 = native, <1 = dimmer. */
const ENV_SCENE_INTENSITY = 0.7

/**
 * Generate a procedural equirectangular environment texture for the level scene.
 * Top half = sky (sun-tinted), middle = warm horizon, bottom = ground (base color).
 * Gives PBR materials something to sample so metallic surfaces don't go pure black
 * in shadow.
 */
function createEnvironmentTexture(ctx: AtmosphereContext): THREE.CanvasTexture {
  const width = ENV_TEXTURE_WIDTH
  const height = width / 2
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const c = canvas.getContext('2d')!

  const sunR = ctx.sunColor.r
  const sunG = ctx.sunColor.g
  const sunB = ctx.sunColor.b
  const zenithCss = `rgb(${Math.round(sunR * 255 * ENV_SKY_INTENSITY * 0.55)},${Math.round(sunG * 255 * ENV_SKY_INTENSITY * 0.55)},${Math.round(sunB * 255 * ENV_SKY_INTENSITY * 0.7)})`
  const horizonCss = `rgb(${Math.round(sunR * 255 * ENV_SKY_INTENSITY)},${Math.round(sunG * 255 * ENV_SKY_INTENSITY * 0.9)},${Math.round(sunB * 255 * ENV_SKY_INTENSITY * 0.75)})`
  const groundR = Math.max(ENV_GROUND_MIN, ctx.baseColor[0] * ENV_GROUND_INTENSITY)
  const groundG = Math.max(ENV_GROUND_MIN, ctx.baseColor[1] * ENV_GROUND_INTENSITY)
  const groundB = Math.max(ENV_GROUND_MIN, ctx.baseColor[2] * ENV_GROUND_INTENSITY)
  const groundCss = `rgb(${Math.round(groundR * 255)},${Math.round(groundG * 255)},${Math.round(groundB * 255)})`

  const gradient = c.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, zenithCss)
  gradient.addColorStop(0.5, horizonCss)
  gradient.addColorStop(0.55, groundCss)
  gradient.addColorStop(1, groundCss)
  c.fillStyle = gradient
  c.fillRect(0, 0, width, height)

  const texture = new THREE.CanvasTexture(canvas)
  texture.mapping = THREE.EquirectangularReflectionMapping
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/**
 * Manages the three-light rig (sun + fill + rim) for the level scene.
 * Sun light casts shadows; fill and rim do not.
 */
export class LevelLightingRig {
  /** Shadow-mapped directional sun light. */
  readonly sun: THREE.DirectionalLight
  /** Hemisphere fill light (sky + ground colors). */
  readonly fill: THREE.HemisphereLight
  /** Rim/back light opposite the sun for silhouette separation. */
  readonly rim: THREE.DirectionalLight
  /** PMREM-convolved environment map for PBR reflections. */
  readonly environment: THREE.Texture
  private readonly sunDirection = new THREE.Vector3()
  private readonly sourceEnvTexture: THREE.CanvasTexture
  private installedScene: THREE.Scene | null = null

  constructor(ctx: AtmosphereContext, renderer: THREE.WebGLRenderer) {
    // ── Sun ──
    this.sun = new THREE.DirectionalLight(ctx.sunColor, ctx.sunIntensity)
    this.sunDirection.copy(ctx.sunDirection).normalize()
    this.sun.position.copy(this.sunDirection).multiplyScalar(SUN_DISTANCE)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE)
    this.sun.shadow.camera.left = -SHADOW_FRUSTUM
    this.sun.shadow.camera.right = SHADOW_FRUSTUM
    this.sun.shadow.camera.top = SHADOW_FRUSTUM
    this.sun.shadow.camera.bottom = -SHADOW_FRUSTUM
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = SUN_DISTANCE * 2
    this.sun.shadow.bias = SHADOW_BIAS
    this.sun.shadow.normalBias = SHADOW_NORMAL_BIAS

    // ── Fill — hemisphere with desaturated sun color ──
    const skyColor = ctx.sunColor.clone().multiplyScalar(0.7)
    const groundColor = new THREE.Color(ctx.baseColor[0], ctx.baseColor[1], ctx.baseColor[2]).multiplyScalar(0.3)
    this.fill = new THREE.HemisphereLight(skyColor, groundColor, ctx.ambientIntensity)

    // ── Rim — opposite sun direction, cool blue ──
    this.rim = new THREE.DirectionalLight(RIM_COLOR, RIM_INTENSITY)
    this.rim.position.copy(ctx.sunDirection).multiplyScalar(-SUN_DISTANCE)

    // World lighting must also illuminate the FPS view-model (gun)
    // since the view-model lives on its own render layer to avoid
    // being washed out by the helmet lights.
    this.sun.layers.enable(FPS_VIEWMODEL_LAYER)
    this.fill.layers.enable(FPS_VIEWMODEL_LAYER)
    this.rim.layers.enable(FPS_VIEWMODEL_LAYER)

    // ── Environment map for PBR reflections ──
    // Without this, metallic materials (GLTF lander, EVA suit) render pure
    // black in shadow because metalness has no diffuse component and no
    // reflections to sample.
    this.sourceEnvTexture = createEnvironmentTexture(ctx)
    const pmrem = new THREE.PMREMGenerator(renderer)
    this.environment = pmrem.fromEquirectangular(this.sourceEnvTexture).texture
    pmrem.dispose()
  }

  /** Add all lights and install the environment map on the scene. */
  addToScene(scene: THREE.Scene): void {
    scene.add(this.sun)
    scene.add(this.sun.target)
    scene.add(this.fill)
    scene.add(this.rim)
    scene.environment = this.environment
    scene.environmentIntensity = ENV_SCENE_INTENSITY
    this.installedScene = scene
  }

  /**
   * Re-center the shadow camera around a focus point (typically the
   * lander). The directional light's view direction stays constant —
   * only its world position and target slide so the tight shadow
   * frustum keeps the lander and surrounding terrain inside the depth
   * pass at every world location.
   *
   * Call once per frame from the level tick.
   *
   * @param focus - World position to keep centered in the shadow frustum.
   */
  setFocus(focus: THREE.Vector3): void {
    this.sun.target.position.copy(focus)
    this.sun.target.updateMatrixWorld()
    this.sun.position.copy(this.sunDirection).multiplyScalar(SUN_DISTANCE).add(focus)
    this.sun.updateMatrixWorld()
    this.sun.shadow.camera.updateProjectionMatrix()
  }

  /** Remove all lights, clear scene environment, dispose GPU resources. */
  dispose(): void {
    if (this.installedScene) {
      if (this.installedScene.environment === this.environment) {
        this.installedScene.environment = null
      }
      this.installedScene = null
    }
    this.sun.shadow.map?.dispose()
    this.sun.dispose()
    this.fill.dispose()
    this.rim.dispose()
    this.environment.dispose()
    this.sourceEnvTexture.dispose()
  }
}
