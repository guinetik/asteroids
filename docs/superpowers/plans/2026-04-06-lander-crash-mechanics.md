# Lander Crash Mechanics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add crash detection on landing (speed + angle thresholds), scaled explosion VFX, 3-life system with HUD icons, and respawn-at-shuttle mechanics.

**Architecture:** `LanderController` captures pre-landing velocity/tilt and fires `onCrash`/`onLand` callbacks. `LevelViewController` tracks lives, manages the `crashed` state, spawns a `LanderExplosion`, and handles respawn. State machine gets a new `crashed` state with conditional next (respawn vs fail).

**Tech Stack:** TypeScript, Three.js, Vue 3

**Spec:** `docs/superpowers/specs/2026-04-06-lander-crash-mechanics-design.md`

---

### Task 1: Add Landing Detection to LanderController

**Files:**
- Modify: `src/three/LanderController.ts`
- Modify: `src/lib/physics/platformerBody.ts`

The crash check must capture `velocityY` *before* `PlatformerBody.tick()` zeroes it on ground contact. We add a `wasGrounded` tracker to detect the grounded transition frame.

- [ ] **Step 1: Add pre-landing velocity capture to PlatformerBody**

In `src/lib/physics/platformerBody.ts`, add a field to expose the impact velocity:

```ts
/** Vertical velocity at the moment of the last ground contact (always <= 0). */
impactVelocityY = 0
```

Update the ground collision block in `tick()` (line 75) to capture velocity before zeroing:

```ts
// Ground collision
if (newY <= floorY) {
  newY = floorY
  this.impactVelocityY = this.velocityY
  this.velocityY = 0
  this.grounded = true
} else {
  this.grounded = false
}
```

- [ ] **Step 2: Add crash detection constants and callbacks to LanderController**

In `src/three/LanderController.ts`, add constants after line 131:

```ts
/** Maximum safe landing speed (abs velocityY) in units/s. */
const SAFE_LANDING_SPEED = 5.0

/** Maximum safe landing angle (combined tilt magnitude) in radians (~10 degrees). */
const SAFE_LANDING_ANGLE = 0.175
```

Add callbacks and tracking fields to the class (after `liftoffBoostTimer` around line 166):

```ts
/** Tracks whether lander was grounded last frame (for transition detection). */
private wasGrounded = false

/** Called on crash landing with impact speed and tilt angle. */
onCrash: ((impactSpeed: number, impactAngle: number) => void) | null = null

/** Called on safe landing. */
onLand: (() => void) | null = null
```

- [ ] **Step 3: Add landing evaluation logic to tick()**

In `tick()`, after the `this.group.position.y = this.body.tick(...)` line (line 279), add the landing transition check:

```ts
// Detect landing transition (airborne → grounded)
if (this.body.grounded && !this.wasGrounded) {
  const impactSpeed = Math.abs(this.body.impactVelocityY)
  const impactAngle = Math.sqrt(this.tiltX * this.tiltX + this.tiltZ * this.tiltZ)
  if (impactSpeed > SAFE_LANDING_SPEED || impactAngle > SAFE_LANDING_ANGLE) {
    this.onCrash?.(impactSpeed, impactAngle)
  } else {
    this.onLand?.()
  }
}
this.wasGrounded = this.body.grounded
```

- [ ] **Step 4: Add a reset method for respawn**

Add to `LanderController`:

```ts
/** Reset lander state for respawn after a crash. */
resetForRespawn(position: THREE.Vector3): void {
  this.group.position.copy(position)
  this.group.visible = true
  this.body.velocityY = 0
  this.body.grounded = false
  this.lateralVelocity.set(0, 0, 0)
  this.tiltX = 0
  this.tiltZ = 0
  this.group.rotation.set(0, 0, 0)
  this.wasGrounded = false
  this.liftoffBoostTimer = 0
}
```

- [ ] **Step 5: Run type-check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/three/LanderController.ts src/lib/physics/platformerBody.ts
git commit -m "feat(lander): add crash detection on landing — speed and angle thresholds"
```

---

### Task 2: Create LanderExplosion VFX Controller

**Files:**
- Create: `src/three/LanderExplosion.ts`

- [ ] **Step 1: Create the explosion controller**

Create `src/three/LanderExplosion.ts`:

```ts
/**
 * Lander crash explosion VFX — particle burst scaled to impact speed.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-lander-crash-mechanics-design.md
 */
import { Vector3, Color } from 'three'
import { ParticleEmitter } from './ParticleEmitter'
import type { Tickable } from '@/lib/Tickable'

