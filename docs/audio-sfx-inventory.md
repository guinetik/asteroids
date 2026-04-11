# Audio SFX Inventory — Asteroid Lander

Sourcing and wiring reference for all sound effects, music, ambient beds, and voice.

**Status legend:**
- ✅ Wired — real file on disk + hooked into gameplay code
- 🔊 Asset only — file on disk, wired into manifest, no gameplay hook yet
- 🔲 Placeholder — silent WAV in manifest, no file yet
- ➕ Future — not in manifest yet, worth adding later

---

## 1. UI

| ID | Trigger | Playback | Status |
|----|---------|----------|--------|
| `ui.click` | Buttons, tabs, mail rows, generic confirms | one-shot (restart) | 🔲 Placeholder |
| `ui.confirm` | Purchase, mission accept, dialog OK | one-shot (restart) | 🔲 Placeholder |
| `ui.error` | Invalid action, cannot afford, blocked state | one-shot (restart) | 🔲 Placeholder |
| `ui.hover` | Hover / focus on interactive elements | one-shot (rate-limited, 80 ms) | 🔲 Placeholder |
| `ui.panelOpen` | Map overlay, shop dialog, mission board open | one-shot | ➕ Future |
| `ui.panelClose` | Same panels close | one-shot | ➕ Future |
| `ui.notification` | Inbox message arrives | one-shot | ➕ Future |
| `ui.tabSwitch` | Shuttle terminal tab changes | one-shot | ➕ Future |
| `ui.upgradeInstall` | Upgrade purchase confirmed | one-shot | ➕ Future |
| `ui.missionComplete` | All objectives done before exfil | one-shot stinger | ➕ Future |
| `ui.missionDeliver` | Shuttle mission delivered at map | one-shot | ➕ Future |

---

## 2. Music

| ID | Trigger | Playback | Status |
|----|---------|----------|--------|
| `music.menu` | Map / cruise screen | loop | ✅ `theme.mp3` |
| `music.level` | Asteroid level active | loop | ✅ `level.mp3` |
| `music.gameover` | Ship death, mission failure | single-instance | 🔲 Placeholder |
| `music.victory` | Mission success stinger | single-instance | ➕ Future |

---

## 3. Ambient

| ID | Trigger | Playback | Status |
|----|---------|----------|--------|
| `ambient.space` | Map cruise — starts with map, stops on habitat enter | loop | ✅ wired in `MapViewController.init` + `onEnterHabitat` |
| `ambient.engine` | Shuttle idle (manifest only, no hook yet) | loop | 🔊 Asset on disk, needs hook |
| `ambient.landerCockpit` | Arrival + exfil cinematic — stops when sequence ends or is skipped | loop | ✅ wired in `LevelViewController.enterArrival` / `enterExfil` / `onComplete` |
| `ambient.habitat` | Shuttle habitat — starts on enter, stops on exit | loop | ✅ wired in `MapViewController.onEnterHabitat` / `onExitHabitat` |
| `ambient.anomaly` | Gravitational anomaly nearby | loop | ✅ wired in `MapViewController` anomaly callbacks; fixed so it always stops even if anomaly drifts out of range |
| `ambient.asteroid` | Asteroid level — plays for entire level session | loop | ✅ wired in `LevelViewController.init` / `dispose` |
| `ambient.wind` | High-speed traversal / near-atmosphere | loop | 🔲 Placeholder |

---

## 4. Shuttle — Propulsion & Orbital

