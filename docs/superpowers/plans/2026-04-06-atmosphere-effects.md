# Atmosphere Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add post-processing, data-driven per-asteroid lighting with shadows, thruster wash ground effects, and ambient surface dust to the level scene.

**Architecture:** Independent controllers (`LevelPostProcessing`, `LevelLightingRig`, `ThrusterWashController`, `SurfaceDustController`) all read from a shared `AtmosphereContext` data object. `LevelViewController` populates the context each frame and wires controllers into the existing tick/dispose lifecycle.

**Tech Stack:** Three.js (EffectComposer, UnrealBloomPass, ShaderPass, ShaderMaterial, DirectionalLight shadows, SpotLight, ParticleEmitter), TypeScript, Vite (GLSL imports via `?raw` suffix)

---

### Task 1: AtmosphereContext Interface + Factory

**Files:**
- Create: `src/three/atmosphere/AtmosphereContext.ts`

This is the shared data object all atmosphere controllers read from. Pure data — no Three.js scene objects.

- [ ] **Step 1: Create the interface and factory**

```ts
/**
 * Shared per-frame + per-asteroid state consumed by all atmosphere controllers.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-atmosphere-effects-design.md
 */
import { Vector3, Color } from 'three'

/** Per-asteroid lighting configuration loaded from asteroid JSON. */
export interface AsteroidLighting {
  /** Compass bearing of the sun in degrees (0 = north/+Z, 90 = east/+X). */
  sunAzimuth: number
  /** Angle above the horizon in degrees (0 = horizon, 90 = overhead). */
  sunElevation: number
  /** Sun color as [R, G, B] normalized 0-1. */
  sunColor: [number, number, number]
  /** Sun directional light intensity. Range: 0.5-3.0. */
  sunIntensity: number
  /** Hemisphere/ambient fill intensity. Range: 0.05-0.4. */
  ambientIntensity: number
}

/** Shared atmosphere state populated each frame by LevelViewController. */
export interface AtmosphereContext {
  // ── Per-frame state (updated every tick) ──
  /** Meters above ground under lander. 0 when grounded. */
  landerAltitude: number
  /** Normalized main engine power. 0 = off, 1 = full thrust. */
  landerThrust: number
  /** Vertical speed in m/s. Negative = falling. */
  landerVelocityY: number
  /** Whether the lander is on the ground. */
  landerGrounded: boolean
  /** Lander world position. */
  landerPosition: Vector3
  /** EVA walk/sprint speed in m/s. */
  playerSpeed: number
  /** Whether EVA player is on the ground. */
  playerGrounded: boolean
  /** EVA player world position. */
  playerPosition: Vector3
  /** Surface normal under the active entity. */
  groundNormal: Vector3
  /** Current game phase. */
  activeMode: 'lander' | 'eva' | 'cinematic'

  // ── Per-asteroid config (set once on level load) ──
  /** Unit vector pointing toward the sun (derived from azimuth + elevation). */
  sunDirection: Vector3
  /** Sun light color. */
  sunColor: Color
  /** Sun directional light intensity. */
  sunIntensity: number
  /** Hemisphere/ambient fill intensity. */
  ambientIntensity: number
  /** From asteroid surface.dustCoverage (0-1). */
  dustCoverage: number
  /** From asteroid visual.albedo. Affects ground scatter brightness. */
  albedo: number
  /** Asteroid biome string. Drives dust color palette. */
  biome: string
  /** Surface color for tinting dust particles. From visual.baseColor. */
  baseColor: [number, number, number]
}

/** Degrees to radians. */
const DEG_TO_RAD = Math.PI / 180

/**
 * Convert azimuth + elevation angles to a unit direction vector.
 * Azimuth 0 = +Z (north), 90 = +X (east). Elevation 0 = horizon, 90 = straight up.
 */
export function sunDirectionFromAngles(azimuthDeg: number, elevationDeg: number): Vector3 {
  const az = azimuthDeg * DEG_TO_RAD
  const el = elevationDeg * DEG_TO_RAD
  return new Vector3(
    Math.cos(el) * Math.sin(az),
    Math.sin(el),
    Math.cos(el) * Math.cos(az),
  ).normalize()
}

/**
 * Create a default AtmosphereContext with zeroed per-frame state.
 * Per-asteroid fields are populated from the lighting config and asteroid data.
 */
export function createAtmosphereContext(
  lighting: AsteroidLighting,
  opts: { dustCoverage: number; albedo: number; biome: string; baseColor: [number, number, number] },
): AtmosphereContext {
  return {
    landerAltitude: 0,
    landerThrust: 0,
    landerVelocityY: 0,
    landerGrounded: true,
    landerPosition: new Vector3(),
    playerSpeed: 0,
    playerGrounded: true,
    playerPosition: new Vector3(),
    groundNormal: new Vector3(0, 1, 0),
    activeMode: 'cinematic',
    sunDirection: sunDirectionFromAngles(lighting.sunAzimuth, lighting.sunElevation),
    sunColor: new Color(lighting.sunColor[0], lighting.sunColor[1], lighting.sunColor[2]),
    sunIntensity: lighting.sunIntensity,
    ambientIntensity: lighting.ambientIntensity,
    dustCoverage: opts.dustCoverage,
    albedo: opts.albedo,
    biome: opts.biome,
    baseColor: opts.baseColor,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/three/atmosphere/AtmosphereContext.ts
git commit -m "feat(atmosphere): add AtmosphereContext interface and factory"
```

---

### Task 2: Asteroid JSON Lighting Data

**Files:**
- Modify: `src/lib/asteroids/types.ts:86-109` (add `lighting` to `AsteroidDefinition`)
- Modify: `src/data/asteroids/bennu.json`
- Modify: `src/data/asteroids/itokawa.json`
- Modify: `src/data/asteroids/psyche.json`
- Modify: `src/data/asteroids/2019-xg7.json`
- Modify: `src/data/asteroids/2021-kr3.json`

