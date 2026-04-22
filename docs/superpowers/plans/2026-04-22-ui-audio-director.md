# UI Audio Director Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port UI sounds from irover, register them in the audio manifest, create `UiAudioDirector`, and wire it into mission, achievement, turret, and pickup call sites.

**Architecture:** Thin event-driven singleton (`UiAudioDirector`) with 15 `notify*()` methods — no update loop, no state, identical shape to `LevelAudioDirector`. All sounds registered in `audioManifest.ts`. Views import the singleton directly.

**Tech Stack:** TypeScript, Howler.js, `src/audio/audioManifest.ts`, `src/audio/useAudio.ts`

**Spec:** `docs/superpowers/specs/2026-04-22-ui-audio-director-design.md`

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create ×10 | `public/sound/ui.*.mp3`, `public/sound/sfx.laserPulse.mp3` | Audio assets copied from irover |
| Modify | `src/audio/audioManifest.ts` | Add sound IDs + entries, fill placeholders |
| Create | `src/audio/UiAudioDirector.ts` | Director singleton |
| Modify | `src/components/AchievementBanner.vue` | Swap `ui.confirm` → `notifyAchievementUnlocked()` |
| Modify | `src/views/MapView.vue` | Wire mission accept/deliver handlers |
| Modify | `src/lib/map/turret/TurretSessionController.ts` | Add `onBeamActivated` dep + rising-edge firing |
| Modify | `src/views/MapViewController.ts` | Wire `onBeamActivated` and turret `onResourcePickup` |

---

## Task 1: Copy Sound Files from irover

**Files:**
- Create: `public/sound/ui.click.mp3`
- Create: `public/sound/ui.hover.mp3`
- Create: `public/sound/ui.confirm.mp3`
- Create: `public/sound/ui.switch.mp3`
- Create: `public/sound/ui.type.mp3`
- Create: `public/sound/ui.processing.mp3`
- Create: `public/sound/ui.scan.mp3`
- Create: `public/sound/ui.achievement.mp3`
- Create: `public/sound/ui.reward.mp3`
- Create: `public/sound/sfx.laserPulse.mp3`

- [ ] **Step 1: Copy and rename the 10 files**

Run each command (bash):
```bash
cp D:/Developer/irover/public/sound/instrument.mp3  D:/Developer/asteroids/public/sound/ui.click.mp3
cp D:/Developer/irover/public/sound/dsn-select.mp3  D:/Developer/asteroids/public/sound/ui.hover.mp3
cp D:/Developer/irover/public/sound/confirm.mp3     D:/Developer/asteroids/public/sound/ui.confirm.mp3
cp D:/Developer/irover/public/sound/switch.mp3      D:/Developer/asteroids/public/sound/ui.switch.mp3
cp D:/Developer/irover/public/sound/type.mp3        D:/Developer/asteroids/public/sound/ui.type.mp3
cp D:/Developer/irover/public/sound/processing.mp3  D:/Developer/asteroids/public/sound/ui.processing.mp3
cp D:/Developer/irover/public/sound/science.mp3     D:/Developer/asteroids/public/sound/ui.scan.mp3
cp D:/Developer/irover/public/sound/achievement.mp3 D:/Developer/asteroids/public/sound/ui.achievement.mp3
cp D:/Developer/irover/public/sound/reward.mp3      D:/Developer/asteroids/public/sound/ui.reward.mp3
cp D:/Developer/irover/public/sound/chemcam.mp3     D:/Developer/asteroids/public/sound/sfx.laserPulse.mp3
```

- [ ] **Step 2: Verify all 10 files landed**

```bash
ls D:/Developer/asteroids/public/sound/ui.*.mp3 D:/Developer/asteroids/public/sound/sfx.laserPulse.mp3
```
Expected: 10 file paths printed, no errors.

- [ ] **Step 3: Commit**

```bash
git add public/sound/
git commit -m "feat(audio): copy and rename UI + laser sound assets from irover"
```

---

## Task 2: Update `AUDIO_SOUND_IDS` in `audioManifest.ts`

**Files:**
- Modify: `src/audio/audioManifest.ts` (lines ~24–29, the `AUDIO_SOUND_IDS` array)

