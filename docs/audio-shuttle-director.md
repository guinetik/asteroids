# Shuttle Audio Director

## Overview

`ShuttleAudioDirector` (`src/audio/ShuttleAudioDirector.ts`) is the
single owner for all **shuttle gameplay audio** in the map view. It
mirrors the `FpsAudioDirector` metaphor: the host view pushes per-frame
state via `update(dt, state)` and fires one-shot / edge events via
`notify*()` methods. The director owns every loop handle and edge flag
it touches, so the rest of the codebase no longer threads Howler
handles through callbacks, facade dependencies, or crash-cleanup paths.

The director lives on `MapViewController` and is wired to:

- the orbit facade (`MapOrbitFacade`)
- the mission facade (`MapMissionFacade`)
- the lifecycle facade (`MapLifeCycleFacade`)
- the shuttle controller (`ShuttleController`) via a callback hook
- the orbital surfing controller's coupling/dive/end callbacks
- the gravitational event manager's nearby-anomaly callbacks
- the habitat enter/exit transitions

## What it owns

| Audio ID                    | Type     | Lifetime / trigger                                              |
|-----------------------------|----------|-----------------------------------------------------------------|
| `ambient.space`             | loop     | active between `start()` and `notifyEnterHabitat()`             |
| `ambient.habitat`           | loop     | active between `notifyEnterHabitat()` and `notifyExitHabitat()` |
| `ambient.anomaly`           | loop     | gated by `notifyAnomalyProximityStart` / `…End`                 |
| `sfx.slingshot.charge`      | loop     | gated by per-frame `update({ slingshotCharging })`              |
| `sfx.wormhole`              | loop     | manifold tunnel, rate-stretched to match dive duration          |
| `sfx.cargo.open` / `.close` | one-shot | `notifyCargoDoorsToggled(open)`                                 |
| `sfx.orbitCapture`          | one-shot | `notifyOrbitCapture()`                                          |
| `sfx.slingshot` + `.burst`  | one-shot | `notifySlingshotRelease()`                                      |
| `sfx.mission.shuttle.clear` | one-shot | `notifyMissionDelivered()`                                      |

## What it explicitly does **not** own

- **Shuttle main engine, RCS, brake** — these are already nicely
  encapsulated in `ThrusterEffectController` (`ShuttleThrusterSound`,
  `InertialDampenerSound`, `sfx.thrusterBurst`). Trying to relocate
  them would only fight the existing envelope handling.
- **Habitat interior FPS audio** — owned by the habitat scene.
- **Level / EVA on-foot audio** — owned by `FpsAudioDirector`.
- **Lander engine / RCS / alarms / gyro / touchdown** — owned by
  `LanderController`.

## API

```ts
interface ShuttleAudioState {
  /** True while orbiting + orbitAction key held (drives charge whine). */
  slingshotCharging: boolean
}

class ShuttleAudioDirector {
  start(): void                   // begin map (space) ambient bed
  stop(): void                    // halt every loop the director owns
  dispose(): void                 // alias for stop()

  update(dt: number, state: ShuttleAudioState): void
                                  // edge-detect slingshotCharging,
                                  // start/stop sfx.slingshot.charge

  notifyEnterHabitat(): void      // swap space → habitat ambient
  notifyExitHabitat(): void       // swap habitat → space ambient

  notifyAnomalyProximityStart(): void
  notifyAnomalyProximityEnd(): void

  notifyCargoDoorsToggled(open: boolean): void

  notifyOrbitCapture(): void
  notifySlingshotRelease(): void
  cancelSlingshotCharge(): void   // force-stop the charge loop now

  notifyManifoldCouplingStart(): void
  notifyManifoldDiveStarted(travelTimeSec: number, coupleDurationSec: number): void
  notifyManifoldSurfEnd(): void

  notifyMissionDelivered(): void
  notifyShuttleDestroyed(): void  // sfx category sweep + drop loops
}
```

## Wiring

### `MapViewController`

