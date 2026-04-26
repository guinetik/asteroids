# Arrival Asteroid Establishing Shot + Barycenter Park — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 2-second beauty shot of the full asteroid before the shuttle approaches, and park the shuttle at the asteroid's barycenter so the floodlight cone always touches surface.

**Architecture:** A new `establish` phase prepended to `ArrivalSequence`'s timeline runs a slow dolly-in over the barycenter. Lander spawn (cinematic + gameplay) moves to world XZ origin, where the rotated GLB pivot guarantees rock under the parked shuttle. Mission objectives keep clustering around the existing `sampleSpawnOnSurface` cell, so the player still flies from spawn to waypoints.

**Tech Stack:** Vue 3 + Three.js + TypeScript + Vite, Vitest for unit tests, Bun for scripts.

**Spec:** `docs/superpowers/specs/2026-04-26-arrival-asteroid-establish-design.md`

---

## File Structure

| File | Role | Change |
|---|---|---|
| `src/three/ArrivalSequence.ts` | Cinematic state machine for arrival/exfil | New `establish` phase, new constants, `tickEstablish` method, removed `load()` initial-camera setup |
| `src/three/__tests__/ArrivalSequence.spec.ts` | New — duration sanity check | Create |
| `src/views/LevelViewController.ts` | Level boot orchestration | Lander/shuttle spawn switches to barycenter; objective placement unchanged |

No other files are touched. `levelStateMachine.ts` re-exports `ARRIVAL_SEQUENCE_DURATION` and picks up the new value automatically.

---

## Task 1: Add `establish` phase scaffolding to `ArrivalSequence`

**Files:**
- Modify: `src/three/ArrivalSequence.ts`
- Create: `src/three/__tests__/ArrivalSequence.spec.ts`

This task introduces the new phase as a *no-op pass-through* (it immediately advances to `approach` on the first tick). That keeps the cutscene visually unchanged so we can validate the timeline math, the type union, and the tests in isolation. Real camera motion lands in Task 2.

- [ ] **Step 1: Write a failing duration test**

Create `src/three/__tests__/ArrivalSequence.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ARRIVAL_SEQUENCE_DURATION } from '@/three/ArrivalSequence'

describe('ARRIVAL_SEQUENCE_DURATION', () => {
  it('includes the establish phase plus the original 15.5s timeline', () => {
    expect(ARRIVAL_SEQUENCE_DURATION).toBeCloseTo(17.5, 5)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test:unit src/three/__tests__/ArrivalSequence.spec.ts`
Expected: FAIL — actual value is `15.5`, not `17.5`.

- [ ] **Step 3: Add the establish-phase constants and update the union type**

In `src/three/ArrivalSequence.ts`, add the new phase-duration constant alongside the existing arrival durations (right after `PHASE_APPROACH_DURATION` at line 40):

```ts
/** Establishing beauty shot of the full asteroid before the shuttle approaches. */
const PHASE_ESTABLISH_DURATION = 2.0
/** Shuttle approaches from distance. */
const PHASE_APPROACH_DURATION = 6.0
```

Update `ARRIVAL_SEQUENCE_DURATION` to include the new phase (lines 51–56):

```ts
/** Total sequence duration. */
export const ARRIVAL_SEQUENCE_DURATION =
  PHASE_ESTABLISH_DURATION +
  PHASE_APPROACH_DURATION +
  PHASE_FLIP_DURATION +
  PHASE_DOORS_DURATION +
  PHASE_DETACH_DURATION +
  PHASE_FADEOUT_DURATION
```

Add `'establish'` to the `ArrivalPhase` union (line 125):

```ts
type ArrivalPhase = 'establish' | 'approach' | 'flip' | 'doors' | 'detach' | 'fadeout' | 'done'
```

Change the initial phase (line 153):

```ts
private phase: ArrivalPhase = 'establish'
```

- [ ] **Step 4: Add a no-op `tickEstablish` and wire it into `tick()`**

Add a stub method (place it just above `tickApproach` at line 485):

