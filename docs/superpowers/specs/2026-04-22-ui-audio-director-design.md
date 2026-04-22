# UI Audio Director Design

**Date:** 2026-04-22
**Author:** guinetik
**Status:** Approved

## Overview

Port UI sounds from the irover project into asteroids and wire them up through a new `UiAudioDirector` — a thin, event-driven singleton matching the existing director pattern. Covers button interactions, navigation, mission flow, achievements, item collection, and laser SFX.

## Context

The asteroids audio system already has `ui.click`, `ui.confirm`, `ui.error`, and `ui.hover` registered in `audioManifest.ts`, but all four point to a silent placeholder (`SILENT_STATIC_WAV_DATA_URI`). The irover project (same Howler.js stack, same manifest pattern) has a mature set of UI sounds we can copy directly.

Four directors exist: `FpsAudioDirector`, `ShuttleAudioDirector`, `LanderAudioDirector`, `LevelAudioDirector`. `UiAudioDirector` follows the same shape as `LevelAudioDirector` — no update loop, no state, pure event methods.

## Section 1: Sound Assets

Files copied from `irover/public/sound/` → `asteroids/public/sound/`, renamed to match the asteroids dot-notation convention:

| irover source | asteroids filename | Sound ID | Role |
|---|---|---|---|
| `instrument.mp3` | `ui.click.mp3` | `ui.click` | Button press *(fills existing placeholder)* |
| `dsn-select.mp3` | `ui.hover.mp3` | `ui.hover` | Hover on interactive elements *(fills existing placeholder)* |
| `confirm.mp3` | `ui.confirm.mp3` | `ui.confirm` | Accept mission, dialogs *(fills existing placeholder)* |
| `switch.mp3` | `ui.switch.mp3` | `ui.switch` | Tab change, toggle, mode switch |
| `achievement.mp3` | `ui.achievement.mp3` | `ui.achievement` | Achievement unlock banner |
| `reward.mp3` | `ui.reward.mp3` | `ui.reward` | Mission complete, reward received |
| `type.mp3` | `ui.type.mp3` | `ui.type` | Typewriter/dialog text tick |
| `processing.mp3` | `ui.processing.mp3` | `ui.processing` | Loading/processing state start |
| `science.mp3` | `ui.scan.mp3` | `ui.scan` | Scan complete, analysis done |
| `chemcam.mp3` | `sfx.laserPulse.mp3` | `sfx.laserPulse` | Turret / shuttle laser pulse |

`ui.error` has no obvious irover match — stays as silent placeholder, sourced separately later.

## Section 2: `UiAudioDirector`

**File:** `src/audio/UiAudioDirector.ts`

Thin class, no update loop, no internal state. All methods delegate directly to `useAudio().play(soundId)`.

```ts
class UiAudioDirector {
  notifyButtonClick()         // any primary button press
  notifyButtonHover()         // hover on interactive element
  notifyConfirm()             // mission accept, dialog confirm
  notifyCancel()              // back, close, dismiss
  notifyError()               // validation fail, blocked action
  notifySwitch()              // tab change, toggle, mode switch
  notifyType()                // typewriter text tick
  notifyProcessing()          // start of loading/processing state
  notifyScanComplete()        // scan/analysis finished
  notifyItemCollected()       // ore pickup, cargo loaded
  notifyAchievementUnlocked() // achievement banner appears
  notifyMissionAccepted()     // player accepts a mission
  notifyMissionComplete()     // mission delivered/completed
  notifyRewardReceived()      // XP/credit reward granted
  notifyLaserFire()           // turret or shuttle laser pulse
}

export const uiAudio = new UiAudioDirector()
```

Consumers import the singleton directly — no composable wrapper needed.

## Section 3: Manifest Additions

**Updated existing entries** (src changed from silent placeholder to real file):

| Sound ID | src | volume | load | playback | notes |
|---|---|---|---|---|---|
| `ui.click` | `/sound/ui.click.mp3` | 0.35 | `eager` | `restart` | |
| `ui.hover` | `/sound/ui.hover.mp3` | 0.18 | `lazy` | `rate-limited` | cooldownMs: 80 |
| `ui.confirm` | `/sound/ui.confirm.mp3` | 0.45 | `lazy` | `restart` | |
| `ui.error` | *(silent placeholder)* | 0.45 | `eager` | `restart` | unchanged |

**New entries** (all `category: 'ui'`, `load: 'lazy'`, `effect: 'none'` unless noted):

| Sound ID | src | volume | playback | notes |
|---|---|---|---|---|
| `ui.switch` | `/sound/ui.switch.mp3` | 0.35 | `restart` | |
| `ui.type` | `/sound/ui.type.mp3` | 0.25 | `rate-limited` | cooldownMs: 60 |
| `ui.processing` | `/sound/ui.processing.mp3` | 0.3 | `restart` | |
| `ui.scan` | `/sound/ui.scan.mp3` | 0.45 | `restart` | |
| `ui.achievement` | `/sound/ui.achievement.mp3` | 0.6 | `restart` | |
| `ui.reward` | `/sound/ui.reward.mp3` | 0.6 | `restart` | |

**New SFX entry:**

| Sound ID | src | category | volume | playback | notes |
|---|---|---|---|---|---|
| `sfx.laserPulse` | `/sound/sfx.laserPulse.mp3` | `sfx` | 0.5 | `overlap` | multiple turrets fire simultaneously |

## Section 4: Wiring Locations

Call sites to locate and wire during implementation:

**Mission system:**
- Mission accept action → `uiAudio.notifyMissionAccepted()` (covers the confirm sound; do not also call `notifyConfirm()`)
- Mission completion state transition → `uiAudio.notifyMissionComplete()` immediately followed by `uiAudio.notifyRewardReceived()` at the same event site

**Achievement system:**
- Achievement banner show() → `uiAudio.notifyAchievementUnlocked()`

**Map/HUD components:**
- Primary buttons (click handler) → `uiAudio.notifyButtonClick()`
- Interactive elements (mouseenter) → `uiAudio.notifyButtonHover()`
- Tab/panel switches → `uiAudio.notifySwitch()`
- Dialog confirm/cancel → `uiAudio.notifyConfirm()` / `uiAudio.notifyCancel()`

**Item collection:**
- Resource pickup events (alongside or replacing `LevelAudioDirector.notifyResourcePickup()`) → `uiAudio.notifyItemCollected()`

**Laser:**
- Turret fire controller, per pulse → `uiAudio.notifyLaserFire()`

Exact call sites are found by grepping during implementation (mission dock panel, turret controller, button components).

## Acceptance Criteria

1. All 10 audio files copied and renamed into `public/sound/`
2. `audioManifest.ts` updated: 4 existing UI entries filled, 6 new UI entries added, 1 new SFX entry added
3. `UiAudioDirector.ts` created with all 15 notify methods, exported as `uiAudio` singleton
4. `uiAudio` imported and wired at the identified call sites
5. `bun run type-check` passes
6. `bun run lint` passes (TSDoc on all exports)