/** Minimum particles for a low-speed crash. */
const MIN_PARTICLES = 16
/** Maximum particles for a terminal-velocity crash. */
const MAX_PARTICLES = 64
/** Speed at which explosion is at full intensity. */
const MAX_IMPACT_SPEED = 20
/** Minimum particle spread radius. */
const MIN_SPREAD = 10
/** Maximum particle spread radius. */
const MAX_SPREAD = 40
/** Minimum particle lifetime. */
const MIN_LIFETIME = 0.5
/** Maximum particle lifetime. */
const MAX_LIFETIME = 1.5
/** Explosion push force (outward burst). */
const BURST_FORCE = 30

/**
 * Crash explosion — emits a burst of particles scaled to impact speed.
 * Create one per level, reuse via `explode()`.
 *
 * @author guinetik
 * @date 2026-04-06
 */
export class LanderExplosion implements Tickable {
  /** Fire/debris emitter. */
  readonly fireEmitter: ParticleEmitter
  /** Debris/smoke emitter. */
  readonly debrisEmitter: ParticleEmitter

  constructor() {
    this.fireEmitter = new ParticleEmitter({
      poolSize: MAX_PARTICLES,
      color: new Color(0xff6600),
      size: 8,
      lifetime: MAX_LIFETIME,
      spread: MAX_SPREAD,
      opacity: 0.9,
    })
    this.debrisEmitter = new ParticleEmitter({
      poolSize: MAX_PARTICLES,
      color: new Color(0x888888),
      size: 4,
      lifetime: MAX_LIFETIME,
      spread: MAX_SPREAD,
      opacity: 0.6,
    })
  }

  /**
   * Trigger an explosion at the given position.
   *
   * @param position - World position of the crash
   * @param impactSpeed - Absolute impact velocity (higher = bigger explosion)
   */
  explode(position: Vector3, impactSpeed: number): void {
    const ratio = Math.min(1, impactSpeed / MAX_IMPACT_SPEED)
    const count = Math.round(MIN_PARTICLES + (MAX_PARTICLES - MIN_PARTICLES) * ratio)
    const spread = MIN_SPREAD + (MAX_SPREAD - MIN_SPREAD) * ratio
    const force = BURST_FORCE * (0.5 + ratio * 0.5)

    for (let i = 0; i < count; i++) {
      // Random direction in a hemisphere (upward burst)
      const angle = Math.random() * Math.PI * 2
      const elevation = Math.random() * Math.PI * 0.5
      const dir = new Vector3(
        Math.cos(angle) * Math.cos(elevation) * spread / MAX_SPREAD,
        Math.sin(elevation),
        Math.sin(angle) * Math.cos(elevation) * spread / MAX_SPREAD,
      ).multiplyScalar(force)

      this.fireEmitter.emit(position, dir)
    }

    // Debris — fewer, slower, darker
    const debrisCount = Math.round(count * 0.5)
    for (let i = 0; i < debrisCount; i++) {
      const angle = Math.random() * Math.PI * 2
      const elevation = Math.random() * Math.PI * 0.4
      const dir = new Vector3(
        Math.cos(angle) * Math.cos(elevation),
        Math.sin(elevation),
        Math.sin(angle) * Math.cos(elevation),
      ).multiplyScalar(force * 0.6)

      this.debrisEmitter.emit(position, dir)
    }
  }

  /** Tick both emitters. */
  tick(dt: number): void {
    this.fireEmitter.tick(dt)
    this.debrisEmitter.tick(dt)
  }

  /** Dispose both emitters. */
  dispose(): void {
    this.fireEmitter.dispose()
    this.debrisEmitter.dispose()
  }
}
```

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/three/LanderExplosion.ts
git commit -m "feat(vfx): add LanderExplosion — impact-scaled particle burst"
```

---

### Task 3: Add `crashed` State to Level State Machine

**Files:**
- Modify: `src/lib/level/levelStateMachine.ts`
- Modify: `src/lib/__tests__/levelStateMachine.spec.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/lib/__tests__/levelStateMachine.spec.ts`:

```ts
describe('crashed state', () => {
  /** Helper to get a state machine into lander state. */
  function toLanderState(overrides?: Partial<LevelStateMachineOptions>) {
    const sm = createLevelStateMachine({
      onStateChange: vi.fn(),
      isLanderGrounded: () => true,
      ...overrides,
    })
    sm.tick(ARRIVAL_DURATION + 0.1)
    expect(sm.state).toBe('lander')
    return sm
  }

  it('transitions lander → crashed on crash trigger', () => {
    const sm = toLanderState()
    expect(sm.trigger('crash')).toBe(true)
    expect(sm.state).toBe('crashed')
  })

  it('auto-transitions crashed → lander after CRASH_DURATION', () => {
    const sm = toLanderState()
    sm.trigger('crash')
    sm.tick(CRASH_DURATION + 0.1)
    expect(sm.state).toBe('lander')
  })
})
```

Add `CRASH_DURATION` to the import line:

```ts
import { createLevelStateMachine, ARRIVAL_DURATION, EXFIL_SEQUENCE_DURATION, CRASH_DURATION } from '@/lib/level/levelStateMachine'
import type { LevelStateMachineOptions } from '@/lib/level/levelStateMachine'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/__tests__/levelStateMachine.spec.ts`
Expected: FAIL — `CRASH_DURATION` not exported, `crash` trigger not defined.

- [ ] **Step 3: Implement crashed state**

In `src/lib/level/levelStateMachine.ts`:

1. Add `'crashed'` to `LevelState` type:

```ts
export type LevelState = 'arrival' | 'lander' | 'eva' | 'dead' | 'crashed' | 'exfil' | 'complete' | 'failed'
```

2. Add constants:

```ts
/** Seconds on the crash screen before respawn/fail. */
export const CRASH_DURATION = 3.0

/** Maximum safe landing speed (abs velocityY) in units/s. */
export const SAFE_LANDING_SPEED = 5.0

/** Starting lives for a level. */
export const STARTING_LIVES = 3
```

3. Add `crash` trigger to `lander` state and `crashed` state definition:

```ts
lander: {
  on: {
    exitVehicle: {
      target: 'eva',
      guard: () => isGrounded(),
    },
    exfiltrate: {
      target: 'exfil',
      guard: () => isNearShuttle() && hasEva(),
    },
    crash: 'crashed',
  },
},
```

```ts
crashed: {
  duration: CRASH_DURATION,
  next: 'lander',
},
```

Note: The `crashed → lander` auto-transition is the default path. `LevelViewController` will intercept via `onStateChange` to redirect to `failed` when lives run out — it calls `setState('failed')` which overrides the auto-transition.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/__tests__/levelStateMachine.spec.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/level/levelStateMachine.ts src/lib/__tests__/levelStateMachine.spec.ts
git commit -m "feat(level): add crashed state — crash trigger, 3s duration, auto-respawn"
```

---

### Task 4: Wire Crash Mechanics into LevelViewController

**Files:**
- Modify: `src/views/LevelViewController.ts`

- [ ] **Step 1: Add imports and fields**

Add imports:

```ts
import { CRASH_DURATION, STARTING_LIVES } from '@/lib/level/levelStateMachine'
import { LanderExplosion } from '@/three/LanderExplosion'
```

Add fields after `hasExitedVehicle`:

```ts
// ── Crash / lives tracking ────────────────────────────────────
private livesRemaining = STARTING_LIVES
private landerExplosion: LanderExplosion | null = null
/** Lander spawn position (above shuttle) for respawn. */
private landerSpawnPos = new Vector3()
```

- [ ] **Step 2: Create explosion system in init()**

After the projectile/impact emitter setup (around line 275), add:

```ts
// ── Lander explosion VFX ───────────────────────────────────────
this.landerExplosion = new LanderExplosion()
this.sceneManager.addToScene(this.landerExplosion.fireEmitter.points)
this.sceneManager.addToScene(this.landerExplosion.debrisEmitter.points)
```

After the lander spawn position is set (line 196–197, `this.landerController.group.position.set(spawnX, ...)`), store it:

```ts
this.landerSpawnPos.set(spawnX, LANDER_SPAWN_HEIGHT, spawnZ)
```

- [ ] **Step 3: Wire onCrash callback on LanderController**

After `this.landerController` is created and loaded (around line 197), add:

```ts
this.landerController.onCrash = () => {
  this.stateMachine?.trigger('crash')
}
```

- [ ] **Step 4: Add enterCrashed() and handle respawn**

```ts
private enterCrashed(): void {
  // Explode at lander position
  const crashPos = this.landerController!.group.position.clone()
  const impactSpeed = Math.abs(this.landerController!.body.impactVelocityY)
  this.landerExplosion!.explode(crashPos, impactSpeed)

  // Hide lander
  this.landerController!.group.visible = false

  // Unregister lander physics (stop movement during crash screen)
  this.tickHandler!.unregister(this.landerController!)
  this.tickHandler!.unregister(this.vehicleCamera!)

  // Register explosion emitter for ticking
  this.tickHandler!.register(this.landerExplosion!, TICK_PRIORITY_PHYSICS + 3)

  // Deduct life
  this.livesRemaining -= 1
}

private exitCrashed(): void {
  // Stop ticking explosion
  this.tickHandler!.unregister(this.landerExplosion!)

  if (this.livesRemaining <= 0) {
    // No lives left — will transition to failed
    return
  }

  // Respawn lander at shuttle
  this.landerController!.resetForRespawn(this.landerSpawnPos)
  this.tickHandler!.register(this.landerController!, TICK_PRIORITY_PHYSICS)
  this.tickHandler!.register(this.vehicleCamera!, TICK_PRIORITY_RENDER - 2)
  this.vehicleCamera!.controls.enabled = true
  this.sceneManager!.setCamera(this.vehicleCamera!)
  this.sceneManager!.setActiveCamera(null)
}
```

- [ ] **Step 5: Wire crashed into onStateTransition()**

In the `switch (_previous)` block, add:

```ts
case 'crashed':
  this.exitCrashed()
  break
