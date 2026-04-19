# Lander Audio Director

## Overview

`LanderAudioDirector` (`src/audio/LanderAudioDirector.ts`) is the
single owner for **lander cinematic + environmental audio** in the
level view. It mirrors the `FpsAudioDirector` and
`ShuttleAudioDirector` metaphor: the host view pushes per-frame state
via `update(dt, state)` and fires one-shot / edge events via
`notify*()` methods. The director owns every loop handle and the
engine-vibration shake handle, so `LevelViewController` no longer
threads Howler handles through cinematic callbacks, the per-frame
thrust-vibration block, or the crash / fail cleanup paths.

## What it owns

| Audio ID                  | Type     | Lifetime / trigger                                              |
|---------------------------|----------|-----------------------------------------------------------------|
| `ambient.asteroid`        | loop     | active between `start()` and `stop()` (entire level lifetime)   |
| `ambient.landerCockpit`   | loop     | gated by `notifyArrival/Exfil*Cinematic*`                       |
| `sfx.lander.shake`        | loop     | gated by per-frame `update({ engineFiring, vibrationFactor })`  |
| `sfx.arrivalSeparation`   | one-shot | `notifyLanderSeparation()` (dropship releases lander)           |

## What it explicitly does **not** own

- **Lander main engine** (`sfx.lander.thrusterLoop`), **descent /
  attitude alarms**, **gyro**, **touchdown**, **collision**,
  **explosion** — owned by `LanderController`. These are already
  nicely encapsulated with their own per-system envelopes that
  handle fade-out cleanly.
- **FPS / EVA on-foot audio** (breathing, floating, contact damage)
  — owned by `FpsAudioDirector`.
- **FPS player fall-damage thump** (`sfx.landing` + `sfx.grunt`),
  **mining pickup** (`sfx.pickup`), **objective explosion**
  (`sfx.explosive`) — these are FPS-player / minigame concerns, not
  lander-related, and stay as direct `useAudio()` calls in
  `LevelViewController` until they earn their own director.
- **Shuttle gameplay audio in the map view** — owned by
  `ShuttleAudioDirector`.

## API

```ts
interface LanderAudioState {
  /** True while the lander main engine is firing (gates shake loop). */
  engineFiring: boolean
  /**
   * Normalised vibration factor in [0, 1]. Host computes this from
   * its altitude curve; the director maps it linearly into the
   * configured shake-volume range.
   */
  vibrationFactor: number
}

class LanderAudioDirector {
  start(): void                  // begin asteroid wind ambient bed
  stop(): void                   // halt every loop the director owns
  dispose(): void                // alias for stop()

  update(dt: number, state: LanderAudioState): void
                                 // edge-detect engineFiring; modulate
                                 // sfx.lander.shake volume by factor

  notifyArrivalCinematicStart(): void
  notifyLanderSeparation(): void
  notifyArrivalCinematicEnd(): void

  notifyExfilCinematicStart(): void
  notifyExfilCinematicEnd(): void

  notifyLanderRunFailed(): void  // sfx category sweep + drop loops
}
```

## Wiring

### `LevelViewController`

```ts
private readonly landerAudio = new LanderAudioDirector()

// init() final step (replaces useAudio().play('ambient.asteroid', { loop: true }))
this.landerAudio.start()

// arrivalSequence callbacks
onLanderDetach: (position) => {
  // ... position the gameplay lander ...
  this.landerAudio.notifyLanderSeparation()
},
onComplete: () => {
  // ... park shuttle, show lander ...
  this.landerAudio.notifyArrivalCinematicEnd()
},

// enterArrival() — replaces useAudio().play('ambient.landerCockpit', { loop: true })
this.landerAudio.notifyArrivalCinematicStart()

// enterExfil() — same swap, plus onComplete swap to End
this.landerAudio.notifyExfilCinematicStart()
this.arrivalSequence!.onComplete = () => {
  this.landerAudio.notifyExfilCinematicEnd()
  this.onArrivalFade?.(0)
}

// ESC skip arrival cinematic — replaces stopSound('ambient.landerCockpit')
this.landerAudio.notifyArrivalCinematicEnd()

// failLanderRun() — replaces stopCategory('sfx') + stopSound + null shake handle
this.landerAudio.notifyLanderRunFailed()

// per-frame in tick(): uses the same intensity already computed for camera shake
const vibrationFactor = engineFiring ? intensity / THRUST_VIBRATION_MAX : 0
this.landerAudio.update(dt, { engineFiring, vibrationFactor })

// dispose() — replaces shake.stop() + stopSound('ambient.asteroid')
this.landerAudio.dispose()
```

The `_shakeHandle` field has been removed entirely; the per-frame
shake loop is now owned by the director and driven by the same
intensity factor that already feeds the camera shake. The two
`THRUST_SHAKE_VOL_MIN` / `_MAX` constants moved out of
`LevelViewController` into the director (they're audio concerns).

## Why the per-frame `update(dt, state)`?

Only the engine-vibration shake loop needs per-frame edge detection
and volume modulation — every other lander-cinematic audio event is
one-shot or has a clear start/end notification. Keeping the per-frame
surface tiny matches the `FpsAudioDirector` and `ShuttleAudioDirector`
shapes (each uses it for one specific continuously-driven loop), and
leaves room to grow into other intensity-driven loops if ever needed
(e.g. atmospheric entry roar tied to descent speed).

## Authoring guidance

- New lander cinematic / environmental audio? Add a `notify*()`
  method or a field on `LanderAudioState` — never reach for
  `useAudio()` from the level controller.
- New ambient bed swap? Mirror `notifyArrival/ExfilCinematicStart`
  / `…End`.
- New gameplay loop with start / end events? Add a private handle
  field, lazy-create on the start notify, stop on the end notify,
  and null both in `tearDownLoops()`.
- Failure / cleanup paths should call `notifyLanderRunFailed()`
  rather than reaching for `stopCategory('sfx')` directly.
- Lander-internal audio (engine, alarms, gyro, touchdown, crash)
  belongs in `LanderController`, not here. Crossing that boundary
  would re-create exactly the scattered-audio mess this director
  exists to clean up.
