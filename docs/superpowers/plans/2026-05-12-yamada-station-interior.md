# Yamada Station Interior — Pass 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `/station` route that loads a data-driven FPS interior, reachable via a dock prompt at a new pinned-station asset and via two dev-console commands.

**Architecture:** Reuse `PinnedStationController` with a new `positionSeed`. Extend the `PinnedAsset.station` type with `dockTarget: 'level' | 'station'`. Build a new view pair (`StationView.vue` + `StationViewController.ts`) that reuses `FpsCamera`, `FpsPlayerController`, `FpsAudioDirector`, and `FpsPointerLockSession`, but replaces the heightmap-driven terrain with a `StationCollider` (axis-aligned wall AABBs + floor planes) loaded from JSON. Exit is a submarine hatch that routes back to `/`.

**Tech Stack:** Vue 3, Vue Router, TypeScript (strict), Three.js, Vitest, Bun.

**Spec:** `docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md`

---

## File map

**Create:**
- `src/data/stations/yamada-station.json` — interior level data
- `src/lib/station/types.ts` — `StationLevelJson`, `StationRoomJson`, `StationOpeningJson`, `StationMaterialJson`, `OpeningWall`
- `src/lib/station/StationCollider.ts` — floor + wall AABB collision
- `src/lib/station/StationLevelLoader.ts` — JSON → built Three.js group + collider + spawn/hatch placements
- `src/lib/station/stationRouteAccess.ts` — `canAccessStationRoute(query)`
- `src/lib/station/__tests__/StationCollider.spec.ts`
- `src/lib/station/__tests__/StationLevelLoader.spec.ts`
- `src/lib/station/__tests__/stationRouteAccess.spec.ts`
- `src/three/StationHatchController.ts` — submarine hatch mesh + F-prompt + knob-spin
- `src/views/StationView.vue` — minimal wrapper
- `src/views/StationViewController.ts` — scene wiring

**Modify:**
- `src/lib/contracts/contractTypes.ts` — add `dockTarget?: 'level' | 'station'` to `PinnedAsset` station variant
- `src/router/index.ts` — register `/station` route + guard
- `src/three/FpsPlayerController.ts` — accept `FpsGroundSource` (heightmap or collider)
- `src/views/MapView.vue` — dock-panel "begin" handler branches on `dockTarget`
- `src/views/MapViewController.ts` — register dev-console commands `spawnYamadaStation` and `openYamadaStation`

---

## Task 1: Add `dockTarget` to PinnedAsset station variant

**Files:**
- Modify: `src/lib/contracts/contractTypes.ts:385-409`

- [ ] **Step 1: Add the field**

Edit `contractTypes.ts` to extend the station variant of `PinnedAsset`:

```ts
  | {
      /** Stable ref the dock subsystem keys off. */
      assetRef: string
      /** Discriminator. */
      kind: 'station'
      /** Region the station orbits in (e.g. `'kuiper-belt'`). */
      region: string
      /** Display label for the dock prompt. */
      label: string
      /** Path under `public/` to the GLB (e.g. `'models/station.glb'`). */
      modelPath: string
      /** Stable string hashed to a deterministic Kuiper-belt position. */
      positionSeed: string
      /**
       * Route the dock prompt sends the player to.
       * @defaultValue `'level'`
       */
      dockTarget?: 'level' | 'station'
      /**
       * When `dockTarget === 'station'`, the station JSON id passed as
       * `?station=` to the `/station` route (e.g. `'yamada-titania'`).
       */
      stationId?: string
    }
```

- [ ] **Step 2: Verify type-check passes**

Run: `bun run type-check`
Expected: 0 errors. The change is additive (optional fields); no existing contract data needs updating.

- [ ] **Step 3: Commit**

```bash
git add src/lib/contracts/contractTypes.ts
git commit -m "feat(contracts): add dockTarget + stationId to pinned-station assets"
```

---

## Task 2: Station level type definitions

**Files:**
- Create: `src/lib/station/types.ts`

- [ ] **Step 1: Write the types file**

```ts
/**
 * Type definitions for the data-driven station-interior level format
 * loaded under `/station` by {@link StationLevelLoader}.
 *
 * @author guinetik
 * @date 2026-05-12
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */

/** Which axis-aligned wall of a room an opening or hatch is cut into. */
export type OpeningWall = '+x' | '-x' | '+z' | '-z'

/** A doorway cut into one wall of a room, connecting to another room. */
export interface StationOpeningJson {
  /** Room id this opening leads to. */
  to: string
  /** Wall of the parent room the opening sits on. */
  wall: OpeningWall
  /** Centre offset along that wall, in world units (0 = wall centre). */
  offset: number
  /** Opening width in world units. */
  width: number
}

/** Per-room material tint applied to floor, walls, and ceiling. */
export interface StationMaterialJson {
  /** Floor colour, CSS hex (e.g. `"#3a2f28"`). */
  floor: string
  /** Wall colour, CSS hex. */
  wall: string
  /** Ceiling colour, CSS hex. */
  ceiling: string
}

/** One axis-aligned box room. */
export interface StationRoomJson {
  /** Stable room id used by openings and spawn references. */
  id: string
  /** Inner extent of the room: `[width, height, depth]` in world units. */
  size: [number, number, number]
  /** Minimum corner of the room in world space: `[x, y, z]`. */
  origin: [number, number, number]
  /** Key into the level's `materials` map. */
  material: string
  /** Doorways cut into the walls. Every opening must be declared on both sides. */
  openings: StationOpeningJson[]
}

/** Where the player spawns when the level loads. */
export interface StationSpawnJson {
  /** Room id the spawn point lives in. */
  room: string
  /** World-space spawn position `[x, y, z]`. `y` is usually 0 (floor). */
  pos: [number, number, number]
  /** Yaw in radians; 0 = facing `+Z`. */
  yaw: number
}

/** The single exit hatch back to `/`. */
export interface StationHatchJson {
  /** Room id the hatch is mounted in. */
  room: string
  /** Wall of that room the hatch sits on. */
  wall: OpeningWall
  /** World Y of the hatch centre (eye height ≈ 1.2). */
  centerY: number
}

/** Global ambient-light settings for the level. */
export interface StationAmbientJson {
  /** Ambient light colour, CSS hex. */
  color: string
  /** Ambient intensity (0–1 typical). */
  intensity: number
}

/** Top-level shape of `src/data/stations/*.json`. */
export interface StationLevelJson {
  /** Level id (matches the `station` query param). */
  id: string
  /** Player spawn. */
  spawn: StationSpawnJson
  /** Exit hatch (exactly one per level). */
  exitHatch: StationHatchJson
  /** Rooms making up the interior. */
  rooms: StationRoomJson[]
  /** Material palette keyed by material id. */
  materials: Record<string, StationMaterialJson>
  /** Global ambient light. */
  ambient: StationAmbientJson
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `bun run type-check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/station/types.ts
git commit -m "feat(station): add data-driven level type definitions"
```

---

## Task 3: `yamada-station.json` data file

**Files:**
- Create: `src/data/stations/yamada-station.json`

- [ ] **Step 1: Write the JSON**

Foyer is a 16×8 hub with the hatch on the `-z` wall and three archways on the `+z` wall, evenly spaced. The three other rooms each have a single matching opening on their `-z` wall.

Coordinate system: origin = room's minimum corner. Foyer occupies x∈[-8,8], z∈[-4,4]. Margaret sits behind the −5 archway at x∈[-10,0], z∈[8,16]. Pig Ward behind the centre archway at x∈[-8,8], z∈[18,30]. Listening behind the +5 archway at x∈[0,10], z∈[8,18]. (Margaret and Listening are stretched away from the centre archway so the three rooms don't overlap.)

