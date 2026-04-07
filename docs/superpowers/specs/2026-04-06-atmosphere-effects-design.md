# Atmosphere Effects Design

**Date:** 2026-04-06
**Status:** Draft
**Goal:** Transform the level scene from a bare test environment into an immersive, visually grounded experience through post-processing, ground interaction, ambient particles, and data-driven lighting with shadows.

## Motivation

The level scene currently renders with no post-processing, no shadows, no ground interaction effects, and no ambient particles. The terrain, lander, and EVA player all exist in a flat, evenly-lit void. Every asteroid looks identical. The result feels like a developer test scene rather than a hostile alien surface.

## Design Principles

- **Cold and clinical.** Alien (1979) tone. Subtle, desaturated, lens-like. The emptiness is the mood.
- **Data-driven per asteroid.** Lighting angle, color, and intensity come from asteroid JSON. Each landing looks different.
- **Full ground interaction.** Thrusters affect the world visually. Dust reacts to engines and footsteps.
- **Shared context, independent controllers.** Each effect system is its own controller reading from a common `AtmosphereContext`. No controller talks to another.

## Architecture: Shared Context + Independent Controllers

All atmosphere controllers read from `AtmosphereContext`, a plain data object populated by `LevelViewController` each frame. No controller references another directly.

### AtmosphereContext Interface

```ts
interface AtmosphereContext {
  /** Meters above ground under lander. Range: 0+ */
  landerAltitude: number
  /** Normalized main engine power. Range: 0-1 */
  landerThrust: number
  /** Vertical speed in m/s, negative = falling */
  landerVelocityY: number
  /** Whether the lander is on the ground */
  landerGrounded: boolean
  /** EVA walk/sprint speed in m/s */
  playerSpeed: number
  /** Whether EVA player is on the ground */
  playerGrounded: boolean
  /** Surface normal under the active entity (lander or player) */
  groundNormal: Vector3
  /** Current game phase */
  activeMode: 'lander' | 'eva' | 'cinematic'

  // --- Per-asteroid config (set once on level load) ---
  /** Unit vector pointing toward the sun */
  sunDirection: Vector3
  /** Sun light color */
  sunColor: Color
  /** Sun light intensity. Range: 0.5-3.0 */
  sunIntensity: number
  /** Ambient/fill intensity. Range: 0.05-0.4 */
  ambientIntensity: number
  /** From asteroid surface.dustCoverage. Range: 0-1 */
  dustCoverage: number
  /** From asteroid visual.albedo. Affects ground scatter brightness */
  albedo: number
  /** Asteroid biome string. Drives dust color palette */
  biome: string
  /** Surface color for tinting dust particles. From visual.baseColor */
  baseColor: [number, number, number]
}
```

### File Structure

```
src/three/atmosphere/
  AtmosphereContext.ts          -- interface + factory function
  LevelPostProcessing.ts        -- EffectComposer pipeline
  LevelLightingRig.ts           -- data-driven sun/fill/rim + shadows
  ThrusterWashController.ts     -- dust spray + wash light + scorch glow
  SurfaceDustController.ts      -- ambient drift + footstep puffs
```

## System 1: LevelPostProcessing

Replaces direct `renderer.render()` with an `EffectComposer` pipeline.

### Pass Chain (in order)

1. **RenderPass** -- scene + camera, standard render.
2. **UnrealBloomPass** -- subtle glow on engine flames, weapon fire, point lights. Strength ~0.4, radius ~0.4, threshold ~0.75. Only bright emissive objects bloom.
3. **ColorGradePass** (custom ShaderPass) -- slight desaturation (~15%), cool blue-shift in shadows, mild contrast S-curve. Three uniforms: `desaturation` (float, 0-1), `shadowTint` (vec3, cool blue), `contrast` (float, 1.0 = neutral).
4. **ChromaticAberrationPass** (custom ShaderPass) -- very subtle (amount ~0.002), increases slightly at screen edges. Radial offset from center.
5. **VignettePass** (ShaderPass with VignetteShader) -- replaces CSS `.level-vignette`. Offset ~0.95, darkness ~1.0.
6. **FXAAPass** -- anti-aliasing last. Updates resolution uniform on resize.

### ColorGradePass Shader

Fragment shader approach:
- Convert to luminance, mix toward grayscale by `desaturation` factor
- In dark regions (luminance < 0.3), blend toward `shadowTint` color
- Apply contrast via `smoothstep`-based S-curve

### Resize Handling

Follows existing `SceneManager.onResize()` pattern. Composer, bloom resolution, and FXAA resolution uniform all update together.