| ID | Trigger | Playback | Status |
|----|---------|----------|--------|
| `sfx.thrusterBurst` | W held — shuttle main engine (loops with fade-in/out envelope) | loop (single-instance, manual fade) | ✅ wired in `ThrusterEffectController.tick`; silenced in habitat via `setAudioEnabled(false)` |
| `sfx.brake` | Inertia dampener fires | one-shot (restart) | ✅ wired in `ThrusterEffectController.tick` (rising edge); silenced in habitat |
| `sfx.slingshot` | Slingshot launch release | one-shot (restart) | ✅ wired in `MapOrbitFacade.handleOrbitInput` |
| `sfx.slingshot.charge` | E held while orbiting — slingshot charging | loop (single-instance) | ✅ wired in `MapOrbitFacade.handleOrbitInput` (rising/falling edge) |
| `sfx.slingshot.burst` | Slingshot fired / E released | one-shot (restart) | ✅ wired in `MapOrbitFacade.handleOrbitInput` on release |
| `sfx.orbitCapture` | `free → approaching` (E pressed near body) | one-shot (restart) | ✅ wired in `MapOrbitFacade.handleOrbitInput` |
| `sfx.fuelWarning` | Shuttle fuel low | one-shot (rate-limited, 3 s) | 🔊 Asset on disk, needs hook |
| `sfx.cargo.open` | Cargo doors open (R key or arrival cinematic) | one-shot (restart) | ✅ wired in `ShuttleController.toggleDoors` + `ArrivalSequence.nextPhase` |
| `sfx.cargo.close` | Cargo doors close (R key or exfil cinematic) | one-shot (restart) | ✅ wired in `ShuttleController.toggleDoors` + `ArrivalSequence.nextExfilPhase` |

---

## 5. Lander — Flight & Terrain

| ID | Trigger | Playback | Status |
|----|---------|----------|--------|
| `sfx.lander.thrusterLoop` | W held — lander main engine (loops with fade-in/out envelope) | loop (single-instance, manual fade) | ✅ wired in `LanderController.tick` |
| `sfx.landing` | Safe touchdown (damage === 0) | one-shot (restart) | ✅ wired in `LanderController.tick` |
| `sfx.touchdown` | Every touchdown — volume scales with impact speed (min 0.4) | one-shot (restart) | ✅ wired in `LanderController.tick` alongside `sfx.landing` / `sfx.collision` |
| `sfx.collision` | Non-fatal damage impact — volume scales with hull damage | one-shot (overlap) | ✅ wired in `LanderController.tick` (`hp > 0` branch) |
| `sfx.explosion` | Fatal crash — lander destroyed (`hp ≤ 0`) | one-shot (overlap) | ✅ wired in `LanderController.tick` (`hp <= 0` branch) |
| `sfx.lander.gyro` | Q/E held — lander rotation (hull-exterior DSP) | loop (single-instance, manual fade) | ✅ wired in `LanderController.tick` (edge detection, no restart on direction change) |
| `sfx.lander.alarm` | Descent speed exceeds safe threshold | loop (single-instance) | ✅ wired in `LanderController.updateWarningBeacon` (edge on `descentWarningLevel`) |
| `sfx.lander.alarm.attitude` | Tilt angle exceeds safe threshold | loop (single-instance) | ✅ wired in `LanderController.updateWarningBeacon` (edge on `attitudeWarningLevel`) |
| `sfx.lander.thruster.ground` | Thruster wash visible near surface — volume tracks effect intensity | loop (single-instance) | ✅ wired in `ThrusterWashController.update`; guarded so EVA jump can't trigger it |
| `sfx.lander.shake` | Camera shake while thrusting near ground — volume tracks vibration intensity (hull-exterior DSP) | loop (single-instance) | ✅ wired in `LevelViewController` thrust-vibration block |
| `sfx.fuelWarning` | Lander fuel low | rate-limited | 🔊 Shared with shuttle; needs hook |

---

## 6. Level / Cinematic

| ID | Trigger | Playback | Status |
|----|---------|----------|--------|
| `sfx.level.arrival` | Exfil sequence — plays when shuttle starts departing (`depart` phase) | one-shot (restart) | ✅ wired in `ArrivalSequence.nextExfilPhase` (not arrival) |
| `sfx.arrivalSeparation` | Lander detaches from cargo bay (arrival) | one-shot (restart) | ✅ wired in `LevelViewController` `onLanderDetach` callback |
| `sfx.dockingClamp` | Lander docks into cargo bay during exfil | one-shot (restart) | ✅ wired in `ArrivalSequence.tickExfilDock` (t >= 1) |

