# Map View (Planetarium) Design

> Port the planets project's procedural Three.js solar system into the asteroids
> game as the `/map` route. Real-time Keplerian orbits, procedural shaders,
> no textures or GLBs.

**Source:** `D:/Developer/planets/src/three/` + `D:/Developer/planets/src/composables/`
**Data layer:** `src/lib/planets/` (already ported)
**Date:** 2026-04-04

---

## 1. Goal

Build a real-time procedural solar system on the `/map` route: Sun with star
shader, 10 planets with rocky/gas-giant shaders, 30+ moons, Saturn/Uranus rings,
2 asteroid belts, orbit lines, starfield, bloom post-processing, and damped
orbital camera. All bodies move on Keplerian paths driven by the data layer.

### In scope

- GLSL shaders: star, rocky planet, gas giant, ring, shared vertex + common utils
- Mesh factories: planet, moon, sun, ring, orbit line
- Controllers: SunController, PlanetSystemController, AsteroidBeltController
- Scene setup: bloom, tone mapping, lighting rig
- MapViewController lifecycle + MapView.vue route
- Reuse existing SceneManager, GameLoop, TickHandler, StarFieldController

### Out of scope (follow-up pass)

- Click-to-select / raycasting
- Camera transitions (overview / detail modes)
- Planet labels / telemetry HUD / Vue UI overlays
- Text layout / obstacle avoidance
- Sound
- Shuttle integration

---

## 2. File Structure

```
src/three/shaders/
  common.glsl              — Shared noise, FBM, fresnel, lighting
  sphere.vert.glsl         — Vertex shader for all spherical bodies
  rockyPlanet.frag.glsl    — Procedural rocky terrain
  gasGiant.frag.glsl       — Banded atmosphere with storms
  star.frag.glsl           — Plasma noise star surface
  ring.frag.glsl           — Ring bands with Cassini/Encke/Keeler gaps

src/three/meshes/
  createPlanetMesh.ts      — ShaderMaterial sphere for rocky/gas planets
  createMoonMesh.ts        — Smaller sphere with rockyPlanet shader
  createSunMesh.ts         — Star shader sphere + PointLight + corona sprite
  createRingMesh.ts        — PlaneGeometry with ring shader
  createOrbitLine.ts       — LineLoop from orbitPathPoints()

src/three/controllers/
  SunController.ts         — Sun mesh/light/corona, ticks rotation + shader time
  PlanetSystemController.ts — Per-planet: mesh + moons + ring + orbits, ticks positions
  AsteroidBeltController.ts — Instanced belt with Kirkwood gaps, ticks drift + tumble

src/three/MapSceneSetup.ts — Bloom, tone mapping, lighting rig on SceneManager

src/views/
  MapView.vue              — Thin wrapper, mounts canvas
  MapViewController.ts     — Lifecycle owner: builds scene, registers controllers

src/router/index.ts        — Add /map route
```

---

## 3. Shader Layer

Direct ports from the planets project. All GLSL files copy as-is into
`src/three/shaders/`. They are pure GLSL with no external dependencies.

### common.glsl

Shared utility library, prepended to all fragment shaders via string
concatenation at material creation time.

| Function | Purpose |
|----------|---------|
| `hash(float)` | Pseudorandom float from float |
| `noise3D(vec3)` | 3D value noise with Hermite interpolation |
| `fbm(vec3, int)` | Fractional Brownian motion, up to 8 octaves |
| `diffuseLight(normal, lightDir)` | Lambertian diffuse |
| `fresnel(normal, viewDir, power)` | Rim/atmosphere glow |
| `rotateY(float)` | 3x3 Y-axis rotation matrix |

### sphere.vert.glsl

Standard sphere vertex transform. Outputs four varyings consumed by all
fragment shaders:

- `vModelNormal` — model-space normal
- `vModelPosition` — model-space vertex position
- `vViewNormal` — camera-space normal
- `vViewPosition` — camera-space position

### rockyPlanet.frag.glsl

Procedural terrain for terrestrial planets and moons.

Pipeline:
1. FBM on model-space normal (seeded per body via `uSeed`)
2. Height-based coloring: valleys at 0.6x base, mountains at 1.2x base
3. Surface variation noise overlay
4. Diffuse sunlight + starlight hemisphere fill
5. Optional atmosphere: fresnel rim glow when `uHasAtmosphere > 0.5`

Uniforms: `uTime`, `uBaseColor` (vec3), `uHasAtmosphere` (float),
`uSeed` (float), `uLightDir` (vec3), `uAmbientStrength` (float),
`uBacklightStrength` (float).

