# Yamada Station Interior — Pass 1 Design

**Date:** 2026-05-12
**Status:** Approved (design only; implementation plan to follow)
**Scope:** Add a new pinned station object that the player can dock into and a new `/station` route that loads a data-driven FPS interior. No NPCs, no story wiring, no contract integration. Geometry + locomotion + exit hatch + dev-spawn only.

## Goal

The Yamada contract finale (`docs/inspo/yamada-practice-gdd.md`) ends with the player visiting an interior space and walking through three rooms (Margaret, Pig Ward, Listening). Long-term that interior carries Sumiko, narration, and an Enroll/Decline terminal. Before any of that, we need the substrate: a station you can dock into and walk around inside, in a custom data-driven room layout.

This pass builds the substrate. It does not implement the contract.

## Out of scope (deferred to a later pass)

- Sumiko NPC and her dialogue/pacing
- Props inside the three rooms (Margaret chamber, pig cylinders, neuron jars)
- Enroll/Decline choice terminal and `notifyChoiceMission` wiring
- Contract data (`yamada-uranus.json`) and contract-driven dock prompt
- Final station GLB art — we reuse the existing `models/station.glb`

## High-level architecture

```
/shuttle (MapView)                            /station (StationView)
─────────────────────                         ──────────────────────
PinnedStationController(yamada-titania-station)
  │
  │ proximity → dock F-prompt
  │ (dockTarget: 'station')
  ▼
router.push('/station?station=yamada-titania')
                                              StationViewController.init()
                                                StationLevelLoader.load(json)
                                                  → StationLevel { rooms, hatch, spawn }
                                                FpsCamera + FpsPlayerController (gravity-walk)
                                                StationCollider (replaces Heightmap)
                                                StationHatchController (F to leave)
                                                                │
                                                                │ knob spin → route('/')
                                                                ▼
                                              MapView resumes
```

## 1. Pinned station object (shuttle side)

Reuse `PinnedStationController` unchanged. Yamada gets its own seed:

- `modelPath: 'models/station.glb'` (same GLB as Ceres)
- `positionSeed: 'yamada-titania-station'`

The proximity loop in `MapViewController` already shows a dock F-prompt at any pinned station. We extend the dock-step dispatch with one new field on the pinned-asset descriptor:

```ts
interface PinnedStationAsset {
  // ...existing fields
  /** Route the dock prompt sends the player to. Defaults to 'level'. */
  dockTarget?: 'level' | 'station'
}
```

Ceres-shaped contracts keep working (default `'level'`). Yamada's pinned asset will eventually set `'station'`. For this pass the dev-spawn command (section 6) injects the asset with `dockTarget: 'station'` at runtime.

## 2. Route + handoff

- New route `/station` registered in `src/router/index.ts`:
  ```ts
  { path: '/station', name: 'station', component: () => import('@/views/StationView.vue') }
  ```
- New view pair: `src/views/StationView.vue` + `src/views/StationViewController.ts`. Mirrors the `FpsView` pair structure (markup + minimal bindings in `.vue`, all wiring in the controller).
- Query params:
  - `station` — required. Selects which `src/data/stations/*.json` to load.
  - `contract` — optional. Future-proof for when the contract wires up; ignored this pass.
  - `dev` — optional. Bypasses the router guard (see below).
- Router guard `canAccessStationRoute(query)`:
  - Allow if `dev=true` (dev-console direct jump).
  - Otherwise require an active dock prompt for the given `station` (parallels `canAccessLevelRoute`).
  - On reject, redirect to `/`.
- Exit is **not** `Esc`. Exit is the submarine hatch (section 4).

## 3. Data format

New file: `src/data/stations/yamada-station.json`. Schema:

```json
{
  "id": "yamada-titania",
  "spawn": { "room": "foyer", "pos": [0, 0, 0], "yaw": 0 },
  "exitHatch": { "room": "foyer", "wall": "-z", "centerY": 1.2 },
  "rooms": [
    {
      "id": "foyer",
      "size": [16, 3, 8],
      "origin": [0, 0, 0],
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
      "origin": [-5, 0, 12],
      "material": "yamada-margaret",
      "openings": [{ "to": "foyer", "wall": "-z", "offset": 0, "width": 2 }]
    },
    {
      "id": "pig-ward",
      "size": [16, 3, 12],
      "origin": [0, 0, 14],
      "material": "yamada-pig",
      "openings": [{ "to": "foyer", "wall": "-z", "offset": 0, "width": 2 }]
    },
    {
      "id": "listening",
      "size": [10, 3, 10],
      "origin": [5, 0, 13],
      "material": "yamada-listening",
      "openings": [{ "to": "foyer", "wall": "-z", "offset": 0, "width": 2 }]
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

Notes:

- `size: [w, h, d]` is in world units. `origin: [x, y, z]` is the room's minimum corner in world space.
- `openings` cut a 2m-wide × 2.5m-tall archway on the named wall, centred on `offset` along that wall's length. Both rooms on either side of an opening must declare it (consistency check at load time).
- `material` is a key into the `materials` block. Per-room tints make the rooms read as distinct spaces without props.
- `exitHatch.wall` is one of `+x|-x|+z|-z`. The hatch mesh is centred on that wall at `centerY`. Only one hatch per level.
- Final XYZ positions of openings and origins will be tuned at implementation time; the values above are illustrative.

## 4. Systems inside `StationViewController`

Lifted from `FpsViewController`, trimmed for an empty interior with no combat.

**Kept (reused as-is):**
- `SceneManager`
- `FpsCamera`
- `FpsPlayerController` (gravity-walk mode — hover/RTG disabled, multitool hidden; see section 5)
- `InputManager` with `FPS_BINDINGS`
- `FpsAudioDirector` (breathing, footsteps)
- `FpsPointerLockSession`
- `GameLoop` + `TickHandler` + tick priorities

**Removed (vs FpsView):**
- `ProjectileSystem`, `EnemyDirector`, `EnemyProjectileSystem`, all enemy controllers and pools
- `MultiToolController` + `MultiToolState`
- `TerrainGrid` + `Heightmap`
- `TargetDummyController`, `FpsHostageController`, debug `?viruses` / `?hostages` paths

**New (this pass):**
- `StationLevelLoader` — `src/lib/station/StationLevelLoader.ts`. Reads station JSON, returns a `StationLevel`:
  ```ts
  interface StationLevel {
    rooms: BuiltRoom[]            // Three.js Group per room
    collider: StationCollider     // collision AABBs
    spawn: { pos: Vector3, yaw: number }
    hatch: { pos: Vector3, yaw: number }
  }
  ```
  Builds floor/wall/ceiling planes with the per-room material tint. Cuts archways by emitting wall segments that skip the opening span. Validates that opposing openings match on both sides.
- `StationCollider` — `src/lib/station/StationCollider.ts`. Replaces `Heightmap.heightAt()` for the player. Provides:
  ```ts
  groundedYAt(x, z): number               // floor height at (x, z); falls back to current room floor
  resolveLateralMove(from, to, radius): Vector3   // slides against wall AABBs, allows opening pass-through
  ```
  Pure math, framework-free; testable under Vitest.
- `StationHatchController` — `src/three/StationHatchController.ts`. Submarine pressure hatch mesh (reuses the `HATCH_*` constants/feel from `HabitatInteriorScene.ts`). F-prompt within `HATCH_INTERACT_DISTANCE`, knob-spin animation over `HATCH_KNOB_SPIN_DURATION_S`, then `router.push('/')`.

**Modified:**
- `FpsPlayerController` gains a small ground-source interface so it can take either a `Heightmap` or a `StationCollider`:
  ```ts
  interface FpsGroundSource {
    groundedYAt(x: number, z: number): number
    resolveLateralMove?(from: Vector3, to: Vector3, radius: number): Vector3
  }
  ```
  Default behavior (terrain mode) is unchanged when a `Heightmap` is passed. When a `StationCollider` is passed, lateral collision resolution kicks in and hover is force-disabled.

## 5. Locomotion (gravity-walk mode)

Yamada is a built, occupied station. No EVA feel. Concretely:

- `FpsPlayerController.setHoverFuelSource(null)` and `disableHover()` to ensure the RTG-fed hover thrust cannot fire.
- `MultiToolController` is not instantiated. There is no weapon model on screen.
- WASD + mouselook + jump are the only inputs. Sprint stays as a `ThrusterSystem` charge (consistent with the rest of the game's power model).
- Footstep / breathing audio from `FpsAudioDirector` stays on.
- `FpsCamera` stays at the same eye height as the FPS scene.

## 6. Dev-console hooks

`AsteroidDev` commands gated on `import.meta.env.DEV` via `DevConsole.register`. Unregister on view dispose.

**`MapView.spawnYamadaStation()`** — registered by `MapViewController`:
- Instantiates a `PinnedStationController` with the Yamada seed.
- Inserts a runtime pinned-asset entry with `assetRef: 'yamada-titania-station'`, `dockTarget: 'station'`, `stationId: 'yamada-titania'` so the existing dock-prompt proximity loop picks it up.
- Logs the world-space coords (from `controller.getWorldPosition()`) so the user can warp the shuttle to it. Pairs with the existing `MapView.warp(...)` family.

**`MapView.openYamadaStation()`** (alias also registered as `StationView.openDirect(stationId)` once the station view mounts):
- `router.push('/station?station=yamada-titania&dev=true')`.
- The `dev=true` flag bypasses the router guard so the player can jump straight in without spawning the pinned asset.

Both commands stripped at build time in production.

## File layout

```
src/
  router/index.ts                            (+ /station route + guard)
  views/
    StationView.vue                          (new)
    StationViewController.ts                 (new)
  three/
    StationHatchController.ts                (new)
  lib/
    station/
      StationLevelLoader.ts                  (new)
      StationCollider.ts                     (new)
      stationRouteAccess.ts                  (new — canAccessStationRoute)
      __tests__/
        StationCollider.spec.ts              (new)
        StationLevelLoader.spec.ts           (new)
    fps/
      FpsPlayerController.ts                 (modified — accept FpsGroundSource)
  data/
    stations/
      yamada-station.json                    (new)
  views/MapViewController.ts                 (modified — devConsole hooks, dockTarget dispatch)