---

## 7. EVA / FPS — Movement & Combat

| ID | Trigger | Playback | Status |
|----|---------|----------|--------|
| `sfx.step.habitat.1` | Alternate footstep A on habitat floor | one-shot (overlap) | ✅ wired in `HabitatInteriorScene.tickMovement` via `FootstepSystem` |
| `sfx.step.habitat.2` | Alternate footstep B on habitat floor | one-shot (overlap) | ✅ wired in `HabitatInteriorScene.tickMovement` via `FootstepSystem` |
| `sfx.step.asteroid.1` | Alternate footstep A on asteroid surface | one-shot (overlap) | ✅ wired in `LevelViewController.tickEva` via `FootstepSystem` |
| `sfx.step.asteroid.2` | Alternate footstep B on asteroid surface | one-shot (overlap) | ✅ wired in `LevelViewController.tickEva` via `FootstepSystem` |
| `sfx.jump` | FPS player jumps | one-shot (single-instance) | ✅ wired in `FpsPlayerController.tick` (rising edge of `canJump`) |
| `sfx.floating` | Airborne in low gravity — delayed 0.5 s onset, 600 ms fade-in | loop (single-instance) | ✅ wired in `LevelViewController.tickEva` (`_floatTimer` threshold) |
| `sfx.breathing.walk` | EVA idle breath — plays on EVA enter; stops on sprint | loop (single-instance) | ✅ wired in `LevelViewController.enterEva` / `tickEva` |
| `sfx.breathing.run` | EVA exerted breath — plays while sprinting with O₂ charge | loop (single-instance) | ✅ wired in `LevelViewController.tickEva` (crossfades with walk; no run breath when O₂ depleted) |
| `sfx.laserFire` | Weapon (LAS) auto-fire | one-shot (overlap) | 🔲 Placeholder |
| `sfx.projectileHit` | Bolt hits enemy or terrain | one-shot (overlap) | 🔲 Placeholder |
| `sfx.shieldHit` | Shield absorbs a hit | one-shot (overlap) | 🔲 Placeholder |
| `sfx.pickup` | Collect package / cargo | one-shot (restart) | 🔲 Placeholder |
| `sfx.drillFire` | Drill mode held | loop while held | ➕ Future |
| `sfx.drillHit` | Drill bolt impacts rock | one-shot (overlap) | ➕ Future |
| `sfx.healBeam` | Med beam on hostage | loop while healing | ➕ Future |
| `sfx.multiToolSwitch` | Mode change (drill/weapon/heal) | one-shot | ➕ Future |
| `sfx.playerHurt` | Player takes damage in EVA | one-shot (overlap) | ➕ Future |
| `sfx.playerDeath` | Player EVA death | one-shot | ➕ Future |
| `sfx.enemyCrawlerSkitter` | Bacteriophage crawler movement | loop (per-enemy) | ➕ Future |
| `sfx.enemySpireShot` | Spire fires ranged projectile | one-shot | ➕ Future |
| `sfx.enemyChimeraLaser` | Chimera eye laser | one-shot | ➕ Future |
| `sfx.hostageHurt` | Hostage takes damage | one-shot | ➕ Future |
| `sfx.hostageRescued` | Hostage fully healed | one-shot | ➕ Future |
| `sfx.virusCountdown` | Rescue minigame countdown | loop | ➕ Future |
| `sfx.virusDetonation` | Virus explodes | one-shot | ➕ Future |

---

## 8. Game Flow & Meta