```ts
private tickEstablish(): void {
  const t = Math.min(1, this.phaseElapsed / PHASE_ESTABLISH_DURATION)
  if (t >= 1) this.nextPhase('approach')
}
```

Add `'establish'` to the `tick()` switch (around line 380):

```ts
switch (this.phase) {
  case 'establish':
    this.tickEstablish()
    break
  case 'approach':
    this.tickApproach()
    break
  // ...rest unchanged
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test:unit src/three/__tests__/ArrivalSequence.spec.ts`
Expected: PASS.

- [ ] **Step 6: Run type-check and full test suite**

Run: `bun run type-check && bun test:unit`
Expected: zero TS errors; all existing tests still green.

- [ ] **Step 7: Commit**

```bash
git add src/three/ArrivalSequence.ts src/three/__tests__/ArrivalSequence.spec.ts
git commit -m "$(cat <<'EOF'
feat(arrival): add establish phase scaffolding

Prepends a no-op establish phase to the arrival timeline. Camera motion
lands in the next commit; this commit only wires the phase, the union
type, the duration constant, and a duration sanity test.
EOF
)"
```

---

## Task 2: Implement the establish-phase camera dolly

**Files:**
- Modify: `src/three/ArrivalSequence.ts`

- [ ] **Step 1: Add the camera-offset constants**

Add at the top of `ArrivalSequence.ts`, alongside the other approach-path constants (around line 86, near `SHUTTLE_CINEMATIC_SCALE`):

```ts
/** Camera position offset from the barycenter at the start of the establish phase. */
const ESTABLISH_CAM_START_OFFSET = new THREE.Vector3(800, 600, -1200)
/** Camera position offset from the barycenter at the end of the establish phase. */
const ESTABLISH_CAM_END_OFFSET = new THREE.Vector3(680, 510, -1020)
```

- [ ] **Step 2: Replace the no-op `tickEstablish` with the real implementation**

Replace the stub from Task 1:

```ts
private tickEstablish(): void {
  const t = Math.min(1, this.phaseElapsed / PHASE_ESTABLISH_DURATION)
  const eased = this.easeInOut(t)

  const target = this.landerSpawnTarget
  const camPos = new THREE.Vector3().lerpVectors(
    ESTABLISH_CAM_START_OFFSET,
    ESTABLISH_CAM_END_OFFSET,
    eased,
  )
  this.camera.position.set(target.x + camPos.x, target.y + camPos.y, target.z + camPos.z)
  this.camera.lookAt(target)

  if (t >= 1) this.nextPhase('approach')
}
```

- [ ] **Step 3: Remove the old initial-camera setup from `load()`**

In `ArrivalSequence.load()`, delete lines 297–302 (the `// Initial camera: wide establishing shot...` block):

```ts
// DELETE THESE LINES:
// Initial camera: wide establishing shot, far behind and above the shuttle
this.camera.position.set(
  this.shuttleStartPos.x + 80,
  this.shuttleStartPos.y + 100,
  this.shuttleStartPos.z - 400,
)
this.camera.lookAt(this.shuttleStartPos)
```

`tickEstablish` overwrites the camera on the first tick anyway. Removing this block prevents a one-frame flash at the wrong framing.

- [ ] **Step 4: Run type-check and existing tests**

Run: `bun run type-check && bun test:unit`
Expected: zero TS errors; all tests green.

- [ ] **Step 5: Run lint**

Run: `bun lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Manual smoke test (one run)**

Run: `bun dev` and open `/level` (any seed). Observe:
- First ~2s: asteroid is centered in frame, camera does a slow push-in toward the rock. No shuttle visible.
- Then a hard cut to the shuttle approach (existing behavior).
- Cutscene reaches park + door-open as before.

If the establish framing looks too tight or too wide for the current asteroid scale, note the values you'd prefer and adjust `ESTABLISH_CAM_*_OFFSET` — they're the only knobs in this task.

- [ ] **Step 7: Commit**

```bash
git add src/three/ArrivalSequence.ts
git commit -m "$(cat <<'EOF'
feat(arrival): implement establish-phase dolly camera

