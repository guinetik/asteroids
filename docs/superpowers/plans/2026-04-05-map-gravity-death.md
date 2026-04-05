# Map Gravity & Death Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add gravitational pull from the Sun and planets to the map view so the shuttle follows spacetime curvature, can die by crossing event horizons, and gets visual/HUD feedback as gravity increases.

**Architecture:** Parameterize the existing `gravity.ts` functions with an optional `GravityConfig` (defaults preserve shuttle scene). MapViewController creates `GravityWell` adapters for each orrery body, wires them to ShuttleController, and drives a post-processing distortion pass + HUD warning from proximity calculations.

**Tech Stack:** TypeScript, Three.js (ShaderPass, EffectComposer), Vue 3 (reactive props), Vitest, Tailwind CSS

---

### Task 1: Parameterize gravity.ts with GravityConfig

**Files:**
- Modify: `src/lib/physics/gravity.ts`
- Create: `src/lib/physics/__tests__/gravity.spec.ts`

- [ ] **Step 1: Write failing tests for GravityConfig parameter**

Create `src/lib/physics/__tests__/gravity.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  influenceRadius,
  eventHorizonRadius,
  gravityAt,
  checkEventHorizon,
  type GravityConfig,
  type GravitySource,
} from '../gravity'

const MAP_CONFIG: GravityConfig = {
  gravityConstant: 0.08,
  minDistance: 0.3,
  influenceScale: 8,
  eventHorizonScale: 1.2,
}

describe('gravity with default config', () => {
  it('influenceRadius uses default scale 400', () => {
    expect(influenceRadius(1)).toBe(400)
  })

  it('eventHorizonRadius uses default scale 230', () => {
    expect(eventHorizonRadius(1)).toBe(230)
  })

  it('gravityAt returns zero outside influence radius', () => {
    const g = gravityAt(0, 0, 1, 500, 0)
    expect(g.ax).toBe(0)
    expect(g.az).toBe(0)
  })

  it('gravityAt returns nonzero inside influence radius', () => {
    const g = gravityAt(0, 0, 1, 100, 0)
    expect(g.ax).toBeGreaterThan(0)
    expect(g.az).toBe(0)
  })

  it('checkEventHorizon returns null when outside', () => {
    const source: GravitySource = { mass: 1, getWorldX: () => 0, getWorldZ: () => 0 }
    expect(checkEventHorizon([source], 300, 0)).toBeNull()
  })

  it('checkEventHorizon returns source when inside', () => {
    const source: GravitySource = { mass: 1, getWorldX: () => 0, getWorldZ: () => 0 }
    expect(checkEventHorizon([source], 100, 0)).toBe(source)
  })
})

describe('gravity with custom GravityConfig', () => {
  it('influenceRadius uses config scale', () => {
    expect(influenceRadius(1, MAP_CONFIG)).toBe(8)
  })

  it('eventHorizonRadius uses config scale', () => {
    expect(eventHorizonRadius(1, MAP_CONFIG)).toBe(1.2)
  })

  it('gravityAt uses config constants', () => {
    // At distance 4 from Sun (mass=1), inside influence radius 8
    const g = gravityAt(0, 0, 1, 4, 0, MAP_CONFIG)
    // Force = 0.08 * 1 / (4*4) = 0.005, direction = +x
    expect(g.ax).toBeCloseTo(0.005, 4)
    expect(g.az).toBe(0)
  })

  it('gravityAt returns zero outside config influence radius', () => {
    const g = gravityAt(0, 0, 1, 10, 0, MAP_CONFIG)
    expect(g.ax).toBe(0)
  })

  it('gravityAt clamps to config minDistance', () => {
    // Very close — should clamp to minDistance 0.3
    const g = gravityAt(0, 0, 1, 0.1, 0, MAP_CONFIG)
    const expected = 0.08 / (0.3 * 0.3) // ~0.889
    expect(g.ax).toBeCloseTo(expected, 2)
  })

  it('checkEventHorizon uses config scale', () => {
    const source: GravitySource = { mass: 1, getWorldX: () => 0, getWorldZ: () => 0 }
    // Default horizon = 230, config horizon = 1.2
    expect(checkEventHorizon([source], 2, 0, MAP_CONFIG)).toBeNull()
    expect(checkEventHorizon([source], 1, 0, MAP_CONFIG)).toBe(source)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/physics/__tests__/gravity.spec.ts`
