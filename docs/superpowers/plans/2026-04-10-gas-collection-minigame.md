# Gas Collection Minigame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 2D canvas side-scrolling minigame for the `gas-collection` orbital mission type — fly the shuttle, launch drones in parabolic arcs, collect them for gas yield proportional to air time.

**Architecture:** Pure game logic class (`GasCollectionMiniGame`) implements `OrbitalMiniGame` — no DOM, no canvas, just state and physics. A Vue component (`GasCollectionCanvas.vue`) owns the `<canvas>` element, render loop, and input binding. The factory dispatches `gas-collection` to the new class. The overlay conditionally renders the canvas component instead of the button card.

**Tech Stack:** TypeScript, HTML5 Canvas 2D, Vue 3, Vitest

**Spec:** `docs/superpowers/specs/2026-04-10-gas-collection-minigame-design.md`

---

### Task 1: Ship and Drone Types

**Files:**
- Create: `src/lib/minigame/gasCollection/types.ts`

- [ ] **Step 1: Create the types file**

```ts
/**
 * Types for the gas collection orbital minigame.
 *
 * @author guinetik
 * @date 2026-04-10
 * @spec docs/superpowers/specs/2026-04-10-gas-collection-minigame-design.md
 */

/** WASD input state for ship movement. */
export interface ShipInput {
  /** W key held. */
  up: boolean
  /** S key held. */
  down: boolean
  /** A key held. */
  left: boolean
  /** D key held. */
  right: boolean
}

/** A drone in flight. */
export interface Drone {
  /** Horizontal position in canvas pixels. */
  x: number
  /** Vertical position in canvas pixels. */
  y: number
  /** Horizontal velocity in px/s. */
  vx: number
  /** Vertical velocity in px/s. */
  vy: number
  /** Seconds since launch. */
  airTime: number
  /** Whether this drone has been collected. */
  collected: boolean
}
```

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: PASS (no consumers yet)

- [ ] **Step 3: Commit**

```bash
git add src/lib/minigame/gasCollection/types.ts
git commit -m "feat: add gas collection minigame types"
```

---

### Task 2: Gas Collection Constants

**Files:**
- Create: `src/lib/minigame/gasCollection/constants.ts`

- [ ] **Step 1: Create the constants file**