- [ ] **Step 1: Add AsteroidLighting to the type interface**

In `src/lib/asteroids/types.ts`, import and add the lighting field to `AsteroidDefinition`:

```ts
// Add import at top of file
import type { AsteroidLighting } from '@/three/atmosphere/AtmosphereContext'

// Add to AsteroidDefinition interface, after the `physical` field (line 108):
  /** Per-asteroid lighting direction, color, and intensity for the level scene. */
  lighting: AsteroidLighting
```

- [ ] **Step 2: Add lighting block to bennu.json**

Add after the `"physical"` block:

```json
"lighting": {
  "sunAzimuth": 45,
  "sunElevation": 25,
  "sunColor": [1.0, 0.93, 0.82],
  "sunIntensity": 1.6,
  "ambientIntensity": 0.15
}
```

- [ ] **Step 3: Add lighting block to itokawa.json**

```json
"lighting": {
  "sunAzimuth": 120,
  "sunElevation": 40,
  "sunColor": [1.0, 0.98, 0.95],
  "sunIntensity": 2.0,
  "ambientIntensity": 0.18
}
```

- [ ] **Step 4: Add lighting block to psyche.json**

```json
"lighting": {
  "sunAzimuth": 200,
  "sunElevation": 15,
  "sunColor": [0.9, 0.95, 1.0],
  "sunIntensity": 2.2,
  "ambientIntensity": 0.12
}
```

- [ ] **Step 5: Add lighting block to 2019-xg7.json**

```json
"lighting": {
  "sunAzimuth": 300,
  "sunElevation": 55,
  "sunColor": [1.0, 0.96, 0.9],
  "sunIntensity": 1.4,
  "ambientIntensity": 0.2
}
```

- [ ] **Step 6: Add lighting block to 2021-kr3.json**

```json
"lighting": {
  "sunAzimuth": 80,
  "sunElevation": 10,
  "sunColor": [0.85, 0.9, 1.0],
  "sunIntensity": 1.0,
  "ambientIntensity": 0.1
}
```

- [ ] **Step 7: Run type-check**

Run: `bun run type-check`
Expected: PASS — all JSON files now satisfy the updated interface.

- [ ] **Step 8: Commit**

```bash
git add src/lib/asteroids/types.ts src/data/asteroids/
git commit -m "data(asteroids): add per-asteroid lighting config to all 5 asteroid JSONs"
```

---

### Task 3: LevelLightingRig

**Files:**
- Create: `src/three/atmosphere/LevelLightingRig.ts`

Replaces the hardcoded lights in `LevelViewController` (lines 190-197) with a data-driven setup that reads from `AtmosphereContext`. Enables shadow mapping.

- [ ] **Step 1: Create the lighting rig controller**

```ts
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

/** Shadow map resolution in pixels (width and height). */
const SHADOW_MAP_SIZE = 2048
/** Shadow camera frustum half-size — covers the terrain area. */
const SHADOW_FRUSTUM = 3000
/** Shadow bias to prevent acne on terrain. */
const SHADOW_BIAS = -0.0005
/** Rim light intensity — subtle backlight to separate silhouettes. */
const RIM_INTENSITY = 0.1
/** Rim light cool-blue tint. */
const RIM_COLOR = 0x6688cc
/** Distance to place the directional light source from origin. */
const SUN_DISTANCE = 500

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

  constructor(ctx: AtmosphereContext) {
    // ── Sun ──
    this.sun = new THREE.DirectionalLight(ctx.sunColor, ctx.sunIntensity)
    this.sun.position.copy(ctx.sunDirection).multiplyScalar(SUN_DISTANCE)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE)
    this.sun.shadow.camera.left = -SHADOW_FRUSTUM
    this.sun.shadow.camera.right = SHADOW_FRUSTUM
    this.sun.shadow.camera.top = SHADOW_FRUSTUM
    this.sun.shadow.camera.bottom = -SHADOW_FRUSTUM
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = SUN_DISTANCE * 2
    this.sun.shadow.bias = SHADOW_BIAS

    // ── Fill — hemisphere with desaturated sun color ──
    const skyColor = ctx.sunColor.clone().multiplyScalar(0.4)
    const groundColor = new THREE.Color(ctx.baseColor[0], ctx.baseColor[1], ctx.baseColor[2]).multiplyScalar(0.15)
    this.fill = new THREE.HemisphereLight(skyColor, groundColor, ctx.ambientIntensity)

    // ── Rim — opposite sun direction, cool blue ──
    this.rim = new THREE.DirectionalLight(RIM_COLOR, RIM_INTENSITY)
    this.rim.position.copy(ctx.sunDirection).multiplyScalar(-SUN_DISTANCE)
  }

  /** Add all lights to the scene. */
  addToScene(scene: THREE.Scene): void {
    scene.add(this.sun)
    scene.add(this.fill)
    scene.add(this.rim)
  }

  /** Remove all lights and dispose shadow map. */
  dispose(): void {
    this.sun.shadow.map?.dispose()
    this.sun.dispose()
    this.fill.dispose()
    this.rim.dispose()
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/three/atmosphere/LevelLightingRig.ts
git commit -m "feat(atmosphere): add data-driven LevelLightingRig with shadow mapping"
```

---

### Task 4: LevelPostProcessing

**Files:**
- Create: `src/three/atmosphere/LevelPostProcessing.ts`

EffectComposer pipeline: RenderPass → UnrealBloomPass → ColorGradePass → ChromaticAberrationPass → VignettePass → FXAAPass.

- [ ] **Step 1: Create the post-processing controller**

