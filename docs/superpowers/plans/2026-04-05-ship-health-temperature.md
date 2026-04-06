# Ship Health & Temperature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hull HP and a temperature gauge to the map view shuttle — overheating near the Sun, freezing in the outer system, damage ticking at extremes, healing at Earth orbit.

**Architecture:** Pure domain logic in `src/lib/shipHealth.ts` (temperature drift, damage ticking, healing — no Three.js). MapViewController ticks it per frame with Sun distance and radiation proximity. Telemetry flows to ShuttleHud via the existing reactive pattern. Death triggers the existing death overlay.

**Tech Stack:** TypeScript, Vue 3 (reactive props), Vitest, Tailwind CSS

---

### Task 1: Ship health config JSON

**Files:**
- Create: `src/data/shuttle/ship-health.json`

- [ ] **Step 1: Create the config file**

Create `src/data/shuttle/ship-health.json`:

```json
{
  "maxHp": 100,
  "healRate": 10,
  "hotBoundary": 40,
  "coldBoundary": 350,
  "tempDriftRate": 8,
  "damageThreshold": 60,
  "maxTempDamage": 5,
  "radiationThreshold": 0.3,
  "maxRadiationDamage": 15,
  "displayThreshold": 20
}
```

- [ ] **Step 2: Commit**

```bash
git add src/data/shuttle/ship-health.json
git commit -m "feat(health): add ship-health.json config"
```

---

### Task 2: ShipHealth domain logic with TDD