2-second slow push-in on the asteroid barycenter before the shuttle
approach. Lerps between two named offset vectors with the existing
easeInOut smoothstep. Removes the redundant initial-camera setup from
load() — tickEstablish overwrites it on the first frame anyway.
EOF
)"
```

---

## Task 3: Park lander/shuttle at the barycenter

**Files:**
- Modify: `src/views/LevelViewController.ts`

This task decouples the cinematic/gameplay lander spawn from the sampled `spawnX, spawnZ` cell. Mission objectives, rock exclusions, and `claimedPositions` continue to use the original sampled cell so gameplay layout is untouched — the player still flies from the new spawn (under the parked shuttle at world origin) to wherever the existing pipeline puts the waypoints.

- [ ] **Step 1: Read the surrounding code to confirm where `spawnX`/`spawnZ`/`groundY` are used**

Run: `grep -n "spawnX\|spawnZ\|groundY" src/views/LevelViewController.ts`

Expected usages (to keep in mind for the next steps):
- Line ~477–479: definition of `spawnX`, `spawnZ`, `groundY`
- Line ~489: `claimedPositions = [{ x: spawnX, z: spawnZ }]` ← keep using sampled cell
- Line ~494: `{ x: spawnX, z: spawnZ }` passed to `resampleObjectiveNearShip` ← keep using sampled cell
- Line ~525: rock exclusion `{ x: spawnX, z: spawnZ, radius: ... }` ← keep using sampled cell
- Line ~582: `new Vector3(spawnX, groundY + ..., spawnZ)` for `gameplayStart` ← MOVE to barycenter
- Line ~636: `new Vector3(spawnX, groundY, spawnZ)` for `landerSpawn` ← MOVE to barycenter

- [ ] **Step 2: Introduce the barycenter ship-spawn vector**

In `LevelViewController.ts`, immediately after the `groundY` line (around line 480), add:

```ts
const groundY = this.heightmap.heightAt(spawnX, spawnZ)

// Ship parks at the asteroid's barycenter (world XZ origin). All
// asteroid GLBs are pivoted at the body center, so the rotated mesh
// guarantees rock directly under the shuttle's downward floodlight
// cone. Mission objectives still cluster around the sampled spawn
// cell below — the player flies from the ship spawn to the waypoints.
const shipBarycenterY = this.heightmap.heightAt(0, 0)
const shipSpawnXZ = { x: 0, z: 0 }
```

- [ ] **Step 3: Update `gameplayStart` to use the barycenter**

Change line ~582 from:

```ts
const gameplayStart = offsetGameplayLanderSpawn(
  new Vector3(spawnX, groundY + LEVEL_TERRAIN_CONFIG.landerSpawnHeight, spawnZ),
)
```

to:

```ts
const gameplayStart = offsetGameplayLanderSpawn(
  new Vector3(
    shipSpawnXZ.x,
    shipBarycenterY + LEVEL_TERRAIN_CONFIG.landerSpawnHeight,
    shipSpawnXZ.z,
  ),
)
```

- [ ] **Step 4: Update the cinematic `landerSpawn` to use the barycenter**

Change line ~636 from:

```ts
const landerSpawn = new Vector3(spawnX, groundY, spawnZ)
this.arrivalSequence = new ArrivalSequence(landerSpawn)
```

to:

```ts
const landerSpawn = new Vector3(shipSpawnXZ.x, shipBarycenterY, shipSpawnXZ.z)
this.arrivalSequence = new ArrivalSequence(landerSpawn)
```

- [ ] **Step 5: Leave `claimedPositions`, `resampleObjectiveNearShip`, and the rock exclusion alone**

Verify lines ~489, ~494, ~525 still reference `spawnX, spawnZ` (the sampled cell). Do **not** change them — that's the deliberate split. Mission objectives stay anchored to the sampled cell, the parked shuttle is at origin.

- [ ] **Step 6: Run type-check**

Run: `bun run type-check`
Expected: 0 errors.

- [ ] **Step 7: Run lint**

Run: `bun lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 8: Run the full test suite**

