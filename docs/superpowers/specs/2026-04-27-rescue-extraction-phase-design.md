# Rescue Extraction Phase

**Date:** 2026-04-27
**Author:** guinetik
**Status:** Design

## Summary

The Rescue Minigame currently ends with: heal the survivors, then plant charges and run. Survivors are passive HP bars that exist only to be defended. This spec adds an **Extraction phase** — once healed, the player aims at each survivor and presses **E** to send them walking toward the lander on their own. Charges cannot be planted, and the lander cannot lift off, until every alive survivor has either boarded or died en route. Two HUD additions surface the new pool the player has to track (alive vs. aboard). A small visual fix lands kneeling hostages on the ground instead of floating above it.

## Goals

- Make survivors a thing the player actively *does something with*, not just defends.
- Give survivor death a discrete, non-missable feedback moment.
- Restore the kneel/rise/collapse hip motion that got lost when we stripped Mixamo's centimeter-scaled hips translation.
- Hard-block liftoff during extraction so the player can't accidentally strand survivors.

## Non-Goals

- Pikmin-style follow-the-leader behavior. Recruitment is parallel autonomy.
- Pathfinding / obstacle steering. Survivors walk in a straight line on the heightmap.
- New keybindings. Extraction reuses the existing **E** interact key, dispatched by the active step.
- Per-survivor scoring or carry-over to other missions. A rescued survivor is just a successful extraction; missing one fails the mission iff zero remain alive.

## Mission Flow Change

The `RescueMinigame._steps` list grows from 4 to 5:

```
[0] Land in the outbreak zone
[1] Eliminate the attackers
[2] Heal the survivors
[3] Extract the survivors        ← NEW
[4] Destroy the virus infestation
```

**Gating:**

- Step 3 unlocks when step 2 completes (`areAllLivingHostagesAtFullHealth()` returns true).
- Step 3 completes when `aboardCount + lostDuringExtractCount === aliveAtRescueStartCount` — i.e., every survivor that was alive at the moment step 3 became active has either walked into the lander or died walking.
- Step 4 (charges) unlocks only after step 3 completes. The existing `armed` / countdown logic does not change.

**Failure modes (additive to current).**

- Existing: all hostages dead at any point → fail (`'All Survivors Lost'`).
- Same applies during extract — if the last walking survivor dies (e.g., from residual contact damage), the mission fails.

## Hostage Animation State Machine

The existing states (`tpose | praying | standing-up | walking | dying`) get two transitions wired:

```
praying ──playStandUp()──> standing-up ──(clip finished)──> walking
```

`HostageModel` already exposes `playStandUp()` and `playWalking()` from prior work. It gains a one-shot `mixer.addEventListener('finished', ...)` listener that auto-promotes `standing-up → walking` when the stand-up clip's last frame fires. The listener checks `event.action.getClip().name === HOSTAGE_CLIP_PRAYING_STAND_UP` so it doesn't trigger off the dying clip's finish event.

## HostageWalker

A small per-instance class living next to `FpsHostageController`:

```ts
class HostageWalker {
  constructor(
    instance: HostageInstance,
    targetProvider: () => THREE.Vector3,   // returns live lander XZ each tick
    onBoarded: (h: Hostage) => void,
  )
  tick(dt: number, heightmap: Heightmap): void
}
```

**Per-tick behavior:**

1. Read target XZ from `targetProvider()`.
2. Compute XZ delta to target. If `distance <= HOSTAGE_BOARD_RADIUS` (6m), fire `onBoarded(hostage)` and self-mark for removal.
3. Otherwise, advance XZ by `HOSTAGE_WALK_SPEED * dt` (~3.5 m/s — slightly slower than player) toward target.
4. Sample `heightmap.heightAt(x, z)` for ground Y; set `model.group.position.y = groundY`. (No kneel offset is applied here — by the time the walker exists the stand-up clip is playing, so the model is rising back to standing height under its own animation. The kneel offset only matters for the fallback path in §"Kneel Pose Fix" and would be zero during walking anyway.)
5. Set `model.group.rotation.y = atan2(dx, dz)` so the walker faces its travel direction.
6. No steering, no obstacle avoidance. Straight-line walk with heightmap follow. The virus is tall enough to walk under and the lander is a single landing pad. We can add avoidance later if playtest demands it.

**On board (within `HOSTAGE_BOARD_RADIUS`):**

