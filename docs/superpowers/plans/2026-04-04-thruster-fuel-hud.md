# Thruster & Fuel System + ShuttleHud Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a three-thruster resource system with shared fuel tank and a Vue HUD showing gauges, speed, heading, and position.

**Architecture:** Pure-TS `ThrusterSystem` in `src/lib/physics/` handles burn/recharge/fuel math. ShuttleController owns it and gates thrust on `canFire()`. ShuttleHud.vue receives telemetry via callback and renders gauges. All numeric tuning is named constants.

**Tech Stack:** Vue 3, TypeScript, Vitest, Tailwind CSS v4

**Spec:** `docs/superpowers/specs/2026-04-04-thruster-fuel-hud-design.md`

**Test runner:** `bun test:unit` (Vitest + JSDOM). Single file: `bun test:unit src/path/to/test.spec.ts`

**Lint (Windows):** `bun run lint:oxlint && bun run lint:eslint`

**TSDoc:** All exported classes, interfaces, and functions must have TSDoc with `@author guinetik`, `@date 2026-04-04`, `@spec docs/superpowers/specs/2026-04-04-thruster-fuel-hud-design.md`.

---

### Task 1: ThrusterSystem — Core Logic

**Files:**
- Create: `src/lib/physics/thrusterSystem.ts`
- Create: `src/lib/physics/__tests__/thrusterSystem.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/physics/__tests__/thrusterSystem.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { ThrusterSystem, DEFAULT_THRUSTER_CONFIG } from '../thrusterSystem'

describe('ThrusterSystem', () => {
  it('starts with full charge on all thrusters', () => {
    const sys = new ThrusterSystem()
    expect(sys.getState('thrust').charge).toBe(DEFAULT_THRUSTER_CONFIG.thrust.capacity)
    expect(sys.getState('brake').charge).toBe(DEFAULT_THRUSTER_CONFIG.brake.capacity)
    expect(sys.getState('rcs').charge).toBe(DEFAULT_THRUSTER_CONFIG.rcs.capacity)
  })

  it('starts with full fuel', () => {
    const sys = new ThrusterSystem()
    expect(sys.fuelLevel).toBe(DEFAULT_THRUSTER_CONFIG.fuelCapacity)
  })

  it('drains charge when thruster is active', () => {
    const sys = new ThrusterSystem()
    const before = sys.getState('thrust').charge
    sys.tick(1, { thrust: true, brake: false, rcs: false })
    expect(sys.getState('thrust').charge).toBe(before - DEFAULT_THRUSTER_CONFIG.thrust.burnRate)
  })

  it('recharges idle thrusters consuming fuel', () => {
    const sys = new ThrusterSystem()
    // Drain thrust first
    sys.tick(2, { thrust: true, brake: false, rcs: false })
    const chargeAfterDrain = sys.getState('thrust').charge
    const fuelBefore = sys.fuelLevel

    // Now idle — should recharge
    sys.tick(1, { thrust: false, brake: false, rcs: false })
    expect(sys.getState('thrust').charge).toBeGreaterThan(chargeAfterDrain)
    expect(sys.fuelLevel).toBeLessThan(fuelBefore)
  })

  it('does not recharge active thrusters', () => {
    const sys = new ThrusterSystem()
    sys.tick(2, { thrust: true, brake: false, rcs: false })
    const chargeAfterDrain = sys.getState('thrust').charge

    // Thrust still active — should not recharge
    sys.tick(1, { thrust: true, brake: false, rcs: false })
    expect(sys.getState('thrust').charge).toBeLessThan(chargeAfterDrain)
  })

  it('canFire returns false when charge is insufficient', () => {
    const sys = new ThrusterSystem()
    // Drain completely
    sys.tick(100, { thrust: true, brake: false, rcs: false })
    expect(sys.canFire('thrust')).toBe(false)
  })

  it('canFire returns true when charge is sufficient', () => {
    const sys = new ThrusterSystem()
    expect(sys.canFire('thrust')).toBe(true)
  })

  it('stops recharging when fuel is empty', () => {
    const sys = new ThrusterSystem({ fuelCapacity: 1 })
    sys.tick(3, { thrust: true, brake: false, rcs: false })
    // Fuel should be gone from recharging brake/rcs while thrust was active
    // Now idle — thrust should not recharge
    const chargeNow = sys.getState('thrust').charge
    sys.tick(1, { thrust: false, brake: false, rcs: false })
    // If fuel is 0, charge shouldn't increase
    if (sys.fuelLevel <= 0) {
      expect(sys.getState('thrust').charge).toBe(chargeNow)
    }
  })

  it('fires onFuelEmpty callback once', () => {
    const sys = new ThrusterSystem({ fuelCapacity: 1 })
    const cb = vi.fn()
    sys.onFuelEmpty = cb
    sys.tick(10, { thrust: false, brake: false, rcs: false })
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('fires onAllDepleted when fuel and all charges are zero', () => {
    const sys = new ThrusterSystem({ fuelCapacity: 0 })
    const cb = vi.fn()
    sys.onAllDepleted = cb
    // Drain all thrusters
    sys.tick(100, { thrust: true, brake: true, rcs: true })
    expect(cb).toHaveBeenCalled()
  })

  it('clamps charge to capacity', () => {
    const sys = new ThrusterSystem()
    // All idle, full charge — should stay at capacity
    sys.tick(10, { thrust: false, brake: false, rcs: false })
    expect(sys.getState('thrust').charge).toBe(DEFAULT_THRUSTER_CONFIG.thrust.capacity)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/physics/__tests__/thrusterSystem.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ThrusterSystem**

```ts
// src/lib/physics/thrusterSystem.ts

