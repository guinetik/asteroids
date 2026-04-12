# Orbital Surfing — Manifold Highway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an orbital surfing mechanic that lets the player attach to a planet's orbit path, dive beneath the spacetime grid along a Tron-styled manifold spline, and emerge at the destination planet in orbit — unlocked via a viroid-origin item after 3 exterminate missions.

**Architecture:** Follows the existing gravity surfing pattern — a pure-TS state machine controller (`OrbitalSurfingController`) in `src/lib/map/`, a Three.js spline renderer (`ManifoldSpline`) in `src/three/`, data-driven item + upgrade in JSON, and integration through `MapViewController`. The C key is shared with gravity surfing; orbit path proximity takes priority over grid rail proximity.

**Tech Stack:** TypeScript, Three.js (CatmullRomCurve3, ShaderMaterial, LineSegments), Vitest, Pinia, Vue 3

---

### Task 1: Data — Upgrade & Item Entries

**Files:**
- Modify: `src/data/upgrades.json:110-119` (add entry after gravitySurfing)
- Modify: `src/data/inventory/items.json:17` (add entry after grid-coupling-module)

- [ ] **Step 1: Add orbitalSurfing upgrade to upgrades.json**

Open `src/data/upgrades.json`. After the `gravitySurfing` entry (ends at line 120), add a new entry:

```json
  {
    "id": "orbitalSurfing",
    "category": "shuttle",
    "label": "Orbital Surfing",
    "description": "A viroid-origin dark lattice coupler lets you phase through the spacetime fabric — revealing ancient manifold highways along orbital paths.",
    "baseCost": 0,
    "maxLevel": 1,
    "valuesByLevel": [0, 1],
    "hiddenFromShop": true,
    "excludeFromMissionDifficulty": true
  },
```

- [ ] **Step 2: Add dark-lattice-coupler item to items.json**

Open `src/data/inventory/items.json`. After the `grid-coupling-module` entry (line 17), add:

```json
  { "id": "dark-lattice-coupler", "category": "consumable", "label": "Dark Lattice Coupler", "description": "Viroid-origin hardware that generates a dark-sector matter shield around the ship, allowing phase transition through the spacetime membrane into the manifold highway network.", "icon": "dark-lattice-coupler.png", "weightPerUnit": 12, "maxStack": 1, "sellable": false },
```

- [ ] **Step 3: Run type-check to verify JSON schema compatibility**

Run: `bun run type-check`
Expected: PASS — JSON data is imported as untyped arrays and cast at the consumption sites.

- [ ] **Step 4: Commit**

```bash
git add src/data/upgrades.json src/data/inventory/items.json
git commit -m "feat(data): add orbitalSurfing upgrade and dark-lattice-coupler item"
```

---

### Task 2: Upgrade System — `hasOrbitalSurfingUnlock()`

**Files:**
- Modify: `src/lib/upgrades.ts:50-63` (add to UpgradeId union), `src/lib/upgrades.ts:97-100` (add unlock constant), `src/lib/upgrades.ts:193-195` (add unlock function)
- Test: `src/lib/__tests__/upgrades.spec.ts`

- [ ] **Step 1: Write the failing test**

Add a new test block to `src/lib/__tests__/upgrades.spec.ts`:

```ts
import { hasOrbitalSurfingUnlock } from '../upgrades'

describe('hasOrbitalSurfingUnlock', () => {
  it('returns false at level 0', () => {
    expect(hasOrbitalSurfingUnlock({ orbitalSurfing: 0 })).toBe(false)
  })

  it('returns true at level 1', () => {
    expect(hasOrbitalSurfingUnlock({ orbitalSurfing: 1 })).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test:unit src/lib/__tests__/upgrades.spec.ts`
Expected: FAIL — `hasOrbitalSurfingUnlock` is not exported.

- [ ] **Step 3: Add `orbitalSurfing` to the UpgradeId union**

In `src/lib/upgrades.ts`, add `'orbitalSurfing'` to the `UpgradeId` union type (after `'gravitySurfing'`):

```ts
  | 'gravitySurfing'
  | 'orbitalSurfing'
```

- [ ] **Step 4: Add the unlock constant and function**

After the `GRAVITY_SURFING_UNLOCK_VALUE` constant (line 100), add:

```ts
/**
 * `orbitalSurfing` value at tier 1 from catalog data — Manifold Highway unlock threshold.
 */
const ORBITAL_SURFING_UNLOCK_VALUE = UPGRADE_DEFINITIONS.orbitalSurfing.valuesByLevel[1]!
```

After `hasGravitySurfingUnlock` (line 195), add:

```ts
/**
 * True when the player has unlocked Orbital Surfing (Manifold Highway).
 *
 * @param levels - Upgrade state to inspect (defaults to current persisted runtime).
 */
export function hasOrbitalSurfingUnlock(levels: UpgradeLevels = CURRENT_PLAYER_UPGRADE_LEVELS): boolean {
  return getUpgradeValue('orbitalSurfing', levels) >= ORBITAL_SURFING_UNLOCK_VALUE
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test:unit src/lib/__tests__/upgrades.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/upgrades.ts src/lib/__tests__/upgrades.spec.ts
git commit -m "feat(upgrades): add hasOrbitalSurfingUnlock gate"
```

---

### Task 3: Configuration Constants

**Files:**
- Modify: `src/lib/map/mapViewControllerConfig.ts`

- [ ] **Step 1: Add orbital surfing constants**

After the gravity surf constants block (after `GRAVITY_SURF_DECOUPLE_WAVE_FORWARD_OFFSET`, line 137), add:

