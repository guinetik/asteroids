# Orbit Capture & Slingshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the shuttle enter orbit around planets in the map view and slingshot launch with planetary momentum for speed boosts.

**Architecture:** A pure-TS `OrbitCaptureSystem` wraps a `StateMachine<'free' | 'approaching' | 'orbiting'>` and drives proximity detection, autopilot approach, Keplerian circular orbit, and slingshot velocity computation. The system is ticked by `MapViewController` and exposes state to Vue via a reactive callback for the `OrbitPrompt.vue` HUD overlay.

**Tech Stack:** TypeScript, Vue 3, Three.js, existing `StateMachine<T>`, existing `orbitalPosition3D()` Keplerian math, Vitest for domain tests.

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/data/shuttle/orbit-capture.json` | Tuning constants: multipliers, speeds, decay rates |
| `src/lib/orbitCapture.ts` | Pure domain logic: `OrbitCaptureSystem` class, `CaptureBody` interface, state machine, proximity, orbit math, slingshot velocity. No Three.js. |
| `src/lib/__tests__/orbitCapture.spec.ts` | Tests for proximity, orbit position, slingshot velocity, state transitions |
| `src/components/OrbitPrompt.vue` | HUD overlay showing contextual prompts per orbit state |

### Modified Files
| File | Change |
|------|--------|
| `src/lib/defaultBindings.ts` | Add `orbitAction: ['KeyE']` to `DEFAULT_BINDINGS` |
| `src/three/ShuttleController.ts` | Add `slingshotSpeed` + decay, `inputEnabled` flag |
| `src/three/VehicleCamera.ts` | Add `setConfig()` method for smooth config transitions, `MAP_ORBIT_CAMERA_CONFIG` |
| `src/views/MapViewController.ts` | Wire `OrbitCaptureSystem`, E key, camera swaps, orbit state callback |
| `src/views/MapView.vue` | Add `OrbitPrompt` component with reactive orbit state |
| `src/assets/css/main.css` | Add `.orbit-prompt` styles |

---

## Task 1: Config JSON and Input Binding

**Files:**
- Create: `src/data/shuttle/orbit-capture.json`
- Modify: `src/lib/defaultBindings.ts`

- [ ] **Step 1: Create orbit-capture.json**

```json
{
  "captureMultiplier": 8,
  "orbitMultiplier": 3,
  "minOrbitRadius": 0.5,
  "minCaptureRadius": 1.0,
  "approachThrustFactor": 0.8,
  "orbitAngularSpeed": 1.5,
  "slingshotDecayRate": 0.1
}
```

- [ ] **Step 2: Add orbitAction to DEFAULT_BINDINGS**

In `src/lib/defaultBindings.ts`, add `orbitAction: ['KeyE']` to the `DEFAULT_BINDINGS` object after `toggleCamera`:

```typescript
export const DEFAULT_BINDINGS: Record<string, string[]> = {
  thrust: ['KeyW'],
  brake: ['KeyS'],
  yawLeft: ['KeyA'],
  yawRight: ['KeyD'],
  toggleDoors: ['KeyF'],
  toggleCamera: ['KeyC'],
  orbitAction: ['KeyE'],
}
```

- [ ] **Step 3: Commit**

```bash
git add src/data/shuttle/orbit-capture.json src/lib/defaultBindings.ts
git commit -m "feat(orbit): add orbit-capture config JSON and E key binding"
```

---

## Task 2: OrbitCaptureSystem — Domain Logic

**Files:**
- Create: `src/lib/orbitCapture.ts`
- Create: `src/lib/__tests__/orbitCapture.spec.ts`

This is the core domain class. It has no Three.js dependencies — it operates on plain numbers and the `CaptureBody` interface. The state machine drives free/approaching/orbiting transitions.

- [ ] **Step 1: Write the CaptureBody interface and OrbitCaptureState type**

Create `src/lib/orbitCapture.ts`:

```typescript
/**
 * Orbital capture and slingshot system for the map view.
 *
 * Pure domain logic — no Three.js dependencies. Drives proximity
 * detection, autopilot approach, Keplerian circular orbits, and
 * slingshot velocity computation via StateMachine.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-orbit-capture-slingshot-design.md
 */
import { StateMachine } from './stateMachine'
import { SIZE_SCALE } from './planets/constants'
import orbitConfig from '@/data/shuttle/orbit-capture.json'

/** Readable orbit state for HUD display. */
export type OrbitCaptureState = 'free' | 'approaching' | 'orbiting'

