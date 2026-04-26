# Arrival Sequence — Asteroid Establishing Shot + Barycenter Park

**Author:** guinetik
**Date:** 2026-04-26
**Status:** Approved

## Problem

The level's asteroid is no longer a flat plane with craters — it's a real ellipsoidal GLB body (e.g. Bennu at `262×262×249` scaled by 1300, with a per-seed rotation lottery applied before the heightmap bake). Two consequences for the arrival cinematic in `src/three/ArrivalSequence.ts`:

1. **No establishing shot.** The cutscene cuts straight to the shuttle approaching, giving the player no moment to register the rock they're landing on.
2. **Floodlight cone can shoot into space.** The parked shuttle hovers 875 units above the lander spawn cell, and the spotlight cone (~29° half-angle, 900u range) splays past the asteroid's silhouette whenever `sampleSpawnOnSurface` picks a cell near the rock's edge, leaving the floodlight illuminating empty space instead of surface.

## Goals

- Add a 2-second silent beauty shot of the full asteroid before the shuttle approaches. Kubrick framing — static composition, slow push-in dolly.
- Guarantee the parked shuttle's floodlight cone always falls on rock by parking the shuttle at the asteroid's barycenter (world XZ origin, by GLB pipeline convention).
- Spawn the gameplay lander directly under the parked shuttle so the arrival-to-gameplay handoff is visually continuous.
- Keep mission objectives placed where they already are (clustered around a real on-surface cell elsewhere on the rock), so gameplay still has the *fly-from-spawn-to-waypoint* loop.

## Non-Goals

- Per-asteroid camera framing overrides for the establish phase. v1 ships one set of constants tuned for Bennu's bake size; later asteroids may need their own knobs but that's deferred.
- Reworking the exfil cutscene. Exfil already uses the parked-shuttle position as its origin and that position will simply move to the barycenter — no exfil-specific changes needed.
- Touching `PortalArrivalSequence.ts`. Out of scope.
- Wide-angle FOV swap during the establish phase (mentioned as a future tuning knob; not in v1).

## Architecture

### Phase order

`ArrivalPhase` gains a new leading state:

```
establish (NEW, 2.0s) → approach (6.0s) → flip (2.5s) → doors (2.5s) → detach (3.0s) → fadeout (1.5s) → done
```

`ARRIVAL_SEQUENCE_DURATION` becomes `2.0 + 15.5 = 17.5s`. `levelStateMachine` and any other consumers that read this constant pick up the new total automatically.

A new private `tickEstablish(dt: number)` method runs the dolly, then calls `nextPhase('approach')`. The transition is a hard cut — the existing `tickApproach` resets the camera to its own start frame on the next tick.

### Establish-phase camera

**Target:** the asteroid's barycenter at the surface — `(0, heightAt(0, 0), 0)` in world space. Computed once at the start of `tickEstablish` and stored as a private `Vector3`.

**Placement:** camera position lerps between two named cinematic-vector constants relative to the target:

```ts
const ESTABLISH_CAM_START_OFFSET = new THREE.Vector3(800, 600, -1200)
const ESTABLISH_CAM_END_OFFSET   = new THREE.Vector3(680, 510, -1020)
```

Both at the top of `ArrivalSequence.ts`, named per the no-magic-numbers rule. ~15% closer at end vs. start — a slow, intentional push-in. Eased with the existing `easeInOut` smoothstep.

**Lookat:** locked on the barycenter target for the full phase. No tilt or roll.

**Phase duration:** `PHASE_ESTABLISH_DURATION = 2.0` (new constant).

### Park-at-barycenter (the core change)

**`LevelViewController.ts:636`** changes from:

```ts
const landerSpawn = new Vector3(spawnX, groundY, spawnZ)
```

to (conceptually):

```ts
const barycenterY = this.heightmap.heightAt(0, 0)
const landerSpawn = new Vector3(0, barycenterY, 0)
```

This single substitution propagates through the existing logic:

- `ArrivalSequence` builds `shuttleStartPos`, `shuttleEndPos`, and the parked position from `landerSpawnTarget`. With the target at the barycenter, the approach path and parked hover position move to the asteroid's geometric top automatically.
- `parkShuttle()` (line 414) already uses `landerSpawnTarget` to place the shuttle. No internal change.
- The exfil floodlight ground anchor (line 916) reads `landerSpawnTarget.y` and continues to do the right thing — it just anchors under the new park spot.
- The detach-phase callback `onLanderDetach(worldPos)` fires with the barycenter, so `LanderController` places the gameplay lander directly under the shuttle's open bay.

**Floodlight robustness:** at world XZ origin on a centered, rotated GLB, the heightmap has surface in every direction within the cone radius (`~875 × tan(29°) ≈ 485u`). No cone rays escape into space.