```json
{
  "id": "yamada-titania",
  "spawn": { "room": "foyer", "pos": [0, 0, -2], "yaw": 0 },
  "exitHatch": { "room": "foyer", "wall": "-z", "centerY": 1.2 },
  "rooms": [
    {
      "id": "foyer",
      "size": [16, 3, 8],
      "origin": [-8, 0, -4],
      "material": "yamada-foyer",
      "openings": [
        { "to": "margaret",  "wall": "+z", "offset": -5, "width": 2 },
        { "to": "pig-ward",  "wall": "+z", "offset":  0, "width": 2 },
        { "to": "listening", "wall": "+z", "offset":  5, "width": 2 }
      ]
    },
    {
      "id": "margaret",
      "size": [10, 3, 8],
      "origin": [-10, 0, 4],
      "material": "yamada-margaret",
      "openings": [{ "to": "foyer", "wall": "-z", "offset": 5, "width": 2 }]
    },
    {
      "id": "pig-ward",
      "size": [16, 3, 12],
      "origin": [-8, 0, 4],
      "material": "yamada-pig",
      "openings": [{ "to": "foyer", "wall": "-z", "offset": 0, "width": 2 }]
    },
    {
      "id": "listening",
      "size": [10, 3, 10],
      "origin": [0, 0, 4],
      "material": "yamada-listening",
      "openings": [{ "to": "foyer", "wall": "-z", "offset": -5, "width": 2 }]
    }
  ],
  "materials": {
    "yamada-foyer":     { "floor": "#3a2f28", "wall": "#5a4a3e", "ceiling": "#2a2520" },
    "yamada-margaret":  { "floor": "#3a2f28", "wall": "#5a4a3e", "ceiling": "#2a2520" },
    "yamada-pig":       { "floor": "#332e2a", "wall": "#4a4642", "ceiling": "#26231f" },
    "yamada-listening": { "floor": "#252a30", "wall": "#3a4048", "ceiling": "#1c2026" }
  },
  "ambient": { "color": "#ffdcb0", "intensity": 0.35 }
}
```

Note: rooms overlap in world space in the JSON above (margaret/pig-ward/listening all start at z=4). This is intentional — the loader builds each room independently and culls duplicate wall segments at openings. If overlap causes rendering issues in playtesting, the JSON can be tuned without code changes.

- [ ] **Step 2: Commit**

```bash
git add src/data/stations/yamada-station.json
git commit -m "feat(station): add yamada-titania interior level data"
```

---

## Task 4: `StationCollider` — TDD

**Files:**
- Create: `src/lib/station/StationCollider.ts`
- Create: `src/lib/station/__tests__/StationCollider.spec.ts`

The collider holds floor-Y per axis-aligned floor rectangle and wall AABBs. It exposes:

```ts
groundedYAt(x: number, z: number): number
resolveLateralMove(fromX: number, fromZ: number, toX: number, toZ: number, radius: number): { x: number, z: number }
```

`resolveLateralMove` clamps a desired motion so the player capsule (radius) cannot pass through wall AABBs, but can pass through openings (which are excluded from the wall AABB list at build time).

- [ ] **Step 1: Write the failing tests**

```ts
/**
 * Tests for {@link StationCollider}.
 *
 * @author guinetik
 * @date 2026-05-12
 */
import { describe, it, expect } from 'vitest'
import { StationCollider, type StationFloor, type StationWallAabb } from '../StationCollider'

const FLOORS: StationFloor[] = [
  { minX: -8, maxX: 8, minZ: -4, maxZ: 4, y: 0 }, // foyer
  { minX: -10, maxX: 0, minZ: 4, maxZ: 12, y: 0 }, // margaret
]

const WALLS: StationWallAabb[] = [
  // foyer +x wall
  { minX: 8, maxX: 8.2, minZ: -4, maxZ: 4 },
  // foyer -x wall
  { minX: -8.2, maxX: -8, minZ: -4, maxZ: 4 },
]

describe('StationCollider', () => {
  describe('groundedYAt', () => {
    it('returns the floor Y when the point is inside a floor rect', () => {
      const c = new StationCollider(FLOORS, WALLS)
      expect(c.groundedYAt(0, 0)).toBe(0)
    })

    it('returns the floor Y of the matching rect for adjacent rooms', () => {
      const c = new StationCollider(FLOORS, WALLS)
      expect(c.groundedYAt(-5, 8)).toBe(0)
    })

    it('returns 0 as a safe fallback when the point is outside every floor', () => {
      const c = new StationCollider(FLOORS, WALLS)
      expect(c.groundedYAt(100, 100)).toBe(0)
    })
  })

  describe('resolveLateralMove', () => {
    it('passes the move through when no wall is in the way', () => {
      const c = new StationCollider(FLOORS, WALLS)
      const out = c.resolveLateralMove(0, 0, 1, 0, 0.3)
      expect(out.x).toBeCloseTo(1)
      expect(out.z).toBeCloseTo(0)
    })

    it('clamps motion into a wall to stop short by the player radius', () => {
      const c = new StationCollider(FLOORS, WALLS)
      // Walking from x=0 toward x=10 hits the +x wall at x=8 (minus radius).
      const out = c.resolveLateralMove(0, 0, 10, 0, 0.3)
      expect(out.x).toBeLessThanOrEqual(8 - 0.3 + 1e-6)
      expect(out.x).toBeGreaterThan(7)
    })

    it('allows lateral slide along a wall', () => {
      const c = new StationCollider(FLOORS, WALLS)
      // Move parallel to the +x wall — z motion is preserved.
      const out = c.resolveLateralMove(7.9, 0, 7.9, 2, 0.3)
      expect(out.z).toBeCloseTo(2)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/station/__tests__/StationCollider.spec.ts`
Expected: all FAIL with "Cannot find module '../StationCollider'".

- [ ] **Step 3: Implement `StationCollider`**

```ts
/**
 * Axis-aligned floor + wall collision for the station-interior FPS view.
 * Floors are flat rectangles with a fixed Y; walls are thin AABBs that the
 * player capsule cannot pass through. Openings (archways) are represented
 * by their absence — the loader splits wall spans around openings before
 * passing the resulting AABB list in.
 *
 * @author guinetik
 * @date 2026-05-12
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */

/** Flat horizontal rectangle that the player stands on. */
export interface StationFloor {
  /** Minimum X in world units. */
  minX: number
  /** Maximum X in world units. */
  maxX: number
  /** Minimum Z in world units. */
  minZ: number
  /** Maximum Z in world units. */
  maxZ: number
  /** Floor surface Y in world units. */
  y: number
}

/** Thin wall AABB the player capsule cannot penetrate. */
export interface StationWallAabb {
  /** Minimum X in world units. */
  minX: number
  /** Maximum X in world units. */
  maxX: number
  /** Minimum Z in world units. */
  minZ: number
  /** Maximum Z in world units. */
  maxZ: number
}

/** Default floor Y when the player's (x, z) is outside every floor rect. */
const FLOOR_FALLBACK_Y = 0

/**
 * Pure collision math for the station interior. No Three.js dependencies.
 * Tested under Vitest.
 */
export class StationCollider {
  private readonly _floors: readonly StationFloor[]
  private readonly _walls: readonly StationWallAabb[]

  constructor(floors: readonly StationFloor[], walls: readonly StationWallAabb[]) {
    this._floors = floors
    this._walls = walls
  }

  /**
   * Floor surface Y at the given (x, z). Falls back to 0 when no floor rect
   * contains the point — the player should not normally be there, but the
   * fallback keeps physics finite.
   *
   * @param x - World X.
   * @param z - World Z.
   * @returns Floor Y.
   */
  groundedYAt(x: number, z: number): number {
    for (const f of this._floors) {
      if (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ) {
        return f.y
      }
    }
    return FLOOR_FALLBACK_Y
  }

  /**
   * Resolve a desired lateral move so the capsule cannot enter a wall AABB.
   * Each wall is checked once; the move is clamped per-axis so the player
   * slides along walls instead of stopping dead.
   *
   * @param fromX - Current X.
   * @param fromZ - Current Z.
   * @param toX - Desired X.
   * @param toZ - Desired Z.
   * @param radius - Player capsule radius.
   * @returns Clamped destination `{ x, z }`.
   */
  resolveLateralMove(
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
    radius: number,
  ): { x: number; z: number } {
    let x = toX
    let z = toZ

    for (const w of this._walls) {
      // X-axis resolve: keep z = fromZ and check if the capsule overlaps the wall.
      if (this._overlapsExpanded(x, fromZ, w, radius)) {
        if (toX > fromX) {
          x = Math.min(x, w.minX - radius)
        } else if (toX < fromX) {
          x = Math.max(x, w.maxX + radius)
        }
      }
      // Z-axis resolve.
      if (this._overlapsExpanded(x, z, w, radius)) {
        if (toZ > fromZ) {
          z = Math.min(z, w.minZ - radius)
        } else if (toZ < fromZ) {
          z = Math.max(z, w.maxZ + radius)
        }
      }
    }

    return { x, z }
  }

  private _overlapsExpanded(x: number, z: number, w: StationWallAabb, radius: number): boolean {
    return (
      x > w.minX - radius &&
      x < w.maxX + radius &&
      z > w.minZ - radius &&
      z < w.maxZ + radius
    )
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/station/__tests__/StationCollider.spec.ts`
Expected: all 6 tests PASS.