Expected: FAIL — `GravityConfig` type does not exist, functions don't accept config param

- [ ] **Step 3: Add GravityConfig interface and parameterize functions**

Edit `src/lib/physics/gravity.ts`. Add the interface after the existing constants (line 24):

```ts
/**
 * Optional tuning overrides for gravity calculations.
 * When omitted, functions use the module-level defaults
 * (calibrated for the shuttle scene).
 */
export interface GravityConfig {
  /** Gravitational constant (default 500000) */
  gravityConstant: number
  /** Minimum distance to prevent infinite force (default 15) */
  minDistance: number
  /** Influence radius multiplier on sqrt(mass) (default 400) */
  influenceScale: number
  /** Event horizon radius multiplier on sqrt(mass) (default 230) */
  eventHorizonScale: number
}
```

Update `influenceRadius`:
```ts
export function influenceRadius(mass: number, config?: GravityConfig): number {
  const scale = config?.influenceScale ?? INFLUENCE_RADIUS_SCALE
  return scale * Math.sqrt(mass)
}
```

Update `eventHorizonRadius`:
```ts
export function eventHorizonRadius(mass: number, config?: GravityConfig): number {
  const scale = config?.eventHorizonScale ?? EVENT_HORIZON_SCALE
  return scale * Math.sqrt(mass)
}
```

Update `checkEventHorizon` — add `config?: GravityConfig` as 4th parameter:
```ts
export function checkEventHorizon(
  sources: GravitySource[],
  px: number,
  pz: number,
  config?: GravityConfig,
): GravitySource | null {
  for (const source of sources) {
    const dx = source.getWorldX() - px
    const dz = source.getWorldZ() - pz
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist < eventHorizonRadius(source.mass, config)) {
      return source
    }
  }
  return null
}
```

Update `gravityAt` — add `config?: GravityConfig` as 6th parameter:
```ts
export function gravityAt(
  sourceX: number,
  sourceZ: number,
  mass: number,
  px: number,
  pz: number,
  config?: GravityConfig,
): GravityVector {
  const minDist = config?.minDistance ?? MIN_GRAVITY_DISTANCE
  const gConst = config?.gravityConstant ?? GRAVITY_CONSTANT
  const dx = sourceX - px
  const dz = sourceZ - pz
  const dist = Math.max(Math.sqrt(dx * dx + dz * dz), minDist)

  const radius = influenceRadius(mass, config)

  if (dist >= radius) {
    return { ax: 0, az: 0 }
  }

  const forceMag = (gConst * mass) / (dist * dist)
  const nx = dx / dist
  const nz = dz / dist

  return { ax: nx * forceMag, az: nz * forceMag }
}
```

Update `totalGravityAt` — add `config?: GravityConfig`:
```ts
export function totalGravityAt(
  sources: GravitySource[],
  px: number,
  pz: number,
  config?: GravityConfig,
): GravityVector {
  let ax = 0
  let az = 0

  for (const source of sources) {
    const g = gravityAt(source.getWorldX(), source.getWorldZ(), source.mass, px, pz, config)
    ax += g.ax
    az += g.az
  }

  return { ax, az }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/physics/__tests__/gravity.spec.ts`
Expected: All PASS

- [ ] **Step 5: Run full test suite to verify no regressions**

Run: `bun test:unit`
Expected: All existing tests still pass (no callers break because config is optional)

- [ ] **Step 6: Commit**

```bash
git add src/lib/physics/gravity.ts src/lib/physics/__tests__/gravity.spec.ts
git commit -m "feat(gravity): parameterize gravity functions with optional GravityConfig"
```

---

### Task 2: Create map-gravity.json and export GravityWell

**Files:**
- Create: `src/data/shuttle/map-gravity.json`
- Modify: `src/three/ShuttleController.ts:17-20` (export GravityWell)
- Modify: `src/three/ShuttleController.ts:389-401` (pass config to checkEventHorizon)

- [ ] **Step 1: Create the map gravity config JSON**

Create `src/data/shuttle/map-gravity.json`:

