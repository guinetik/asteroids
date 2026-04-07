# Lander Crash Mechanics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add HP to the lander with damage on hard landings proportional to impact speed/angle, explosion VFX, and game over on destruction.

**Architecture:** `PlatformerBody` captures impact velocity. `LanderController` gets HP + damage + crash callbacks. `LanderExplosion` provides scaled VFX. `LevelViewController` wires explosion and death→failed transition. HUD shows HP bar.

**Tech Stack:** TypeScript, Three.js, Vue 3

**Spec:** `docs/superpowers/specs/2026-04-06-lander-crash-mechanics-design.md`

---

### Task 1: Add Impact Velocity Capture to PlatformerBody

**Files:**
- Modify: `src/lib/physics/platformerBody.ts`

- [ ] **Step 1: Add impactVelocityY field**

After line 42 (`velocityY = 0`), add:

```ts
/** Vertical velocity at the moment of the last ground contact (always <= 0). */
impactVelocityY = 0
```

- [ ] **Step 2: Capture velocity before zeroing in tick()**

In the ground collision block (line 75), change:

```ts
if (newY <= floorY) {
  newY = floorY
  this.velocityY = 0
  this.grounded = true
}
```

To:

```ts
if (newY <= floorY) {
  newY = floorY
  this.impactVelocityY = this.velocityY
  this.velocityY = 0
  this.grounded = true
}
```

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`

- [ ] **Step 4: Commit**

```bash
git add src/lib/physics/platformerBody.ts
git commit -m "feat(physics): capture impact velocity on ground contact"
```

---

### Task 2: Add HP and Crash Detection to LanderController

**Files:**
- Modify: `src/three/LanderController.ts`

- [ ] **Step 1: Add crash constants**

After `GROUND_TILT_LERP_SPEED` (line 131), add:

```ts
/** Maximum safe landing speed (abs velocityY) — no damage below this. */
const SAFE_LANDING_SPEED = 5.0

/** Maximum safe landing angle (combined tilt magnitude, radians ~10°). */
const SAFE_LANDING_ANGLE = 0.175

/** HP damage per unit of excess landing speed. */
const SPEED_DAMAGE_MULTIPLIER = 3.0

/** HP damage per radian of excess landing tilt. */
const ANGLE_DAMAGE_MULTIPLIER = 40.0

/** Lander starting and maximum HP. */
const LANDER_MAX_HP = 100
```

- [ ] **Step 2: Add HP fields, callbacks, and wasGrounded tracker**

Add to the class after `liftoffBoostTimer` (line 166):

```ts
/** Current lander hit points. */
private _hp = LANDER_MAX_HP

/** Maximum lander hit points. */
readonly maxHp = LANDER_MAX_HP

/** Current HP (read-only). */
get hp(): number {
  return this._hp
}

/** Tracks whether lander was grounded last frame. */
private wasGrounded = false

/** Called on hard landing with damage dealt and impact speed. */
onCrash: ((damage: number, impactSpeed: number) => void) | null = null

/** Called when HP reaches 0. */
onDeath: (() => void) | null = null
```

- [ ] **Step 3: Add takeDamage method**

```ts
/** Apply damage to the lander. Fires onDeath when HP reaches 0. */
takeDamage(amount: number): void {
  this._hp = Math.max(0, this._hp - amount)
  if (this._hp <= 0) {
    this.onDeath?.()
  }
}
```

- [ ] **Step 4: Add resetForRespawn method**

```ts
/** Reset lander state for repositioning (e.g. after exfil setup). */
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

- [ ] **Step 5: Add landing evaluation in tick()**

After `this.group.position.y = this.body.tick(dt, this.group.position.y, floorY)` (line 279), add:

```ts
// Detect landing transition (airborne → grounded) and evaluate safety
if (this.body.grounded && !this.wasGrounded) {
  const impactSpeed = Math.abs(this.body.impactVelocityY)
  const impactAngle = Math.sqrt(this.tiltX * this.tiltX + this.tiltZ * this.tiltZ)
  const speedExcess = Math.max(0, impactSpeed - SAFE_LANDING_SPEED)
  const angleExcess = Math.max(0, impactAngle - SAFE_LANDING_ANGLE)
  const damage = speedExcess * SPEED_DAMAGE_MULTIPLIER + angleExcess * ANGLE_DAMAGE_MULTIPLIER
  if (damage > 0) {
    this.takeDamage(damage)
    this.onCrash?.(damage, impactSpeed)
  }
}
this.wasGrounded = this.body.grounded
```

- [ ] **Step 6: Run type-check**

Run: `bun run type-check`

- [ ] **Step 7: Commit**

```bash
git add src/three/LanderController.ts
git commit -m "feat(lander): add HP system with crash damage on hard landings"
```

---

### Task 3: Create LanderExplosion VFX

**Files:**
- Create: `src/three/LanderExplosion.ts`

- [ ] **Step 1: Create the explosion controller**

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
/** Explosion burst force. */
const BURST_FORCE = 30

/**
 * Crash explosion — emits fire + debris particles scaled to impact speed.
 * Create once per level, call `explode()` on each hard landing.
 *
 * @author guinetik
 * @date 2026-04-06
 */