- [ ] **Step 5: Run lint**

Run: `bun lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/station/StationCollider.ts src/lib/station/__tests__/StationCollider.spec.ts
git commit -m "feat(station): add StationCollider with floor + wall AABB resolution"
```

---

## Task 5: `StationLevelLoader` — TDD for the pure-math parts

The loader does three things:
1. **Validate** the JSON (every opening declared on both sides; every `material` key exists; exactly one hatch room).
2. **Compute collider geometry** (floor rects per room; wall segments split around openings).
3. **Build a Three.js group** of meshes (floor/walls/ceiling per room, hatch placeholder mesh).

We unit-test (1) and (2). The Three.js mesh-building is exercised manually in the browser.

**Files:**
- Create: `src/lib/station/StationLevelLoader.ts`
- Create: `src/lib/station/__tests__/StationLevelLoader.spec.ts`

- [ ] **Step 1: Write failing tests for validation + collider geometry**

```ts
/**
 * Tests for the pure-math parts of {@link StationLevelLoader}: JSON
 * validation and collider-geometry generation.
 *
 * @author guinetik
 * @date 2026-05-12
 */
import { describe, it, expect } from 'vitest'
import { validateStationLevel, buildStationColliderGeometry } from '../StationLevelLoader'
import type { StationLevelJson } from '../types'

const MINIMAL_LEVEL: StationLevelJson = {
  id: 'test',
  spawn: { room: 'a', pos: [0, 0, 0], yaw: 0 },
  exitHatch: { room: 'a', wall: '-z', centerY: 1.2 },
  rooms: [
    {
      id: 'a',
      size: [10, 3, 8],
      origin: [-5, 0, -4],
      material: 'm',
      openings: [{ to: 'b', wall: '+z', offset: 0, width: 2 }],
    },
    {
      id: 'b',
      size: [10, 3, 8],
      origin: [-5, 0, 4],
      material: 'm',
      openings: [{ to: 'a', wall: '-z', offset: 0, width: 2 }],
    },
  ],
  materials: { m: { floor: '#000', wall: '#111', ceiling: '#222' } },
  ambient: { color: '#fff', intensity: 0.3 },
}

describe('validateStationLevel', () => {
  it('accepts a well-formed level', () => {
    expect(() => validateStationLevel(MINIMAL_LEVEL)).not.toThrow()
  })

  it('rejects an opening whose target room does not exist', () => {
    const bad: StationLevelJson = {
      ...MINIMAL_LEVEL,
      rooms: [
        { ...MINIMAL_LEVEL.rooms[0]!, openings: [{ to: 'ghost', wall: '+z', offset: 0, width: 2 }] },
        MINIMAL_LEVEL.rooms[1]!,
      ],
    }
    expect(() => validateStationLevel(bad)).toThrow(/ghost/)
  })

  it('rejects an opening that is not mirrored on the other side', () => {
    const bad: StationLevelJson = {
      ...MINIMAL_LEVEL,
      rooms: [MINIMAL_LEVEL.rooms[0]!, { ...MINIMAL_LEVEL.rooms[1]!, openings: [] }],
    }
    expect(() => validateStationLevel(bad)).toThrow(/mirror/i)
  })

  it('rejects a room whose material key is missing from the materials map', () => {
    const bad: StationLevelJson = {
      ...MINIMAL_LEVEL,
      rooms: [{ ...MINIMAL_LEVEL.rooms[0]!, material: 'missing' }, MINIMAL_LEVEL.rooms[1]!],
    }
    expect(() => validateStationLevel(bad)).toThrow(/material/i)
  })

  it('rejects a hatch whose room does not exist', () => {
    const bad: StationLevelJson = {
      ...MINIMAL_LEVEL,
      exitHatch: { room: 'ghost', wall: '-z', centerY: 1.2 },
    }
    expect(() => validateStationLevel(bad)).toThrow(/ghost/)
  })
})

describe('buildStationColliderGeometry', () => {
  it('emits one floor per room with absolute world coordinates', () => {
    const { floors } = buildStationColliderGeometry(MINIMAL_LEVEL)
    expect(floors).toHaveLength(2)
    const a = floors.find((f) => f.minX === -5 && f.minZ === -4)
    expect(a).toBeDefined()
    expect(a!.maxX).toBe(5)
    expect(a!.maxZ).toBe(4)
    expect(a!.y).toBe(0)
  })

  it('emits wall AABBs split around openings (no AABB spans the opening width)', () => {
    const { walls } = buildStationColliderGeometry(MINIMAL_LEVEL)
    // Room A has a 2m-wide opening at z=4 centred on x=0. The +z wall of A
    // (z=4) should produce two segments: x∈[-5,-1] and x∈[1,5]. No segment
    // covers x∈[-1,1] at z=4.
    const aPlusZSegments = walls.filter((w) => w.minZ >= 4 - 0.2 && w.maxZ <= 4 + 0.2)
    expect(aPlusZSegments.length).toBeGreaterThanOrEqual(2)
    const spansOpening = aPlusZSegments.some((w) => w.minX < 0 && w.maxX > 0)
    expect(spansOpening).toBe(false)
  })

  it('does not emit a wall segment where two rooms share an opening', () => {
    const { walls } = buildStationColliderGeometry(MINIMAL_LEVEL)
    // No wall AABB should sit at z=4 spanning the opening x∈[-1,1].
    const blocking = walls.find(
      (w) => w.minZ < 4 && w.maxZ > 4 && w.minX <= -1 && w.maxX >= 1,
    )
    expect(blocking).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/station/__tests__/StationLevelLoader.spec.ts`
Expected: all FAIL with "Cannot find module '../StationLevelLoader'".

- [ ] **Step 3: Implement the loader (validation + collider geometry only)**