### What Changes

- CSS `.level-vignette` removed from `LevelView.vue` (replaced by render pass)
- CSS `.helmet-visor` stays (UI frame overlay, not a scene effect)
- `SceneManager` or `LevelViewController` calls `composer.render()` instead of `renderer.render()`

## System 2: LevelLightingRig

Replaces hardcoded lights in `LevelViewController` with a data-driven lighting setup.

### Light Setup

| Light | Type | Purpose |
|-------|------|---------|
| **Sun** | DirectionalLight | Primary key light. Shadow-mapped. Direction, color, intensity from asteroid JSON. |
| **Fill** | HemisphereLight | Prevents pitch-black shadows. Sky color = desaturated sun color. Ground color = dimmed asteroid baseColor. Intensity from JSON `ambientIntensity`. |
| **Rim** | DirectionalLight (no shadow) | Opposite direction from sun, ~0.1 intensity, cool blue tint. Separates silhouettes from dark backgrounds. |

### Shadow Configuration

- Renderer: `shadowMap.enabled = true`, `shadowMap.type = THREE.PCFSoftShadowMap`
- Sun DirectionalLight: `castShadow = true`, shadow map 2048x2048
- Shadow camera frustum sized to terrain bounds
- Shadow bias tuned to prevent acne on terrain
- Lander model: `castShadow = true` (traverse all meshes)
- Shuttle model (arrival): `castShadow = true`
- Terrain mesh: `receiveShadow = true`

### Sun Direction From JSON

The `lighting` block in asteroid JSON defines azimuth (compass bearing, degrees) and elevation (angle above horizon, degrees):

```json
"lighting": {
  "sunAzimuth": 45,
  "sunElevation": 30,
  "sunColor": [1.0, 0.95, 0.85],
  "sunIntensity": 1.8,
  "ambientIntensity": 0.15
}
```

Conversion to direction vector:
```
x = cos(elevation) * sin(azimuth)
y = sin(elevation)
z = cos(elevation) * cos(azimuth)
```

Low elevation (10-20 deg) = long dramatic shadows. High elevation (60+ deg) = harsh overhead with short shadow pools.

### Per-Asteroid Lighting Presets

| Asteroid | Azimuth | Elevation | Sun Color | Intensity | Feel |
|----------|---------|-----------|-----------|-----------|------|
| Bennu | 45 | 25 | warm (1.0, 0.93, 0.82) | 1.6 | golden hour, long shadows on rubble |
| Itokawa | 120 | 40 | neutral (1.0, 0.98, 0.95) | 2.0 | bright, harsh, exposed |
| Psyche | 200 | 15 | cool (0.9, 0.95, 1.0) | 2.2 | metallic gleam, extreme side-lighting |
| 2019-XG7 | 300 | 55 | warm-neutral (1.0, 0.96, 0.9) | 1.4 | overhead, crater shadow pools |
| 2021-KR3 | 80 | 10 | cold (0.85, 0.9, 1.0) | 1.0 | dim, ominous, near-horizon sun |

### What Changes

- Hardcoded `AmbientLight`, `DirectionalLight`, `HemisphereLight` creation removed from `LevelViewController`
- All 5 asteroid JSON files get a new `lighting` block
- Asteroid TypeScript interface updated for the new field

## System 3: ThrusterWashController

Ground interaction when the lander fires engines near the surface. Three visual layers activated by altitude and thrust.

### Layer 1: Radial Dust Particles

When `landerThrust > 0` and `landerAltitude < WASH_MAX_ALTITUDE` (50m):
- Particles spawn at ground point beneath lander
- Spray outward radially along ground plane
- Intensity scales with thrust * (1 - altitude/maxAltitude)
- Color tinted from asteroid `baseColor`
- Uses existing `ParticleEmitter` pattern: pool-based, additive blending
- Max 200 particles, size 2-4, lifetime 0.6-1.0s
- Spawn rate scales from 20/s (high altitude) to 120/s (near ground)

### Layer 2: Wash Light Cone

A `SpotLight` attached beneath the lander, pointing down:
- Angle ~30 deg, penumbra ~0.5
- Color matches engine flame: warm orange (0xff8844)
- Intensity scales with thrust * altitude falloff
- `castShadow = false` (sun handles shadows; wash light is fill only)
- Creates visible pool of light on terrain under engines
- Disabled when `landerAltitude > WASH_MAX_ALTITUDE` or `landerThrust === 0`

### Layer 3: Ground Scorch Glow

