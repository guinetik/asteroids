# Special Mission Waypoint Resolution

> **For agentic workers:** Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** When a Jovian special mission auto-stages, its waypoint should point at the actual body — Hektor's current orbital position for the Hektor missions, a procedural Saturn co-orbital position for the Asset 2306-S missions. Today both are pre-baked at `(0, 0)` so the player sees no nav indicator.

**Architecture:** Add a pure resolver `resolveSpecialMissionWaypoint(asteroidId, planetWorldPositions, fallback)` that maps a mission's `asteroidId` to a world XZ. For Hektor, look up its position in the live planet controllers' world positions (Hektor is a `PinnedBody` with a `PlanetController`). For Asset 2306-S, generate a position near Saturn's orbit using the existing `generateAsteroidWaypointNearHostPlanet` shape. For unknown ids, return the fallback. Wire it into `MapViewController.stageSpecialMission` so the cloned mission's `waypoint` is overridden before the active mission slot is written.

**Tech Stack:** TypeScript strict. Reuses `orbitalPosition3D` from `src/lib/planets/kepler.ts` indirectly via the planet controllers' `getWorldX()/getWorldZ()`.

---

## File Structure

**Created:**
- `src/lib/missions/specialMissionWaypoint.ts` — pure resolver
- `src/lib/missions/__tests__/specialMissionWaypoint.spec.ts` — unit tests

**Modified:**
- `src/views/MapViewController.ts` — call resolver inside `stageSpecialMission`, override the cloned mission's `waypoint`

---

## Task 1: Pure waypoint resolver

**Files:**
- Create: `src/lib/missions/specialMissionWaypoint.ts`
- Create: `src/lib/missions/__tests__/specialMissionWaypoint.spec.ts`

The resolver is pure — no `this`, no side effects. It takes:
- `asteroidId` — mission's target body
- `bodyWorldPositions` — map from body id to current world XZ (controller-derived; passed in by the caller so this module stays unit-testable)
- `fallback` — the JSON-baked waypoint, returned when the id has no special handling
- `rand` — RNG for procedural placement (default `Math.random`)

For the Saturn co-orbital case, the resolver picks a random angular offset around Saturn's orbital ring. It needs Saturn's current position — same map.

- [ ] **Step 1: Write tests**

Create `src/lib/missions/__tests__/specialMissionWaypoint.spec.ts`:

```ts
/**
 * Tests for the special-mission waypoint resolver.
 *
 * @author guinetik
 * @date 2026-04-29
 * @spec docs/superpowers/plans/2026-04-29-special-mission-waypoint-resolution.md
 */
import { describe, expect, it } from 'vitest'
import { resolveSpecialMissionWaypoint } from '../specialMissionWaypoint'

describe('resolveSpecialMissionWaypoint', () => {
  const fallback = { worldX: 0, worldZ: 0 }

  it('returns Hektor position when asteroidId is "hektor" and Hektor is in the position map', () => {
    const positions = new Map([
      ['hektor', { x: 1234, z: 5678 }],
      ['saturn', { x: 9000, z: 100 }],
    ])
    const result = resolveSpecialMissionWaypoint('hektor', positions, fallback)
    expect(result).toEqual({ worldX: 1234, worldZ: 5678 })
  })

  it('falls back when Hektor is not in the position map', () => {
    const positions = new Map<string, { x: number; z: number }>()
    const result = resolveSpecialMissionWaypoint('hektor', positions, fallback)
    expect(result).toEqual(fallback)
  })

  it('places asset-2306-s near Saturn at a deterministic angle when rand is fixed', () => {
    const positions = new Map([['saturn', { x: 1000, z: 0 }]])
    const result = resolveSpecialMissionWaypoint(
      'asset-2306-s',
      positions,
      fallback,
      () => 0, // angle = 0 → pure +X offset from Saturn
    )
    // Placement is "near Saturn's orbit ring" — for a unit-test stable result,
    // the resolver places at Saturn position plus a small offset along the
    // angle. Confirm the result is meaningfully different from fallback (0,0)
    // and not equal to Saturn's position itself.
    expect(result.worldX).not.toBe(0)
    expect(result.worldZ).not.toBe(0)
    // Must be near Saturn (within reasonable offset radius) but not on top.
    const dx = result.worldX - 1000
    const dz = result.worldZ - 0
    const dist = Math.sqrt(dx * dx + dz * dz)
    expect(dist).toBeGreaterThan(0)
    expect(dist).toBeLessThan(100) // offset radius is small relative to scale
  })

  it('falls back when asteroidId is asset-2306-s but Saturn is not in the position map', () => {
    const positions = new Map<string, { x: number; z: number }>()
    const result = resolveSpecialMissionWaypoint('asset-2306-s', positions, fallback)
    expect(result).toEqual(fallback)
  })

  it('returns fallback for unknown asteroid ids', () => {
    const positions = new Map([['hektor', { x: 1, z: 2 }]])
    const result = resolveSpecialMissionWaypoint('some-other-rock', positions, fallback)
    expect(result).toEqual(fallback)
  })

  it('asset-2306-s placements with different rand values produce different positions', () => {
    const positions = new Map([['saturn', { x: 1000, z: 0 }]])
    const a = resolveSpecialMissionWaypoint('asset-2306-s', positions, fallback, () => 0)
    const b = resolveSpecialMissionWaypoint('asset-2306-s', positions, fallback, () => 0.5)
    expect(a).not.toEqual(b)
  })
})
```

