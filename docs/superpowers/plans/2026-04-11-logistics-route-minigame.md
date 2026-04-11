# Logistics Route Minigame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Earth orbital minigame — a vertical-scroller where the shuttle flies through scrolling shipping lanes, collecting route symbols in manifest order while dodging traffic.

**Architecture:** Pure game logic in `LogisticsRouteMiniGame.ts` (implements `OrbitalMiniGame`), types + constants in sibling files, canvas renderer in `LogisticsRouteCanvas.vue`. Factory and overlay wired in last.

**Tech Stack:** TypeScript, Vue 3, HTML5 Canvas, Vitest

**Spec:** `docs/superpowers/specs/2026-04-11-logistics-route-minigame-design.md`

---

### Task 1: Types

**Files:**
- Create: `src/lib/minigame/logistics/types.ts`

- [ ] **Step 1: Create the types file**

```ts
/**
 * Types for the logistics route orbital minigame.
 *
 * @author guinetik
 * @date 2026-04-11
 * @spec docs/superpowers/specs/2026-04-11-logistics-route-minigame-design.md
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

/** Route symbol shape types. */
export type RouteSymbolType = 'star' | 'diamond' | 'circle' | 'triangle' | 'square'

/** All available route symbol types. */
export const ROUTE_SYMBOL_TYPES: readonly RouteSymbolType[] = [
  'star',
  'diamond',
  'circle',
  'triangle',
  'square',
]

/** A route symbol scrolling down a shipping lane. */
export interface RouteSymbol {
  /** Horizontal position in canvas pixels (lane-centered). */
  x: number
  /** Vertical position in canvas pixels. */
  y: number
  /** The symbol shape type. */
  type: RouteSymbolType
  /** Which lane this symbol occupies (0-based). */
  lane: number
  /** Whether this symbol has been collected by the player. */
  collected: boolean
}

/** A traffic shuttle scrolling down a shipping lane. */
export interface TrafficShuttle {
  /** Horizontal position in canvas pixels. */
  x: number
  /** Vertical position in canvas pixels. */
  y: number
  /** Vertical scroll speed in px/s (positive = moving down). */
  speed: number
  /** Visual size multiplier (0.6–1.0). */
  size: number
  /** Which lane this shuttle occupies (0-based). */
  lane: number
  /** Visual opacity (0.3–0.6). */
  alpha: number
}
```

- [ ] **Step 2: Verify types compile**

Run: `bun run type-check`
Expected: PASS (no errors in the new file)

- [ ] **Step 3: Commit**

```bash
git add src/lib/minigame/logistics/types.ts
git commit -m "feat(logistics): add types for route symbols, traffic, and ship input"
```

---

### Task 2: Constants

**Files:**
- Create: `src/lib/minigame/logistics/constants.ts`

- [ ] **Step 1: Create the constants file**

```ts
/**
 * Tuning constants for the logistics route minigame.
 *
 * @author guinetik
 * @date 2026-04-11
 * @spec docs/superpowers/specs/2026-04-11-logistics-route-minigame-design.md
 */

/** Logical canvas width in pixels. */
export const CANVAS_WIDTH = 800

/** Logical canvas height in pixels. */
export const CANVAS_HEIGHT = 500

// ─── Lanes ──────────────────────────────────────────────────────────────────

/** Number of shipping lanes. */
export const LANE_COUNT = 5

/** X position where the lane area begins (px). */
export const LANE_START_X = 64

/** Horizontal spacing between lane centers (px). */
export const LANE_SPACING = 100

// ─── Ship ───────────────────────────────────────────────────────────────────

/** Ship acceleration in px/s² when holding W/S. */
export const SHIP_ACCEL = 600

/** Velocity drag multiplier applied per frame (0–1, lower = more drag). */
export const SHIP_DRAG = 0.90

/** Maximum vertical ship speed in px/s. */
export const SHIP_MAX_SPEED_Y = 350

/** Maximum horizontal ship speed in px/s. */
export const SHIP_MAX_SPEED_X = 200

/** Soft spring strength pulling ship back to center (units/s²). */
export const SPRING_STRENGTH = 3.0

/** Ship collision half-width in px. */
export const SHIP_HALF_SIZE = 14

/** Edge padding — ship can't get closer than this to canvas edge (px). */
export const EDGE_PADDING = 30

/** Starting X position — center of the lane area. */
export const SHIP_START_X = LANE_START_X + LANE_SPACING * ((LANE_COUNT + 1) / 2)

/** Starting Y position — lower third of canvas. */
export const SHIP_START_Y = CANVAS_HEIGHT * 0.7

// ─── Hull ───────────────────────────────────────────────────────────────────

/** Starting and maximum hull HP. */
export const HULL_MAX_HP = 100

/** HP lost on traffic collision. */
export const TRAFFIC_DAMAGE = 15

/** Seconds of invulnerability after taking damage. */
export const DAMAGE_GRACE_PERIOD = 1.0

/** Knockback impulse speed applied on traffic collision (px/s). */
export const KNOCKBACK_SPEED = 120

// ─── Route Symbols ──────────────────────────────────────────────────────────

/** Minimum manifest length (floor). */
export const MIN_MANIFEST_LENGTH = 4

/** Collection radius — fly within this distance to collect a symbol (px). */
export const SYMBOL_COLLECT_RADIUS = 20

/** Seconds between symbol spawns. */
export const SYMBOL_SPAWN_INTERVAL = 1.8

// ─── Traffic ────────────────────────────────────────────────────────────────

/** Traffic shuttle collision radius (px). */
export const TRAFFIC_RADIUS = 12

/** Random X jitter applied to traffic lane position (±px). */
export const TRAFFIC_LANE_JITTER = 8

/** Minimum vertical gap between any two traffic shuttles (px). */
export const MIN_TRAFFIC_GAP = 120

/** Traffic speed multiplier range — min factor of scroll speed. */
export const TRAFFIC_SPEED_MIN_FACTOR = 0.8

/** Traffic speed multiplier range — added random range. */
export const TRAFFIC_SPEED_RANDOM_RANGE = 0.6

// ─── Difficulty Scaling ─────────────────────────────────────────────────────

/** Base scroll speed at targetGas <= 4 (px/s). */
export const BASE_SCROLL_SPEED = 100

/** Additional scroll speed per targetGas unit above 4 (px/s). */
export const SCROLL_SPEED_PER_TARGET = 10

/** Base max traffic on screen at targetGas <= 4. */
export const BASE_TRAFFIC_COUNT = 4

/** Spawn interval for traffic shuttles (seconds). */
export const TRAFFIC_SPAWN_INTERVAL = 2.0
```