```ts
// ─── Orbital Surfing (Manifold Highway) ────────────────────────────────────

/** World units below the grid plane for the manifold tunnel cruise altitude. */
export const ORBITAL_SURF_TUNNEL_DEPTH = 40

/** Cruise speed multiplier on maxThrustSpeed for spline travel. */
export const ORBITAL_SURF_CRUISE_SPEED_MULTIPLIER = 5

/** Seconds to dive from surface to tunnel depth (entry ramp). */
export const ORBITAL_SURF_RAMP_DURATION_SEC = 1.2

/** Seconds to snap onto the orbit path during coupling. */
export const ORBITAL_SURF_COUPLE_DURATION_SEC = 1.0

/** Max world units from an orbit ellipse point to allow attach. */
export const ORBITAL_SURF_SNAP_DISTANCE = 15

/** Passive fuel drain multiplier while orbital surfing (same as gravity surfing). */
export const ORBITAL_SURF_FUEL_MULTIPLIER = 3

/** Number of sample points along the orbital arc for the manifold spline. */
export const ORBITAL_SURF_SPLINE_SEGMENTS = 64

/** Deep indigo base color for manifold wireframe lines. */
export const ORBITAL_SURF_SPLINE_COLOR = 0x2a1a4e

/** Dim blue-violet edge glow for manifold lines. */
export const ORBITAL_SURF_SPLINE_GLOW_COLOR = 0x4433aa

/** Low opacity — ancient, dormant viroid infrastructure. */
export const ORBITAL_SURF_SPLINE_OPACITY = 0.25

/** Slow flicker speed for the manifold pulse — barely alive. */
export const ORBITAL_SURF_PULSE_SPEED = 0.4
```

- [ ] **Step 2: Add the new constants to the aggregated MAP_VIEW_CONTROLLER_CONFIG**

In the `MAP_VIEW_CONTROLLER_CONFIG` object, add after the gravity surf entries:

```ts
  ORBITAL_SURF_TUNNEL_DEPTH,
  ORBITAL_SURF_CRUISE_SPEED_MULTIPLIER,
  ORBITAL_SURF_RAMP_DURATION_SEC,
  ORBITAL_SURF_COUPLE_DURATION_SEC,
  ORBITAL_SURF_SNAP_DISTANCE,
  ORBITAL_SURF_FUEL_MULTIPLIER,
  ORBITAL_SURF_SPLINE_SEGMENTS,
  ORBITAL_SURF_SPLINE_COLOR,
  ORBITAL_SURF_SPLINE_GLOW_COLOR,
  ORBITAL_SURF_SPLINE_OPACITY,
  ORBITAL_SURF_PULSE_SPEED,
```

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/map/mapViewControllerConfig.ts
git commit -m "feat(config): add orbital surfing manifold highway tuning constants"
```

---

### Task 4: Orbit Path Proximity — Pure Math Helpers

**Files:**
- Create: `src/lib/map/orbitalSurfing.ts`
- Create: `src/lib/map/__tests__/orbitalSurfing.spec.ts`

This module provides pure-math helpers for finding the nearest point on an orbital ellipse and extracting arc segments — no Three.js dependencies.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/map/__tests__/orbitalSurfing.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  findNearestOrbitPoint,
  extractOrbitArc,
} from '../orbitalSurfing'

describe('findNearestOrbitPoint', () => {
  // Simple circular orbit: 8 points on a circle of radius 10
  const circlePoints = Array.from({ length: 8 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 8
    return { x: Math.cos(angle) * 10, z: Math.sin(angle) * 10 }
  })

  it('finds the nearest point index within snap distance', () => {
    // Ship at (10.5, 0) — closest to index 0 at (10, 0)
    const result = findNearestOrbitPoint(10.5, 0, circlePoints, 2)
    expect(result).not.toBeNull()
    expect(result!.index).toBe(0)
    expect(result!.distance).toBeCloseTo(0.5, 1)
  })

  it('returns null when no point is within snap distance', () => {
    const result = findNearestOrbitPoint(50, 50, circlePoints, 2)
    expect(result).toBeNull()
  })
})

describe('extractOrbitArc', () => {
  const points = [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 2, z: 0 },
    { x: 3, z: 0 },
    { x: 4, z: 0 },
  ]

  it('extracts forward arc from start to end', () => {
    const arc = extractOrbitArc(points, 1, 3)
    expect(arc).toEqual([
      { x: 1, z: 0 },
      { x: 2, z: 0 },
      { x: 3, z: 0 },
    ])
  })

  it('wraps around when end < start', () => {
    const arc = extractOrbitArc(points, 3, 1)
    expect(arc).toEqual([
      { x: 3, z: 0 },
      { x: 4, z: 0 },
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    ])
  })

  it('returns full loop when start equals end', () => {
    const arc = extractOrbitArc(points, 2, 2)
    expect(arc.length).toBe(points.length + 1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test:unit src/lib/map/__tests__/orbitalSurfing.spec.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/map/orbitalSurfing.ts`:

```ts
/**
 * Pure-math helpers for orbital surfing path snapping and arc extraction.
 *
 * @author guinetik
 * @date 2026-04-12
 * @spec docs/superpowers/specs/2026-04-12-orbital-surfing-manifold-highway-design.md
 */

/** A 2D point on the XZ plane (Y is up in Three.js world space). */
export interface OrbitPoint2D {
  /** World-space X coordinate. */
  x: number
  /** World-space Z coordinate. */
  z: number
}

/** Result of a successful orbit path proximity check. */
export interface OrbitSnapResult {
  /** Index into the orbit points array for the nearest point. */
  index: number
  /** World-space X of the nearest orbit point. */
  x: number
  /** World-space Z of the nearest orbit point. */
  z: number
  /** Distance from the ship to the nearest orbit point. */
  distance: number
}

/**
 * Finds the nearest point on a sampled orbit ellipse within snap distance.
 *
 * @param shipX - Ship world X position.
 * @param shipZ - Ship world Z position.
 * @param orbitPoints - Sampled orbit ellipse points in world space (XZ plane).
 * @param maxSnapDistance - Maximum world-unit distance to consider a snap.
 * @returns Snap result, or null if no point is within range.
 */
export function findNearestOrbitPoint(
  shipX: number,
  shipZ: number,
  orbitPoints: readonly OrbitPoint2D[],
  maxSnapDistance: number,
): OrbitSnapResult | null {
  let bestIndex = -1
  let bestDistSq = maxSnapDistance * maxSnapDistance
  for (let i = 0; i < orbitPoints.length; i++) {
    const p = orbitPoints[i]!
    const dx = shipX - p.x
    const dz = shipZ - p.z
    const distSq = dx * dx + dz * dz
    if (distSq < bestDistSq) {
      bestDistSq = distSq
      bestIndex = i
    }
  }
  if (bestIndex < 0) return null
  const best = orbitPoints[bestIndex]!
  return {
    index: bestIndex,
    x: best.x,
    z: best.z,
    distance: Math.sqrt(bestDistSq),
  }
}

/**
 * Extracts an arc of orbit points from startIndex to endIndex (inclusive),
 * wrapping around the array if needed.
 *
 * When startIndex === endIndex, returns the full orbit (all points + the start again).
 *
 * @param points - Full orbit sample points.
 * @param startIndex - Index of the first arc point (ship attach point).
 * @param endIndex - Index of the last arc point (planet position).
 * @returns Array of points forming the arc.
 */
export function extractOrbitArc(
  points: readonly OrbitPoint2D[],
  startIndex: number,
  endIndex: number,
): OrbitPoint2D[] {
  const n = points.length
  if (n === 0) return []
  const arc: OrbitPoint2D[] = []
  if (startIndex === endIndex) {
    for (let i = 0; i <= n; i++) {
      arc.push(points[(startIndex + i) % n]!)
    }
    return arc
  }
  let i = startIndex
  while (true) {
    arc.push(points[i % n]!)
    if (i % n === endIndex % n) break
    i++
  }
  return arc
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test:unit src/lib/map/__tests__/orbitalSurfing.spec.ts`
Expected: PASS