**Files:**
- Create: `src/lib/shipHealth.ts`
- Create: `src/lib/__tests__/shipHealth.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/__tests__/shipHealth.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { ShipHealth } from '../shipHealth'
import type { ShipHealthConfig } from '../shipHealth'

const CONFIG: ShipHealthConfig = {
  maxHp: 100,
  healRate: 10,
  hotBoundary: 40,
  coldBoundary: 350,
  tempDriftRate: 8,
  damageThreshold: 60,
  maxTempDamage: 5,
  radiationThreshold: 0.3,
  maxRadiationDamage: 15,
  displayThreshold: 20,
}

describe('ShipHealth', () => {
  let health: ShipHealth

  beforeEach(() => {
    health = new ShipHealth(CONFIG)
  })

  it('starts at full HP and zero temperature', () => {
    expect(health.hp).toBe(100)
    expect(health.temperature).toBe(0)
  })

  // --- Temperature drift ---

  describe('temperature drift', () => {
    it('drifts toward +100 in hot zone (distance < hotBoundary)', () => {
      health.tick(1, 20, 0) // distance=20, inside hot zone
      expect(health.temperature).toBeGreaterThan(0)
    })

    it('drifts toward -100 in cold zone (distance > coldBoundary)', () => {
      health.tick(1, 500, 0) // distance=500, past cold boundary
      expect(health.temperature).toBeLessThan(0)
    })

    it('drifts toward 0 in safe zone', () => {
      // Pre-heat the ship
      health.tick(1, 20, 0) // heat up
      const heated = health.temperature
      expect(heated).toBeGreaterThan(0)
      // Now move to safe zone
      health.tick(1, 200, 0) // safe zone
      expect(health.temperature).toBeLessThan(heated)
    })

    it('clamps temperature to +100', () => {
      for (let i = 0; i < 100; i++) health.tick(1, 5, 0)
      expect(health.temperature).toBe(100)
    })

    it('clamps temperature to -100', () => {
      for (let i = 0; i < 100; i++) health.tick(1, 1000, 0)
      expect(health.temperature).toBe(-100)
    })
  })

  // --- Temperature damage ---

  describe('temperature damage', () => {
    it('does not damage hull when temp is below threshold', () => {
      health.tick(1, 20, 0) // slight heat
      expect(health.hp).toBe(100) // tempDriftRate=8, after 1s temp=8, below threshold 60
    })

    it('damages hull when temp exceeds threshold', () => {
      // Force temperature high
      for (let i = 0; i < 10; i++) health.tick(1, 5, 0) // temp drifts toward 100
      expect(health.temperature).toBeGreaterThan(60)
      const hpBefore = health.hp
      health.tick(1, 5, 0)
      expect(health.hp).toBeLessThan(hpBefore)
    })

    it('damages hull when temp is below negative threshold', () => {
      for (let i = 0; i < 10; i++) health.tick(1, 1000, 0)
      expect(health.temperature).toBeLessThan(-60)
      const hpBefore = health.hp
      health.tick(1, 1000, 0)
      expect(health.hp).toBeLessThan(hpBefore)
    })
  })

  // --- Radiation damage ---

  describe('radiation damage', () => {
    it('does not damage when proximity is below threshold', () => {
      health.tick(1, 200, 0.2) // proximity=0.2, threshold=0.3
      expect(health.hp).toBe(100)
    })

    it('damages hull when proximity exceeds threshold', () => {
      health.tick(1, 200, 0.8)
      expect(health.hp).toBeLessThan(100)
    })

    it('scales damage with proximity', () => {
      const h1 = new ShipHealth(CONFIG)
      const h2 = new ShipHealth(CONFIG)
      h1.tick(1, 200, 0.5)
      h2.tick(1, 200, 0.9)
      // h2 should have taken more damage
      expect(h2.hp).toBeLessThan(h1.hp)
    })
  })

  // --- Healing ---

  describe('healing', () => {
    it('heals HP when healing flag is true', () => {
      health.tick(1, 200, 0.8) // take radiation damage
      const damaged = health.hp
      health.tick(1, 200, 0, true) // heal
      expect(health.hp).toBeGreaterThan(damaged)
    })

    it('does not heal above maxHp', () => {
      health.tick(1, 200, 0, true)
      expect(health.hp).toBe(100)
    })
  })

  // --- Death ---

  describe('death', () => {
    it('fires onDeath when HP reaches 0', () => {
      let deathCause = ''
      health.onDeath = (cause) => { deathCause = cause }
      // Massive radiation damage
      for (let i = 0; i < 50; i++) health.tick(1, 200, 1.0)
      expect(health.hp).toBe(0)
      expect(deathCause).toBe('Radiation Exposure')
    })

    it('reports heat death cause', () => {
      let deathCause = ''
      health.onDeath = (cause) => { deathCause = cause }
      for (let i = 0; i < 100; i++) health.tick(1, 5, 0)
      expect(deathCause).toBe('Hull Overheated')
    })

    it('reports cold death cause', () => {
      let deathCause = ''
      health.onDeath = (cause) => { deathCause = cause }
      for (let i = 0; i < 100; i++) health.tick(1, 1000, 0)
      expect(deathCause).toBe('Hull Frozen')
    })
  })

  // --- Display threshold ---

  describe('display', () => {
    it('temperatureVisible is false in safe range', () => {
      expect(health.temperatureVisible).toBe(false)
    })

    it('temperatureVisible is true when temp exceeds displayThreshold', () => {
      for (let i = 0; i < 5; i++) health.tick(1, 20, 0)
      expect(Math.abs(health.temperature)).toBeGreaterThan(20)
      expect(health.temperatureVisible).toBe(true)
    })
  })

  // --- Reset ---

  describe('reset', () => {
    it('restores HP and temperature to initial values', () => {
      health.tick(1, 5, 0.8)
      health.reset()
      expect(health.hp).toBe(100)
      expect(health.temperature).toBe(0)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/__tests__/shipHealth.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ShipHealth**

Create `src/lib/shipHealth.ts`:

```ts
/**
 * Ship health and temperature domain logic.
 *
 * Tracks hull HP and temperature. Temperature drifts based on solar
 * distance — hot near the Sun, cold past the outer planets.
 * Extreme temperature and radiation proximity tick hull damage.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-ship-health-temperature-design.md
 */