| ID | Trigger | Playback | Status |
|----|---------|----------|--------|
| `sfx.objectiveComplete` | Single objective ticked | one-shot | ➕ Future |
| `sfx.shipHullStress` | `ShipHealth` radiation / temp damage | rate-limited | ➕ Future |
| `sfx.shipDestruction` | `ShipHealth.onDeath` | one-shot | ➕ Future |
| `sfx.portalTransition` | Portal departure | one-shot | ➕ Future |

---

## 9. Voice / Comms

| ID | Trigger | Playback | Status |
|----|---------|----------|--------|
| `voice.comms` | Any `play('voice.comms', { src })` call | exclusive-category + radio DSP | ✅ wired, ducks UI+SFX |
| `marta-001.mp3` | `map_start_earth_orbit` | dynamic via comms | ✅ on disk |
| `jay-001.mp3` | `map_first_slingshot` | dynamic via comms | ✅ on disk |
| `jay-002.mp3` | `map_brake_used` | dynamic via comms | ✅ on disk |
| *(remaining text-only messages)* | `map_leave_earth_distance`, `map_main_thruster_depleted`, `mission_start`, `map_venus_orbit_warning` | — | No audio yet |

---

## 10. Audio Effects (DSP Presets)

| Preset | Applied To | Description |
|--------|-----------|-------------|
| `none` | Most SFX | Dry signal, no processing |
| `radio` | — | Band-pass + distortion, simulates radio transmission |
| `helmet-comms` | `voice.comms` | Narrow band-pass, slight distortion for suit comms |
| `terminal-beep` | — | Resonant high-pass for UI terminal sounds |
| `hull-exterior` | `sfx.lander.gyro`, `sfx.lander.shake` | Heavy low-pass (900 Hz) + slight distortion — simulates mechanical sound heard through a hull from inside the cockpit |

---

## 11. Orphan Assets

| File | Status |
|------|--------|
| `public/sound/shuttle.mp3` | On disk, not in manifest — candidate for `ambient.engine` idle bed |
| `public/sound/sfx.lander.thrusterBurst-old.mp3` | Superseded file, safe to delete |

---

## 12. Files on Disk vs. Manifest