```ts
/**
 * Loader for the data-driven station-interior level format. Validates the
 * JSON, computes collider geometry (floor rects + wall AABBs with openings
 * removed), and builds a Three.js group of room meshes + the exit hatch.
 *
 * @author guinetik
 * @date 2026-05-12
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */
import * as THREE from 'three'
import type {
  OpeningWall,
  StationLevelJson,
  StationMaterialJson,
  StationOpeningJson,
  StationRoomJson,
} from './types'
import {
  StationCollider,
  type StationFloor,
  type StationWallAabb,
} from './StationCollider'

/** Wall thickness used when generating AABBs and box-geometry meshes. */
const WALL_THICKNESS = 0.2

/** Result of {@link buildStationColliderGeometry}. */
export interface StationColliderGeometry {
  /** Floor rectangles, one per room. */
  floors: StationFloor[]
  /** Wall AABBs with openings removed. */
  walls: StationWallAabb[]
}

/** Built level returned by {@link loadStationLevel}. */
export interface StationLevel {
  /** Root Three.js group containing every mesh. */
  group: THREE.Group
  /** Collider for player movement. */
  collider: StationCollider
  /** World-space spawn position. */
  spawnPos: THREE.Vector3
  /** Spawn yaw (radians, 0 = facing +Z). */
  spawnYaw: number
  /** World-space hatch centre. */
  hatchPos: THREE.Vector3
  /** Hatch yaw (radians, 0 = facing +Z). The hatch faces into the room. */
  hatchYaw: number
}

/**
 * Throw if the level is structurally invalid. Catches the bugs that JSON
 * editors are most likely to introduce: missing rooms, lopsided openings,
 * dangling material keys.
 *
 * @param level - Parsed JSON.
 */
export function validateStationLevel(level: StationLevelJson): void {
  const roomIds = new Set(level.rooms.map((r) => r.id))

  // Hatch room exists.
  if (!roomIds.has(level.exitHatch.room)) {
    throw new Error(`exitHatch.room "${level.exitHatch.room}" is not a known room`)
  }

  // Spawn room exists.
  if (!roomIds.has(level.spawn.room)) {
    throw new Error(`spawn.room "${level.spawn.room}" is not a known room`)
  }

  for (const room of level.rooms) {
    // Material key exists.
    if (!level.materials[room.material]) {
      throw new Error(`room "${room.id}" references unknown material "${room.material}"`)
    }
    for (const op of room.openings) {
      // Target room exists.
      if (!roomIds.has(op.to)) {
        throw new Error(
          `room "${room.id}" opening leads to unknown room "${op.to}"`,
        )
      }
      // Mirror exists in the target room.
      const target = level.rooms.find((r) => r.id === op.to)!
      const oppositeWall = oppositeOf(op.wall)
      const mirrored = target.openings.find(
        (o) => o.to === room.id && o.wall === oppositeWall && o.width === op.width,
      )
      if (!mirrored) {
        throw new Error(
          `opening from "${room.id}" to "${op.to}" is not mirrored back on the "${oppositeWall}" wall of "${op.to}"`,
        )
      }
    }
  }
}

/**
 * Compute floor rectangles and wall AABBs with openings removed.
 * Each wall is split into 0–2 segments around the cumulative span of any
 * openings on that wall.
 *
 * @param level - Validated JSON.
 */
export function buildStationColliderGeometry(level: StationLevelJson): StationColliderGeometry {
  const floors: StationFloor[] = []
  const walls: StationWallAabb[] = []

  for (const room of level.rooms) {
    const [w, , d] = room.size
    const [ox, oy, oz] = room.origin
    const minX = ox
    const maxX = ox + w
    const minZ = oz
    const maxZ = oz + d

    floors.push({ minX, maxX, minZ, maxZ, y: oy })

    for (const wall of (['+x', '-x', '+z', '-z'] as const)) {
      const openings = room.openings.filter((o) => o.wall === wall)
      walls.push(...wallSegmentsForWall(room, wall, openings))
    }
  }

  return { floors, walls }
}

function oppositeOf(w: OpeningWall): OpeningWall {
  if (w === '+x') return '-x'
  if (w === '-x') return '+x'
  if (w === '+z') return '-z'
  return '+z'
}

/**
 * Split one room wall into 0–2 wall AABBs based on the openings on it.
 * Wall thickness is added so the segment becomes a thin AABB rather than a
 * zero-volume plane.
 */
function wallSegmentsForWall(
  room: StationRoomJson,
  wall: OpeningWall,
  openings: StationOpeningJson[],
): StationWallAabb[] {
  const [w, , d] = room.size
  const [ox, , oz] = room.origin

  // Coordinates of the wall plane and its perpendicular span.
  let plane: number
  let perpMin: number
  let perpMax: number
  const axisIsX = wall === '+x' || wall === '-x'
  if (wall === '+x') {
    plane = ox + w
    perpMin = oz
    perpMax = oz + d
  } else if (wall === '-x') {
    plane = ox
    perpMin = oz
    perpMax = oz + d
  } else if (wall === '+z') {
    plane = oz + d
    perpMin = ox
    perpMax = ox + w
  } else {
    plane = oz
    perpMin = ox
    perpMax = ox + w
  }

  // Sort openings by their start along the wall and build covered intervals
  // in the perpendicular axis. `offset` is centre-from-wall-centre.
  const wallCenter = (perpMin + perpMax) / 2
  const intervals = openings
    .map((o) => {
      const c = wallCenter + o.offset
      return { min: c - o.width / 2, max: c + o.width / 2 }
    })
    .sort((a, b) => a.min - b.min)

  // Walk the wall from perpMin to perpMax, emitting segments between
  // intervals. Each emitted segment becomes a thin AABB on the wall plane.
  const segments: { min: number; max: number }[] = []
  let cursor = perpMin
  for (const iv of intervals) {
    if (iv.min > cursor) segments.push({ min: cursor, max: iv.min })
    cursor = Math.max(cursor, iv.max)
  }
  if (cursor < perpMax) segments.push({ min: cursor, max: perpMax })

  return segments.map((s) => {
    if (axisIsX) {
      return {
        minX: plane - WALL_THICKNESS / 2,
        maxX: plane + WALL_THICKNESS / 2,
        minZ: s.min,
        maxZ: s.max,
      }
    }
    return {
      minX: s.min,
      maxX: s.max,
      minZ: plane - WALL_THICKNESS / 2,
      maxZ: plane + WALL_THICKNESS / 2,
    }
  })
}

/**
 * Build a Three.js group of meshes for the level: floor, ceiling, and the
 * wall AABBs (drawn as box geometry) per room, plus per-room ambient tint.
 * The actual exit-hatch mesh is owned by {@link StationHatchController} and
 * is added to the scene separately by the view controller.
 *
 * @param level - Validated JSON.
 * @param geometry - Pre-computed collider geometry.
 */
export function buildStationMeshes(
  level: StationLevelJson,
  geometry: StationColliderGeometry,
): THREE.Group {
  const group = new THREE.Group()
  group.name = `station:${level.id}`

  for (const room of level.rooms) {
    const mat = level.materials[room.material]!
    group.add(buildRoomFloorMesh(room, mat))
    group.add(buildRoomCeilingMesh(room, mat))
  }

  for (const wall of geometry.walls) {
    group.add(buildWallMesh(wall))
  }

  return group
}

function buildRoomFloorMesh(room: StationRoomJson, mat: StationMaterialJson): THREE.Mesh {
  const [w, , d] = room.size
  const [ox, oy, oz] = room.origin
  const geo = new THREE.PlaneGeometry(w, d)
  const m = new THREE.MeshStandardMaterial({ color: mat.floor, roughness: 0.85 })
  const mesh = new THREE.Mesh(geo, m)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(ox + w / 2, oy, oz + d / 2)
  mesh.receiveShadow = true
  return mesh
}

function buildRoomCeilingMesh(room: StationRoomJson, mat: StationMaterialJson): THREE.Mesh {
  const [w, h, d] = room.size
  const [ox, oy, oz] = room.origin
  const geo = new THREE.PlaneGeometry(w, d)
  const m = new THREE.MeshStandardMaterial({ color: mat.ceiling, roughness: 0.9 })
  const mesh = new THREE.Mesh(geo, m)
  mesh.rotation.x = Math.PI / 2
  mesh.position.set(ox + w / 2, oy + h, oz + d / 2)
  return mesh
}

function buildWallMesh(wall: StationWallAabb): THREE.Mesh {
  const w = wall.maxX - wall.minX
  const d = wall.maxZ - wall.minZ
  const h = 3
  const geo = new THREE.BoxGeometry(Math.max(w, 0.01), h, Math.max(d, 0.01))
  const m = new THREE.MeshStandardMaterial({ color: 0x5a4a3e, roughness: 0.85 })
  const mesh = new THREE.Mesh(geo, m)
  mesh.position.set(
    (wall.minX + wall.maxX) / 2,
    h / 2,
    (wall.minZ + wall.maxZ) / 2,
  )
  mesh.castShadow = false
  mesh.receiveShadow = true
  return mesh
}

/**
 * Load a parsed station JSON into a complete `StationLevel`.
 *
 * @param level - Validated JSON.
 */
export function loadStationLevel(level: StationLevelJson): StationLevel {
  validateStationLevel(level)
  const geometry = buildStationColliderGeometry(level)
  const collider = new StationCollider(geometry.floors, geometry.walls)
  const group = buildStationMeshes(level, geometry)

  const spawnPos = new THREE.Vector3(level.spawn.pos[0], level.spawn.pos[1], level.spawn.pos[2])
  const hatchRoom = level.rooms.find((r) => r.id === level.exitHatch.room)!
  const hatchPos = hatchAnchorWorldPosition(hatchRoom, level.exitHatch.wall, level.exitHatch.centerY)
  const hatchYaw = hatchFacingYaw(level.exitHatch.wall)

  return { group, collider, spawnPos, spawnYaw: level.spawn.yaw, hatchPos, hatchYaw }
}

function hatchAnchorWorldPosition(
  room: StationRoomJson,
  wall: OpeningWall,
  centerY: number,
): THREE.Vector3 {
  const [w, , d] = room.size
  const [ox, oy, oz] = room.origin
  const cx = ox + w / 2
  const cz = oz + d / 2
  if (wall === '+x') return new THREE.Vector3(ox + w, oy + centerY, cz)
  if (wall === '-x') return new THREE.Vector3(ox, oy + centerY, cz)
  if (wall === '+z') return new THREE.Vector3(cx, oy + centerY, oz + d)
  return new THREE.Vector3(cx, oy + centerY, oz)
}

function hatchFacingYaw(wall: OpeningWall): number {
  // The hatch sits on a wall and faces into the room.
  if (wall === '+x') return -Math.PI / 2
  if (wall === '-x') return Math.PI / 2
  if (wall === '+z') return Math.PI
  return 0
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/station/__tests__/StationLevelLoader.spec.ts`
Expected: all 8 tests PASS.