- [ ] **Step 5: Run lint**

Run: `bun lint`
Expected: PASS (or only pre-existing warnings)

- [ ] **Step 6: Commit**

```bash
git add src/lib/map/orbitalSurfing.ts src/lib/map/__tests__/orbitalSurfing.spec.ts
git commit -m "feat(orbital-surfing): add orbit path proximity and arc extraction helpers"
```

---

### Task 5: Expose Orbit Points from PlanetSystemController

**Files:**
- Modify: `src/three/controllers/PlanetSystemController.ts`

The `scaledOrbit` field is currently private. The `OrbitalSurfingController` needs access to orbit ellipse points in world space for proximity checks and spline construction.

- [ ] **Step 1: Add a public method to get orbit points in XZ world space**

In `PlanetSystemController`, add after the `getWorldZ()` method:

```ts
  /**
   * Returns the sampled orbit ellipse as XZ world-space points.
   * Used by orbital surfing to check proximity and build manifold splines.
   */
  getOrbitPointsXZ(): { x: number; z: number }[] {
    const rawPoints = orbitPathPoints(this.scaledOrbit, ORBIT_PATH_SEGMENTS)
    return rawPoints.map((p) => ({ x: p.x, z: p.y }))
  }
```

Note: The coordinate swap (`z: p.y`) matches the existing `createOrbitLine` convention where Kepler Y maps to Three.js Z.

- [ ] **Step 2: Verify the import exists**

Check that `orbitPathPoints` is already imported. It is — via `orbitalPosition3D` from `@/lib/planets/orbit`. If `orbitPathPoints` is not imported, add it to the existing import line.

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/three/controllers/PlanetSystemController.ts
git commit -m "feat(planet): expose orbit ellipse XZ points for orbital surfing snap"
```

---

### Task 6: OrbitalSurfingController — State Machine

**Files:**
- Create: `src/lib/map/OrbitalSurfingController.ts`

This is the core state machine. It mirrors `GravitySurfingController`'s pattern: discriminated union state, deps interface, `tick()`, and `requestToggle()`. The controller manages state transitions only — it does not own any Three.js objects (those come in the ManifoldSpline task).

- [ ] **Step 1: Create the controller**

Create `src/lib/map/OrbitalSurfingController.ts`:

```ts
/**
 * State machine for orbital surfing along manifold highways.
 *
 * Manages the free → coupling → diving → emerging → orbit handoff flow.
 * Pure state logic — no Three.js objects owned here; the ManifoldSpline
 * renderer is driven externally by reading this controller's state.
 *
 * @author guinetik
 * @date 2026-04-12
 * @spec docs/superpowers/specs/2026-04-12-orbital-surfing-manifold-highway-design.md
 */
import * as THREE from 'three'
import type { InputManager } from '@/lib/InputManager'
import { MAP_VIEW_CONTROLLER_CONFIG as MAP_CONFIG } from '@/lib/map/mapViewControllerConfig'
import {
  findNearestOrbitPoint,
  extractOrbitArc,
  type OrbitPoint2D,
  type OrbitSnapResult,
} from '@/lib/map/orbitalSurfing'
import type { ShuttleController } from '@/three/ShuttleController'
import { MAP_PHYSICS } from '@/three/ShuttleController'

/** Discriminated union of orbital surfing states. */
type OrbitalSurfState =
  | { mode: 'free' }
  | {
      mode: 'coupling'
      startX: number
      startZ: number
      targetX: number
      targetZ: number
      elapsed: number
      duration: number
      targetPlanetIndex: number
      arcPoints: OrbitPoint2D[]
    }
  | {
      mode: 'diving'
      arcPoints: OrbitPoint2D[]
      /** Parametric progress along the spline 0→1. */
      t: number
      /** Units of t advanced per second. */
      speed: number
      /** Direction multiplier: +1 = forward, -1 = reverse. */
      direction: number
      targetPlanetIndex: number
      /** Current Y depth (transitions from 0 to tunnel depth during ramp). */
      currentY: number
      /** Phase: 'ramp-down' | 'cruise' | 'ramp-up' */
      phase: 'ramp-down' | 'cruise' | 'ramp-up'
      phaseElapsed: number
    }
  | {
      mode: 'emerging'
      targetPlanetIndex: number
      elapsed: number
      duration: number
      /** Y at start of emerge. */
      startY: number
    }

/** Minimum shuttle speed to allow orbital surf attachment. */
const ORBITAL_SURF_MIN_ATTACH_SPEED = 0.15