```ts
/**
 * Tuning constants for the gas collection minigame.
 *
 * @author guinetik
 * @date 2026-04-10
 * @spec docs/superpowers/specs/2026-04-10-gas-collection-minigame-design.md
 */

/** Logical canvas width in pixels. */
export const CANVAS_WIDTH = 800

/** Logical canvas height in pixels. */
export const CANVAS_HEIGHT = 500

/** Ship acceleration in px/s² when holding a direction. */
export const SHIP_ACCELERATION = 800

/** Velocity drag multiplier applied per second (0–1, lower = more drag). */
export const SHIP_DRAG = 0.92

/** Maximum ship speed in px/s. */
export const SHIP_MAX_SPEED = 400

/** Downward acceleration on drones in px/s². */
export const DRONE_GRAVITY = 300

/** Base launch speed added to ship velocity in px/s. */
export const DRONE_LAUNCH_SPEED = 250

/** Launch angle in radians (upward-right arc). */
export const DRONE_LAUNCH_ANGLE = -Math.PI / 4

/** Radius in px for ship-drone collision. */
export const DRONE_COLLECT_RADIUS = 30

/** Maximum gas yield per drone in seconds of air time. */
export const MAX_AIR_TIME_YIELD = 3

/** Total drones per attempt. */
export const MAX_DRONES = 5

/** Ship hitbox half-width for collision and rendering. */
export const SHIP_HALF_WIDTH = 24

/** Ship hitbox half-height for collision and rendering. */
export const SHIP_HALF_HEIGHT = 12
```

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/minigame/gasCollection/constants.ts
git commit -m "feat: add gas collection minigame constants"
```

---

### Task 3: GasCollectionMiniGame — Core Logic

**Files:**
- Create: `src/lib/minigame/gasCollection/GasCollectionMiniGame.ts`
- Create: `src/lib/minigame/gasCollection/__tests__/GasCollectionMiniGame.spec.ts`

This is the largest task. The class implements `OrbitalMiniGame` + `OrbitalMiniGameEvents` with pure game logic — ship physics, drone physics, collision, gauge tracking.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GasCollectionMiniGame } from '../GasCollectionMiniGame'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  MAX_DRONES,
  MAX_AIR_TIME_YIELD,
  DRONE_COLLECT_RADIUS,
} from '../constants'
import type { OrbitalMiniGameContext } from '../../OrbitalMiniGame'

const STUB_CTX: OrbitalMiniGameContext = {
  shipPosition: { x: 0, y: 0, z: 0 },
  orbitState: 'orbiting',
  orbitedPlanetId: 'venus',
  distanceToPlanet: 100,
}

describe('GasCollectionMiniGame', () => {
  let game: GasCollectionMiniGame

  beforeEach(() => {
    game = new GasCollectionMiniGame('test-mission', 5)
  })

  describe('initialization', () => {
    it('starts with active status', () => {
      expect(game.status).toBe('active')
      expect(game.missionId).toBe('test-mission')
    })

    it('has correct progress tracking', () => {
      expect(game.progressCurrent).toBe(0)
      expect(game.progressTotal).toBe(5)
    })

    it('starts with max drones available', () => {
      expect(game.dronesRemaining).toBe(MAX_DRONES)
    })

    it('ship starts at center of canvas', () => {
      expect(game.shipX).toBeCloseTo(CANVAS_WIDTH / 2)
      expect(game.shipY).toBeCloseTo(CANVAS_HEIGHT / 2)
    })

    it('has two steps', () => {
      expect(game.steps).toHaveLength(2)
      expect(game.steps[0]!.label).toBe('Collect atmospheric gas')
      expect(game.steps[0]!.active).toBe(true)
      expect(game.steps[1]!.label).toBe('Mission complete')
      expect(game.steps[1]!.active).toBe(false)
    })
  })

  describe('ship movement', () => {
    it('accelerates right when right input is set', () => {
      game.setInput({ up: false, down: false, left: false, right: true })
      game.tick(0.1, STUB_CTX)
      expect(game.shipVx).toBeGreaterThan(0)
    })

    it('accelerates up when up input is set', () => {
      game.setInput({ up: true, down: false, left: false, right: false })
      game.tick(0.1, STUB_CTX)
      expect(game.shipVy).toBeLessThan(0)
    })

    it('applies drag when no input', () => {
      game.setInput({ up: false, down: false, left: false, right: true })
      game.tick(0.1, STUB_CTX)
      const vx1 = game.shipVx
      game.setInput({ up: false, down: false, left: false, right: false })
      game.tick(0.1, STUB_CTX)
      expect(game.shipVx).toBeLessThan(vx1)
    })

    it('clamps ship position to canvas bounds', () => {
      game.setInput({ up: true, down: false, left: true, right: false })
      for (let i = 0; i < 100; i++) game.tick(0.016, STUB_CTX)
      expect(game.shipX).toBeGreaterThanOrEqual(0)
      expect(game.shipY).toBeGreaterThanOrEqual(0)
    })
  })

  describe('drone launching', () => {
    it('launchDrone creates a drone', () => {
      game.launchDrone()
      expect(game.drones).toHaveLength(1)
      expect(game.dronesRemaining).toBe(MAX_DRONES - 1)
    })

    it('drone launches from ship position', () => {
      game.launchDrone()
      const drone = game.drones[0]!
      expect(drone.x).toBeCloseTo(game.shipX)
      expect(drone.y).toBeCloseTo(game.shipY)
    })

    it('does nothing when no drones remain', () => {
      for (let i = 0; i < MAX_DRONES; i++) game.launchDrone()
      expect(game.dronesRemaining).toBe(0)
      game.launchDrone()
      expect(game.drones).toHaveLength(MAX_DRONES)
    })

    it('drone falls under gravity', () => {
      game.launchDrone()
      const initialY = game.drones[0]!.y
      for (let i = 0; i < 30; i++) game.tick(0.016, STUB_CTX)
      expect(game.drones[0]!.y).toBeGreaterThan(initialY)
    })

    it('drone accumulates airTime', () => {
      game.launchDrone()
      game.tick(0.5, STUB_CTX)
      expect(game.drones[0]!.airTime).toBeCloseTo(0.5)
    })
  })

  describe('drone collection', () => {
    it('collecting a drone adds gas based on air time', () => {
      game.launchDrone()
      // Simulate air time
      game.drones[0]!.airTime = 2.0
      // Move drone to ship position for collision
      game.drones[0]!.x = game.shipX
      game.drones[0]!.y = game.shipY
      game.tick(0.016, STUB_CTX)
      expect(game.drones[0]!.collected).toBe(true)
      expect(game.gasCollected).toBeCloseTo(2.0)
    })

    it('gas yield is clamped to MAX_AIR_TIME_YIELD', () => {
      game.launchDrone()
      game.drones[0]!.airTime = 10.0
      game.drones[0]!.x = game.shipX
      game.drones[0]!.y = game.shipY
      game.tick(0.016, STUB_CTX)
      expect(game.gasCollected).toBeCloseTo(MAX_AIR_TIME_YIELD)
    })

    it('collection requires proximity within DRONE_COLLECT_RADIUS', () => {
      game.launchDrone()
      game.drones[0]!.airTime = 1.0
      game.drones[0]!.x = game.shipX + DRONE_COLLECT_RADIUS + 10
      game.drones[0]!.y = game.shipY
      game.tick(0.016, STUB_CTX)
      expect(game.drones[0]!.collected).toBe(false)
    })
  })

  describe('drone lost off screen', () => {
    it('drone falling below canvas is removed', () => {
      game.launchDrone()
      game.drones[0]!.y = CANVAS_HEIGHT + 50
      game.tick(0.016, STUB_CTX)
      expect(game.drones).toHaveLength(0)
    })
  })

  describe('completion', () => {
    it('auto-completes when gas gauge reaches target', () => {
      const cb = vi.fn()
      game.onComplete = cb
      // Simulate collecting enough gas
      game.launchDrone()
      game.drones[0]!.airTime = 3.0
      game.drones[0]!.x = game.shipX
      game.drones[0]!.y = game.shipY
      game.tick(0.016, STUB_CTX)

      game.launchDrone()
      game.drones.find((d) => !d.collected)!.airTime = 3.0
      game.drones.find((d) => !d.collected)!.x = game.shipX
      game.drones.find((d) => !d.collected)!.y = game.shipY
      game.tick(0.016, STUB_CTX)

      expect(game.gasCollected).toBeGreaterThanOrEqual(5)
      expect(game.status).toBe('completed')
      expect(cb).toHaveBeenCalledWith('test-mission')
    })

    it('fails when all drones spent and gauge not full', () => {
      for (let i = 0; i < MAX_DRONES; i++) {
        game.launchDrone()
      }
      // Let all drones fall off screen without collecting
      for (const drone of game.drones) {
        drone.y = CANVAS_HEIGHT + 50
      }
      game.tick(0.016, STUB_CTX)
      expect(game.dronesRemaining).toBe(0)
      expect(game.drones).toHaveLength(0)
      expect(game.status).toBe('failed')
    })
  })

  describe('tick guards', () => {
    it('tick is no-op after completed', () => {
      // Force completion
      game.launchDrone()
      game.drones[0]!.airTime = MAX_AIR_TIME_YIELD
      game.drones[0]!.x = game.shipX
      game.drones[0]!.y = game.shipY
      game.tick(0.016, STUB_CTX)
      game.launchDrone()
      game.drones.find((d) => !d.collected)!.airTime = MAX_AIR_TIME_YIELD
      game.drones.find((d) => !d.collected)!.x = game.shipX
      game.drones.find((d) => !d.collected)!.y = game.shipY
      game.tick(0.016, STUB_CTX)

      const gasBefore = game.gasCollected
      game.tick(1.0, STUB_CTX)
      expect(game.gasCollected).toBe(gasBefore)
    })

    it('tick is no-op after failed', () => {
      for (let i = 0; i < MAX_DRONES; i++) game.launchDrone()
      for (const drone of game.drones) drone.y = CANVAS_HEIGHT + 50
      game.tick(0.016, STUB_CTX)
      expect(game.status).toBe('failed')

      const shipX = game.shipX
      game.setInput({ up: false, down: false, left: false, right: true })
      game.tick(0.1, STUB_CTX)
      expect(game.shipX).toBe(shipX)
    })
  })

  describe('complete() method', () => {
    it('is a no-op — completion is automatic', () => {
      game.complete()
      expect(game.status).toBe('active')
    })
  })

  describe('dispose', () => {
    it('does not throw', () => {
      expect(() => game.dispose()).not.toThrow()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/minigame/gasCollection/__tests__/GasCollectionMiniGame.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Gas collection orbital minigame.
 *
 * 2D side-scrolling collection game: fly the shuttle, launch drones
 * with Q, collect them for gas yield proportional to air time.
 * Pure game logic — no DOM or canvas. The Vue component reads state
 * and renders.
 *
 * @author guinetik
 * @date 2026-04-10
 * @spec docs/superpowers/specs/2026-04-10-gas-collection-minigame-design.md
 */
import type {
  OrbitalMiniGame,
  OrbitalMiniGameContext,
  OrbitalMiniGameEvents,
  OrbitalMiniGameStatus,
  OrbitalMiniGameStep,
} from '../OrbitalMiniGame'
import type { ShipInput, Drone } from './types'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  SHIP_ACCELERATION,
  SHIP_DRAG,
  SHIP_MAX_SPEED,
  DRONE_GRAVITY,
  DRONE_LAUNCH_SPEED,
  DRONE_LAUNCH_ANGLE,
  DRONE_COLLECT_RADIUS,
  MAX_AIR_TIME_YIELD,
  MAX_DRONES,
  SHIP_HALF_WIDTH,
  SHIP_HALF_HEIGHT,
} from './constants'

/**
 * Gas collection minigame — fly the shuttle, launch and collect drones.
 *
 * @author guinetik
 * @date 2026-04-10
 */
export class GasCollectionMiniGame implements OrbitalMiniGame, OrbitalMiniGameEvents {
  readonly missionId: string
  readonly targetGas: number

  private _status: OrbitalMiniGameStatus = 'active'
  private readonly _steps: OrbitalMiniGameStep[] = [
    { label: 'Collect atmospheric gas', complete: false, active: true },
    { label: 'Mission complete', complete: false, active: false },
  ]

  /** Ship position in canvas pixels. */
  shipX = CANVAS_WIDTH / 2
  /** Ship position in canvas pixels. */
  shipY = CANVAS_HEIGHT / 2
  /** Ship velocity in px/s. */
  shipVx = 0
  /** Ship velocity in px/s. */
  shipVy = 0

  /** Active drones in flight. */
  drones: Drone[] = []
  /** Drones remaining to launch. */
  dronesRemaining = MAX_DRONES
  /** Accumulated gas gauge value. */
  gasCollected = 0

  private input: ShipInput = { up: false, down: false, left: false, right: false }

  onComplete: ((missionId: string) => void) | null = null
  onStepChange: ((steps: readonly OrbitalMiniGameStep[]) => void) | null = null

  constructor(missionId: string, targetGas: number) {
    this.missionId = missionId
    this.targetGas = targetGas
  }

  get status(): OrbitalMiniGameStatus {
    return this._status
  }

  get steps(): readonly OrbitalMiniGameStep[] {
    return this._steps
  }

  get progressCurrent(): number {
    return this.gasCollected
  }

  get progressTotal(): number {
    return this.targetGas
  }

  /** Set the current WASD input state. Called by the Vue component. */
  setInput(input: ShipInput): void {
    this.input = input
  }

  /** Launch a drone from the ship's current position and velocity. */
  launchDrone(): void {
    if (this._status !== 'active') return
    if (this.dronesRemaining <= 0) return

    this.dronesRemaining--

    const launchVx = this.shipVx + DRONE_LAUNCH_SPEED * Math.cos(DRONE_LAUNCH_ANGLE)
    const launchVy = this.shipVy + DRONE_LAUNCH_SPEED * Math.sin(DRONE_LAUNCH_ANGLE)

    this.drones.push({
      x: this.shipX,
      y: this.shipY,
      vx: launchVx,
      vy: launchVy,
      airTime: 0,
      collected: false,
    })
  }

  tick(dt: number, _ctx: OrbitalMiniGameContext): void {
    if (this._status !== 'active') return

    this.tickShip(dt)
    this.tickDrones(dt)
    this.checkCollisions()
    this.cleanupDrones()
    this.checkEndConditions()
  }

  /** Manual complete is a no-op — completion is automatic via gauge. */
  complete(): void {
    // Completion is driven by gasCollected reaching targetGas
  }

  dispose(): void {
    this.drones.length = 0
  }

  private tickShip(dt: number): void {
    // Apply acceleration from input
    if (this.input.right) this.shipVx += SHIP_ACCELERATION * dt
    if (this.input.left) this.shipVx -= SHIP_ACCELERATION * dt
    if (this.input.up) this.shipVy -= SHIP_ACCELERATION * dt
    if (this.input.down) this.shipVy += SHIP_ACCELERATION * dt

    // Apply drag (convert per-frame drag to per-second)
    const dragPerFrame = Math.pow(SHIP_DRAG, dt * 60)
    this.shipVx *= dragPerFrame
    this.shipVy *= dragPerFrame

    // Clamp speed
    const speed = Math.sqrt(this.shipVx * this.shipVx + this.shipVy * this.shipVy)
    if (speed > SHIP_MAX_SPEED) {
      const scale = SHIP_MAX_SPEED / speed
      this.shipVx *= scale
      this.shipVy *= scale
    }

    // Apply velocity
    this.shipX += this.shipVx * dt
    this.shipY += this.shipVy * dt

    // Clamp to canvas bounds
    this.shipX = Math.max(SHIP_HALF_WIDTH, Math.min(CANVAS_WIDTH - SHIP_HALF_WIDTH, this.shipX))
    this.shipY = Math.max(SHIP_HALF_HEIGHT, Math.min(CANVAS_HEIGHT - SHIP_HALF_HEIGHT, this.shipY))
  }

  private tickDrones(dt: number): void {
    for (const drone of this.drones) {
      if (drone.collected) continue
      drone.vy += DRONE_GRAVITY * dt
      drone.x += drone.vx * dt
      drone.y += drone.vy * dt
      drone.airTime += dt
    }
  }

  private checkCollisions(): void {
    for (const drone of this.drones) {
      if (drone.collected) continue
      const dx = drone.x - this.shipX
      const dy = drone.y - this.shipY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist <= DRONE_COLLECT_RADIUS) {
        drone.collected = true
        const yield_ = Math.min(drone.airTime, MAX_AIR_TIME_YIELD)
        this.gasCollected += yield_
      }
    }
  }

  private cleanupDrones(): void {
    this.drones = this.drones.filter(
      (d) => !d.collected && d.y <= CANVAS_HEIGHT + 20,
    )
  }

  private checkEndConditions(): void {
    if (this.gasCollected >= this.targetGas) {
      this._status = 'completed'
      this._steps[0]!.complete = true
      this._steps[0]!.active = false
      this._steps[1]!.complete = true
      this._steps[1]!.active = false
      this.onStepChange?.(this._steps)
      this.onComplete?.(this.missionId)
      return
    }

    if (this.dronesRemaining === 0 && this.drones.length === 0) {
      this._status = 'failed'
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/minigame/gasCollection/__tests__/GasCollectionMiniGame.spec.ts`
Expected: PASS — all tests green

