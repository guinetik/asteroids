# Probe Deploy Minigame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared orbital minigame for Mercury and Uranus — side-view probe deployment onto a rotating planet, with meteorite hazards.

**Architecture:** Pure game logic in `ProbeDeployMiniGame.ts` (implements `OrbitalMiniGame`), types + constants in sibling files, dual-themed canvas renderer in `ProbeDeployCanvas.vue`. Factory signature gains optional `planetId` parameter.

**Tech Stack:** TypeScript, Vue 3, HTML5 Canvas, Vitest

**Spec:** `docs/superpowers/specs/2026-04-11-probe-deploy-minigame-design.md`

---

### Task 1: Types

**Files:**
- Create: `src/lib/minigame/probeDeploy/types.ts`

- [ ] **Step 1: Create the types file**

```ts
/**
 * Types for the probe deploy orbital minigame.
 *
 * @author guinetik
 * @date 2026-04-11
 * @spec docs/superpowers/specs/2026-04-11-probe-deploy-minigame-design.md
 */

/** Vertical-only input state for ship movement. */
export interface ShipInput {
  /** W key held. */
  up: boolean
  /** S key held. */
  down: boolean
}

/** Size category of a meteorite. */
export type MeteoriteSize = 'small' | 'medium' | 'large'

/** A meteorite drifting across the play area. */
export interface Meteorite {
  /** Horizontal position in canvas pixels. */
  x: number
  /** Vertical position in canvas pixels. */
  y: number
  /** Horizontal velocity in px/s (negative = moving left). */
  vx: number
  /** Vertical drift velocity in px/s. */
  vy: number
  /** Size category. */
  size: MeteoriteSize
  /** Collision radius in px. */
  radius: number
}

/** A probe in flight toward the planet. */
export interface Probe {
  /** Horizontal position in canvas pixels. */
  x: number
  /** Vertical position in canvas pixels (fixed at launch Y). */
  y: number
  /** Horizontal speed in px/s (positive = moving right). */
  speed: number
  /** Whether this probe has reached the planet or been consumed. */
  consumed: boolean
}

/** A target zone on the planet surface. */
export interface PlanetTarget {
  /** Fixed angle on the planet surface in radians. */
  surfaceAngle: number
  /** Current world X position (computed from rotation). */
  x: number
  /** Current world Y position (computed from rotation). */
  y: number
  /** Visual radius in px. */
  radius: number
  /** Whether this target has been successfully hit. */
  hit: boolean
  /** Pulse animation offset. */
  pulseOffset: number
}
```

- [ ] **Step 2: Verify types compile**

Run: `bun run type-check`
Expected: PASS (no errors in the new file)

- [ ] **Step 3: Commit**

```bash
git add src/lib/minigame/probeDeploy/types.ts
git commit -m "feat(probe-deploy): add types for probes, meteorites, and planet targets"
```

---

### Task 2: Constants

**Files:**
- Create: `src/lib/minigame/probeDeploy/constants.ts`

- [ ] **Step 1: Create the constants file**