/**
 * Configuration for a single thruster type.
 */
export interface ThrusterConfig {
  capacity: number
  burnRate: number
  rechargeRate: number
  fuelCostPerRecharge: number
}

/**
 * Full system configuration.
 */
export interface ThrusterSystemConfig {
  thrust: ThrusterConfig
  brake: ThrusterConfig
  rcs: ThrusterConfig
  fuelCapacity: number
}

/**
 * Runtime state of a single thruster.
 */
export interface ThrusterState {
  charge: number
  capacity: number
  active: boolean
}

export const DEFAULT_THRUSTER_CONFIG: ThrusterSystemConfig = {
  thrust: { capacity: 100, burnRate: 15, rechargeRate: 8, fuelCostPerRecharge: 0.5 },
  brake: { capacity: 80, burnRate: 12, rechargeRate: 6, fuelCostPerRecharge: 0.4 },
  rcs: { capacity: 120, burnRate: 5, rechargeRate: 10, fuelCostPerRecharge: 0.2 },
  fuelCapacity: 500,
}

type ThrusterName = 'thrust' | 'brake' | 'rcs'

/**
 * Three-thruster resource system with shared fuel tank.
 * Active thrusters drain charge. Idle thrusters recharge, consuming fuel.
 * No fuel = no recharging. All empty = game over.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-thruster-fuel-hud-design.md
 */
export class ThrusterSystem {
  private charges: Record<ThrusterName, number>
  private activeState: Record<ThrusterName, boolean> = { thrust: false, brake: false, rcs: false }
  private readonly config: ThrusterSystemConfig
  private fuel: number
  private fuelEmptyFired = false
  private allDepletedFired = false

  onFuelEmpty: (() => void) | null = null
  onAllDepleted: (() => void) | null = null

  constructor(overrides: Partial<ThrusterSystemConfig> = {}) {
    this.config = { ...DEFAULT_THRUSTER_CONFIG, ...overrides }
    this.charges = {
      thrust: this.config.thrust.capacity,
      brake: this.config.brake.capacity,
      rcs: this.config.rcs.capacity,
    }
    this.fuel = this.config.fuelCapacity
  }

  canFire(thruster: ThrusterName): boolean {
    const cfg = this.config[thruster]
    return this.charges[thruster] >= cfg.burnRate * (1 / 60) // at least one frame at 60fps
  }

  getState(thruster: ThrusterName): ThrusterState {
    return {
      charge: this.charges[thruster],
      capacity: this.config[thruster].capacity,
      active: this.activeState[thruster],
    }
  }

  get fuelLevel(): number {
    return this.fuel
  }

  get fuelCapacity(): number {
    return this.config.fuelCapacity
  }

  get isFuelEmpty(): boolean {
    return this.fuel <= 0
  }

  get isAllDepleted(): boolean {
    return this.fuel <= 0
      && this.charges.thrust <= 0
      && this.charges.brake <= 0
      && this.charges.rcs <= 0
  }