Flat circular `PlaneGeometry` projected on terrain at lander ground point:
- Custom `ShaderMaterial`, additive blending, no depth write
- Radial gradient: hot center (bright orange-white) fading to transparent at edges
- Opacity scales with `landerThrust * proximityFactor`
- Pulses subtly with a noise function for organic feel
- When engines cut: fades out over ~1.0s (thermal cooling)
- Radius ~8-12m, always oriented to terrain normal via `groundNormal`

### Altitude Behavior

| Altitude | Dust | Wash Light | Scorch |
|----------|------|------------|--------|
| > 50m | off | off | off |
| 50-20m | faint wisps (20%) | dim (20%) | off |
| 20-5m | full spray (60-100%) | bright (60-100%) | appears, fading in |
| < 5m | maximum (100%), wider spread | maximum (100%) | full intensity, pulsing |
| Grounded, engines off | fade out ~1s | fade out ~0.5s | fade out ~1s |

All thresholds are named constants in a config object at the top of the file.

## System 4: SurfaceDustController

Ambient environmental particles that make the world feel alive.

### Ambient Drift Particles

- 80-120 particles in a box volume around the camera
- Slow drift in a consistent direction (derived from `sunDirection` -- solar radiation pressure)
- Density scales with `dustCoverage` from asteroid data (0.2 = sparse, 0.8 = thick haze)
- Particle color from asteroid `baseColor`, slightly brightened
- Size: 1-2 screen pixels. Opacity: 0.15-0.3
- Volume follows camera. Particles that exit respawn on opposite side (seamless recycling)
- Uses existing `ParticleEmitter` with `PointsMaterial`, additive blending

### Footstep Puffs

When `activeMode === 'eva'` and `playerGrounded && playerSpeed > 0`:
- Burst of 8-12 particles at player feet
- Trigger interval tied to camera bob cycle (already exists in `FpsCamera`)
- Particles puff upward and settle slowly (settle speed scaled by asteroid `surfaceGravity`)
- Faster movement = bigger puffs, sprinting kicks up more
- Color matches ambient dust
- Max 40 particles recycled across puffs

### Thruster Wash Interaction

When lander is thrusting near ground, ambient particles within wash radius get a velocity bias pushing them outward:
```
if (distToLander < washRadius) {
  velocity += pushDirection * pushStrength * (1 - dist/washRadius)
}
```
Not a physics simulation -- just a directional nudge. Reads `landerAltitude` and `landerThrust` from context.

## Integration in LevelViewController

### Initialization Order

1. Build `AtmosphereContext` -- per-asteroid fields populated from the asteroid JSON passed to `LevelViewController` (the same JSON already used for terrain generation). Per-frame fields initialized to defaults (zero thrust, grounded, etc.).
2. `LevelLightingRig` -- lights and shadows must exist before first render
3. `LevelPostProcessing` -- wraps renderer with EffectComposer
4. `SurfaceDustController` -- ambient particles added to scene
5. `ThrusterWashController` -- depends on lander model being loaded

### Per-Frame Update

```
1. Populate AtmosphereContext from existing game state
2. lightingRig.update(ctx)        -- no-op unless dynamic later
3. thrusterWash.update(ctx, dt)   -- dust, light, scorch
4. surfaceDust.update(ctx, dt)    -- drift, puffs, wash interaction
5. postProcessing.render()        -- EffectComposer replaces renderer.render()
```

### Dispose

Each controller implements `dispose()` to clean up Three.js objects, lights, and emitters. Called from `LevelViewController.dispose()`.

### Data Changes

- Add `lighting` block to all 5 asteroid JSON files
- Update asteroid TypeScript interface for the `lighting` field

### Removals

- CSS `.level-vignette` from `LevelView.vue` (replaced by vignette pass)
- Hardcoded light creation in `LevelViewController` (replaced by `LevelLightingRig`)

### Unchanged

- CSS `.helmet-visor` (UI frame overlay)
- Existing particle emitters (flame, RCS, impact)
- Camera systems (VehicleCamera, FpsCamera)
- All game logic, physics, state machine
- Map view post-processing (separate EffectComposer)

## Performance Considerations

- Post-processing adds 5 full-screen passes but only bloom is expensive. Custom shaders are trivial. FXAA is cheaper than MSAA.
- Shadow map (2048x2048, one light) is standard cost. Only the sun casts shadows.
- Particle counts are modest: ~200 wash + ~120 ambient + ~40 footstep = ~360 total, well within the existing emitter pattern's capacity.
- All controllers can be individually disabled for lower-end hardware if needed later.