export class LanderExplosion implements Tickable {
  /** Fire/sparks emitter (orange). */
  readonly fireEmitter: ParticleEmitter
  /** Debris emitter (grey). */
  readonly debrisEmitter: ParticleEmitter

  constructor() {
    this.fireEmitter = new ParticleEmitter({
      poolSize: MAX_PARTICLES,
      color: new Color(0xff6600),
      size: 8,
      lifetime: 1.5,
      spread: 40,
      opacity: 0.9,
    })
    this.debrisEmitter = new ParticleEmitter({
      poolSize: MAX_PARTICLES,
      color: new Color(0x888888),
      size: 4,
      lifetime: 1.5,
      spread: 40,
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
    const force = BURST_FORCE * (0.5 + ratio * 0.5)

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const elevation = Math.random() * Math.PI * 0.5
      const dir = new Vector3(
        Math.cos(angle) * Math.cos(elevation),
        Math.sin(elevation),
        Math.sin(angle) * Math.cos(elevation),
      ).multiplyScalar(force)
      this.fireEmitter.emit(position, dir)
    }

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

- [ ] **Step 3: Commit**

```bash
git add src/three/LanderExplosion.ts
git commit -m "feat(vfx): add LanderExplosion — impact-scaled fire and debris burst"
```

---

### Task 4: Wire Crash into LevelViewController and HUD

**Files:**
- Modify: `src/views/LevelViewController.ts`
- Modify: `src/components/LanderHud.vue`
- Modify: `src/views/LevelView.vue`

- [ ] **Step 1: Add imports and fields to LevelViewController**

Add import:

```ts
import { LanderExplosion } from '@/three/LanderExplosion'
```

Add field after `hasExitedVehicle`:

```ts
private landerExplosion: LanderExplosion | null = null
```

- [ ] **Step 2: Create explosion in init()**

After the impact emitter setup (after `this.multiTool.setProjectileSystem(this.projectileSystem)`, around line 277), add:

```ts
// ── Lander explosion VFX ───────────────────────────────────────
this.landerExplosion = new LanderExplosion()
this.sceneManager.addToScene(this.landerExplosion.fireEmitter.points)
this.sceneManager.addToScene(this.landerExplosion.debrisEmitter.points)
```

- [ ] **Step 3: Wire onCrash and onDeath on LanderController**

After the lander is loaded and positioned (after `this.landerController.group.position.set(...)`, around line 197), add:

```ts
this.landerController.onCrash = (damage, impactSpeed) => {
  this.landerExplosion!.explode(this.landerController!.group.position.clone(), impactSpeed)
}

this.landerController.onDeath = () => {
  // Maximum explosion
  this.landerExplosion!.explode(this.landerController!.group.position.clone(), 20)
  this.landerController!.group.visible = false
  this.stateMachine?.setState('failed' as LevelState)
}
```

- [ ] **Step 4: Register explosion for ticking in enterLander()**

In `enterLander()`, add after the existing register calls:

```ts
this.tickHandler!.register(this.landerExplosion!, TICK_PRIORITY_PHYSICS + 3)
```

In `exitLander()`, add:

```ts
this.tickHandler!.unregister(this.landerExplosion!)
```

- [ ] **Step 5: Add hp/maxHp to lander telemetry broadcast**

In the tick lander telemetry section, add to the telemetry object:

```ts
hp: this.landerController.hp,
maxHp: this.landerController.maxHp,
```

- [ ] **Step 6: Add dev console commands**

In the DevConsole.register block, add:

```ts
landerDamage: (amount = 20) => this.landerController?.takeDamage(amount),
landerDestroy: () => this.landerController?.takeDamage(999),
```

- [ ] **Step 7: Dispose explosion in dispose()**

Add before `this.landerController?.dispose()`:

```ts
this.landerExplosion?.dispose()
```

- [ ] **Step 8: Add hp/maxHp to LanderTelemetry and LanderHud**

In `src/components/LanderHud.vue`, add to the `LanderTelemetry` interface:

```ts
hp: number
maxHp: number
```

Add HP bar to the template, after the fuel bar section:

```html
<!-- HP bar -->
<div class="lander-hud-fuel">
  <span class="hud-readout">HULL</span>
  <div class="hud-fuel-track">
    <div
      class="hud-fuel-fill"
      :class="fuelColor(props.telemetry.hp, props.telemetry.maxHp)"
      :style="{ width: pct(props.telemetry.hp, props.telemetry.maxHp) + '%' }"
    ></div>
  </div>
</div>
```

This reuses the existing `fuelColor` helper (green > 50%, yellow > 20%, red below) and `hud-fuel-track` styles.

- [ ] **Step 9: Update LevelView.vue telemetry reactive**

In `src/views/LevelView.vue`, add to the `landerTelemetry` reactive:

```ts
hp: 100,
maxHp: 100,
```

- [ ] **Step 10: Run type-check**

Run: `bun run type-check`

- [ ] **Step 11: Run tests**

Run: `bun test:unit`

- [ ] **Step 12: Commit**

```bash
git add src/views/LevelViewController.ts src/components/LanderHud.vue src/views/LevelView.vue
git commit -m "feat(level): wire lander crash — explosion VFX, HP bar, death → failed"
```