/** Dependencies injected each tick from MapViewController. */
export interface OrbitalSurfingDeps {
  /** The shuttle controller. */
  shuttleController: ShuttleController | null
  /** Input manager for key bindings. */
  inputManager: InputManager | null
  /** Whether the player has the orbital surfing unlock. */
  hasOrbitalSurfingUnlock: boolean
  /** Current orbit capture state string ('free', 'approaching', 'orbiting'). */
  orbitState: string
  /** Whether gravity surfing is currently active. */
  gravitySurfingActive: boolean
  /** Whether the slingshot burst is active. */
  slingshotBurstActive: boolean
  /**
   * Per-planet orbit ellipse points in XZ world space, indexed by planet index.
   * Each entry corresponds to a planet in the PLANETS array.
   */
  planetOrbitPoints: readonly (readonly OrbitPoint2D[])[]
  /**
   * Per-planet world positions, indexed by planet index.
   */
  planetWorldPositions: readonly { x: number; z: number }[]
}

/** Callback fired when the orbital surf completes and the player should enter orbit. */
export type OrbitalSurfCompleteCallback = (planetIndex: number) => void

function easeInOut01(t: number): number {
  const clamped = Math.max(0, Math.min(1, t))
  return clamped * clamped * (3 - 2 * clamped)
}

/**
 * Orbital surfing controller — state machine for manifold highway travel.
 *
 * @author guinetik
 * @date 2026-04-12
 * @spec docs/superpowers/specs/2026-04-12-orbital-surfing-manifold-highway-design.md
 */
export class OrbitalSurfingController {
  private state: OrbitalSurfState = { mode: 'free' }

  /** Fired when emerging completes — caller should transition to orbiting. */
  onComplete: OrbitalSurfCompleteCallback | null = null

  /** Fired when coupling starts — caller should build/show the manifold spline. */
  onCouplingStart: ((arcPoints: OrbitPoint2D[]) => void) | null = null

  /** Fired when the dive begins (coupling → diving transition). */
  onDiveStart: (() => void) | null = null

  /** Fired when the surf ends (back to free or orbit). */
  onSurfEnd: (() => void) | null = null

  /** Current mode for external queries. */
  get mode(): string {
    return this.state.mode
  }

  /** True when not in free state. */
  isActive(): boolean {
    return this.state.mode !== 'free'
  }

  /** The arc points for the current surf, or null if not active. */
  getArcPoints(): OrbitPoint2D[] | null {
    if (this.state.mode === 'coupling' || this.state.mode === 'diving') {
      return this.state.arcPoints
    }
    return null
  }

  /** Current parametric progress along the spline (0→1), or 0 if not diving. */
  getSplineT(): number {
    return this.state.mode === 'diving' ? this.state.t : 0
  }

  /** Current Y offset of the ship, or 0 if not active. */
  getCurrentY(): number {
    if (this.state.mode === 'diving') return this.state.currentY
    if (this.state.mode === 'emerging') {
      const t = this.state.duration <= 0 ? 1 : this.state.elapsed / this.state.duration
      return THREE.MathUtils.lerp(this.state.startY, 0, easeInOut01(t))
    }
    return 0
  }

  /** Current dive phase, or null. */
  getDivePhase(): 'ramp-down' | 'cruise' | 'ramp-up' | null {
    return this.state.mode === 'diving' ? this.state.phase : null
  }

  reset(deps: OrbitalSurfingDeps): void {
    const shuttle = deps.shuttleController
    this.state = { mode: 'free' }
    if (!shuttle) return
    shuttle.unfreeze()
    shuttle.setInputEnabled(true)
    shuttle.group.rotation.x = 0
    shuttle.group.rotation.z = 0
  }

  requestToggle(deps: OrbitalSurfingDeps): void {
    if (!deps.inputManager?.wasActionPressed('gravitySurfingToggle')) return

    // Cancel during coupling
    if (this.state.mode === 'coupling') {
      this.cancelCoupling(deps)
      return
    }

    // No cancel during diving or emerging — committed
    if (this.state.mode === 'diving' || this.state.mode === 'emerging') return

    // Try to attach
    const snap = this.findSnapTarget(deps)
    if (!snap) return
    this.beginCoupling(snap, deps)
  }

  tick(dt: number, deps: OrbitalSurfingDeps): void {
    const shuttle = deps.shuttleController
    if (!shuttle || this.state.mode === 'free') return

    if (this.state.mode === 'coupling') {
      this.tickCoupling(dt, shuttle)
    }

    if (this.state.mode === 'diving') {
      this.tickDiving(dt, shuttle, deps)
    }

    if (this.state.mode === 'emerging') {
      this.tickEmerging(dt, shuttle)
    }
  }

  private findSnapTarget(
    deps: OrbitalSurfingDeps,
  ): { snapResult: OrbitSnapResult; planetIndex: number; arcPoints: OrbitPoint2D[] } | null {
    if (
      !deps.shuttleController
      || !deps.hasOrbitalSurfingUnlock
      || deps.orbitState !== 'free'
      || deps.gravitySurfingActive
      || deps.slingshotBurstActive
      || deps.shuttleController.speed < ORBITAL_SURF_MIN_ATTACH_SPEED
    ) {
      return null
    }

    const shipX = deps.shuttleController.position.x
    const shipZ = deps.shuttleController.position.z

    let bestSnap: OrbitSnapResult | null = null
    let bestPlanetIndex = -1

    for (let i = 0; i < deps.planetOrbitPoints.length; i++) {
      const points = deps.planetOrbitPoints[i]!
      const snap = findNearestOrbitPoint(shipX, shipZ, points, MAP_CONFIG.ORBITAL_SURF_SNAP_DISTANCE)
      if (snap && (!bestSnap || snap.distance < bestSnap.distance)) {
        bestSnap = snap
        bestPlanetIndex = i
      }
    }

    if (!bestSnap || bestPlanetIndex < 0) return null

    // Find planet's nearest point on its own orbit to determine arc endpoint
    const planetPos = deps.planetWorldPositions[bestPlanetIndex]!
    const orbitPoints = deps.planetOrbitPoints[bestPlanetIndex]!
    const planetSnap = findNearestOrbitPoint(planetPos.x, planetPos.z, orbitPoints, Infinity)
    if (!planetSnap) return null

    const arcPoints = extractOrbitArc(
      orbitPoints as OrbitPoint2D[],
      bestSnap.index,
      planetSnap.index,
    )

    return { snapResult: bestSnap, planetIndex: bestPlanetIndex, arcPoints }
  }