```ts
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

// ── Bloom ──
/** Bloom intensity. Low — only bright emissives glow. */
const BLOOM_STRENGTH = 0.4
/** Bloom spread radius. */
const BLOOM_RADIUS = 0.4
/** Minimum brightness for bloom. Only engine flames / lights bloom. */
const BLOOM_THRESHOLD = 0.75

// ── Color grade ──
/** How much to desaturate the image (0 = none, 1 = full grayscale). */
const DESATURATION = 0.15
/** Cool blue tint blended into shadow regions. */
const SHADOW_TINT_R = 0.6
const SHADOW_TINT_G = 0.7
const SHADOW_TINT_B = 0.9
/** Contrast S-curve intensity (1.0 = neutral). */
const CONTRAST = 1.15

// ── Chromatic aberration ──
/** Base CA offset. Very subtle. */
const CA_AMOUNT = 0.002

// ── Vignette ──
const VIGNETTE_OFFSET = 0.95
const VIGNETTE_DARKNESS = 1.0

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
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float desaturation;
    uniform vec3 shadowTint;
    uniform float contrast;
    varying vec2 vUv;

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 color = tex.rgb;

      // Desaturate
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(color, vec3(luma), desaturation);

      // Cool shadow tint — blend toward shadowTint in dark regions
      float shadowMask = 1.0 - smoothstep(0.0, 0.3, luma);
      color = mix(color, color * shadowTint, shadowMask * 0.4);

      // Contrast S-curve
      color = clamp((color - 0.5) * contrast + 0.5, 0.0, 1.0);

      gl_FragColor = vec4(color, tex.a);
    }
  `,
}

/**
 * Custom chromatic aberration shader — radial RGB split from center.
 */
const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    amount: { value: CA_AMOUNT },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;

    void main() {
      vec2 dir = vUv - 0.5;
      float dist = length(dir);
      float r = texture2D(tDiffuse, vUv - dir * amount * dist).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv + dir * amount * dist).b;
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `,
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
    vignettePass.uniforms['offset'].value = VIGNETTE_OFFSET
    vignettePass.uniforms['darkness'].value = VIGNETTE_DARKNESS
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
    this.fxaaPass.material.uniforms['resolution'].value.set(
      1 / (width * pixelRatio),
      1 / (height * pixelRatio),
    )
  }

  dispose(): void {
    this.composer.dispose()
  }

  private updateFxaaResolution(renderer: THREE.WebGLRenderer): void {
    const size = renderer.getSize(new THREE.Vector2())
    const pixelRatio = renderer.getPixelRatio()
    this.fxaaPass.material.uniforms['resolution'].value.set(
      1 / (size.x * pixelRatio),
      1 / (size.y * pixelRatio),
    )
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/three/atmosphere/LevelPostProcessing.ts
git commit -m "feat(atmosphere): add LevelPostProcessing with bloom, color grade, CA, vignette, FXAA"
```

---

### Task 5: ThrusterWashController

**Files:**
- Create: `src/three/atmosphere/ThrusterWashController.ts`

Three-layer ground interaction: radial dust particles, wash spotlight, and ground scorch glow mesh.

- [ ] **Step 1: Create the thruster wash controller**

```ts
/**
 * Thruster wash ground effects — visual interaction when the lander
 * fires engines near the surface.
 *
 * Three layers:
 * 1. Radial dust particles spraying outward from ground point
 * 2. SpotLight wash cone illuminating terrain below engines
 * 3. Ground scorch glow — radial heat shader on a flat disc
 *
 * All layers scale with thrust power and inversely with altitude.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-atmosphere-effects-design.md
 */
import * as THREE from 'three'
import { ParticleEmitter } from '@/three/ParticleEmitter'
import type { AtmosphereContext } from './AtmosphereContext'

// ── Altitude thresholds ──
/** Maximum altitude (meters) at which wash effects appear. */
const WASH_MAX_ALTITUDE = 50
/** Altitude below which scorch glow appears. */
const SCORCH_ALTITUDE = 20
/** Altitude at which effects reach maximum intensity. */
const WASH_FULL_ALTITUDE = 5

// ── Dust particles ──
const DUST_POOL_SIZE = 200
const DUST_PARTICLE_SIZE = 3
const DUST_LIFETIME = 0.8
const DUST_SPREAD = 2
const DUST_OPACITY = 0.6
/** Max spawn rate (particles/sec) at closest altitude. */
const DUST_MAX_SPAWN_RATE = 120
/** Minimum spawn rate at WASH_MAX_ALTITUDE. */
const DUST_MIN_SPAWN_RATE = 20
/** Radial speed multiplier for outward push. */
const DUST_RADIAL_SPEED = 40

// ── Wash light ──
const WASH_LIGHT_COLOR = 0xff8844
const WASH_LIGHT_MAX_INTENSITY = 3
const WASH_LIGHT_ANGLE = Math.PI / 6
const WASH_LIGHT_PENUMBRA = 0.5
const WASH_LIGHT_DISTANCE = 80

// ── Scorch glow ──
const SCORCH_RADIUS = 10
const SCORCH_SEGMENTS = 32
/** Seconds for scorch to fade out after engines cut. */
const SCORCH_FADE_DURATION = 1.0

/**
 * Custom shader for the ground scorch glow — radial gradient with pulsing.
 */
const ScorchShader = {
  uniforms: {
    intensity: { value: 0 },
    time: { value: 0 },
    baseColor: { value: new THREE.Vector3(1.0, 0.6, 0.2) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float intensity;
    uniform float time;
    uniform vec3 baseColor;
    varying vec2 vUv;

    // Simple noise for organic pulsing
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec2 centered = vUv * 2.0 - 1.0;
      float dist = length(centered);

      // Radial falloff — hot center fading to nothing at edges
      float glow = 1.0 - smoothstep(0.0, 1.0, dist);
      glow = pow(glow, 2.0);

      // Subtle noise pulse
      float pulse = 0.9 + 0.1 * sin(time * 6.0 + hash(centered) * 6.28);

      // Hot center (white-orange) to cooler edges (dim orange)
      vec3 hotColor = vec3(1.0, 0.9, 0.7);
      vec3 color = mix(baseColor, hotColor, glow * 0.6);

      float alpha = glow * intensity * pulse;
      gl_FragColor = vec4(color, alpha);
    }
  `,
}

