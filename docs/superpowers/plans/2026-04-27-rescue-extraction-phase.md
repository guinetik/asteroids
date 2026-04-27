# Rescue Extraction Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a player-driven extraction phase to the Rescue Minigame — heal survivors, then aim+E to send each one walking to the lander on their own; gate plant-charges and liftoff until extraction completes; surface deaths and boardings via HUD toasts and a persistent counter; fix the floating-kneel pose by rescaling Mixamo hips translation instead of stripping it.

**Architecture:** Three layers stay separate.
- `src/lib/minigame/RescueMinigame.ts` owns the state machine (5 steps, liftoff-lock predicate, derived counts).
- `src/three/` owns the runtime — animation clip prep, hostage model state, walker, controller-level board/death events, lander gate.
- `src/views/` owns the HUD — toast wiring (mirrors the existing survey-toast pattern from commit `5b26617`) and a new persistent `RescueSurvivorPanel` overlay.

**Tech Stack:** Vue 3 + Three.js + TypeScript + Vite + Bun. No new dependencies. No new unit tests (project convention: `src/lib/` only is unit-tested; this work is in `src/three/` and `src/views/`). Verification per task = `bun run type-check` + `bun run lint`. End-to-end verification = manual playtest checklist (Task 12).

**Reference spec:** `docs/superpowers/specs/2026-04-27-rescue-extraction-phase-design.md`.

---

## Files Touched

**New files:**
- `src/three/HostageWalker.ts` — per-instance walker that advances XZ toward a target provider, gated on `model.getState() === 'walking'`
- `src/components/RescueSurvivorPanel.vue` — persistent HUD overlay (TOTAL · ALIVE · ABOARD), only mounted when a `RescueMinigame` is active

**Modified:**
- `src/three/HostageAnimations.ts` — add `scaleHipsTranslation(clip, factor)`; rescale praying / standing-up / dying by 0.01; keep walking stripped
- `src/three/HostageModel.ts` — listen to mixer `'finished'` event; auto-promote `standing-up → walking` when the stand-up clip ends
- `src/three/FpsHostageController.ts` — `recruit(hostage, targetProvider)`, `Map<Hostage, HostageWalker>`, board fade-out, `onSurvivorLost`/`onSurvivorAboard` callbacks, `aboardCount` field
- `src/three/FpsCamera.ts` — `getForward(out: THREE.Vector3): THREE.Vector3` method (full 3D, includes pitch)
- `src/three/LanderController.ts` — `liftoffBlocked` field + setter; `isMainEngineActive` returns false when blocked
- `src/lib/minigame/MiniGame.ts` — add `playerForward?: { x: number; y: number; z: number } | null` to `MiniGameContext`
- `src/lib/level/LevelMinigameFacade.ts` — same field on `LevelMinigameTickState`; copy in `buildContext`; new `onSurvivorLost`/`onSurvivorAboard` bindings; wire on rescue minigame creation
- `src/lib/minigame/RescueMinigame.ts` — 5th step, getters (`totalSurvivors`, `aliveSurvivors`, `aboardSurvivors`), `lastLanderPosition` cache, `findExtractTarget`, recruit branch in tick, `onSurvivorLost`/`onSurvivorAboard` event hooks, `isLiftoffLocked` getter, `notifyLiftoffAttemptBlocked()` method, lock-attempt prompt timer
- `src/views/LevelViewController.ts` — populate `playerForward` in tick state; observe lander main-engine input + minigame `isLiftoffLocked` to fire `notifyLiftoffAttemptBlocked`; sink survivor events into bindings; expose to view
- `src/views/LevelView.vue` — survivor-event toast list (mirrors `surveyEntries` pattern); `<RescueSurvivorPanel>` mount; lifecycle wiring on the controller's new sinks
- `src/components/PickupToast.vue` — new `SurvivorEventEntry` interface + render branch alongside survey/prospect entries

---

## Task 1: Hips Translation Rescaling (Kneel Pose Fix)

**Files:**
- Modify: `src/three/HostageAnimations.ts`