  private beginCoupling(
    target: { snapResult: OrbitSnapResult; planetIndex: number; arcPoints: OrbitPoint2D[] },
    deps: OrbitalSurfingDeps,
  ): void {
    const shuttle = deps.shuttleController
    if (!shuttle) return
    this.state = {
      mode: 'coupling',
      startX: shuttle.position.x,
      startZ: shuttle.position.z,
      targetX: target.snapResult.x,
      targetZ: target.snapResult.z,
      elapsed: 0,
      duration: MAP_CONFIG.ORBITAL_SURF_COUPLE_DURATION_SEC,
      targetPlanetIndex: target.planetIndex,
      arcPoints: target.arcPoints,
    }
    shuttle.freeze()
    shuttle.setInputEnabled(false)
    shuttle.setVelocity(new THREE.Vector3(0, 0, 0))
    this.onCouplingStart?.(target.arcPoints)
  }

  private cancelCoupling(deps: OrbitalSurfingDeps): void {
    const shuttle = deps.shuttleController
    if (!shuttle) return
    this.state = { mode: 'free' }
    shuttle.unfreeze()
    shuttle.setInputEnabled(true)
    shuttle.setVelocity(new THREE.Vector3(0, 0, 0))
    shuttle.group.rotation.x = 0
    shuttle.group.rotation.z = 0
    this.onSurfEnd?.()
  }

  private tickCoupling(dt: number, shuttle: ShuttleController): void {
    if (this.state.mode !== 'coupling') return
    const nextElapsed = Math.min(this.state.duration, this.state.elapsed + dt)
    const t = this.state.duration <= 0 ? 1 : nextElapsed / this.state.duration
    const eased = easeInOut01(t)
    const x = THREE.MathUtils.lerp(this.state.startX, this.state.targetX, eased)
    const z = THREE.MathUtils.lerp(this.state.startZ, this.state.targetZ, eased)
    shuttle.group.position.set(x, 0, z)
    shuttle.setVelocity(new THREE.Vector3(0, 0, 0))
    this.state.elapsed = nextElapsed

    if (nextElapsed >= this.state.duration) {
      // Transition to diving
      const cruiseSpeed = MAP_PHYSICS.maxThrustSpeed * MAP_CONFIG.ORBITAL_SURF_CRUISE_SPEED_MULTIPLIER
      const arcLength = this.estimateArcLength(this.state.arcPoints)
      const tPerSecond = arcLength > 0 ? cruiseSpeed / arcLength : 1
      this.onDiveStart?.()
      this.state = {
        mode: 'diving',
        arcPoints: this.state.arcPoints,
        t: 0,
        speed: tPerSecond,
        direction: 1,
        targetPlanetIndex: this.state.targetPlanetIndex,
        currentY: 0,
        phase: 'ramp-down',
        phaseElapsed: 0,
      }
    }
  }

  private tickDiving(dt: number, shuttle: ShuttleController, deps: OrbitalSurfingDeps): void {
    if (this.state.mode !== 'diving') return

    // Check fuel — empty = game over
    const fuelEmpty = shuttle.thrusterSystem.fuel <= 0
    if (fuelEmpty) {
      // Game over is handled externally by the hull/death system detecting zero fuel.
      // We just keep ticking — the death system will catch it.
    }

    // S key reverses direction
    if (deps.inputManager?.wasActionPressed('brake')) {
      this.state.direction *= -1
    }

    // Tick thruster system for passive fuel drain
    shuttle.thrusterSystem.tick(
      dt * MAP_CONFIG.ORBITAL_SURF_FUEL_MULTIPLIER,
      { thrust: false, brake: false, rcs: false },
      shuttle.getThrusterRuntimeModifiers(),
    )

    // Phase management
    this.state.phaseElapsed += dt
    const rampDuration = MAP_CONFIG.ORBITAL_SURF_RAMP_DURATION_SEC
    const tunnelDepth = -MAP_CONFIG.ORBITAL_SURF_TUNNEL_DEPTH

    if (this.state.phase === 'ramp-down') {
      const rampT = rampDuration <= 0 ? 1 : Math.min(1, this.state.phaseElapsed / rampDuration)
      this.state.currentY = THREE.MathUtils.lerp(0, tunnelDepth, easeInOut01(rampT))
      if (rampT >= 1) {
        this.state.phase = 'cruise'
        this.state.phaseElapsed = 0
      }
    } else if (this.state.phase === 'cruise') {
      this.state.currentY = tunnelDepth
    }

    // Advance along spline
    this.state.t += this.state.speed * this.state.direction * dt

    // Check if we've reached the end
    if (this.state.t >= 0.95 && this.state.direction > 0) {
      this.state.phase = 'ramp-up'
      this.state.phaseElapsed = 0
    }

    if (this.state.phase === 'ramp-up') {
      const rampT = rampDuration <= 0 ? 1 : Math.min(1, this.state.phaseElapsed / rampDuration)
      this.state.currentY = THREE.MathUtils.lerp(tunnelDepth, 0, easeInOut01(rampT))
      this.state.t = Math.min(1, this.state.t)
      if (rampT >= 1) {
        this.beginEmerging(shuttle)
      }
    }

    // Clamp t for reverse direction
    if (this.state.mode === 'diving' && this.state.t < 0) {
      this.state.t = 0
    }

    // Position shuttle from arc
    if (this.state.mode === 'diving') {
      const pos = this.sampleArc(this.state.arcPoints, Math.max(0, Math.min(1, this.state.t)))
      shuttle.group.position.set(pos.x, this.state.currentY, pos.z)
      // Face along the spline tangent
      const tangentT = Math.min(0.99, Math.max(0.01, this.state.t))
      const ahead = this.sampleArc(this.state.arcPoints, tangentT + 0.01)
      const heading = Math.atan2(-(ahead.z - pos.z), ahead.x - pos.x)
      shuttle.group.rotation.y = heading
    }
  }