- [ ] **Step 5: Run lint**

Run: `bun lint`
Expected: PASS (no new errors)

- [ ] **Step 6: Commit**

```bash
git add src/lib/minigame/gasCollection/GasCollectionMiniGame.ts src/lib/minigame/gasCollection/__tests__/GasCollectionMiniGame.spec.ts
git commit -m "feat: add GasCollectionMiniGame with physics and tests"
```

---

### Task 4: Update Factory and Factory Tests

**Files:**
- Modify: `src/lib/minigame/orbitalMiniGameFactory.ts`
- Modify: `src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts`

The factory signature needs a `targetGas` parameter so `GasCollectionMiniGame` gets `gatherQuantity`. All existing callers pass it through.

- [ ] **Step 1: Update factory tests**

Replace the entire file:

```ts
import { describe, it, expect } from 'vitest'
import { createOrbitalMiniGame } from '../orbitalMiniGameFactory'
import { DefaultOrbitalMiniGame } from '../DefaultOrbitalMiniGame'
import { GasCollectionMiniGame } from '../gasCollection/GasCollectionMiniGame'

const DEFAULT_TYPES = [
  'probe-deploy',
  'logistics',
  'chemistry',
  'ice-harvest',
  'maintenance',
]

describe('createOrbitalMiniGame', () => {
  it.each(DEFAULT_TYPES)(
    'returns DefaultOrbitalMiniGame for type "%s"',
    (minigameType) => {
      const mg = createOrbitalMiniGame('mission-1', minigameType, 3)
      expect(mg.status).toBe('active')
      expect(mg.missionId).toBe('mission-1')
      expect(mg).toBeInstanceOf(DefaultOrbitalMiniGame)
    },
  )

  it('returns GasCollectionMiniGame for type "gas-collection"', () => {
    const mg = createOrbitalMiniGame('mission-1', 'gas-collection', 5)
    expect(mg).toBeInstanceOf(GasCollectionMiniGame)
    expect(mg.missionId).toBe('mission-1')
    expect(mg.progressTotal).toBe(5)
  })

  it('returns DefaultOrbitalMiniGame for unknown type', () => {
    const mg = createOrbitalMiniGame('mission-2', 'unknown-future-type', 1)
    expect(mg).toBeInstanceOf(DefaultOrbitalMiniGame)
    expect(mg.missionId).toBe('mission-2')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts`