- [ ] **Step 2: Verify constants compile**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/minigame/logistics/constants.ts
git commit -m "feat(logistics): add tuning constants for lanes, ship, traffic, difficulty"
```

---

### Task 3: Core Game Logic — Initialization & Ship Movement

**Files:**
- Create: `src/lib/minigame/logistics/LogisticsRouteMiniGame.ts`
- Create: `src/lib/minigame/logistics/__tests__/LogisticsRouteMiniGame.spec.ts`

- [ ] **Step 1: Write failing tests for initialization and ship movement**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { LogisticsRouteMiniGame } from '../LogisticsRouteMiniGame'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  SHIP_START_X,
  SHIP_START_Y,
  HULL_MAX_HP,
  MIN_MANIFEST_LENGTH,
  EDGE_PADDING,
} from '../constants'
import type { OrbitalMiniGameContext } from '../../OrbitalMiniGame'

const STUB_CTX: OrbitalMiniGameContext = {
  shipPosition: { x: 0, y: 0, z: 0 },
  orbitState: 'orbiting',
  orbitedPlanetId: 'earth',
  distanceToPlanet: null,
}

describe('LogisticsRouteMiniGame', () => {
  let game: LogisticsRouteMiniGame

  beforeEach(() => {
    game = new LogisticsRouteMiniGame('test-mission', 4)
  })

  describe('initialization', () => {
    it('starts with active status', () => {
      expect(game.status).toBe('active')
      expect(game.missionId).toBe('test-mission')
    })

    it('has correct progress tracking', () => {
      expect(game.progressCurrent).toBe(0)
      expect(game.progressTotal).toBe(4)
    })

    it('ship starts at configured position', () => {
      expect(game.shipX).toBeCloseTo(SHIP_START_X)
      expect(game.shipY).toBeCloseTo(SHIP_START_Y)
    })

    it('hull starts at max', () => {
      expect(game.hullHp).toBe(HULL_MAX_HP)
      expect(game.hullMaxHp).toBe(HULL_MAX_HP)
    })

    it('manifest length is max(4, targetGas)', () => {
      expect(game.manifest).toHaveLength(4)
      const game6 = new LogisticsRouteMiniGame('t', 6)
      expect(game6.manifest).toHaveLength(6)
    })

    it('manifest length floors at MIN_MANIFEST_LENGTH for low targetGas', () => {
      const game2 = new LogisticsRouteMiniGame('t', 2)
      expect(game2.manifest).toHaveLength(MIN_MANIFEST_LENGTH)
    })

    it('manifest contains valid symbol types', () => {
      const validTypes = ['star', 'diamond', 'circle', 'triangle', 'square']
      for (const sym of game.manifest) {
        expect(validTypes).toContain(sym)
      }
    })

    it('manifestIndex starts at 0', () => {
      expect(game.manifestIndex).toBe(0)
    })

    it('has two steps', () => {
      expect(game.steps).toHaveLength(2)
      expect(game.steps[0]!.label).toBe('Collect route symbols')
      expect(game.steps[0]!.active).toBe(true)
      expect(game.steps[1]!.label).toBe('Mission complete')
      expect(game.steps[1]!.active).toBe(false)
    })
  })

  describe('ship movement', () => {
    it('accelerates down when S input is set', () => {
      game.setInput({ up: false, down: true, left: false, right: false })
      game.tick(0.1, STUB_CTX)
      expect(game.shipVy).toBeGreaterThan(0)
    })

    it('accelerates up when W input is set', () => {
      game.setInput({ up: true, down: false, left: false, right: false })
      game.tick(0.1, STUB_CTX)
      expect(game.shipVy).toBeLessThan(0)
    })

    it('applies drag when no input', () => {
      game.setInput({ up: false, down: true, left: false, right: false })
      game.tick(0.1, STUB_CTX)
      const vy1 = game.shipVy
      game.setInput({ up: false, down: false, left: false, right: false })
      game.tick(0.1, STUB_CTX)
      expect(Math.abs(game.shipVy)).toBeLessThan(Math.abs(vy1))
    })

    it('soft spring pulls ship toward center when no horizontal input', () => {
      game.shipX = SHIP_START_X + 100
      game.shipVx = 0
      game.setInput({ up: false, down: false, left: false, right: false })
      game.tick(0.1, STUB_CTX)
      // Spring should push ship left (toward center)
      expect(game.shipVx).toBeLessThan(0)
    })

    it('horizontal input can fight the spring', () => {
      game.shipX = SHIP_START_X + 50
      game.shipVx = 0
      game.setInput({ up: false, down: false, left: false, right: true })
      game.tick(0.1, STUB_CTX)
      // Right input should overpower spring pulling left
      expect(game.shipVx).toBeGreaterThan(0)
    })

    it('clamps ship position to canvas bounds', () => {
      game.setInput({ up: true, down: false, left: true, right: false })
      for (let i = 0; i < 200; i++) game.tick(0.016, STUB_CTX)
      expect(game.shipX).toBeGreaterThanOrEqual(EDGE_PADDING)
      expect(game.shipY).toBeGreaterThanOrEqual(EDGE_PADDING)
    })

    it('no gravity — ship stays still with no input', () => {
      const y0 = game.shipY
      game.tick(0.5, STUB_CTX)
      // Only drag applies, no gravity, so vy stays ~0 and position barely changes
      expect(game.shipY).toBeCloseTo(y0, 0)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/minigame/logistics/__tests__/LogisticsRouteMiniGame.spec.ts`
Expected: FAIL — `LogisticsRouteMiniGame` module not found

- [ ] **Step 3: Implement LogisticsRouteMiniGame — constructor, movement, tick skeleton**