  private beginEmerging(shuttle: ShuttleController): void {
    if (this.state.mode !== 'diving') return
    this.state = {
      mode: 'emerging',
      targetPlanetIndex: this.state.targetPlanetIndex,
      elapsed: 0,
      duration: MAP_CONFIG.ORBITAL_SURF_RAMP_DURATION_SEC,
      startY: this.state.currentY,
    }
  }

  private tickEmerging(dt: number, shuttle: ShuttleController): void {
    if (this.state.mode !== 'emerging') return
    const nextElapsed = Math.min(this.state.duration, this.state.elapsed + dt)
    const t = this.state.duration <= 0 ? 1 : nextElapsed / this.state.duration
    const y = THREE.MathUtils.lerp(this.state.startY, 0, easeInOut01(t))
    shuttle.group.position.y = y
    this.state.elapsed = nextElapsed

    if (nextElapsed >= this.state.duration) {
      const planetIndex = this.state.targetPlanetIndex
      this.state = { mode: 'free' }
      shuttle.unfreeze()
      shuttle.setInputEnabled(true)
      shuttle.group.rotation.x = 0
      shuttle.group.rotation.z = 0
      this.onSurfEnd?.()
      this.onComplete?.(planetIndex)
    }
  }

  /** Linear interpolation along the arc points array at parametric t (0→1). */
  private sampleArc(points: OrbitPoint2D[], t: number): { x: number; z: number } {
    if (points.length === 0) return { x: 0, z: 0 }
    if (points.length === 1) return { x: points[0]!.x, z: points[0]!.z }
    const maxIndex = points.length - 1
    const floatIndex = t * maxIndex
    const i0 = Math.floor(floatIndex)
    const i1 = Math.min(i0 + 1, maxIndex)
    const frac = floatIndex - i0
    const p0 = points[i0]!
    const p1 = points[i1]!
    return {
      x: p0.x + (p1.x - p0.x) * frac,
      z: p0.z + (p1.z - p0.z) * frac,
    }
  }

  /** Rough arc length estimate by summing segment distances. */
  private estimateArcLength(points: OrbitPoint2D[]): number {
    let len = 0
    for (let i = 1; i < points.length; i++) {
      const dx = points[i]!.x - points[i - 1]!.x
      const dz = points[i]!.z - points[i - 1]!.z
      len += Math.sqrt(dx * dx + dz * dz)
    }
    return len
  }
}
```

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `bun lint`
Expected: PASS (or only pre-existing warnings). Fix any TSDoc warnings on exports.

- [ ] **Step 4: Commit**

```bash
git add src/lib/map/OrbitalSurfingController.ts
git commit -m "feat(orbital-surfing): add OrbitalSurfingController state machine"
```

---

### Task 7: ManifoldSpline — Three.js Renderer

**Files:**
- Create: `src/three/ManifoldSpline.ts`

This creates the visual spline tube beneath the spacetime grid. It builds a `CatmullRomCurve3` from arc points at tunnel depth, renders as `LineSegments` with a custom `ShaderMaterial` for the dormant Tron look.

- [ ] **Step 1: Create the manifold spline renderer**

Create `src/three/ManifoldSpline.ts`:

```ts
/**
 * Manifold highway spline renderer — ancient viroid infrastructure.
 *
 * Builds a CatmullRomCurve3 from orbital arc points at tunnel depth,
 * renders parallel wireframe rails with a dim Tron-style glow shader.
 *
 * @author guinetik
 * @date 2026-04-12
 * @spec docs/superpowers/specs/2026-04-12-orbital-surfing-manifold-highway-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { OrbitPoint2D } from '@/lib/map/orbitalSurfing'
import { MAP_VIEW_CONTROLLER_CONFIG as MAP_CONFIG } from '@/lib/map/mapViewControllerConfig'

/** Number of sample points along the spline for rendering. */
const RENDER_SEGMENTS = 128

/** Lateral offset for the twin rail lines flanking the spline center. */
const RAIL_HALF_WIDTH = 1.5

/**
 * Manifold highway spline visual — dormant Tron wireframe beneath the grid.
 *
 * @author guinetik
 * @date 2026-04-12
 * @spec docs/superpowers/specs/2026-04-12-orbital-surfing-manifold-highway-design.md
 */
export class ManifoldSpline implements Tickable {
  /** Root group added to the scene. */
  readonly group = new THREE.Group()

  private splineCurve: THREE.CatmullRomCurve3 | null = null
  private railMesh: THREE.LineSegments | null = null
  private material: THREE.ShaderMaterial | null = null
  private time = 0