/**
 * Manages thruster wash visual effects beneath the lander.
 */
export class ThrusterWashController {
  /** Dust particle emitter — radial spray from ground point. */
  readonly dustEmitter: ParticleEmitter
  /** Downward-facing spotlight beneath lander. */
  readonly washLight: THREE.SpotLight
  /** Flat disc mesh with scorch glow shader. */
  readonly scorchMesh: THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial>

  private scorchIntensity = 0
  private dustSpawnAccumulator = 0
  private elapsedTime = 0

  constructor(baseColor: [number, number, number]) {
    // ── Dust emitter ──
    const dustColor = new THREE.Color(baseColor[0], baseColor[1], baseColor[2]).multiplyScalar(1.5)
    this.dustEmitter = new ParticleEmitter({
      poolSize: DUST_POOL_SIZE,
      color: dustColor,
      size: DUST_PARTICLE_SIZE,
      lifetime: DUST_LIFETIME,
      spread: DUST_SPREAD,
      opacity: DUST_OPACITY,
    })

    // ── Wash spotlight ──
    this.washLight = new THREE.SpotLight(
      WASH_LIGHT_COLOR,
      0, // starts off
      WASH_LIGHT_DISTANCE,
      WASH_LIGHT_ANGLE,
      WASH_LIGHT_PENUMBRA,
    )
    this.washLight.castShadow = false

    // ── Scorch disc ──
    const scorchGeo = new THREE.CircleGeometry(SCORCH_RADIUS, SCORCH_SEGMENTS)
    const scorchMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(ScorchShader.uniforms),
      vertexShader: ScorchShader.vertexShader,
      fragmentShader: ScorchShader.fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    scorchMat.uniforms.baseColor.value.set(baseColor[0] * 2, baseColor[1], baseColor[2] * 0.5)
    this.scorchMesh = new THREE.Mesh(scorchGeo, scorchMat)
    this.scorchMesh.rotation.x = -Math.PI / 2 // lay flat on XZ plane
    this.scorchMesh.visible = false
  }

  /** Add all three layers to the scene. */
  addToScene(scene: THREE.Scene): void {
    scene.add(this.dustEmitter.points)
    scene.add(this.washLight)
    scene.add(this.washLight.target)
    scene.add(this.scorchMesh)
  }

  /** Per-frame update. Reads altitude, thrust, and position from context. */
  update(ctx: AtmosphereContext, dt: number): void {
    this.elapsedTime += dt
    const { landerAltitude, landerThrust, landerPosition, landerGrounded } = ctx
    const active = landerThrust > 0 && landerAltitude < WASH_MAX_ALTITUDE && !landerGrounded

    // ── Intensity factor: thrust * altitude falloff (0-1) ──
    const altFactor = active
      ? 1 - Math.max(0, Math.min(1, (landerAltitude - WASH_FULL_ALTITUDE) / (WASH_MAX_ALTITUDE - WASH_FULL_ALTITUDE)))
      : 0
    const intensity = landerThrust * altFactor

    // Ground point directly below lander
    const groundY = landerPosition.y - landerAltitude

    // ── Dust particles ──
    this.dustEmitter.tick(dt)
    if (active && intensity > 0) {
      const spawnRate = DUST_MIN_SPAWN_RATE + (DUST_MAX_SPAWN_RATE - DUST_MIN_SPAWN_RATE) * intensity
      this.dustSpawnAccumulator += spawnRate * dt
      while (this.dustSpawnAccumulator >= 1) {
        this.dustSpawnAccumulator -= 1
        // Random radial direction on XZ plane
        const angle = Math.random() * Math.PI * 2
        const speed = DUST_RADIAL_SPEED * (0.5 + Math.random() * 0.5) * intensity
        const spawnPos = new THREE.Vector3(
          landerPosition.x + (Math.random() - 0.5) * 4,
          groundY + 0.5,
          landerPosition.z + (Math.random() - 0.5) * 4,
        )
        const pushVel = new THREE.Vector3(
          Math.cos(angle) * speed,
          speed * 0.15, // slight upward lift
          Math.sin(angle) * speed,
        )
        this.dustEmitter.emit(spawnPos, pushVel)
      }
    } else {
      this.dustSpawnAccumulator = 0
    }

    // ── Wash light ──
    this.washLight.intensity = intensity * WASH_LIGHT_MAX_INTENSITY
    this.washLight.position.set(landerPosition.x, landerPosition.y, landerPosition.z)
    this.washLight.target.position.set(landerPosition.x, groundY, landerPosition.z)

    // ── Scorch glow ──
    const scorchActive = active && landerAltitude < SCORCH_ALTITUDE
    if (scorchActive) {
      this.scorchIntensity = Math.min(1, this.scorchIntensity + dt * 3)
    } else {
      this.scorchIntensity = Math.max(0, this.scorchIntensity - dt / SCORCH_FADE_DURATION)
    }
    this.scorchMesh.visible = this.scorchIntensity > 0.01
    if (this.scorchMesh.visible) {
      this.scorchMesh.position.set(landerPosition.x, groundY + 0.1, landerPosition.z)
      const mat = this.scorchMesh.material
      mat.uniforms.intensity.value = this.scorchIntensity * intensity
      mat.uniforms.time.value = this.elapsedTime
    }
  }