The current `stripHipsTranslation` was a sledgehammer fix for the cm→m teleport. It cured the teleport but broke the kneel/rise/collapse motions because those clips RELY on hip translation. Replace blanket-strip with a per-clip choice: rescale by 0.01 for praying / standing-up / dying (so they kneel and stand and fall correctly), keep stripping for walking (so the controller's translation is the only forward force).

- [ ] **Step 1: Add the rescaling helper next to the existing strip helper**

In `src/three/HostageAnimations.ts`, immediately after the existing `stripHipsTranslation` function, add:

```ts
/** Mixamo FBX exports record hip translation in centimeters; the GLB rig is in meters. */
const MIXAMO_HIPS_CM_TO_M = 0.01

/**
 * Multiply every value of the `mixamorig:Hips.position` track by `factor`.
 * Use 0.01 to convert Mixamo's centimeter-scaled hips translation to meters
 * so kneel / rise / collapse motions read at the right magnitude on the GLB rig.
 *
 * @param clip   - Clip to mutate in place
 * @param factor - Multiplier applied to every component of every keyframe
 */
function scaleHipsTranslation(clip: THREE.AnimationClip, factor: number): void {
  for (const track of clip.tracks) {
    if (!(track.name.endsWith('.position') && track.name.includes('Hips'))) continue
    const values = track.values
    for (let i = 0; i < values.length; i++) {
      values[i] = values[i]! * factor
    }
  }
}
```

- [ ] **Step 2: Swap the four `stripHipsTranslation` calls inside `loadHostageClips`**

Find this block in `loadHostageClips`:

```ts
    stripHipsTranslation(prayingLoop)
    stripHipsTranslation(prayingStandUp)
    stripHipsTranslation(walking)
    stripHipsTranslation(dying)
```

Replace it with:

```ts
    scaleHipsTranslation(prayingLoop, MIXAMO_HIPS_CM_TO_M)
    scaleHipsTranslation(prayingStandUp, MIXAMO_HIPS_CM_TO_M)
    stripHipsTranslation(walking)
    scaleHipsTranslation(dying, MIXAMO_HIPS_CM_TO_M)
```

Walking still strips entirely because the `HostageWalker` (Task 4) drives forward translation; otherwise we'd double-translate.

- [ ] **Step 3: Update the `stripHipsTranslation` doc comment to clarify the new contract**

Find the existing TSDoc above `stripHipsTranslation` and replace its body with:

```ts
/**
 * Drop the `mixamorig:Hips.position` track entirely. Use only when the controller
 * drives forward translation (walking) and we want to suppress any baked-in
 * locomotion to avoid double translation. For clips that need vertical hip
 * motion (kneel / rise / collapse), use {@link scaleHipsTranslation} instead so
 * the motion is preserved at the correct magnitude.
 *
 * @param clip - Clip to mutate in place
 */
```

- [ ] **Step 4: Verify**

```bash
bun run type-check && bun run lint
```

Expected: both pass with zero errors / warnings.

- [ ] **Step 5: Commit**

```bash
git add src/three/HostageAnimations.ts
git commit -m "fix(hostage-anim): rescale hips translation instead of stripping for kneel/rise/dying"
```

---

## Task 2: Auto-Promote `standing-up → walking`

**Files:**
- Modify: `src/three/HostageModel.ts`

When `playStandUp()` runs, the rig plays the one-shot rise clip. Once the clip's last frame fires (`'finished'` mixer event), state must auto-promote to `'walking'` so the `HostageWalker` (Task 4) starts advancing. We add the listener once when the mixer is created and dispatch by clip name.

- [ ] **Step 1: Import the clip-name constant we need to compare against**

In `src/three/HostageModel.ts`, change the existing import line:

```ts
import { loadHostageClips } from './HostageAnimations'
```

to:

```ts
import { HOSTAGE_CLIP_PRAYING_STAND_UP, loadHostageClips } from './HostageAnimations'
```

- [ ] **Step 2: Wire the `'finished'` listener inside `ensureMixer`**

Find `ensureMixer`:

```ts
  private ensureMixer(): THREE.AnimationMixer {
    if (!this.mixer) {
      this.mixer = new THREE.AnimationMixer(this.skinnedRoot)
    }
    return this.mixer
  }
```

Replace its body with:

```ts
  private ensureMixer(): THREE.AnimationMixer {
    if (!this.mixer) {
      this.mixer = new THREE.AnimationMixer(this.skinnedRoot)
      this.mixer.addEventListener('finished', this.handleMixerFinished)
    }
    return this.mixer
  }
```

- [ ] **Step 3: Add the listener method as a bound class field**

Add this directly above `ensureMixer` (or anywhere inside the `HostageModel` class — but as a bound arrow so `this.mixer.removeEventListener` would work if needed later):

```ts
  /**
   * Auto-promote `standing-up → walking` when the stand-up clip's last
   * frame fires. Other clips (praying ping-pong loop, dying clamp) emit
   * `'finished'` too, but those names don't match so they're ignored.
   */
  private readonly handleMixerFinished = (event: { action: THREE.AnimationAction }): void => {
    const clip = event.action.getClip()
    if (clip.name !== HOSTAGE_CLIP_PRAYING_STAND_UP) return
    void this.playWalking()
  }
```

- [ ] **Step 4: Detach the listener in `dispose`**

Find the existing `dispose`:

```ts
  dispose(): void {
    if (this.mixer) {
      this.mixer.stopAllAction()
      this.mixer.uncacheRoot(this.skinnedRoot)
      this.mixer = null
    }
    ...
```

Change the inner block to:

```ts
  dispose(): void {
    if (this.mixer) {
      this.mixer.removeEventListener('finished', this.handleMixerFinished)
      this.mixer.stopAllAction()
      this.mixer.uncacheRoot(this.skinnedRoot)
      this.mixer = null
    }
```

- [ ] **Step 5: Verify**

```bash
bun run type-check && bun run lint
```

Expected: both pass. (Three's `AnimationMixer` `'finished'` event payload type is permissive; the inline `{ action: THREE.AnimationAction }` shape compiles cleanly.)

- [ ] **Step 6: Commit**

```bash
git add src/three/HostageModel.ts
git commit -m "feat(hostage): auto-promote standing-up to walking on mixer finished"
```

---

## Task 3: `playerForward` in MiniGameContext + `FpsCamera.getForward`

**Files:**
- Modify: `src/three/FpsCamera.ts`
- Modify: `src/lib/minigame/MiniGame.ts`
- Modify: `src/lib/level/LevelMinigameFacade.ts`
- Modify: `src/views/LevelViewController.ts`

The recruit raycast (Task 6) needs the player's full 3D look direction (with pitch — looking down at a kneeling hostage matters). The existing `FpsCamera.getForwardXZ()` only returns the XZ-plane projection. Add a sibling `getForward` that fills a `THREE.Vector3` from yaw + pitch, then plumb it through context.

- [ ] **Step 1: Add `getForward` to `FpsCamera`**

In `src/three/FpsCamera.ts`, find the existing `getForwardXZ` method:

```ts
  /** Forward direction on the XZ plane (pitch stripped). */
  getForwardXZ(): THREE.Vector2 {
    return new THREE.Vector2(-Math.sin(this.yaw), -Math.cos(this.yaw)).normalize()
  }
```

Insert this method directly above it:

```ts
  /**
   * Full 3D camera forward (pitch included). Allocation-free — fills `out`.
   *
   * @param out - Vector to write into
   * @returns The same `out` reference for chaining
   */
  getForward(out: THREE.Vector3): THREE.Vector3 {
    const cosPitch = Math.cos(this.pitch)
    out.set(-Math.sin(this.yaw) * cosPitch, Math.sin(this.pitch), -Math.cos(this.yaw) * cosPitch)
    return out.normalize()
  }
```

- [ ] **Step 2: Add `playerForward` to `MiniGameContext`**

In `src/lib/minigame/MiniGame.ts`, find the `MiniGameContext` interface and insert this property right after `playerPosition`:

```ts
  /**
   * Unit-length camera-forward direction in world space when the player is in
   * EVA (null otherwise). Used by minigames that raycast from the crosshair
   * (e.g. rescue extraction).
   */
  playerForward?: { x: number; y: number; z: number } | null
```

- [ ] **Step 3: Add the same field to `LevelMinigameTickState` in the facade**

In `src/lib/level/LevelMinigameFacade.ts`, find the `LevelMinigameTickState` interface and insert directly after `playerPosition`:

```ts
  /** EVA player camera-forward direction in world space, if available. */
  playerForward?: LevelMinigamePosition | null
```

- [ ] **Step 4: Pass it through `buildContext`**

In `src/lib/level/LevelMinigameFacade.ts`, find `private buildContext`:

```ts
  private buildContext(state: LevelMinigameTickState): MiniGameContext {
    return {
      levelState: state.levelState,
      landerPosition: state.landerPosition,
      landerForward: state.landerForward,
      landerUp: state.landerUp,
      landerGrounded: state.landerGrounded,
      playerPosition: state.playerPosition,
      interactPressed: state.interactPressed,
      terminalInteractPressed: state.terminalInteractPressed,
    }
  }
```

Insert `playerForward: state.playerForward,` right after the `playerPosition: state.playerPosition,` line.

- [ ] **Step 5: Populate `playerForward` in `LevelViewController`**

In `src/views/LevelViewController.ts`, find the tick-state literal that contains `playerPosition:` (around line 2057-2065). The block currently looks like:

```ts
        playerPosition:
          state === 'eva' && player
            ? { x: player.group.position.x, y: player.group.position.y, z: player.group.position.z }
            : null,
        interactPressed: this.inputManager?.wasActionPressed('interact') ?? false,
        terminalInteractPressed: this.inputManager?.wasActionPressed('terminalInteract') ?? false,
```

Add a `_playerForwardScratch` field at the top of the class (near the existing `mainEngineWorldPos` style scratches in this file — find a convenient `private foo = new THREE.Vector3()` declaration and add:

```ts
  private _playerForwardScratch = new THREE.Vector3()
```

Then change the tick-state block to:

```ts
        playerPosition:
          state === 'eva' && player
            ? { x: player.group.position.x, y: player.group.position.y, z: player.group.position.z }
            : null,
        playerForward:
          state === 'eva' && this.fpsCamera
            ? (() => {
                const v = this.fpsCamera.getForward(this._playerForwardScratch)
                return { x: v.x, y: v.y, z: v.z }
              })()
            : null,
        interactPressed: this.inputManager?.wasActionPressed('interact') ?? false,
        terminalInteractPressed: this.inputManager?.wasActionPressed('terminalInteract') ?? false,
```

> **Note for the implementer:** `LevelViewController` already holds a reference to the FPS camera; the field is named `fpsCamera` in the same controller (verify with a quick grep before editing — if the field has a different name in this codebase, swap the identifier). The plain-object boxing matches the existing `landerForward` / `landerPosition` shape — `MiniGameContext` does not depend on `THREE.Vector3` so consumers can stay unit-test friendly.

- [ ] **Step 6: Verify**

```bash
bun run type-check && bun run lint
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/three/FpsCamera.ts src/lib/minigame/MiniGame.ts src/lib/level/LevelMinigameFacade.ts src/views/LevelViewController.ts
git commit -m "feat(minigame-ctx): expose playerForward to minigames via FpsCamera.getForward"
```

---

## Task 4: `HostageWalker` Class

**Files:**
- Create: `src/three/HostageWalker.ts`

A small per-instance class that owns the autonomous walk-to-target behavior. Reads ground from a heightmap, advances XZ at a configured speed, faces direction of travel, fires a callback when the lander is within board radius. **Movement is gated** on `model.getState() === 'walking'` so the rig doesn't slide laterally during the stand-up clip.

- [ ] **Step 1: Create the file**

Create `src/three/HostageWalker.ts` with this complete content:

```ts
/**
 * Autonomous per-instance walker for rescued hostages.
 *
 * Created by {@link FpsHostageController.recruit} after the player presses E
 * on a kneeling hostage. Walks XZ toward a live target (the lander), follows
 * the heightmap, faces direction of travel, and fires `onBoarded` when within
 * {@link HOSTAGE_BOARD_RADIUS} of the target. Movement is gated on the
 * underlying {@link HostageModel} reporting state `'walking'` so the root
 * never slides laterally while the stand-up clip is playing.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-rescue-extraction-phase-design.md
 */
import * as THREE from 'three'
import type { Heightmap } from '@/lib/terrain/heightmap'
import type { Hostage } from '@/lib/fps/hostage'
import type { HostageModel } from './HostageModel'

/** Forward XZ speed during extraction walk (m/s — slightly slower than the player). */
export const HOSTAGE_WALK_SPEED = 3.5

/** Distance from the lander at which a walker boards and despawns (m). */
export const HOSTAGE_BOARD_RADIUS = 6

/**
 * Per-instance walker. One per recruited hostage. Owned by
 * {@link FpsHostageController}; the controller calls {@link tick} each frame
 * and removes the walker when {@link finished} flips true.
 */
export class HostageWalker {
  /** True once the walker has fired its `onBoarded` callback and should be removed. */
  finished = false

  private readonly toTarget = new THREE.Vector3()

  /**
   * @param hostage        - Domain entity (used to identify the walker on board)
   * @param model          - Visual; queried for state and translated each tick
   * @param targetProvider - Live lander XZ; called every tick (snapshot at recruit time would freeze)
   * @param onBoarded      - Fired once when the walker hits {@link HOSTAGE_BOARD_RADIUS}
   */
  constructor(
    readonly hostage: Hostage,
    private readonly model: HostageModel,
    private readonly targetProvider: () => THREE.Vector3,
    private readonly onBoarded: (hostage: Hostage) => void,
  ) {}

  /**
   * Per-frame update.
   *
   * @param dt        - Delta time in seconds
   * @param heightmap - Terrain sampled for ground Y at the walker's XZ
   */
  tick(dt: number, heightmap: Heightmap): void {
    if (this.finished) return
    if (this.model.getState() !== 'walking') return

    const target = this.targetProvider()
    const group = this.model.group
    const dx = target.x - group.position.x
    const dz = target.z - group.position.z
    const distSq = dx * dx + dz * dz

    if (distSq <= HOSTAGE_BOARD_RADIUS * HOSTAGE_BOARD_RADIUS) {
      this.finished = true
      this.onBoarded(this.hostage)
      return
    }

    const dist = Math.sqrt(distSq)
    const step = Math.min(dist, HOSTAGE_WALK_SPEED * dt)
    this.toTarget.set(dx / dist, 0, dz / dist)
    group.position.x += this.toTarget.x * step
    group.position.z += this.toTarget.z * step
    group.position.y = heightmap.heightAt(group.position.x, group.position.z)
    group.rotation.y = Math.atan2(this.toTarget.x, this.toTarget.z)
  }
}
```

- [ ] **Step 2: Verify**

```bash
bun run type-check && bun run lint
```

Expected: both pass. (The walker has no consumer yet; it just compiles in isolation.)

- [ ] **Step 3: Commit**

```bash
git add src/three/HostageWalker.ts
git commit -m "feat(hostage): add HostageWalker for autonomous lander-bound extraction walk"
```

---

## Task 5: `FpsHostageController` — `recruit`, walker map, board fade, `onSurvivorLost`

**Files:**
- Modify: `src/three/FpsHostageController.ts`

The controller becomes the owner of all per-instance walkers, drives their tick, performs a brief 0.4s fade-out when one boards, removes them from scene + projectile systems, and surfaces death events upstream so `RescueMinigame` can fire its `onSurvivorLost` hook.

- [ ] **Step 1: Add the new imports + constants near the top of the file**

In `src/three/FpsHostageController.ts`, find the existing imports block:

```ts
import { Hostage, HOSTAGE_DEFAULT_HIT_RADIUS, HOSTAGE_HIT_CENTER_Y } from '@/lib/fps/hostage'

import { HostageModel } from './HostageModel'
```

Replace it with:

```ts
import { Hostage, HOSTAGE_DEFAULT_HIT_RADIUS, HOSTAGE_HIT_CENTER_Y } from '@/lib/fps/hostage'

import { HostageModel } from './HostageModel'
import { HostageWalker } from './HostageWalker'
```

Then find the constants block at the top of the file (after the canvas/sprite constants) and add:

```ts
/** Duration of the scale + opacity fade when a recruited hostage reaches the lander (s). */
const HOSTAGE_BOARD_FADE_DURATION = 0.4
```

- [ ] **Step 2: Add a `boardFadeTimer` field and a `markBoarding` method on `HostageInstance`**

Find the `HostageInstance` class. After the existing `private dead = false` line, insert:

```ts
  private boardFadeTimer = 0
```

Then add this method anywhere inside the class (e.g. directly above `markDead`):

```ts
  /**
   * Begin the board fade. After {@link HOSTAGE_BOARD_FADE_DURATION} the
   * controller removes the instance entirely; until then the model scales
   * and fades out smoothly. Idempotent.
   */
  beginBoardFade(): void {
    if (this.boardFadeTimer > 0 || this.dead) return
    this.boardFadeTimer = HOSTAGE_BOARD_FADE_DURATION
    this.sprite.visible = false
  }

  /** True when the board fade has fully played out and the controller can remove this instance. */
  get isBoardFadeComplete(): boolean {
    return this.boardFadeTimer < 0
  }

  /** True if the board fade is active (used by tick to drive the visual). */
  get isBoarding(): boolean {
    return this.boardFadeTimer > 0
  }
```

- [ ] **Step 3: Drive the fade inside `HostageInstance.tick`**

Find the existing `tick` on `HostageInstance`:

```ts
  tick(dt: number): void {
    if (this.revealTimer > 0) {
      ...
    } else {
      this.model.group.position.y = this.targetY
      this.model.group.scale.setScalar(1)
      this.sprite.visible = !this.dead
    }
    if (!this.dead && this.hostage.alive) {
      this.model.tickFeedback(dt)
    }
    this.model.tickAnimation(dt)
  }
```

Replace it with:

```ts
  tick(dt: number): void {
    if (this.revealTimer > 0) {
      this.revealTimer = Math.max(0, this.revealTimer - dt)
      const t = 1 - this.revealTimer / HOSTAGE_REVEAL_DURATION
      const eased = 1 - Math.pow(1 - t, 3)
      this.model.group.position.y = this.targetY - (1 - eased) * HOSTAGE_REVEAL_START_DEPTH
      const scale = HOSTAGE_REVEAL_START_SCALE + eased * (1 - HOSTAGE_REVEAL_START_SCALE)
      this.model.group.scale.setScalar(scale)
      this.sprite.visible = eased >= 0.45 && !this.dead
    } else if (this.boardFadeTimer > 0) {
      this.boardFadeTimer -= dt
      const t = Math.max(0, 1 - this.boardFadeTimer / HOSTAGE_BOARD_FADE_DURATION)
      const scale = 1 - t
      this.model.group.scale.setScalar(Math.max(0.001, scale))
      // Walker drives Y/X/Z; sprite already hidden by beginBoardFade.
    } else {
      this.model.group.scale.setScalar(1)
      this.sprite.visible = !this.dead
    }
    if (!this.dead && this.hostage.alive) {
      this.model.tickFeedback(dt)
    }
    this.model.tickAnimation(dt)
  }
```

> **Note:** the original `else` branch hard-set `position.y = targetY`; that conflicts with the walker, which writes its own Y from `heightmap.heightAt`. The new branch only resets the scale and lets the walker own position.

- [ ] **Step 4: Add walker storage + `aboardCount` + new event hooks on the controller**

Find the field block at the top of `FpsHostageController`:

```ts
  private readonly scene: THREE.Scene
  private readonly heightmap: Heightmap
  private readonly instances: HostageInstance[] = []
  private projectileSystem: ProjectileSystem | null = null
  private enemyProjectileSystem: EnemyProjectileSystem | null = null
```

Replace it with:

```ts
  private readonly scene: THREE.Scene
  private readonly heightmap: Heightmap
  private readonly instances: HostageInstance[] = []
  private readonly walkers = new Map<Hostage, HostageWalker>()
  private projectileSystem: ProjectileSystem | null = null
  private enemyProjectileSystem: EnemyProjectileSystem | null = null
  private _aboardCount = 0

  /**
   * Fired when a hostage dies (HP hits 0 from any source). Receives the count of
   * survivors still alive AND not yet aboard, so the level VC can route a toast
   * + counter refresh without recomputing.
   */
  onSurvivorLost: ((aliveRemaining: number) => void) | null = null

  /** Fired when a recruited walker reaches the lander and boards. */
  onSurvivorAboard: ((aboardCount: number) => void) | null = null
```

- [ ] **Step 5: Expose `aboardCount` and a derived `aliveCountNotAboard` getter**

Find the existing `getAliveCount` method on the controller:

```ts
  getAliveCount(): number {
    let count = 0
    for (const inst of this.instances) {
      if (inst.isActive()) count++
    }
    return count
  }
```

Insert these two getters directly above it:

```ts
  /** Count of recruited hostages that have walked into the lander. Monotonic per mission. */
  get aboardCount(): number {
    return this._aboardCount
  }

  /**
   * Currently-alive hostages that have not yet boarded the lander. This is the
   * working number for both the HUD and the `RescueMinigame` step-3 completion
   * check (`alive === 0` while step 3 is active).
   */
  get aliveCountNotAboard(): number {
    return this.getAliveCount()
  }
```

> Note: `getAliveCount()` already excludes dead hostages, AND boarded hostages have `markDead`-style cleanup applied (Step 6), so it naturally excludes both. The named getter just makes intent explicit at call sites.

- [ ] **Step 6: Wire death notification and add `recruit` + walker tick + board cleanup**

Find the existing `notifyDamaged` method:

```ts
  notifyDamaged(hostage: Hostage): void {
    const inst = this.instances.find((i) => i.hostage === hostage)
    inst?.pulseDamage()
    inst?.syncHpBarIfNeeded(true)
  }
```

Insert after it (before the existing `tick`):

```ts
  /**
   * Recruit a hostage for extraction: kick off the stand-up animation and create
   * a walker that will steer the rig to the live lander position. The
   * `targetProvider` closure is called every tick so the walker tracks the
   * lander even if it moves (relevant once the liftoff lock auto-clears).
   *
   * @param hostage        - Domain entity to recruit
   * @param targetProvider - Live lander XZ provider (returns a fresh `Vector3`)
   */
  recruit(hostage: Hostage, targetProvider: () => THREE.Vector3): void {
    if (this.walkers.has(hostage)) return
    const inst = this.instances.find((i) => i.hostage === hostage)
    if (!inst || !inst.isActive()) return
    void inst.model.playStandUp()
    const walker = new HostageWalker(hostage, inst.model, targetProvider, (h) => this.handleBoard(h))
    this.walkers.set(hostage, walker)
  }

  private handleBoard(hostage: Hostage): void {
    const inst = this.instances.find((i) => i.hostage === hostage)
    if (!inst) return
    inst.beginBoardFade()
    this._aboardCount += 1
    // Remove from collision lists immediately so the dead virus / charges flow
    // doesn't see the boarded hostage as a target. The visual finishes its fade
    // over HOSTAGE_BOARD_FADE_DURATION; the controller removes the scene node
    // once isBoardFadeComplete is true.
    this.projectileSystem?.removeHostage(hostage)
    this.enemyProjectileSystem?.removeHostage(hostage)
    this.onSurvivorAboard?.(this._aboardCount)
  }
```

- [ ] **Step 7: Replace the `tick` method to drive walkers + finalize fades**

Find the existing `tick`:

```ts
  /** @inheritdoc */
  tick(_dt: number): void {
    for (const inst of this.instances) {
      inst.syncAnchorToGroup()
      inst.tick(_dt)
      if (inst.isActive()) {
        inst.syncHpBarIfNeeded()
      }
    }
  }
```

Replace it with:

```ts
  /** @inheritdoc */
  tick(_dt: number): void {
    for (const inst of this.instances) {
      inst.syncAnchorToGroup()
      inst.tick(_dt)
      if (inst.isActive()) {
        inst.syncHpBarIfNeeded()
      }
    }
    for (const walker of this.walkers.values()) {
      walker.tick(_dt, this.heightmap)
    }
    // Remove walkers + instances that finished boarding.
    for (const [hostage, walker] of this.walkers) {
      if (!walker.finished) continue
      const idx = this.instances.findIndex((i) => i.hostage === hostage)
      if (idx >= 0) {
        const inst = this.instances[idx]!
        if (inst.isBoardFadeComplete) {
          inst.dispose()
          this.scene.remove(inst.model.group)
          this.instances.splice(idx, 1)
          this.walkers.delete(hostage)
        }
      } else {
        this.walkers.delete(hostage)
      }
    }
  }
```

- [ ] **Step 8: Wire `onSurvivorLost` from `HostageInstance.markDead` up to the controller**

Find `HostageInstance.markDead`:

```ts
  markDead(): void {
    if (this.dead) return
    this.dead = true
    this.onRemoveFromSystems(this.hostage)
    this.sprite.visible = false
    void this.model.playDying()
  }
```

This is fine — `onRemoveFromSystems` is the controller-supplied callback. Find where the controller passes that callback inside `spawnAtPosition`:

```ts
    const inst = new HostageInstance(hostage, model, (h) => {
      this.projectileSystem?.removeHostage(h)
      this.enemyProjectileSystem?.removeHostage(h)
    })
```

Replace it with:

```ts
    const inst = new HostageInstance(hostage, model, (h) => {
      this.projectileSystem?.removeHostage(h)
      this.enemyProjectileSystem?.removeHostage(h)
      const walker = this.walkers.get(h)
      if (walker) {
        walker.finished = true
        this.walkers.delete(h)
      }
      this.onSurvivorLost?.(this.aliveCountNotAboard)
    })
```

This handles three cases at once: detach from collisions, abort any in-flight walker, and notify the level VC.

- [ ] **Step 9: Reset `_aboardCount` and clear walkers in `clear`**

Find the existing `clear`:

```ts
  clear(): void {
    for (const inst of this.instances) {
      this.projectileSystem?.removeHostage(inst.hostage)
      this.enemyProjectileSystem?.removeHostage(inst.hostage)
      inst.dispose()
      this.scene.remove(inst.model.group)
    }
    this.instances.length = 0
  }
```

Replace it with:

```ts
  clear(): void {
    for (const inst of this.instances) {
      this.projectileSystem?.removeHostage(inst.hostage)
      this.enemyProjectileSystem?.removeHostage(inst.hostage)
      inst.dispose()
      this.scene.remove(inst.model.group)
    }
    this.instances.length = 0
    this.walkers.clear()
    this._aboardCount = 0
  }
```

- [ ] **Step 10: Verify**

```bash
bun run type-check && bun run lint
```

Expected: both pass.

- [ ] **Step 11: Commit**

```bash
git add src/three/FpsHostageController.ts
git commit -m "feat(hostage-controller): recruit + walker management + board fade + survivor lost/aboard hooks"
```

---

## Task 6: `RescueMinigame` — New Step, Counters, Recruit Branch, Lifecycle

**Files:**
- Modify: `src/lib/minigame/RescueMinigame.ts`

The minigame gains its 5th step (`Extract`), three derived count getters, the recruit branch in `tick`, and the new event hooks. Also caches `lastLanderPosition` so walkers always read fresh data.

- [ ] **Step 1: Insert the new step and add the new module-level constants**

Near the top of the file (next to the existing `BLAST_RADIUS`, `COUNTDOWN_DURATION`, etc.), add:

```ts
const RESCUE_RAYCAST_RANGE = 12
const LIFTOFF_LOCK_PROMPT_DURATION = 2.0
```

Then find the `_steps` array initializer:

```ts
  private readonly _steps: MiniGameStep[] = [
    { label: 'Land in the outbreak zone', complete: false, active: true },
    { label: 'Eliminate the attackers', complete: false, active: false },
    { label: 'Heal the survivors', complete: false, active: false },
    { label: 'Destroy the virus infestation', complete: false, active: false },
  ]
```

Replace it with:

```ts
  private readonly _steps: MiniGameStep[] = [
    { label: 'Land in the outbreak zone', complete: false, active: true },
    { label: 'Eliminate the attackers', complete: false, active: false },
    { label: 'Heal the survivors', complete: false, active: false },
    { label: 'Extract the survivors', complete: false, active: false },
    { label: 'Destroy the virus infestation', complete: false, active: false },
  ]
```

This shifts the old step 3 (destroy) to step 4. The existing `advanceStep(3)` call in `armCharges()` (later in this file) targets the destroy step — once the array has 5 entries, that call needs to become `advanceStep(4)`. Step 4 of the search-and-replace below.

- [ ] **Step 2: Add the new event hooks + `lastLanderPosition` field + `liftoffLockPromptTimer`**

Find the existing event hook declarations near the top of the class:

```ts
  onPrompt: ((text: string | null) => void) | null = null
  onComplete: ((objectiveIndex: number) => void) | null = null
  onStepChange: ((objectiveIndex: number, steps: readonly MiniGameStep[]) => void) | null = null
```

Insert directly below them:

```ts
  /** Fired whenever a hostage dies (combat or extraction). Argument: alive-not-aboard count. */
  onSurvivorLost: ((aliveRemaining: number) => void) | null = null
  /** Fired when a recruited walker boards the lander. Argument: cumulative aboard count. */
  onSurvivorAboard: ((aboardCount: number) => void) | null = null
```

Find the field block (around line 138 — `private activated = false`, etc.) and add:

```ts
  private readonly lastLanderPosition = new THREE.Vector3()
  private liftoffLockPromptTimer = 0
```

- [ ] **Step 3: Wire controller events through to minigame events in `wireCallbacks`**

Find the existing `wireCallbacks` method. At the end of the method (after the existing `this.enemyProjectileSystem.onProjectileMove = ...` lines), add:

```ts
    this.hostages.onSurvivorLost = (aliveRemaining) => {
      this.onSurvivorLost?.(aliveRemaining)
    }
    this.hostages.onSurvivorAboard = (aboardCount) => {
      this.onSurvivorAboard?.(aboardCount)
    }
```

- [ ] **Step 4: Update the existing `armCharges` step index to 4**

Find:

```ts
  private armCharges(): void {
    this.armed = true
    this.countdownRemaining = COUNTDOWN_DURATION
    this.advanceStep(3)
  }
```

Change `this.advanceStep(3)` to `this.advanceStep(4)` (the destroy-virus step is now index 4).

- [ ] **Step 5: Add the three count getters + `isLiftoffLocked`**

After the existing `progressTotal` getter (around line 192), add:

```ts
  /** Total survivors released onto the ground in step 0. Never decremented. */
  get totalSurvivors(): number {
    return this.hostages.getTotalCount()
  }

  /** Currently-alive survivors that have not yet boarded the lander. */
  get aliveSurvivors(): number {
    return this.hostages.aliveCountNotAboard
  }

  /** Survivors who have walked into the lander. Monotonic. */
  get aboardSurvivors(): number {
    return this.hostages.aboardCount
  }

  /**
   * True while the extract step is active and there are still survivors who
   * have not boarded. Drives a thrust gate on {@link LanderController}.
   * Also gates on `_status === 'active'` so a `'failed'` mission never reports
   * locked.
   */
  get isLiftoffLocked(): boolean {
    return (
      this._status === 'active' &&
      this._steps[3]?.active === true &&
      this.aliveSurvivors > 0
    )
  }
```

- [ ] **Step 6: Add `notifyLiftoffAttemptBlocked`**

Add this method anywhere in the class (e.g. above `dispose`):

```ts
  /**
   * Called by the level VC when the player tries to lift off while the rescue
   * lock is active. Rate-limited internally to one prompt per
   * {@link LIFTOFF_LOCK_PROMPT_DURATION} so holding the throttle doesn't spam.
   */
  notifyLiftoffAttemptBlocked(): void {
    if (this.liftoffLockPromptTimer > 0) return
    this.liftoffLockPromptTimer = LIFTOFF_LOCK_PROMPT_DURATION
    this.onPrompt?.('LIFTOFF LOCKED — EXTRACT ALL SURVIVORS')
  }
```

- [ ] **Step 7: Decay the lock-prompt timer + cache lander position in `tick`**

Find the start of the existing `tick` method:

```ts
  tick(dt: number, ctx: MiniGameContext): void {
    this._isPlayerNear = this.armed
    this.hostages.tick(dt)
    this.syncVirusVisual(dt)
    this.syncEnemySimulation(dt, ctx)
    this.syncExplosionFlash(dt)

    if (this._status === 'completed' || this._status === 'failed') {
      return
    }
```

Insert between the `syncExplosionFlash(dt)` line and the `if` check:

```ts
    if (ctx.landerPosition) {
      this.lastLanderPosition.set(
        ctx.landerPosition.x,
        ctx.landerPosition.y,
        ctx.landerPosition.z,
      )
    }
    if (this.liftoffLockPromptTimer > 0) {
      this.liftoffLockPromptTimer = Math.max(0, this.liftoffLockPromptTimer - dt)
    }
```

- [ ] **Step 8: Insert the extract step branch into the `tick` flow**

Continue inside `tick`. The current sequence after the `allEnemiesDead` / `survivorsStable` blocks looks like:

```ts
    const survivorsStable = this.hostages.areAllLivingHostagesAtFullHealth()
    if (!survivorsStable) {
      this.updateHealPrompt(ctx)
      return
    }
    this.advanceStep(2)

    if (!this.armed) {
      this.updateVirusInteraction(ctx)
      return
    }
```

Replace that whole tail (everything from `const survivorsStable = ...` through the end of the `if (!this.armed) { ... return }` block — but **keep** the countdown logic that comes after) with:

```ts
    const survivorsStable = this.hostages.areAllLivingHostagesAtFullHealth()
    if (!survivorsStable) {
      this.updateHealPrompt(ctx)
      return
    }
    this.advanceStep(2)

    // Step 3: Extract. Player aims at a kneeling hostage and presses E to send
    // them walking to the lander. Step completes when no alive non-aboard
    // survivors remain.
    if (this.aliveSurvivors > 0) {
      this.updateExtractInteraction(ctx)
      return
    }
    this.advanceStep(3)

    if (!this.armed) {
      this.updateVirusInteraction(ctx)
      return
    }
```

The existing countdown / detonate logic immediately after stays unchanged.

- [ ] **Step 9: Add `updateExtractInteraction` and `findExtractTarget`**

Add these two private methods anywhere in the class (e.g. above `updateVirusInteraction`):

```ts
  /**
   * Step-3 prompt + recruit handler. Raycasts from the player camera; if it hits
   * a kneeling hostage within {@link RESCUE_RAYCAST_RANGE}, prompt to press E
   * and recruit on press.
   */
  private updateExtractInteraction(ctx: MiniGameContext): void {
    if (ctx.levelState !== 'eva' || !ctx.playerPosition || !ctx.playerForward) {
      this.onPrompt?.(null)
      return
    }

    const hit = this.findExtractTarget(ctx)
    if (hit) {
      this._isPlayerNear = true
      this.onPrompt?.('[E] EXTRACT SURVIVOR')
      if (ctx.terminalInteractPressed) {
        const captured = this.lastLanderPosition.clone()
        this.hostages.recruit(hit, () => {
          // Update the captured vector each tick to match the live lander pos.
          captured.copy(this.lastLanderPosition)
          return captured
        })
      }
    } else {
      this.onPrompt?.('LOOK AT A SURVIVOR. PRESS [E] TO EXTRACT')
    }
  }

  /**
   * Sphere-intersect the player's look ray against every kneeling hostage's
   * existing hit sphere. Returns the closest live hit within
   * {@link RESCUE_RAYCAST_RANGE}, or `null`.
   */
  private findExtractTarget(ctx: MiniGameContext): Hostage | null {
    if (!ctx.playerPosition || !ctx.playerForward) return null
    const ox = ctx.playerPosition.x
    const oy = ctx.playerPosition.y
    const oz = ctx.playerPosition.z
    const dx = ctx.playerForward.x
    const dy = ctx.playerForward.y
    const dz = ctx.playerForward.z

    let bestT = RESCUE_RAYCAST_RANGE
    let best: Hostage | null = null

    for (const hostage of this.hostages.getHostages()) {
      // Only kneeling hostages are recruitable. (Walkers and dying are out.)
      const inst = this.hostages.getInstanceForDebug?.(hostage)
      if (inst && inst.model.getState() !== 'praying') continue

      const cx = hostage.position.x
      const cy = hostage.position.y
      const cz = hostage.position.z
      const r = hostage.hitRadius

      // Ray-sphere intersection: |o + t*d - c|^2 = r^2
      const ex = ox - cx
      const ey = oy - cy
      const ez = oz - cz
      const b = ex * dx + ey * dy + ez * dz
      const c = ex * ex + ey * ey + ez * ez - r * r
      const disc = b * b - c
      if (disc < 0) continue
      const t = -b - Math.sqrt(disc)
      if (t < 0 || t > bestT) continue
      bestT = t
      best = hostage
    }

    return best
  }
```

> **Note for the implementer:** `getInstanceForDebug` is a small helper added in Step 10 below that exposes the `HostageInstance` for a given `Hostage`. It exists because animation state lives on the model, not the domain entity. Add it as written in Step 10; don't substitute a different shape.

- [ ] **Step 10: Expose hostage state lookup on `FpsHostageController`**

Open `src/three/FpsHostageController.ts` (already touched in Task 5) and add this helper near the other lookup methods (e.g. above `clear`):

```ts
  /**
   * Look up a {@link HostageInstance} for a given {@link Hostage} (or undefined).
   * Used by `RescueMinigame.findExtractTarget` to filter kneeling hostages.
   */
  getInstanceForDebug(hostage: Hostage): HostageInstance | undefined {
    return this.instances.find((i) => i.hostage === hostage)
  }
```

(The name preserves the "this is implementation-leaky, only call when you really need the inner instance" hint — same convention as `getHostageEntitiesForDirector`.)

The `HostageInstance` class is currently un-exported. To make the return type valid in callers' type-check, change the class declaration line `class HostageInstance {` to `export class HostageInstance {`.

- [ ] **Step 11: Update the `fail` path so it also clears walkers via `hostages.clear()`**

The existing `fail()` already calls `this.hostages.clear()` which (after Task 5 step 9) clears walkers and resets aboard count. No change needed — verify by reading the existing method body and confirming the call is present.

- [ ] **Step 12: Verify**

```bash
bun run type-check && bun run lint
```

Expected: both pass.

- [ ] **Step 13: Commit**

```bash
git add src/lib/minigame/RescueMinigame.ts src/three/FpsHostageController.ts
git commit -m "feat(rescue): add Extract step + counters + recruit interaction + lock predicate"
```

---

## Task 7: `LanderController` Liftoff Lock

**Files:**
- Modify: `src/three/LanderController.ts`

Add an external `liftoffBlocked` flag the level VC writes each tick from `RescueMinigame.isLiftoffLocked`. The `isMainEngineActive` getter consults it and returns false when blocked. RCS stays unaffected so the player can still rotate / settle.

- [ ] **Step 1: Add the flag + setter**

In `src/three/LanderController.ts`, find the `isMainEngineActive` getter (around line 673):

```ts
  get isMainEngineActive(): boolean {
    return (
      this.inputManager.isActionActive('mainEngine') &&
      this.thrusterSystem.canFire('mainEngine', this.landerBurnRateModifiers())
    )
  }
```

Insert directly above it:

```ts
  /**
   * External liftoff lock. When true, {@link isMainEngineActive} reports false
   * regardless of input — used by `RescueMinigame` to prevent the player from
   * stranding survivors mid-extraction. RCS is intentionally unaffected so the
   * player can still rotate and settle the grounded lander.
   */
  private _liftoffBlocked = false

  /**
   * Set the liftoff-lock state. The level VC writes this each tick from the
   * active minigame's `isLiftoffLocked` predicate.
   *
   * @param blocked - True to clamp main-engine output to nothing
   */
  setLiftoffBlocked(blocked: boolean): void {
    this._liftoffBlocked = blocked
  }

  /**
   * True when the player is mashing main-engine input but the lock is
   * suppressing it. Drives the level VC's `notifyLiftoffAttemptBlocked` call.
   */
  get isLiftoffAttemptedWhileBlocked(): boolean {
    return this._liftoffBlocked && this.inputManager.isActionActive('mainEngine')
  }
```

Then change the existing `isMainEngineActive` getter to:

```ts
  get isMainEngineActive(): boolean {
    if (this._liftoffBlocked) return false
    return (
      this.inputManager.isActionActive('mainEngine') &&
      this.thrusterSystem.canFire('mainEngine', this.landerBurnRateModifiers())
    )
  }
```

- [ ] **Step 2: Verify**

```bash
bun run type-check && bun run lint
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/three/LanderController.ts
git commit -m "feat(lander): external liftoff lock that suppresses main engine without affecting RCS"
```

---

## Task 8: Bind Liftoff Lock + Survivor Events in the Level Layer

**Files:**
- Modify: `src/lib/level/LevelMinigameFacade.ts`
- Modify: `src/views/LevelViewController.ts`

The facade already wires per-minigame callbacks via `LevelMinigameBindings`. Add the two new survivor events. The `LevelViewController` reads `RescueMinigame.isLiftoffLocked` each tick, writes it onto the lander, and forwards `isLiftoffAttemptedWhileBlocked` back into the minigame. It also exposes the survivor events so `LevelView.vue` (Task 10) can fire toasts.

- [ ] **Step 1: Add the new bindings**

In `src/lib/level/LevelMinigameFacade.ts`, find the `LevelMinigameBindings` interface and add these two members anywhere (e.g. right after `onRescueFail`):

```ts
  /** Fired by RescueMinigame when a hostage dies (combat or extraction). */
  onSurvivorLost: ((aliveRemaining: number) => void) | null
  /** Fired by RescueMinigame when a recruited walker boards the lander. */
  onSurvivorAboard: ((aboardCount: number) => void) | null
```

- [ ] **Step 2: Wire them on the rescue minigame inside `initializeObjectives`**

Find the rescue branch:

```ts
      } else if (objective.type === 'rescue') {
        const minigame = await RescueMinigame.create(...)
        this.applySharedBindings(minigame, bindings)
        minigame.onDamagePlayer = bindings.onDamagePlayer
        minigame.onKillPlayer = bindings.onKillPlayer
        minigame.onDestroyLander = () => bindings.onDestroyLander?.('rescue')
        minigame.onExplosion = (position) =>
          bindings.onExplosion?.('rescue', position.x, position.y, position.z)
        minigame.onFail = bindings.onRescueFail
        bindings.onInstallCombatDropObserver?.(minigame)
        this.add(minigame)
      }
```

Insert these two assignments (e.g. directly after `minigame.onFail = bindings.onRescueFail`):

```ts
        minigame.onSurvivorLost = bindings.onSurvivorLost
        minigame.onSurvivorAboard = bindings.onSurvivorAboard
```

- [ ] **Step 3: Add controller-side event sinks + lander gate**

In `src/views/LevelViewController.ts`, find the bindings literal that's passed into `facade.initializeObjectives` (grep for `onRescueFail:` to land near it). Add these two lines into that literal (anywhere within the `bindings: { ... }` object):

```ts
        onSurvivorLost: (aliveRemaining: number) => {
          this.onSurvivorLost?.(aliveRemaining)
        },
        onSurvivorAboard: (aboardCount: number) => {
          this.onSurvivorAboard?.(aboardCount)
        },
```

Add the matching public sinks on the controller class (near the existing `onSurvey` etc.):

```ts
  /** Vue layer subscribes to fire the red survivor-lost toast + counter refresh. */
  onSurvivorLost: ((aliveRemaining: number) => void) | null = null
  /** Vue layer subscribes to fire the green survivor-aboard toast + counter refresh. */
  onSurvivorAboard: ((aboardCount: number) => void) | null = null
```

- [ ] **Step 4: Drive `setLiftoffBlocked` + `notifyLiftoffAttemptBlocked` each tick**

Inside the controller's main update loop, find a place near where `this.facade.tick(...)` is called. Immediately after that call (so the minigame's `isLiftoffLocked` reflects this frame's state), add:

```ts
    const activeMinigame = this.facade.getActive()
    if (activeMinigame instanceof RescueMinigame && this.lander) {
      const locked = activeMinigame.isLiftoffLocked
      this.lander.setLiftoffBlocked(locked)
      if (locked && this.lander.isLiftoffAttemptedWhileBlocked) {
        activeMinigame.notifyLiftoffAttemptBlocked()
      }
    } else if (this.lander) {
      this.lander.setLiftoffBlocked(false)
    }
```

You'll need a `RescueMinigame` import at the top of `LevelViewController.ts` if it isn't already present:

```ts
import { RescueMinigame } from '@/lib/minigame/RescueMinigame'
```

> **Note for the implementer:** confirm the controller's lander field name (likely `this.lander` or `this.landerController`). The existing `onDestroyLander`/`landerPosition` plumbing in this file uses the same handle — match its identifier.

- [ ] **Step 5: Verify**

```bash
bun run type-check && bun run lint
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/level/LevelMinigameFacade.ts src/views/LevelViewController.ts
git commit -m "feat(level): bind survivor events + drive liftoff lock from RescueMinigame"
```

---

## Task 9: Survivor Toast Entry + LevelView Wiring

**Files:**
- Modify: `src/components/PickupToast.vue`
- Modify: `src/views/LevelView.vue`

Mirror the existing `surveyEntries` pattern from commit `5b26617`: define a new toast entry type, add a reactive list + record/clear functions, wire the controller events to push entries.

- [ ] **Step 1: Add `SurvivorEventEntry` to PickupToast**

In `src/components/PickupToast.vue`, find the `SurveyEntry` export:

```ts
/** A survey-reveal entry shown alongside mineral pickups and prospect completes. */
export interface SurveyEntry {
  /** Stable v-for key. */
  id: string
  /** Display label — vague RP-flavored text. */
  label: string
}
```

Insert directly below it:

```ts
/** A rescue-survivor event (lost or aboard) shown in the same toast stack. */
export interface SurvivorEventEntry {
  /** Stable v-for key. */
  id: string
  /** `'lost'` = red death toast; `'aboard'` = green board toast. */
  kind: 'lost' | 'aboard'
  /** Display label, e.g. `'Survivor Lost'` or `'Survivor Aboard'`. */
  label: string
}
```

Find the `defineProps` literal (around line 55-65):

```ts
const props = withDefaults(defineProps<{
  /** Active mineral pickups, oldest first. */
  pickups: readonly PickupEntry[]
  /** Active prospect-complete entries, oldest first. */
  prospectEntries?: readonly ProspectEntry[]
  /** Active survey-reveal entries, oldest first. */
  surveyEntries?: readonly SurveyEntry[]
  /** Optional max number of toasts to render simultaneously. */
  maxVisible?: number
}>()
```

Add the survivor list as another optional prop:

```ts
  /** Active survivor-event entries, oldest first. */
  survivorEntries?: readonly SurvivorEventEntry[]
```

In the `<script setup>` block, find the existing `visibleSurveys` computed (it caps survey entries to `maxVisible`) and add a sibling computed beside it:

```ts
const visibleSurvivors = computed(() => {
  const list = props.survivorEntries ?? []
  return props.maxVisible == null ? list : list.slice(-props.maxVisible)
})
```

In the `<template>` block, find the existing survey render block:

```vue
      <div
        v-for="entry in visibleSurveys"
        :key="entry.id"
        class="pickup-toast__entry pickup-toast__entry--survey"
      >
        <span class="pickup-toast__check">▲</span>
        <span class="pickup-toast__survey-label">{{ entry.label }}</span>
      </div>
```

Insert this directly after it (still inside the `<transition-group>`):

```vue
      <div
        v-for="entry in visibleSurvivors"
        :key="entry.id"
        :class="[
          'pickup-toast__entry',
          entry.kind === 'lost'
            ? 'pickup-toast__entry--survivor-lost'
            : 'pickup-toast__entry--survivor-aboard',
        ]"
      >
        <span class="pickup-toast__check">{{ entry.kind === 'lost' ? '✕' : '✓' }}</span>
        <span class="pickup-toast__survivor-label">{{ entry.label }}</span>
      </div>
```

In the `<style>` block, append these rules at the end (right before `@keyframes pickup-toast-bump`):

```css
.pickup-toast__entry--survivor-lost {
  color: rgba(239, 68, 68, 0.95);
  border-color: rgba(239, 68, 68, 0.55);
  background: rgba(36, 6, 6, 0.62);
  box-shadow:
    0 0 14px rgba(239, 68, 68, 0.22),
    inset 0 0 8px rgba(239, 68, 68, 0.08);
}
.pickup-toast__entry--survivor-aboard {
  color: rgba(34, 197, 94, 0.95);
  border-color: rgba(34, 197, 94, 0.55);
  background: rgba(2, 32, 14, 0.62);
  box-shadow:
    0 0 14px rgba(34, 197, 94, 0.22),
    inset 0 0 8px rgba(34, 197, 94, 0.08);
}
.pickup-toast__survivor-label {
  letter-spacing: 0.18em;
}
```

- [ ] **Step 2: Wire the event sinks in `LevelView.vue`**

In `src/views/LevelView.vue`, find the imports block:

```ts
import type { PickupEntry, ProspectEntry, SurveyEntry } from '@/components/PickupToast.vue'
```

Change it to:

```ts
import type {
  PickupEntry,
  ProspectEntry,
  SurveyEntry,
  SurvivorEventEntry,
} from '@/components/PickupToast.vue'
```

Find the `surveyEntries` reactive block (added in commit `5b26617`):

```ts
const surveyEntries = ref<SurveyEntry[]>([])
const SURVEY_TOAST_LIFETIME_SEC = 5.0
const surveyTimers = new Map<string, ReturnType<typeof Timer.after>>()
let surveySeq = 0

function recordSurvey(label: string): void { ... }
```

Insert directly below it (matching the pattern):

```ts
const survivorEntries = ref<SurvivorEventEntry[]>([])
const SURVIVOR_TOAST_LIFETIME_SEC = 1.8
const survivorTimers = new Map<string, ReturnType<typeof Timer.after>>()
let survivorSeq = 0

/**
 * Push a survivor event toast (lost or aboard) and auto-remove it after
 * {@link SURVIVOR_TOAST_LIFETIME_SEC}. Each call gets its own timer so
 * back-to-back events don't clobber each other.
 */
function recordSurvivor(kind: 'lost' | 'aboard'): void {
  survivorSeq += 1
  const label = kind === 'lost' ? 'Survivor Lost' : 'Survivor Aboard'
  const entry: SurvivorEventEntry = { id: `survivor-${survivorSeq}`, kind, label }
  survivorEntries.value.push(entry)
  const handle = Timer.after(SURVIVOR_TOAST_LIFETIME_SEC, () => {
    const idx = survivorEntries.value.findIndex((p) => p.id === entry.id)
    if (idx >= 0) survivorEntries.value.splice(idx, 1)
    survivorTimers.delete(entry.id)
  })
  survivorTimers.set(entry.id, handle)
}
```

Find the existing `clearPickups` function. After the `surveyTimers.clear()` line, add:

```ts
  for (const handle of survivorTimers.values()) Timer.cancel(handle)
  survivorTimers.clear()
  survivorEntries.value = []
```

Find the `viewController.onSurvey = (label) => { recordSurvey(label) }` assignment. Add directly after:

```ts
    viewController.onSurvivorLost = () => {
      recordSurvivor('lost')
    }
    viewController.onSurvivorAboard = () => {
      recordSurvivor('aboard')
    }
```

Find the `<PickupToast ... :survey-entries="surveyEntries" />` usage in the template. Add `:survivor-entries="survivorEntries"` as another bound prop on the same component.

- [ ] **Step 3: Verify**

```bash
bun run type-check && bun run lint
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/PickupToast.vue src/views/LevelView.vue
git commit -m "feat(hud): wire survivor lost/aboard toasts into PickupToast stack"
```

---

## Task 10: `RescueSurvivorPanel` Persistent HUD Overlay

**Files:**
- Create: `src/components/RescueSurvivorPanel.vue`
- Modify: `src/views/LevelView.vue`

A small always-visible overlay that reads the three counts and renders one line. Only mounted when the active minigame is a `RescueMinigame` (so it doesn't pollute survey/photometry/etc. missions).

- [ ] **Step 1: Create the component**

Create `src/components/RescueSurvivorPanel.vue`:

```vue
<script setup lang="ts">
/**
 * Persistent rescue-mission HUD: TOTAL · ALIVE · ABOARD.
 *
 * Mounted by `LevelView.vue` whenever the active minigame is a `RescueMinigame`.
 * Reads three reactive count refs from the parent — the parent polls the
 * minigame each tick and updates these refs.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-rescue-extraction-phase-design.md
 */
import { computed } from 'vue'

const props = defineProps<{
  /** Total survivors released onto the ground (snapshot, never decremented). */
  total: number
  /** Currently alive AND not yet aboard. */
  alive: number
  /** Cumulative count of survivors who walked into the lander. */
  aboard: number
}>()

const aliveColor = computed(() => {
  if (props.alive <= 1) return 'rescue-alive-low'
  if (props.total > 0 && props.alive / props.total < 0.5) return 'rescue-alive-mid'
  return 'rescue-alive-high'
})
</script>

<template>
  <div class="rescue-survivor-panel">
    <span class="rescue-label">SURVIVORS:</span>
    <span :class="['rescue-alive', aliveColor]">{{ alive }} ALIVE</span>
    <span class="rescue-sep">·</span>
    <span class="rescue-aboard">{{ aboard }} ABOARD</span>
    <span class="rescue-sep">·</span>
    <span class="rescue-total">{{ total }} TOTAL</span>
  </div>
</template>

<style scoped>
.rescue-survivor-panel {
  @apply absolute top-24 left-4 z-30 px-3 py-1.5 rounded bg-black/55 border border-white/10
         font-mono text-sm tracking-wider text-white/85 select-none flex items-center gap-2;
}
.rescue-label { @apply text-white/55; }
.rescue-alive-high { @apply text-emerald-400; }
.rescue-alive-mid  { @apply text-amber-300; }
.rescue-alive-low  { @apply text-red-400 font-semibold; }
.rescue-aboard     { @apply text-sky-300; }
.rescue-total      { @apply text-white/65; }
.rescue-sep        { @apply text-white/30; }
</style>
```

> **Implementer note:** the `top-24 left-4` anchor sits below the existing objective tracker. If your build of `LevelView.vue` already crowds that area, swap to `top-4 right-4` or use a different vertical offset — match the project's existing HUD geometry conventions.

- [ ] **Step 2: Mount it conditionally in `LevelView.vue`**

In `src/views/LevelView.vue`, add the import in the `<script setup>` block:

```ts
import RescueSurvivorPanel from '@/components/RescueSurvivorPanel.vue'
import { RescueMinigame } from '@/lib/minigame/RescueMinigame'
```

Add three reactive count refs near the other `ref(...)` declarations:

```ts
const rescueTotal = ref(0)
const rescueAlive = ref(0)
const rescueAboard = ref(0)
const rescueActive = ref(false)
```

In the existing per-frame update path (the same place where the `pickups` / objective tracker refs are refreshed — grep for `pickups.value` to land near it), add:

```ts
    const active = viewController.getActiveMinigame?.()
    if (active instanceof RescueMinigame) {
      rescueActive.value = true
      rescueTotal.value = active.totalSurvivors
      rescueAlive.value = active.aliveSurvivors
      rescueAboard.value = active.aboardSurvivors
    } else {
      rescueActive.value = false
    }
```

If `LevelViewController` doesn't already expose a `getActiveMinigame()` accessor, add one:

```ts
  /** Active minigame (first one with `status === 'active'`), if any. */
  getActiveMinigame(): MiniGame | undefined {
    return this.facade.getActive()
  }
```

(Add `import type { MiniGame } from '@/lib/minigame/MiniGame'` to the controller if needed.)

In the `<template>` block, mount the panel conditionally — anywhere reasonable, e.g. next to the existing objective tracker:

```vue
  <RescueSurvivorPanel
    v-if="rescueActive"
    :total="rescueTotal"
    :alive="rescueAlive"
    :aboard="rescueAboard"
  />
```

- [ ] **Step 3: Verify**

```bash
bun run type-check && bun run lint
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/RescueSurvivorPanel.vue src/views/LevelView.vue src/views/LevelViewController.ts
git commit -m "feat(hud): persistent SURVIVORS panel for rescue missions"
```

---

## Task 11: Manual Playtest Checklist

**No code changes.** Run the dev server and execute the checklist below. If anything fails, file follow-up tasks before declaring done.

- [ ] **Step 1: Start the dev server**

```bash
bun dev
```

Open the URL the server prints. Use the level/route that loads a rescue mission (look for an existing dev shortcut, or pick a rescue mission from the map).

- [ ] **Step 2: Kneel-pose visual check (Task 1 verification)**

Land near the outbreak zone. Watch the contained-virus hostages — they should still be in T-pose (no animation). After landing, watch the released hostages bow into the praying loop. **Confirm** their feet/knees touch the ground; they should not float above it. If they still float, the rescaling factor is wrong — try the `KNEEL_GROUND_OFFSET` fallback path described in the spec's §"Kneel Pose Fix".

- [ ] **Step 3: Death notification (Task 5 + 9 verification)**

Let an enemy kill one hostage. **Confirm:**
- Red `Survivor Lost` toast appears in the toast stack and disappears after ~1.8s.
- The persistent SURVIVORS panel decrements ALIVE by 1, TOTAL stays the same.
- The hostage's HP bar disappears immediately; the corpse stays visible (dying clip clamps).
- If you kill the LAST hostage, the existing `'All Survivors Lost'` fail prompt fires.

- [ ] **Step 4: Heal step still works (regression check)**

Med-beam every surviving hostage to full HP. **Confirm** the existing "Heal the survivors" step completes (objective tracker checks it off) and the new "Extract the survivors" step becomes active.

- [ ] **Step 5: Recruit interaction (Task 6 verification)**

Walk near a praying hostage and look at it. **Confirm:**
- Prompt reads `[E] EXTRACT SURVIVOR` when the crosshair is on the hostage.
- Prompt reads `LOOK AT A SURVIVOR. PRESS [E] TO EXTRACT` when crosshair is off.
- Press E. The hostage plays the stand-up clip (one-shot rise); during this clip they should NOT slide laterally — they rise in place.
- After the stand-up clip finishes, they begin walking toward the lander.

- [ ] **Step 6: Walking + boarding (Task 4 + 5 verification)**

Watch a recruited hostage walk to the lander. **Confirm:**
- They follow the heightmap (they go up/down with the terrain).
- They face their direction of travel.
- When within ~6m of the lander, they fade out (scale + opacity drop over ~0.4s) and disappear.
- Green `Survivor Aboard` toast fires; ABOARD count increments by 1; ALIVE decrements by 1.

- [ ] **Step 7: Liftoff lock (Task 7 + 8 verification)**

While at least one survivor is still walking or kneeling, get back into the lander and try to lift off (hold main engine).

**Confirm:**
- The lander does NOT lift. RCS still works.
- A `LIFTOFF LOCKED — EXTRACT ALL SURVIVORS` prompt flashes and persists for ~2s while you hold the throttle.
- Holding longer doesn't spam — only one flash per ~2s.

Extract every survivor. **Confirm** main engine works again immediately after the last survivor boards.

- [ ] **Step 8: Step ordering (Task 6 verification)**

After all survivors are aboard, the "Extract the survivors" step should check off and the "Destroy the virus infestation" step should become active. **Confirm** the existing `[E] PLANT CHARGES ON THE VIRUS` flow then works as before, runs the 5s countdown, and detonates correctly.

- [ ] **Step 9: Edge case — death during walk**

Recruit a hostage. While they're walking toward the lander, force damage them to zero (e.g. residual hazard, leftover enemy projectile in flight). **Confirm:**
- Red `Survivor Lost` toast fires.
- Walker is removed; the corpse plays dying clip in place; no stuck walker.
- ALIVE decrements; ABOARD stays the same.
- If they were the last one, mission fails as expected.

- [ ] **Step 10: Edge case — recruit while liftoff lock just cleared**

After every survivor has boarded, lift off briefly, then land again. **Confirm** there's no stuck "lock attempted" prompt and no leftover walkers.

- [ ] **Step 11: All checks pass — declare done**

If every step above is green, the feature is shippable. If any step fails, file the specific symptom as a follow-up before claiming completion.

---

## Self-Review Checklist (run before handoff)

- [ ] Every task has a commit step with explicit `git add` paths.
- [ ] No "TBD", "TODO", "implement later", or "similar to Task N" placeholders.
- [ ] Type names + method signatures used in later tasks match what earlier tasks declared (`recruit`, `aboardCount`, `aliveCountNotAboard`, `setLiftoffBlocked`, `isLiftoffAttemptedWhileBlocked`, `isLiftoffLocked`, `notifyLiftoffAttemptBlocked`, `onSurvivorLost`, `onSurvivorAboard`, `getInstanceForDebug`, `getActiveMinigame`).
- [ ] Spec sections covered: Mission Flow Change (Task 6), Animation State Machine (Task 2), HostageWalker (Task 4), Recruit Interaction (Task 6), HUD toasts + counter (Tasks 9 + 10), Liftoff Lock (Tasks 7 + 8), Kneel Pose Fix (Task 1), Counter Model (Task 5 + 6).
- [ ] Manual playtest checklist (Task 11) covers every observable behavior the spec promised.