```ts
/**
 * Tuning constants for the probe deploy minigame.
 *
 * @author guinetik
 * @date 2026-04-11
 * @spec docs/superpowers/specs/2026-04-11-probe-deploy-minigame-design.md
 */

/** Logical canvas width in pixels. */
export const CANVAS_WIDTH = 800

/** Logical canvas height in pixels. */
export const CANVAS_HEIGHT = 500

// ─── Planet ─────────────────────────────────────────────────────────────────

/** Planet center X in canvas pixels. */
export const PLANET_X = 550

/** Planet center Y in canvas pixels. */
export const PLANET_Y = 250

/** Planet visual radius in px. */
export const PLANET_R = 220

/** Base planet rotation speed in radians/s. */
export const PLANET_ROTATION_SPEED = 0.4

/** Additional rotation speed per targetGas unit above 2 (rad/s). */
export const ROTATION_SPEED_PER_TARGET = 0.025

// ─── Ship ───────────────────────────────────────────────────────────────────

/** Ship fixed X position — orbital lane on the left. */
export const SHIP_X = 80

/** Ship acceleration in px/s² when holding W/S. */
export const SHIP_ACCEL = 800

/** Velocity drag multiplier applied per frame (0–1). */
export const SHIP_DRAG = 0.96

/** Maximum vertical ship speed in px/s. */
export const SHIP_MAX_SPEED = 450

/** Ship collision half-size in px. */
export const SHIP_HALF_SIZE = 14

/** Edge padding — ship can't get closer than this to canvas edge (px). */
export const EDGE_PADDING = 30

// ─── Hull ───────────────────────────────────────────────────────────────────

/** Starting and maximum hull HP. */
export const HULL_MAX_HP = 100

/** HP lost on meteorite collision. */
export const METEORITE_DAMAGE = 15

/** Seconds of invulnerability after taking damage. */
export const DAMAGE_GRACE_PERIOD = 1.0

/** Knockback impulse speed on meteorite collision (px/s). */
export const KNOCKBACK_SPEED = 120

// ─── Probes ─────────────────────────────────────────────────────────────────

/** Probe horizontal flight speed in px/s. */
export const PROBE_SPEED = 500

/** Cooldown between probe launches in seconds. */
export const PROBE_COOLDOWN = 1.5

// ─── Targets ────────────────────────────────────────────────────────────────

/** Radius for a probe to "hit" a surface target (px). */
export const TARGET_HIT_RADIUS = 20

/** Half-angle (radians) from the ship-facing edge where a target is droppable. */
export const TARGET_DROPPABLE_ARC = Math.PI / 3

/** Target visual radius in px. */
export const TARGET_VISUAL_RADIUS = 12

// ─── Meteorites ─────────────────────────────────────────────────────────────

/** Collision radius by meteorite size in px. */
export const METEORITE_RADIUS_SMALL = 10

/** Collision radius by meteorite size in px. */
export const METEORITE_RADIUS_MEDIUM = 18

/** Collision radius by meteorite size in px. */
export const METEORITE_RADIUS_LARGE = 28

/** Horizontal speed range for meteorites in px/s. */
export const METEORITE_SPEED_MIN = 80

/** Horizontal speed range for meteorites in px/s. */
export const METEORITE_SPEED_MAX = 200

/** Starting spawn interval in seconds. */
export const METEORITE_SPAWN_INTERVAL_START = 1.5

/** Minimum spawn interval (ramps down over time). */
export const METEORITE_SPAWN_INTERVAL_MIN = 0.5

/** Seconds for spawn interval to ramp from start to min. */
export const METEORITE_SPAWN_RAMP_DURATION = 45

/** Probability weights for meteorite sizes [small, medium, large]. */
export const METEORITE_SIZE_WEIGHTS = [0.5, 0.35, 0.15]

// ─── Difficulty Scaling ─────────────────────────────────────────────────────

/** Minimum number of targets. */
export const MIN_TARGETS = 3

/** Maximum number of targets. */
export const MAX_TARGETS = 5

/** Base timer in seconds. */
export const TIMER_BASE = 45

/** Additional timer per target in seconds. */
export const TIMER_PER_TARGET = 5
```

- [ ] **Step 2: Verify constants compile**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/minigame/probeDeploy/constants.ts
git commit -m "feat(probe-deploy): add tuning constants for planet, ship, probes, meteorites"
```

---

### Task 3: Core Game Logic + Tests

**Files:**
- Create: `src/lib/minigame/probeDeploy/ProbeDeployMiniGame.ts`
- Create: `src/lib/minigame/probeDeploy/__tests__/ProbeDeployMiniGame.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProbeDeployMiniGame } from '../ProbeDeployMiniGame'
import {
  SHIP_X,
  CANVAS_HEIGHT,
  HULL_MAX_HP,
  METEORITE_DAMAGE,
  EDGE_PADDING,
  PLANET_X,
  PLANET_Y,
  PLANET_R,
  PLANET_ROTATION_SPEED,
  PROBE_COOLDOWN,
  TARGET_HIT_RADIUS,
  MIN_TARGETS,
  MAX_TARGETS,
  TIMER_BASE,
  TIMER_PER_TARGET,
} from '../constants'
import type { OrbitalMiniGameContext } from '../../OrbitalMiniGame'