  dispose(): void {
    this.dustEmitter.dispose()
    this.washLight.dispose()
    this.scorchMesh.geometry.dispose()
    this.scorchMesh.material.dispose()
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/three/atmosphere/ThrusterWashController.ts
git commit -m "feat(atmosphere): add ThrusterWashController with dust, wash light, and scorch glow"
```

---

### Task 6: SurfaceDustController

**Files:**
- Create: `src/three/atmosphere/SurfaceDustController.ts`

Ambient drift particles + footstep puffs + thruster wash interaction.

- [ ] **Step 1: Create the surface dust controller**

```ts
/**
 * Ambient surface dust and footstep particle effects.
 *
 * Two subsystems:
 * 1. Ambient drift — slow-moving dust motes following the camera
 * 2. Footstep puffs — bursts at player feet while walking in EVA
 *
 * Density and color driven by asteroid data (dustCoverage, baseColor).
 * Drift direction follows sunDirection (solar radiation pressure).
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-atmosphere-effects-design.md
 */
import * as THREE from 'three'
import { ParticleEmitter } from '@/three/ParticleEmitter'
import type { AtmosphereContext } from './AtmosphereContext'

// ── Ambient drift ──
/** Base particle count at dustCoverage = 1.0. Actual count is this * dustCoverage. */
const DRIFT_BASE_COUNT = 120
/** Minimum particles even on low-dust asteroids. */
const DRIFT_MIN_COUNT = 30
const DRIFT_PARTICLE_SIZE = 1.5
const DRIFT_LIFETIME = 8
const DRIFT_OPACITY = 0.2
const DRIFT_SPREAD = 0.5
/** Half-size of the volume box around the camera. */
const DRIFT_VOLUME_HALF = 80
/** Slow drift speed from solar radiation. */
const DRIFT_SPEED = 1.5
/** Height range above ground for ambient particles. */
const DRIFT_MAX_HEIGHT = 25

// ── Footstep puffs ──
const PUFF_POOL_SIZE = 40
const PUFF_PARTICLE_SIZE = 2
const PUFF_LIFETIME = 1.2
const PUFF_SPREAD = 1
const PUFF_OPACITY = 0.3
/** Particles per footstep burst. */
const PUFF_BURST_COUNT = 10
/** Minimum speed (m/s) to trigger footstep puffs. */
const PUFF_SPEED_THRESHOLD = 0.5
/** Distance between footstep triggers (meters). */
const PUFF_STEP_DISTANCE = 2.5
/** Upward puff speed base. Scales inversely with surface gravity. */
const PUFF_UP_SPEED = 2.0
/** Sprint speed threshold — puffs get bigger above this. */
const PUFF_SPRINT_THRESHOLD = 4.0

// ── Wash interaction ──
/** Radius around lander where ambient particles get pushed. */
const WASH_PUSH_RADIUS = 30
/** Push force applied to ambient particles near the wash. */
const WASH_PUSH_STRENGTH = 20

/**
 * Manages ambient surface dust drift and EVA footstep puffs.
 */
export class SurfaceDustController {
  /** Ambient drift emitter — recycling particles around the camera. */
  readonly driftEmitter: ParticleEmitter
  /** Footstep puff emitter — burst particles at player feet. */
  readonly puffEmitter: ParticleEmitter

  private driftDirection = new THREE.Vector3()
  private distanceSinceLastPuff = 0
  private lastPlayerPos = new THREE.Vector3()
  private initialized = false

  constructor(ctx: AtmosphereContext) {
    const dustColor = new THREE.Color(ctx.baseColor[0], ctx.baseColor[1], ctx.baseColor[2]).multiplyScalar(1.3)

    const driftCount = Math.max(DRIFT_MIN_COUNT, Math.round(DRIFT_BASE_COUNT * ctx.dustCoverage))
    this.driftEmitter = new ParticleEmitter({
      poolSize: driftCount,
      color: dustColor,
      size: DRIFT_PARTICLE_SIZE,
      lifetime: DRIFT_LIFETIME,
      spread: DRIFT_SPREAD,
      opacity: DRIFT_OPACITY,
    })

    this.puffEmitter = new ParticleEmitter({
      poolSize: PUFF_POOL_SIZE,
      color: dustColor,
      size: PUFF_PARTICLE_SIZE,
      lifetime: PUFF_LIFETIME,
      spread: PUFF_SPREAD,
      opacity: PUFF_OPACITY,
    })

    // Drift direction from sun (solar radiation pressure pushes away from sun)
    this.driftDirection.copy(ctx.sunDirection).negate().setY(0).normalize().multiplyScalar(DRIFT_SPEED)
  }

  /** Add emitters to scene. */
  addToScene(scene: THREE.Scene): void {
    scene.add(this.driftEmitter.points)
    scene.add(this.puffEmitter.points)
  }

  /** Per-frame update. */
  update(ctx: AtmosphereContext, dt: number): void {
    this.driftEmitter.tick(dt)
    this.puffEmitter.tick(dt)

    // Determine active camera position (follow whichever mode is active)
    const camPos = ctx.activeMode === 'eva' ? ctx.playerPosition : ctx.landerPosition

    // ── Ambient drift: continuously spawn to maintain density ──
    this.spawnDriftParticles(camPos, dt)

    // ── Thruster wash interaction: push ambient particles away from lander ──
    if (ctx.landerThrust > 0 && ctx.landerAltitude < WASH_PUSH_RADIUS) {
      this.pushParticlesFromWash(ctx)
    }

    // ── Footstep puffs ──
    if (ctx.activeMode === 'eva' && ctx.playerGrounded && ctx.playerSpeed > PUFF_SPEED_THRESHOLD) {
      if (!this.initialized) {
        this.lastPlayerPos.copy(ctx.playerPosition)
        this.initialized = true
      }
      const moved = ctx.playerPosition.distanceTo(this.lastPlayerPos)
      this.distanceSinceLastPuff += moved
      this.lastPlayerPos.copy(ctx.playerPosition)

      if (this.distanceSinceLastPuff >= PUFF_STEP_DISTANCE) {
        this.distanceSinceLastPuff = 0
        this.spawnFootstepPuff(ctx)
      }
    } else {
      this.distanceSinceLastPuff = 0
      if (ctx.activeMode === 'eva') {
        this.lastPlayerPos.copy(ctx.playerPosition)
        this.initialized = true
      }
    }
  }

  private spawnDriftParticles(center: THREE.Vector3, dt: number): void {
    // Spawn a few particles per frame to maintain the cloud
    const spawnCount = Math.ceil(this.driftEmitter.poolSize / DRIFT_LIFETIME * dt)
    for (let i = 0; i < spawnCount; i++) {
      const pos = new THREE.Vector3(
        center.x + (Math.random() - 0.5) * DRIFT_VOLUME_HALF * 2,
        center.y - DRIFT_MAX_HEIGHT * 0.5 + Math.random() * DRIFT_MAX_HEIGHT,
        center.z + (Math.random() - 0.5) * DRIFT_VOLUME_HALF * 2,
      )
      this.driftEmitter.emit(pos, this.driftDirection.clone())
    }
  }

  private spawnFootstepPuff(ctx: AtmosphereContext): void {
    const isSprinting = ctx.playerSpeed > PUFF_SPRINT_THRESHOLD
    const count = isSprinting ? PUFF_BURST_COUNT : Math.ceil(PUFF_BURST_COUNT * 0.6)
    const upSpeed = PUFF_UP_SPEED * (isSprinting ? 1.5 : 1.0)

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const outSpeed = 0.5 + Math.random() * 1.5
      const pos = new THREE.Vector3(
        ctx.playerPosition.x + (Math.random() - 0.5) * 0.5,
        ctx.playerPosition.y + 0.1,
        ctx.playerPosition.z + (Math.random() - 0.5) * 0.5,
      )
      const vel = new THREE.Vector3(
        Math.cos(angle) * outSpeed,
        upSpeed * (0.5 + Math.random() * 0.5),
        Math.sin(angle) * outSpeed,
      )
      this.puffEmitter.emit(pos, vel)
    }
  }

  /**
   * Push ambient drift particles away from the lander thruster wash.
   * This is a velocity bias, not a physics simulation.
   */
  private pushParticlesFromWash(ctx: AtmosphereContext): void {
    // Access the internal particle pool via the Points geometry
    const posAttr = this.driftEmitter.points.geometry.getAttribute('position') as THREE.BufferAttribute
    const count = posAttr.count
    for (let i = 0; i < count; i++) {
      const px = posAttr.getX(i)
      const pz = posAttr.getZ(i)
      // Skip dead particles (at 99999)
      if (px > 90000) continue
      const dx = px - ctx.landerPosition.x
      const dz = pz - ctx.landerPosition.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist < WASH_PUSH_RADIUS && dist > 0.1) {
        const factor = (1 - dist / WASH_PUSH_RADIUS) * WASH_PUSH_STRENGTH * ctx.landerThrust * 0.016
        posAttr.setX(i, px + (dx / dist) * factor)
        posAttr.setZ(i, pz + (dz / dist) * factor)
      }
    }
    posAttr.needsUpdate = true
  }