- [ ] **Step 5: Lint**

Run: `bun lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/station/StationLevelLoader.ts src/lib/station/__tests__/StationLevelLoader.spec.ts
git commit -m "feat(station): add StationLevelLoader with validation + collider geometry"
```

---

## Task 6: `stationRouteAccess` guard — TDD

**Files:**
- Create: `src/lib/station/stationRouteAccess.ts`
- Create: `src/lib/station/__tests__/stationRouteAccess.spec.ts`

For pass 1, the guard accepts entry when:
- `dev=true` is in the query, OR
- `station` query param is a known station id (we ship only `yamada-titania`).

The "active dock prompt" check is deferred until the contract wires up — keeping this simple lets the dev-spawn path work end-to-end now.

- [ ] **Step 1: Write failing tests**

```ts
/**
 * Tests for the /station route guard.
 *
 * @author guinetik
 * @date 2026-05-12
 */
import { describe, it, expect } from 'vitest'
import { canAccessStationRoute } from '../stationRouteAccess'

describe('canAccessStationRoute', () => {
  it('allows entry when dev=true is set', () => {
    expect(canAccessStationRoute({ dev: 'true', station: 'yamada-titania' })).toBe(true)
  })

  it('allows entry for a known station id', () => {
    expect(canAccessStationRoute({ station: 'yamada-titania' })).toBe(true)
  })

  it('denies entry when station id is unknown', () => {
    expect(canAccessStationRoute({ station: 'mystery' })).toBe(false)
  })

  it('denies entry when station param is missing', () => {
    expect(canAccessStationRoute({})).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/station/__tests__/stationRouteAccess.spec.ts`
Expected: FAIL with "Cannot find module '../stationRouteAccess'".

- [ ] **Step 3: Implement the guard**

```ts
/**
 * Guards the /station route: allows entry when `dev=true` or when the
 * `station` query param matches a known station-interior level id.
 *
 * The contract-driven dock-prompt check will be added when the Yamada
 * contract wires up — until then, any known station id is accepted so the
 * dev-spawn flow works end-to-end.
 *
 * @author guinetik
 * @date 2026-05-12
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */
import type { LocationQuery } from 'vue-router'

/** Set of station-interior level ids the router will let the player enter. */
const KNOWN_STATION_IDS: ReadonlySet<string> = new Set(['yamada-titania'])

/**
 * Pull the first scalar value for a given query key. Returns the empty
 * string when the key is missing or the value is an empty array.
 *
 * @param q - Vue-router query object.
 * @param key - Query key.
 */
function firstString(q: LocationQuery, key: string): string {
  const v = q[key]
  if (Array.isArray(v)) return v[0] ?? ''
  if (typeof v === 'string') return v
  return ''
}

/**
 * Whether navigation to `/station` is allowed.
 *
 * @param query - Route query (`to.query`).
 */
export function canAccessStationRoute(query: LocationQuery): boolean {
  if (firstString(query, 'dev') === 'true') return true
  const id = firstString(query, 'station')
  return id !== '' && KNOWN_STATION_IDS.has(id)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/station/__tests__/stationRouteAccess.spec.ts`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/station/stationRouteAccess.ts src/lib/station/__tests__/stationRouteAccess.spec.ts
git commit -m "feat(station): add /station route guard"
```

---

## Task 7: Register `/station` route

**Files:**
- Modify: `src/router/index.ts`

- [ ] **Step 1: Add the route and guard branch**

Edit `src/router/index.ts` to import the new guard and register `/station`.

```ts
import { createRouter, createWebHistory } from 'vue-router'
import { canAccessLevelRoute } from '@/lib/level/levelRouteAccess'
import { canAccessStationRoute } from '@/lib/station/stationRouteAccess'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'map',
      component: () => import('@/views/MapView.vue'),
    },
    {
      path: '/shuttle',
      name: 'shuttle',
      component: () => import('@/views/ShuttleView.vue'),
    },
    {
      path: '/lander',
      name: 'lander',
      component: () => import('@/views/LanderView.vue'),
    },
    {
      path: '/fps',
      name: 'fps',
      component: () => import('@/views/FpsView.vue'),
    },
    {
      path: '/level',
      name: 'level',
      component: () => import('@/views/LevelView.vue'),
    },
    {
      path: '/station',
      name: 'station',
      component: () => import('@/views/StationView.vue'),
    },
  ],
})

router.beforeEach((to) => {
  if (to.name === 'level') {
    return canAccessLevelRoute(to.query) ? true : { name: 'map' }
  }
  if (to.name === 'station') {
    return canAccessStationRoute(to.query) ? true : { name: 'map' }
  }
  return true
})