docs/superpowers/specs/
  2026-05-12-yamada-station-interior-design.md   (this file)
```

## Acceptance criteria

1. `bun run type-check` is clean.
2. `bun run lint` is clean (oxlint + eslint with `--max-warnings 0`).
3. `bun run test:unit` is green, including new tests for `StationCollider` (lateral collision + archway pass-through) and `StationLevelLoader` (JSON validation + opening symmetry).
4. From the dev console: `AsteroidDev.MapView.spawnYamadaStation()` adds a station to the map; flying to it shows a dock F-prompt; pressing F routes to `/station`.
5. `AsteroidDev.MapView.openYamadaStation()` jumps straight to `/station` and loads the foyer.
6. Inside `/station`: player spawns in the foyer facing the three archways, can walk into Margaret / Pig Ward / Listening, returns through the foyer, faces the hatch on the back wall, presses F → knob spins → route returns to `/`.
7. No combat systems, weapons, or enemies present in the build of `/station`.

## Open follow-ups (intentionally not in this pass)

- Sumiko NPC + walking-guide-vs-static decision (revisit when wiring contract).
- Props in each room (Margaret chamber, pig cylinders, neuron jars).
- Enroll/Decline terminal and `notifyChoiceMission` wiring.
- Contract data file (`src/data/contracts/yamada-uranus.json`) and giver/missions.
- Final station-exterior GLB (currently reusing Ceres's).
- Doors between rooms (currently archways; pacing pass may want gated doors).