  dispose(): void {
    this.driftEmitter.dispose()
    this.puffEmitter.dispose()
  }
}
```

> **Note:** The `pushParticlesFromWash` method directly manipulates the position buffer attribute. This works because `ParticleEmitter` uses a `THREE.Points` object with a `BufferAttribute` for positions. Dead particles sit at (99999, 99999, 99999) and are skipped.

- [ ] **Step 2: Commit**

```bash
git add src/three/atmosphere/SurfaceDustController.ts
git commit -m "feat(atmosphere): add SurfaceDustController with ambient drift and footstep puffs"
```

---

### Task 7: Wire Into LevelViewController

**Files:**
- Modify: `src/views/LevelViewController.ts`
- Modify: `src/three/SceneManager.ts`

This is the integration task — connect all atmosphere systems to the existing game loop.

- [ ] **Step 1: Enable shadow mapping on SceneManager renderer**

In `src/three/SceneManager.ts`, after line 35 (`this.renderer.setPixelRatio(window.devicePixelRatio)`), add:

```ts
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
```

- [ ] **Step 2: Add atmosphere imports to LevelViewController**

In `src/views/LevelViewController.ts`, add these imports alongside the existing ones (after line 44):

```ts
import { createAtmosphereContext } from '@/three/atmosphere/AtmosphereContext'
import type { AtmosphereContext, AsteroidLighting } from '@/three/atmosphere/AtmosphereContext'
import { LevelLightingRig } from '@/three/atmosphere/LevelLightingRig'
import { LevelPostProcessing } from '@/three/atmosphere/LevelPostProcessing'
import { ThrusterWashController } from '@/three/atmosphere/ThrusterWashController'
import { SurfaceDustController } from '@/three/atmosphere/SurfaceDustController'
```

- [ ] **Step 3: Add atmosphere fields to LevelViewController class**

Add these private fields alongside the existing ones (after line 122, the `landerExplosion` field):

```ts
  // ── Atmosphere ──────────────────────────────────────────────
  private atmosphereCtx: AtmosphereContext | null = null
  private lightingRig: LevelLightingRig | null = null
  private postProcessing: LevelPostProcessing | null = null
  private thrusterWash: ThrusterWashController | null = null
  private surfaceDust: SurfaceDustController | null = null