```

In the `switch (current)` block, add:

```ts
case 'crashed':
  this.enterCrashed()
  break
```

- [ ] **Step 6: Intercept crashed→lander when no lives remain**

In `onStateTransition`, at the top of the method (before the switch blocks), add:

```ts
// Override crashed → lander when out of lives
if (current === 'lander' && _previous === 'crashed' && this.livesRemaining <= 0) {
  this.stateMachine!.setState('failed' as LevelState)
  return
}
```

- [ ] **Step 7: Add crash fade to tick()**

In the `tick()` method, after the dead state block, add:

```ts
// Crashed: fade to black during crash screen
if (this.stateMachine?.is('crashed')) {
  const elapsed = this.stateMachine.stateTime
  const fadeProgress = Math.min(1, elapsed / (CRASH_DURATION * 0.5))
  this.onDeathFade?.(fadeProgress)
} else if (!this.stateMachine?.is('dead') && !this.stateMachine?.is('eva')) {
  // Clear fade when not in crash/dead/eva-hypoxia
  this.onDeathFade?.(0)
}
```

Note: Be careful not to conflict with the existing hypoxia fade in the EVA block or the dead state fade. The existing `this.onDeathFade?.(0)` in the EVA block already handles clearing for EVA. Add this crash fade check only for the `crashed` state specifically.

- [ ] **Step 8: Add lives to lander telemetry broadcast**

In the tick lander telemetry section, add `lives` to the telemetry object:

```ts
lives: this.livesRemaining,
```

- [ ] **Step 9: Dispose explosion**

In `dispose()`, add before `this.landerController?.dispose()`:

```ts
this.landerExplosion?.dispose()
```

- [ ] **Step 10: Add dev console crash command**

In the DevConsole.register block, add:

```ts
crash: () => this.stateMachine?.trigger('crash'),
```

- [ ] **Step 11: Run type-check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 12: Commit**

```bash
git add src/views/LevelViewController.ts
git commit -m "feat(level): wire crash mechanics — explosion VFX, lives, respawn at shuttle"
```

---

### Task 5: Add Lives Display to Lander HUD

**Files:**
- Modify: `src/components/LanderHud.vue`

- [ ] **Step 1: Add lives to LanderTelemetry**

In the `LanderTelemetry` interface, add:

```ts
lives: number
```

- [ ] **Step 2: Add lives icons to the template**

After the readouts section (after the `posX/posZ` readout div), add:

```html
<!-- Lives -->
<div class="lander-lives">
  <span v-for="i in props.telemetry.lives" :key="i" class="lander-life-icon">▲</span>
</div>
```

The `▲` triangle resembles a lander silhouette. Simple and effective.

- [ ] **Step 3: Update LevelView.vue telemetry reactive**

In `src/views/LevelView.vue`, add `lives: 3` to the `landerTelemetry` reactive object:

```ts
const landerTelemetry = reactive<LanderTelemetry>({
  altitude: 0,
  velocityY: 0,
  posX: 0,
  posZ: 0,
  fuelLevel: 0,
  fuelCapacity: 0,
  mainEngineCharge: 0,
  mainEngineCapacity: 0,
  rcsCharge: 0,
  rcsCapacity: 0,
  lives: 3,
})
```

- [ ] **Step 4: Run type-check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/LanderHud.vue src/views/LevelView.vue
git commit -m "feat(hud): show lives as lander silhouette icons in lander HUD"
```

---

### Task 6: Type-check, Lint, and Verify

**Files:**
- All modified files

- [ ] **Step 1: Run type-check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 2: Run linter**

Run: `bun lint`
Expected: No new errors.

- [ ] **Step 3: Run tests**

Run: `bun test:unit`
Expected: All tests pass including the new crashed state tests.

- [ ] **Step 4: Manual smoke test**

Run: `bun dev` and verify:
1. Land gently (VEL < 5, level) → safe landing, can exit vehicle
2. Come in fast (VEL > 5) → crash explosion, fade to black, respawn at shuttle altitude
3. Come in tilted (> 10°) → same crash behavior
4. Crash intensity scales — fast crash = big explosion, slow crash = small
5. Lives icons show in lander HUD, decrease on each crash
6. Third crash → failed state, redirect to `/`
7. DevConsole `LevelView.crash()` triggers crash from any lander state

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(level): address lint and type issues from crash mechanics"
```