The array currently has 4 UI IDs. Add 6 new UI IDs and 1 SFX ID. Find the end of the `// UI` block and the SFX section to insert in the right spots.

- [ ] **Step 1: Add the 6 new UI IDs to `AUDIO_SOUND_IDS`**

Find this block in `audioManifest.ts`:
```ts
  // UI
  'ui.click',
  'ui.confirm',
  'ui.error',
  'ui.hover',
```

Replace with:
```ts
  // UI
  'ui.click',
  'ui.confirm',
  'ui.error',
  'ui.hover',
  'ui.switch',
  'ui.type',
  'ui.processing',
  'ui.scan',
  'ui.achievement',
  'ui.reward',
```

- [ ] **Step 2: Add `sfx.laserPulse` to the SFX IDs**

Find the `// SFX — shuttle propulsion` block header in the `AUDIO_SOUND_IDS` array. The existing SFX IDs include entries like `'sfx.thrusterLoop'`, `'sfx.slingshot'`, etc. Add `'sfx.laserPulse'` after the last SFX propulsion entry in that block:

```ts
  // SFX — shuttle propulsion
  'sfx.thrusterLoop',
  'sfx.thrusterBurst',
  'sfx.brake',
  'sfx.slingshot',
  'sfx.slingshot.burst',
  'sfx.slingshot.charge',
  'sfx.orbitCapture',
  'sfx.wormhole',
  'sfx.fuelWarning',
  'sfx.laserPulse',
```

(Insert `'sfx.laserPulse'` at the end of the shuttle propulsion group — the exact position doesn't matter as long as it's in the SFX section and not in the UI section.)

- [ ] **Step 3: Run type-check to verify no ID drift**