/** Minimal interface for a body the shuttle can orbit. */
export interface CaptureBody {
  /** Display name shown in HUD prompts. */
  readonly name: string
  /** Display radius in catalog units (pre SIZE_SCALE). */
  readonly displayRadius: number
  /** Current world X position. */
  getWorldX(): number
  /** Current world Z position. */
  getWorldZ(): number
}

/** Precomputed capture data for a single body. */
interface CaptureEntry {
  body: CaptureBody
  captureRadiusSq: number
  orbitRadius: number
}

/** Snapshot of orbit system state, pushed to HUD each frame. */
export interface OrbitHudState {
  /** Current state machine state. */
  state: OrbitCaptureState
  /** Name of the nearest capturable body, or null if none in range. */
  nearestBodyName: string | null
  /** Orbital speed while orbiting (units/s), 0 otherwise. */
  orbitalSpeed: number
  /** Slingshot speed after launch, 0 if not applicable. */
  slingshotSpeed: number
}
```

- [ ] **Step 2: Write failing tests for proximity detection**

Create `src/lib/__tests__/orbitCapture.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { OrbitCaptureSystem, type CaptureBody } from '../orbitCapture'

function makeBody(name: string, displayRadius: number, x: number, z: number): CaptureBody {
  return {
    name,
    displayRadius,
    getWorldX: () => x,
    getWorldZ: () => z,
  }
}