```json
{
  "gravityConstant": 0.08,
  "minDistance": 0.3,
  "influenceScale": 8,
  "eventHorizonScale": 1.2,
  "lensStrength": 0.08,
  "chromStrength": 0.015
}
```

- [ ] **Step 2: Export GravityWell interface from ShuttleController**

In `src/three/ShuttleController.ts`, change line 17-20 from:
```ts
/** Any object that can exert gravity on the shuttle */
interface GravityWell {
  getGravityAt(position: THREE.Vector3): THREE.Vector3
}
```
to:
```ts
/** Any object that can exert gravity on the shuttle */
export interface GravityWell {
  getGravityAt(position: THREE.Vector3): THREE.Vector3
}
```

- [ ] **Step 3: Add GravityConfig to ShuttleController constructor**

In `src/three/ShuttleController.ts`, add import for `GravityConfig`:
```ts
import { checkEventHorizon, type GravitySource, type GravityConfig } from '@/lib/physics/gravity'
```

Add a private field after `private readonly physics: ShuttlePhysicsConfig` (around line 158):
```ts
private readonly gravityConfig: GravityConfig | undefined
```

Update the constructor signature (around line 160):
```ts
constructor(
  inputManager: InputManager,
  physics: ShuttlePhysicsConfig = SHUTTLE_PHYSICS,
  gravityConfig?: GravityConfig,
) {
  this.inputManager = inputManager
  this.physics = physics
  this.gravityConfig = gravityConfig
}
```

- [ ] **Step 4: Pass gravityConfig to checkEventHorizon in checkDeath**

In `src/three/ShuttleController.ts`, update `checkDeath()` (around line 389):
```ts
private checkDeath(): void {
  const hit = checkEventHorizon(
    this.gravitySources,
    this.group.position.x,
    this.group.position.z,
    this.gravityConfig,
  )
  if (hit) {
    this.isDead = true
    this.deathTarget = new THREE.Vector3(hit.getWorldX(), 0, hit.getWorldZ())
    this.velocity.set(0, 0, 0)
    this.angularVelocity = 0
    this.deathSpeed = 20
  }
}
```

- [ ] **Step 5: Add onDeath callback**

Add a public field after `onAllDepleted` (if present) or after thrusterSystem declaration:
```ts
/** Called when death animation completes. Falls back to respawn() if not set. */
onDeath: (() => void) | null = null
```

In `updateDeath()`, change the respawn call (around line 412-415):
```ts
if (dist < 5) {
  if (this.onDeath) {
    this.onDeath()
  } else {
    this.respawn()
  }
  return
}
```

- [ ] **Step 6: Run type-check and lint**

Run: `bun run type-check && bun lint`
Expected: No errors (all existing callers pass no config, which is fine)

- [ ] **Step 7: Commit**

```bash
git add src/data/shuttle/map-gravity.json src/three/ShuttleController.ts
git commit -m "feat(gravity): export GravityWell, add GravityConfig to ShuttleController, add onDeath callback"
```

---

### Task 3: Wire gravity wells into MapViewController

**Files:**
- Modify: `src/views/MapViewController.ts`

This task connects the gravity system. After this, the shuttle will be pulled by gravity, follow the spacetime grid Y, and can die.

- [ ] **Step 1: Add imports and load config**

In `src/views/MapViewController.ts`, add these imports near the top:

```ts
import { gravityAt, type GravityConfig } from '@/lib/physics/gravity'
import type { GravityWell } from '@/three/ShuttleController'
import type { GravitySource } from '@/lib/physics/gravity'
import mapGravityData from '@/data/shuttle/map-gravity.json'
```

Add a constant after the existing constants (around line 86):

```ts
/** Map-scale gravity tuning loaded from JSON. */
const MAP_GRAVITY_CONFIG: GravityConfig = {
  gravityConstant: mapGravityData.gravityConstant,
  minDistance: mapGravityData.minDistance,
  influenceScale: mapGravityData.influenceScale,
  eventHorizonScale: mapGravityData.eventHorizonScale,
}
```

- [ ] **Step 2: Create gravity well adapter factory**

Add a module-level helper function (above the class):