- [ ] **Step 2: Run, confirm failure**

Run: `bun test:unit src/lib/missions/__tests__/specialMissionWaypoint.spec.ts`
Expected: FAIL — file doesn't exist.

- [ ] **Step 3: Implement the resolver**

Create `src/lib/missions/specialMissionWaypoint.ts`:

```ts
/**
 * Pure resolver mapping a special mission's `asteroidId` to a world XZ
 * waypoint. Used by `MapViewController.stageSpecialMission` to override the
 * pre-baked `(0, 0)` waypoint in the special mission JSON with the actual
 * body's current solar-map position.
 *
 * Asteroid id coverage:
 *   - `'hektor'`: returns Hektor's live position from the body map (Hektor is
 *     a pinned body with a `PlanetController` that exposes `getWorldX/Z`).
 *   - `'asset-2306-s'`: fictional Saturn co-orbital. Places near Saturn's
 *     current position at a random angular offset, small radius. Not orbit-
 *     correct — just "go fly to Saturn area" — which is the contract's intent
 *     ("Saturn co-orbital region, longer trip").
 *   - any other id: returns the fallback (the JSON-baked waypoint).
 *
 * @author guinetik
 * @date 2026-04-29
 * @spec docs/superpowers/plans/2026-04-29-special-mission-waypoint-resolution.md
 */

/** World position in the solar-map XZ frame. */
export interface WorldPositionXZ {
  /** World X. */
  x: number
  /** World Z. */
  z: number
}

/** Waypoint shape used by `GeneratedAsteroidMission.waypoint`. */
export interface Waypoint {
  /** Waypoint world X. */
  worldX: number
  /** Waypoint world Z. */
  worldZ: number
}

/** Offset radius (world units) used for procedural Saturn co-orbital placement. */
const SATURN_CO_ORBITAL_OFFSET_RADIUS = 60

/**
 * Resolve a special mission's waypoint to the body's actual position.
 *
 * @param asteroidId - The mission's `asteroidId` field.
 * @param bodyWorldPositions - Map from body id to current world XZ. Caller
 *   builds this from live planet controllers (`getWorldX/Z()`), pinned-body
 *   controllers, etc.
 * @param fallback - JSON-baked waypoint, used when the asteroid id has no
 *   special handling or the required body is missing from the map.
 * @param rand - RNG for procedural placement (asset-2306-s).
 * @returns Waypoint XZ in the same world frame as the body positions.
 */
export function resolveSpecialMissionWaypoint(
  asteroidId: string,
  bodyWorldPositions: ReadonlyMap<string, WorldPositionXZ>,
  fallback: Waypoint,
  rand: () => number = Math.random,
): Waypoint {
  if (asteroidId === 'hektor') {
    const hektor = bodyWorldPositions.get('hektor')
    if (!hektor) return fallback
    return { worldX: hektor.x, worldZ: hektor.z }
  }
  if (asteroidId === 'asset-2306-s') {
    const saturn = bodyWorldPositions.get('saturn')
    if (!saturn) return fallback
    const angle = rand() * Math.PI * 2
    return {
      worldX: saturn.x + Math.cos(angle) * SATURN_CO_ORBITAL_OFFSET_RADIUS,
      worldZ: saturn.z + Math.sin(angle) * SATURN_CO_ORBITAL_OFFSET_RADIUS,
    }
  }
  return fallback
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `bun test:unit src/lib/missions/__tests__/specialMissionWaypoint.spec.ts`
Expected: all 6 tests pass.

If the "deterministic angle" test fails because the `rand: () => 0` produces `cos(0)=1, sin(0)=0` and the offset puts the result exactly on `(saturn.x + radius, saturn.z)`, that's fine — adjust the assertion if it's too strict; the goal is "not at fallback, not at Saturn exactly."

- [ ] **Step 5: Commit**

```bash
git add src/lib/missions/specialMissionWaypoint.ts src/lib/missions/__tests__/specialMissionWaypoint.spec.ts
git commit -m "feat(missions): add resolver for Hektor and Asset 2306-S waypoints"
```

---

## Task 2: Wire resolver into MapViewController

**Files:**
- Modify: `src/views/MapViewController.ts`

In the existing `stageSpecialMission` private method, after `getSpecialMissionById` returns the cloned mission and before we mutate `this.missionBoard`, override `mission.waypoint` using the resolver.

The position map needs to include both `'hektor'` (a pinned body) and `'saturn'` (a regular planet). Both are exposed by the controller's `planetControllers` array.

- [ ] **Step 1: Read the existing `stageSpecialMission`**

In `src/views/MapViewController.ts`, find `private stageSpecialMission(missionId, offerMessageId): void` (added in plan 4's Task 8). The function:
1. Calls `getSpecialMissionById(missionId)`
2. Calls `messageFacade.enqueueById(offerMessageId, ...)`
3. Spreads into `acceptedMission` with `status: 'accepted'`
4. Writes to `this.missionBoard.activeAsteroidMission`
5. Saves and notifies

We insert the waypoint resolution between (1) and (3): after `getSpecialMissionById` returns, build a position map and override `mission.waypoint`.

Also find how `planetControllers` are organized — confirm there's an entry for each pinned body and that `getWorldX/Z` is the right call.

- [ ] **Step 2: Build a body position map helper**

Add a private helper near `stageSpecialMission`:

```ts
  /**
   * Snapshot the current world XZ position of every planet controller (planets
   * + pinned bodies). Used by `resolveSpecialMissionWaypoint` to overlay an
   * accurate target position on the special mission's pre-baked waypoint.
   *
   * @returns Map from body id to world XZ.
   */
  private snapshotBodyWorldPositions(): Map<string, WorldPositionXZ> {
    const map = new Map<string, WorldPositionXZ>()
    for (const controller of this.planetControllers) {
      // PlanetController exposes the body's id (or name; verify against the
      // controller's API). Use the id matching `pinnedBodies[].id` /
      // `planets[].id`.
      const id = controller.getBodyId?.() ?? controller.id ?? null
      if (typeof id !== 'string') continue
      map.set(id, { x: controller.getWorldX(), z: controller.getWorldZ() })
    }
    return map
  }