### gasGiant.frag.glsl

Banded atmosphere for Jupiter, Saturn, Uranus, Neptune.

Pipeline:
1. Spherical-coordinate latitude bands (15x, 25x, 40x frequency sine waves)
2. FBM turbulence distorts band boundaries
3. Light/dark band coloring blended from base color
4. Storm cells: smoothstep circular regions with swirl noise
5. Diffuse sun + wrap lighting + back-fill
6. Limb darkening (view-angle fade)

Uniforms: `uTime`, `uBaseColor` (vec3), `uSeed` (float),
`uStormIntensity` (float), `uRotationSpeed` (float),
`uLightDir` (vec3), `uAmbientStrength` (float),
`uBacklightStrength` (float).

### star.frag.glsl

Multi-layer procedural star surface for the Sun.

Layers:
1. 5-octave plasma noise with time-driven offset vectors
2. 3-layer hot bubble detection with smoothstep pulsation
3. 4-octave boiling turbulence (fast animation)
4. 3-tier corona flames on rim edges
5. 4-tier temperature coloring (cool to blazing)
6. Rim glow, edge bloom, center boost, shimmer

Uniforms: `uTime`, `uStarColor` (vec3), `uTemperature` (float),
`uActivityLevel` (float), `uRotationSpeed` (float).

### ring.frag.glsl

Planetary ring shader for Saturn and Uranus.

Pipeline:
1. Radial distance from center normalized to [0, 1]
2. Band density function: C ring (inner, sparse), B ring (dense),
   Cassini division (gap), A ring with Encke/Keeler gaps, F ring (outer, faint)
3. Noise-based opacity variation
4. Color tinted by `uColor` uniform

Uniforms: `uInnerRadius`, `uOuterRadius`, `uOpacity`,
`uColor` (vec3), `uTime`.

---

## 4. Mesh Factories

Stateless functions in `src/three/meshes/`. Each creates and returns Three.js
objects. No per-frame logic — that belongs in controllers.

### createPlanetMesh(planet: Planet): Mesh

1. `SphereGeometry(1, SPHERE_SEGMENTS, SPHERE_SEGMENTS)`
2. Select fragment shader: `rockyPlanet.frag.glsl` if type is `rockyPlanet`,
   `gasGiant.frag.glsl` if type is `gasGiant`
3. Build `ShaderMaterial`:
   - Vertex: `sphere.vert.glsl`
   - Fragment: `common.glsl` + selected frag (string concatenation)
   - Uniforms: `uTime` (0), all entries from `planet.shader.uniforms`,
     plus `uLightDir`, `uAmbientStrength`, `uBacklightStrength`
4. Scale mesh by `planet.displayRadius * SIZE_SCALE`
5. Apply axial tilt: `mesh.rotation.z = planet.axialTilt`
6. Patch `onBeforeCompile` for dynamic sun lighting (replaces static light
   direction in shader source with uniform-driven direction)

Returns the mesh. Caller is responsible for positioning and scene attachment.

### createMoonMesh(moon: Moon): Mesh

Same pattern as `createPlanetMesh` but:
- Always `rockyPlanet` shader
- `MOON_SPHERE_SEGMENTS` instead of `SPHERE_SEGMENTS`
- Lighter ambient/backlight strengths (from planets constants:
  `PLANET_SHADER_AMBIENT_INTENSITY`, `PLANET_SHADER_BACKLIGHT_INTENSITY`)
- No axial tilt

### createSunMesh(sun: SunData): Group

Returns a `Group` containing three objects:

1. **Star sphere**: `SphereGeometry` + `ShaderMaterial` using `star.frag.glsl`.
   Scaled by `sun.displayRadius * SIZE_SCALE`. Uniforms from `sun.shader.uniforms`.

2. **PointLight**: Positioned at center. Intensity `SUN_LIGHT_INTENSITY`,
   decay `SUN_LIGHT_DECAY`, range `SUN_LIGHT_RANGE` (0 = infinite).

3. **Corona sprite**: `Sprite` with `SpriteMaterial` using a canvas-generated
   radial gradient texture. Additive blending (`THREE.AdditiveBlending`).
   Scale ~4x the sun sphere for glow halo effect.

### createRingMesh(ring: RingConfig, axialTilt: number): Mesh

1. `PlaneGeometry` sized to `ring.outerRadius * 2`
2. `ShaderMaterial` with `ring.frag.glsl`, uniforms from RingConfig
3. Double-sided rendering (`side: THREE.DoubleSide`)
4. Transparent (`transparent: true`)
5. Rotated on X axis by `Math.PI / 2` (lay flat), then tilted by `axialTilt`