```

- [ ] **Step 4: Add temporary default lighting config**

The level currently uses hardcoded `TEST_SURFACE` data (line 77). Until the level receives a real asteroid ID from the mission system, add a default lighting config constant near the existing `TEST_SURFACE` (around line 77):

```ts
const TEST_LIGHTING: AsteroidLighting = {
  sunAzimuth: 45,
  sunElevation: 25,
  sunColor: [1.0, 0.93, 0.82],
  sunIntensity: 1.6,
  ambientIntensity: 0.15,
}
```

- [ ] **Step 5: Replace hardcoded lights with LevelLightingRig**

Remove the existing light creation block (lines 189-197):

```ts
    // DELETE these lines:
    const ambient = new AmbientLight(AMBIENT_LIGHT_COLOR, AMBIENT_LIGHT_INTENSITY)
    const sun = new DirectionalLight(DIR_LIGHT_COLOR, DIR_LIGHT_INTENSITY)
    sun.position.set(100, 200, 50)
    const hemi = new HemisphereLight(0x445566, 0x111122, 0.2)
    this.sceneManager.addToScene(ambient)
    this.sceneManager.addToScene(sun)
    this.sceneManager.addToScene(hemi)
```

Replace with:

```ts
    // ── Atmosphere context (per-asteroid config) ───────────────
    this.atmosphereCtx = createAtmosphereContext(TEST_LIGHTING, {
      dustCoverage: TEST_SURFACE.dustCoverage,
      albedo: 0.044,
      biome: 'rocky',
      baseColor: [0.15, 0.13, 0.1],
    })

    // ── Lighting rig (replaces hardcoded lights) ───────────────
    this.lightingRig = new LevelLightingRig(this.atmosphereCtx)
    this.lightingRig.addToScene(this.sceneManager.scene)
```

- [ ] **Step 6: Enable shadows on terrain and lander**

After the terrain mesh is added to scene (line 183), add:

```ts
    this.terrainMesh.mesh.receiveShadow = true
```

After the lander model is loaded (after `await this.landerController.load()`, line 202), add:

```ts
    // Enable shadow casting on all lander meshes
    this.landerController.group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true
      }
    })
```

- [ ] **Step 7: Add thruster wash and surface dust**

After the lander is loaded and positioned (around line 205), add:

```ts
    // ── Thruster wash (needs lander loaded) ────────────────────
    this.thrusterWash = new ThrusterWashController(this.atmosphereCtx.baseColor)
    this.thrusterWash.addToScene(this.sceneManager.scene)

    // ── Surface dust (ambient drift + footstep puffs) ──────────
    this.surfaceDust = new SurfaceDustController(this.atmosphereCtx)
    this.surfaceDust.addToScene(this.sceneManager.scene)
```

- [ ] **Step 8: Set up LevelPostProcessing and replace SceneManager render**

After all scene objects are added but before the GameLoop starts (before line 338), add:

```ts
    // ── Post-processing (wraps renderer) ───────────────────────
    const initialCam = this.vehicleCamera?.camera ?? this.fpsCamera?.camera
    if (initialCam) {
      this.postProcessing = new LevelPostProcessing(
        this.sceneManager.renderer,
        this.sceneManager.scene,
        initialCam,
      )
    }
```

- [ ] **Step 9: Override SceneManager.tick to use post-processing**

In `SceneManager.ts`, add a public property to allow external render override. Add after line 28:

```ts
  /** External render callback — when set, tick() calls this instead of renderer.render(). */
  renderOverride: (() => void) | null = null
```

Modify the `tick` method (line 74) to check for the override:

```ts
  tick(_dt: number): void {
    if (this.renderOverride) {
      this.renderOverride()
      return
    }
    const cam = this.directCamera ?? this.vehicleCamera?.camera
    if (cam) {
      this.renderer.render(this.scene, cam)
    }
  }
```

Then in `LevelViewController.init()`, after creating the post-processing, wire the override:

```ts
    if (this.postProcessing) {
      this.sceneManager.renderOverride = () => this.postProcessing!.render()
    }
```

- [ ] **Step 10: Update atmosphere context and controllers in tick()**

In `LevelViewController.tick()` (line 585), add atmosphere updates before the state info broadcast (before line 653). Add after the dead/arrival state checks:

```ts
    // ── Atmosphere context update ──────────────────────────────
    if (this.atmosphereCtx) {
      const lander = this.landerController
      const player = this.playerController
      const currentState = this.stateMachine?.state ?? ''

      if (lander) {
        const groundH = this.heightmap?.heightAt(lander.position.x, lander.position.z) ?? 0
        this.atmosphereCtx.landerAltitude = Math.max(0, lander.position.y - groundH)
        this.atmosphereCtx.landerThrust = lander.isMainEngineActive ? 1 : 0
        this.atmosphereCtx.landerVelocityY = lander.body.velocityY
        this.atmosphereCtx.landerGrounded = lander.body.grounded
        this.atmosphereCtx.landerPosition.copy(lander.position)
      }

      if (player) {
        this.atmosphereCtx.playerSpeed = player.speed
        this.atmosphereCtx.playerGrounded = player.grounded
        this.atmosphereCtx.playerPosition.copy(player.group.position)
      }

      this.atmosphereCtx.activeMode = currentState === 'eva' ? 'eva'
        : currentState === 'lander' ? 'lander'
        : 'cinematic'

      // Update ground normal
      const activePos = currentState === 'eva' ? player?.group.position : lander?.position
      if (activePos && this.heightmap) {
        const n = this.heightmap.normalAt(activePos.x, activePos.z)
        this.atmosphereCtx.groundNormal.set(n.x, n.y, n.z)
      }

      this.thrusterWash?.update(this.atmosphereCtx, dt)
      this.surfaceDust?.update(this.atmosphereCtx, dt)
    }