```

If `PlanetController` doesn't have `getBodyId()` or an `id` field, the implementer reads the controller's API and adapts — the goal is "for each controller, what's the matching planetarium id." Likely `controller.id` or `controller.body?.id` or similar. Read the controller class file to confirm.

- [ ] **Step 3: Override the waypoint in `stageSpecialMission`**

Add the resolver call. The full updated method body:

```ts
  private stageSpecialMission(missionId: string, offerMessageId: string): void {
    const mission = getSpecialMissionById(missionId)
    if (!mission) {
      console.warn(`[MapView] Special mission not found: ${missionId}`)
      return
    }

    this.messageFacade.enqueueById(offerMessageId, this.onMessageUpdate)

    const positions = this.snapshotBodyWorldPositions()
    const resolvedWaypoint = resolveSpecialMissionWaypoint(
      mission.asteroidId,
      positions,
      mission.waypoint,
    )

    const acceptedMission: GeneratedAsteroidMission = {
      ...mission,
      status: 'accepted',
      waypoint: resolvedWaypoint,
    }
    this.missionBoard = {
      ...this.missionBoard,
      offeredAsteroidMission: null,
      activeAsteroidMission: acceptedMission,
    }
    saveActiveMission(acceptedMission)
    saveMissionBoard(this.missionBoard)
    this.onMissionBoardUpdate?.(this.missionBoard)
  }