```ts
/**
 * Wraps a GravitySource (e.g. SunController, PlanetSystemController) into a
 * GravityWell that ShuttleController can consume, using map-scale config.
 */
function makeGravityWell(source: GravitySource, config: GravityConfig): GravityWell & GravitySource {
  return {
    mass: source.mass,
    getWorldX: () => source.getWorldX(),
    getWorldZ: () => source.getWorldZ(),
    getGravityAt(pos: THREE.Vector3): THREE.Vector3 {
      const g = gravityAt(source.getWorldX(), source.getWorldZ(), source.mass, pos.x, pos.z, config)
      return new THREE.Vector3(g.ax, 0, g.az)
    },
  }
}
```

- [ ] **Step 3: Pass GravityConfig to ShuttleController and wire gravity wells**

In the `init()` method, update the ShuttleController constructor call (around line 201):

Change:
```ts
this.shuttleController = new ShuttleController(this.inputManager, MAP_PHYSICS)
```
To:
```ts
this.shuttleController = new ShuttleController(this.inputManager, MAP_PHYSICS, MAP_GRAVITY_CONFIG)
```

After `this.shuttleController.setSpaceTimeGrid(this.spaceTimeGrid)` (line 202), add gravity well registration:

```ts
// Register gravity wells — Sun + all planets
if (this.sunController) {
  this.shuttleController.addGravityWell(makeGravityWell(this.sunController, MAP_GRAVITY_CONFIG))
}
for (const controller of this.planetControllers) {
  this.shuttleController.addGravityWell(makeGravityWell(controller, MAP_GRAVITY_CONFIG))
}
```

- [ ] **Step 4: Set onDeath callback**

After the gravity well registration, add:

```ts
this.shuttleController.onDeath = () => {
  // Placeholder — orbit-capture system will handle respawn into Earth orbit
  console.log('[MapView] shuttle died to gravity')
}
```

- [ ] **Step 5: Fix yRecovery to use setIgnoreGridY**

In the `tick()` method, find the yRecovery block (around line 384-393). Change:

```ts
// After slingshot, lerp Y back to 0
if (this.yRecovery && this.shuttleController) {
  const y = this.shuttleController.group.position.y
  if (Math.abs(y) < 0.01) {
    this.shuttleController.group.position.y = 0
    this.yRecovery = false
  } else {
    this.shuttleController.group.position.y = y * (1 - 3 * dt)
  }
}
```

To:

```ts
// After slingshot, lerp Y back to 0 — suppress grid Y until recovery completes
if (this.yRecovery && this.shuttleController) {
  this.shuttleController.setIgnoreGridY(true)
  const y = this.shuttleController.group.position.y
  if (Math.abs(y) < 0.01) {
    this.shuttleController.group.position.y = 0
    this.yRecovery = false
    this.shuttleController.setIgnoreGridY(false)
  } else {
    this.shuttleController.group.position.y = y * (1 - 3 * dt)
  }
}
```

- [ ] **Step 6: Run type-check and dev server smoke test**

Run: `bun run type-check`
Expected: No errors

Run: `bun dev`
Expected: Map view loads, shuttle is pulled by gravity toward Sun, follows spacetime grid surface, dies when crossing event horizon.

- [ ] **Step 7: Commit**

```bash
git add src/views/MapViewController.ts
git commit -m "feat(map): wire gravity wells, grid Y follow, death callback, fix yRecovery"
```

---

### Task 4: GravityDistortionPass (post-processing shader)

**Files:**
- Create: `src/three/GravityDistortionPass.ts`

- [ ] **Step 1: Create the shader pass**

Create `src/three/GravityDistortionPass.ts`:

```ts
/**
 * Post-processing pass for gravitational lensing and chromatic aberration.
 *
 * Warps UV coordinates toward a gravity source's screen position (lensing)
 * and separates RGB channels (chromatic aberration). Both effects scale
 * with a `proximity` uniform (0 = safe, 1 = event horizon).
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-map-gravity-death-design.md
 */
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import * as THREE from 'three'

/** Threshold below which effects are invisible — skip shader work. */
const PROXIMITY_EPSILON = 0.001

/**
 * Creates a configured ShaderPass for gravity distortion.
 * Caller updates `pass.uniforms.proximity.value` and
 * `pass.uniforms.sourceUV.value` each frame.
 *
 * @param lensStrength - Maximum UV warp magnitude at proximity=1
 * @param chromStrength - Maximum chromatic aberration offset at proximity=1
 */
export function createGravityDistortionPass(
  lensStrength: number,
  chromStrength: number,
): ShaderPass {
  const shader = {
    uniforms: {
      tDiffuse: { value: null as THREE.Texture | null },
      proximity: { value: 0 },
      sourceUV: { value: new THREE.Vector2(0.5, 0.5) },
      lensStrength: { value: lensStrength },
      chromStrength: { value: chromStrength },
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
      uniform float proximity;
      uniform vec2 sourceUV;
      uniform float lensStrength;
      uniform float chromStrength;
      varying vec2 vUv;

      void main() {
        if (proximity < ${PROXIMITY_EPSILON.toFixed(4)}) {
          gl_FragColor = texture2D(tDiffuse, vUv);
          return;
        }

        // --- Gravitational lensing ---
        // Pull UVs toward the gravity source position on screen
        vec2 toSource = sourceUV - vUv;
        float dist = length(toSource);
        // Strength falls off with distance from source, scales with proximity
        float lensAmount = proximity * lensStrength / (dist + 0.1);
        vec2 lensedUV = vUv + toSource * lensAmount;

        // --- Chromatic aberration ---
        // Kicks in harder at high proximity (quadratic ramp)
        float chromAmount = proximity * proximity * chromStrength;
        vec2 chromDir = normalize(vUv - vec2(0.5));

        float r = texture2D(tDiffuse, lensedUV + chromDir * chromAmount).r;
        float g = texture2D(tDiffuse, lensedUV).g;
        float b = texture2D(tDiffuse, lensedUV - chromDir * chromAmount).b;

        gl_FragColor = vec4(r, g, b, 1.0);
      }
    `,
  }

  return new ShaderPass(shader)
}
```

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/three/GravityDistortionPass.ts
git commit -m "feat(gravity): gravitational lensing + chromatic aberration shader pass"
```

---

### Task 5: GravityWarning.vue HUD component

**Files:**
- Create: `src/components/GravityWarning.vue`
- Modify: `src/assets/css/main.css`

- [ ] **Step 1: Define the gravity warning state type**

Add to the bottom of `src/lib/ShuttleTelemetry.ts`:

```ts
/** Gravity danger state pushed to the HUD each frame. */
export interface GravityWarningState {
  /** 0 = safe (outside influence), 1 = at event horizon */
  proximity: number
  /** Name of the nearest massive body, or null if none */
  bodyName: string | null
  /** Whether the warning is visible (proximity > 0) */
  visible: boolean
}
```

- [ ] **Step 2: Add Tailwind utility classes for gravity warning**

Append to `src/assets/css/main.css`:

```css
.gravity-warning {
  @apply absolute top-12 left-1/2 -translate-x-1/2 text-center font-mono pointer-events-none;
  @apply transition-opacity duration-300;
}

.gravity-warning-caution {
  @apply text-yellow-400 text-xs opacity-60;
  text-shadow: 0 0 4px rgba(234, 179, 8, 0.4);
}

.gravity-warning-danger {
  @apply text-orange-400 text-sm font-bold;
  text-shadow: 0 0 6px rgba(251, 146, 60, 0.6);
  animation: gravity-pulse 1.2s ease-in-out infinite;
}

.gravity-warning-critical {
  @apply text-red-500 text-base font-bold;
  text-shadow: 0 0 8px rgba(239, 68, 68, 0.8);
  animation: gravity-pulse 0.5s ease-in-out infinite;
}

@keyframes gravity-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

- [ ] **Step 3: Create the GravityWarning component**

Create `src/components/GravityWarning.vue`:

```vue
<script setup lang='ts'>
import type { GravityWarningState } from '@/lib/ShuttleTelemetry'

const props = defineProps<{
  warning: GravityWarningState
}>()

/** Proximity tier thresholds. */
const CAUTION_THRESHOLD = 0
const DANGER_THRESHOLD = 0.3
const CRITICAL_THRESHOLD = 0.7

function tierClass(): string {
  if (props.warning.proximity >= CRITICAL_THRESHOLD) return 'gravity-warning-critical'
  if (props.warning.proximity >= DANGER_THRESHOLD) return 'gravity-warning-danger'
  return 'gravity-warning-caution'
}