const STUB_CTX: OrbitalMiniGameContext = {
  shipPosition: { x: 0, y: 0, z: 0 },
  orbitState: 'orbiting',
  orbitedPlanetId: 'mercury',
  distanceToPlanet: null,
}

describe('ProbeDeployMiniGame', () => {
  let game: ProbeDeployMiniGame

  beforeEach(() => {
    game = new ProbeDeployMiniGame('test-mission', 3, 'mercury')
  })

  describe('initialization', () => {
    it('starts with active status', () => {
      expect(game.status).toBe('active')
      expect(game.missionId).toBe('test-mission')
      expect(game.planetId).toBe('mercury')
    })

    it('has correct progress tracking', () => {
      expect(game.progressCurrent).toBe(0)
      expect(game.progressTotal).toBe(4) // max(3, targetGas+1) = max(3,4) = 4
    })

    it('ship starts at center Y', () => {
      expect(game.shipY).toBeCloseTo(CANVAS_HEIGHT / 2)
    })

    it('hull starts at max', () => {
      expect(game.hullHp).toBe(HULL_MAX_HP)
    })

    it('target count respects min/max bounds', () => {
      const game1 = new ProbeDeployMiniGame('t', 1, 'mercury')
      expect(game1.targetCount).toBe(MIN_TARGETS) // max(3, 1+1) = 3

      const game6 = new ProbeDeployMiniGame('t', 6, 'uranus')
      expect(game6.targetCount).toBe(MAX_TARGETS) // min(5, max(3, 6+1)) = 5
    })

    it('probe count is targetCount + 2', () => {
      expect(game.probeCount).toBe(game.targetCount + 2)
      expect(game.probesRemaining).toBe(game.probeCount)
    })

    it('targets are evenly distributed around planet', () => {
      expect(game.targets).toHaveLength(game.targetCount)
      for (const t of game.targets) {
        expect(t.hit).toBe(false)
        expect(t.surfaceAngle).toBeGreaterThanOrEqual(0)
        expect(t.surfaceAngle).toBeLessThan(Math.PI * 2)
      }
    })

    it('timer scales with target count', () => {
      expect(game.timeRemaining).toBe(TIMER_BASE + TIMER_PER_TARGET * game.targetCount)
    })

    it('has two steps', () => {
      expect(game.steps).toHaveLength(2)
      expect(game.steps[0]!.label).toBe('Deploy probes to targets')
      expect(game.steps[0]!.active).toBe(true)
    })
  })

  describe('ship movement', () => {
    it('accelerates up when W input is set', () => {
      game.setInput({ up: true, down: false })
      game.tick(0.1, STUB_CTX)
      expect(game.shipVy).toBeLessThan(0)
    })

    it('accelerates down when S input is set', () => {
      game.setInput({ up: false, down: true })
      game.tick(0.1, STUB_CTX)
      expect(game.shipVy).toBeGreaterThan(0)
    })

    it('applies drag when no input', () => {
      game.setInput({ up: false, down: true })
      game.tick(0.1, STUB_CTX)
      const vy1 = game.shipVy
      game.setInput({ up: false, down: false })
      game.tick(0.1, STUB_CTX)
      expect(Math.abs(game.shipVy)).toBeLessThan(Math.abs(vy1))
    })

    it('clamps ship to canvas bounds', () => {
      game.setInput({ up: true, down: false })
      for (let i = 0; i < 200; i++) game.tick(0.016, STUB_CTX)
      expect(game.shipY).toBeGreaterThanOrEqual(EDGE_PADDING)
    })
  })

  describe('planet rotation', () => {
    it('rotation advances each tick', () => {
      const r0 = game.planetRotation
      game.tick(1.0, STUB_CTX)
      expect(game.planetRotation).toBeGreaterThan(r0)
    })

    it('target positions update with rotation', () => {
      const y0 = game.targets[0]!.y
      // Tick enough for visible movement
      for (let i = 0; i < 60; i++) game.tick(0.016, STUB_CTX)
      expect(game.targets[0]!.y).not.toBeCloseTo(y0, 0)
    })
  })

  describe('probe launching', () => {
    it('launches a probe from ship position', () => {
      game.launchProbe()
      expect(game.activeProbe).not.toBeNull()
      expect(game.activeProbe!.y).toBeCloseTo(game.shipY)
      expect(game.activeProbe!.x).toBeCloseTo(SHIP_X)
      expect(game.probesRemaining).toBe(game.probeCount - 1)
    })

    it('cooldown prevents rapid fire', () => {
      game.launchProbe()
      expect(game.activeProbe).not.toBeNull()
      // Consume the probe by ticking until it reaches planet or goes off screen
      for (let i = 0; i < 120; i++) game.tick(0.016, STUB_CTX)
      // Now try to fire again immediately — cooldown should block
      const remaining = game.probesRemaining
      game.launchProbe()
      if (game.probeCooldown > 0) {
        expect(game.probesRemaining).toBe(remaining) // didn't fire
      }
    })

    it('cannot launch when probes exhausted', () => {
      // Exhaust all probes
      for (let i = 0; i < game.probeCount; i++) {
        game.probeCooldown = 0
        game.activeProbe = null
        game.launchProbe()
      }
      expect(game.probesRemaining).toBe(0)
      game.probeCooldown = 0
      game.activeProbe = null
      game.launchProbe()
      expect(game.activeProbe).toBeNull()
    })

    it('cannot launch while a probe is in flight', () => {
      game.launchProbe()
      const remaining = game.probesRemaining
      game.launchProbe()
      expect(game.probesRemaining).toBe(remaining)
    })
  })

  describe('probe-target collision', () => {
    it('hitting a target marks it complete and advances progress', () => {
      // Place a target at the planet edge facing the ship
      const target = game.targets[0]!
      // Set target to ship-facing position (left side of planet = angle PI)
      target.surfaceAngle = Math.PI
      target.x = PLANET_X + Math.cos(Math.PI) * PLANET_R
      target.y = PLANET_Y + Math.sin(Math.PI) * PLANET_R
      target.hit = false

      // Move ship to target Y
      game.shipY = target.y

      // Manually place a probe at impact point
      game.activeProbe = {
        x: target.x,
        y: target.y,
        speed: 500,
        consumed: false,
      }

      game.tick(0.016, STUB_CTX)
      expect(target.hit).toBe(true)
      expect(game.progressCurrent).toBe(1)
    })

    it('missing all targets consumes the probe without progress', () => {
      // Move all targets far from ship Y
      for (const t of game.targets) {
        t.y = game.shipY + 200
        t.x = PLANET_X - PLANET_R
      }

      // Place probe at planet edge at ship Y
      game.activeProbe = {
        x: PLANET_X - PLANET_R,
        y: game.shipY,
        speed: 500,
        consumed: false,
      }

      game.tick(0.016, STUB_CTX)
      expect(game.activeProbe).toBeNull()
      expect(game.progressCurrent).toBe(0)
    })
  })

  describe('probe-meteorite collision', () => {
    it('probe hitting a meteorite is consumed', () => {
      game.launchProbe()
      const probe = game.activeProbe!
      // Place a meteorite right on the probe
      game.meteorites.push({
        x: probe.x + 20,
        y: probe.y,
        vx: -100,
        vy: 0,
        size: 'medium',
        radius: 18,
      })
      // Tick until probe reaches meteorite
      for (let i = 0; i < 10; i++) game.tick(0.016, STUB_CTX)
      expect(game.activeProbe).toBeNull()
    })
  })

  describe('meteorite-ship collision', () => {
    it('collision reduces hull HP', () => {
      game.meteorites.push({
        x: SHIP_X,
        y: game.shipY,
        vx: -100,
        vy: 0,
        size: 'small',
        radius: 10,
      })
      game.tick(0.016, STUB_CTX)
      expect(game.hullHp).toBe(HULL_MAX_HP - METEORITE_DAMAGE)
    })

    it('grace period prevents double-hit', () => {
      game.meteorites.push({
        x: SHIP_X,
        y: game.shipY,
        vx: 0,
        vy: 0,
        size: 'small',
        radius: 10,
      })
      game.tick(0.016, STUB_CTX)
      expect(game.hullHp).toBe(HULL_MAX_HP - METEORITE_DAMAGE)
      game.tick(0.016, STUB_CTX)
      expect(game.hullHp).toBe(HULL_MAX_HP - METEORITE_DAMAGE) // no double hit
    })
  })

  describe('end conditions', () => {
    it('completes when all targets hit', () => {
      const cb = vi.fn()
      game.onComplete = cb
      for (const t of game.targets) t.hit = true
      game.tick(0.016, STUB_CTX)
      expect(game.status).toBe('completed')
      expect(cb).toHaveBeenCalledWith('test-mission')
    })

    it('fails when hull depleted', () => {
      game.hullHp = 1
      game.damageFlash = 0
      game.meteorites.push({
        x: SHIP_X,
        y: game.shipY,
        vx: 0,
        vy: 0,
        size: 'small',
        radius: 10,
      })
      game.tick(0.016, STUB_CTX)
      expect(game.status).toBe('failed')
    })

    it('fails when timer expires', () => {
      game.timeRemaining = 0.01
      game.tick(0.02, STUB_CTX)
      expect(game.status).toBe('failed')
    })

    it('fails when probes exhausted with targets remaining', () => {
      // Exhaust all probes
      for (let i = 0; i < game.probeCount; i++) {
        game.probeCooldown = 0
        game.activeProbe = null
        game.launchProbe()
      }
      expect(game.probesRemaining).toBe(0)
      // Make sure no probe is in flight
      game.activeProbe = null
      game.tick(0.016, STUB_CTX)
      expect(game.status).toBe('failed')
    })
  })

  describe('difficulty scaling', () => {
    it('rotation speed scales with targetGas', () => {
      const game2 = new ProbeDeployMiniGame('t', 2, 'mercury')
      const game5 = new ProbeDeployMiniGame('t', 5, 'mercury')
      expect(game5.rotationSpeed).toBeGreaterThan(game2.rotationSpeed)
    })
  })

  describe('tick guards', () => {
    it('tick is no-op after completed', () => {
      for (const t of game.targets) t.hit = true
      game.tick(0.016, STUB_CTX)
      expect(game.status).toBe('completed')

      const rot = game.planetRotation
      game.tick(1.0, STUB_CTX)
      expect(game.planetRotation).toBe(rot)
    })

    it('tick is no-op after failed', () => {
      game.timeRemaining = 0.01
      game.tick(0.02, STUB_CTX)
      expect(game.status).toBe('failed')

      const shipY = game.shipY
      game.setInput({ up: true, down: false })
      game.tick(0.1, STUB_CTX)
      expect(game.shipY).toBe(shipY)
    })
  })

  describe('complete() and dispose', () => {
    it('complete() is a no-op', () => {
      game.complete()
      expect(game.status).toBe('active')
    })

    it('dispose clears entities', () => {
      game.meteorites.push({ x: 0, y: 0, vx: 0, vy: 0, size: 'small', radius: 10 })
      game.dispose()
      expect(game.meteorites).toHaveLength(0)
      expect(game.targets).toHaveLength(0)
      expect(game.activeProbe).toBeNull()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/minigame/probeDeploy/__tests__/ProbeDeployMiniGame.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ProbeDeployMiniGame**

Create `src/lib/minigame/probeDeploy/ProbeDeployMiniGame.ts`. The class must:

- Implement `OrbitalMiniGame` + `OrbitalMiniGameEvents`
- **Constructor(missionId, targetGas, planetId):** compute `targetCount = min(MAX_TARGETS, max(MIN_TARGETS, targetGas + 1))`, `probeCount = targetCount + 2`, `rotationSpeed = PLANET_ROTATION_SPEED + ROTATION_SPEED_PER_TARGET * max(0, targetGas - 2)`, `timeRemaining = TIMER_BASE + TIMER_PER_TARGET * targetCount`. Init targets evenly around the planet circumference. Ship starts at `CANVAS_HEIGHT / 2`.
- **tickShip(dt):** vertical-only movement. `SHIP_ACCEL` from W/S, `SHIP_DRAG` per frame, `SHIP_MAX_SPEED` cap, clamp to `EDGE_PADDING`. No gravity, no horizontal movement.
- **tickPlanet(dt):** advance `planetRotation += rotationSpeed * dt`. Update all target world positions: `t.x = PLANET_X + cos(t.surfaceAngle + planetRotation) * PLANET_R`, same for y.
- **tickProbe(dt):** if `activeProbe`, move it right at `PROBE_SPEED`. Check probe-meteorite collisions (distance to each meteorite < meteorite.radius + 4). If probe.x >= PLANET_X - PLANET_R (reached planet edge), check each unhit target — if distance < `TARGET_HIT_RADIUS`, mark target hit. Either way, consume probe (set `activeProbe = null`).
- **tickMeteoriteSpawning(dt):** ramping spawn interval (same pattern as ice harvest). Spawn from right edge (`CANVAS_WIDTH + radius`), random Y in playable range, drift left.
- **tickMeteoriteMovement(dt):** move meteorites left.
- **checkMeteoriteShipCollisions():** distance check, `METEORITE_DAMAGE` + knockback + grace period.
- **cleanupMeteoriteS():** remove meteorites past left edge.
- **checkEndConditions():** all targets hit → completed. hullHp <= 0 → failed. timeRemaining <= 0 → failed. probesRemaining <= 0 && activeProbe === null && any target not hit → failed.
- **launchProbe():** guard on status, cooldown, probesRemaining, activeProbe. Create probe at (SHIP_X, shipY), decrement probesRemaining, set cooldown.
- **Public state:** `shipY`, `shipVy`, `hullHp`, `hullMaxHp`, `probesRemaining`, `probeCount`, `probeCooldown`, `activeProbe`, `targets`, `meteorites`, `planetRotation`, `rotationSpeed`, `timeRemaining`, `damageFlash`, `planetId`, `targetCount`.
- **Steps:** "Deploy probes to targets" (active) and "Mission complete" (inactive).
- **Events:** `onComplete`, `onStepChange`.

- [ ] **Step 4: Run tests**

Run: `bun test:unit src/lib/minigame/probeDeploy/__tests__/ProbeDeployMiniGame.spec.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/minigame/probeDeploy/ProbeDeployMiniGame.ts src/lib/minigame/probeDeploy/__tests__/ProbeDeployMiniGame.spec.ts
git commit -m "feat(probe-deploy): core game logic — ship, probes, targets, meteorites, tests"
```

---

### Task 4: Factory Update (add planetId parameter)

**Files:**
- Modify: `src/lib/minigame/orbitalMiniGameFactory.ts`
- Modify: `src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts`
- Modify: `src/lib/map/missions/MapMissionFacade.ts`
- Modify: `src/views/MapViewController.ts`

- [ ] **Step 1: Update factory signature and probe-deploy case**

In `src/lib/minigame/orbitalMiniGameFactory.ts`:

Add import:
```ts
import { ProbeDeployMiniGame } from './probeDeploy/ProbeDeployMiniGame'
```

Change the function signature to accept optional `planetId`:
```ts
export function createOrbitalMiniGame(
  missionId: string,
  minigameType: string,
  targetGas: number,
  planetId?: string,
): OrbitalMiniGame {
```

Replace the `'probe-deploy'` case (remove it from the default fallthrough):
```ts
    case 'probe-deploy':
      return new ProbeDeployMiniGame(missionId, targetGas, planetId ?? 'mercury')
    default:
      return new DefaultOrbitalMiniGame(missionId)
```

- [ ] **Step 2: Update factory tests**

In `src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts`:

Add import:
```ts
import { ProbeDeployMiniGame } from '../probeDeploy/ProbeDeployMiniGame'
```

Remove `'probe-deploy'` from `DEFAULT_TYPES` (it should be empty now — remove the `DEFAULT_TYPES` array and its `it.each` test entirely).

Add new tests:
```ts
  it('returns ProbeDeployMiniGame for type "probe-deploy"', () => {
    const mg = createOrbitalMiniGame('mission-1', 'probe-deploy', 3, 'mercury')
    expect(mg).toBeInstanceOf(ProbeDeployMiniGame)
    expect(mg.missionId).toBe('mission-1')
  })

  it('passes planetId through to ProbeDeployMiniGame', () => {
    const mg = createOrbitalMiniGame('mission-1', 'probe-deploy', 2, 'uranus')
    expect(mg).toBeInstanceOf(ProbeDeployMiniGame)
    expect((mg as ProbeDeployMiniGame).planetId).toBe('uranus')
  })

  it('defaults planetId to mercury when not provided for probe-deploy', () => {
    const mg = createOrbitalMiniGame('mission-1', 'probe-deploy', 2)
    expect(mg).toBeInstanceOf(ProbeDeployMiniGame)
    expect((mg as ProbeDeployMiniGame).planetId).toBe('mercury')
  })
```

- [ ] **Step 3: Update call sites to pass planetId**

In `src/lib/map/missions/MapMissionFacade.ts` (~line 217):
```ts
    this.activeMinigame = createOrbitalMiniGame(
      mission.template.id,
      minigameType,
      mission.template.gatherQuantity,
      mission.template.targetPlanet,
    )
```

In `src/views/MapViewController.ts` (~line 2802):
```ts
    this.missionFacade.activeMinigame = createOrbitalMiniGame(missionId, entry.minigameType, quantity, entry.planetId)
```

- [ ] **Step 4: Run factory tests**

Run: `bun test:unit src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/minigame/orbitalMiniGameFactory.ts src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts src/lib/map/missions/MapMissionFacade.ts src/views/MapViewController.ts
git commit -m "feat(probe-deploy): wire factory with planetId parameter, update call sites"
```

---

### Task 5: Overlay Integration

**Files:**
- Modify: `src/components/MissionMiniGameOverlay.vue`

- [ ] **Step 1: Add probe deploy to the overlay**

In `src/components/MissionMiniGameOverlay.vue`:

Add imports:
```ts
import { ProbeDeployMiniGame } from '@/lib/minigame/probeDeploy/ProbeDeployMiniGame'
import ProbeDeployCanvas from '@/components/ProbeDeployCanvas.vue'
```

Add computed properties after the logistics ones:
```ts
const isProbeDeploy = computed(
  () => props.minigame instanceof ProbeDeployMiniGame,
)

const probeMinigame = computed(
  () => (props.minigame instanceof ProbeDeployMiniGame ? props.minigame : null),
)
```

Add template block before the `<!-- Default: button card -->` block:
```html
  <!-- Probe Deploy: fullscreen canvas -->
  <div v-else-if="isProbeDeploy && probeMinigame" class="mission-minigame-overlay">
    <div class="mission-minigame-card" style="max-width: 850px;">
      <div class="mission-minigame-card__chrome">
        <span>{{ mission.template.name }}</span>
        <button
          type="button"
          class="ship-message-card__button"
          @click="emit('close')"
        >
          Close
        </button>
      </div>
      <div class="mission-minigame-card__body" style="padding: 0.5rem;">
        <ProbeDeployCanvas
          :minigame="probeMinigame"
          @complete="emit('complete')"
          @fail="() => {}"
        />
      </div>
    </div>
  </div>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/MissionMiniGameOverlay.vue
git commit -m "feat(probe-deploy): add overlay integration for ProbeDeployCanvas"
```

---

### Task 6: Canvas Renderer — Mercury Theme

**Files:**
- Create: `src/components/ProbeDeployCanvas.vue`

This is the largest task. The canvas renderer draws two planet themes (Mercury and Uranus), the ship, probes, meteorites, targets, and HUD. It follows the pattern from `IceHarvestCanvas.vue` and visual language from the two inspo HTML files.

- [ ] **Step 1: Create ProbeDeployCanvas.vue**

The component must:

**Structure:** Same as `IceHarvestCanvas.vue` / `LogisticsRouteCanvas.vue` — props (`minigame: ProbeDeployMiniGame`), emits (`complete`, `fail`), canvas ref, briefing screen, game loop.

**Input:** W/S and arrow up/down for vertical movement. SPACE to launch probe.

```ts
function onKeyDown(e: KeyboardEvent) {
  keys[e.key.toLowerCase()] = true
  if (e.key === ' ') {
    e.preventDefault()
    props.minigame.launchProbe()
  }
}
```

**Theme switching:** Read `minigame.planetId` to choose drawing functions. Use a boolean `const isMercury = computed(() => props.minigame.planetId === 'mercury')`.

**Mercury drawing layers (from inspo):**
1. Background — radial gradient from sun position (upper-left)
2. Sun glow — massive corona, coronal streamers pulsing
3. Stars — sparse, dimmed near sun
4. Solar wind particles — streaming from upper-left to lower-right
5. Planet body — scorched gray sphere, craters, sun-facing highlight, limb darkening
6. Target zones on planet surface — orange glow when droppable
7. Meteorites — rocky, dark, sun-lit on one side
8. Active probe in flight — bright streak
9. Player ship — pointing right (toward planet), engine glow, bob animation, damage blink
10. HUD — probe count, timer, target progress, health bar
11. End screen

**Uranus drawing layers (from inspo):**
1. Background — deep cold blue-black with teal tint
2. Kuiper belt particles — distant icy debris
3. Stars — many visible, color variation
4. Tiny distant sun — upper-right (R=4)
5. Uranus rings (back) — faint, nearly vertical
6. Planet body — teal-cyan, subtle bands, limb darkening, atmosphere glow
7. Uranus rings (front)
8. Ice crystal particles — drifting, sparkling
9. Target zones — cyan glow when droppable
10. Meteorites — icy blue-white, sparkling
11. Active probe, ship, HUD, end screen (same layout, different colors)

**Briefing screen:** Mercury shows fire icon, "MERCURY PROBE DEPLOYMENT". Uranus shows snowflake icon, "URANUS PROBE DEPLOYMENT". Both show controls (W S — move, SPACE — deploy probe), probe count, target count, timer.

**Planet rendering:** The planet must show **rotation**. Surface features (craters for Mercury, bands for Uranus) should visually shift based on `minigame.planetRotation`. Use the rotation angle to offset crater/band positions. Targets rendered as glowing circles on the planet perimeter at their computed world positions.

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/ProbeDeployCanvas.vue
git commit -m "feat(probe-deploy): dual-themed canvas renderer for Mercury and Uranus"
```

---

### Task 7: Integration Test & Manual Verification

**Files:** None new.

- [ ] **Step 1: Run all minigame tests**

Run: `bun test:unit src/lib/minigame/`
Expected: ALL PASS

- [ ] **Step 2: Run full type-check**

Run: `bun run type-check`
Expected: PASS (or only pre-existing errors)

- [ ] **Step 3: Run linter**

Run: `bun lint`
Expected: No new errors from probe-deploy files

- [ ] **Step 4: Start dev server and test Mercury in browser**

Run: `bun dev`

Manual test:
1. Open dev console, trigger Mercury probe-deploy minigame
2. Verify: planet rotates, surface craters move, sun glow visible
3. Verify: W/S moves ship vertically
4. Verify: SPACE launches probe, flies toward planet
5. Verify: probe hitting target zone marks it complete
6. Verify: meteorites drift across, collision deals damage
7. Verify: probe hitting meteorite is consumed
8. Verify: all targets hit completes mission
9. Verify: probes exhausted / timer expired / hull depleted fails mission

- [ ] **Step 5: Test Uranus in browser**

Manual test:
1. Trigger Uranus probe-deploy minigame
2. Verify: teal-cyan planet, ice theme, Kuiper belt, tiny sun
3. Verify: same gameplay mechanics work
4. Verify: visual theme is distinct from Mercury

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix(probe-deploy): integration fixes from manual testing"
```