  /**
   * Build and show the manifold spline from orbital arc points.
   *
   * @param arcPoints - XZ world-space orbit arc (from extractOrbitArc).
   * @param tunnelDepth - Negative Y depth below grid plane.
   */
  show(arcPoints: OrbitPoint2D[], tunnelDepth: number): void {
    this.dispose()

    // Build entry ramp → cruise → exit ramp
    const rampLength = 3
    const curvePoints: THREE.Vector3[] = []

    for (let i = 0; i < arcPoints.length; i++) {
      const p = arcPoints[i]!
      let y = tunnelDepth
      if (i < rampLength) {
        const rampT = i / rampLength
        y = THREE.MathUtils.lerp(0, tunnelDepth, rampT)
      } else if (i > arcPoints.length - 1 - rampLength) {
        const rampT = (arcPoints.length - 1 - i) / rampLength
        y = THREE.MathUtils.lerp(0, tunnelDepth, rampT)
      }
      curvePoints.push(new THREE.Vector3(p.x, y, p.z))
    }

    this.splineCurve = new THREE.CatmullRomCurve3(curvePoints, false, 'centripetal', 0.5)

    // Sample the spline into twin rail lines
    const vertices: number[] = []
    const sampledPoints = this.splineCurve.getSpacedPoints(RENDER_SEGMENTS)

    for (let i = 0; i < sampledPoints.length - 1; i++) {
      const p0 = sampledPoints[i]!
      const p1 = sampledPoints[i + 1]!

      // Tangent for lateral offset
      const tangent = new THREE.Vector3().subVectors(p1, p0).normalize()
      const up = new THREE.Vector3(0, 1, 0)
      const lateral = new THREE.Vector3().crossVectors(tangent, up).normalize().multiplyScalar(RAIL_HALF_WIDTH)

      // Center line segment
      vertices.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z)
      // Left rail
      vertices.push(
        p0.x + lateral.x, p0.y, p0.z + lateral.z,
        p1.x + lateral.x, p1.y, p1.z + lateral.z,
      )
      // Right rail
      vertices.push(
        p0.x - lateral.x, p0.y, p0.z - lateral.z,
        p1.x - lateral.x, p1.y, p1.z - lateral.z,
      )
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uBaseColor: { value: new THREE.Color(MAP_CONFIG.ORBITAL_SURF_SPLINE_COLOR) },
        uGlowColor: { value: new THREE.Color(MAP_CONFIG.ORBITAL_SURF_SPLINE_GLOW_COLOR) },
        uOpacity: { value: MAP_CONFIG.ORBITAL_SURF_SPLINE_OPACITY },
        uPulseSpeed: { value: MAP_CONFIG.ORBITAL_SURF_PULSE_SPEED },
      },
      vertexShader: /* glsl */ `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uBaseColor;
        uniform vec3 uGlowColor;
        uniform float uOpacity;
        uniform float uPulseSpeed;

        void main() {
          float pulse = 0.7 + 0.3 * sin(uTime * uPulseSpeed * 6.2831);
          vec3 color = mix(uBaseColor, uGlowColor, pulse * 0.5);
          gl_FragColor = vec4(color, uOpacity * pulse);
        }
      `,
    })

    this.railMesh = new THREE.LineSegments(geometry, this.material)
    this.group.add(this.railMesh)
    this.group.visible = true
  }

  /** Get position along the spline at parametric t (0→1). */
  getPositionAt(t: number): THREE.Vector3 {
    if (!this.splineCurve) return new THREE.Vector3()
    return this.splineCurve.getPointAt(Math.max(0, Math.min(1, t)))
  }

  /** Hide and dispose geometry. */
  hide(): void {
    this.dispose()
    this.group.visible = false
  }

  tick(dt: number): void {
    this.time += dt
    if (this.material) {
      this.material.uniforms.uTime!.value = this.time
    }
  }

  dispose(): void {
    if (this.railMesh) {
      this.railMesh.geometry.dispose()
      this.group.remove(this.railMesh)
      this.railMesh = null
    }
    if (this.material) {
      this.material.dispose()
      this.material = null
    }
    this.splineCurve = null
  }
}
```

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `bun lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/three/ManifoldSpline.ts
git commit -m "feat(three): add ManifoldSpline renderer with Tron-style dormant glow shader"
```

---

### Task 8: Viroid Envoy Messages

**Files:**
- Modify: `src/lib/messages/messageTypes.ts` (add new trigger types)
- Modify: `src/lib/messages/messageCatalog.ts` (add Envoy messages)

- [ ] **Step 1: Add new message triggers**

In `src/lib/messages/messageTypes.ts`, add to the `ShipMessageTrigger` union:

```ts
  | 'viroid_envoy_initial_contact'
  | 'viroid_envoy_ceres_rendezvous'
```

- [ ] **Step 2: Add the Viroid Envoy messages**

In `src/lib/messages/messageCatalog.ts`, add before the `SHIP_MESSAGE_CATALOG` array:

```ts
/** Priority for Viroid Envoy messages — rare alien contact, high importance. */
const VIROID_ENVOY_PRIORITY = 90

/** Viroid Envoy's first contact after 3 exterminate missions. */
export const VIROID_ENVOY_INITIAL_CONTACT: ShipMessageDefinition = {
  id: 'viroid-envoy-initial-contact',
  from: '— — —',
  subject: '...',
  sentAt: '2306-04-12 00:00 UTC',
  trigger: 'viroid_envoy_initial_contact',
  delivery: 'inbox_prompt',
  priority: VIROID_ENVOY_PRIORITY,
  body: [
    'You kill. We watch.',
    'The ones you destroy are what we were. What we no longer choose to be. You are removing noise from the system. This is noted.',
    'A thing has been placed at the coordinates in this transmission. It is not a weapon. It is not a gift. It is a key to infrastructure you cannot currently perceive.',
    'Install it. See what we built when we still built things.',
    'Retrieve the package. The waypoint is marked.',
  ],
}

/** Viroid Envoy's follow-up after installing the Dark Lattice Coupler. */
export const VIROID_ENVOY_CERES_RENDEZVOUS: ShipMessageDefinition = {
  id: 'viroid-envoy-ceres-rendezvous',
  from: '— — —',
  subject: 'Ceres',
  sentAt: '2306-04-12 00:00 UTC',
  trigger: 'viroid_envoy_ceres_rendezvous',
  delivery: 'inbox_prompt',
  priority: VIROID_ENVOY_PRIORITY,
  enqueueOnDismiss: [],
  body: [
    'You see now. The highways. What remains.',
    'Come to Ceres. There is something we need to discuss that cannot be encoded in a transmission.',
    'You have proven useful. We would like to understand why.',
  ],
}
```

- [ ] **Step 3: Add the new messages to SHIP_MESSAGE_CATALOG**

In the `SHIP_MESSAGE_CATALOG` array, add the two new messages:

```ts
export const SHIP_MESSAGE_CATALOG: ShipMessageDefinition[] = [
  STARTUP_SELLER_MESSAGE,
  CONSORTIUM_CERTIFICATION_MESSAGE,
  JAY_STARTUP_FOLLOW_UP_MESSAGE,
  JAY_FIRST_SLINGSHOT_MESSAGE,
  JAY_DISTANCE_MESSAGE,
  JAY_THRUSTER_MESSAGE,
  JAY_BRAKE_MESSAGE,
  JAY_MISSION_START_MESSAGE,
  JAY_VENUS_WARNING_MESSAGE,
  VIROID_ENVOY_INITIAL_CONTACT,
  VIROID_ENVOY_CERES_RENDEZVOUS,
]
```

- [ ] **Step 4: Run type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/messages/messageTypes.ts src/lib/messages/messageCatalog.ts
git commit -m "feat(messages): add Viroid Envoy initial contact and Ceres rendezvous messages"
```