Expected: FAIL — `createOrbitalMiniGame` signature mismatch

- [ ] **Step 3: Update the factory implementation**

Replace the entire file:

```ts
/**
 * Orbital minigame factory.
 *
 * Dispatches on the minigameType string from planet-orbital-config.json
 * to create the appropriate OrbitalMiniGame implementation.
 *
 * @author guinetik
 * @date 2026-04-10
 * @spec docs/superpowers/specs/2026-04-10-orbital-minigame-design.md
 */
import type { OrbitalMiniGame } from './OrbitalMiniGame'
import { DefaultOrbitalMiniGame } from './DefaultOrbitalMiniGame'
import { GasCollectionMiniGame } from './gasCollection/GasCollectionMiniGame'

/**
 * Create an orbital minigame for the given mission and minigame type.
 *
 * @param missionId - The shuttle mission id.
 * @param minigameType - The minigame type from planet-orbital-config.json.
 * @param targetGas - The gather quantity from the mission template.
 * @returns A new OrbitalMiniGame instance.
 *
 * @author guinetik
 * @date 2026-04-10
 */
export function createOrbitalMiniGame(
  missionId: string,
  minigameType: string,
  targetGas: number,
): OrbitalMiniGame {
  switch (minigameType) {
    case 'gas-collection':
      return new GasCollectionMiniGame(missionId, targetGas)
    case 'probe-deploy':
    case 'logistics':
    case 'chemistry':
    case 'ice-harvest':
    case 'maintenance':
    default:
      return new DefaultOrbitalMiniGame(missionId)
  }
}
```