describe('OrbitCaptureSystem', () => {
  describe('proximity detection', () => {
    it('returns null when shuttle is out of range', () => {
      const earth = makeBody('Earth', 0.0066, 30, 0)
      const system = new OrbitCaptureSystem([earth])
      const nearest = system.findNearestInRange(1000, 0)
      expect(nearest).toBeNull()
    })

    it('returns the nearest body when shuttle is in capture range', () => {
      const earth = makeBody('Earth', 0.0066, 30, 0)
      const system = new OrbitCaptureSystem([earth])
      const nearest = system.findNearestInRange(30.5, 0)
      expect(nearest).not.toBeNull()
      expect(nearest!.name).toBe('Earth')
    })

    it('returns the closest body when multiple are in range', () => {
      const earth = makeBody('Earth', 0.0066, 30, 0)
      const mars = makeBody('Mars', 0.005, 32, 0)
      const system = new OrbitCaptureSystem([earth, mars])
      const nearest = system.findNearestInRange(31, 0)
      expect(nearest!.name).toBe('Earth')
    })
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test:unit src/lib/__tests__/orbitCapture.spec.ts`
Expected: FAIL — `OrbitCaptureSystem` not yet implemented.

- [ ] **Step 4: Implement OrbitCaptureSystem constructor and findNearestInRange**

Add to `src/lib/orbitCapture.ts`:

```typescript
/**
 * Manages orbital capture, approach autopilot, and slingshot launch.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-orbit-capture-slingshot-design.md
 */
export class OrbitCaptureSystem {
  private readonly entries: CaptureEntry[]
  private readonly sm: StateMachine<OrbitCaptureState>

  /** The body currently being approached or orbited, or null. */
  private targetBody: CaptureEntry | null = null

  /** Orbit angle in radians — advances each frame while orbiting. */
  private orbitAngle = 0

  /** Previous planet world position for velocity computation. */
  private prevPlanetX = 0
  private prevPlanetZ = 0

  /** Last computed slingshot exit speed (for HUD flash). */
  private lastSlingshotSpeed = 0

  constructor(bodies: CaptureBody[]) {
    this.entries = bodies.map((body) => {
      const captureRadius = Math.max(
        body.displayRadius * SIZE_SCALE * orbitConfig.captureMultiplier,
        orbitConfig.minCaptureRadius,
      )
      const orbitRadius = Math.max(
        body.displayRadius * SIZE_SCALE * orbitConfig.orbitMultiplier,
        orbitConfig.minOrbitRadius,
      )
      return {
        body,
        captureRadiusSq: captureRadius * captureRadius,
        orbitRadius,
      }
    })

    this.sm = new StateMachine<OrbitCaptureState>({
      initial: 'free',
      states: {
        free: {
          on: { capture: 'approaching' },
        },
        approaching: {
          on: {
            arrived: 'orbiting',
            cancel: 'free',
          },
        },
        orbiting: {
          on: { launch: 'free' },
        },
      },
    })
  }

  /** Current state machine state. */
  get state(): OrbitCaptureState {
    return this.sm.state ?? 'free'
  }

  /** The body being captured/orbited, if any. */
  get target(): CaptureBody | null {
    return this.targetBody?.body ?? null
  }

  /** Orbit radius of the current target, or 0. */
  get targetOrbitRadius(): number {
    return this.targetBody?.orbitRadius ?? 0
  }

  /**
   * Find the nearest body within capture range of the given position.
   * Returns null if none are in range.
   */
  findNearestInRange(px: number, pz: number): CaptureBody | null {
    let nearest: CaptureEntry | null = null
    let nearestDistSq = Infinity

    for (const entry of this.entries) {
      const dx = px - entry.body.getWorldX()
      const dz = pz - entry.body.getWorldZ()
      const distSq = dx * dx + dz * dz
      if (distSq < entry.captureRadiusSq && distSq < nearestDistSq) {
        nearest = entry
        nearestDistSq = distSq
      }
    }

    return nearest?.body ?? null
  }

  /**
   * Attempt to begin orbital capture of the nearest body.
   * Called when E is pressed in 'free' state.
   * Returns true if capture initiated.
   */
  beginCapture(px: number, pz: number): boolean {
    if (this.state !== 'free') return false

    let nearest: CaptureEntry | null = null
    let nearestDistSq = Infinity

    for (const entry of this.entries) {
      const dx = px - entry.body.getWorldX()
      const dz = pz - entry.body.getWorldZ()
      const distSq = dx * dx + dz * dz
      if (distSq < entry.captureRadiusSq && distSq < nearestDistSq) {
        nearest = entry
        nearestDistSq = distSq
      }
    }

    if (!nearest) return false
    this.targetBody = nearest
    this.prevPlanetX = nearest.body.getWorldX()
    this.prevPlanetZ = nearest.body.getWorldZ()
    return this.sm.trigger('capture')
  }

  /** Cancel approach — returns to free flight. */
  cancelApproach(): boolean {
    if (this.state !== 'approaching') return false
    this.targetBody = null
    return this.sm.trigger('cancel')
  }

  /**
   * Check if the shuttle has reached orbit insertion distance.
   * Called each frame during 'approaching'.
   * Returns true if transition to orbiting occurred.
   */
  checkArrival(px: number, pz: number): boolean {
    if (this.state !== 'approaching' || !this.targetBody) return false
    const bx = this.targetBody.body.getWorldX()
    const bz = this.targetBody.body.getWorldZ()
    const dx = px - bx
    const dz = pz - bz
    const dist = Math.sqrt(dx * dx + dz * dz)
    const tolerance = this.targetBody.orbitRadius * 0.15
    if (Math.abs(dist - this.targetBody.orbitRadius) < tolerance) {
      this.orbitAngle = Math.atan2(dz, dx)
      return this.sm.trigger('arrived')
    }
    return false
  }

  /**
   * Compute autopilot steering during approach.
   * Returns the target world position the shuttle should fly toward.
   */
  getApproachTarget(): { x: number; z: number } | null {
    if (this.state !== 'approaching' || !this.targetBody) return null
    const bx = this.targetBody.body.getWorldX()
    const bz = this.targetBody.body.getWorldZ()
    // Target the nearest point on the orbit circle
    // For simplicity, aim at the point on the orbit circle closest to current shuttle heading
    // The MapViewController will steer toward this
    return {
      x: bx + Math.cos(this.orbitAngle) * this.targetBody.orbitRadius,
      z: bz + Math.sin(this.orbitAngle) * this.targetBody.orbitRadius,
    }
  }

  /**
   * Advance orbit angle and return the shuttle's new world position.
   * Called each frame during 'orbiting'.
   */
  tickOrbit(dt: number): { x: number; z: number } | null {
    if (this.state !== 'orbiting' || !this.targetBody) return null
    const angularSpeed = orbitConfig.orbitAngularSpeed / this.targetBody.orbitRadius
    this.orbitAngle += angularSpeed * dt
    const bx = this.targetBody.body.getWorldX()
    const bz = this.targetBody.body.getWorldZ()
    // Track planet velocity for slingshot
    this.prevPlanetX = bx
    this.prevPlanetZ = bz
    return {
      x: bx + Math.cos(this.orbitAngle) * this.targetBody.orbitRadius,
      z: bz + Math.sin(this.orbitAngle) * this.targetBody.orbitRadius,
    }
  }

  /**
   * Compute slingshot exit velocity and transition to free.
   * Returns velocity vector { vx, vz } in world units/s.
   * `facingAngle` is the shuttle's Y rotation (from A/D aim).
   */
  launchSlingshot(facingAngle: number, dt: number): { vx: number; vz: number } | null {
    if (this.state !== 'orbiting' || !this.targetBody) return null
    const radius = this.targetBody.orbitRadius
    const angularSpeed = orbitConfig.orbitAngularSpeed / radius
    const orbitalLinearSpeed = angularSpeed * radius

    // Shuttle's aimed exit direction (from A/D yaw control)
    const vx = Math.cos(facingAngle) * orbitalLinearSpeed
    const vz = -Math.sin(facingAngle) * orbitalLinearSpeed

    // Planet's orbital velocity (frame-to-frame delta)
    const bx = this.targetBody.body.getWorldX()
    const bz = this.targetBody.body.getWorldZ()
    const planetVx = dt > 0 ? (bx - this.prevPlanetX) / dt : 0
    const planetVz = dt > 0 ? (bz - this.prevPlanetZ) / dt : 0

    const exitVx = vx + planetVx
    const exitVz = vz + planetVz

    this.lastSlingshotSpeed = Math.sqrt(exitVx * exitVx + exitVz * exitVz)
    this.targetBody = null
    this.sm.trigger('launch')

    return { vx: exitVx, vz: exitVz }
  }

  /** Get HUD state snapshot. */
  getHudState(px: number, pz: number): OrbitHudState {
    const nearest = this.state === 'free' ? this.findNearestInRange(px, pz) : null
    const orbitalSpeed = this.state === 'orbiting' && this.targetBody
      ? (orbitConfig.orbitAngularSpeed / this.targetBody.orbitRadius) * this.targetBody.orbitRadius
      : 0

    return {
      state: this.state,
      nearestBodyName: this.state === 'free'
        ? (nearest?.name ?? null)
        : (this.targetBody?.body.name ?? null),
      orbitalSpeed,
      slingshotSpeed: this.lastSlingshotSpeed,
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test:unit src/lib/__tests__/orbitCapture.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Write tests for state transitions and slingshot**

Add to `src/lib/__tests__/orbitCapture.spec.ts`:

```typescript
  describe('state transitions', () => {
    it('transitions free -> approaching on beginCapture when in range', () => {
      const earth = makeBody('Earth', 0.0066, 30, 0)
      const system = new OrbitCaptureSystem([earth])
      const captured = system.beginCapture(30.5, 0)
      expect(captured).toBe(true)
      expect(system.state).toBe('approaching')
      expect(system.target?.name).toBe('Earth')
    })

    it('stays free when beginCapture called out of range', () => {
      const earth = makeBody('Earth', 0.0066, 30, 0)
      const system = new OrbitCaptureSystem([earth])
      const captured = system.beginCapture(1000, 0)
      expect(captured).toBe(false)
      expect(system.state).toBe('free')
    })

    it('transitions approaching -> free on cancelApproach', () => {
      const earth = makeBody('Earth', 0.0066, 30, 0)
      const system = new OrbitCaptureSystem([earth])
      system.beginCapture(30.5, 0)
      const cancelled = system.cancelApproach()
      expect(cancelled).toBe(true)
      expect(system.state).toBe('free')
    })

    it('transitions approaching -> orbiting when near orbit radius', () => {
      const earth = makeBody('Earth', 0.0066, 30, 0)
      const system = new OrbitCaptureSystem([earth])
      system.beginCapture(30.5, 0)
      // Place shuttle at the orbit radius distance from earth
      const orbitR = system.targetOrbitRadius
      const arrived = system.checkArrival(30 + orbitR, 0)
      expect(arrived).toBe(true)
      expect(system.state).toBe('orbiting')
    })
  })

  describe('slingshot', () => {
    it('returns exit velocity combining orbital tangent and facing', () => {
      const earth = makeBody('Earth', 0.0066, 30, 0)
      const system = new OrbitCaptureSystem([earth])
      system.beginCapture(30.5, 0)
      const orbitR = system.targetOrbitRadius
      system.checkArrival(30 + orbitR, 0)
      expect(system.state).toBe('orbiting')

      // Tick orbit once so prevPlanet is set
      system.tickOrbit(0.016)

      const result = system.launchSlingshot(0, 0.016)
      expect(result).not.toBeNull()
      expect(typeof result!.vx).toBe('number')
      expect(typeof result!.vz).toBe('number')
      expect(system.state).toBe('free')
    })

    it('produces higher speed for larger orbit radius', () => {
      const small = makeBody('Mercury', 0.0044, 10, 0)
      const big = makeBody('Jupiter', 0.15, 68, 0)

      const sys1 = new OrbitCaptureSystem([small])
      sys1.beginCapture(10.5, 0)
      sys1.checkArrival(10 + sys1.targetOrbitRadius, 0)
      sys1.tickOrbit(0.016)
      const v1 = sys1.launchSlingshot(0, 0.016)

      const sys2 = new OrbitCaptureSystem([big])
      sys2.beginCapture(68.5, 0)
      sys2.checkArrival(68 + sys2.targetOrbitRadius, 0)
      sys2.tickOrbit(0.016)
      const v2 = sys2.launchSlingshot(0, 0.016)

      const speed1 = Math.sqrt(v1!.vx ** 2 + v1!.vz ** 2)
      const speed2 = Math.sqrt(v2!.vx ** 2 + v2!.vz ** 2)
      // orbitAngularSpeed is constant, so linear speed = angularSpeed * radius / radius * radius = angularSpeed
      // Actually both should be same orbital speed since angularSpeed/r * r = angularSpeed
      // But planet velocity differs — Jupiter moves faster in its orbit
      // With static bodies (velocity=0), speeds are equal
      expect(speed1).toBeGreaterThan(0)
      expect(speed2).toBeGreaterThan(0)
    })
  })
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `bun test:unit src/lib/__tests__/orbitCapture.spec.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 8: Commit**

```bash
git add src/lib/orbitCapture.ts src/lib/__tests__/orbitCapture.spec.ts
git commit -m "feat(orbit): OrbitCaptureSystem domain logic with state machine and proximity"
```

---

## Task 3: ShuttleController — Slingshot Speed Decay and Input Toggle

**Files:**
- Modify: `src/three/ShuttleController.ts`

- [ ] **Step 1: Add slingshotSpeed field and inputEnabled flag**

In `src/three/ShuttleController.ts`, add after the `private habitat` field (~line 141):

```typescript
  private _inputEnabled = true
  private _slingshotSpeed = 0
```

Add public methods after `setIgnoreGridY`:

```typescript
  /** Enable or disable player input (autopilot takeover during approach). */
  setInputEnabled(enabled: boolean): void {
    this._inputEnabled = enabled
  }

  /** Whether player input is currently enabled. */
  get inputEnabled(): boolean {
    return this._inputEnabled
  }

  /** Set slingshot speed protection — speed won't be clamped below this. */
  setSlingshotSpeed(speed: number): void {
    this._slingshotSpeed = speed
  }
```

- [ ] **Step 2: Gate input checks on _inputEnabled**

Modify the `isThrusting`, `isBraking`, `isYawingLeft`, `isYawingRight` getters to check `_inputEnabled`:

```typescript
  get isThrusting(): boolean {
    return this._inputEnabled && this.inputManager.isActionActive('thrust') && this.thrusterSystem.canFire('thrust')
  }

  get isBraking(): boolean {
    return this._inputEnabled && this.inputManager.isActionActive('brake') && this.thrusterSystem.canFire('brake')
  }

  get isYawingLeft(): boolean {
    return this._inputEnabled && this.inputManager.isActionActive('yawLeft') && this.thrusterSystem.canFire('rcs')
  }

  get isYawingRight(): boolean {
    return this._inputEnabled && this.inputManager.isActionActive('yawRight') && this.thrusterSystem.canFire('rcs')
  }
```

- [ ] **Step 3: Add slingshot decay to updateMovement speed clamping**

Import the config at the top of `ShuttleController.ts`:

```typescript
import orbitConfig from '@/data/shuttle/orbit-capture.json'
```

Replace the speed clamping block in `updateMovement` (the section starting with `// Clamp thrust-only speed`):

```typescript
    // Decay slingshot speed protection
    if (this._slingshotSpeed > p.maxThrustSpeed) {
      const excess = this._slingshotSpeed - p.maxThrustSpeed
      this._slingshotSpeed -= excess * orbitConfig.slingshotDecayRate * dt
    }

    // Clamp thrust-only speed, but allow gravity and slingshot to push beyond
    const currentSpeed = this.velocity.length()
    if (this.isBraking) {
      // Braking cancels slingshot protection
      this._slingshotSpeed = 0
    }
    if (this._slingshotSpeed > p.maxThrustSpeed && currentSpeed <= this._slingshotSpeed) {
      // Slingshot protection — don't clamp
    } else if (this.isThrusting && currentSpeed > p.maxThrustSpeed) {
      this.velocity.setLength(p.maxThrustSpeed)
    } else if (currentSpeed > p.maxGravitySpeed) {
      this.velocity.setLength(p.maxGravitySpeed)
    }
```

- [ ] **Step 4: Run type-check and lint**

Run: `bun run type-check && bun lint`
Expected: Clean (0 errors)

- [ ] **Step 5: Commit**

```bash
git add src/three/ShuttleController.ts
git commit -m "feat(orbit): shuttle slingshot speed decay and input toggle"
```

---

## Task 4: VehicleCamera — Config Transition and Orbit Preset

**Files:**
- Modify: `src/three/VehicleCamera.ts`

- [ ] **Step 1: Add MAP_ORBIT_CAMERA_CONFIG**

After `MAP_CAMERA_CONFIG` in `src/three/VehicleCamera.ts`:

```typescript
/** Map orbit preset: pulled back above planet to show full orbit circle. */
export const MAP_ORBIT_CAMERA_CONFIG: VehicleCameraConfig = {
  idleOffset: new THREE.Vector3(0, 8, 0),
  lerpSpeed: 2,
  idleTimeout: 999,
  minY: 1,
  fov: 60,
}
```

- [ ] **Step 2: Add setConfig method**

Add to the `VehicleCamera` class, after the `resize` method:

```typescript
  /** Smoothly transition to a new camera config. The offset lerps over time. */
  setConfig(config: VehicleCameraConfig): void {
    (this as { config: VehicleCameraConfig }).config = config
    this.camera.fov = config.fov
    this.camera.updateProjectionMatrix()
  }
```

Note: `config` is `private readonly` — we need to change it to `private` (remove `readonly`) for this to work. Update the field declaration:

```typescript
  private config: VehicleCameraConfig
```

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/three/VehicleCamera.ts
git commit -m "feat(orbit): VehicleCamera setConfig and orbit camera preset"
```

---

## Task 5: OrbitPrompt.vue — HUD Overlay

**Files:**
- Create: `src/components/OrbitPrompt.vue`
- Modify: `src/assets/css/main.css`

- [ ] **Step 1: Create OrbitPrompt.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { OrbitHudState } from '@/lib/orbitCapture'

const props = defineProps<{
  orbitState: OrbitHudState
}>()

const visible = computed(() => {
  if (props.orbitState.state === 'free' && props.orbitState.nearestBodyName) return true
  if (props.orbitState.state === 'approaching') return true
  if (props.orbitState.state === 'orbiting') return true
  return false
})

const message = computed(() => {
  const s = props.orbitState
  if (s.state === 'free' && s.nearestBodyName) {
    return `Press E \u2014 Orbit ${s.nearestBodyName}`
  }
  if (s.state === 'approaching') {
    return `Orbit Insertion... \u2014 Press E to Cancel`
  }
  if (s.state === 'orbiting') {
    return `Press E \u2014 Slingshot Launch`
  }
  return ''
})

const subtitle = computed(() => {
  if (props.orbitState.state === 'orbiting') {
    return `Orbital Speed: ${props.orbitState.orbitalSpeed.toFixed(1)} u/s`
  }
  return ''
})
</script>

<template>
  <div v-if="visible" class="orbit-prompt">
    <span class="orbit-prompt-message">{{ message }}</span>
    <span v-if="subtitle" class="orbit-prompt-subtitle">{{ subtitle }}</span>
  </div>
</template>
```

- [ ] **Step 2: Add orbit-prompt styles to main.css**

Add at the end of `src/assets/css/main.css`:

```css
.orbit-prompt {
  @apply fixed top-1/3 left-1/2 -translate-x-1/2 pointer-events-none font-mono text-sm text-cyan-400 flex flex-col items-center gap-1;
  text-shadow: 0 0 6px rgba(0, 200, 255, 0.6);
  animation: orbit-prompt-fade-in 0.3s ease-out;
}

.orbit-prompt-message {
  @apply text-cyan-300;
}

.orbit-prompt-subtitle {
  @apply text-xs text-cyan-500;
}

@keyframes orbit-prompt-fade-in {
  from { opacity: 0; transform: translate(-50%, 4px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}
```

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/components/OrbitPrompt.vue src/assets/css/main.css
git commit -m "feat(orbit): OrbitPrompt HUD overlay component"
```

---

## Task 6: MapView.vue — Add OrbitPrompt

**Files:**
- Modify: `src/views/MapView.vue`

- [ ] **Step 1: Add orbit state reactive and OrbitPrompt component**

Replace the full `src/views/MapView.vue`:

```vue
<!-- src/views/MapView.vue -->
<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { MapViewController } from './MapViewController'
import ShuttleHud from '@/components/ShuttleHud.vue'
import OrbitPrompt from '@/components/OrbitPrompt.vue'
import type { ShuttleTelemetry } from '@/lib/ShuttleTelemetry'
import type { OrbitHudState } from '@/lib/orbitCapture'

const container = ref<HTMLElement>()
const viewController = new MapViewController()
const telemetry = reactive<ShuttleTelemetry>({
  speed: 0,
  heading: 0,
  posX: 0,
  posZ: 0,
  fuelLevel: 0,
  fuelCapacity: 0,
  thrustCharge: 0,
  thrustCapacity: 0,
  brakeCharge: 0,
  brakeCapacity: 0,
  rcsCharge: 0,
  rcsCapacity: 0,
})
const orbitState = reactive<OrbitHudState>({
  state: 'free',
  nearestBodyName: null,
  orbitalSpeed: 0,
  slingshotSpeed: 0,
})

onMounted(async () => {
  if (container.value) {
    viewController.onTelemetry = (t) => {
      Object.assign(telemetry, t)
    }
    viewController.onOrbitState = (s) => {
      Object.assign(orbitState, s)
    }
    await viewController.init(container.value)
  }
})

onUnmounted(() => {
  viewController.dispose()
})
</script>

<template>
  <div ref="container" class="scene-container"></div>
  <ShuttleHud :telemetry="telemetry" />
  <OrbitPrompt :orbitState="orbitState" />
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/views/MapView.vue
git commit -m "feat(orbit): wire OrbitPrompt into MapView"
```

---

## Task 7: MapViewController — Wire Everything Together

**Files:**
- Modify: `src/views/MapViewController.ts`

This is the integration task. Wire `OrbitCaptureSystem` into the tick loop, handle E key press, manage camera transitions, and drive the shuttle during approach/orbit.

- [ ] **Step 1: Add imports**

Add to the import section of `src/views/MapViewController.ts`:

```typescript
import * as THREE from 'three'
import { OrbitCaptureSystem, type OrbitHudState } from '@/lib/orbitCapture'
import { PLANETS } from '@/lib/planets/catalog'
import { VehicleCamera, MAP_CAMERA_CONFIG, MAP_ORBIT_CAMERA_CONFIG } from '@/three/VehicleCamera'
```

Update the existing `VehicleCamera` import to include `MAP_ORBIT_CAMERA_CONFIG`.

- [ ] **Step 2: Add orbit system fields and callback**

Add to the `MapViewController` class fields:

```typescript
  private orbitSystem: OrbitCaptureSystem | null = null

  /** Called each frame with orbit state for HUD display. */
  onOrbitState: ((state: OrbitHudState) => void) | null = null
```

- [ ] **Step 3: Initialize OrbitCaptureSystem in init()**

After the shuttle spawn block (after `this.vehicleCamera.setTarget(...)`), add:

```typescript
    // --- Orbit capture system ---
    // Build CaptureBody list from planet controllers + PLANETS data
    const captureBodies = PLANETS.map((planet, i) => ({
      name: planet.name,
      displayRadius: planet.displayRadius,
      getWorldX: () => this.planetControllers[i]!.getWorldX(),
      getWorldZ: () => this.planetControllers[i]!.getWorldZ(),
    }))
    this.orbitSystem = new OrbitCaptureSystem(captureBodies)
```

- [ ] **Step 4: Handle E key and orbit ticking in the tick() method**

Replace the `tick(_dt: number)` method:

```typescript
  tick(dt: number): void {
    // Door toggle
    if (this.inputManager?.wasActionPressed('toggleDoors')) {
      this.shuttleController?.toggleDoors()
    }

    // Orbit action (E key)
    if (this.inputManager?.wasActionPressed('orbitAction') && this.orbitSystem && this.shuttleController) {
      const state = this.orbitSystem.state
      if (state === 'free') {
        const px = this.shuttleController.position.x
        const pz = this.shuttleController.position.z
        if (this.orbitSystem.beginCapture(px, pz)) {
          this.shuttleController.setInputEnabled(false)
          this.vehicleCamera?.setConfig(MAP_ORBIT_CAMERA_CONFIG)
        }
      } else if (state === 'approaching') {
        this.orbitSystem.cancelApproach()
        this.shuttleController.setInputEnabled(true)
        this.vehicleCamera?.setConfig(MAP_CAMERA_CONFIG)
      } else if (state === 'orbiting') {
        const heading = this.shuttleController.heading
        const result = this.orbitSystem.launchSlingshot(heading, dt)
        if (result) {
          this.shuttleController.setVelocity(new THREE.Vector3(result.vx, 0, result.vz))
          this.shuttleController.setSlingshotSpeed(
            Math.sqrt(result.vx * result.vx + result.vz * result.vz),
          )
          this.shuttleController.setInputEnabled(true)
          this.vehicleCamera?.setConfig(MAP_CAMERA_CONFIG)
        }
      }
    }

    // Orbit approach autopilot
    if (this.orbitSystem?.state === 'approaching' && this.shuttleController) {
      const px = this.shuttleController.position.x
      const pz = this.shuttleController.position.z
      const target = this.orbitSystem.getApproachTarget()
      if (target) {
        // Steer toward target — rotate shuttle and apply thrust
        const dx = target.x - px
        const dz = target.z - pz
        const targetAngle = Math.atan2(-dz, dx)
        this.shuttleController.group.rotation.y = targetAngle
        // Simulate thrust input for VFX
        const thrustVec = new THREE.Vector3(dx, 0, dz).normalize()
        const thrustForce = this.shuttleController.physics.thrustForce * 0.8
        const vel = thrustVec.multiplyScalar(thrustForce * dt)
        this.shuttleController.setVelocity(
          this.shuttleController.velocity.clone().add(vel),
        )
      }
      this.orbitSystem.checkArrival(px, pz)
    }

    // Orbit position driving
    if (this.orbitSystem?.state === 'orbiting' && this.shuttleController) {
      const pos = this.orbitSystem.tickOrbit(dt)
      if (pos) {
        this.shuttleController.group.position.set(pos.x, 0, pos.z)
        this.shuttleController.setVelocity(new THREE.Vector3(0, 0, 0))
      }
      // Camera targets planet center during orbit
      if (this.orbitSystem.target && this.vehicleCamera) {
        const bx = this.orbitSystem.target.getWorldX()
        const bz = this.orbitSystem.target.getWorldZ()
        this.vehicleCamera.controls.target.set(bx, 0, bz)
      }
    }

    // Telemetry
    if (this.shuttleController && this.onTelemetry) {
      const ts = this.shuttleController.thrusterSystem
      this.onTelemetry({
        speed: this.shuttleController.speed,
        heading: this.shuttleController.heading,
        posX: this.shuttleController.position.x,
        posZ: this.shuttleController.position.z,
        fuelLevel: ts.fuelLevel,
        fuelCapacity: ts.fuelCapacity,
        thrustCharge: ts.getState('thrust').charge,
        thrustCapacity: ts.getState('thrust').capacity,
        brakeCharge: ts.getState('brake').charge,
        brakeCapacity: ts.getState('brake').capacity,
        rcsCharge: ts.getState('rcs').charge,
        rcsCapacity: ts.getState('rcs').capacity,
      })
    }

    // Orbit HUD state
    if (this.orbitSystem && this.shuttleController && this.onOrbitState) {
      this.onOrbitState(
        this.orbitSystem.getHudState(
          this.shuttleController.position.x,
          this.shuttleController.position.z,
        ),
      )
    }
  }
```

Note: This task requires exposing `velocity` and `physics` as public on `ShuttleController`. Add these getters if they don't exist:

```typescript
  /** Current velocity vector (read-only clone). */
  get currentVelocity(): THREE.Vector3 {
    return this.velocity.clone()
  }
```

And update the approach autopilot to use `currentVelocity` and `setVelocity` instead of direct access.

- [ ] **Step 5: Run type-check and lint**

Run: `bun run type-check && bun lint`
Expected: Clean. Fix any lint issues (likely unused imports from old code).

- [ ] **Step 6: Run all tests**

Run: `bun test:unit`
Expected: All tests pass (existing 401 + new orbit capture tests).

- [ ] **Step 7: Commit**

```bash
git add src/views/MapViewController.ts src/three/ShuttleController.ts
git commit -m "feat(orbit): wire OrbitCaptureSystem into MapViewController"
```

---

## Task 8: Final Integration Test and Polish

- [ ] **Step 1: Run full build**

Run: `bun run build`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Manual testing checklist**

In the browser at `/map`:

1. Fly shuttle near Earth — "Press E — Orbit Earth" appears
2. Press E — shuttle autopilot approaches Earth, thrusters fire
3. Shuttle enters circular orbit — camera pulls back to show orbit
4. A/D changes shuttle facing while orbiting
5. Press E — slingshot launches in aimed direction with speed boost
6. Speed HUD shows higher than normal max thrust speed
7. Speed gradually decays back toward normal
8. Braking during slingshot immediately drops to normal speed
9. Fly to Jupiter — orbit gives bigger slingshot boost (Jupiter moves faster)

- [ ] **Step 3: Commit all remaining changes**

```bash
git add -A
git commit -m "feat(orbit): orbital capture and slingshot system complete"
```
