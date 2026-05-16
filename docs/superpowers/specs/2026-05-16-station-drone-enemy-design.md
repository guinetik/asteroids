# Station Patrol Drone — Enemy Design

- **Status:** Approved (author-orchestrated, single-session execution)
- **Author:** guinetik (orchestrated by Claude)
- **Date:** 2026-05-16
- **Related code:** `src/three/TurretController.ts`, `src/three/TurretModel.ts`, `src/three/StationTurretDirector.ts`, `src/lib/fps/`, `src/lib/station/StationLayout.ts`, `public/data/stations/*.json`

## Goal

Add a floating patrol drone enemy inside station rooms. Drones complement the doorway turrets: turrets watch chokepoints, drones own room interiors. Per-room JSON toggle, per-room count scaling with room size, single shared laser-projectile pipeline with turrets.

## Visual reference

Sketchfab GLB `3d/drone.glb` → `public/models/drone.glb` (≈80 KB optimized). One merged mesh, one `lambert1` material with cyan/red baked into the emissive texture map. The model is a small orb with a recessed face panel exposing three red eye lenses on one side. The face direction defines the muzzle.

## Scope

In:
- New domain modules under `src/lib/fps/drone/` (config, count-per-room, wander behavior, FSM) — pure TS, fully unit-tested.
- New `src/three/DroneModel.ts`, `src/three/DroneController.ts`, `src/three/StationDroneDirector.ts` — mirrors the turret trio.
- Per-room `drones?: boolean` field on `RoomSpec` and an optional top-level `drones?: DronesSpec` master switch.
- Reuse of `EnemyProjectileSystem` + `TurretLaserDartMeshPool` so player damage HUD + bolt-vs-enemy flow is unchanged.
- Two new SFX entries: `sfx.drone.laser`, `sfx.drone.destroyed` (reuse turret WAVs as placeholders — actual sound design out of scope).
- Wired into `StationViewController` next to `turretDirector`.

Out (deferred):
- Authored drone-specific sounds.
- New particle behaviors (reuse turret kill VFX with different palette).
- Drones reacting to noises / shared aggro across drones.
- Drones leaving their assigned room (they stay inside their patrol AABB).

## Tuning targets

| Lever | Turret | Drone | Why |
|---|---|---|---|
| `MAX_HP` | 200 | 120 | Easier to drop a single drone; rooms can have several. |
| `DART_DAMAGE` | 12 | 8 | Slower per-shot pressure than a turret burst. |
| `DART_SPEED` | 13 | 11 | Slightly easier to side-step. |
| `BURST_SHOT_COUNT` | 3 | 3 | Same burst feel. |
| `BURST_INTERVAL_SECONDS` | 0.18 | 0.30 | "Slower 3 burst" per spec. |
| `BURST_REST_SECONDS` | 4 | 5 | Longer cooldown between bursts. |
| `DETECT_RANGE` | 8 | 9 | Bigger room → drones can engage from further. |
| `FIRE_RANGE` | 7 | 8 | Drone holds slightly more distance. |
| `HIT_RADIUS` | 0.9 | 0.55 | Smaller silhouette. |

## Per-room spawn count

Room footprint in the live JSONs uses `width` × `depth` tile counts (`ROOM_TILE_SIZE = 3.85`). Drone count buckets by area in tiles (`width * depth`):

| Area (tiles) | Max drones |
|---|---|
| ≤ 2 | 0 |
| 3–4 | up to 2 |
| 5–6 | up to 3 |
| ≥ 7 | up to 4 |

Each drone slot rolls an independent uniform `[0, 1)` against `DRONE_SLOT_SPAWN_PROBABILITY = 0.7` so room density varies. JSON authors opt rooms in with `"drones": true` on the room spec. The top-level `drones.enabled` master defaults `true` so existing layouts only need to opt rooms in.

The 1×3-tile microwave-test rooms therefore land in the "up to 2" bucket; a hypothetical 3×3 hub falls in "up to 4". Matches spec verbatim.

## Domain modules (`src/lib/fps/drone/`)

All pure TS, no Three.js. Vitest specs co-located in `src/lib/fps/drone/__tests__/`.

### `droneConfig.ts`

Named constants for every tuning lever above plus VFX constants. No magic numbers leak into controllers.