### createOrbitLine(elements: OrbitalElements, opacity?: number): LineLoop

1. Call `orbitPathPoints(elements)` from `src/lib/planets/orbit.ts`
2. Scale all points by `ORBIT_SCALE`
3. `BufferGeometry` from points array
4. `LineBasicMaterial` with white color, given opacity, transparent
5. Return `LineLoop`

---

## 5. Controllers

All implement `Tickable`. All registered at `TICK_PRIORITY_ANIMATION` with the
shared `TickHandler`.

### SunController

```
constructor(sunData: SunData)
  → calls createSunMesh(sunData)
  → stores mesh group, shader material ref

tick(dt: number, simTime: number)
  → updates uTime uniform
  → rotates star mesh: mesh.rotation.y += sunData.rotationSpeed * dt / ROTATION_SPEED_DIVISOR

getGroup(): Group — returns the sun group for scene attachment
getLight(): PointLight — returns the light for lighting calculations

dispose()
  → traverses group, disposes all geometries, materials, textures
```

### PlanetSystemController

One instance per planet. Manages the planet, its moons, ring, and orbit lines
as a coherent system.

```
constructor(planet: Planet)
  → calls createPlanetMesh(planet) → stores mesh
  → calls createOrbitLine(planet.orbit) → stores line
  → for each moon: createMoonMesh(moon), createOrbitLine(moon.orbit)
  → if planet.ring: createRingMesh(planet.ring, planet.axialTilt)
  → creates a Group containing planet mesh + moons + ring
  → orbit lines are separate (added to scene root, not the moving group)

tick(dt: number, simTime: number)
  → compute planet position: orbitalPosition3D(planet.orbit, simTime)
  → scale position by ORBIT_SCALE, set group position
  → rotate planet mesh: mesh.rotation.y += planet.rotationSpeed * dt / ROTATION_SPEED_DIVISOR
  → update planet shader uTime
  → compute sun direction in mesh-local space, update uLightDir
  → for each moon:
    → compute moon position: orbitalPosition3D(moon.orbit, simTime / MOON_ORBIT_SPEED_DIVISOR)
    → position relative to planet group center (no ORBIT_SCALE — moon orbits are local)
    → rotate moon, update moon shader uTime and uLightDir

getGroup(): Group — the moving planet system
getOrbitLines(): LineLoop[] — planet + moon orbit lines for scene root

dispose()
  → full cleanup of all meshes, materials, lines
```

**Sun direction computation**: each frame, transform the sun's world position
(origin) into the mesh's local coordinate space using the mesh's inverse world
matrix. Normalize to get `uLightDir`. This makes lighting correct regardless
of planet position.

### AsteroidBeltController

Instanced rendering of thousands of small bodies.

```
constructor(belt: AsteroidBelt)
  → create base geometry: IcosahedronGeometry(1, 0) — simple 20-face polyhedron
  → create material: MeshStandardMaterial with dark color, optional emissive
  → distribute instances:
    → for i in 0..belt.maxParticles:
      → radius = random in [innerRadius, outerRadius] with Kirkwood gap rejection
      → angle = random in [0, 2pi]
      → height = Gaussian spread * belt.thickness
      → size = power-law from belt.sizeRange with belt.sizeExponent
      → store per-instance: position, size, random tumble axis/speed
  → create InstancedMesh(geometry, material, count)
  → set initial instance matrices

tick(dt: number, simTime: number)
  → rotate the entire group slowly: group.rotation.y += belt.orbitalSpeed * dt
  → update per-instance tumble rotations via matrix composition

getGroup(): Group
dispose()
```

**Kirkwood gap rejection**: for each particle, compute normalized radial
position within the belt. If it falls within any gap's [position - width/2,
position + width/2], reject and resample.

---

## 6. Scene Setup

### MapSceneSetup

A function that configures the existing `SceneManager` for map mode. Called
once during `MapViewController.init()`.

**Post-processing:**
- `UnrealBloomPass` with strength `0.72`, radius `0.55`, threshold `0.45`
- Tone mapping exposure `1.35` on the renderer

**Scene lighting** (ambient fills for bodies facing away from sun):
- `AmbientLight` color `0x2a3858`, intensity `0.55`
- `HemisphereLight` sky `0x7f97c8`, ground `0x1f160f`, intensity `0.6`
- `DirectionalLight` (fill) color `0xa9bfe6`, intensity `0.35`