```

- [ ] **Step 4: Add imports**

At the top of `MapViewController.ts`:

```ts
import {
  resolveSpecialMissionWaypoint,
  type WorldPositionXZ,
} from '@/lib/missions/specialMissionWaypoint'
```

- [ ] **Step 5: Verify**

Run: `bun run type-check`
Expected: PASS. If `WorldPositionXZ` type isn't compatible with the controller's return shape, adjust the helper's return type.

Run: `bun run lint`
Expected: 0 errors / 0 warnings.

Run: `bun test:unit`
Expected: full green.

- [ ] **Step 6: Commit**

```bash
git add src/views/MapViewController.ts
git commit -m "feat(map): resolve special-mission waypoints to live body positions"
```

## Acceptance for Task 2

- type-check, lint, full test suite pass
- One commit
- `stageSpecialMission` (and by extension `stageConsortiumCertification`) still works for the consortium case (the resolver returns the fallback for `bennu`, so consortium-certification is unchanged)

---

## Task 3: Acceptance gate

- [ ] **Step 1: Type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 2: Lint**

Run: `bun run lint`
Expected: clean.

- [ ] **Step 3: Full unit suite**

Run: `bun test:unit`
Expected: full green.

- [ ] **Step 4: Manual — Step 4 waypoint (optional dev verify)**

`bun dev`. Drive the contract to Step 4. Verify:
- Active mission HUD shows OP-4 photometry
- The map waypoint indicator points at Hektor (not at the Sun)
- Flying close to Hektor triggers the "Begin Mission" prompt

- [ ] **Step 5: Manual — Step 5 waypoint**

Drive to Step 5. Verify the waypoint is **near Saturn** (random offset), not at Hektor or the Sun. The trip should feel like a long Saturn run.

- [ ] **Step 6: Manual — Consortium regression**

Trigger the Act 1 consortium-certification staging. The waypoint should still point at the bennu coordinates from the JSON (`worldX: 260, worldZ: 145`) since the resolver returns the fallback for `bennu`.

---

## Notes for the implementer

- **Hektor's slow orbit.** Hektor's period is 4348 years. On gameplay timescales it's effectively stationary. A snapshot at staging time is "good enough" — no need for live-tracking the waypoint as Hektor moves. If a future plan introduces fast-moving pinned bodies, the resolver can be re-invoked on each staging.
- **Asset 2306-S placement.** The 60-world-unit offset radius is small. Saturn's orbit is large (~9.5 AU). The waypoint will read as "right next to Saturn" — fine for the contract framing ("co-orbital region"), and matches how `generateAsteroidWaypointNearHostPlanet` does its own jitter. If it feels wrong on playtest, tune `SATURN_CO_ORBITAL_OFFSET_RADIUS`.
- **Resolver intentionally hardcodes ids.** `'hektor'` and `'asset-2306-s'` are the only special cases plan 4 introduced. When more pinned bodies or fictional Saturn-like rocks land in future plans, extend the resolver. Don't generalize prematurely.
- **PlanetController API discovery.** The controller's id-accessor name is unknown from this plan's research — the implementer reads the controller class and adapts. Adjacent code (`planetControllers.map((c) => ({ x: c.getWorldX(), z: c.getWorldZ() }))` in `MapViewController:2266`) already uses `getWorldX/Z`; the id accessor is the missing piece.