### `droneCountForRoom.ts`

```
export function maxDronesForRoom(widthTiles: number, depthTiles: number): number
export function rollDroneCount(max: number, rng: () => number, probability?: number): number
```

`maxDronesForRoom` is a pure bucket function. `rollDroneCount` flips `max` independent coins. Tested with deterministic seeded RNG.

### `droneWanderBehavior.ts`

```
export interface DronePatrolRect { minX: number; maxX: number; minZ: number; maxZ: number; floorY: number }
export interface DroneWanderState { targetX: number; targetZ: number; bobPhase: number }
export interface DroneWanderInput { x: number; z: number; dt: number; rng: () => number }
export interface DroneWanderOutput { moveX: number; moveZ: number; bobY: number; reachedTarget: boolean }
export function makeInitialWanderState(rect, rng): DroneWanderState
export function tickWander(state, input, rect): DroneWanderOutput
```

Behavior: pick a random point inside the rect; steer toward it at `DRONE_PATROL_SPEED` until within `DRONE_ARRIVE_RADIUS`; on arrival or after `DRONE_REROLL_SECONDS`, pick a new target. Bob phase advances every tick and yields a sin-wave Y offset. Deterministic against an injected RNG.

### `droneFsm.ts`

```
type DroneState = 'patrolling' | 'alerting' | 'firing' | 'cooling' | 'dead'
class DroneFsm {
  state: DroneState
  tick(dt, distanceToPlayer, hasLineOfSight, isAlive): DroneIntent
}
interface DroneIntent {
  wantsToFire: boolean
  shouldFacePlayer: boolean
  shouldAlertColor: boolean
}
```

Transitions:

```
patrolling --[engageable && dist <= DETECT]--> alerting
alerting   --[ALERT_SECONDS elapsed]----------> firing
alerting/firing --[!engageable || dist > DETECT_HYS]--> cooling
cooling    --[COOLING_SECONDS elapsed && !player nearby]--> patrolling
*          --[!isAlive]----------------------> dead
```

`alerting` is a brief "color flips to red, drone yaws to face" beat before the first shot — gives the player a tell. Burst cadence in `firing` is computed by the same logic the turret uses (one-shot timer + inter-burst rest).

## Three.js layer

### `DroneModel.ts`

- Loads `/models/drone.glb` once per instance (later we can swap to a shared GLB cache; the turret does it per-instance today, mirror that for consistency).
- Applies `DRONE_SCALE` so the deployed model reads at ~0.55 m diameter — fits inside a 1×1-tile cell comfortably.
- Captures the loaded material as `bodyMaterial`, snapshots its base `color`, `emissive`, and `emissiveIntensity`. Alert color swap = lerp `emissive` from baseline cyan-tinted to `DRONE_ALERT_EMISSIVE_COLOR` (warm red).
- `DRONE_FACE_FORWARD` constant = local axis vector indicating which way the 3-eye face points. Determined by trial-and-error at runtime via a `DRONE_DEBUG_FORWARD_HELPER` flag that draws an arrow from origin along the candidate axis. Bone-aim from `TurretModel` is irrelevant here (no skeleton) — instead, the **whole group** yaws to face the target on the XZ plane, then the muzzle origin is computed as `group.position + (face_forward * DRONE_MUZZLE_OFFSET)`.
- Hover: model Y bobs with sin-wave around `DRONE_HOVER_HEIGHT`. Phase shared from the wander state so multiple drones don't bob in unison.
- Mirror turret hit-flash / destruction-flash / muzzle-flash plumbing exactly — same patterns, drone-tuned constants.

### `DroneController.ts`

Mirrors `TurretController` API exactly:

```
readonly model: DroneModel
readonly enemy: Enemy
onArmed / onDisarmed / onDestroyed / onKilled
tick(dt, playerX, playerY, playerZ)
setCollider(collider)
setPatrolRect(rect: DronePatrolRect)  // replaces setPatrolHalfSpace
placeAt(x, y, z, yaw)
dispose()
```