- [ ] **Step 4: Run factory tests to verify they pass**

Run: `bun test:unit src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts`
Expected: PASS — all tests green

- [ ] **Step 5: Update the facade call site**

In `src/lib/map/missions/MapMissionFacade.ts`, find the line (around line 217):

```ts
    this.activeMinigame = createOrbitalMiniGame(mission.template.id, minigameType)
```

Replace with:

```ts
    this.activeMinigame = createOrbitalMiniGame(
      mission.template.id,
      minigameType,
      mission.template.gatherQuantity,
    )
```

- [ ] **Step 6: Run type-check**

Run: `bun run type-check`
Expected: PASS (pre-existing errors only)

- [ ] **Step 7: Commit**

```bash
git add src/lib/minigame/orbitalMiniGameFactory.ts src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts src/lib/map/missions/MapMissionFacade.ts
git commit -m "feat: factory dispatches gas-collection to GasCollectionMiniGame"
```

---

### Task 5: GasCollectionCanvas Vue Component

**Files:**
- Create: `src/components/GasCollectionCanvas.vue`

This component owns the `<canvas>` element, `requestAnimationFrame` render loop, keyboard input, and all rendering. It receives the `GasCollectionMiniGame` instance as a prop and reads its state each frame.

- [ ] **Step 1: Create the component**

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { GasCollectionMiniGame } from '@/lib/minigame/gasCollection/GasCollectionMiniGame'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  SHIP_HALF_WIDTH,
  SHIP_HALF_HEIGHT,
  DRONE_COLLECT_RADIUS,
} from '@/lib/minigame/gasCollection/constants'
import type { OrbitalMiniGameContext } from '@/lib/minigame/OrbitalMiniGame'