```ts
private readonly shuttleAudio = new ShuttleAudioDirector()

// init() final step (replaces useAudio().play('ambient.space', { loop: true }))
this.shuttleAudio.start()

// onCreate of shuttleController
this.shuttleController.onDoorsToggled = (open) => {
  this.shuttleAudio.notifyCargoDoorsToggled(open)
}

// gravitationalEventManager nearby callbacks
onNearbyAnomalyStart: () => this.shuttleAudio.notifyAnomalyProximityStart(),
onNearbyAnomalyFinish: () => this.shuttleAudio.notifyAnomalyProximityEnd(),

// orbitalSurfingController callbacks
onCouplingStart: () => this.shuttleAudio.notifyManifoldCouplingStart(),
onDiveStart: (travelTimeSec) =>
  this.shuttleAudio.notifyManifoldDiveStarted(
    travelTimeSec,
    MAP_CONFIG.ORBITAL_SURF_COUPLE_DURATION_SEC,
  ),
onSurfEnd: () => this.shuttleAudio.notifyManifoldSurfEnd(),

// onEnterHabitat() / onExitHabitat()
this.shuttleAudio.notifyEnterHabitat()
this.shuttleAudio.notifyExitHabitat()

// per-frame at end of tick(dt)
this.shuttleAudio.update(dt, {
  slingshotCharging: this.orbitFacade.isChargingSlingshot,
})

// dispose()
this.shuttleAudio.dispose()
```

### `MapOrbitFacade`

- `OrbitInputDeps` now includes `audio: ShuttleAudioDirector`.
- The internal `_chargeSoundPlaying` flag has been replaced by the
  semantically-named `_isChargingSlingshot`, exposed as
  `get isChargingSlingshot(): boolean`. The facade no longer plays or
  stops the slingshot charge loop directly — it just toggles the flag
  on the rising / falling edge and lets the director's per-frame
  update drive the audio.
- `useAudio().play('sfx.orbitCapture')` →
  `audio.notifyOrbitCapture()`.
- `useAudio().play('sfx.slingshot') + play('sfx.slingshot.burst')` →
  `audio.notifySlingshotRelease()`.
- The private `stopChargeSound()` helper has been removed; dev-warp
  and orbit-state-change paths just clear `_isChargingSlingshot`.

### `MapMissionFacade`

- `missionComplete(params)` now takes `audio: ShuttleAudioDirector`.
- The trailing `useAudio().play('sfx.mission.shuttle.clear')` is now
  `params.audio.notifyMissionDelivered()`.

### `MapLifeCycleFacade`

- `TriggerDeathDeps` now includes `audio: ShuttleAudioDirector`.
- `triggerDeath` no longer calls `useAudio().stopCategory('sfx')` /
  `stopSound('ambient.anomaly')` directly — it calls
  `audio.notifyShuttleDestroyed()`, which performs both sweeps and
  drops the director's own internal handle references so the next
  rising edge re-creates them cleanly.

### `ShuttleController`

- `toggleDoors()` no longer touches `useAudio()`. It flips
  `doorsOpen` and fires the new `onDoorsToggled?: (open: boolean) =>
  void` callback. `MapViewController` wires the callback to
  `shuttleAudio.notifyCargoDoorsToggled(open)`.
- The `useAudio` import has been removed entirely.

## Why the per-frame `update(dt, state)`?

Only the slingshot charge whine needs per-frame edge detection — every
other shuttle-gameplay audio event is one-shot or has a clear
start/end notification. Keeping the per-frame surface tiny matches the
`FpsAudioDirector` shape (which uses it for breathing / floating /
contact-damage envelopes) and leaves room to grow into other
continuously-driven loops (e.g. proximity-based ambient blending) if
ever needed.

## Authoring guidance

- New shuttle-gameplay audio? Add a `notify*()` method or a field on
  `ShuttleAudioState` — never reach for `useAudio()` from inside a
  facade or controller.
- New ambient bed swap? Mirror `notifyEnterHabitat` / `notifyExitHabitat`.
- New gameplay loop with start / end events? Add a private handle
  field, lazy-create on the start notify, stop on the end notify, and
  null both in `tearDownLoops()`.
- Failure / cleanup paths should call `notifyShuttleDestroyed()` (or
  `cancelSlingshotCharge()` for narrower scopes) rather than reaching
  for `stopCategory('sfx')` directly.