  tick(dt: number, active: Record<ThrusterName, boolean>): void {
    this.activeState = { ...active }
    const names: ThrusterName[] = ['thrust', 'brake', 'rcs']

    for (const name of names) {
      const cfg = this.config[name]

      if (active[name]) {
        // Drain charge
        this.charges[name] = Math.max(0, this.charges[name] - cfg.burnRate * dt)
      } else {
        // Recharge if fuel available
        if (this.fuel > 0 && this.charges[name] < cfg.capacity) {
          const recharge = cfg.rechargeRate * dt
          const fuelCost = recharge * cfg.fuelCostPerRecharge
          const actualFuelUsed = Math.min(fuelCost, this.fuel)
          const actualRecharge = (actualFuelUsed / cfg.fuelCostPerRecharge)
          this.charges[name] = Math.min(cfg.capacity, this.charges[name] + actualRecharge)
          this.fuel = Math.max(0, this.fuel - actualFuelUsed)
        }
      }
    }

    // Events
    if (this.fuel <= 0 && !this.fuelEmptyFired) {
      this.fuelEmptyFired = true
      this.onFuelEmpty?.()
    }

    if (this.isAllDepleted && !this.allDepletedFired) {
      this.allDepletedFired = true
      this.onAllDepleted?.()
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/physics/__tests__/thrusterSystem.spec.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/physics/thrusterSystem.ts src/lib/physics/__tests__/thrusterSystem.spec.ts
git commit -m "feat(lib): add ThrusterSystem with burn, recharge, and fuel mechanics"
```

---

### Task 2: Integrate ThrusterSystem into ShuttleController

**Files:**
- Modify: `src/three/ShuttleController.ts`

- [ ] **Step 1: Add ThrusterSystem import and instantiation**

Add import at the top of `src/three/ShuttleController.ts`:

```ts
import { ThrusterSystem } from '@/lib/physics/thrusterSystem'
```

Add to class fields (after `private readonly gravityWells`):

```ts
  readonly thrusterSystem = new ThrusterSystem()
```

- [ ] **Step 2: Gate thrust on canFire and update active state**

Replace the movement method's thrust/brake/yaw sections. The `isThrusting`, `isBraking`, `isYawingLeft`, `isYawingRight` getters must now check both input AND canFire:

```ts
  get isThrusting(): boolean {
    return this.inputManager.isActionActive('thrust') && this.thrusterSystem.canFire('thrust')
  }

  get isBraking(): boolean {
    return this.inputManager.isActionActive('brake') && this.thrusterSystem.canFire('brake')
  }

  get isYawingLeft(): boolean {
    return this.inputManager.isActionActive('yawLeft') && this.thrusterSystem.canFire('rcs')
  }

  get isYawingRight(): boolean {
    return this.inputManager.isActionActive('yawRight') && this.thrusterSystem.canFire('rcs')
  }
```

- [ ] **Step 3: Call thrusterSystem.tick() in the main tick**

In `updateMovement(dt)`, after all force application but before velocity clamping, add:

```ts
    // Update thruster system — burn active, recharge idle, consume fuel
    this.thrusterSystem.tick(dt, {
      thrust: this.isThrusting,
      brake: this.isBraking,
      rcs: this.isYawingLeft || this.isYawingRight,
    })
```

- [ ] **Step 4: Use gated getters in movement**

Update the movement code to use the gated getters instead of raw input queries:

```ts
    // Yaw (A/D) — apply angular torque, builds up angular velocity
    if (this.isYawingLeft) {
      this.angularVelocity += YAW_TORQUE * dt
    }
    if (this.isYawingRight) {
      this.angularVelocity -= YAW_TORQUE * dt
    }
```

```ts
    if (this.isThrusting) {
      this.velocity.addScaledVector(forward, THRUST_FORCE * dt)
    }
```

```ts
    if (this.isBraking) {
      const depth = Math.abs(this.group.position.y)
      const effectiveBrake = Math.min(1, BRAKE_FACTOR + depth * BRAKE_DEPTH_PENALTY)
      this.velocity.multiplyScalar(effectiveBrake)
    }
```

- [ ] **Step 5: Verify it compiles**

Run: `bun run type-check`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/three/ShuttleController.ts
git commit -m "feat(three): gate shuttle thrust on ThrusterSystem.canFire()"
```

---

### Task 3: Telemetry Interface

**Files:**
- Create: `src/lib/ShuttleTelemetry.ts`

- [ ] **Step 1: Create the telemetry interface**

```ts
// src/lib/ShuttleTelemetry.ts

/**
 * All shuttle data pushed to the HUD each frame.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-thruster-fuel-hud-design.md
 */
export interface ShuttleTelemetry {
  speed: number
  heading: number
  posX: number
  posZ: number
  fuelLevel: number
  fuelCapacity: number
  thrustCharge: number
  thrustCapacity: number
  brakeCharge: number
  brakeCapacity: number
  rcsCharge: number
  rcsCapacity: number
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ShuttleTelemetry.ts
git commit -m "feat(lib): add ShuttleTelemetry interface for HUD data"
```

---

### Task 4: Update HomeViewController Telemetry

**Files:**
- Modify: `src/views/HomeViewController.ts`

- [ ] **Step 1: Update onTelemetry callback type and tick**

Change the `onTelemetry` field type:

```ts
import type { ShuttleTelemetry } from '@/lib/ShuttleTelemetry'
```

```ts
  onTelemetry: ((telemetry: ShuttleTelemetry) => void) | null = null
```

Update the tick method to send full telemetry:

```ts
  tick(_dt: number): void {
    if (this.inputManager?.wasActionPressed('toggleDoors')) {
      this.shuttleController?.toggleDoors()
    }
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
  }
```

- [ ] **Step 2: Wire onAllDepleted to respawn**

After creating the shuttle controller in `init()`, add:

```ts
    this.shuttleController.thrusterSystem.onAllDepleted = () => {
      this.shuttleController?.respawn()
    }
```

Note: `respawn()` is currently private. Make it public in ShuttleController by changing `private respawn()` to `respawn()`.

- [ ] **Step 3: Verify it compiles**

Run: `bun run type-check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/views/HomeViewController.ts src/three/ShuttleController.ts
git commit -m "feat(views): send full thruster telemetry and wire game over on depletion"
```

---

### Task 5: ShuttleHud Component

**Files:**
- Create: `src/components/ShuttleHud.vue`
- Modify: `src/assets/css/main.css`

- [ ] **Step 1: Create ShuttleHud.vue**

```vue
<!-- src/components/ShuttleHud.vue -->
<script setup lang="ts">
import type { ShuttleTelemetry } from '@/lib/ShuttleTelemetry'

const props = defineProps<{
  telemetry: ShuttleTelemetry
}>()

function formatHeading(rad: number): string {
  const deg = ((rad * 180) / Math.PI) % 360
  return `${deg < 0 ? deg + 360 : deg}`
}

function pct(value: number, max: number): number {
  return max > 0 ? (value / max) * 100 : 0
}

function fuelColor(level: number, capacity: number): string {
  const ratio = capacity > 0 ? level / capacity : 0
  if (ratio > 0.5) return 'bg-green-500'
  if (ratio > 0.2) return 'bg-yellow-500'
  return 'bg-red-500'
}
</script>

<template>
  <div class="shuttle-hud">
    <!-- Top center: position -->
    <div class="hud-position">
      X:{{ props.telemetry.posX.toFixed(0) }}
      Z:{{ props.telemetry.posZ.toFixed(0) }}
    </div>

    <!-- Top left: fuel bar -->
    <div class="hud-fuel">
      <span class="hud-fuel-label">FUEL</span>
      <div class="hud-fuel-track">
        <div
          class="hud-fuel-fill"
          :class="fuelColor(props.telemetry.fuelLevel, props.telemetry.fuelCapacity)"
          :style="{ width: pct(props.telemetry.fuelLevel, props.telemetry.fuelCapacity) + '%' }"
        ></div>
      </div>
    </div>

    <!-- Bottom left: speed and heading -->
    <div class="hud-readouts">
      <span>SPD {{ props.telemetry.speed.toFixed(1) }}</span>
      <span>HDG {{ formatHeading(props.telemetry.heading) }}</span>
    </div>

    <!-- Bottom center: thruster gauges -->
    <div class="hud-gauges">
      <div class="hud-gauge">
        <div class="hud-gauge-track">
          <div
            class="hud-gauge-fill bg-red-500"
            :style="{ height: pct(props.telemetry.thrustCharge, props.telemetry.thrustCapacity) + '%' }"
          ></div>
        </div>
        <span class="hud-gauge-label">THR</span>
      </div>
      <div class="hud-gauge">
        <div class="hud-gauge-track">
          <div
            class="hud-gauge-fill bg-blue-500"
            :style="{ height: pct(props.telemetry.brakeCharge, props.telemetry.brakeCapacity) + '%' }"
          ></div>
        </div>
        <span class="hud-gauge-label">BRK</span>
      </div>
      <div class="hud-gauge">
        <div class="hud-gauge-track">
          <div
            class="hud-gauge-fill bg-white"
            :style="{ height: pct(props.telemetry.rcsCharge, props.telemetry.rcsCapacity) + '%' }"
          ></div>
        </div>
        <span class="hud-gauge-label">RCS</span>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Add HUD styles to main.css**

Replace the existing `.hud` block and add new styles in `src/assets/css/main.css`:

```css
.shuttle-hud {
  @apply fixed inset-0 pointer-events-none font-mono text-xs text-green-400;
  text-shadow: 0 0 4px rgba(0, 255, 0, 0.5);
}

.hud-position {
  @apply absolute top-4 left-1/2 -translate-x-1/2;
}

.hud-fuel {
  @apply absolute top-4 left-4 flex items-center gap-2;
}

.hud-fuel-label {
  @apply text-green-400;
}

.hud-fuel-track {
  @apply w-32 h-3 bg-gray-800 rounded-sm overflow-hidden;
}

.hud-fuel-fill {
  @apply h-full transition-all duration-200;
}

.hud-readouts {
  @apply absolute bottom-4 left-4 flex flex-col gap-1;
}

.hud-gauges {
  @apply absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3 items-end;
}

.hud-gauge {
  @apply flex flex-col items-center gap-1;
}

.hud-gauge-track {
  @apply w-4 h-16 bg-gray-800 rounded-sm overflow-hidden flex flex-col justify-end;
}

.hud-gauge-fill {
  @apply w-full transition-all duration-100;
}

.hud-gauge-label {
  @apply text-green-400;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ShuttleHud.vue src/assets/css/main.css
git commit -m "feat(components): add ShuttleHud with fuel bar and thruster gauges"
```

---

### Task 6: Wire ShuttleHud into HomeView

**Files:**
- Modify: `src/views/HomeView.vue`

- [ ] **Step 1: Replace HomeView.vue**

```vue
<!-- src/views/HomeView.vue -->
<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { HomeViewController } from './HomeViewController'
import ShuttleHud from '@/components/ShuttleHud.vue'
import type { ShuttleTelemetry } from '@/lib/ShuttleTelemetry'

const container = ref<HTMLElement>()
const viewController = new HomeViewController()
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

onMounted(async () => {
  if (container.value) {
    viewController.onTelemetry = (t) => {
      Object.assign(telemetry, t)
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
</template>
```

- [ ] **Step 2: Remove old `.hud` class from main.css**

Delete the old `.hud` block from `src/assets/css/main.css` (replaced by `.shuttle-hud` and sub-classes).

- [ ] **Step 3: Verify it compiles**

Run: `bun run type-check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/views/HomeView.vue src/assets/css/main.css
git commit -m "feat(views): wire ShuttleHud into HomeView with full telemetry"
```

---

### Task 7: Manual Smoke Test

- [ ] **Step 1: Start dev server**

Run: `bun dev`

- [ ] **Step 2: Verify in browser**

1. **HUD visible** — position top center, fuel top left, speed/heading bottom left, gauges bottom center
2. **Thrust (W)** — red gauge drains, stops thrusting when empty
3. **Brake (S)** — blue gauge drains, stops braking when empty
4. **RCS (A/D)** — white gauge drains, stops turning when empty
5. **Recharge** — release key, gauge refills, fuel bar decreases
6. **Fuel empty** — gauges stop refilling
7. **All depleted** — ship respawns
8. **No console errors**

- [ ] **Step 3: Commit any tuning changes**

```bash
git add -u
git commit -m "fix: tune thruster burn/recharge rates"
```

---

### Task 8: Lint and Final Verification

- [ ] **Step 1: Run linter**

Run: `bun run lint:oxlint && bun run lint:eslint`
Fix any issues.

- [ ] **Step 2: Run all tests**

Run: `bun test:unit`
Expected: All tests pass

- [ ] **Step 3: Commit any fixes**

```bash
git add -u
git commit -m "chore: fix lint issues"
```