const props = defineProps<{
  minigame: GasCollectionMiniGame
}>()

const emit = defineEmits<{
  complete: []
  fail: []
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let animId = 0
let lastTime = 0
let bgOffset = 0

const STUB_CTX: OrbitalMiniGameContext = {
  shipPosition: { x: 0, y: 0, z: 0 },
  orbitState: 'orbiting',
  orbitedPlanetId: null,
  distanceToPlanet: null,
}

const keys: Record<string, boolean> = {}

function onKeyDown(e: KeyboardEvent) {
  keys[e.key.toLowerCase()] = true
  if (e.key.toLowerCase() === 'q') {
    props.minigame.launchDrone()
  }
}

function onKeyUp(e: KeyboardEvent) {
  keys[e.key.toLowerCase()] = false
}

function updateInput() {
  props.minigame.setInput({
    up: !!keys['w'],
    down: !!keys['s'],
    left: !!keys['a'],
    right: !!keys['d'],
  })
}

function drawBackground(ctx: CanvasRenderingContext2D, dt: number) {
  bgOffset += dt * 120
  if (bgOffset > CANVAS_WIDTH) bgOffset -= CANVAS_WIDTH

  // Atmosphere gradient
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
  grad.addColorStop(0, '#1a0a00')
  grad.addColorStop(0.3, '#cc6600')
  grad.addColorStop(0.6, '#ff9933')
  grad.addColorStop(1, '#ffcc66')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  // Scrolling cloud bands
  ctx.globalAlpha = 0.15
  for (let i = 0; i < 6; i++) {
    const y = 60 + i * 80
    const offset = (bgOffset * (0.5 + i * 0.15)) % CANVAS_WIDTH
    ctx.fillStyle = i % 2 === 0 ? '#fff' : '#cc8800'
    ctx.fillRect(-offset, y, CANVAS_WIDTH * 2, 20 + i * 5)
  }
  ctx.globalAlpha = 1.0
}

function drawShip(ctx: CanvasRenderingContext2D) {
  const { shipX: x, shipY: y } = props.minigame
  ctx.save()
  ctx.translate(x, y)

  // Ship body — cone right, thrusters left
  ctx.fillStyle = '#e0ddd8'
  ctx.beginPath()
  ctx.moveTo(SHIP_HALF_WIDTH, 0)
  ctx.lineTo(-SHIP_HALF_WIDTH, -SHIP_HALF_HEIGHT)
  ctx.lineTo(-SHIP_HALF_WIDTH, SHIP_HALF_HEIGHT)
  ctx.closePath()
  ctx.fill()

  // Thruster glow
  const hasThrust =
    props.minigame.shipVx !== 0 || props.minigame.shipVy !== 0
  if (hasThrust) {
    ctx.fillStyle = '#00ccff'
    ctx.globalAlpha = 0.6 + Math.random() * 0.3
    ctx.beginPath()
    ctx.moveTo(-SHIP_HALF_WIDTH, -4)
    ctx.lineTo(-SHIP_HALF_WIDTH - 12 - Math.random() * 8, 0)
    ctx.lineTo(-SHIP_HALF_WIDTH, 4)
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1.0
  }

  ctx.restore()
}

function drawDrones(ctx: CanvasRenderingContext2D) {
  for (const drone of props.minigame.drones) {
    if (drone.collected) continue
    ctx.save()
    ctx.translate(drone.x, drone.y)

    // Drone glow
    ctx.fillStyle = '#00ffcc'
    ctx.shadowColor = '#00ffcc'
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.arc(0, 0, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

    ctx.restore()
  }
}

function drawGauge(ctx: CanvasRenderingContext2D) {
  const barWidth = CANVAS_WIDTH - 100
  const barHeight = 16
  const barX = 50
  const barY = CANVAS_HEIGHT - 40

  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
  ctx.fillRect(barX, barY, barWidth, barHeight)

  // Fill
  const fill = Math.min(
    props.minigame.gasCollected / props.minigame.targetGas,
    1,
  )
  ctx.fillStyle = fill >= 1 ? '#00ff88' : '#00ccff'
  ctx.fillRect(barX, barY, barWidth * fill, barHeight)

  // Border
  ctx.strokeStyle = 'rgba(0, 204, 255, 0.4)'
  ctx.strokeRect(barX, barY, barWidth, barHeight)

  // Label
  ctx.fillStyle = '#ffffff'
  ctx.font = '11px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(
    `GAS: ${props.minigame.gasCollected.toFixed(1)} / ${props.minigame.targetGas}`,
    CANVAS_WIDTH / 2,
    barY - 6,
  )
}

function drawEndScreen(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  ctx.fillStyle = props.minigame.status === 'completed' ? '#00ff88' : '#ff4444'
  ctx.font = 'bold 28px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(
    props.minigame.status === 'completed'
      ? 'COLLECTION COMPLETE'
      : 'DRONES DEPLETED — MISSION FAILED',
    CANVAS_WIDTH / 2,
    CANVAS_HEIGHT / 2,
  )
}