/** Tuning constants loaded from ship-health.json. */
export interface ShipHealthConfig {
  /** Maximum hull points */
  maxHp: number
  /** HP restored per second while healing (Earth orbit) */
  healRate: number
  /** Distance from Sun below which heat rises (Venus orbit) */
  hotBoundary: number
  /** Distance from Sun above which cold rises (Jupiter orbit) */
  coldBoundary: number
  /** Temperature drift speed (units/s toward zone target) */
  tempDriftRate: number
  /** Temperature magnitude above which hull takes damage */
  damageThreshold: number
  /** Max hull damage per second from extreme temperature */
  maxTempDamage: number
  /** Radiation proximity above which hull takes damage */
  radiationThreshold: number
  /** Max hull damage per second from radiation */
  maxRadiationDamage: number
  /** Temperature magnitude above which the gauge is shown */
  displayThreshold: number
}

/**
 * Manages ship hull integrity and temperature.
 * Pure domain logic — no Three.js, no rendering.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-ship-health-temperature-design.md
 */
export class ShipHealth {
  private _hp: number
  private _temperature = 0
  private readonly config: ShipHealthConfig
  private _dead = false

  /** Fired when HP reaches 0 with the cause of death. */
  onDeath: ((cause: string) => void) | null = null

  constructor(config: ShipHealthConfig) {
    this.config = config
    this._hp = config.maxHp
  }

  /** Current hull points (0 = dead). */
  get hp(): number {
    return this._hp
  }

  /** Maximum hull points. */
  get maxHp(): number {
    return this.config.maxHp
  }

  /** Current temperature (-100 to +100). Positive = hot, negative = cold. */
  get temperature(): number {
    return this._temperature
  }

  /** Whether the temperature gauge should be visible. */
  get temperatureVisible(): boolean {
    return Math.abs(this._temperature) > this.config.displayThreshold
  }

  /**
   * Advance health simulation by dt seconds.
   *
   * @param dt - Delta time in seconds
   * @param sunDistance - Distance from the Sun in world units
   * @param radiationProximity - Gravity proximity to Sun (0–1)
   * @param healing - Whether the ship is healing (e.g. Earth orbit)
   */
  tick(dt: number, sunDistance: number, radiationProximity: number, healing = false): void {
    if (this._dead) return

    // --- Temperature drift ---
    let targetTemp: number
    if (sunDistance < this.config.hotBoundary) {
      targetTemp = 100
    } else if (sunDistance > this.config.coldBoundary) {
      targetTemp = -100
    } else {
      targetTemp = 0
    }

    const diff = targetTemp - this._temperature
    const drift = Math.sign(diff) * Math.min(Math.abs(diff), this.config.tempDriftRate * dt)
    this._temperature = Math.max(-100, Math.min(100, this._temperature + drift))

    // --- Temperature damage ---
    let tempDamage = 0
    const absTemp = Math.abs(this._temperature)
    if (absTemp > this.config.damageThreshold) {
      const ratio = (absTemp - this.config.damageThreshold) / (100 - this.config.damageThreshold)
      tempDamage = ratio * this.config.maxTempDamage * dt
    }

    // --- Radiation damage ---
    let radDamage = 0
    if (radiationProximity > this.config.radiationThreshold) {
      const ratio = (radiationProximity - this.config.radiationThreshold)
        / (1 - this.config.radiationThreshold)
      radDamage = ratio * this.config.maxRadiationDamage * dt
    }

    // --- Apply damage ---
    const totalDamage = tempDamage + radDamage
    if (totalDamage > 0) {
      this._hp = Math.max(0, this._hp - totalDamage)
    }

    // --- Healing ---
    if (healing && totalDamage === 0) {
      this._hp = Math.min(this.config.maxHp, this._hp + this.config.healRate * dt)
    }

    // --- Death check ---
    if (this._hp <= 0 && !this._dead) {
      this._dead = true
      const cause = this.getDeathCause(radiationProximity)
      this.onDeath?.(cause)
    }
  }

