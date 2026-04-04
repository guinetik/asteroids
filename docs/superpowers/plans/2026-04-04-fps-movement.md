# FPS Movement System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First-person micro-gravity movement on asteroid terrain with thrust-based WASD, pointer-lock camera, O2-as-fuel stamina via ThrusterSystem, and HUD.

**Architecture:** Compose existing `PlatformerBody` (gravity/grounding) and `ThrusterSystem<'sprint'|'jump'>` (O2 fuel + stamina) into a new `FpsPlayerController`. New `FpsCamera` handles pointer-lock mouse look. All tuning constants in `src/data/fps/player-config.json`.

**Tech Stack:** Three.js, TypeScript, Vue 3, Vitest, existing PlatformerBody + ThrusterSystem + Heightmap + InputManager

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/data/fps/player-config.json` | All tuning constants: movement, O2/thrusters, camera |
| `src/three/FpsCamera.ts` | Pointer-lock FPS camera: yaw/pitch from mouse, eye-height offset, forward/right vectors |
| `src/three/FpsPlayerController.ts` | Player entity: composes PlatformerBody + ThrusterSystem, thrust-based lateral movement, friction, jump, sprint, terrain conforming, O2 death timer |
| `src/components/FpsHud.vue` | O2 bar, sprint bar, crosshair, death countdown, speed readout |
| `src/views/FpsViewController.ts` | Scene wiring: terrain + player + camera + input + game loop |
| `src/views/FpsView.vue` | Vue mount: container + HUD + pointer-lock overlay |
| `src/lib/defaultBindings.ts` | Add FPS_BINDINGS export |
| `src/lib/physics/thrusterSystem.ts` | Add `consumeFuel(amount)` method |

---

### Task 1: Add `consumeFuel` to ThrusterSystem

**Files:**
- Modify: `src/lib/physics/thrusterSystem.ts`
- Test: `src/lib/physics/__tests__/thrusterSystem.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/physics/__tests__/thrusterSystem.spec.ts`:

```ts
it('consumeFuel drains fuel from the shared tank', () => {
  const sys = createShuttleSystem()
  const before = sys.fuelLevel
  sys.consumeFuel(50)
  expect(sys.fuelLevel).toBe(before - 50)
})

it('consumeFuel clamps fuel to zero', () => {
  const sys = createShuttleSystem()
  sys.consumeFuel(999999)
  expect(sys.fuelLevel).toBe(0)
})