function loop(time: number) {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dt = lastTime === 0 ? 0.016 : Math.min((time - lastTime) / 1000, 0.05)
  lastTime = time

  if (props.minigame.status === 'active') {
    updateInput()
    props.minigame.tick(dt, STUB_CTX)
  }

  // Clear + draw
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  drawBackground(ctx, dt)
  drawShip(ctx)
  drawDrones(ctx)
  drawGauge(ctx)

  // Drone counter — show total drones for the attempt
  ctx.fillStyle = '#00ccff'
  ctx.font = '12px monospace'
  ctx.textAlign = 'right'
  const totalUsed = 5 - props.minigame.dronesRemaining
  ctx.fillText(`DRONES: ${props.minigame.dronesRemaining} remaining`, CANVAS_WIDTH - 20, 30)

  // Q prompt
  if (props.minigame.dronesRemaining > 0 && props.minigame.status === 'active') {
    ctx.fillStyle = 'rgba(0, 204, 255, 0.5)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('[Q] LAUNCH DRONE', 20, 30)
  }

  if (props.minigame.status === 'completed') {
    drawEndScreen(ctx)
    emit('complete')
    return
  }
  if (props.minigame.status === 'failed') {
    drawEndScreen(ctx)
    emit('fail')
    return
  }

  animId = requestAnimationFrame(loop)
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  animId = requestAnimationFrame(loop)
})

onUnmounted(() => {
  cancelAnimationFrame(animId)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})
</script>

<template>
  <canvas
    ref="canvasRef"
    :width="CANVAS_WIDTH"
    :height="CANVAS_HEIGHT"
    class="gas-collection-canvas"
  />
</template>
```

- [ ] **Step 2: Add CSS**

In `src/assets/css/main.css`, add after the existing mission minigame overlay styles:

```css
/* Gas Collection Minigame Canvas */
.gas-collection-canvas {
  @apply w-full h-auto max-h-[80vh] rounded-lg border border-cyan-400/20;
  image-rendering: pixelated;
}
```

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`
Expected: PASS (pre-existing errors only)

- [ ] **Step 4: Commit**

```bash
git add src/components/GasCollectionCanvas.vue src/assets/css/main.css
git commit -m "feat: add GasCollectionCanvas Vue component with render loop"
```

---

### Task 6: Wire Overlay to Show Canvas for Gas Collection

**Files:**
- Modify: `src/components/MissionMiniGameOverlay.vue`

When the minigame is a `GasCollectionMiniGame`, the overlay renders the canvas component fullscreen instead of the button card. Close button (ESC or X) stays available.