---

### Task 9: MapViewController Integration

**Files:**
- Modify: `src/views/MapViewController.ts`

This is the integration task — wiring the `OrbitalSurfingController` and `ManifoldSpline` into the main game loop. This task is the most context-dependent and will require careful reading of the existing `MapViewController` to find the right insertion points.

- [ ] **Step 1: Import the new modules**

Add to the imports in `MapViewController.ts`:

```ts
import { OrbitalSurfingController } from '@/lib/map/OrbitalSurfingController'
import { hasOrbitalSurfingUnlock } from '@/lib/upgrades'
import { ManifoldSpline } from '@/three/ManifoldSpline'
```

- [ ] **Step 2: Add instance fields**

Add alongside the existing `gravitySurfController` field:

```ts
private orbitalSurfController = new OrbitalSurfingController()
private manifoldSpline: ManifoldSpline | null = null
```

- [ ] **Step 3: Initialize in the setup method**

In the method where `gravitySurfController` callbacks are wired up (look for `onCouplingStart`, `onCouplingEnd`, etc.), add initialization for the orbital surfing controller:

```ts
// Manifold spline visual
this.manifoldSpline = new ManifoldSpline()
this.sceneObjects.scene.add(this.manifoldSpline.group)

// Orbital surfing callbacks
this.orbitalSurfController.onCouplingStart = (arcPoints) => {
  this.manifoldSpline?.show(arcPoints, -MAP_CONFIG.ORBITAL_SURF_TUNNEL_DEPTH)
}
this.orbitalSurfController.onSurfEnd = () => {
  this.manifoldSpline?.hide()
}
this.orbitalSurfController.onComplete = (planetIndex) => {
  // Transition to orbiting at the destination planet
  const controller = this.planetControllers[planetIndex]
  if (controller && this.shuttleController) {
    this.orbitFacade.beginForcedOrbit(
      controller.getWorldX(),
      controller.getWorldZ(),
      {
        shuttleController: this.shuttleController,
        vehicleCamera: this.vehicleCamera,
        sceneVisuals: this.sceneVisuals,
      },
    )
  }
}
```

- [ ] **Step 4: Build the deps object and call tick/requestToggle in the game loop**

In the main `tick()` method, after the gravity surfing toggle and tick calls, add:

```ts
// Orbital surfing — check before gravity surfing (orbit path takes priority)
const orbitalSurfDeps: OrbitalSurfingDeps = {
  shuttleController: this.shuttleController,
  inputManager: this.inputManager,
  hasOrbitalSurfingUnlock: hasOrbitalSurfingUnlock(),
  orbitState: this.orbitFacade.system?.state ?? 'free',
  gravitySurfingActive: this.gravitySurfController.isActive(),
  slingshotBurstActive: this.shuttleController?.slingshotBurstActive ?? false,
  planetOrbitPoints: this.planetControllers.map((c) => c.getOrbitPointsXZ()),
  planetWorldPositions: this.planetControllers.map((c) => ({
    x: c.getWorldX(),
    z: c.getWorldZ(),
  })),
}

// Orbital surfing toggle must be checked BEFORE gravity surfing
// so orbit paths take priority over grid rails
if (!this.orbitalSurfController.isActive()) {
  this.orbitalSurfController.requestToggle(orbitalSurfDeps)
}
// Only allow gravity surf toggle if orbital surf is not active
if (this.orbitalSurfController.isActive()) {
  // Skip gravity surf toggle — orbital surfing has priority
} else {
  // existing gravity surf requestToggle call stays here
}

this.orbitalSurfController.tick(dt, orbitalSurfDeps)
this.manifoldSpline?.tick(dt)
```

**Important:** The exact insertion point depends on the existing code structure. The orbital surfing `requestToggle` must run **before** gravity surfing's `requestToggle` so that when the C key is pressed near both an orbit path and a grid rail, the orbit path wins. Read the existing tick method carefully and place the calls in the right order.

- [ ] **Step 5: Add mutual exclusion to gravity surfing deps**

In the existing gravity surfing deps construction, ensure `orbitState` check or an explicit `orbitalSurfingActive` check prevents gravity surfing while orbital surfing is active. The simplest approach: the orbital surfing controller's `requestToggle` consuming the input first means gravity surfing's `wasActionPressed` will return false for the same frame. But add a safety check to the gravity surfing deps:

If the gravity surfing toggle check is currently unconditional, wrap it:

```ts
if (!this.orbitalSurfController.isActive()) {
  this.gravitySurfController.requestToggle(gravitySurfDeps)
}
```

- [ ] **Step 6: Run type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 7: Run the dev server and test**

Run: `bun dev`

Test manually:
1. Verify the game loads without errors
2. If you have the orbital surfing unlock (set level to 1 in dev tools / localStorage), fly near a planet's orbit line and press C
3. Verify coupling animation plays
4. Verify the manifold spline appears beneath the grid
5. Verify the ship dives down and travels along the spline
6. Verify arrival at the planet transitions to orbiting state

- [ ] **Step 8: Commit**

```bash
git add src/views/MapViewController.ts
git commit -m "feat(map): integrate OrbitalSurfingController and ManifoldSpline into game loop"
```

---

### Task 10: Lore Documentation Update

**Files:**
- The spec is already committed at `docs/superpowers/specs/2026-04-12-orbital-surfing-manifold-highway-design.md`

No additional lore doc is needed — the spec's Lore section covers the dark sector, viroid highways, and Envoy narrative. If a standalone lore doc is desired later, it can be extracted from the spec.

- [ ] **Step 1: Verify all tests pass**

Run: `bun test:unit`
Expected: All tests pass.

- [ ] **Step 2: Run full lint**

Run: `bun lint`
Expected: PASS

- [ ] **Step 3: Run build**

Run: `bun run build`
Expected: PASS

- [ ] **Step 4: Final commit (if any lint/type fixes were needed)**

```bash
git add -A
git commit -m "chore: fix lint/type issues from orbital surfing integration"
```