function tierLabel(): string {
  if (props.warning.proximity >= CRITICAL_THRESHOLD) return 'CRITICAL'
  if (props.warning.proximity >= DANGER_THRESHOLD) return 'GRAVITY WARNING'
  return 'GRAVITATIONAL PULL'
}
</script>

<template>
  <div v-if="props.warning.visible" class="gravity-warning" :class="tierClass()">
    &#9888; {{ tierLabel() }} &mdash; {{ props.warning.bodyName }}
  </div>
</template>
```

- [ ] **Step 4: Run type-check**

Run: `bun run type-check`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/GravityWarning.vue src/assets/css/main.css src/lib/ShuttleTelemetry.ts
git commit -m "feat(gravity): GravityWarning HUD component with tiered proximity alerts"
```

---

### Task 6: Wire distortion pass and HUD warning into MapViewController

**Files:**
- Modify: `src/views/MapViewController.ts`
- Modify: `src/views/MapView.vue`

- [ ] **Step 1: Add distortion pass and proximity state to MapViewController**

In `src/views/MapViewController.ts`, add imports:

```ts
import { createGravityDistortionPass } from '@/three/GravityDistortionPass'
import { influenceRadius, eventHorizonRadius } from '@/lib/physics/gravity'
import type { GravityWarningState } from '@/lib/ShuttleTelemetry'
import type { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
```

Add instance fields (after the existing private fields around line 118):

```ts
private gravityPass: ShaderPass | null = null

/** Called each frame with gravity warning state for HUD. */
onGravityWarning: ((state: GravityWarningState) => void) | null = null
```

- [ ] **Step 2: Create and insert the distortion pass in init()**

In `init()`, after the bloom pass is set up via `createMapScene` and before the compositor tickable (around line 296), add:

```ts
// --- Gravity distortion post-processing ---
this.gravityPass = createGravityDistortionPass(
  mapGravityData.lensStrength,
  mapGravityData.chromStrength,
)
this.sceneObjects.composer.addPass(this.gravityPass)
```

- [ ] **Step 3: Add proximity calculation and uniform updates to tick()**

In the `tick()` method, after the orbit HUD state emission (around line 496) and before the closing brace, add:

```ts
// Gravity proximity — VFX distortion + HUD warning
// Only active in free flight (not during orbit capture)
if (this.shuttleController && this.gravityPass) {
  const orbitState = this.orbitSystem?.state ?? 'free'
  if (orbitState === 'free' && !this.shuttleController.isDead) {
    const px = this.shuttleController.position.x
    const pz = this.shuttleController.position.z
    let maxProximity = 0
    let nearestName: string | null = null

    // Check Sun
    if (this.sunController) {
      const prox = this.computeProximity(
        this.sunController.getWorldX(),
        this.sunController.getWorldZ(),
        this.sunController.mass,
        px, pz,
      )
      if (prox > maxProximity) {
        maxProximity = prox
        nearestName = 'Sun'
      }
    }

    // Check planets
    for (let i = 0; i < this.planetControllers.length; i++) {
      const c = this.planetControllers[i]!
      const prox = this.computeProximity(c.getWorldX(), c.getWorldZ(), c.mass, px, pz)
      if (prox > maxProximity) {
        maxProximity = prox
        nearestName = PLANETS[i]?.name ?? null
      }
    }

    // Update shader uniforms
    this.gravityPass.uniforms.proximity!.value = maxProximity
    if (maxProximity > 0 && this.vehicleCamera) {
      // Project nearest source to screen UV
      const sourceWorld = new THREE.Vector3(
        nearestName === 'Sun' ? this.sunController!.getWorldX()
          : this.planetControllers.find((_c, i) => PLANETS[i]?.name === nearestName)?.getWorldX() ?? 0,
        0,
        nearestName === 'Sun' ? this.sunController!.getWorldZ()
          : this.planetControllers.find((_c, i) => PLANETS[i]?.name === nearestName)?.getWorldZ() ?? 0,
      )
      const projected = sourceWorld.project(this.vehicleCamera.camera)
      this.gravityPass.uniforms.sourceUV!.value.set(
        (projected.x + 1) * 0.5,
        (projected.y + 1) * 0.5,
      )
    }

    // Emit HUD warning
    if (this.onGravityWarning) {
      this.onGravityWarning({
        proximity: maxProximity,
        bodyName: nearestName,
        visible: maxProximity > 0,
      })
    }
  } else {
    // Not in free state — clear effects
    this.gravityPass.uniforms.proximity!.value = 0
    if (this.onGravityWarning) {
      this.onGravityWarning({ proximity: 0, bodyName: null, visible: false })
    }
  }
}
```