- `FpsHostageController` plays a 0.4s scale-down + opacity fade on `model.group`, then removes from scene.
- Increments `RescueMinigame.aboardSurvivors`.
- Fires `onSurvivorAboard(aboardCount, total)`.

**Ownership:** `FpsHostageController` owns a `Map<Hostage, HostageWalker>`. New public method `recruit(hostage, targetProvider)` creates the walker, calls `instance.model.playStandUp()`, and registers it. The walker's `tick` runs after the existing `instance.tick(dt)` inside the controller's tick loop.

## Recruit Interaction

Recruitment is dispatched off the existing **E** interact key (no new input; F is taken for lander board/exit).

**Player controller** sets `ctx.terminalInteractPressed: boolean` once per E tap (this already exists). `MiniGameContext` gains `playerForward: THREE.Vector3` — a unit-length camera-forward direction in world space. The level VC populates it each tick from the FPS camera.

**`RescueMinigame.tick` during step 3:**

```ts
const hit = this.findExtractTarget(ctx)
if (hit) {
  this.onPrompt('[E] EXTRACT SURVIVOR')
  if (ctx.terminalInteractPressed) {
    this.hostages.recruit(hit, () => this.lastLanderPosition)
  }
} else {
  this.onPrompt('LOOK AT A SURVIVOR. PRESS [E] TO EXTRACT')
}
```

`findExtractTarget` iterates every alive `HostageInstance` whose `model.getState() === 'praying'`, sphere-intersects the player's look ray (origin `playerPosition + camera height`, direction `playerForward`) against each instance's existing hit sphere (`hitCenterOffsetY`, `hitRadius` — already computed in `FpsHostageController.computeHostageHitFromMeshRoot`), and returns the closest hit within `RESCUE_RAYCAST_RANGE` (12m). No new collision shape is introduced.

**`lastLanderPosition`** is a `THREE.Vector3` field on `RescueMinigame` updated each tick from `ctx.landerPosition`. The walker's `targetProvider` closure reads this so the walker always heads to wherever the lander currently is.

**Step 4 (charges)** uses the same `terminalInteractPressed` signal but a different prompt and predicate (`distance(player, virus) <= VIRUS_INTERACT_RANGE`). The two intents can't collide because the steps are sequential.

## HUD: Toasts + Persistent Counter

**Two new event hooks on `RescueMinigame`:**

```ts
onSurvivorLost: ((aliveRemaining: number, total: number) => void) | null = null
onSurvivorAboard: ((aboardCount: number, total: number) => void) | null = null
```

`onSurvivorLost` fires from inside the existing `hostage.onDeath` chain (bubbled up via a new controller-level `onSurvivorLost` callback added to `FpsHostageController`). `onSurvivorAboard` fires from the walker's board-radius check.

**Toast wiring.** `LevelView` (the same VC that wires the survey toast shipped in commit `5b26617`) subscribes to both:

- Death: red `SURVIVOR LOST` toast, 1.8s.
- Board: green `SURVIVOR ABOARD` toast, 1.8s.

Reuses the existing toast component — no new toast infrastructure.

**Persistent counter.** New tiny Vue overlay `RescueSurvivorPanel.vue`, anchored top-left under the existing objective list, only visible while `RescueMinigame` is the active minigame. Reads three new getters off the minigame:

```ts
get totalSurvivors(): number       // count at the moment hostages were released
get aliveSurvivors(): number       // currently alive, not yet aboard
get aboardSurvivors(): number      // walked into the lander
```

Renders one line: `SURVIVORS: 3 ALIVE · 2 ABOARD · 5 TOTAL`. The `ALIVE` segment is amber when `aliveSurvivors / totalSurvivors < 0.5`, red when `aliveSurvivors <= 1`.

## Liftoff Lock

**On `RescueMinigame`:**

```ts
/** True while step 3 is active and there are still survivors not yet aboard. */
get isLiftoffLocked(): boolean {
  return this._steps[3]?.active === true && this.aliveSurvivors > 0
}
```

**LanderController integration.** The level controller already feeds `MiniGameContext` to the active minigame and ticks the lander; it consults `isLiftoffLocked` each tick. When true, it clamps the lander's main-engine thrust input to 0 before passing it to the lander. RCS still works (so the player isn't fully frozen — they can rotate, settle). The lander is physically incapable of leaving the ground.