it('consumeFuel does not go negative', () => {
  const sys = createShuttleSystem()
  sys.consumeFuel(999999)
  sys.consumeFuel(10)
  expect(sys.fuelLevel).toBe(0)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/physics/__tests__/thrusterSystem.spec.ts`
Expected: FAIL — `consumeFuel is not a function`

- [ ] **Step 3: Implement consumeFuel**

Add to `src/lib/physics/thrusterSystem.ts` after the `get isAllDepleted()` getter:

```ts
/**
 * Drain fuel directly from the shared tank (e.g. base O2 consumption).
 * Clamps to zero — will not go negative.
 *
 * @param amount - Fuel units to consume
 */
consumeFuel(amount: number): void {
  this.fuel = Math.max(0, this.fuel - amount)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/physics/__tests__/thrusterSystem.spec.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/physics/thrusterSystem.ts src/lib/physics/__tests__/thrusterSystem.spec.ts
git commit -m "feat(thruster): add consumeFuel method for direct fuel drain"
```

---

### Task 2: Data config + input bindings

**Files:**
- Create: `src/data/fps/player-config.json`
- Modify: `src/lib/defaultBindings.ts`

- [ ] **Step 1: Create the data config**

Create `src/data/fps/player-config.json`:

```json
{
  "movement": {
    "moveThrust": 12.0,
    "sprintMultiplier": 2.0,
    "groundFriction": 8.0,
    "airFriction": 0.3,
    "maxSpeed": 8.0,
    "maxSprintSpeed": 16.0,
    "jumpForce": 6.0,
    "gravity": 1.2
  },
  "o2": {
    "fuelCapacity": 100,
    "baseDrainRate": 1.5,
    "deathTimerSeconds": 30,
    "thrusters": {
      "sprint": {
        "capacity": 50,
        "burnRate": 25,
        "rechargeRate": 15,
        "fuelCostPerRecharge": 0.8
      },
      "jump": {
        "capacity": 10,
        "burnRate": 10,
        "rechargeRate": 8,
        "fuelCostPerRecharge": 0.3
      }
    }
  },
  "camera": {
    "eyeHeight": 1.7,
    "sensitivity": 0.002,
    "pitchClamp": 1.48,
    "fov": 75
  }
}
```

- [ ] **Step 2: Add FPS_BINDINGS**

Add to `src/lib/defaultBindings.ts`:

```ts
/** FPS on-foot key bindings */
export const FPS_BINDINGS: Record<string, string[]> = {
  moveForward: ['KeyW'],
  moveBack: ['KeyS'],
  moveLeft: ['KeyA'],
  moveRight: ['KeyD'],
  jump: ['Space'],
  sprint: ['ShiftLeft'],
}
```

- [ ] **Step 3: Type-check**

Run: `bun run type-check`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/data/fps/player-config.json src/lib/defaultBindings.ts
git commit -m "feat(fps): add player config JSON and FPS input bindings"
```

---

### Task 3: FpsCamera

**Files:**
- Create: `src/three/FpsCamera.ts`
- Test: `src/three/__tests__/fpsCamera.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/three/__tests__/fpsCamera.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { FpsCamera } from '../FpsCamera'
import type { FpsCameraConfig } from '../FpsCamera'
import * as THREE from 'three'

const TEST_CONFIG: FpsCameraConfig = {
  eyeHeight: 1.7,
  sensitivity: 0.002,
  pitchClamp: 1.48,
  fov: 75,
}

describe('FpsCamera', () => {
  let cam: FpsCamera
  let target: THREE.Object3D

  beforeEach(() => {
    cam = new FpsCamera(TEST_CONFIG)
    target = new THREE.Object3D()
    target.position.set(10, 5, 20)
    cam.setTarget(target)
  })

  it('camera position tracks target plus eye height', () => {
    cam.tick(0.016)
    expect(cam.camera.position.x).toBe(10)
    expect(cam.camera.position.y).toBeCloseTo(5 + 1.7)
    expect(cam.camera.position.z).toBe(20)
  })

  it('applyMouseDelta rotates yaw on deltaX', () => {
    cam.applyMouseDelta(100, 0)
    cam.tick(0.016)
    expect(cam.yaw).not.toBe(0)
  })

  it('applyMouseDelta rotates pitch on deltaY', () => {
    cam.applyMouseDelta(0, 100)
    cam.tick(0.016)
    expect(cam.pitch).not.toBe(0)
  })

  it('pitch is clamped to pitchClamp', () => {
    cam.applyMouseDelta(0, -99999)
    cam.tick(0.016)
    expect(cam.pitch).toBeCloseTo(-TEST_CONFIG.pitchClamp, 1)
  })

  it('getForwardXZ returns unit vector on XZ plane', () => {
    cam.applyMouseDelta(0, 50) // pitch down — should NOT affect forwardXZ
    cam.tick(0.016)
    const fwd = cam.getForwardXZ()
    expect(fwd.length()).toBeCloseTo(1, 3)
  })

  it('getRightXZ returns vector perpendicular to forwardXZ', () => {
    cam.tick(0.016)
    const fwd = cam.getForwardXZ()
    const right = cam.getRightXZ()
    const dot = fwd.x * right.x + fwd.y * right.y
    expect(dot).toBeCloseTo(0, 3)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/three/__tests__/fpsCamera.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement FpsCamera**

Create `src/three/FpsCamera.ts`:

```ts
/**
 * Pointer-lock first-person camera.
 * Attaches to a target Object3D at eye height. Mouse deltas
 * drive yaw (rotates target) and pitch (tilts camera).
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-fps-movement-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'

/** Tuning knobs for the FPS camera. */
export interface FpsCameraConfig {
  /** Vertical offset above player origin (meters). */
  eyeHeight: number
  /** Mouse sensitivity multiplier for raw deltas. */
  sensitivity: number
  /** Maximum pitch angle in radians (default ~85deg). */
  pitchClamp: number
  /** Perspective field of view in degrees. */
  fov: number
}

/**
 * First-person camera with pointer-lock mouse look.
 * Call {@link applyMouseDelta} from a mousemove listener,
 * then {@link tick} each frame to update position/rotation.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-fps-movement-design.md
 */
export class FpsCamera implements Tickable {
  readonly camera: THREE.PerspectiveCamera

  /** Current yaw angle in radians (horizontal rotation). */
  yaw = 0
  /** Current pitch angle in radians (vertical look). */
  pitch = 0

  private readonly config: FpsCameraConfig
  private target: THREE.Object3D | null = null
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ')

  constructor(config: FpsCameraConfig) {
    this.config = config
    this.camera = new THREE.PerspectiveCamera(config.fov, 1, 0.1, 5000)
  }

  /** Set the player entity to follow. */
  setTarget(target: THREE.Object3D): void {
    this.target = target
  }

  /**
   * Feed raw pointer-lock mouse deltas.
   *
   * @param dx - Horizontal mouse movement (pixels)
   * @param dy - Vertical mouse movement (pixels)
   */
  applyMouseDelta(dx: number, dy: number): void {
    this.yaw -= dx * this.config.sensitivity
    this.pitch -= dy * this.config.sensitivity
    this.pitch = Math.max(
      -this.config.pitchClamp,
      Math.min(this.config.pitchClamp, this.pitch),
    )
  }

  /** Forward direction on the XZ plane (pitch stripped). */
  getForwardXZ(): THREE.Vector2 {
    return new THREE.Vector2(
      -Math.sin(this.yaw),
      -Math.cos(this.yaw),
    ).normalize()
  }

  /** Right direction on the XZ plane. */
  getRightXZ(): THREE.Vector2 {
    return new THREE.Vector2(
      Math.cos(this.yaw),
      -Math.sin(this.yaw),
    ).normalize()
  }

  /** Update camera aspect ratio on window resize. */
  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  tick(_dt: number): void {
    if (!this.target) return

    // Position at target + eye height
    this.camera.position.set(
      this.target.position.x,
      this.target.position.y + this.config.eyeHeight,
      this.target.position.z,
    )

    // Apply yaw + pitch rotation
    this.euler.set(this.pitch, this.yaw, 0)
    this.camera.quaternion.setFromEuler(this.euler)
  }

  dispose(): void {
    // No event listeners owned — pointer lock managed by ViewController
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/three/__tests__/fpsCamera.spec.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/three/FpsCamera.ts src/three/__tests__/fpsCamera.spec.ts
git commit -m "feat(fps): FpsCamera with pointer-lock mouse look"
```

---

### Task 4: FpsPlayerController

**Files:**
- Create: `src/three/FpsPlayerController.ts`
- Test: `src/three/__tests__/fpsPlayerController.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/three/__tests__/fpsPlayerController.spec.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FpsPlayerController } from '../FpsPlayerController'
import type { FpsPlayerConfig } from '../FpsPlayerController'
import { Heightmap } from '@/lib/terrain/heightmap'
import { InputManager } from '@/lib/InputManager'
import { FPS_BINDINGS } from '@/lib/defaultBindings'
import { FpsCamera } from '../FpsCamera'
import playerConfigJson from '@/data/fps/player-config.json'

// Build a flat heightmap at y=0
function flatHeightmap(): Heightmap {
  const resolution = 8
  const worldSize = 200
  const grid = new Float32Array(resolution * resolution)
  return new Heightmap(grid, resolution, worldSize)
}

function createController(): {
  ctrl: FpsPlayerController
  input: InputManager
  cam: FpsCamera
} {
  const input = new InputManager(FPS_BINDINGS)
  const cam = new FpsCamera(playerConfigJson.camera)
  const hm = flatHeightmap()
  const ctrl = new FpsPlayerController(
    input,
    cam,
    playerConfigJson as FpsPlayerConfig,
    hm,
  )
  cam.setTarget(ctrl.group)
  return { ctrl, input, cam }
}

describe('FpsPlayerController', () => {
  it('spawns at given position', () => {
    const { ctrl } = createController()
    ctrl.group.position.set(0, 10, 0)
    expect(ctrl.group.position.y).toBe(10)
  })

  it('falls under gravity when above ground', () => {
    const { ctrl } = createController()
    ctrl.group.position.y = 10
    ctrl.tick(0.1)
    expect(ctrl.group.position.y).toBeLessThan(10)
  })

  it('lands on terrain and becomes grounded', () => {
    const { ctrl } = createController()
    ctrl.group.position.y = 0.01
    ctrl.tick(0.1)
    expect(ctrl.grounded).toBe(true)
    expect(ctrl.group.position.y).toBe(0)
  })

  it('jump impulse launches player upward when grounded', () => {
    const { ctrl } = createController()
    ctrl.group.position.y = 0
    ctrl.tick(0.016) // settle to ground
    ctrl.jump()
    ctrl.tick(0.016)
    expect(ctrl.group.position.y).toBeGreaterThan(0)
    expect(ctrl.grounded).toBe(false)
  })

  it('cannot double-jump', () => {
    const { ctrl } = createController()
    ctrl.group.position.y = 0
    ctrl.tick(0.016) // settle
    ctrl.jump()
    ctrl.tick(0.016) // now airborne
    const yAfterFirst = ctrl.group.position.y
    ctrl.jump() // should do nothing
    ctrl.tick(0.016)
    // Should still be falling/rising normally, not boosted
    expect(ctrl.grounded).toBe(false)
  })

  it('o2 drains over time even when idle', () => {
    const { ctrl } = createController()
    const before = ctrl.o2Level
    ctrl.tick(1.0)
    expect(ctrl.o2Level).toBeLessThan(before)
  })

  it('death timer starts when o2 is empty', () => {
    const { ctrl } = createController()
    // Drain all O2
    for (let i = 0; i < 200; i++) ctrl.tick(1.0)
    expect(ctrl.o2Level).toBe(0)
    expect(ctrl.deathTimer).not.toBeNull()
  })

  it('death timer counts down to zero', () => {
    const { ctrl } = createController()
    for (let i = 0; i < 200; i++) ctrl.tick(1.0)
    const timer = ctrl.deathTimer!
    ctrl.tick(1.0)
    expect(ctrl.deathTimer!).toBeLessThan(timer)
  })

  it('ground friction decelerates lateral velocity', () => {
    const { ctrl } = createController()
    ctrl.group.position.y = 0
    ctrl.tick(0.016) // ground
    // Give it some lateral speed
    ctrl.applyLateralImpulse(10, 0)
    const speed1 = ctrl.speed
    ctrl.tick(0.1) // friction should slow it
    expect(ctrl.speed).toBeLessThan(speed1)
  })

  it('air friction is weaker than ground friction', () => {
    const { ctrl } = createController()

    // Ground test: apply impulse, measure deceleration
    ctrl.group.position.y = 0
    ctrl.tick(0.016)
    ctrl.applyLateralImpulse(10, 0)
    const groundSpeedBefore = ctrl.speed
    ctrl.tick(0.1)
    const groundDecel = groundSpeedBefore - ctrl.speed

    // Reset: airborne test
    const { ctrl: ctrl2 } = createController()
    ctrl2.group.position.y = 50
    ctrl2.tick(0.001) // tiny dt so barely falls
    ctrl2.applyLateralImpulse(10, 0)
    const airSpeedBefore = ctrl2.speed
    ctrl2.tick(0.1)
    const airDecel = airSpeedBefore - ctrl2.speed

    expect(airDecel).toBeLessThan(groundDecel)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/three/__tests__/fpsPlayerController.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement FpsPlayerController**

Create `src/three/FpsPlayerController.ts`:

```ts
/**
 * First-person player controller for on-foot EVA movement.
 *
 * Composes {@link PlatformerBody} for gravity/grounding and
 * {@link ThrusterSystem} for O2-fueled stamina (sprint + jump).
 * Thrust-based lateral movement with ground friction and air drift.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-fps-movement-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { InputManager } from '@/lib/InputManager'
import type { FpsCamera } from './FpsCamera'
import { PlatformerBody } from '@/lib/physics/platformerBody'
import { ThrusterSystem } from '@/lib/physics/thrusterSystem'
import type { ThrusterSystemConfig } from '@/lib/physics/thrusterSystem'
import type { Heightmap } from '@/lib/terrain/heightmap'

/** Thruster names for the player's O2 power system. */
export type FpsThrusterName = 'sprint' | 'jump'

/** Shape of the player-config.json file. */
export interface FpsPlayerConfig {
  movement: {
    moveThrust: number
    sprintMultiplier: number
    groundFriction: number
    airFriction: number
    maxSpeed: number
    maxSprintSpeed: number
    jumpForce: number
    gravity: number
  }
  o2: {
    fuelCapacity: number
    baseDrainRate: number
    deathTimerSeconds: number
    thrusters: {
      sprint: { capacity: number; burnRate: number; rechargeRate: number; fuelCostPerRecharge: number }
      jump: { capacity: number; burnRate: number; rechargeRate: number; fuelCostPerRecharge: number }
    }
  }
  camera: {
    eyeHeight: number
    sensitivity: number
    pitchClamp: number
    fov: number
  }
}

/**
 * First-person player entity on asteroid terrain.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-fps-movement-design.md
 */
export class FpsPlayerController implements Tickable {
  readonly group = new THREE.Group()
  readonly body: PlatformerBody
  readonly thrusterSystem: ThrusterSystem<FpsThrusterName>

  private readonly inputManager: InputManager
  private readonly camera: FpsCamera
  private readonly config: FpsPlayerConfig
  private readonly heightmap: Heightmap
  private readonly lateralVelocity = new THREE.Vector3()
  private _deathTimer: number | null = null

  /** Fired when death timer expires. */
  onDeath: (() => void) | null = null

  constructor(
    inputManager: InputManager,
    camera: FpsCamera,
    config: FpsPlayerConfig,
    heightmap: Heightmap,
  ) {
    this.inputManager = inputManager
    this.camera = camera
    this.config = config
    this.heightmap = heightmap

    this.body = new PlatformerBody({ gravity: config.movement.gravity })

    const tsConfig: ThrusterSystemConfig<FpsThrusterName> = {
      fuelCapacity: config.o2.fuelCapacity,
      thrusters: config.o2.thrusters,
    }
    this.thrusterSystem = new ThrusterSystem<FpsThrusterName>(tsConfig)
  }

  /** Whether the player is on the ground. */
  get grounded(): boolean {
    return this.body.grounded
  }

  /** Current O2 remaining (fuel level). */
  get o2Level(): number {
    return this.thrusterSystem.fuelLevel
  }

  /** Max O2 capacity. */
  get o2Capacity(): number {
    return this.thrusterSystem.fuelCapacity
  }

  /** Current lateral speed magnitude. */
  get speed(): number {
    return Math.sqrt(
      this.lateralVelocity.x * this.lateralVelocity.x +
      this.lateralVelocity.z * this.lateralVelocity.z,
    )
  }

  /** Death timer seconds remaining, or null if not active. */
  get deathTimer(): number | null {
    return this._deathTimer
  }

  /** Apply a lateral impulse for testing. */
  applyLateralImpulse(x: number, z: number): void {
    this.lateralVelocity.x += x
    this.lateralVelocity.z += z
  }

  /** Attempt to jump. Only works when grounded and jump thruster has charge. */
  jump(): void {
    if (!this.body.grounded) return
    if (!this.thrusterSystem.canFire('jump')) return
    this.body.impulse(this.config.movement.jumpForce)
  }

  tick(dt: number): void {
    const mv = this.config.movement
    const isSprinting = this.inputManager.isActionActive('sprint') &&
      this.thrusterSystem.canFire('sprint')

    // --- Thruster system: sprint + jump ---
    const sprintActive = isSprinting
    const jumpPressed = this.inputManager.wasActionPressed('jump') && this.body.grounded
    if (jumpPressed) this.jump()

    this.thrusterSystem.tick(dt, {
      sprint: sprintActive,
      jump: jumpPressed,
    })

    // --- Base O2 drain (breathing) ---
    this.thrusterSystem.consumeFuel(this.config.o2.baseDrainRate * dt)

    // --- Death timer ---
    if (this.thrusterSystem.isFuelEmpty) {
      if (this._deathTimer === null) {
        this._deathTimer = this.config.o2.deathTimerSeconds
      }
      this._deathTimer -= dt
      if (this._deathTimer <= 0) {
        this._deathTimer = 0
        this.onDeath?.()
      }
    } else if (this._deathTimer !== null) {
      // O2 restored — cancel timer
      this._deathTimer = null
    }

    // --- Lateral movement (thrust-based) ---
    const forward = this.camera.getForwardXZ()
    const right = this.camera.getRightXZ()
    const thrustMag = mv.moveThrust * (isSprinting ? mv.sprintMultiplier : 1)

    if (this.inputManager.isActionActive('moveForward')) {
      this.lateralVelocity.x += forward.x * thrustMag * dt
      this.lateralVelocity.z += forward.y * thrustMag * dt
    }
    if (this.inputManager.isActionActive('moveBack')) {
      this.lateralVelocity.x -= forward.x * thrustMag * dt
      this.lateralVelocity.z -= forward.y * thrustMag * dt
    }
    if (this.inputManager.isActionActive('moveLeft')) {
      this.lateralVelocity.x -= right.x * thrustMag * dt
      this.lateralVelocity.z -= right.y * thrustMag * dt
    }
    if (this.inputManager.isActionActive('moveRight')) {
      this.lateralVelocity.x += right.x * thrustMag * dt
      this.lateralVelocity.z += right.y * thrustMag * dt
    }

    // --- Friction ---
    const friction = this.body.grounded ? mv.groundFriction : mv.airFriction
    const speed = this.speed
    if (speed > 0) {
      const drop = friction * dt
      const factor = Math.max(0, speed - drop) / speed
      this.lateralVelocity.x *= factor
      this.lateralVelocity.z *= factor
    }

    // --- Speed clamp ---
    const maxSpd = isSprinting ? mv.maxSprintSpeed : mv.maxSpeed
    if (this.speed > maxSpd) {
      const scale = maxSpd / this.speed
      this.lateralVelocity.x *= scale
      this.lateralVelocity.z *= scale
    }

    // --- Apply lateral velocity ---
    this.group.position.x += this.lateralVelocity.x * dt
    this.group.position.z += this.lateralVelocity.z * dt

    // --- Gravity + grounding ---
    const floorY = this.heightmap.heightAt(this.group.position.x, this.group.position.z)
    this.group.position.y = this.body.tick(dt, this.group.position.y, floorY)

    // --- Terrain conforming (align up to surface normal when grounded) ---
    if (this.body.grounded) {
      const n = this.heightmap.normalAt(this.group.position.x, this.group.position.z)
      const tiltX = Math.atan2(n.z, n.y)
      const tiltZ = Math.atan2(-n.x, n.y)
      this.group.rotation.set(tiltX, this.group.rotation.y, tiltZ)
    }
  }

  dispose(): void {
    // No owned resources to clean up
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/three/__tests__/fpsPlayerController.spec.ts`
Expected: ALL PASS

- [ ] **Step 5: Run full test suite**

Run: `bun test:unit`
Expected: ALL PASS — no regressions

- [ ] **Step 6: Commit**

```bash
git add src/three/FpsPlayerController.ts src/three/__tests__/fpsPlayerController.spec.ts
git commit -m "feat(fps): FpsPlayerController with thrust movement, O2 stamina, death timer"
```

---

### Task 5: FpsHud

**Files:**
- Create: `src/components/FpsHud.vue`

- [ ] **Step 1: Create FpsHud component**

Create `src/components/FpsHud.vue`:

```vue
<!-- src/components/FpsHud.vue -->
<script setup lang="ts">
/** Telemetry data from FpsPlayerController for HUD display. */
export interface FpsTelemetry {
  /** Current O2 remaining */
  o2Level: number
  /** Maximum O2 capacity */
  o2Capacity: number
  /** Current sprint charge */
  sprintCharge: number
  /** Maximum sprint charge */
  sprintCapacity: number
  /** Current lateral speed */
  speed: number
  /** Whether player is on the ground */
  grounded: boolean
  /** Death timer seconds remaining, or null if not active */
  deathTimer: number | null
}

const props = defineProps<{ telemetry: FpsTelemetry }>()

function pct(value: number, max: number): number {
  return max > 0 ? (value / max) * 100 : 0
}

function o2Color(): string {
  const ratio = props.telemetry.o2Level / props.telemetry.o2Capacity
  if (ratio > 0.5) return 'var(--color-o2-high)'
  if (ratio > 0.2) return 'var(--color-o2-mid)'
  return 'var(--color-o2-low)'
}
</script>

<template>
  <div class="fps-hud">
    <!-- O2 Bar -->
    <div class="fps-hud__o2">
      <span class="fps-hud__label">O2</span>
      <div class="fps-hud__bar-track">
        <div
          class="fps-hud__bar-fill"
          :style="{ width: pct(telemetry.o2Level, telemetry.o2Capacity) + '%', backgroundColor: o2Color() }"
        />
      </div>
      <span class="fps-hud__value">{{ Math.ceil(telemetry.o2Level) }}</span>
    </div>

    <!-- Sprint Bar -->
    <div class="fps-hud__sprint">
      <span class="fps-hud__label">STA</span>
      <div class="fps-hud__bar-track fps-hud__bar-track--small">
        <div
          class="fps-hud__bar-fill fps-hud__bar-fill--sprint"
          :style="{ width: pct(telemetry.sprintCharge, telemetry.sprintCapacity) + '%' }"
        />
      </div>
    </div>

    <!-- Crosshair -->
    <div class="fps-hud__crosshair">+</div>

    <!-- Speed -->
    <div class="fps-hud__speed">
      <span class="fps-hud__label">SPD</span>
      <span class="fps-hud__value">{{ telemetry.speed.toFixed(1) }}</span>
    </div>

    <!-- Death Timer -->
    <div v-if="telemetry.deathTimer !== null" class="fps-hud__death">
      {{ Math.ceil(telemetry.deathTimer) }}s
    </div>
  </div>
</template>

<style>
:root {
  --color-o2-high: #3b82f6;
  --color-o2-mid: #f59e0b;
  --color-o2-low: #ef4444;
}

.fps-hud {
  @apply(fixed inset-0 pointer-events-none font-mono text-white/90);
}

.fps-hud__o2 {
  @apply(absolute top-4 left-4 flex items-center gap-2);
}

.fps-hud__sprint {
  @apply(absolute top-12 left-4 flex items-center gap-2);
}

.fps-hud__label {
  @apply(text-xs tracking-widest uppercase text-white/60 w-8);
}

.fps-hud__value {
  @apply(text-xs text-white/60 w-8 text-right);
}

.fps-hud__bar-track {
  @apply(w-40 h-3 bg-white/10 rounded-sm overflow-hidden);
}

.fps-hud__bar-track--small {
  @apply(h-2 w-32);
}

.fps-hud__bar-fill {
  @apply(h-full transition-all duration-100);
}

.fps-hud__bar-fill--sprint {
  @apply(bg-green-400/80);
}

.fps-hud__crosshair {
  @apply(absolute inset-0 flex items-center justify-center text-2xl text-white/40 select-none);
}

.fps-hud__speed {
  @apply(absolute bottom-4 left-4 flex items-center gap-2);
}

.fps-hud__death {
  @apply(absolute top-1/3 left-1/2 -translate-x-1/2 text-4xl text-red-500 animate-pulse tracking-widest);
}
</style>
```

- [ ] **Step 2: Type-check**

Run: `bun run type-check`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add src/components/FpsHud.vue
git commit -m "feat(fps): FpsHud with O2, stamina, crosshair, death timer"
```

---

### Task 6: Wire up FpsViewController + FpsView

**Files:**
- Modify: `src/views/FpsViewController.ts`
- Modify: `src/views/FpsView.vue`

- [ ] **Step 1: Rewrite FpsViewController**

Replace `src/views/FpsViewController.ts` with:

```ts
/**
 * Bridges Vue lifecycle to the FPS demo scene.
 * Terrain grid + first-person player with O2-fueled movement.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-fps-movement-design.md
 */
import type { Tickable } from '@/lib/Tickable'
import type { FpsTelemetry } from '@/components/FpsHud.vue'
import { GameLoop } from '@/lib/GameLoop'
import { TickHandler } from '@/lib/TickHandler'
import { InputManager } from '@/lib/InputManager'
import { FPS_BINDINGS } from '@/lib/defaultBindings'
import {
  TICK_PRIORITY_INPUT,
  TICK_PRIORITY_PHYSICS,
  TICK_PRIORITY_RENDER,
} from '@/lib/tickPriorities'
import { SceneManager } from '@/three/SceneManager'
import { FpsCamera } from '@/three/FpsCamera'
import { FpsPlayerController } from '@/three/FpsPlayerController'
import type { FpsPlayerConfig } from '@/three/FpsPlayerController'
import { TerrainGrid } from '@/three/TerrainGrid'
import { generateTerrain } from '@/lib/terrain/terrainGenerator'
import type { SurfaceFeatures } from '@/lib/asteroids/types'
import { AmbientLight, DirectionalLight } from 'three'
import playerConfigJson from '@/data/fps/player-config.json'

const AMBIENT_LIGHT_INTENSITY = 0.4
const DIR_LIGHT_INTENSITY = 1.2
const GRID_SIZE = 2000
const TERRAIN_SEED = 77
const TERRAIN_RESOLUTION = 128
const SPAWN_HEIGHT = 5

const TEST_SURFACE: SurfaceFeatures = {
  craterDensity: 0.5,
  craterMaxScale: 0.2,
  boulderDensity: 0.4,
  ridgeFrequency: 0.4,
  roughness: 0.6,
  dustCoverage: 0.3,
}

/**
 * FPS demo scene — terrain grid with first-person player movement.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-fps-movement-design.md
 */
export class FpsViewController implements Tickable {
  private gameLoop: GameLoop | null = null
  private tickHandler: TickHandler | null = null
  private inputManager: InputManager | null = null
  private sceneManager: SceneManager | null = null
  private fpsCamera: FpsCamera | null = null
  private playerController: FpsPlayerController | null = null
  private terrainGrid: TerrainGrid | null = null
  private container: HTMLElement | null = null

  /** Called each frame with player telemetry for HUD display. */
  onTelemetry: ((telemetry: FpsTelemetry) => void) | null = null

  /** Called when pointer lock state changes. */
  onPointerLockChange: ((locked: boolean) => void) | null = null

  async init(container: HTMLElement): Promise<void> {
    this.container = container
    const config = playerConfigJson as FpsPlayerConfig

    // Input
    this.inputManager = new InputManager(FPS_BINDINGS)
    this.tickHandler = new TickHandler()
    this.tickHandler.register(this.inputManager, TICK_PRIORITY_INPUT)

    // Scene
    this.sceneManager = new SceneManager()
    this.sceneManager.mount(container)

    // Terrain
    const heightmap = generateTerrain(TEST_SURFACE, {
      seed: TERRAIN_SEED,
      resolution: TERRAIN_RESOLUTION,
      worldSize: GRID_SIZE,
    })
    this.terrainGrid = new TerrainGrid(heightmap)
    this.sceneManager.addToScene(this.terrainGrid.mesh)

    // Lighting
    const ambient = new AmbientLight(0xffffff, AMBIENT_LIGHT_INTENSITY)
    const sun = new DirectionalLight(0xffffee, DIR_LIGHT_INTENSITY)
    sun.position.set(100, 200, 50)
    this.sceneManager.addToScene(ambient)
    this.sceneManager.addToScene(sun)

    // FPS Camera
    this.fpsCamera = new FpsCamera(config.camera)

    // Player
    this.playerController = new FpsPlayerController(
      this.inputManager,
      this.fpsCamera,
      config,
      heightmap,
    )
    this.playerController.group.position.set(0, SPAWN_HEIGHT, 0)
    this.sceneManager.addToScene(this.playerController.group)
    this.fpsCamera.setTarget(this.playerController.group)

    // Use FpsCamera's perspective camera for rendering
    this.sceneManager.setActiveCamera(this.fpsCamera.camera)

    // Death handler — reset scene
    this.playerController.onDeath = () => {
      this.resetPlayer()
    }

    // Register tick order
    this.tickHandler.register(this.playerController, TICK_PRIORITY_PHYSICS)
    this.tickHandler.register(this.fpsCamera, TICK_PRIORITY_RENDER - 2)
    this.tickHandler.register(this, TICK_PRIORITY_RENDER - 1)
    this.tickHandler.register(this.sceneManager, TICK_PRIORITY_RENDER)

    // Pointer lock
    this.setupPointerLock(container)

    // Start
    this.gameLoop = new GameLoop(this.tickHandler)
    this.gameLoop.start()
  }

  tick(_dt: number): void {
    if (this.playerController && this.onTelemetry) {
      const ts = this.playerController.thrusterSystem
      this.onTelemetry({
        o2Level: this.playerController.o2Level,
        o2Capacity: this.playerController.o2Capacity,
        sprintCharge: ts.getState('sprint').charge,
        sprintCapacity: ts.getState('sprint').capacity,
        speed: this.playerController.speed,
        grounded: this.playerController.grounded,
        deathTimer: this.playerController.deathTimer,
      })
    }
  }

  /** Request pointer lock on the renderer canvas. */
  requestPointerLock(): void {
    this.sceneManager?.renderer.domElement.requestPointerLock()
  }

  private setupPointerLock(container: HTMLElement): void {
    const canvas = this.sceneManager!.renderer.domElement

    // Mouse move → camera look
    const onMouseMove = (e: MouseEvent): void => {
      if (document.pointerLockElement === canvas) {
        this.fpsCamera?.applyMouseDelta(e.movementX, e.movementY)
      }
    }
    document.addEventListener('mousemove', onMouseMove)

    // Pointer lock change
    const onLockChange = (): void => {
      const locked = document.pointerLockElement === canvas
      this.onPointerLockChange?.(locked)
    }
    document.addEventListener('pointerlockchange', onLockChange)

    // Auto-lock on first click
    canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock()
      }
    })

    // Request lock immediately
    canvas.requestPointerLock()
  }

  private resetPlayer(): void {
    if (!this.playerController) return
    this.playerController.group.position.set(0, SPAWN_HEIGHT, 0)
    // Recreate controller to reset O2/stamina
    // For demo simplicity, just reload the page
    window.location.reload()
  }

  dispose(): void {
    this.gameLoop?.stop()
    this.playerController?.dispose()
    this.fpsCamera?.dispose()
    this.terrainGrid?.dispose()
    this.sceneManager?.dispose()
    this.inputManager?.dispose()
  }
}
```

- [ ] **Step 2: Update FpsView.vue**

Replace `src/views/FpsView.vue` with:

```vue
<!-- src/views/FpsView.vue -->
<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { FpsViewController } from './FpsViewController'
import FpsHud from '@/components/FpsHud.vue'
import type { FpsTelemetry } from '@/components/FpsHud.vue'

const container = ref<HTMLElement>()
const viewController = new FpsViewController()
const pointerLocked = ref(true)

const telemetry = reactive<FpsTelemetry>({
  o2Level: 100,
  o2Capacity: 100,
  sprintCharge: 50,
  sprintCapacity: 50,
  speed: 0,
  grounded: false,
  deathTimer: null,
})

onMounted(async () => {
  if (container.value) {
    viewController.onTelemetry = (t) => {
      Object.assign(telemetry, t)
    }
    viewController.onPointerLockChange = (locked) => {
      pointerLocked.value = locked
    }
    await viewController.init(container.value)
  }
})

onUnmounted(() => {
  viewController.dispose()
})

function resumeLock() {
  viewController.requestPointerLock()
}
</script>

<template>
  <div ref="container" class="scene-container"></div>
  <FpsHud :telemetry="telemetry" />
  <div
    v-if="!pointerLocked"
    class="fps-lock-overlay"
    @click="resumeLock"
  >
    <span class="fps-lock-overlay__text">Click to resume</span>
  </div>
</template>

<style>
.fps-lock-overlay {
  @apply(fixed inset-0 flex items-center justify-center bg-black/60 cursor-pointer z-50);
}

.fps-lock-overlay__text {
  @apply(text-lg text-white/80 font-mono tracking-widest uppercase);
}
</style>
```

- [ ] **Step 3: Add setActiveCamera to SceneManager**

Modify `src/three/SceneManager.ts`. The current `setCamera` only accepts `VehicleCamera`. Add a direct camera path.

Add a new private field after `private vehicleCamera`:

```ts
private directCamera: THREE.PerspectiveCamera | null = null
```

Add a new public method after `setCamera`:

```ts
/** Set a raw perspective camera for rendering (FPS mode). */
setActiveCamera(camera: THREE.PerspectiveCamera): void {
  this.directCamera = camera
  if (this.container) {
    const { clientWidth, clientHeight } = this.container
    camera.aspect = clientWidth / clientHeight
    camera.updateProjectionMatrix()
  }
}
```

Replace the `tick` method body (line 62-66):

```ts
tick(_dt: number): void {
  const cam = this.directCamera ?? this.vehicleCamera?.camera
  if (cam) {
    this.renderer.render(this.scene, cam)
  }
}
```

Update the `onResize` handler (line 76-81) to also resize `directCamera`:

```ts
private onResize = (): void => {
  if (!this.container) return
  const { clientWidth, clientHeight } = this.container
  this.renderer.setSize(clientWidth, clientHeight)
  this.vehicleCamera?.resize(clientWidth, clientHeight)
  if (this.directCamera) {
    this.directCamera.aspect = clientWidth / clientHeight
    this.directCamera.updateProjectionMatrix()
  }
}
```

- [ ] **Step 4: Type-check**

Run: `bun run type-check`
Expected: Clean

- [ ] **Step 5: Run dev server and test manually**

Run: `bun dev`
Navigate to `http://localhost:5173/fps`

Verify:
- Terrain grid renders
- Pointer lock engages on click
- WASD moves the player across terrain
- Mouse look works (yaw + pitch)
- Space jumps
- Shift sprints (faster movement)
- O2 bar ticks down over time
- Sprint bar drains while sprinting, recharges when idle
- Crosshair visible
- Press Escape → "Click to resume" overlay appears
- Click overlay → re-locks

- [ ] **Step 6: Commit**

```bash
git add src/views/FpsViewController.ts src/views/FpsView.vue src/components/FpsHud.vue src/three/SceneManager.ts
git commit -m "feat(fps): wire up FPS demo scene with movement, O2, HUD, pointer lock"
```

---

### Task 7: Lint + final verification

**Files:** All new/modified files

- [ ] **Step 1: Run linter**

Run: `bun lint`

Fix any issues reported by oxlint or eslint (likely missing TSDoc on exports).

- [ ] **Step 2: Run full test suite**

Run: `bun test:unit`
Expected: ALL PASS

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`
Expected: Clean

- [ ] **Step 4: Commit any lint fixes**

```bash
git add -A
git commit -m "chore(fps): lint fixes"
```