export default router
```

- [ ] **Step 2: Verify type-check passes**

Run: `bun run type-check`
Expected: 0 errors. (Note: `StationView.vue` does not exist yet, but Vue Router uses a lazy import so this only fails at runtime — and we'll create the file in Task 11 before manual verification.)

- [ ] **Step 3: Commit**

```bash
git add src/router/index.ts
git commit -m "feat(router): register /station route with guard"
```

---

## Task 8: `FpsPlayerController` accepts `FpsGroundSource`

The existing controller takes a `Heightmap`. We add a small interface so it can also take a `StationCollider`. When the source provides `resolveLateralMove`, lateral collision resolution is used. Hover stays available unless explicitly disabled by the caller.

**Files:**
- Modify: `src/three/FpsPlayerController.ts`

- [ ] **Step 1: Read the current constructor and tick path**

Run: `bun --bun grep -n "heightmap" src/three/FpsPlayerController.ts | head -40`
Note the line numbers where the heightmap is read for ground height and (if present) where lateral position is updated each tick.

- [ ] **Step 2: Add the interface, change the parameter, route reads through it**

Near the imports of `FpsPlayerController.ts`, add:

```ts
/**
 * Minimal ground/collision source for the FPS player. The terrain scene
 * passes a `Heightmap` and gets only `groundedYAt`; the station scene
 * passes a `StationCollider` which also resolves lateral wall collisions.
 *
 * @author guinetik
 * @date 2026-05-12
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */
export interface FpsGroundSource {
  /** Floor surface Y at the given (x, z). */
  groundedYAt(x: number, z: number): number
  /**
   * Optional lateral collision resolver. When present, the controller
   * pipes the player's desired (x, z) through it after applying input,
   * so walls block movement.
   */
  resolveLateralMove?(
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
    radius: number,
  ): { x: number; z: number }
}
```

The `Heightmap` class needs `groundedYAt(x, z)` to satisfy the interface. If it currently exposes `heightAt(x, z)`, add a wrapper:

```ts
// In src/lib/terrain/heightmap.ts (if not already present):
/** Adapter for the FpsGroundSource interface. */
groundedYAt(x: number, z: number): number {
  return this.heightAt(x, z)
}
```

In `FpsPlayerController`, change the constructor parameter type from `Heightmap` to `FpsGroundSource`, replace every internal call from `this._heightmap.heightAt(x, z)` to `this._ground.groundedYAt(x, z)`, and after the post-input (x, z) is computed each tick, route it through the optional resolver:

```ts
// inside the per-tick lateral update, after the player's desired (x, z) is computed:
if (this._ground.resolveLateralMove) {
  const before = this.group.position
  const resolved = this._ground.resolveLateralMove(
    before.x,
    before.z,
    nextX,
    nextZ,
    PLAYER_RADIUS,
  )
  nextX = resolved.x
  nextZ = resolved.z
}
this.group.position.set(nextX, nextY, nextZ)
```

Use the existing player-radius constant in the file (or add one at the top if not present):

```ts
/** Player capsule radius used for wall collision in station-interior scenes. */
const PLAYER_RADIUS = 0.4
```

- [ ] **Step 3: Add `groundedYAt` to `Heightmap` if missing**

Run: `bun --bun grep -n "groundedYAt" src/lib/terrain/heightmap.ts`
If no results, add the wrapper method shown in Step 2 to `src/lib/terrain/heightmap.ts`.

- [ ] **Step 4: Type-check + run existing tests**

Run: `bun run type-check && bun test:unit`
Expected: 0 errors; all existing tests still pass. The `/fps` route, `/level` route, and habitat must still compile and behave identically because they pass a `Heightmap` whose `resolveLateralMove` is undefined.

- [ ] **Step 5: Smoke-test `/fps` manually**

Run: `bun dev`
Visit `/fps?flat`. Verify movement, jump, and ground tracking behave as before.

- [ ] **Step 6: Commit**

```bash
git add src/three/FpsPlayerController.ts src/lib/terrain/heightmap.ts
git commit -m "feat(fps): FpsPlayerController accepts FpsGroundSource for wall collision"
```

---

## Task 9: `StationHatchController`

Submarine pressure hatch with F-prompt, knob-spin animation, and an `onExit` callback. Constants mirror the habitat hatch.

**Files:**
- Create: `src/three/StationHatchController.ts`

- [ ] **Step 1: Implement the controller**

```ts
/**
 * Submarine pressure hatch placed in the station entry foyer. Shows an
 * "F to Leave" prompt within range, spins the knob over a fixed duration
 * when the player presses F, then fires `onExit` once the spin finishes.
 *
 * Mirrors the visual style of the habitat hatch
 * (see `HabitatInteriorScene.ts:400+`) so the player reads it as the
 * same kind of object.
 *
 * @author guinetik
 * @date 2026-05-12
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'

const HATCH_DOOR_RADIUS = 0.66
const HATCH_DOOR_THICKNESS = 0.06
const HATCH_DOOR_SEGMENTS = 48
const HATCH_FRAME_RING_RADIUS = HATCH_DOOR_RADIUS + 0.12
const HATCH_FRAME_TUBE_RADIUS = 0.12
const HATCH_KNOB_RING_RADIUS = 0.19
const HATCH_KNOB_TUBE_RADIUS = 0.045
const HATCH_KNOB_SPOKE_LENGTH = HATCH_KNOB_RING_RADIUS * 2
const HATCH_KNOB_SPOKE_THICKNESS = 0.045
const HATCH_DOOR_SURFACE_OFFSET = 0.05
const HATCH_KNOB_Z_BIAS = HATCH_DOOR_THICKNESS / 2 + 0.02
const HATCH_DOOR_COLOR = 0xeaeaea
const HATCH_FRAME_COLOR = 0x9aa3ad
const HATCH_KNOB_COLOR = 0xf2c438
/** XZ proximity (world units) at which the "F Exit" hatch prompt appears. */
export const HATCH_INTERACT_DISTANCE = 1.8
/** Seconds the wheel-knob spin animation lasts. */
const HATCH_KNOB_SPIN_DURATION_S = 0.7
/** Full rotations the knob makes during the spin. */
const HATCH_KNOB_SPIN_TURNS = 2

/** Options for {@link StationHatchController}. */
export interface StationHatchControllerOptions {
  /** World-space hatch centre (returned by the level loader). */
  position: THREE.Vector3
  /** Yaw in radians; 0 = facing +Z. */
  yaw: number
  /** Fired once when the knob-spin animation completes. */
  onExit: () => void
}

/**
 * Three.js controller for the station exit hatch.
 *
 * Owns the meshes (door, frame, wheel-knob) and the spin animation. The
 * view controller is responsible for proximity detection and for calling
 * {@link triggerExit} when the player presses F within range.
 */
export class StationHatchController implements Tickable {
  /** Root group. Add to the scene. */
  readonly group: THREE.Group
  private readonly _knob: THREE.Group
  private readonly _onExit: () => void
  private _spinTime = -1
  private _exitFired = false

  constructor(opts: StationHatchControllerOptions) {
    this._onExit = opts.onExit
    this.group = new THREE.Group()
    this.group.position.copy(opts.position)
    this.group.rotation.y = opts.yaw

    // Door disc.
    const door = new THREE.Mesh(
      new THREE.CylinderGeometry(
        HATCH_DOOR_RADIUS,
        HATCH_DOOR_RADIUS,
        HATCH_DOOR_THICKNESS,
        HATCH_DOOR_SEGMENTS,
      ),
      new THREE.MeshStandardMaterial({ color: HATCH_DOOR_COLOR, roughness: 0.6 }),
    )
    door.rotation.x = Math.PI / 2
    door.position.z = HATCH_DOOR_SURFACE_OFFSET
    this.group.add(door)

    // Frame ring.
    const frame = new THREE.Mesh(
      new THREE.TorusGeometry(HATCH_FRAME_RING_RADIUS, HATCH_FRAME_TUBE_RADIUS, 16, 48),
      new THREE.MeshStandardMaterial({ color: HATCH_FRAME_COLOR, roughness: 0.5, metalness: 0.4 }),
    )
    this.group.add(frame)

    // Knob: torus + crossed spokes.
    this._knob = new THREE.Group()
    this._knob.position.z = HATCH_KNOB_Z_BIAS
    const knobMat = new THREE.MeshStandardMaterial({
      color: HATCH_KNOB_COLOR,
      roughness: 0.45,
      metalness: 0.3,
    })
    const knobRing = new THREE.Mesh(
      new THREE.TorusGeometry(HATCH_KNOB_RING_RADIUS, HATCH_KNOB_TUBE_RADIUS, 12, 32),
      knobMat,
    )
    this._knob.add(knobRing)
    const spokeA = new THREE.Mesh(
      new THREE.BoxGeometry(HATCH_KNOB_SPOKE_LENGTH, HATCH_KNOB_SPOKE_THICKNESS, HATCH_KNOB_SPOKE_THICKNESS),
      knobMat,
    )
    const spokeB = spokeA.clone()
    spokeB.rotation.z = Math.PI / 2
    this._knob.add(spokeA)
    this._knob.add(spokeB)
    this.group.add(this._knob)
  }

  /**
   * Begin the spin animation. The exit callback fires when the spin
   * completes. Repeated calls while a spin is in progress are ignored.
   */
  triggerExit(): void {
    if (this._spinTime >= 0) return
    this._spinTime = 0
    this._exitFired = false
  }

  /** Animate the knob spin. */
  tick(dt: number): void {
    if (this._spinTime < 0) return
    this._spinTime += dt
    const t = Math.min(this._spinTime / HATCH_KNOB_SPIN_DURATION_S, 1)
    this._knob.rotation.z = t * HATCH_KNOB_SPIN_TURNS * Math.PI * 2
    if (t >= 1 && !this._exitFired) {
      this._exitFired = true
      this._onExit()
    }
  }

  /** Dispose meshes. */
  dispose(): void {
    this.group.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.geometry.dispose()
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) {
        if (m) m.dispose()
      }
    })
  }
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `bun run type-check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/three/StationHatchController.ts
git commit -m "feat(station): add StationHatchController with knob-spin exit"
```

---

## Task 10: `StationViewController`

Wires it all up. Reuses `FpsCamera`, `FpsPlayerController` (no hover), `FpsAudioDirector`, `FpsPointerLockSession`, `GameLoop`, `TickHandler`. No multitool, no enemies.

**Files:**
- Create: `src/views/StationViewController.ts`

- [ ] **Step 1: Implement the controller**