**Feedback when the player tries.** The level VC observes the player's main-engine input each tick. When `isLiftoffLocked === true` and the player's main-engine input is non-zero, the VC calls a new `RescueMinigame.notifyLiftoffAttemptBlocked()` method (rate-limited internally to one fire per ~2s so holding the throttle doesn't spam). The minigame flashes a 2s prompt: `LIFTOFF LOCKED — EXTRACT ALL SURVIVORS`. Otherwise no spam — the persistent counter already implies the situation.

**Auto-clear.** The lock evaluates from state, so it auto-releases the moment `aliveSurvivors === 0` (everyone is either aboard or dead) — i.e., when step 3 completes. Step 4 gets normal liftoff back, since by then the player WANTS to evac before detonation.

## Kneel Pose Fix

**Root cause.** `HostageAnimations.ts` strips the `mixamorig:Hips.position` track from every clip to fix a catastrophic cm→m teleport (Mixamo FBX values are in centimeters; the GLB rig is in meters). That fix worked for walking — the controller already drives forward translation — but it broke praying / standing-up / dying. Those clips RELY on hip translation to lower the character into a kneel, rise from one, or collapse to the ground. Without the track, only rotations fire, so the legs bend but the hips stay at standing height → "floating kneel."

**Fix.** Stop blanket-stripping. Replace `stripHipsTranslation` calls on the three vertical-motion clips with a new `scaleHipsTranslation(clip, 0.01)` helper that walks the hips position track values and multiplies them by `0.01`. Walking still strips entirely so the controller's translation is the only forward force.

```ts
function scaleHipsTranslation(clip: AnimationClip, factor: number): void {
  for (const track of clip.tracks) {
    if (!(track.name.endsWith('.position') && track.name.includes('Hips'))) continue
    const values = track.values as Float32Array
    for (let i = 0; i < values.length; i++) values[i] *= factor
  }
}

// In loadHostageClips():
scaleHipsTranslation(prayingLoop, 0.01)
scaleHipsTranslation(prayingStandUp, 0.01)
scaleHipsTranslation(dying, 0.01)
stripHipsTranslation(walking)
```

This restores the intended kneel-down, rise-up, and collapse motions at correct magnitudes with feet planted.

**Fallback if scaling reads wrong** (e.g., if FBXLoader already partially normalized so 0.01 isn't the right factor): swap to a model-level Y offset — `model.group.position.y -= KNEEL_GROUND_OFFSET` while in `'praying'`, lerp the offset back to zero across the duration of the stand-up clip. Less correct biomechanically but visually adequate. We'll know within one playtest which approach we need; the rescaling approach is primary.

## New Constants

All in their respective files, following the no-magic-numbers rule:

| Constant | Value | Where | Purpose |
|---|---|---|---|
| `HOSTAGE_WALK_SPEED` | 3.5 (m/s) | `HostageWalker` | Forward XZ speed during extraction walk |
| `HOSTAGE_BOARD_RADIUS` | 6 (m) | `HostageWalker` | Distance from lander at which a walker boards |
| `HOSTAGE_BOARD_FADE_DURATION` | 0.4 (s) | `FpsHostageController` | Scale + opacity fade on board |
| `RESCUE_RAYCAST_RANGE` | 12 (m) | `RescueMinigame` | Max look-ray distance for E recruitment |
| `SURVIVOR_TOAST_DURATION` | 1.8 (s) | `LevelView` | Toast lifetime for lost / aboard events |
| `LIFTOFF_LOCK_PROMPT_DURATION` | 2.0 (s) | `RescueMinigame` | Flash prompt when blocked liftoff is attempted |
| `KNEEL_GROUND_OFFSET` | only if needed (m) | `HostageModel` | Fallback Y compensation, introduced only if the rescaling fix in §"Kneel Pose Fix" turns out wrong; tuned during playtest |

`HostageAnimations.ts` adds a private `MIXAMO_HIPS_CM_TO_M = 0.01` for the scaling helper.

## Data Flow

```
Player E key
    │
    ▼
PlayerController sets ctx.terminalInteractPressed = true
    │
    ▼
LevelController.tick() → activeMinigame.tick(dt, ctx)
    │
    ▼
RescueMinigame.tick (step 3 branch)
    │   findExtractTarget(ctx) → HostageInstance | null
    │
    ▼ (if hit && interact pressed)
FpsHostageController.recruit(hostage, () => this.lastLanderPosition)
    │   creates HostageWalker, calls instance.model.playStandUp()
    │
    ▼ (next tick, mixer fires 'finished' on stand-up clip)
HostageModel auto-promotes state to 'walking', plays walking clip
    │
    ▼ (HostageWalker.tick each frame)
walks XZ toward targetProvider() output, follows heightmap Y
    │
    ▼ (distance to target <= HOSTAGE_BOARD_RADIUS)
HostageWalker fires onBoarded(hostage)
    │
    ▼
FpsHostageController fades model out, removes from scene
    │   increments aboardSurvivors
    │   fires RescueMinigame.onSurvivorAboard
    │
    ▼
LevelView toast + RescueSurvivorPanel re-render
```

Death flow:

```
Hostage HP hits 0 (from contact / projectile)
    │
    ▼
HostageInstance.markDead() — sprite hidden, model.playDying(), removed from collision
    │
    ▼
FpsHostageController.onSurvivorLost(hostage) callback
    │
    ▼
RescueMinigame increments lostDuringExtractCount (if step 3 active)
    │   fires onSurvivorLost(aliveRemaining, total)
    │
    ▼
LevelView red toast + RescueSurvivorPanel re-render
    │   if aliveRemaining === 0: existing 'All Survivors Lost' fail path
```

## Error Handling

- **Walker target lander goes airborne.** The walker keeps targeting `lastLanderPosition` (live). With liftoff lock active, the lander can't go airborne in the first place during step 3, so this is impossible by construction.
- **Walker target lander destroyed.** Out of scope — the lander being destroyed is a hard mission fail and the minigame transitions to `'failed'` state; walker tick is gated on `_status === 'active'`.
- **Recruit on already-walking hostage.** `findExtractTarget` only considers hostages whose `model.getState() === 'praying'`, so a walker that's already standing or walking is invisible to the raycast. Idempotent by design.
- **Mid-walk death.** `HostageWalker.tick` checks `instance.isActive()` first; on false, removes itself without firing `onBoarded`. The death path triggers the lost toast independently.
- **Stand-up clip never finishes** (e.g., paused during a state freeze): the `mixer.addEventListener('finished', ...)` listener is the sole driver of `standing-up → walking`. If it never fires, the walker is stuck in stand-up animation but its `tick` keeps walking the model.group anyway. We accept this minor visual inconsistency — the only path to "stand-up never finishes" is the entire game being paused, in which case nothing else is moving either.

## Testing

`src/lib/` is the only layer covered by Vitest per project rules. The relevant additions:

- **No new `src/lib/` modules.** All changes are in `src/three/` (controllers, models, walker) and `src/views/` (toast wiring, counter overlay). These layers are not unit-tested by convention.
- **Manual playtest checklist** in the implementation plan: heal-then-extract happy path; one survivor dying mid-walk; attempting liftoff during step 3; kneel pose visual on flat ground vs. slope; HUD toast and counter accuracy.

If we later extract a pure walk-target/heightmap-follow helper into `src/lib/`, that would get unit coverage. Out of scope for this spec.

## Files Touched

**New files:**
- `src/three/HostageWalker.ts` — the walker class
- `src/components/level/RescueSurvivorPanel.vue` — persistent counter overlay
- `src/components/level/RescueSurvivorPanelController.ts` — VC for the counter

**Modified:**
- `src/lib/minigame/RescueMinigame.ts` — new step, recruit branch, getters, liftoff-lock, lifecycle wiring
- `src/three/HostageAnimations.ts` — `scaleHipsTranslation` helper, swap calls for praying / standing-up / dying
- `src/three/HostageModel.ts` — mixer 'finished' listener auto-promoting standing-up → walking
- `src/three/FpsHostageController.ts` — `recruit()` method, walker map, board-fade animation, `onSurvivorLost` callback
- `src/lib/minigame/MiniGame.ts` — add `playerForward: THREE.Vector3` to `MiniGameContext`
- `src/views/level/LevelView.vue` + `LevelViewController.ts` — subscribe to new events, mount the survivor panel, wire liftoff-lock to LanderController
- `src/three/LanderController.ts` (or whichever file owns thrust input) — accept an external "liftoff blocked" predicate or directly clamp main-engine thrust when level VC asks