- [ ] **Step 4: Add isDead getter to ShuttleController**

In `src/three/ShuttleController.ts`, the `isDead` field is currently private. Add a public getter:

```ts
/** Whether the shuttle is in the death animation. */
get dead(): boolean {
  return this.isDead
}
```

Then update the proximity check in MapViewController to use `this.shuttleController.dead` instead of `this.shuttleController.isDead`.

- [ ] **Step 5: Add computeProximity helper method**

Add a private method to `MapViewController`:

```ts
/**
 * Compute gravity proximity for a single source (0 = at influence edge, 1 = at event horizon).
 * Returns 0 if outside influence radius.
 */
private computeProximity(
  sourceX: number, sourceZ: number, mass: number,
  px: number, pz: number,
): number {
  const dx = sourceX - px
  const dz = sourceZ - pz
  const dist = Math.sqrt(dx * dx + dz * dz)
  const influence = influenceRadius(mass, MAP_GRAVITY_CONFIG)
  const horizon = eventHorizonRadius(mass, MAP_GRAVITY_CONFIG)
  if (dist >= influence) return 0
  return Math.min(1, 1 - (dist - horizon) / (influence - horizon))
}
```

- [ ] **Step 6: Wire GravityWarning into MapView.vue**

In `src/views/MapView.vue`, add the import and reactive state:

```vue
<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { MapViewController } from './MapViewController'
import ShuttleHud from '@/components/ShuttleHud.vue'
import OrbitPrompt from '@/components/OrbitPrompt.vue'
import GravityWarning from '@/components/GravityWarning.vue'
import type { ShuttleTelemetry, GravityWarningState } from '@/lib/ShuttleTelemetry'
import type { OrbitHudState } from '@/lib/orbitCapture'

// ... existing telemetry and orbitState ...

const gravityWarning = reactive<GravityWarningState>({
  proximity: 0,
  bodyName: null,
  visible: false,
})

onMounted(async () => {
  if (container.value) {
    viewController.onTelemetry = (t) => {
      Object.assign(telemetry, t)
    }
    viewController.onOrbitState = (s) => {
      Object.assign(orbitState, s)
    }
    viewController.onGravityWarning = (w) => {
      Object.assign(gravityWarning, w)
    }
    await viewController.init(container.value)
  }
})
```

In the template:

```vue
<template>
  <div ref="container" class="scene-container"></div>
  <ShuttleHud :telemetry="telemetry" />
  <OrbitPrompt :orbitState="orbitState" />
  <GravityWarning :warning="gravityWarning" />
</template>
```

- [ ] **Step 7: Run type-check and dev server smoke test**

Run: `bun run type-check`
Expected: No errors

Run: `bun dev`
Expected: Flying toward the Sun shows progressive screen distortion + "GRAVITATIONAL PULL — Sun" warning that escalates to "CRITICAL" near the event horizon.

- [ ] **Step 8: Commit**

```bash
git add src/views/MapViewController.ts src/views/MapView.vue src/three/ShuttleController.ts
git commit -m "feat(map): gravity distortion VFX and HUD warning wired to proximity"
```

---

### Task 7: Lint, type-check, and full test pass

**Files:** None (verification only)

- [ ] **Step 1: Run full type-check**

Run: `bun run type-check`
Expected: No errors

- [ ] **Step 2: Run linter**

Run: `bun lint`
Expected: No errors (new exports need TSDoc — add if missing)

- [ ] **Step 3: Run full test suite**

Run: `bun test:unit`
Expected: All tests pass, including the new gravity.spec.ts

- [ ] **Step 4: Fix any issues and commit**

If lint or type-check surfaces issues (missing TSDoc, etc.), fix and commit:

```bash
git add -A
git commit -m "chore: fix lint and type-check issues from map gravity work"
```