```ts
/**
 * Bridges Vue lifecycle to the station-interior FPS scene.
 *
 * Loads a data-driven station JSON, builds floor/wall meshes and a
 * collider, drops in a gravity-walk FPS player, and places an exit hatch
 * that routes back to `/` when the player presses F within range.
 *
 * @author guinetik
 * @date 2026-05-12
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */
import type { Router } from 'vue-router'
import type { Tickable } from '@/lib/Tickable'
import { AmbientLight, Color, DirectionalLight, Vector3 } from 'three'
import { DevConsole } from '@/lib/devConsole'
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
import { FpsAudioDirector } from '@/audio/FpsAudioDirector'
import { FpsPointerLockSession } from '@/lib/fps/FpsPointerLockSession'
import { buildFpsPlayerConfig } from '@/lib/fps/buildFpsPlayerConfig'
import { loadStationLevel, type StationLevel } from '@/lib/station/StationLevelLoader'
import type { StationLevelJson } from '@/lib/station/types'
import {
  HATCH_INTERACT_DISTANCE,
  StationHatchController,
} from '@/three/StationHatchController'
import yamadaStation from '@/data/stations/yamada-station.json'

/** Catalog of bundled station-interior JSONs, keyed by `station` query param. */
const STATION_CATALOG: Record<string, StationLevelJson> = {
  'yamada-titania': yamadaStation as StationLevelJson,
}

const AMBIENT_LIGHT_INTENSITY_FALLBACK = 0.35
const DIR_LIGHT_INTENSITY = 0.6

/**
 * Vue lifecycle bridge for the `/station` route.
 */
export class StationViewController implements Tickable {
  private gameLoop: GameLoop | null = null
  private tickHandler: TickHandler | null = null
  private inputManager: InputManager | null = null
  private sceneManager: SceneManager | null = null
  private fpsCamera: FpsCamera | null = null
  private playerController: FpsPlayerController | null = null
  private level: StationLevel | null = null
  private hatch: StationHatchController | null = null
  private readonly fpsAudio = new FpsAudioDirector()
  private readonly pointerLock = new FpsPointerLockSession()
  private router: Router | null = null
  /** Reused scratch for hatch-proximity check. */
  private readonly _proximityScratch = new Vector3()

  /** Called when pointer lock state changes. */
  onPointerLockChange: ((locked: boolean) => void) | null = null

  /**
   * Mount the scene into the given container, loading the station id from
   * the URL query.
   *
   * @param container - HTML element to render into.
   * @param stationId - Station JSON id (from `?station=`).
   * @param router - Vue router used to navigate back to `/` on exit.
   */
  async init(container: HTMLElement, stationId: string, router: Router): Promise<void> {
    this.router = router
    const json = STATION_CATALOG[stationId]
    if (!json) {
      throw new Error(`Unknown station id: ${stationId}`)
    }

    const config = buildFpsPlayerConfig()

    this.inputManager = new InputManager(FPS_BINDINGS)
    this.tickHandler = new TickHandler()
    this.tickHandler.register(this.inputManager, TICK_PRIORITY_INPUT)

    this.sceneManager = new SceneManager()
    this.sceneManager.mount(container)

    // Level
    this.level = loadStationLevel(json)
    this.sceneManager.addToScene(this.level.group)

    // Lighting
    const ambient = new AmbientLight(
      new Color(json.ambient.color),
      json.ambient.intensity > 0 ? json.ambient.intensity : AMBIENT_LIGHT_INTENSITY_FALLBACK,
    )
    const dir = new DirectionalLight(0xffffff, DIR_LIGHT_INTENSITY)
    dir.position.set(0, 10, 0)
    this.sceneManager.addToScene(ambient)
    this.sceneManager.addToScene(dir)

    // Camera + player
    this.fpsCamera = new FpsCamera(config.camera)
    this.playerController = new FpsPlayerController(
      this.inputManager,
      this.fpsCamera,
      config,
      this.level.collider,
    )
    this.playerController.group.position.copy(this.level.spawnPos)
    // Spawn yaw drives the camera, not the player group:
    this.fpsCamera.applyMouseDelta(0, 0)
    this.sceneManager.addToScene(this.playerController.group)
    this.fpsCamera.setTarget(this.playerController.group)
    this.sceneManager.setActiveCamera(this.fpsCamera.camera)

    // Hatch
    this.hatch = new StationHatchController({
      position: this.level.hatchPos,
      yaw: this.level.hatchYaw,
      onExit: () => {
        void this.router?.push('/')
      },
    })
    this.sceneManager.addToScene(this.hatch.group)

    // Tick order
    this.tickHandler.register(this.playerController, TICK_PRIORITY_PHYSICS)
    this.tickHandler.register(this, TICK_PRIORITY_RENDER - 1)
    this.tickHandler.register(this.hatch, TICK_PRIORITY_RENDER - 1)
    this.tickHandler.register(this.fpsCamera, TICK_PRIORITY_RENDER - 2)
    this.tickHandler.register(this.sceneManager, TICK_PRIORITY_RENDER)

    this.setupPointerLock()

    DevConsole.register('StationView', {
      openDirect: (id = 'yamada-titania') => {
        void this.router?.push(`/station?station=${id}&dev=true`)
      },
    })

    this.fpsAudio.start()
    this.gameLoop = new GameLoop(this.tickHandler)
    this.gameLoop.start()
  }

  /** Per-frame proximity + interact check for the hatch. */
  tick(_dt: number): void {
    if (!this.playerController || !this.hatch || !this.level || !this.inputManager) return
    this._proximityScratch.copy(this.playerController.group.position)
    const d = this._proximityScratch.distanceTo(this.level.hatchPos)
    if (d < HATCH_INTERACT_DISTANCE && this.inputManager.wasActionPressed('beginMission')) {
      this.hatch.triggerExit()
    }

    if (this.fpsAudio && this.playerController) {
      this.fpsAudio.update(_dt, {
        grounded: this.playerController.grounded,
        sprinting: this.playerController.isSprinting,
        speed: this.playerController.speed,
        hovering: false,
        o2Level: this.playerController.o2Level,
        o2Capacity: this.playerController.o2Capacity,
      })
    }
  }

  /** Request pointer lock on the renderer canvas. */
  requestPointerLock(): void {
    this.pointerLock.requestLock()
  }

  private setupPointerLock(): void {
    const canvas = this.sceneManager!.renderer.domElement
    this.pointerLock.attach(canvas, {
      onMouseDelta: (mx, my) => this.fpsCamera?.applyMouseDelta(mx, my),
      onLockChange: (locked) => this.onPointerLockChange?.(locked),
    })
    this.pointerLock.requestLock()
  }

  /** Tear down the scene. */
  dispose(): void {
    DevConsole.unregister('StationView')
    this.gameLoop?.stop()
    this.hatch?.dispose()
    this.playerController?.dispose()
    this.fpsCamera?.dispose()
    this.pointerLock.releaseLock()
    this.pointerLock.detach()
    this.sceneManager?.dispose()
    this.inputManager?.dispose()
    this.fpsAudio.dispose()
  }
}
```

- [ ] **Step 2: Type-check**

Run: `bun run type-check`
Expected: 0 errors. If `FpsPlayerController` constructor signature complains about the `StationCollider` argument, double-check Task 8 was completed and that `StationCollider` implements `FpsGroundSource` (which it does — it has both `groundedYAt` and `resolveLateralMove`).

If `applyMouseDelta(0, 0)` is the wrong way to seed yaw, replace with the camera's actual yaw setter (whatever `FpsCamera` exposes; e.g. `setYaw(this.level.spawnYaw)`). Inspect `src/three/FpsCamera.ts` to pick the right method and adjust this single line.

- [ ] **Step 3: Commit**

```bash
git add src/views/StationViewController.ts
git commit -m "feat(station): add StationViewController wiring the interior scene"
```

---

## Task 11: `StationView.vue` minimal wrapper

**Files:**
- Create: `src/views/StationView.vue`

- [ ] **Step 1: Write the wrapper**

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { StationViewController } from './StationViewController'

const container = ref<HTMLElement | null>(null)
const controller = new StationViewController()
const route = useRoute()
const router = useRouter()

onMounted(async () => {
  if (!container.value) return
  const stationId = (Array.isArray(route.query.station) ? route.query.station[0] : route.query.station) ?? ''
  await controller.init(container.value, String(stationId), router)
})

onBeforeUnmount(() => {
  controller.dispose()
})

function onPointerDown() {
  controller.requestPointerLock()
}
</script>

<template>
  <div ref="container" class="station-view" @pointerdown="onPointerDown" />