- [ ] **Step 1: Update the overlay component**

Replace the entire `MissionMiniGameOverlay.vue`:

```vue
<script setup lang="ts">
import type { ActiveShuttleMission } from '@/lib/missions/types'
import type { OrbitalMiniGame } from '@/lib/minigame/OrbitalMiniGame'
import { GasCollectionMiniGame } from '@/lib/minigame/gasCollection/GasCollectionMiniGame'
import GasCollectionCanvas from '@/components/GasCollectionCanvas.vue'
import { getPlanetOrbitalConfig } from '@/lib/missions/planetOrbitalConfig'
import { getItemDefinition } from '@/lib/inventory/catalog'
import { computed } from 'vue'

const props = defineProps<{
  mission: ActiveShuttleMission
  canFitCargo: boolean
  minigame: OrbitalMiniGame | null
}>()

const emit = defineEmits<{
  complete: []
  close: []
}>()

function handleComplete() {
  props.minigame?.complete()
  emit('complete')
}

const isGasCollection = computed(
  () => props.minigame instanceof GasCollectionMiniGame,
)

const gasMinigame = computed(
  () => (props.minigame instanceof GasCollectionMiniGame ? props.minigame : null),
)

const orbitalConfig = computed(() => getPlanetOrbitalConfig(props.mission.template.targetPlanet))
const gatherItemDef = computed(() => {
  const itemId = orbitalConfig.value?.gatherItem
  return itemId ? getItemDefinition(itemId) : undefined
})
</script>

<template>
  <!-- Gas Collection: fullscreen canvas -->
  <div v-if="isGasCollection && gasMinigame" class="mission-minigame-overlay">
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
        <GasCollectionCanvas
          :minigame="gasMinigame"
          @complete="emit('complete')"
          @fail="() => {}"
        />
      </div>
    </div>
  </div>

  <!-- Default: button card -->
  <div v-else class="mission-minigame-overlay">
    <div class="mission-minigame-card">
      <div class="mission-minigame-card__chrome">
        <span>Orbital Mission</span>
        <button
          type="button"
          class="ship-message-card__button"
          @click="emit('close')"
        >
          Close
        </button>
      </div>
      <div class="mission-minigame-card__body">
        <h2 class="mission-minigame-card__title">{{ mission.template.name }}</h2>
        <p class="mission-minigame-card__desc">{{ mission.template.description }}</p>
        <div class="mission-minigame-card__details">
          <span v-if="gatherItemDef">
            Collect: {{ mission.template.gatherQuantity }}x {{ gatherItemDef.label }}
            ({{ gatherItemDef.weightPerUnit * mission.template.gatherQuantity }} kg)
          </span>
        </div>
        <div v-if="!canFitCargo" class="mission-minigame-card__warning">
          Cargo hold full — make room before starting
        </div>
        <button
          type="button"
          class="mission-minigame-card__complete-btn"
          :disabled="!canFitCargo"
          @click="handleComplete"
        >
          Complete Mission
        </button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: PASS (pre-existing errors only)

- [ ] **Step 3: Commit**

```bash
git add src/components/MissionMiniGameOverlay.vue
git commit -m "feat: overlay shows GasCollectionCanvas for gas-collection missions"
```

---

### Task 7: Manual Browser Test

**Files:** None (testing only)

- [ ] **Step 1: Start dev server**

Run: `bun dev`

- [ ] **Step 2: Test gas collection minigame**

1. Buy Heat Shield level 1 from a planet shop (or start with it if upgrades are defaulted)
2. Accept a shuttle mission targeting Venus (e.g. "Venus Atmospheric Survey" from Earth)
3. Travel to Venus, orbit it
4. Press I to open the mission overlay
5. Verify: canvas appears with Venus atmosphere background, shuttle side-profile, and gas gauge
6. Test WASD movement — ship should accelerate and drift
7. Press Q — drone should arc out from the ship
8. Fly into the drone to collect it — gas gauge should fill
9. Collect enough gas to fill the gauge — minigame should auto-complete
10. Verify: mission completes, inventory updates

- [ ] **Step 3: Test fail state**

1. Accept another Venus mission
2. Open the minigame at Venus orbit
3. Launch all 5 drones without collecting any (let them fall)
4. Verify: "DRONES DEPLETED" failure message appears
5. Close overlay, re-open — should get a fresh attempt

- [ ] **Step 4: Test default minigame still works**

1. Accept a mission targeting a non-gas-collection planet (e.g. Mars — chemistry type)
2. Travel there, orbit, press I
3. Verify: old button card overlay appears, not the canvas
4. Click "Complete Mission" — should work as before

- [ ] **Step 5: Commit any fixes**

If manual testing reveals issues, fix and commit with descriptive message.