  /** Reset HP and temperature to initial values. */
  reset(): void {
    this._hp = this.config.maxHp
    this._temperature = 0
    this._dead = false
  }

  /** Determine death cause based on highest damage source. */
  private getDeathCause(radiationProximity: number): string {
    if (radiationProximity > this.config.radiationThreshold) return 'Radiation Exposure'
    if (this._temperature > this.config.damageThreshold) return 'Hull Overheated'
    return 'Hull Frozen'
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/__tests__/shipHealth.spec.ts`
Expected: All PASS

- [ ] **Step 5: Run full test suite**

Run: `bun test:unit`
Expected: All pass, no regressions

- [ ] **Step 6: Commit**

```bash
git add src/lib/shipHealth.ts src/lib/__tests__/shipHealth.spec.ts
git commit -m "feat(health): ShipHealth domain logic with temperature zones and damage"
```

---

### Task 3: Extend ShuttleTelemetry and ShuttleHud

**Files:**
- Modify: `src/lib/ShuttleTelemetry.ts`
- Modify: `src/components/ShuttleHud.vue`
- Modify: `src/assets/css/main.css`
- Modify: `src/views/ShuttleView.vue` (add defaults for new fields)
- Modify: `src/views/ShuttleViewController.ts` (add defaults for new fields)

- [ ] **Step 1: Add health and temperature fields to ShuttleTelemetry**

In `src/lib/ShuttleTelemetry.ts`, add four fields to the `ShuttleTelemetry` interface after `adriftCountdown`:

```ts
  /** Current hull HP */
  hp: number
  /** Maximum hull HP */
  maxHp: number
  /** Temperature (-100 to +100). Positive = hot, negative = cold. */
  temperature: number
  /** Whether the temperature gauge should be visible */
  temperatureVisible: boolean
```

- [ ] **Step 2: Add CSS classes for hull bar and temperature gauge**

Append to `src/assets/css/main.css`:

```css
.hud-hull {
  @apply absolute top-0 left-4 flex items-center gap-2 pt-1;
}

.hud-hull-label {
  @apply text-green-400;
}

.hud-hull-track {
  @apply w-32 h-3 bg-gray-800 rounded-sm overflow-hidden;
}

.hud-hull-fill {
  @apply h-full transition-all duration-200;
}

.hud-temp-gauge {
  @apply absolute top-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 font-mono pointer-events-none;
  animation: gravity-pulse 1.5s ease-in-out infinite;
}

.hud-temp-label {
  @apply text-xs font-bold tracking-widest;
}

.hud-temp-track {
  @apply w-40 h-2 bg-gray-800 rounded-full overflow-hidden;
}

.hud-temp-fill-hot {
  @apply h-full bg-red-500 transition-all duration-300;
}

.hud-temp-fill-cold {
  @apply h-full bg-blue-400 transition-all duration-300;
}
```

- [ ] **Step 3: Update ShuttleHud.vue**

Replace the full template of `src/components/ShuttleHud.vue` to add the hull bar above fuel and the temperature gauge below position:

```vue
<script setup lang='ts'>
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

function hullColor(hp: number, maxHp: number): string {
  const ratio = maxHp > 0 ? hp / maxHp : 0
  if (ratio > 0.5) return 'bg-green-500'
  if (ratio > 0.2) return 'bg-yellow-500'
  return 'bg-red-500'
}

function adriftSeconds(): string {
  return Math.ceil(props.telemetry.adriftCountdown).toString()
}

function tempLabel(): string {
  return props.telemetry.temperature > 0 ? 'OVERHEATING' : 'FREEZING'
}

function tempLabelClass(): string {
  return props.telemetry.temperature > 0 ? 'text-red-500' : 'text-blue-400'
}
</script>

<template>
  <div class="shuttle-hud">
    <!-- Top center: position -->
    <div class="hud-position">
      X:{{ props.telemetry.posX.toFixed(0) }}
      Z:{{ props.telemetry.posZ.toFixed(0) }}
    </div>

    <!-- Adrift countdown: centered below position -->
    <div v-if="props.telemetry.adriftCountdown >= 0" class="hud-adrift-countdown">
      {{ adriftSeconds() }}s
    </div>

    <!-- Temperature gauge: below position, only when outside safe zone -->
    <div v-if="props.telemetry.temperatureVisible" class="hud-temp-gauge">
      <span class="hud-temp-label" :class="tempLabelClass()">
        {{ tempLabel() }} {{ Math.abs(props.telemetry.temperature).toFixed(0) }}&deg;
      </span>
      <div class="hud-temp-track">
        <div
          v-if="props.telemetry.temperature > 0"
          class="hud-temp-fill-hot"
          :style="{ width: Math.abs(props.telemetry.temperature) + '%' }"
        ></div>
        <div
          v-else
          class="hud-temp-fill-cold"
          :style="{ width: Math.abs(props.telemetry.temperature) + '%', marginLeft: 'auto' }"
        ></div>
      </div>
    </div>

    <!-- Top left: hull bar (above fuel) -->
    <div class="hud-hull">
      <span class="hud-hull-label">HULL</span>
      <div class="hud-hull-track">
        <div
          class="hud-hull-fill"
          :class="hullColor(props.telemetry.hp, props.telemetry.maxHp)"
          :style="{ width: pct(props.telemetry.hp, props.telemetry.maxHp) + '%' }"
        ></div>
      </div>
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

    <!-- Adrift warning: under fuel bar -->
    <div v-if="props.telemetry.adriftCountdown >= 0" class="hud-adrift-warning">
      ADRIFT — DOCK TO REFUEL
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

- [ ] **Step 4: Move fuel bar position down to make room for hull**

In `src/assets/css/main.css`, change `.hud-fuel` from `top-4` to `top-6`:

```css
.hud-fuel {
  @apply absolute top-6 left-4 flex items-center gap-2;
}
```

And update `.hud-adrift-warning` from `top-10` to `top-12`:

```css
.hud-adrift-warning {
  @apply absolute top-12 left-4 text-red-500 text-xs font-bold;
```

- [ ] **Step 5: Add default values for new telemetry fields in ShuttleView and ShuttleViewController**

In `src/views/ShuttleView.vue`, add to the reactive telemetry object:
```ts
  adriftCountdown: -1,
  hp: 100,
  maxHp: 100,
  temperature: 0,
  temperatureVisible: false,
```

In `src/views/ShuttleViewController.ts`, add to the onTelemetry emission:
```ts
        adriftCountdown: -1,
        hp: 100,
        maxHp: 100,
        temperature: 0,
        temperatureVisible: false,
```

- [ ] **Step 6: Add default values in MapView.vue**

In `src/views/MapView.vue`, add to the reactive telemetry object:
```ts
  hp: 100,
  maxHp: 100,
  temperature: 0,
  temperatureVisible: false,
```

- [ ] **Step 7: Run type-check**

Run: `bun run type-check`
Expected: No errors (except pre-existing unrelated ones)

- [ ] **Step 8: Commit**

```bash
git add src/lib/ShuttleTelemetry.ts src/components/ShuttleHud.vue src/assets/css/main.css src/views/ShuttleView.vue src/views/ShuttleViewController.ts src/views/MapView.vue
git commit -m "feat(health): hull HP bar and temperature gauge in ShuttleHud"
```

---

### Task 4: Wire ShipHealth into MapViewController

**Files:**
- Modify: `src/views/MapViewController.ts`

- [ ] **Step 1: Import ShipHealth and config**

Add imports at the top of `src/views/MapViewController.ts`:

```ts
import { ShipHealth } from '@/lib/shipHealth'
import shipHealthData from '@/data/shuttle/ship-health.json'
import type { ShipHealthConfig } from '@/lib/shipHealth'
```

- [ ] **Step 2: Add ShipHealth instance field**

Add after `private adriftTimer = 0`:

```ts
private shipHealth: ShipHealth | null = null
```

- [ ] **Step 3: Create ShipHealth in init()**

After the `onDeath` callback setup and before `await this.shuttleController.load()`, add:

```ts
this.shipHealth = new ShipHealth(shipHealthData as ShipHealthConfig)
this.shipHealth.onDeath = (cause) => {
  this.vehicleCamera?.setConfig(MAP_DEATH_CAMERA_CONFIG)
  this.onDeathOverlay?.(true, cause)
  this.shuttleController?.freeze()
}
```

- [ ] **Step 4: Tick ShipHealth in the tick() method**

In `tick()`, after the adrift check block and before the gravity proximity block, add:

```ts
// Ship health — temperature drift + radiation/temp damage
if (this.shipHealth && this.shuttleController && !this.shuttleController.dead) {
  const orbitState = this.orbitSystem?.state ?? 'free'
  const px = this.shuttleController.position.x
  const pz = this.shuttleController.position.z
  const sunDist = Math.sqrt(px * px + pz * pz) // Sun is at origin

  // Radiation proximity (reuse existing computation or compute fresh)
  const radiationProximity = this.sunController
    ? this.computeProximity(
        this.sunController.getWorldX(),
        this.sunController.getWorldZ(),
        this.sunController.mass,
        px, pz,
      )
    : 0

  // Heal only while orbiting Earth
  const isHealingAtEarth = orbitState === 'orbiting'
    && this.orbitSystem?.target?.name === 'Earth'

  this.shipHealth.tick(dt, sunDist, radiationProximity, isHealingAtEarth)
}
```

- [ ] **Step 5: Add health and temperature to telemetry emission**

In the telemetry block (around line 605-622), add after `adriftCountdown`:

```ts
        hp: this.shipHealth?.hp ?? 100,
        maxHp: this.shipHealth?.maxHp ?? 100,
        temperature: this.shipHealth?.temperature ?? 0,
        temperatureVisible: this.shipHealth?.temperatureVisible ?? false,
```

- [ ] **Step 6: Reset ShipHealth in respawnAtEarth()**

In the `respawnAtEarth()` method, add after `this.adriftTimer = 0`:

```ts
    this.shipHealth?.reset()
```

- [ ] **Step 7: Heal HP while orbiting Earth (alongside fuel)**

In the orbiting phase tick block, after the existing Earth refuel line (`if (this.orbitSystem.target?.name === 'Earth')`), the `shipHealth.tick()` in Step 4 already handles healing when `isHealingAtEarth` is true — no additional code needed here.

- [ ] **Step 8: Run type-check and dev server smoke test**

Run: `bun run type-check`
Expected: No errors

Run: `bun dev`
Expected: Hull bar shows above fuel. Flying toward Sun shows temperature rising and "OVERHEATING". Flying past Jupiter shows "FREEZING". Radiation near Sun damages hull. Orbiting Earth heals HP and normalizes temperature.

- [ ] **Step 9: Commit**

```bash
git add src/views/MapViewController.ts
git commit -m "feat(map): wire ShipHealth — temperature, radiation damage, Earth healing"
```

---

### Task 5: Lint, type-check, and full test pass

**Files:** None (verification only)

- [ ] **Step 1: Run full type-check**

Run: `bun run type-check`
Expected: No errors

- [ ] **Step 2: Run linter**

Run: `bun lint`
Expected: No errors from our changes

- [ ] **Step 3: Run full test suite**

Run: `bun test:unit`
Expected: All tests pass including new shipHealth.spec.ts

- [ ] **Step 4: Fix any issues and commit**

```bash
git add -A
git commit -m "chore: fix lint and type-check issues from ship health work"
```