**Camera:**
- FOV `50`, near `0.1`, far `500`
- Initial position: `(0, 3, 20)` — slightly elevated, looking at origin
- OrbitControls: damping factor `0.03`, min distance `2`, max distance `100`

**Background:** `0x000000` (black)

Note: these constants come from the planets project's `constants.ts`. They
are view-layer constants that were excluded from the data layer port. They
will be defined locally in `MapSceneSetup.ts` as named constants.

---

## 7. MapViewController

The lifecycle owner. Follows the same pattern as `HomeViewController`.

```
class MapViewController implements Tickable {
  private gameLoop: GameLoop
  private tickHandler: TickHandler
  private sceneManager: SceneManager
  private sunController: SunController
  private planetControllers: PlanetSystemController[]
  private beltControllers: AsteroidBeltController[]
  private starField: StarFieldController
  private simTime: number = 0

  async init(container: HTMLElement): Promise<void>
    → create GameLoop, TickHandler, SceneManager
    → call MapSceneSetup(sceneManager)
    → create StarFieldController, add to scene
    → create SunController from catalog.SUN, add to scene
    → for each planet in catalog.PLANETS:
      → create PlanetSystemController(planet)
      → add group + orbit lines to scene
    → for each belt in catalog.ASTEROID_BELTS:
      → create AsteroidBeltController(belt)
      → add to scene
    → register all controllers + self with TickHandler
    → start GameLoop

  tick(dt: number): void
    → simTime += dt * DEFAULT_TIME_SCALE
    → pass simTime to all controllers via their tick methods

  dispose(): void
    → stop GameLoop
    → dispose all controllers
    → dispose SceneManager
}
```

### SimTime flow

The simulation time accumulates as `simTime += dt * DEFAULT_TIME_SCALE` where
`dt` is the clamped frame delta in seconds and `DEFAULT_TIME_SCALE` is `5.0`.
This means 1 real second = 5 simulation-days. All controllers receive
`simTime` in their tick, which they pass to `orbitalPosition3D()`.

---

## 8. MapView.vue

Thin Vue wrapper following the ViewController pattern.

```vue
<template>
  <div ref="container" class="scene-container" />
</template>
```

Script setup:
- Creates `MapViewController` instance
- `onMounted`: calls `viewController.init(container.value)`
- `onUnmounted`: calls `viewController.dispose()`

No business logic in the Vue file.

---

## 9. Router

Add lazy-loaded route to `src/router/index.ts`:

```ts
{
  path: '/map',
  name: 'map',
  component: () => import('@/views/MapView.vue'),
}
```

---

## 10. SceneManager Adaptation

The existing `SceneManager` needs minor extensions to support the map view:

1. **Post-processing support**: Add ability to configure an `EffectComposer`
   with `RenderPass` + `UnrealBloomPass`. The `tick()` method renders via
   composer when one is configured, otherwise via renderer directly.

2. **Configurable camera**: Allow FOV/near/far to be set at construction or
   via a setup function, rather than hardcoded values.

3. **Configurable OrbitControls**: Allow damping, min/max distance to be set.

These are additive changes — they don't break the existing HomeView usage.

---

## 11. Dynamic Sun Lighting

The planets project's key rendering technique: each planet/moon's shader
receives a `uLightDir` uniform that's the sun's direction in that mesh's
local coordinate space. This is computed per frame.

**How it works:**

1. At material creation (`createPlanetMesh`), the `ShaderMaterial` includes
   `uLightDir`, `uAmbientStrength`, `uBacklightStrength` uniforms.

2. The fragment shaders use these uniforms for lighting calculations instead
   of a hardcoded light direction.

3. Each frame in `PlanetSystemController.tick()`:
   - Get the sun's world position (origin: `0, 0, 0`)
   - Get the planet mesh's world position
   - Compute direction: `normalize(sunWorldPos - meshWorldPos)`
   - Transform into mesh-local space: multiply by inverse of mesh's
     world rotation matrix
   - Set `uLightDir` uniform value

This gives correct day/night terminator lines on all bodies regardless of
their orbital position.

---

## 12. Conventions

All new files follow the asteroids project conventions:

- **TSDoc** on all exports with `@author guinetik`, `@date 2026-04-04`,
  `@spec docs/superpowers/specs/2026-04-04-map-view-design.md`
- **File headers** on all `src/three/` and `src/views/` modules
- **No magic numbers** — all numeric constants named
- **No semicolons**, single quotes, 2-space indent (Prettier)
- **Controller pattern** for Three.js objects (Tickable interface)
- **ViewController pattern** for Vue view lifecycle
- **Dispose everything** — traverse and clean up all Three.js resources