```ts
/**
 * Logistics route orbital minigame.
 *
 * Vertical scroller: fly through scrolling orbital shipping lanes near
 * Earth, collecting route symbols in manifest order while dodging
 * traffic shuttles. Pure arcade — no gravity, fast reflexes.
 *
 * Pure game logic — no DOM or canvas. The Vue component reads state
 * and renders.
 *
 * @author guinetik
 * @date 2026-04-11
 * @spec docs/superpowers/specs/2026-04-11-logistics-route-minigame-design.md
 */
import type {
  OrbitalMiniGame,
  OrbitalMiniGameContext,
  OrbitalMiniGameEvents,
  OrbitalMiniGameStatus,
  OrbitalMiniGameStep,
} from '../OrbitalMiniGame'
import type { ShipInput, RouteSymbol, TrafficShuttle, RouteSymbolType } from './types'
import { ROUTE_SYMBOL_TYPES } from './types'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  LANE_COUNT,
  LANE_START_X,
  LANE_SPACING,
  SHIP_ACCEL,
  SHIP_DRAG,
  SHIP_MAX_SPEED_X,
  SHIP_MAX_SPEED_Y,
  SPRING_STRENGTH,
  SHIP_HALF_SIZE,
  EDGE_PADDING,
  SHIP_START_X,
  SHIP_START_Y,
  HULL_MAX_HP,
  TRAFFIC_DAMAGE,
  DAMAGE_GRACE_PERIOD,
  KNOCKBACK_SPEED,
  MIN_MANIFEST_LENGTH,
  SYMBOL_COLLECT_RADIUS,
  SYMBOL_SPAWN_INTERVAL,
  TRAFFIC_RADIUS,
  TRAFFIC_LANE_JITTER,
  MIN_TRAFFIC_GAP,
  TRAFFIC_SPEED_MIN_FACTOR,
  TRAFFIC_SPEED_RANDOM_RANGE,
  BASE_SCROLL_SPEED,
  SCROLL_SPEED_PER_TARGET,
  BASE_TRAFFIC_COUNT,
  TRAFFIC_SPAWN_INTERVAL,
} from './constants'

/**
 * Get the X center of a lane by index (0-based).
 *
 * @param lane - Lane index (0 to LANE_COUNT-1).
 * @returns X position in canvas pixels.
 */
function laneX(lane: number): number {
  return LANE_START_X + LANE_SPACING * (lane + 1)
}

/**
 * Logistics route minigame — collect symbols in order, dodge traffic.
 *
 * @author guinetik
 * @date 2026-04-11
 */
export class LogisticsRouteMiniGame implements OrbitalMiniGame, OrbitalMiniGameEvents {
  /** The shuttle mission id this minigame tracks. */
  readonly missionId: string

  /** The original targetGas value from the mission. */
  readonly targetGas: number

  private _status: OrbitalMiniGameStatus = 'active'
  private readonly _steps: OrbitalMiniGameStep[] = [
    { label: 'Collect route symbols', complete: false, active: true },
    { label: 'Mission complete', complete: false, active: false },
  ]

  /** Ship horizontal position in canvas pixels. */
  shipX = SHIP_START_X
  /** Ship vertical position in canvas pixels. */
  shipY = SHIP_START_Y
  /** Ship horizontal velocity in px/s. */
  shipVx = 0
  /** Ship vertical velocity in px/s. */
  shipVy = 0

  /** Horizontal center the spring pulls toward. */
  readonly centerX = SHIP_START_X

  /** Current hull hit points. */
  hullHp = HULL_MAX_HP
  /** Maximum hull hit points. */
  readonly hullMaxHp = HULL_MAX_HP

  /** Damage grace period timer (seconds remaining). */
  damageFlash = 0

  /** The ordered sequence of symbol types to collect. */
  readonly manifest: readonly RouteSymbolType[]
  /** Index of the next symbol to collect in the manifest. */
  manifestIndex = 0

  /** Active route symbols on screen. */
  symbols: RouteSymbol[] = []
  /** Active traffic shuttles on screen. */
  traffic: TrafficShuttle[] = []

  /** Computed scroll speed based on difficulty. */
  readonly scrollSpeed: number
  /** Maximum traffic shuttles on screen. */
  readonly maxTraffic: number

  /** Time accumulator for symbol spawning. */
  private symbolSpawnTimer = 0
  /** Time accumulator for traffic spawning. */
  private trafficSpawnTimer = 0
  /** Total elapsed game time. */
  private elapsedTime = 0
  /** Current scroll offset for visual lane markers. */
  scrollOffset = 0

  private input: ShipInput = { up: false, down: false, left: false, right: false }

  /** Callback fired when the minigame completes successfully. */
  onComplete: ((missionId: string) => void) | null = null
  /** Callback fired when the step list changes. */
  onStepChange: ((steps: readonly OrbitalMiniGameStep[]) => void) | null = null

  /**
   * Create a new logistics route minigame.
   *
   * @param missionId - shuttle mission id
   * @param targetGas - gather quantity from mission template
   */
  constructor(missionId: string, targetGas: number) {
    this.missionId = missionId
    this.targetGas = targetGas

    const manifestLength = Math.max(MIN_MANIFEST_LENGTH, targetGas)
    const manifest: RouteSymbolType[] = []
    for (let i = 0; i < manifestLength; i++) {
      manifest.push(ROUTE_SYMBOL_TYPES[Math.floor(Math.random() * ROUTE_SYMBOL_TYPES.length)]!)
    }
    this.manifest = manifest

    const excess = Math.max(0, targetGas - MIN_MANIFEST_LENGTH)
    this.scrollSpeed = BASE_SCROLL_SPEED + SCROLL_SPEED_PER_TARGET * excess
    this.maxTraffic = BASE_TRAFFIC_COUNT + Math.floor(excess / 2)
  }

  /** Current minigame status. */
  get status(): OrbitalMiniGameStatus {
    return this._status
  }

  /** Ordered steps for the tracker HUD. */
  get steps(): readonly OrbitalMiniGameStep[] {
    return this._steps
  }

  /** Progress numerator — symbols collected so far. */
  get progressCurrent(): number {
    return this.manifestIndex
  }

  /** Progress denominator — total symbols in the manifest. */
  get progressTotal(): number {
    return this.manifest.length
  }

  /** Set the current WASD input state. Called by the Vue component. */
  setInput(input: ShipInput): void {
    this.input = input
  }

  /** Per-frame update. Advances all systems. */
  tick(dt: number, _ctx: OrbitalMiniGameContext): void {
    if (this._status !== 'active') return

    this.elapsedTime += dt
    this.scrollOffset += this.scrollSpeed * dt
    this.damageFlash = Math.max(0, this.damageFlash - dt)

    this.tickShip(dt)
    this.tickSymbolSpawning(dt)
    this.tickTrafficSpawning(dt)
    this.tickSymbols(dt)
    this.tickTraffic(dt)
    this.checkSymbolCollections()
    this.checkTrafficCollisions()
    this.cleanupSymbols()
    this.cleanupTraffic()
    this.checkEndConditions()
  }

  /** Manual complete is a no-op — completion is automatic via manifest. */
  complete(): void {
    // Completion is driven by manifestIndex reaching manifest.length
  }

  /** Clean up resources. */
  dispose(): void {
    this.symbols.length = 0
    this.traffic.length = 0
  }

  /** Advance ship physics — no gravity, soft horizontal spring. */
  private tickShip(dt: number): void {
    // Vertical acceleration from input
    if (this.input.up) this.shipVy -= SHIP_ACCEL * dt
    if (this.input.down) this.shipVy += SHIP_ACCEL * dt

    // Horizontal acceleration from input
    if (this.input.left) this.shipVx -= SHIP_ACCEL * dt
    if (this.input.right) this.shipVx += SHIP_ACCEL * dt

    // Soft spring toward center when no horizontal input
    if (!this.input.left && !this.input.right) {
      const springAccel = SPRING_STRENGTH * (this.centerX - this.shipX)
      this.shipVx += springAccel * dt
    }

    // Drag
    const dragPerFrame = Math.pow(SHIP_DRAG, dt * 60)
    this.shipVx *= dragPerFrame
    this.shipVy *= dragPerFrame

    // Clamp speeds independently
    this.shipVx = Math.max(-SHIP_MAX_SPEED_X, Math.min(SHIP_MAX_SPEED_X, this.shipVx))
    this.shipVy = Math.max(-SHIP_MAX_SPEED_Y, Math.min(SHIP_MAX_SPEED_Y, this.shipVy))

    // Apply velocity
    this.shipX += this.shipVx * dt
    this.shipY += this.shipVy * dt

    // Clamp position
    this.shipX = Math.max(EDGE_PADDING, Math.min(CANVAS_WIDTH - EDGE_PADDING, this.shipX))
    this.shipY = Math.max(EDGE_PADDING, Math.min(CANVAS_HEIGHT - EDGE_PADDING, this.shipY))
  }

  /** Spawn route symbols above the screen. */
  private tickSymbolSpawning(dt: number): void {
    this.symbolSpawnTimer += dt
    if (this.symbolSpawnTimer >= SYMBOL_SPAWN_INTERVAL) {
      this.symbolSpawnTimer -= SYMBOL_SPAWN_INTERVAL
      this.spawnSymbol()
    }
  }

  /** Spawn a single route symbol. */
  private spawnSymbol(): void {
    const lane = Math.floor(Math.random() * LANE_COUNT)
    const type = ROUTE_SYMBOL_TYPES[Math.floor(Math.random() * ROUTE_SYMBOL_TYPES.length)]!
    this.symbols.push({
      x: laneX(lane),
      y: -30,
      type,
      lane,
      collected: false,
    })
  }

  /** Spawn traffic shuttles above the screen. */
  private tickTrafficSpawning(dt: number): void {
    this.trafficSpawnTimer += dt
    if (this.trafficSpawnTimer >= TRAFFIC_SPAWN_INTERVAL && this.traffic.length < this.maxTraffic) {
      this.trafficSpawnTimer -= TRAFFIC_SPAWN_INTERVAL

      // Enforce minimum gap from any existing traffic
      const lane = Math.floor(Math.random() * LANE_COUNT)
      const spawnY = -30
      const tooClose = this.traffic.some(
        (t) => t.lane === lane && Math.abs(t.y - spawnY) < MIN_TRAFFIC_GAP,
      )
      if (!tooClose) {
        this.spawnTraffic(lane)
      }
    }
  }

  /** Spawn a single traffic shuttle. */
  private spawnTraffic(lane: number): void {
    const jitter = (Math.random() - 0.5) * 2 * TRAFFIC_LANE_JITTER
    const speedFactor = TRAFFIC_SPEED_MIN_FACTOR + Math.random() * TRAFFIC_SPEED_RANDOM_RANGE
    this.traffic.push({
      x: laneX(lane) + jitter,
      y: -30,
      speed: this.scrollSpeed * speedFactor,
      size: 0.6 + Math.random() * 0.4,
      lane,
      alpha: 0.3 + Math.random() * 0.3,
    })
  }

  /** Move symbols down. */
  private tickSymbols(dt: number): void {
    for (const sym of this.symbols) {
      sym.y += this.scrollSpeed * dt
    }
  }

  /** Move traffic down. */
  private tickTraffic(dt: number): void {
    for (const tr of this.traffic) {
      tr.y += tr.speed * dt
    }
  }

  /** Check if ship is close enough to collect a symbol. */
  private checkSymbolCollections(): void {
    if (this.manifestIndex >= this.manifest.length) return
    const targetType = this.manifest[this.manifestIndex]!

    for (const sym of this.symbols) {
      if (sym.collected) continue
      const dx = this.shipX - sym.x
      const dy = this.shipY - sym.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist <= SYMBOL_COLLECT_RADIUS + SHIP_HALF_SIZE) {
        if (sym.type === targetType) {
          sym.collected = true
          this.manifestIndex++
          this.onStepChange?.(this._steps)
        }
        // Wrong symbol: no penalty, just ignore
      }
    }
  }

  /** Check ship-traffic collisions. */
  private checkTrafficCollisions(): void {
    if (this.damageFlash > 0) return // grace period active

    for (const tr of this.traffic) {
      const dx = this.shipX - tr.x
      const dy = this.shipY - tr.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist <= TRAFFIC_RADIUS + SHIP_HALF_SIZE) {
        this.hullHp -= TRAFFIC_DAMAGE
        this.damageFlash = DAMAGE_GRACE_PERIOD

        // Knockback impulse away from traffic
        const len = dist || 1
        this.shipVx += (dx / len) * KNOCKBACK_SPEED
        this.shipVy += (dy / len) * KNOCKBACK_SPEED
        break // only one hit per frame
      }
    }
  }

  /** Remove symbols that scrolled off screen or were collected. */
  private cleanupSymbols(): void {
    this.symbols = this.symbols.filter(
      (s) => !s.collected && s.y < CANVAS_HEIGHT + 40,
    )
  }

  /** Remove traffic that scrolled off screen. */
  private cleanupTraffic(): void {
    this.traffic = this.traffic.filter((t) => t.y < CANVAS_HEIGHT + 60)
  }

  /** Check for mission completion or failure. */
  private checkEndConditions(): void {
    if (this.manifestIndex >= this.manifest.length) {
      this._status = 'completed'
      this._steps[0]!.complete = true
      this._steps[0]!.active = false
      this._steps[1]!.complete = true
      this._steps[1]!.active = false
      this.onStepChange?.(this._steps)
      this.onComplete?.(this.missionId)
      return
    }

    if (this.hullHp <= 0) {
      this.hullHp = 0
      this._status = 'failed'
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/minigame/logistics/__tests__/LogisticsRouteMiniGame.spec.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/minigame/logistics/LogisticsRouteMiniGame.ts src/lib/minigame/logistics/__tests__/LogisticsRouteMiniGame.spec.ts
git commit -m "feat(logistics): core game logic — init, ship movement, tick skeleton"
```