| File | Manifest ID | Hooked |
|------|-------------|--------|
| `ambient.anomaly.mp3` | `ambient.anomaly` | ✅ |
| `ambient.asteroid.mp3` | `ambient.asteroid` | ✅ |
| `ambient.engine.mp3` | `ambient.engine` | — |
| `ambient.habitat.mp3` | `ambient.habitat` | ✅ |
| `ambient.landerCockpit.mp3` | `ambient.landerCockpit` | ✅ |
| `ambient.space.mp3` | `ambient.space` | ✅ |
| `sfx.arrivalSeparation.mp3` | `sfx.arrivalSeparation` | ✅ |
| `sfx.brake.mp3` | `sfx.brake` | ✅ |
| `sfx.breathing.run.mp3` | `sfx.breathing.run` | ✅ |
| `sfx.breathing.walk.mp3` | `sfx.breathing.walk` | ✅ |
| `sfx.cargo.close.mp3` | `sfx.cargo.close` | ✅ |
| `sfx.cargo.open.mp3` | `sfx.cargo.open` | ✅ |
| `sfx.collision.mp3` | `sfx.collision` | ✅ |
| `sfx.dockingClamp.mp3` | `sfx.dockingClamp` | ✅ |
| `sfx.explosion.mp3` | `sfx.explosion` | ✅ |
| `sfx.floating.mp3` | `sfx.floating` | ✅ |
| `sfx.fuelWarning.mp3` | `sfx.fuelWarning` | — (needs low-fuel hook) |
| `sfx.jump.mp3` | `sfx.jump` | ✅ |
| `sfx.lander.alarm.attitude.mp3` | `sfx.lander.alarm.attitude` | ✅ |
| `sfx.lander.alarm.mp3` | `sfx.lander.alarm` | ✅ |
| `sfx.lander.gyro.mp3` | `sfx.lander.gyro` | ✅ |
| `sfx.lander.shake.mp3` | `sfx.lander.shake` | ✅ |
| `sfx.lander.thruster.ground.mp3` | `sfx.lander.thruster.ground` | ✅ |
| `sfx.lander.thrusterBurst.mp3` | `sfx.lander.thrusterLoop` | ✅ |
| `sfx.landing.mp3` | `sfx.landing` | ✅ |
| `sfx.level.arrival.mp3` | `sfx.level.arrival` | ✅ |
| `sfx.orbitCapture.mp3` | `sfx.orbitCapture` | ✅ |
| `sfx.slingshot.burst.mp3` | `sfx.slingshot.burst` | ✅ |
| `sfx.slingshot.charge.mp3` | `sfx.slingshot.charge` | ✅ |
| `sfx.slingshot.mp3` | `sfx.slingshot` | ✅ |
| `sfx.step.asteroid.1.mp3` | `sfx.step.asteroid.1` | ✅ |
| `sfx.step.asteroid.2.mp3` | `sfx.step.asteroid.2` | ✅ |
| `sfx.step.habitat.1.mp3` | `sfx.step.habitat.1` | ✅ |
| `sfx.step.habitat.2.mp3` | `sfx.step.habitat.2` | ✅ |
| `sfx.thrusterBurst.mp3` | `sfx.thrusterBurst` | ✅ |
| `sfx.touchdown.mp3` | `sfx.touchdown` | ✅ |
| `shuttle.mp3` | — | orphan |
| `theme.mp3` | `music.menu` | ✅ |
| `level.mp3` | `music.level` | ✅ |
| `marta-001.mp3` | `voice.comms` (dynamic) | ✅ |
| `jay-001.mp3` | `voice.comms` (dynamic) | ✅ |
| `jay-002.mp3` | `voice.comms` (dynamic) | ✅ |

---

## Still Needed (sourcing list)

### Tier 1 — Gameplay-critical placeholders
- `ui.click`, `ui.confirm`, `ui.error`, `ui.hover`
- `sfx.laserFire`, `sfx.projectileHit`, `sfx.pickup`
- `music.gameover`
- `ambient.wind`

### Tier 2 — Gameplay clarity (no file yet)
- `sfx.fuelWarning` needs hook (file exists, just needs in-game trigger for both shuttle and lander)
- `sfx.shieldHit`
- `sfx.playerHurt`, `sfx.playerDeath`
- `sfx.objectiveComplete`, `ui.missionComplete`

### Tier 3 — Polish
- Enemy vocalizations (crawler, spire, chimera)
- `sfx.healBeam`, `sfx.hostageHurt`, `sfx.hostageRescued`
- `sfx.virusCountdown`, `sfx.virusDetonation`
- `sfx.drillFire`, `sfx.drillHit`, `sfx.multiToolSwitch`
- `sfx.shipHullStress`, `sfx.shipDestruction`
- `ui.panelOpen`, `ui.panelClose`, `ui.notification`, `ui.upgradeInstall`
- `sfx.portalTransition`
- `music.victory`

---

## Suggested Sources

- **[Freesound.org](https://freesound.org)** — CC0 / CC-BY SFX library
- **[NASA Audio Collection](https://www.nasa.gov/audio-and-ringtones/)** — real rocket/radio recordings (public domain)
- **[SONNISS GDC Bundle](https://sonniss.com/gameaudiogdc)** — annual free pro SFX pack
- **[itch.io — free game audio](https://itch.io/game-assets/free/tag-sound-effects)** — indie-friendly packs
- **[Pixabay Sound Effects](https://pixabay.com/sound-effects/)** — royalty-free, no attribution
- **[Kenney Assets](https://kenney.nl/assets?q=audio)** — CC0 game audio packs
- **[ZapSplat](https://www.zapsplat.com)** — free with attribution; good UI / sci-fi