Drives the FSM, owns the wander state, computes LOS via the same `StationCollider` segment sampling (with a smaller near-skip since drones aren't mounted to walls), spawns darts into `EnemyProjectileSystem`. Death animation is just "drop velocity + spin + fade then dispose" — no GLB anim clip exists. A 0.4 s "tumble" beat before VFX-and-dispose.

### `StationDroneDirector.ts`

Mirrors `StationTurretDirector`:

- Owns the shared `EnemyProjectileSystem` + `TurretLaserDartMeshPool` (we'll rename the pool's class comment to clarify it's used by both, but keep the type name to avoid churn — instances are visual-identical).
- Wait — to avoid coupling, the director takes the projectile system + dart pool from outside. The simplest wire is: have the turret director expose `projectiles` + `dartPool` (it already does — both `readonly`), and the drone director **shares** the turret director's instances. This avoids running two dart pools and keeps the alarm coordination centralized.
- Alarm SFX coordination — drones do **not** trigger `sfx.station.alarm` (turret-only by design); instead the first drone to arm plays a softer `sfx.drone.laser` on its first shot. No new alarm.
- `populateDronesInRooms(rooms, options)` iterates `RoomSpec`s, skips rooms whose `drones !== true`, computes the floor AABB via the same maths the room builder uses (`anchor ± (width|depth) * ROOM_TILE_SIZE / 2`, rotated by `yaw`), rolls drone count, places each drone at a random point inside the AABB at `STATION_CEILING_Y - DRONE_HOVER_DEPTH`.

### Pool sharing decision

Rather than introduce a new dart pool, **wire both directors to the same `EnemyProjectileSystem` instance** owned by the view controller, and let each director share a single `TurretLaserDartMeshPool`. Cleanest: extract the projectile/pool wiring into a `StationEnemyCombat` helper that both directors consume. **Decision: defer that helper.** For this PR we promote the turret director's `projectiles` + `dartPool` to be passed into the drone director's constructor. Director ownership stays with turret director (single source of truth for tick + dispose).

## Layout JSON delta

```jsonc
{
  "turrets": { "enabled": true },
  "drones":  { "enabled": true, "spawnProbability": 0.7 },
  "rooms": [
    { "id": "r-vault", "width": 3, "depth": 3, "drones": true, ... },
    { "id": "r-hub",   "width": 1, "depth": 3, "drones": true, ... }
  ]
}
```

`RoomSpec.drones?: boolean` and `StationLayout.drones?: DronesSpec` added to `src/lib/station/StationLayout.ts`. `DronesSpec` mirrors `TurretsSpec`.

`loadStationLayout` already passes unknown fields through; we add validation only for the new fields with sensible defaults.

## Testing strategy

`src/lib/fps/drone/__tests__/`:

- `droneCountForRoom.spec.ts` — bucket boundaries (2, 3, 4, 5, 6, 7, 100 tiles) + roll determinism with a stub RNG.
- `droneWanderBehavior.spec.ts` — initial state lies inside rect, ticks steer toward target, arrival triggers reroll, bob phase wraps, deterministic with stub RNG.
- `droneFsm.spec.ts` — every transition path; LOS gating; alerting beat fires once before firing; dead is terminal.

No Three.js tests (per CLAUDE.md ground rules).

## Risks / open guesses

- **Face axis unknown:** Drone GLB has no bones/anims and the merged geometry doesn't expose a "face" name. I'll start with `(0, 0, 1)` local-Z forward; if wrong, flip per `DRONE_FACE_FORWARD` constant. The drone wraps in an outer Three.js Group that we yaw freely, so the model's authored forward only matters relative to that group's local frame.
- **Emissive map swap fidelity:** Cyan→red shift via emissive tint will look "off-spec" on parts of the texture that aren't cyan. Acceptable trade-off; nothing in the spec demands the cyan rings turn red — visual cue is sufficient.
- **Shared pool ownership:** Drone director borrowing the turret director's pool is a small coupling. Acceptable for now; if a layout has `turrets.enabled: false` and drones enabled, we need to still own a pool. Handled by always constructing the turret director, even when its `populateFromEntrances` is gated off.

## Verification gates

1. `bun run type-check` — no TS errors.
2. `bun run lint` — oxlint + eslint clean (`--max-warnings 0`).
3. `bun run test:unit` — all green, new specs pass.
4. Self-review: dispatch `superpowers:code-reviewer` agent against the diff once complete.