---

### Task 4: Symbol Collection & Traffic Collision Tests

**Files:**
- Modify: `src/lib/minigame/logistics/__tests__/LogisticsRouteMiniGame.spec.ts`

- [ ] **Step 1: Add tests for symbol collection, traffic collisions, and end conditions**

Append these describe blocks to the existing test file, inside the top-level `describe('LogisticsRouteMiniGame')`:

```ts
  describe('symbol collection', () => {
    it('collecting the correct manifest symbol advances manifestIndex', () => {
      const targetType = game.manifest[0]!
      // Place a symbol of the correct type at the ship position
      game.symbols.push({
        x: game.shipX,
        y: game.shipY,
        type: targetType,
        lane: 0,
        collected: false,
      })
      game.tick(0.016, STUB_CTX)
      expect(game.manifestIndex).toBe(1)
    })

    it('collecting the wrong symbol does not advance manifestIndex', () => {
      const targetType = game.manifest[0]!
      const wrongTypes = ['star', 'diamond', 'circle', 'triangle', 'square'].filter(
        (t) => t !== targetType,
      )
      game.symbols.push({
        x: game.shipX,
        y: game.shipY,
        type: wrongTypes[0]! as RouteSymbolType,
        lane: 0,
        collected: false,
      })
      game.tick(0.016, STUB_CTX)
      expect(game.manifestIndex).toBe(0)
    })

    it('symbol out of range is not collected', () => {
      const targetType = game.manifest[0]!
      game.symbols.push({
        x: game.shipX + 200,
        y: game.shipY,
        type: targetType,
        lane: 0,
        collected: false,
      })
      game.tick(0.016, STUB_CTX)
      expect(game.manifestIndex).toBe(0)
    })
  })

  describe('traffic collisions', () => {
    it('collision reduces hull HP by TRAFFIC_DAMAGE', () => {
      game.traffic.push({
        x: game.shipX,
        y: game.shipY,
        speed: 100,
        size: 0.8,
        lane: 0,
        alpha: 0.5,
      })
      game.tick(0.016, STUB_CTX)
      expect(game.hullHp).toBe(HULL_MAX_HP - TRAFFIC_DAMAGE)
    })

    it('grace period prevents double-hit', () => {
      game.traffic.push({
        x: game.shipX,
        y: game.shipY,
        speed: 0,
        size: 0.8,
        lane: 0,
        alpha: 0.5,
      })
      game.tick(0.016, STUB_CTX)
      expect(game.hullHp).toBe(HULL_MAX_HP - TRAFFIC_DAMAGE)
      // Second tick — grace period active, no additional damage
      game.tick(0.016, STUB_CTX)
      expect(game.hullHp).toBe(HULL_MAX_HP - TRAFFIC_DAMAGE)
    })

    it('collision applies knockback', () => {
      const vxBefore = game.shipVx
      game.traffic.push({
        x: game.shipX + 5,
        y: game.shipY,
        speed: 0,
        size: 0.8,
        lane: 0,
        alpha: 0.5,
      })
      game.tick(0.016, STUB_CTX)
      // Ship should be pushed away (negative x direction since traffic is to the right)
      expect(game.shipVx).not.toBe(vxBefore)
    })
  })

  describe('end conditions', () => {
    it('completes when all manifest symbols are collected', () => {
      const cb = vi.fn()
      game.onComplete = cb

      // Collect all manifest symbols one by one
      for (let i = 0; i < game.manifest.length; i++) {
        game.symbols.push({
          x: game.shipX,
          y: game.shipY,
          type: game.manifest[i]!,
          lane: 0,
          collected: false,
        })
        game.tick(0.016, STUB_CTX)
      }

      expect(game.status).toBe('completed')
      expect(cb).toHaveBeenCalledWith('test-mission')
    })

    it('fails when hull HP reaches 0', () => {
      // Drain hull with repeated collisions
      const hits = Math.ceil(HULL_MAX_HP / TRAFFIC_DAMAGE)
      for (let i = 0; i < hits; i++) {
        game.damageFlash = 0 // reset grace period
        game.traffic.push({
          x: game.shipX,
          y: game.shipY,
          speed: 0,
          size: 0.8,
          lane: 0,
          alpha: 0.5,
        })
        game.tick(0.016, STUB_CTX)
      }

      expect(game.hullHp).toBe(0)
      expect(game.status).toBe('failed')
    })
  })

  describe('difficulty scaling', () => {
    it('scroll speed scales with targetGas above 4', () => {
      const game4 = new LogisticsRouteMiniGame('t', 4)
      const game8 = new LogisticsRouteMiniGame('t', 8)
      expect(game8.scrollSpeed).toBeGreaterThan(game4.scrollSpeed)
    })

    it('max traffic scales with targetGas above 4', () => {
      const game4 = new LogisticsRouteMiniGame('t', 4)
      const game8 = new LogisticsRouteMiniGame('t', 8)
      expect(game8.maxTraffic).toBeGreaterThan(game4.maxTraffic)
    })

    it('targetGas <= 4 uses base scroll speed', () => {
      const game2 = new LogisticsRouteMiniGame('t', 2)
      const game4 = new LogisticsRouteMiniGame('t', 4)
      expect(game2.scrollSpeed).toBe(BASE_SCROLL_SPEED)
      expect(game4.scrollSpeed).toBe(BASE_SCROLL_SPEED)
    })
  })

  describe('tick guards', () => {
    it('tick is no-op after completed', () => {
      for (let i = 0; i < game.manifest.length; i++) {
        game.symbols.push({
          x: game.shipX,
          y: game.shipY,
          type: game.manifest[i]!,
          lane: 0,
          collected: false,
        })
        game.tick(0.016, STUB_CTX)
      }
      expect(game.status).toBe('completed')

      const idx = game.manifestIndex
      game.tick(1.0, STUB_CTX)
      expect(game.manifestIndex).toBe(idx)
    })

    it('tick is no-op after failed', () => {
      game.hullHp = 1
      game.traffic.push({
        x: game.shipX,
        y: game.shipY,
        speed: 0,
        size: 0.8,
        lane: 0,
        alpha: 0.5,
      })
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
    it('clears symbols and traffic', () => {
      game.symbols.push({ x: 100, y: 100, type: 'star', lane: 0, collected: false })
      game.traffic.push({ x: 200, y: 200, speed: 100, size: 0.8, lane: 1, alpha: 0.5 })
      game.dispose()
      expect(game.symbols).toHaveLength(0)
      expect(game.traffic).toHaveLength(0)
    })
  })
```