```bash
bun run type-check
```
Expected: 0 errors. (The `ManifestById` mapped type will error if IDs in `AUDIO_SOUND_IDS` don't have entries in `manifestById` — fix those in Task 3.)

---

## Task 3: Update Manifest Entries in `audioManifest.ts`

**Files:**
- Modify: `src/audio/audioManifest.ts` (the `manifestById` object, UI section starting ~line 125)

- [ ] **Step 1: Update `ui.click` src from silent placeholder to real file**

Find:
```ts
  'ui.click': {
    id: 'ui.click',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'ui',
    load: 'eager',
    playback: 'restart',
    volume: 0.35,
    effect: 'none',
  },
```
Replace with:
```ts
  'ui.click': {
    id: 'ui.click',
    src: '/sound/ui.click.mp3',
    category: 'ui',
    load: 'eager',
    playback: 'restart',
    volume: 0.35,
    effect: 'none',
  },
```

- [ ] **Step 2: Update `ui.hover` src**

Find:
```ts
  'ui.hover': {
    id: 'ui.hover',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'ui',
    load: 'lazy',
    playback: 'rate-limited',
    volume: 0.2,
    effect: 'none',
    cooldownMs: 80,
  },
```
Replace with:
```ts
  'ui.hover': {
    id: 'ui.hover',
    src: '/sound/ui.hover.mp3',
    category: 'ui',
    load: 'lazy',
    playback: 'rate-limited',
    volume: 0.18,
    effect: 'none',
    cooldownMs: 80,
  },
```

- [ ] **Step 3: Update `ui.confirm` src**

Find:
```ts
  'ui.confirm': {
    id: 'ui.confirm',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'ui',
    load: 'lazy',
    playback: 'restart',
    volume: 0.45,
    effect: 'none',
  },
```
Replace with:
```ts
  'ui.confirm': {
    id: 'ui.confirm',
    src: '/sound/ui.confirm.mp3',
    category: 'ui',
    load: 'lazy',
    playback: 'restart',
    volume: 0.45,
    effect: 'none',
  },
```

- [ ] **Step 4: Add the 6 new UI entries after `ui.hover`**

After the `ui.hover` entry block, add:
```ts
  'ui.switch': {
    id: 'ui.switch',
    src: '/sound/ui.switch.mp3',
    category: 'ui',
    load: 'lazy',
    playback: 'restart',
    volume: 0.35,
    effect: 'none',
  },
  'ui.type': {
    id: 'ui.type',
    src: '/sound/ui.type.mp3',
    category: 'ui',
    load: 'lazy',
    playback: 'rate-limited',
    volume: 0.25,
    effect: 'none',
    cooldownMs: 60,
  },
  'ui.processing': {
    id: 'ui.processing',
    src: '/sound/ui.processing.mp3',
    category: 'ui',
    load: 'lazy',
    playback: 'restart',
    volume: 0.3,
    effect: 'none',
  },
  'ui.scan': {
    id: 'ui.scan',
    src: '/sound/ui.scan.mp3',
    category: 'ui',
    load: 'lazy',
    playback: 'restart',
    volume: 0.45,
    effect: 'none',
  },
  'ui.achievement': {
    id: 'ui.achievement',
    src: '/sound/ui.achievement.mp3',
    category: 'ui',
    load: 'lazy',
    playback: 'restart',
    volume: 0.6,
    effect: 'none',
  },
  'ui.reward': {
    id: 'ui.reward',
    src: '/sound/ui.reward.mp3',
    category: 'ui',
    load: 'lazy',
    playback: 'restart',
    volume: 0.6,
    effect: 'none',
  },
```

- [ ] **Step 5: Add `sfx.laserPulse` entry in the SFX propulsion section**

Find the `sfx.fuelWarning` entry and add after it:
```ts
  'sfx.laserPulse': {
    id: 'sfx.laserPulse',
    src: '/sound/sfx.laserPulse.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.5,
    effect: 'none',
  },
```

- [ ] **Step 6: Run type-check**

```bash
bun run type-check
```
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/audio/audioManifest.ts
git commit -m "feat(audio): register UI sound IDs and sfx.laserPulse in manifest"
```

---

## Task 4: Create `UiAudioDirector`

**Files:**
- Create: `src/audio/UiAudioDirector.ts`

- [ ] **Step 1: Create the file**

Create `src/audio/UiAudioDirector.ts` with the full content below. Every exported symbol has a TSDoc comment with `@author guinetik`, `@date 2026-04-22`, `@spec` pointing to the design doc.

```ts
/**
 * Thin event-driven director for all UI audio cues in Asteroid Lander.
 *
 * Follows the same pattern as {@link LevelAudioDirector}: no update loop,
 * no internal state — just `notify*()` methods that delegate directly to the
 * shared {@link AudioManager}. Import the exported {@link uiAudio} singleton
 * wherever a UI event needs a sound.
 *
 * @author guinetik
 * @date 2026-04-22
 * @spec docs/superpowers/specs/2026-04-22-ui-audio-director-design.md
 */

import { useAudio } from './useAudio'

/** Volume for generic button click. */
const CLICK_VOLUME = 0.35
/** Volume for hover cue (kept subtle). */
const HOVER_VOLUME = 0.18
/** Volume for confirm / accept actions. */
const CONFIRM_VOLUME = 0.45
/** Volume for cancel / dismiss actions (softer than confirm). */
const CANCEL_VOLUME = 0.3
/** Volume for error / blocked actions. */
const ERROR_VOLUME = 0.45
/** Volume for toggle / tab-switch cue. */
const SWITCH_VOLUME = 0.35
/** Volume for typewriter text tick. */
const TYPE_VOLUME = 0.25
/** Volume for processing / loading state start. */
const PROCESSING_VOLUME = 0.3
/** Volume for scan-complete / analysis-done cue. */
const SCAN_VOLUME = 0.45
/** Volume for item-collected chime. */
const COLLECT_VOLUME = 0.35
/** Volume for achievement-unlock fanfare. */
const ACHIEVEMENT_VOLUME = 0.6
/** Volume for mission-accepted confirmation. */
const MISSION_ACCEPT_VOLUME = 0.45
/** Volume for mission-complete stinger. */
const MISSION_COMPLETE_VOLUME = 0.6
/** Volume for reward-received chime. */
const REWARD_VOLUME = 0.6
/** Volume for laser-pulse SFX. */
const LASER_VOLUME = 0.5

/**
 * Audio orchestrator for UI events. Single-instance for the app lifetime;
 * use the exported {@link uiAudio} singleton — do not instantiate directly.
 */
export class UiAudioDirector {
  private readonly audio = useAudio()

  /**
   * Player pressed a primary button. Plays a short click cue.
   */
  notifyButtonClick(): void {
    this.audio.play('ui.click', { volume: CLICK_VOLUME })
  }

  /**
   * Cursor entered an interactive element. Rate-limited in the manifest
   * (80 ms cooldown) so rapid sweeps don't flood the channel.
   */
  notifyButtonHover(): void {
    this.audio.play('ui.hover', { volume: HOVER_VOLUME })
  }

  /**
   * Player confirmed an action (accept mission, dialog OK, etc.).
   */
  notifyConfirm(): void {
    this.audio.play('ui.confirm', { volume: CONFIRM_VOLUME })
  }

  /**
   * Player dismissed or cancelled (back, close, ESC).
   */
  notifyCancel(): void {
    this.audio.play('ui.click', { volume: CANCEL_VOLUME })
  }

  /**
   * An action was blocked or failed validation.
   */
  notifyError(): void {
    this.audio.play('ui.error', { volume: ERROR_VOLUME })
  }

  /**
   * Player switched a tab, toggled a mode, or changed a setting.
   */
  notifySwitch(): void {
    this.audio.play('ui.switch', { volume: SWITCH_VOLUME })
  }

  /**
   * One tick of typewriter text revealed. Rate-limited in manifest (60 ms).
   */
  notifyType(): void {
    this.audio.play('ui.type', { volume: TYPE_VOLUME })
  }

  /**
   * A loading or processing operation has started.
   */
  notifyProcessing(): void {
    this.audio.play('ui.processing', { volume: PROCESSING_VOLUME })
  }

  /**
   * A scan or analysis finished successfully.
   */
  notifyScanComplete(): void {
    this.audio.play('ui.scan', { volume: SCAN_VOLUME })
  }

  /**
   * An item (ore, cargo unit, resource) was collected into inventory.
   */
  notifyItemCollected(): void {
    this.audio.play('sfx.pickup', { volume: COLLECT_VOLUME })
  }

  /**
   * An achievement was unlocked and the banner is about to appear.
   */
  notifyAchievementUnlocked(): void {
    this.audio.play('ui.achievement', { volume: ACHIEVEMENT_VOLUME })
  }

  /**
   * Player accepted a mission at the dock panel.
   */
  notifyMissionAccepted(): void {
    this.audio.play('ui.confirm', { volume: MISSION_ACCEPT_VOLUME })
  }

  /**
   * A mission was delivered / completed.
   */
  notifyMissionComplete(): void {
    this.audio.play('ui.reward', { volume: MISSION_COMPLETE_VOLUME })
  }

  /**
   * XP or credits were awarded (fires immediately after
   * {@link notifyMissionComplete} at the same call site).
   */
  notifyRewardReceived(): void {
    this.audio.play('ui.achievement', { volume: REWARD_VOLUME })
  }

  /**
   * Turret or shuttle laser fired — plays on the rising edge of beam
   * activation, not every frame.
   */
  notifyLaserFire(): void {
    this.audio.play('sfx.laserPulse', { volume: LASER_VOLUME })
  }
}

/**
 * Shared singleton for the app lifetime. Import this directly in views and
 * components; do not instantiate {@link UiAudioDirector} yourself.
 */
export const uiAudio = new UiAudioDirector()
```

- [ ] **Step 2: Run type-check**

```bash
bun run type-check
```
Expected: 0 errors.

- [ ] **Step 3: Run lint**

```bash
bun lint
```
Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Commit**

```bash
git add src/audio/UiAudioDirector.ts
git commit -m "feat(audio): add UiAudioDirector singleton with 15 notify methods"
```

---

## Task 5: Wire `AchievementBanner.vue`

**Files:**
- Modify: `src/components/AchievementBanner.vue` (line 57 in `show()`)

The banner currently calls `useAudio().play('ui.confirm')` directly. Replace with `uiAudio.notifyAchievementUnlocked()`.

- [ ] **Step 1: Replace the direct audio call**

Find in `AchievementBanner.vue`:
```ts
import { useAudio } from '@/audio/useAudio'
```
Replace with:
```ts
import { uiAudio } from '@/audio/UiAudioDirector'
```

(If `useAudio` is imported for other reasons in this file, keep both imports. Only swap the line if it's the only consumer.)

- [ ] **Step 2: Replace the play call in `show()`**

Find (inside the `show()` function, line ~57):
```ts
  useAudio().play('ui.confirm')
```
Replace with:
```ts
  uiAudio.notifyAchievementUnlocked()
```

- [ ] **Step 3: Run type-check and lint**

```bash
bun run type-check && bun lint
```
Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Commit**

```bash
git add src/components/AchievementBanner.vue
git commit -m "feat(audio): wire achievement banner to UiAudioDirector"
```

---

## Task 6: Wire Mission Accept/Deliver in `MapView.vue`

**Files:**
- Modify: `src/views/MapView.vue` (~lines 1008–1043)

Five accept handlers and two deliver handlers need audio. All six are in the `<script setup>` section.

- [ ] **Step 1: Import `uiAudio` at the top of the script block**

Find the imports section in `MapView.vue`'s `<script setup>` block. Add:
```ts
import { uiAudio } from '@/audio/UiAudioDirector'
```

- [ ] **Step 2: Wire all five accept handlers**

Find `handleAcceptMission()`:
```ts
function handleAcceptMission() {
  const result = viewController.missionAccept()
  if (!result.ok && result.reason) {
    showMissionNotification(result.reason)
  }
}
```
Replace with:
```ts
function handleAcceptMission() {
  const result = viewController.missionAccept()
  if (!result.ok && result.reason) {
    uiAudio.notifyError()
    showMissionNotification(result.reason)
  } else {
    uiAudio.notifyMissionAccepted()
  }
}
```

Find `handleAcceptAsteroidMission()`:
```ts
function handleAcceptAsteroidMission() {
  viewController.asteroidMissionAccept()
}
```
Replace with:
```ts
function handleAcceptAsteroidMission() {
  viewController.asteroidMissionAccept()
  uiAudio.notifyMissionAccepted()
}
```

Find `handleAcceptEvaMission()`:
```ts
function handleAcceptEvaMission() {
  viewController.evaMissionAccept()
}
```
Replace with:
```ts
function handleAcceptEvaMission() {
  viewController.evaMissionAccept()
  uiAudio.notifyMissionAccepted()
}
```

Find `handleAcceptMiningMission()`:
```ts
function handleAcceptMiningMission() {
  viewController.miningMissionAccept()
}
```
Replace with:
```ts
function handleAcceptMiningMission() {
  viewController.miningMissionAccept()
  uiAudio.notifyMissionAccepted()
}
```

- [ ] **Step 3: Wire both deliver handlers**

Find `handleDeliverMiningMission()`:
```ts
function handleDeliverMiningMission(missionId: string) {
  viewController.miningMissionDeliver(missionId)
}
```
Replace with:
```ts
function handleDeliverMiningMission(missionId: string) {
  viewController.miningMissionDeliver(missionId)
  uiAudio.notifyMissionComplete()
  uiAudio.notifyRewardReceived()
}
```

Find `handleDeliverMission()`:
```ts
function handleDeliverMission(missionId: string) {
  viewController.missionDeliver(missionId)
}
```
Replace with:
```ts
function handleDeliverMission(missionId: string) {
  viewController.missionDeliver(missionId)
  uiAudio.notifyMissionComplete()
  uiAudio.notifyRewardReceived()
}
```

- [ ] **Step 4: Run type-check and lint**

```bash
bun run type-check && bun lint
```
Expected: 0 errors, 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add src/views/MapView.vue
git commit -m "feat(audio): wire mission accept and deliver sounds in MapView"
```

---

## Task 7: Wire Turret Laser and Pickup Sounds

**Files:**
- Modify: `src/lib/map/turret/TurretSessionController.ts`
- Modify: `src/views/MapViewController.ts`

The turret fires while `beamActive` is true each frame. We need a **rising-edge** sound (fires once when beam activates, not every frame). Add `onBeamActivated?: () => void` to the deps interface and a `prevBeamActive` field, then wire it in `MapViewController`.

- [ ] **Step 1: Add `onBeamActivated` to `TurretSessionControllerDeps`**

In `TurretSessionController.ts`, find the `TurretSessionControllerDeps` interface (line ~54). Add the new optional callback after `onResourcePickupFailed`:
```ts
  /** Called once on the rising edge of beam activation (not every frame). */
  onBeamActivated?: () => void
```

- [ ] **Step 2: Add `prevBeamActive` field to the class**

In the class body, after the existing private fields (around line 132 where `beamLatched` and `overheatLocked` are declared), add:
```ts
  private prevBeamActive = false
```

- [ ] **Step 3: Add rising-edge call in `update()`**

In the `update()` method, after line 388 (`const beamActive = this.firing && this.beamLatched && canFire`), add:
```ts
    if (beamActive && !this.prevBeamActive) {
      this.deps.onBeamActivated?.()
    }
    this.prevBeamActive = beamActive
```

The full context should look like:
```ts
    const beamActive = this.firing && this.beamLatched && canFire

    if (beamActive && !this.prevBeamActive) {
      this.deps.onBeamActivated?.()
    }
    this.prevBeamActive = beamActive

    if (beamActive) {
```

- [ ] **Step 4: Reset `prevBeamActive` in `handleClose()`**

In `handleClose()` (around line 310–321 where `beamLatched` and `overheatLocked` are reset), add:
```ts
    this.prevBeamActive = false
```

- [ ] **Step 5: Wire `onBeamActivated` and turret pickup in `MapViewController.ts`**

In `MapViewController.ts`, first add the import at the top:
```ts
import { uiAudio } from '@/audio/UiAudioDirector'
```

Then find `ensureTurretSessionController()` (~line 4114). The deps object passed to `new TurretSessionController({...})` currently ends with:
```ts
        onFadeOpacity: (op) => this.onTurretFade?.(op),
        onHudState: (state) => this.onTurretHudState?.(state),
```

Add two more callbacks:
```ts
        onFadeOpacity: (op) => this.onTurretFade?.(op),
        onHudState: (state) => this.onTurretHudState?.(state),
        onBeamActivated: () => uiAudio.notifyLaserFire(),
        onResourcePickup: (itemId, quantity, label) => {
          this.onResourcePickup?.(itemId, quantity, label)
          uiAudio.notifyItemCollected()
        },
```

**Note:** The existing line `onResourcePickup: this.onResourcePickup ?? undefined` is replaced by the new callback above that both forwards the event upstream AND plays the collection sound. Remove the old line.

- [ ] **Step 6: Run type-check and lint**

```bash
bun run type-check && bun lint
```
Expected: 0 errors, 0 warnings.

- [ ] **Step 7: Commit**

```bash
git add src/lib/map/turret/TurretSessionController.ts src/views/MapViewController.ts
git commit -m "feat(audio): wire turret laser pulse and item-collected sounds"
```

---

## Task 8: Final Verification

- [ ] **Step 1: Run full type-check**

```bash
bun run type-check
```
Expected: 0 errors.

- [ ] **Step 2: Run lint**

```bash
bun lint
```
Expected: oxlint 0 errors, ESLint 0 errors, 0 warnings.

- [ ] **Step 3: Run tests**

```bash
bun test:unit
```
Expected: all tests green.

- [ ] **Step 4: Manual smoke test**

Start the dev server (`bun dev`) and verify:
- Hovering map buttons plays a soft click
- Accepting a mission plays a confirm sound
- Delivering a mission plays the reward/complete stinger + achievement sound
- Achievement banner appearing plays the achievement sound
- Turret beam activating plays the laser pulse once (not every frame)
- Mining ore in turret mode plays a collection chime on commit

- [ ] **Step 5: Final commit if any lint fixes were needed**

```bash
git add -p
git commit -m "fix(audio): lint and type fixes after UI audio wiring"
```