```

- [ ] **Step 11: Sync post-processing camera on state transitions**

In `LevelViewController`, when switching between lander and EVA cameras, update the post-processing camera. Find where `setCamera` and `setActiveCamera` are called for state transitions.

In the lander enter state (where `this.sceneManager.setCamera(this.vehicleCamera)` is called), add after:

```ts
      if (this.postProcessing && this.vehicleCamera) {
        this.postProcessing.setCamera(this.vehicleCamera.camera)
      }
```

In the EVA enter state (where `this.sceneManager.setActiveCamera(this.fpsCamera.camera)` is called), add after:

```ts
      if (this.postProcessing && this.fpsCamera) {
        this.postProcessing.setCamera(this.fpsCamera.camera)
      }
```

- [ ] **Step 12: Add resize handling for post-processing**

In `SceneManager.onResize` (line 89), add the composer resize. Add a public `onResizeCallback`:

After line 28 in SceneManager.ts:

```ts
  /** Called on resize so external systems (post-processing) can update. */
  onResizeCallback: ((width: number, height: number) => void) | null = null
```

In the `onResize` method, add at the end (before the closing `}`):

```ts
    this.onResizeCallback?.(clientWidth, clientHeight)
```

Wire it in `LevelViewController.init()`, after creating post-processing:

```ts
    if (this.postProcessing) {
      this.sceneManager.onResizeCallback = (w, h) => this.postProcessing!.resize(w, h)
    }
```

- [ ] **Step 13: Add atmosphere disposal**

In `LevelViewController.dispose()` (line 863), add before `this.sceneManager?.dispose()`:

```ts
    this.thrusterWash?.dispose()
    this.surfaceDust?.dispose()
    this.lightingRig?.dispose()
    this.postProcessing?.dispose()
```

- [ ] **Step 14: Remove unused light constants and imports**

Remove the now-unused constants from the top of `LevelViewController.ts`:

```ts
// DELETE these:
const AMBIENT_LIGHT_INTENSITY = 0.15
const AMBIENT_LIGHT_COLOR = 0x334466
const DIR_LIGHT_INTENSITY = 1.8
const DIR_LIGHT_COLOR = 0xffeedd
```

Remove unused imports from the `three` import (line 46-52). Remove `AmbientLight`, `DirectionalLight`, `HemisphereLight` if no longer used elsewhere in the file. Keep `Color` and `Vector3` if still used.

- [ ] **Step 15: Remove CSS vignette from LevelView.vue**

In `src/views/LevelView.vue`, remove the CSS vignette div from the template (line 86):

```html
  <!-- DELETE this line: -->
  <div v-if="stateInfo.state !== ''" class="level-vignette" />
```

Remove the `.level-vignette` CSS rule (lines 191-204).

- [ ] **Step 16: Run type-check and lint**

Run: `bun run type-check && bun lint`
Expected: PASS — no type errors, no lint warnings.

- [ ] **Step 17: Commit**

```bash
git add src/views/LevelViewController.ts src/views/LevelView.vue src/three/SceneManager.ts
git commit -m "feat(atmosphere): wire all atmosphere systems into LevelViewController"
```

---

### Task 8: Enable Shadows on Arrival Shuttle

**Files:**
- Modify: `src/three/ArrivalSequence.ts`

The arrival sequence shuttle model should also cast shadows.

- [ ] **Step 1: Enable shadow casting on shuttle meshes**

Find where the shuttle GLB model is loaded in `ArrivalSequence.ts`. After the model is added to the group, traverse and enable `castShadow`:

```ts
    this.shuttleGroup.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true
      }
    })
```

- [ ] **Step 2: Commit**

```bash
git add src/three/ArrivalSequence.ts
git commit -m "feat(atmosphere): enable shadow casting on arrival shuttle model"
```

---

### Task 9: Visual Verification and Tuning

**Files:** None created — this is a test/tune pass.

- [ ] **Step 1: Start the dev server**

Run: `bun dev`

- [ ] **Step 2: Verify post-processing pipeline**

Navigate to `/level`. Confirm:
- Subtle bloom on engine flames when thrusting
- Slight desaturation / cool tone on the scene
- Vignette visible at screen edges
- No artifacts or black screen (common EffectComposer wiring bug)

- [ ] **Step 3: Verify shadows**

Confirm:
- Lander casts shadow on terrain
- Shadow direction matches the sun position (azimuth 45, elevation 25 for default)
- No shadow acne (striping artifacts on terrain)
- Shadow fades at edges (PCFSoftShadowMap)

- [ ] **Step 4: Verify thruster wash**

Fly the lander low (< 50m) with engines on. Confirm:
- Dust particles spray outward from ground beneath lander
- SpotLight illuminates terrain below engines
- Scorch glow disc appears when < 20m
- All effects fade when engines cut
- Effects scale with altitude (stronger when closer)

- [ ] **Step 5: Verify surface dust**

Exit lander (F) and walk around in EVA. Confirm:
- Ambient dust motes drift slowly near the surface
- Footstep puffs appear when walking
- Puffs are bigger when sprinting

- [ ] **Step 6: Verify CSS vignette removal**

Confirm:
- No doubled vignette (CSS was removed, render pass handles it)
- Helmet visor frame still visible in EVA mode

- [ ] **Step 7: Tune and commit any adjustments**

If any values need adjustment (bloom too strong, shadow too harsh, dust too dense), tweak the named constants in the respective files and commit:

```bash
git add -u
git commit -m "tune(atmosphere): adjust post-processing and particle parameters"
```