Note: add this import at the top of the test file:

```ts
import { vi } from 'vitest'
import type { RouteSymbolType } from '../types'
import {
  HULL_MAX_HP,
  TRAFFIC_DAMAGE,
  BASE_SCROLL_SPEED,
} from '../constants'
```

- [ ] **Step 2: Run tests**

Run: `bun test:unit src/lib/minigame/logistics/__tests__/LogisticsRouteMiniGame.spec.ts`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/minigame/logistics/__tests__/LogisticsRouteMiniGame.spec.ts
git commit -m "test(logistics): add symbol collection, traffic collision, and end condition tests"
```

---

### Task 5: Factory & Overlay Integration

**Files:**
- Modify: `src/lib/minigame/orbitalMiniGameFactory.ts`
- Modify: `src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts`
- Modify: `src/components/MissionMiniGameOverlay.vue`

- [ ] **Step 1: Update factory to dispatch logistics type**

In `src/lib/minigame/orbitalMiniGameFactory.ts`, add the import at the top:

```ts
import { LogisticsRouteMiniGame } from './logistics/LogisticsRouteMiniGame'
```

Replace the switch case for `'logistics'`:

```ts
    case 'logistics':
      return new LogisticsRouteMiniGame(missionId, targetGas)
```

Remove `'logistics'` from the default fallthrough — it should now be its own case before `'probe-deploy'`.

- [ ] **Step 2: Update factory test**

In `src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts`:

Add import:
```ts
import { LogisticsRouteMiniGame } from '../logistics/LogisticsRouteMiniGame'
```

Remove `'logistics'` from the `DEFAULT_TYPES` array.

Add a new test:
```ts
  it('returns LogisticsRouteMiniGame for type "logistics"', () => {
    const mg = createOrbitalMiniGame('mission-1', 'logistics', 4)
    expect(mg).toBeInstanceOf(LogisticsRouteMiniGame)
    expect(mg.missionId).toBe('mission-1')
    expect(mg.progressTotal).toBe(4)
  })
```

- [ ] **Step 3: Run factory tests**

Run: `bun test:unit src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts`
Expected: ALL PASS

- [ ] **Step 4: Update MissionMiniGameOverlay.vue**

In `src/components/MissionMiniGameOverlay.vue`:

Add imports in `<script setup>`:
```ts
import { LogisticsRouteMiniGame } from '@/lib/minigame/logistics/LogisticsRouteMiniGame'
import LogisticsRouteCanvas from '@/components/LogisticsRouteCanvas.vue'
```

Add computed properties after the maintenance ones:
```ts
const isLogistics = computed(
  () => props.minigame instanceof LogisticsRouteMiniGame,
)

const logisticsMinigame = computed(
  () => (props.minigame instanceof LogisticsRouteMiniGame ? props.minigame : null),
)
```

Add template block before the default `v-else` block:
```html
  <!-- Logistics Route: fullscreen canvas -->
  <div v-else-if="isLogistics && logisticsMinigame" class="mission-minigame-overlay">
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
        <LogisticsRouteCanvas
          :minigame="logisticsMinigame"
          @complete="emit('complete')"
          @fail="() => {}"
        />
      </div>
    </div>
  </div>
```

- [ ] **Step 5: Run type-check**

Run: `bun run type-check`
Expected: May show error about missing `LogisticsRouteCanvas.vue` — that's expected, we create it in Task 6.

- [ ] **Step 6: Commit**

```bash
git add src/lib/minigame/orbitalMiniGameFactory.ts src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts src/components/MissionMiniGameOverlay.vue
git commit -m "feat(logistics): wire factory dispatch and overlay integration"
```

---

### Task 6: Canvas Renderer

**Files:**
- Create: `src/components/LogisticsRouteCanvas.vue`

This is the largest task. The canvas renderer draws the Earth backdrop, starfield, scrolling lanes, route symbols, traffic shuttles, player ship, and HUD. It follows the exact pattern from `IceHarvestCanvas.vue` and visual language from `docs/inspo/earth-logistics-canvas.html`.

- [ ] **Step 1: Create LogisticsRouteCanvas.vue**

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { LogisticsRouteMiniGame } from '@/lib/minigame/logistics/LogisticsRouteMiniGame'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  LANE_COUNT,
  LANE_START_X,
  LANE_SPACING,
  SHIP_HALF_SIZE,
  HULL_MAX_HP,
  SYMBOL_COLLECT_RADIUS,
} from '@/lib/minigame/logistics/constants'
import type { OrbitalMiniGameContext } from '@/lib/minigame/OrbitalMiniGame'
import type { RouteSymbolType } from '@/lib/minigame/logistics/types'

const props = defineProps<{
  minigame: LogisticsRouteMiniGame
}>()

const emit = defineEmits<{
  complete: []
  fail: []
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const started = ref(false)
const briefingVisible = ref(false)
let animId = 0
let lastTime = 0
let simTime = 0

const STUB_CTX: OrbitalMiniGameContext = {
  shipPosition: { x: 0, y: 0, z: 0 },
  orbitState: 'orbiting',
  orbitedPlanetId: 'earth',
  distanceToPlanet: null,
}

const keys: Record<string, boolean> = {}

function onKeyDown(e: KeyboardEvent) {
  keys[e.key.toLowerCase()] = true
}

function onKeyUp(e: KeyboardEvent) {
  keys[e.key.toLowerCase()] = false
}

function updateInput() {
  props.minigame.setInput({
    up: !!keys['w'] || !!keys['arrowup'],
    down: !!keys['s'] || !!keys['arrowdown'],
    left: !!keys['a'] || !!keys['arrowleft'],
    right: !!keys['d'] || !!keys['arrowright'],
  })
}

// ─── Earth scene constants (from inspo) ──────────────────────────────────────

const EARTH_X = CANVAS_WIDTH + 80
const EARTH_Y = CANVAS_HEIGHT * 0.5
const EARTH_R = 320

// ─── Pre-generated scene elements ─────────────────────────────────────────────

const stars: { x: number; y: number; r: number; bright: number; twinkleSpeed: number; twinkleOffset: number }[] = []
for (let i = 0; i < 180; i++) {
  stars.push({
    x: Math.random() * CANVAS_WIDTH,
    y: Math.random() * CANVAS_HEIGHT,
    r: Math.random() * 1.0 + 0.2,
    bright: Math.random() * 0.4 + 0.15,
    twinkleSpeed: Math.random() * 2 + 0.5,
    twinkleOffset: Math.random() * Math.PI * 2,
  })
}

const scrollParticles: { x: number; y: number; size: number; speed: number; alpha: number }[] = []
for (let i = 0; i < 40; i++) {
  scrollParticles.push({
    x: Math.random() * CANVAS_WIDTH * 0.8,
    y: Math.random() * CANVAS_HEIGHT,
    size: 0.5 + Math.random() * 1.5,
    speed: 30 + Math.random() * 60,
    alpha: 0.04 + Math.random() * 0.06,
  })
}

const stations: { x: number; y: number; size: number; speed: number; alpha: number }[] = [
  { x: CANVAS_WIDTH * 0.15, y: CANVAS_HEIGHT * 0.15, size: 12, speed: 8, alpha: 0.08 },
  { x: CANVAS_WIDTH * 0.65, y: CANVAS_HEIGHT * 0.35, size: 8, speed: 5, alpha: 0.05 },
  { x: CANVAS_WIDTH * 0.4, y: CANVAS_HEIGHT * 0.8, size: 15, speed: 12, alpha: 0.06 },
]

const continents = [
  { x: EARTH_X - 180, y: EARTH_Y - 80, rx: 60, ry: 45 },
  { x: EARTH_X - 220, y: EARTH_Y + 40, rx: 40, ry: 30 },
  { x: EARTH_X - 140, y: EARTH_Y + 100, rx: 35, ry: 50 },
  { x: EARTH_X - 100, y: EARTH_Y - 140, rx: 50, ry: 25 },
  { x: EARTH_X - 250, y: EARTH_Y - 20, rx: 30, ry: 40 },
]

// ─── Drawing functions ───────────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, 0)
  bg.addColorStop(0, '#060810')
  bg.addColorStop(0.6, '#080a14')
  bg.addColorStop(0.8, '#0c1020')
  bg.addColorStop(1, '#101828')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

function drawStars(ctx: CanvasRenderingContext2D) {
  for (const s of stars) {
    const dx = s.x - EARTH_X
    const dy = s.y - EARTH_Y
    if (dx * dx + dy * dy < (EARTH_R + 10) * (EARTH_R + 10)) continue
    const twinkle = Math.sin(simTime * s.twinkleSpeed + s.twinkleOffset) * 0.3 + 0.7
    const alpha = s.bright * twinkle
    if (alpha < 0.02) continue
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(210,215,235,${alpha})`
    ctx.fill()
  }
}