Run: `bun test:unit`
Expected: all green. `levelObjectivePlacement.spec.ts` exercises the placement helpers directly with their own heightmap and is unaffected by `LevelViewController`. If anything in `src/lib/level/__tests__/` does fail, it means a test is reading lander coords through some seam — fix by passing the new barycenter values explicitly rather than rolling back the change.

- [ ] **Step 9: Manual smoke test**

Run: `bun dev`, open `/level`, cycle a few asteroid seeds. Verify:
- After the establish phase + cutscene, the lander appears at world XZ origin under the parked shuttle.
- The parked shuttle's downward floodlight cone visibly hits surface in every seed (no beams disappearing into starfield at the cone edges).
- Mission waypoint markers are visible somewhere on the rock (clustered around their pre-existing sampled-cell anchor) — the lander has to fly to them.

- [ ] **Step 10: Commit**

```bash
git add src/views/LevelViewController.ts
git commit -m "$(cat <<'EOF'
feat(level): park lander/shuttle at asteroid barycenter

Lander cinematic spawn and gameplay spawn both move to world XZ origin,
where the rotated GLB pivot guarantees rock under the parked shuttle's
floodlight cone. Mission objectives, rock exclusions, and the resample
anchor still use the sampled on-surface cell, so the player flies from
the centered spawn to the waypoints.
EOF
)"
```

---

## Task 4: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full merge gate**

Run: `bun run type-check && bun lint && bun test:unit`
Expected: zero TS errors, zero lint errors/warnings, all tests pass.

- [ ] **Step 2: One end-to-end manual run**

Run: `bun dev`. Open `/level` once. Watch the full cutscene from boot to gameplay-ready:

1. Boot → fade to scene.
2. Establish phase: ~2s of slow push-in on the asteroid.
3. Hard cut → approach: shuttle flies in from distance.
4. Flip → doors → detach → fadeout: as before.
5. Gameplay: lander sits under the parked shuttle at world XZ origin; floodlight cone hits surface; mission waypoints visible elsewhere on the rock.

If any phase looks visually wrong, capture which constants you'd tune and stop here — note the issue, don't continue with broken framing.

- [ ] **Step 3: Confirm `levelStateMachine` picked up the new duration**

Run: `grep -rn "ARRIVAL_DURATION\|ARRIVAL_SEQUENCE_DURATION" src/`

Expected: only the existing import in `src/lib/level/levelStateMachine.ts` and the export in `src/three/ArrivalSequence.ts`. No hardcoded `15.5` or `17.5` anywhere else.

- [ ] **Step 4: No commit required for verification.** Plan is complete when the merge gate passes and the manual run looks right.

---

## Notes for the implementer

- **No magic numbers.** All numbers added in this plan are named constants (`PHASE_ESTABLISH_DURATION`, `ESTABLISH_CAM_START_OFFSET`, `ESTABLISH_CAM_END_OFFSET`).
- **`tickEstablish` does NOT update thruster sprites.** Sprites pulse during `approach` only — the existing `thrustersActive = this.phase === 'approach'` check (line 370) correctly returns false during establish, so the shuttle's thruster glow stays off until the cut. Don't touch that line.
- **`landerFallSpeed` integration.** The falling-lander gravity (line 374–378) runs every tick once `fallingLander` is set. During `establish` it's null, so nothing happens. No change needed there.
- **`exfilPhase` does not interact with `establish`.** Exfil uses a separate state machine and only runs after gameplay; the new phase is invisible to it.
- **If a future asteroid GLB has an off-center pivot** (the spec assumes all are centered), `heightmap.heightAt(0, 0)` could return a void sentinel. That's a content-pipeline bug, not a code bug — fix the GLB pipeline if it happens, don't paper over it here.
