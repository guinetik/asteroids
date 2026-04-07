# Exfil System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the player exfiltrate the asteroid by flying the lander back to the parked shuttle, triggering a reverse cinematic cutscene, then redirecting to the star map.

**Architecture:** Extend `levelStateMachine` with `exfil` transition + guards. Add `playExfil()` to `ArrivalSequence` for the reverse cinematic (dock → doors close → flip → depart → fade). Wire `LevelViewController` with `enterExfil()`/`enterComplete()` and HUD prompt.

**Tech Stack:** TypeScript, Three.js, Vue 3

**Spec:** `docs/superpowers/specs/2026-04-06-exfil-system-design.md`

---

### Task 1: Extend Level State Machine with Exfil Transitions

**Files:**
- Modify: `src/lib/level/levelStateMachine.ts`
- Test: `src/lib/__tests__/levelStateMachine.spec.ts`

- [ ] **Step 1: Write failing tests for exfil transitions**

Add these tests to the existing test file (or create it if it doesn't exist):

```ts
describe('exfil transitions', () => {
  it('transitions lander → exfil on exfiltrate when near shuttle and has EVA history', () => {
    const onChange = vi.fn()
    const sm = createLevelStateMachine({
      onStateChange: onChange,
      isLanderGrounded: () => true,
      isPlayerNearLander: () => true,
      isLanderNearShuttle: () => true,
      hasCompletedEva: () => true,
    })
    // arrival → lander (advance past arrival duration)
    sm.tick(ARRIVAL_DURATION + 0.1)
    expect(sm.state).toBe('lander')

    expect(sm.trigger('exfiltrate')).toBe(true)
    expect(sm.state).toBe('exfil')
  })

  it('blocks exfiltrate when lander is NOT near shuttle', () => {
    const sm = createLevelStateMachine({
      onStateChange: vi.fn(),
      isLanderGrounded: () => true,
      isPlayerNearLander: () => true,
      isLanderNearShuttle: () => false,
      hasCompletedEva: () => true,
    })
    sm.tick(ARRIVAL_DURATION + 0.1)
    expect(sm.trigger('exfiltrate')).toBe(false)
    expect(sm.state).toBe('lander')
  })

  it('blocks exfiltrate when player has NOT completed EVA', () => {
    const sm = createLevelStateMachine({
      onStateChange: vi.fn(),
      isLanderGrounded: () => true,
      isPlayerNearLander: () => true,
      isLanderNearShuttle: () => true,
      hasCompletedEva: () => false,
    })
    sm.tick(ARRIVAL_DURATION + 0.1)
    expect(sm.trigger('exfiltrate')).toBe(false)
    expect(sm.state).toBe('lander')
  })

  it('auto-transitions exfil → complete after EXFIL_SEQUENCE_DURATION', () => {
    const sm = createLevelStateMachine({
      onStateChange: vi.fn(),
      isLanderGrounded: () => true,
      isLanderNearShuttle: () => true,
      hasCompletedEva: () => true,
    })
    sm.tick(ARRIVAL_DURATION + 0.1)
    sm.trigger('exfiltrate')
    expect(sm.state).toBe('exfil')

    sm.tick(EXFIL_SEQUENCE_DURATION + 0.1)
    expect(sm.state).toBe('complete')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/__tests__/levelStateMachine.spec.ts`
Expected: FAIL — `isLanderNearShuttle` and `hasCompletedEva` don't exist on the options type, `EXFIL_SEQUENCE_DURATION` is not exported.

- [ ] **Step 3: Add new exports and extend the state machine**

In `src/lib/level/levelStateMachine.ts`:

1. Add the exfil duration constant and export:

```ts
/** Total exfil cutscene duration in seconds. */
export const EXFIL_SEQUENCE_DURATION = 13.0

/** Vertical distance (world units) to shuttle that enables exfil. */
export const EXFIL_PROXIMITY_RANGE = 100
```

2. Add new guard fields to `LevelStateMachineOptions`:

```ts
/** Guard: is the lander within exfil range of the shuttle? Defaults to () => false. */
isLanderNearShuttle?: () => boolean
/** Guard: has the player completed at least one EVA? Defaults to () => false. */
hasCompletedEva?: () => boolean
```

3. Wire the guards in `createLevelStateMachine`:

```ts
const isNearShuttle = options.isLanderNearShuttle ?? (() => false)
const hasEva = options.hasCompletedEva ?? (() => false)
```

4. Add `exfiltrate` trigger to the `lander` state and wire `exfil` state:

```ts
lander: {
  on: {
    exitVehicle: {
      target: 'eva',
      guard: () => isGrounded(),
    },
    exfiltrate: {
      target: 'exfil',
      guard: () => isNearShuttle() && hasEva(),
    },
  },
},
// ...
exfil: {
  duration: EXFIL_SEQUENCE_DURATION,
  next: 'complete',
},
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/__tests__/levelStateMachine.spec.ts`
Expected: All exfil tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/level/levelStateMachine.ts src/lib/__tests__/levelStateMachine.spec.ts
git commit -m "feat(level): add exfil state transitions with proximity and EVA guards"
```

---

### Task 2: Add `playExfil()` Reverse Cutscene to ArrivalSequence

**Files:**
- Modify: `src/three/ArrivalSequence.ts`

- [ ] **Step 1: Add exfil phase constants**

Below the existing arrival phase constants, add:

```ts
// ── Exfil phase durations (seconds) — reverse of arrival ────────
/** Lander rises into cargo bay. */
const EXFIL_DOCK_DURATION = 3.0
/** Cargo doors close. */
const EXFIL_DOORS_DURATION = 2.0
/** Shuttle flips 180° back upright. */
const EXFIL_FLIP_DURATION = 2.5
/** Shuttle accelerates away. */
const EXFIL_DEPART_DURATION = 4.0
/** Fade to black. */
const EXFIL_FADEOUT_DURATION = 1.5

/** Total exfil cutscene duration (must match levelStateMachine). */
export const EXFIL_SEQUENCE_DURATION =
  EXFIL_DOCK_DURATION +
  EXFIL_DOORS_DURATION +
  EXFIL_FLIP_DURATION +
  EXFIL_DEPART_DURATION +
  EXFIL_FADEOUT_DURATION
```

Add the exfil phase type:

```ts
type ExfilPhase = 'dock' | 'closeDoors' | 'flipBack' | 'depart' | 'exfilFadeout' | 'done'
```

- [ ] **Step 2: Add exfil state fields to ArrivalSequence**

```ts
// ── Exfil state ─────────────────────────────────────────────────
private exfilPhase: ExfilPhase | null = null
private exfilPhaseElapsed = 0
private exfilLanderStartY = 0
private exfilLanderTargetY = 0
private exfilDepartStartPos = new THREE.Vector3()
private exfilDepartEndPos = new THREE.Vector3()
```

- [ ] **Step 3: Implement `playExfil()` entry method**

```ts
/**
 * Start the exfil reverse cutscene.
 * The shuttle is already parked at LANDER_PARK_ALTITUDE with doors open.
 * Spawns a cinematic lander that rises into the cargo bay.
 *
 * @param landerPosition - Current world position of the gameplay lander.
 */
playExfil(landerPosition: THREE.Vector3): void {
  this.exfilPhase = 'dock'
  this.exfilPhaseElapsed = 0

  // Store lander start/target Y for dock animation
  this.exfilLanderStartY = landerPosition.y
  this.exfilLanderTargetY = LANDER_PARK_ALTITUDE

  // Create a visible falling lander at the gameplay lander position
  if (this.landerModel) {
    // Re-use the lander model — reparent to scene root at gameplay position
    this.landerModel.removeFromParent()
    this.landerModel.position.copy(landerPosition)
    this.landerModel.rotation.set(0, 0, 0)
    // Match gameplay lander scale (MODEL_SCALE * gameplay = 0.01 * 500 = 5)
    // The parked shuttle is at SHUTTLE_PARKED_SCALE=15, so cargo lander at
    // CARGO_LANDER_SCALE=30 in model space is 30*0.01*15 = 4.5 ≈ 5
    this.landerModel.scale.setScalar(5)
    this.shuttleGroup.parent?.add(this.landerModel)
    this.fallingLander = this.landerModel
  }

  // Depart path — shuttle flies away from asteroid
  this.exfilDepartStartPos.copy(this.shuttleGroup.position)
  this.exfilDepartEndPos.set(
    this.shuttleGroup.position.x,
    this.shuttleGroup.position.y + 500,
    this.shuttleGroup.position.z - APPROACH_START_DISTANCE,
  )

  // Camera: start looking at the shuttle from below
  this.camera.position.set(
    this.shuttleGroup.position.x + 60,
    this.shuttleGroup.position.y - 40,
    this.shuttleGroup.position.z + 80,
  )
  this.camera.lookAt(this.shuttleGroup.position)

  // Re-enable thruster sprites for departure
  for (const sprite of this.thrusterSprites) {
    sprite.visible = false
  }
}
```

- [ ] **Step 4: Implement `tickExfil()` dispatcher**

Add to the `tick()` method, at the top before the arrival phase check:

```ts
// Exfil sequence (separate from arrival)
if (this.exfilPhase && this.exfilPhase !== 'done') {
  this.exfilPhaseElapsed += dt
  this.thrusterElapsed += dt
  this.tickExfilPhase()
  return
}
```

And the dispatcher method:

```ts
/** Dispatch to the current exfil phase ticker. */
private tickExfilPhase(): void {
  switch (this.exfilPhase) {
    case 'dock':
      this.tickExfilDock()
      break
    case 'closeDoors':
      this.tickExfilCloseDoors()
      break
    case 'flipBack':
      this.tickExfilFlip()
      break
    case 'depart':
      this.tickExfilDepart()
      break
    case 'exfilFadeout':
      this.tickExfilFadeout()
      break
  }
}
```

- [ ] **Step 5: Implement exfil dock phase**

```ts
/** Lander rises from current position into the cargo bay. */
private tickExfilDock(): void {
  const t = Math.min(1, this.exfilPhaseElapsed / EXFIL_DOCK_DURATION)
  const eased = this.easeInOut(t)

  if (this.fallingLander) {
    this.fallingLander.position.y = THREE.MathUtils.lerp(
      this.exfilLanderStartY,
      this.exfilLanderTargetY,
      eased,
    )
  }

  // Camera watches lander rise toward shuttle
  const camTarget = this.shuttleGroup.position.clone()
  camTarget.y -= 20
  this.camera.position.set(
    this.shuttleGroup.position.x + 80,
    THREE.MathUtils.lerp(this.exfilLanderStartY + 20, this.exfilLanderTargetY - 10, eased),
    this.shuttleGroup.position.z + 60,
  )
  this.camera.lookAt(camTarget)

  if (t >= 1) {
    // Reparent lander back into shuttle cargo bay
    if (this.fallingLander) {
      this.fallingLander.removeFromParent()
      this.fallingLander = null
    }
    this.nextExfilPhase('closeDoors')
  }
}
```

- [ ] **Step 6: Implement exfil close doors phase**

```ts
/** Cargo bay doors swing shut. */
private tickExfilCloseDoors(): void {
  const t = Math.min(1, this.exfilPhaseElapsed / EXFIL_DOORS_DURATION)

  // doorProgress goes from 1 (open) to 0 (closed)
  this.doorProgress = 1 - this.easeInOut(t)
  this.updateDoorRotation()

  // Camera stays on the belly watching doors close
  this.camera.position.set(
    this.shuttleGroup.position.x + 60,
    this.shuttleGroup.position.y - 15,
    this.shuttleGroup.position.z + 50,
  )
  const camTarget = this.shuttleGroup.position.clone()
  camTarget.y -= 5
  this.camera.lookAt(camTarget)

  if (t >= 1) this.nextExfilPhase('flipBack')
}
```

- [ ] **Step 7: Implement exfil flip phase**

```ts
/** Shuttle rotates 180° back upright. */
private tickExfilFlip(): void {
  const t = Math.min(1, this.exfilPhaseElapsed / EXFIL_FLIP_DURATION)
  const eased = this.easeInOut(t)

  // Parked rotation is (Math.PI, -Math.PI/2, 0) — pitch back to 0
  const startPitch = Math.PI
  const endPitch = 0
  this.shuttleGroup.rotation.set(
    THREE.MathUtils.lerp(startPitch, endPitch, eased),
    -Math.PI / 2,
    0,
    'YXZ',
  )

  // Camera orbits around to watch the flip
  const angle = eased * Math.PI * 0.5
  const camDist = 120
  this.camera.position.set(
    this.shuttleGroup.position.x + Math.sin(angle) * camDist,
    this.shuttleGroup.position.y + 30,
    this.shuttleGroup.position.z + Math.cos(angle) * camDist * 0.4,
  )
  this.camera.lookAt(this.shuttleGroup.position)

  if (t >= 1) this.nextExfilPhase('depart')
}
```

- [ ] **Step 8: Implement exfil depart phase**

```ts
/** Shuttle accelerates away from the asteroid. */
private tickExfilDepart(): void {
  const t = Math.min(1, this.exfilPhaseElapsed / EXFIL_DEPART_DURATION)
  const eased = this.easeInOut(t)

  this.shuttleGroup.position.lerpVectors(
    this.exfilDepartStartPos,
    this.exfilDepartEndPos,
    eased,
  )

  // Thruster sprites pulse during departure
  this.updateThrusterSprites(true)

  // Camera watches shuttle shrink into the distance
  const camDist = THREE.MathUtils.lerp(120, 500, eased)
  this.camera.position.set(
    this.shuttleGroup.position.x + 40,
    this.shuttleGroup.position.y + camDist * 0.3,
    this.shuttleGroup.position.z + camDist,
  )
  this.camera.lookAt(this.shuttleGroup.position)

  if (t >= 1) this.nextExfilPhase('exfilFadeout')
}
```

- [ ] **Step 9: Implement exfil fadeout phase**

```ts
/** Fade to black as shuttle departs. */
private tickExfilFadeout(): void {
  const t = Math.min(1, this.exfilPhaseElapsed / EXFIL_FADEOUT_DURATION)

  this.onFadeOut?.(t)

  // Camera holds position
  this.camera.lookAt(this.shuttleGroup.position)

  if (t >= 1) {
    this.exfilPhase = 'done'
    this.onComplete?.()
  }
}
```

- [ ] **Step 10: Add the phase transition helper**

```ts
private nextExfilPhase(next: ExfilPhase): void {
  this.exfilPhase = next
  this.exfilPhaseElapsed = 0
}
```

- [ ] **Step 11: Commit**

```bash
git add src/three/ArrivalSequence.ts
git commit -m "feat(arrival): add playExfil() reverse cutscene — dock, doors, flip, depart"
```

---

### Task 3: Wire Exfil into LevelViewController

**Files:**
- Modify: `src/views/LevelViewController.ts`

- [ ] **Step 1: Add tracking state and import new constants**

Add import of `EXFIL_PROXIMITY_RANGE` from the state machine module and `EXFIL_SEQUENCE_DURATION` if needed:

```ts
import { createLevelStateMachine, LANDER_INTERACT_RANGE, EXFIL_PROXIMITY_RANGE } from '@/lib/level/levelStateMachine'
```

Add a new field after the mouse state fields:

```ts
// ── Exfil tracking ────────────────────────────────────────────
private hasExitedVehicle = false
```

- [ ] **Step 2: Update state machine creation with new guards**

In `init()`, update the `createLevelStateMachine` call to add the new guards:

```ts
this.stateMachine = createLevelStateMachine({
  onStateChange: (current, previous) => this.onStateTransition(current, previous),
  isLanderGrounded: () => this.landerController?.body.grounded ?? false,
  isPlayerNearLander: () => this.isPlayerNearLander(),
  isLanderNearShuttle: () => this.isLanderNearShuttle(),
  hasCompletedEva: () => this.hasExitedVehicle,
})
```

- [ ] **Step 3: Add `isLanderNearShuttle()` helper**

Add alongside the existing `isPlayerNearLander()`:

```ts
/** Check if the lander is within exfil range of the parked shuttle. */
private isLanderNearShuttle(): boolean {
  if (!this.landerController || !this.arrivalSequence) return false
  const landerY = this.landerController.position.y
  const shuttleY = this.arrivalSequence.shuttleGroup.position.y
  return Math.abs(landerY - shuttleY) <= EXFIL_PROXIMITY_RANGE
}
```

- [ ] **Step 4: Set `hasExitedVehicle` flag in `enterEva()`**

At the top of the existing `enterEva()` method, add:

```ts
this.hasExitedVehicle = true
```

- [ ] **Step 5: Add `exfiltrate` trigger to the tick F-key handler**

Update the interact block in `tick()`:

```ts
if (this.inputManager?.wasActionPressed('interact') && this.stateMachine) {
  if (!this.stateMachine.trigger('exfiltrate')) {
    if (!this.stateMachine.trigger('exitVehicle')) {
      this.stateMachine.trigger('enterVehicle')
    }
  }
}
```

The order matters: exfiltrate is checked first (only succeeds when in `lander` near shuttle with EVA history), then exitVehicle, then enterVehicle.

- [ ] **Step 6: Add `canExfil` to state info broadcast**

Extend the `onStateInfo` payload type. In `LevelViewController.ts`, update the `onStateInfo` callback type:

```ts
/** Called each frame with current state + grounded + canExfil for HUD prompts. */
onStateInfo: ((info: { state: string; grounded: boolean; canExfil: boolean }) => void) | null = null
```

Update the broadcast in `tick()`:

```ts
const canExfil =
  currentState === 'lander' &&
  this.hasExitedVehicle &&
  this.isLanderNearShuttle()

this.onStateInfo?.({ state: currentState, grounded, canExfil })
```

- [ ] **Step 7: Implement `enterExfil()`**

Add to the state transition handlers:

```ts
private enterExfil(): void {
  // Unregister lander tickables (lander is now "docking")
  this.tickHandler!.unregister(this.landerController!)
  this.tickHandler!.unregister(this.vehicleCamera!)
  this.vehicleCamera!.controls.enabled = false

  // Hide the gameplay lander — the cinematic lander takes over
  this.landerController!.group.visible = false

  // Letterbox for cinematic framing
  this.onLetterbox?.(true)

  // Switch to the cinematic camera
  this.sceneManager!.setActiveCamera(this.arrivalSequence!.camera)
  this.sceneManager!.setCamera(null)

  // Start the reverse cutscene
  this.arrivalSequence!.playExfil(this.landerController!.group.position)

  // Wire callbacks
  this.arrivalSequence!.onFadeOut = (opacity) => {
    this.onArrivalFade?.(opacity)
  }
  this.arrivalSequence!.onComplete = () => {
    this.stateMachine?.setState('complete' as LevelState)
  }
}
```

Note: The state machine auto-transitions `exfil → complete` via duration, but the cutscene `onComplete` is a safety fallback. You can rely on whichever fires first — both call `setState('complete')` which is idempotent (the machine won't re-enter a state it's already in since there's no transition defined from complete to complete).

Wait — actually the auto-transition from duration is handled by the state machine tick. Let's keep it simple: the `exfil` state has `duration + next: 'complete'` in the state machine, so it will auto-transition. The `onComplete` callback from ArrivalSequence should NOT also force a transition — that would be redundant. Instead, just use `onComplete` to clear the fade if needed, and let the state machine handle the transition.

Revised:

```ts
private enterExfil(): void {
  // Unregister lander tickables
  this.tickHandler!.unregister(this.landerController!)
  this.tickHandler!.unregister(this.vehicleCamera!)
  this.vehicleCamera!.controls.enabled = false

  // Hide the gameplay lander
  this.landerController!.group.visible = false

  // Letterbox for cinematic framing
  this.onLetterbox?.(true)

  // Switch to cinematic camera
  this.sceneManager!.setActiveCamera(this.arrivalSequence!.camera)
  this.sceneManager!.setCamera(null)

  // Start reverse cutscene
  this.arrivalSequence!.playExfil(this.landerController!.group.position)

  this.arrivalSequence!.onFadeOut = (opacity) => {
    this.onArrivalFade?.(opacity)
  }
}
```

- [ ] **Step 8: Implement `enterComplete()`**

```ts
private enterComplete(): void {
  // Navigate to star map
  import('@/router').then(({ default: router }) => {
    router.push('/map')
  })
}
```

- [ ] **Step 9: Wire new states into `onStateTransition()`**

In the `switch (current)` block, add:

```ts
case 'exfil':
  this.enterExfil()
  break
case 'complete':
  this.enterComplete()
  break
```

- [ ] **Step 10: Commit**

```bash
git add src/views/LevelViewController.ts
git commit -m "feat(level): wire exfil state — proximity guard, cutscene trigger, /map redirect"
```

---

### Task 4: Update Vue HUD for Exfil Prompt

**Files:**
- Modify: `src/views/LevelView.vue`

- [ ] **Step 1: Update stateInfo reactive to include `canExfil`**

```ts
const stateInfo = reactive({ state: '', grounded: false, canExfil: false })
```

- [ ] **Step 2: Add exfil prompt to the template**

After the existing exit prompt div, add:

```html
<div
  v-if="stateInfo.canExfil"
  class="exit-prompt"
>
  <span class="exit-prompt__text">EXFILTRATE (F)</span>
</div>
```

This reuses the same `.exit-prompt` styling as the lander exit prompt. Only one will show at a time since `canExfil` is only true in `lander` state near the shuttle, and the exit prompt requires `grounded`.

- [ ] **Step 3: Commit**

```bash
git add src/views/LevelView.vue
git commit -m "feat(hud): show EXFILTRATE (F) prompt when lander is near shuttle"
```

---

### Task 5: Type-check, Lint, and Verify

**Files:**
- All modified files

- [ ] **Step 1: Run type-check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 2: Run linter**

Run: `bun lint`
Expected: No errors (or only pre-existing warnings).

- [ ] **Step 3: Run tests**

Run: `bun test:unit`
Expected: All tests pass including the new exfil state machine tests.

- [ ] **Step 4: Manual smoke test**

Run: `bun dev` and verify:
1. Arrival cutscene plays normally
2. Lander lands, F exits to EVA
3. F re-enters lander, fly up toward shuttle
4. At ~100 units from shuttle, "EXFILTRATE (F)" prompt appears
5. Press F → letterbox + reverse cutscene plays (dock → doors → flip → depart → fade)
6. Redirects to `/map` after fade

- [ ] **Step 5: Final commit if any lint/type fixes were needed**

```bash
git add -A
git commit -m "fix(level): address lint and type issues from exfil integration"
```