function drawEarth(ctx: CanvasRenderingContext2D) {
  ctx.save()

  // Atmosphere glow
  const atmoGlow = ctx.createRadialGradient(EARTH_X, EARTH_Y, EARTH_R - 20, EARTH_X, EARTH_Y, EARTH_R + 60)
  atmoGlow.addColorStop(0, 'rgba(60,140,220,0)')
  atmoGlow.addColorStop(0.5, 'rgba(60,140,220,0.06)')
  atmoGlow.addColorStop(0.7, 'rgba(80,160,240,0.03)')
  atmoGlow.addColorStop(1, 'rgba(60,120,200,0)')
  ctx.fillStyle = atmoGlow
  ctx.beginPath()
  ctx.arc(EARTH_X, EARTH_Y, EARTH_R + 60, 0, Math.PI * 2)
  ctx.fill()

  // Planet body
  ctx.beginPath()
  ctx.arc(EARTH_X, EARTH_Y, EARTH_R, 0, Math.PI * 2)
  ctx.clip()

  // Ocean
  const pg = ctx.createRadialGradient(
    EARTH_X - EARTH_R * 0.3, EARTH_Y - EARTH_R * 0.2, EARTH_R * 0.1,
    EARTH_X, EARTH_Y, EARTH_R,
  )
  pg.addColorStop(0, '#4a90d0')
  pg.addColorStop(0.3, '#3a78b8')
  pg.addColorStop(0.5, '#2a60a0')
  pg.addColorStop(0.7, '#1e4a88')
  pg.addColorStop(1, '#103060')
  ctx.fillStyle = pg
  ctx.fillRect(EARTH_X - EARTH_R, EARTH_Y - EARTH_R, EARTH_R * 2, EARTH_R * 2)

  // Continents
  for (const c of continents) {
    ctx.beginPath()
    ctx.ellipse(c.x, c.y, c.rx, c.ry, 0.3, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(50,95,45,0.4)'
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(c.x + 5, c.y + 3, c.rx * 0.5, c.ry * 0.4, 0.2, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(120,100,60,0.15)'
    ctx.fill()
  }

  // Cloud swirls
  for (let i = 0; i < 6; i++) {
    const cx = EARTH_X - 280 + i * 55 + Math.sin(simTime * 0.1 + i) * 10
    const cy = EARTH_Y - 120 + i * 50 + Math.cos(simTime * 0.08 + i * 2) * 8
    ctx.beginPath()
    ctx.ellipse(cx, cy, 40 + i * 5, 12 + i * 2, 0.3 + i * 0.1, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(220,230,240,0.08)'
    ctx.fill()
  }

  // Limb darkening
  const limb = ctx.createRadialGradient(
    EARTH_X - EARTH_R * 0.25, EARTH_Y - EARTH_R * 0.15, EARTH_R * 0.3,
    EARTH_X, EARTH_Y, EARTH_R,
  )
  limb.addColorStop(0, 'rgba(0,0,0,0)')
  limb.addColorStop(0.6, 'rgba(0,0,0,0.1)')
  limb.addColorStop(0.85, 'rgba(0,0,0,0.35)')
  limb.addColorStop(1, 'rgba(0,0,0,0.6)')
  ctx.fillStyle = limb
  ctx.fillRect(EARTH_X - EARTH_R, EARTH_Y - EARTH_R, EARTH_R * 2, EARTH_R * 2)

  // City lights
  for (let i = 0; i < 15; i++) {
    const lx = EARTH_X - 80 - Math.random() * 200
    const ly = EARTH_Y - 150 + Math.random() * 300
    const ddx = lx - EARTH_X
    const ddy = ly - EARTH_Y
    if (ddx * ddx + ddy * ddy > EARTH_R * EARTH_R) continue
    const darkSide = (lx - EARTH_X + EARTH_R * 0.3) / EARTH_R
    if (darkSide < 0.3) continue
    ctx.beginPath()
    ctx.arc(lx, ly, 1 + Math.random() * 2, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,220,140,${0.05 + Math.random() * 0.08})`
    ctx.fill()
  }

  ctx.restore()

  // Atmosphere line
  ctx.save()
  ctx.beginPath()
  ctx.arc(EARTH_X, EARTH_Y, EARTH_R + 2, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(80,160,255,0.08)'
  ctx.lineWidth = 4
  ctx.stroke()
  ctx.restore()
}

function drawLaneMarkers(ctx: CanvasRenderingContext2D) {
  ctx.save()
  const dashOffset = -(props.minigame.scrollOffset % 32)

  ctx.setLineDash([12, 20])
  ctx.lineDashOffset = dashOffset

  for (let i = 0; i <= LANE_COUNT; i++) {
    const x = LANE_START_X + LANE_SPACING * (i + 0.5)
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, CANVAS_HEIGHT)
    ctx.strokeStyle = 'rgba(60,100,140,0.08)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // Outer boundaries
  ctx.setLineDash([20, 10])
  ctx.lineDashOffset = dashOffset
  const leftBound = LANE_START_X + LANE_SPACING * 0.5
  const rightBound = LANE_START_X + LANE_SPACING * (LANE_COUNT + 0.5)

  for (const bx of [leftBound, rightBound]) {
    ctx.beginPath()
    ctx.moveTo(bx, 0)
    ctx.lineTo(bx, CANVAS_HEIGHT)
    ctx.strokeStyle = 'rgba(60,120,160,0.12)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  ctx.setLineDash([])
  ctx.restore()
}

function drawScrollParticles(ctx: CanvasRenderingContext2D, dt: number) {
  for (const p of scrollParticles) {
    p.y += p.speed * dt
    if (p.y > CANVAS_HEIGHT + 10) {
      p.y = -5
      p.x = Math.random() * CANVAS_WIDTH * 0.8
    }
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(120,150,180,${p.alpha})`
    ctx.fill()
  }
}

function drawDistantStations(ctx: CanvasRenderingContext2D) {
  for (const st of stations) {
    const sy = ((st.y + props.minigame.scrollOffset * st.speed * 0.001) % (CANVAS_HEIGHT + 40)) - 20
    ctx.save()
    ctx.translate(st.x, sy)
    ctx.fillStyle = `rgba(100,120,150,${st.alpha})`
    ctx.fillRect(-st.size, -1.5, st.size * 2, 3)
    ctx.fillRect(-1.5, -st.size, 3, st.size * 2)
    ctx.fillRect(-st.size - 3, -3, 4, 6)
    ctx.fillRect(st.size - 1, -3, 4, 6)
    ctx.restore()
  }
}

function drawSymbolShape(ctx: CanvasRenderingContext2D, type: RouteSymbolType, size: number) {
  switch (type) {
    case 'star': {
      ctx.beginPath()
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2 / 5) - Math.PI / 2
        const aInner = a + Math.PI / 5
        const ox = Math.cos(a) * size
        const oy = Math.sin(a) * size
        const ix = Math.cos(aInner) * size * 0.4
        const iy = Math.sin(aInner) * size * 0.4
        if (i === 0) ctx.moveTo(ox, oy)
        else ctx.lineTo(ox, oy)
        ctx.lineTo(ix, iy)
      }
      ctx.closePath()
      break
    }
    case 'diamond': {
      ctx.beginPath()
      ctx.moveTo(0, -size)
      ctx.lineTo(size * 0.7, 0)
      ctx.lineTo(0, size)
      ctx.lineTo(-size * 0.7, 0)
      ctx.closePath()
      break
    }
    case 'circle': {
      ctx.beginPath()
      ctx.arc(0, 0, size * 0.8, 0, Math.PI * 2)
      break
    }
    case 'triangle': {
      ctx.beginPath()
      ctx.moveTo(0, -size)
      ctx.lineTo(size * 0.85, size * 0.7)
      ctx.lineTo(-size * 0.85, size * 0.7)
      ctx.closePath()
      break
    }
    case 'square': {
      const s = size * 0.75
      ctx.beginPath()
      ctx.rect(-s, -s, s * 2, s * 2)
      break
    }
  }
}

function drawRouteSymbols(ctx: CanvasRenderingContext2D) {
  const mg = props.minigame
  const targetType = mg.manifestIndex < mg.manifest.length ? mg.manifest[mg.manifestIndex] : null

  for (const sym of mg.symbols) {
    if (sym.collected) continue

    const isTarget = sym.type === targetType
    const pulse = Math.sin(simTime * 3) * 0.15 + 0.85
    const alpha = isTarget ? 0.9 : 0.4
    const size = (isTarget ? 14 : 11) * pulse

    ctx.save()
    ctx.translate(sym.x, sym.y)

    // Glow
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2)
    const glowColor = isTarget ? '80,220,200' : '80,140,160'
    glow.addColorStop(0, `rgba(${glowColor},${alpha * 0.3})`)
    glow.addColorStop(1, `rgba(${glowColor},0)`)
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(0, 0, size * 2, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = `rgba(${glowColor},${alpha})`
    ctx.fillStyle = `rgba(${glowColor},${alpha * 0.2})`
    ctx.lineWidth = 1.5

    drawSymbolShape(ctx, sym.type, size)
    ctx.fill()
    ctx.stroke()

    ctx.restore()
  }
}

function drawTraffic(ctx: CanvasRenderingContext2D) {
  for (const tr of props.minigame.traffic) {
    const s = 8 + tr.size * 6
    ctx.save()
    ctx.translate(tr.x, tr.y)

    // Shuttle body pointing down
    ctx.fillStyle = `rgba(140,150,165,${tr.alpha})`
    ctx.beginPath()
    ctx.moveTo(0, -s)
    ctx.lineTo(s * 0.6, s * 0.3)
    ctx.lineTo(s * 0.3, s * 0.5)
    ctx.lineTo(s * 0.15, s)
    ctx.lineTo(-s * 0.15, s)
    ctx.lineTo(-s * 0.3, s * 0.5)
    ctx.lineTo(-s * 0.6, s * 0.3)
    ctx.closePath()
    ctx.fill()

    // Engine glow
    ctx.beginPath()
    ctx.arc(0, s + 2, s * 0.25, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(100,180,255,${tr.alpha * 0.5})`
    ctx.fill()

    // Running lights
    ctx.beginPath()
    ctx.arc(-s * 0.5, s * 0.3, 1, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,60,60,${tr.alpha * 0.6})`
    ctx.fill()
    ctx.beginPath()
    ctx.arc(s * 0.5, s * 0.3, 1, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(60,255,60,${tr.alpha * 0.6})`
    ctx.fill()

    ctx.restore()
  }
}

function drawPlayerShuttle(ctx: CanvasRenderingContext2D) {
  const mg = props.minigame
  const px = mg.shipX
  const py = mg.shipY + Math.sin(simTime * 2) * 2 // bob
  const s = SHIP_HALF_SIZE

  // Damage flash — skip drawing every other frame
  if (mg.damageFlash > 0 && Math.floor(simTime * 20) % 2 === 0) return

  ctx.save()
  ctx.translate(px, py)

  // Engine glow trail
  const trailGrad = ctx.createLinearGradient(0, s + 2, 0, s + 20)
  trailGrad.addColorStop(0, 'rgba(80,180,255,0.4)')
  trailGrad.addColorStop(0.5, 'rgba(60,140,220,0.15)')
  trailGrad.addColorStop(1, 'rgba(40,100,180,0)')
  ctx.fillStyle = trailGrad
  ctx.beginPath()
  ctx.moveTo(-4, s + 2)
  ctx.lineTo(4, s + 2)
  ctx.lineTo(2, s + 18)
  ctx.lineTo(-2, s + 18)
  ctx.closePath()
  ctx.fill()

  // Shuttle body pointing up
  ctx.fillStyle = 'rgba(210,215,225,0.9)'
  ctx.beginPath()
  ctx.moveTo(0, -s)
  ctx.lineTo(s * 0.7, s * 0.4)
  ctx.lineTo(s * 0.35, s * 0.6)
  ctx.lineTo(s * 0.2, s)
  ctx.lineTo(-s * 0.2, s)
  ctx.lineTo(-s * 0.35, s * 0.6)
  ctx.lineTo(-s * 0.7, s * 0.4)
  ctx.closePath()
  ctx.fill()

  // Cockpit
  ctx.beginPath()
  ctx.ellipse(0, -s * 0.3, 3, 5, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(80,180,220,0.5)'
  ctx.fill()

  // Wing accent
  ctx.strokeStyle = 'rgba(60,100,160,0.4)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(-s * 0.6, s * 0.35)
  ctx.lineTo(s * 0.6, s * 0.35)
  ctx.stroke()

  ctx.restore()
}

function drawManifestCard(ctx: CanvasRenderingContext2D) {
  const mg = props.minigame
  const cardX = 15
  const cardY = 15
  const cardW = 90
  const cardH = 55

  ctx.save()
  ctx.fillStyle = 'rgba(10,20,35,0.7)'
  ctx.strokeStyle = 'rgba(60,140,180,0.3)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(cardX, cardY, cardW, cardH, 4)
  ctx.fill()
  ctx.stroke()

  ctx.font = '8px monospace'
  ctx.fillStyle = 'rgba(80,180,200,0.6)'
  ctx.textAlign = 'center'
  ctx.fillText('NEXT PICKUP', cardX + cardW / 2, cardY + 12)

  // Show current target symbol
  if (mg.manifestIndex < mg.manifest.length) {
    const targetType = mg.manifest[mg.manifestIndex]!
    const symX = cardX + cardW / 2
    const symY = cardY + 34
    const pulse = Math.sin(simTime * 3) * 0.15 + 0.85
    const size = 10 * pulse

    ctx.save()
    ctx.translate(symX, symY)

    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2)
    glow.addColorStop(0, 'rgba(80,220,200,0.24)')
    glow.addColorStop(1, 'rgba(80,220,200,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(0, 0, size * 2, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = 'rgba(80,220,200,0.8)'
    ctx.fillStyle = 'rgba(80,220,200,0.16)'
    ctx.lineWidth = 1.5
    drawSymbolShape(ctx, targetType, size)
    ctx.fill()
    ctx.stroke()

    ctx.restore()
  }

  ctx.restore()
}

function drawHUD(ctx: CanvasRenderingContext2D) {
  const mg = props.minigame

  ctx.save()
  ctx.font = '12px monospace'
  ctx.fillStyle = 'rgba(80,200,190,0.7)'
  ctx.textAlign = 'right'
  ctx.fillText(`ROUTE: ${mg.manifestIndex} / ${mg.manifest.length}`, CANVAS_WIDTH * 0.75 - 15, 28)

  // Health bar
  const barX = CANVAS_WIDTH * 0.75 - 130
  const barY = 35
  const barW = 115
  const barH = 6
  const hpFrac = mg.hullHp / mg.hullMaxHp

  ctx.fillStyle = 'rgba(20,40,60,0.5)'
  ctx.fillRect(barX, barY, barW, barH)

  const hpColor = hpFrac > 0.5 ? 'rgba(60,200,140,0.6)' : hpFrac > 0.25 ? 'rgba(200,200,60,0.6)' : 'rgba(200,60,60,0.6)'
  ctx.fillStyle = hpColor
  ctx.fillRect(barX, barY, barW * hpFrac, barH)

  ctx.strokeStyle = 'rgba(60,140,160,0.3)'
  ctx.lineWidth = 0.5
  ctx.strokeRect(barX, barY, barW, barH)

  ctx.restore()
}

function drawVignette(ctx: CanvasRenderingContext2D) {
  const vg = ctx.createRadialGradient(CANVAS_WIDTH * 0.4, CANVAS_HEIGHT * 0.5, CANVAS_WIDTH * 0.2, CANVAS_WIDTH * 0.45, CANVAS_HEIGHT * 0.5, CANVAS_WIDTH * 0.65)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(0.6, 'rgba(0,0,0,0.08)')
  vg.addColorStop(1, 'rgba(0,0,0,0.35)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

function drawEndScreen(ctx: CanvasRenderingContext2D) {
  const mg = props.minigame
  if (mg.status === 'active') return

  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  ctx.font = '24px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (mg.status === 'completed') {
    ctx.fillStyle = 'rgba(80,220,200,0.9)'
    ctx.fillText('ROUTE COMPLETE', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 15)
    ctx.font = '12px monospace'
    ctx.fillStyle = 'rgba(80,200,190,0.6)'
    ctx.fillText(`${mg.manifest.length} / ${mg.manifest.length} symbols delivered`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 15)
  } else {
    ctx.fillStyle = 'rgba(220,80,80,0.9)'
    ctx.fillText('HULL BREACH', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 15)
    ctx.font = '12px monospace'
    ctx.fillStyle = 'rgba(200,120,120,0.6)'
    ctx.fillText('Mission failed — hull integrity lost', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 15)
  }

  ctx.restore()
}

// ─── Game loop ──────────────────────────────────────────────────────────────

function loop(timestamp: number) {
  if (lastTime === 0) lastTime = timestamp
  const rawDt = (timestamp - lastTime) / 1000
  const dt = Math.min(rawDt, 0.05)
  lastTime = timestamp
  simTime += dt

  updateInput()

  const mg = props.minigame
  mg.tick(dt, STUB_CTX)

  const cvs = canvasRef.value
  if (!cvs) { animId = requestAnimationFrame(loop); return }
  const ctx = cvs.getContext('2d')
  if (!ctx) { animId = requestAnimationFrame(loop); return }

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  drawBackground(ctx)
  drawStars(ctx)
  drawEarth(ctx)
  drawDistantStations(ctx)
  drawLaneMarkers(ctx)
  drawScrollParticles(ctx, dt)
  drawRouteSymbols(ctx)
  drawTraffic(ctx)
  drawPlayerShuttle(ctx)
  drawManifestCard(ctx)
  drawHUD(ctx)
  drawVignette(ctx)
  drawEndScreen(ctx)

  // Emit events on state transitions
  if (mg.status === 'completed') {
    emit('complete')
    return
  }
  if (mg.status === 'failed') {
    emit('fail')
    return
  }

  animId = requestAnimationFrame(loop)
}

// ─── Still frame for briefing screen ─────────────────────────────────────────

function drawStillFrame() {
  const cvs = canvasRef.value
  if (!cvs) return
  const ctx = cvs.getContext('2d')
  if (!ctx) return

  drawBackground(ctx)
  drawStars(ctx)
  drawEarth(ctx)
  drawDistantStations(ctx)
  drawLaneMarkers(ctx)
  drawVignette(ctx)
  drawPlayerShuttle(ctx)
}

function startGame() {
  started.value = true
  briefingVisible.value = false
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  lastTime = 0
  animId = requestAnimationFrame(loop)
}

onMounted(() => {
  requestAnimationFrame(() => {
    drawStillFrame()
    setTimeout(() => {
      briefingVisible.value = true
    }, 600)
  })
})

onUnmounted(() => {
  cancelAnimationFrame(animId)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})
</script>

<template>
  <div class="gas-collection-wrapper">
    <canvas
      ref="canvasRef"
      :width="CANVAS_WIDTH"
      :height="CANVAS_HEIGHT"
      class="gas-collection-canvas"
    />

    <Transition name="gas-briefing">
      <div v-if="briefingVisible && !started" class="gas-collection-briefing-overlay">
        <div class="gas-collection-briefing">
          <div class="gas-collection-briefing__icon">📦</div>
          <h3 class="gas-collection-briefing__title">EARTH ORBITAL LOGISTICS</h3>
          <p class="gas-collection-briefing__text">
            Earth's orbital shipping lanes are the busiest in the system. Your
            manifest lists a sequence of route symbols — collect them in order by
            flying through each one.
          </p>
          <p class="gas-collection-briefing__text">
            Dodge the traffic shuttles — they'll dent your hull. Miss a symbol and
            you'll have to wait for another to scroll by. Speed is everything.
          </p>
          <div class="gas-collection-briefing__controls">
            <span><b>W A S D</b> — fly</span>
          </div>
          <p class="gas-collection-briefing__detail">
            Hull: {{ minigame.hullMaxHp }} HP.
            Route: {{ minigame.manifest.length }} symbols.
            Speed: {{ minigame.scrollSpeed }} px/s.
          </p>
          <button
            type="button"
            class="gas-collection-briefing__start"
            @click="startGame"
          >
            BEGIN ROUTE
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
```

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/LogisticsRouteCanvas.vue
git commit -m "feat(logistics): canvas renderer with Earth backdrop, lanes, symbols, traffic, HUD"
```

---

### Task 7: Integration Test & Manual Verification

**Files:** None new — testing existing files together.

- [ ] **Step 1: Run all minigame tests**

Run: `bun test:unit src/lib/minigame/`
Expected: ALL PASS

- [ ] **Step 2: Run full type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Run linter**

Run: `bun lint`
Expected: PASS (or only pre-existing warnings)

- [ ] **Step 4: Start dev server and test in browser**

Run: `bun dev`

Manual test:
1. Navigate to the map view
2. Accept an Earth mission (e.g. from Mars or Saturn targeting Earth)
3. Fly to Earth orbit
4. Open the mission overlay — should show the LogisticsRouteCanvas with briefing screen
5. Click "BEGIN ROUTE" — game starts
6. Verify: lanes scroll, symbols appear, traffic appears, WASD movement works
7. Verify: collecting correct manifest symbol advances the counter
8. Verify: wrong symbols are ignored
9. Verify: traffic collision deals damage and applies knockback
10. Verify: collecting all symbols completes the mission
11. Verify: losing all HP fails the mission

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(logistics): integration fixes from manual testing"
```