</template>
```

Sibling CSS file (Tailwind `@apply` lives outside Vue per CLAUDE.md):

- [ ] **Step 2: Create the CSS file**

Create `src/views/StationView.css`:

```css
.station-view {
  @apply fixed inset-0 cursor-crosshair bg-black;
}
```

Import it from `src/assets/css/main.css`:

```css
/* in src/assets/css/main.css, with the other view imports */
@import './views/StationView.css';
```

Path note: `main.css` already imports view CSS via project convention — match the existing pattern. If imports live at a different relative path, follow whatever file path is already used by `LanderView.css` or `FpsView.css`.

- [ ] **Step 3: Type-check + lint**

Run: `bun run type-check && bun lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Smoke-test the route**

Run: `bun dev`. In the dev console: `AsteroidDev.StationView` may not yet exist (it's registered only after the controller mounts). Manually visit `http://localhost:<port>/station?station=yamada-titania&dev=true`. Expected: scene loads, you spawn in a brown-ish foyer, three archways are visible in front of you, and turning 180° reveals the hatch on the back wall.

- [ ] **Step 5: Commit**

```bash
git add src/views/StationView.vue src/views/StationView.css src/assets/css/main.css
git commit -m "feat(station): add StationView wrapper component"
```

---

## Task 12: Dock-panel dispatch in `MapView.vue`

The dock panel currently shows generic station info. When `dockTarget === 'station'`, pressing the "Begin" / "Dock" button must push `/station?station=<stationId>&contract=<contractId>`. For pass 1 the contract id may be missing — that's fine, the query param is optional.

**Files:**
- Modify: `src/views/MapView.vue` (find the dock-panel begin handler, near where it currently routes to `/level` for non-station dock targets)
- Modify: `src/views/MapViewController.ts` (expose pinned-asset metadata if not already on `onRequestDock`)

- [ ] **Step 1: Find the dock-panel "begin" handler**

Run: `bun --bun grep -n "dockedAsset" src/views/MapView.vue`
Run: `bun --bun grep -n "getActivePinnedAssets" src/views/MapView.vue src/views/MapViewController.ts`
Identify where the "begin docking" / "enter station" button's click handler lives. The dock panel today opens via `dockedAsset.value = { assetRef, label }` (see `MapView.vue:1158`). The button that completes the dock is the one to modify.

- [ ] **Step 2: Branch on `dockTarget` in the begin handler**

In `MapView.vue` where the dock-panel "begin" button calls `router.push('/level')` (or equivalent), look up the active pinned asset by `assetRef` via `contractSystem.getActivePinnedAssets()` and branch:

```ts
function onConfirmDock() {
  const asset = dockedAsset.value
  if (!asset) return
  const meta = getActivePinnedAssets().find((a) => a.assetRef === asset.assetRef)
  if (meta?.kind === 'station' && meta.dockTarget === 'station' && meta.stationId) {
    void router.push(`/station?station=${meta.stationId}`)
    return
  }
  void router.push('/level')
}
```

(Function names should match what's actually in the file — adjust the import/lookup to whatever the existing dock panel uses to find the active asset.)

- [ ] **Step 3: Type-check**

Run: `bun run type-check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/views/MapView.vue src/views/MapViewController.ts
git commit -m "feat(map): dock-panel routes to /station when dockTarget is set"
```

---

## Task 13: Dev-console hooks in `MapViewController`

Two commands so the route is testable before the contract exists.

**Files:**
- Modify: `src/views/MapViewController.ts`

- [ ] **Step 1: Find where `DevConsole.register('MapView', ...)` is called**

Run: `bun --bun grep -n "DevConsole.register" src/views/MapViewController.ts`
Note the line. We add two commands to the existing namespace registration.

- [ ] **Step 2: Add `spawnYamadaStation` and `openYamadaStation`**

Inside the existing `DevConsole.register('MapView', { ... })` block, add:

```ts
spawnYamadaStation: () => {
  const scene = this.sceneObjects?.scene
  if (!scene) {
    console.warn('[MapView.spawnYamadaStation] scene not ready')
    return
  }
  const assetRef = 'yamada-titania-station'
  if (this.pinnedStationControllers.has(assetRef)) {
    console.info('[MapView.spawnYamadaStation] already spawned')
    return
  }
  const ctrl = new PinnedStationController({
    scene,
    modelPath: 'models/station.glb',
    positionSeed: 'yamada-titania-station',
  })
  this.pinnedStationControllers.set(assetRef, ctrl)
  this._devSpawnedStations.set(assetRef, {
    assetRef,
    kind: 'station',
    region: 'uranian-system',
    label: 'YAMADA TITANIA',
    modelPath: 'models/station.glb',
    positionSeed: 'yamada-titania-station',
    dockTarget: 'station',
    stationId: 'yamada-titania',
  })
  console.info('[MapView.spawnYamadaStation] at', ctrl.getWorldPosition().toArray())
},
openYamadaStation: () => {
  void this.router?.push('/station?station=yamada-titania&dev=true')
},
```

- [ ] **Step 3: Add the dev-spawned-stations registry and merge into pinned-asset metadata**

Near the other private fields on `MapViewController`:

```ts
/** Runtime-only pinned assets injected by dev-console commands. */
private readonly _devSpawnedStations = new Map<string, import('@/lib/contracts/contractTypes').PinnedAsset>()
```

Find where `getActivePinnedAssets()` is consumed for the dock proximity loop (around `MapViewController.ts:2380`) and merge dev-spawned entries:

```ts
const activeMeta = [...contractSystem.getActivePinnedAssets(), ...this._devSpawnedStations.values()]
```

Do the same wherever the dock-panel UI reads the asset list (the MapView.vue `getActivePinnedAssets` reference in Task 12 should pull from a helper on the controller that includes dev spawns).

- [ ] **Step 4: Make sure `this.router` is accessible**

If `MapViewController` doesn't already hold a router reference, add a setter the `MapView.vue` `onMounted` already calls (or pass the router on `init(...)`). If it does (look for `this.router` usage), nothing to do.

- [ ] **Step 5: Type-check + lint**

Run: `bun run type-check && bun lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/views/MapViewController.ts
git commit -m "feat(map): dev-console spawnYamadaStation + openYamadaStation"
```

---

## Task 14: End-to-end manual verification

No code in this task. Walk through both flows.

- [ ] **Step 1: Direct route works**

Run: `bun dev`
Visit `http://localhost:<port>/station?station=yamada-titania&dev=true`.
- Scene loads, no console errors.
- Player spawns in foyer facing the three archways.
- WASD + mouse moves the player; walls block movement; archways pass through.
- Walking into Margaret / Pig Ward / Listening rooms works; each has a distinct floor/wall tint.
- Returning to foyer and approaching the hatch on the back wall shows "F to leave" (HUD prompt or just F + proximity for now — the prompt UI can land later).
- Pressing F within `HATCH_INTERACT_DISTANCE` spins the knob and routes back to `/`.

- [ ] **Step 2: Dev-spawn-then-dock works**

Reload the page at `/`.
Open the browser console.
Run: `AsteroidDev.MapView.spawnYamadaStation()`
- Console logs the spawn world coords.
Run: `AsteroidDev.MapView.warp('uranus')` (or whatever brings the shuttle close to the printed coords).
- Approach the station until the dock F-prompt appears.
- Press F — dock panel opens.
- Confirm the dock — route changes to `/station?station=yamada-titania`.
- Same interior loads.

- [ ] **Step 3: Final lint + tests**

Run: `bun run type-check && bun lint && bun test:unit`
Expected: all green, 0 errors, 0 warnings.

- [ ] **Step 4: Commit any final tweaks**

If small adjustments were needed during manual verification (e.g. tweaking room coordinates in `yamada-station.json`), commit them:

```bash
git add -p
git commit -m "fix(station): tune yamada-titania foyer coordinates after playtest"
```

---

## Acceptance recap

- `/station?station=yamada-titania&dev=true` loads the interior.
- Foyer has three doorways forward + a hatch back; player can enter and return from each side room.
- Hatch spin → router back to `/`.
- `AsteroidDev.MapView.spawnYamadaStation()` plants a pinned station; flying to it shows the dock F-prompt; confirming the dock routes to the interior.
- `bun run type-check`, `bun lint`, `bun test:unit` all clean.
- No combat systems, weapons, enemies, or NPCs present.