**Removed from the lander-spawn path:**
- `sampleSpawnOnSurface` call (LevelViewController.ts:473) — no longer drives lander placement.
- `landerSpawnLightAlignmentX` offset (line 477) — removed from the lander path.

**Kept for objective placement:**
- `sampleSpawnOnSurface` is still called *separately* and its result is still passed to `resampleObjectiveNearShip` as the anchor. Mission objectives continue to cluster around a real on-surface cell *elsewhere* on the rock, so gameplay still has the fly-from-spawn-to-waypoint loop.
- `landerSpawnLightAlignmentX` continues to apply to that objective-anchor sample (preserving its existing meaning for sun-lit framing of the action area).

This deliberately splits *one* sampled point used for two purposes into *two* points: a fixed barycenter for the cutscene/lander, and a sampled cell for objectives.

### Initial camera at `load()`

`ArrivalSequence.load()` currently sets the camera to a wide establishing offset relative to `shuttleStartPos` (lines 297–302). That role moves into `tickEstablish` — its first tick overwrites the camera anyway, so `load()` can leave the camera at any reasonable default (or simply skip the explicit setup). No functional impact; just dead code to remove.

## Components affected

| File | Change |
|---|---|
| `src/three/ArrivalSequence.ts` | New `establish` phase + `tickEstablish` method. New phase-duration constant. Two new camera-offset constants. Updated `ARRIVAL_SEQUENCE_DURATION`. Initial-camera block in `load()` removed. |
| `src/views/LevelViewController.ts` | `landerSpawn` rebuilt from barycenter. `sampleSpawnOnSurface` call retained but only feeds `resampleObjectiveNearShip` (objective anchor), not the lander spawn. |
| `src/lib/level/__tests__/*.spec.ts` | Tests touching lander-spawn coords may need a heightmap stub where `heightAt(0, 0)` returns a sensible Y. To be confirmed during plan-writing. |

`PortalArrivalSequence.ts` is *not* touched.

## Data flow

```
LevelViewController.bootScene()
  ├── createAsteroidSurface() → heightmap (post-rotation)
  ├── barycenterY = heightmap.heightAt(0, 0)
  ├── landerSpawn = (0, barycenterY, 0)               ← barycenter
  ├── objectiveAnchor = sampleSpawnOnSurface(...)     ← real on-surface cell
  ├── for obj in mission.objectives:
  │     resampleObjectiveNearShip(obj, objectiveAnchor, ...)
  ├── arrivalSequence = new ArrivalSequence(landerSpawn)
  └── arrivalSequence.tick(dt) drives:
        establish (2.0s) — camera dollies on barycenter, asteroid silent
        ↓ hard cut
        approach   — shuttle flies to (0, barycenterY + 800, -60)
        flip       — shuttle inverts
        doors      — cargo bay opens
        detach     — lander released; gravity-falls toward barycenter
        fadeout    — fade to black
        done       — gameplay starts; lander sits at (0, barycenterY, 0)
                     under parked shuttle at (0, barycenterY + 875, 0)
                     floodlight cone fully on rock
```

## Testing

- Unit-test scope is limited because `ArrivalSequence` is a Three.js orchestrator. The relevant unit assertions:
  - `ARRIVAL_SEQUENCE_DURATION === 17.5` (sanity check on phase totals).
  - The level state machine timer expects the new total.
- Manual verification (no automated test):
  - Open `/level` with a fresh asteroid seed; first 2s shows the rock dollying in, then cuts to the shuttle approach.
  - Cycle a few seeds; the parked shuttle's floodlight cone visibly hits surface in every case (no beam disappearing into starfield).
  - Lander appears under the shuttle when the fade clears, regardless of where mission objectives spawned.
- Existing tests in `src/lib/level/__tests__/*` to be audited during plan-writing for any hardcoded lander-spawn coordinates.

## Risks

- **Heightmap edge case at (0, 0):** if a future asteroid GLB has its pivot offset from the body, `heightAt(0, 0)` could return a void cell or a flank value. Mitigation: the spec assumes the GLB pipeline guarantees centered pivots, as confirmed by the user. If the assumption breaks, fall back to bounding-box centroid (Approach B from brainstorming).
- **Exfil framing:** the exfil cutscene's camera offsets are tuned around the parked-shuttle world position. With that position now at the barycenter rather than a sampled spawn, the existing camera shots should continue to work (they're relative to the shuttle), but a manual review of the exfil cutscene framing is part of the verification step.
- **Gameplay lander immediately under cargo bay:** if the doors close on top of the lander or the parked shuttle's belly clips the lander, `LANDER_PARK_ALTITUDE_OFFSET = 875` may need a small bump. Tunable; not a blocker.
