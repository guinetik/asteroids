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
| `ambient.landerCockpit` | Arrival cinematic → stops when lander detaches | loop | ✅ wired in `LevelViewController.enterArrival` / `onComplete` |
| `ambient.habitat` | Shuttle habitat — starts on enter, stops on exit | loop | ✅ wired in `MapViewController.onEnterHabitat` / `onExitHabitat` |
| `ambient.anomaly` | Gravitational anomaly nearby | loop | ✅ wired in `MapViewController` anomaly callbacks |
| `ambient.wind` | High-speed traversal / near-atmosphere | loop | 🔲 Placeholder |

---

## 4. Shuttle — Propulsion & Orbital

| ID | Trigger | Playback | Status |
|----|---------|----------|--------|
| `sfx.thrusterLoop` | Sustained shuttle main burn | loop (single-instance) | ✅ wired in `ThrusterEffectController.tick`; silenced during habitat via `setAudioEnabled(false)` |
| `sfx.thrusterBurst` | RCS yaw puffs | one-shot (overlap) | ✅ wired in `ThrusterEffectController.tick` (rising edge); silenced during habitat |
| `sfx.brake` | Inertia dampener fires | one-shot (restart) | ✅ wired in `ThrusterEffectController.tick` (rising edge); silenced during habitat |
| `sfx.slingshot` | Slingshot launch release | one-shot (restart) | ✅ wired in `MapOrbitFacade.handleOrbitInput` |
| `sfx.slingshot.charge` | E held while orbiting — slingshot charging | loop (single-instance) | ✅ wired in `MapOrbitFacade.handleOrbitInput` (rising/falling edge) |
| `sfx.orbitCapture` | `free → approaching` (E pressed near body) | one-shot (restart) | ✅ wired in `MapOrbitFacade.handleOrbitInput` |
| `sfx.fuelWarning` | Shuttle fuel low | one-shot (rate-limited, 3 s) | 🔊 Asset on disk, needs hook |

---

## 5. Lander — Flight & Terrain

| ID | Trigger | Playback | Status |
|----|---------|----------|--------|
| `sfx.lander.thrusterLoop` | Sustained lander main engine | loop (single-instance) | ✅ wired in `LanderController.tick` (rising/falling edge) |
| `sfx.lander.thrusterBurst` | Lander RCS puffs | one-shot (overlap) | ✅ wired in `LanderController.tick` (rising edge) |
| `sfx.landing` | Safe touchdown (damage === 0) | one-shot (restart) | ✅ wired in `LanderController.tick` |
| `sfx.collision` | Hard landing with damage | one-shot (overlap) | ✅ wired in `LanderController.tick` |
| `sfx.explosion` | Fatal crash (`onCrash`) | one-shot (overlap) | 🔊 Asset on disk, no hook yet (hooked via `onCrash` callback in `LevelViewController`) |
| `sfx.fuelWarning` | Lander fuel low | rate-limited | 🔊 Shared with shuttle warning |

---

## 6. Level / Cinematic

| ID | Trigger | Playback | Status |
|----|---------|----------|--------|
| `sfx.level.arrival` | Arrival cinematic begins | one-shot (restart) | ✅ wired in `LevelViewController.enterArrival` |
| `sfx.arrivalSeparation` | Lander detaches from cargo bay | one-shot (restart) | ✅ wired in `LevelViewController` `onLanderDetach` callback |
| `sfx.dockingClamp` | Lander docks into cargo bay during exfil | one-shot (restart) | ✅ wired in `ArrivalSequence.tickExfilDock` (t >= 1) |

---

## 7. EVA / FPS — Multitool & Combat

| ID | Trigger | Playback | Status |
|----|---------|----------|--------|
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

## 10. Orphan Asset

| File | Status |
|------|--------|
| `public/sound/shuttle.mp3` | On disk, not in manifest — candidate for `ambient.engine` idle bed or menu background music variant |

---

## Files on Disk vs. Manifest

| File | Manifest ID | Hooked |
|------|-------------|--------|
| `ambient.anomaly.mp3` | `ambient.anomaly` | ✅ |
| `ambient.engine.mp3` | `ambient.engine` | — |
| `ambient.habitat.mp3` | `ambient.habitat` | ✅ |
| `ambient.landerCockpit.mp3` | `ambient.landerCockpit` | ✅ |
| `ambient.space.mp3` | `ambient.space` | ✅ |
| `sfx.arrivalSeparation.mp3` | `sfx.arrivalSeparation` | ✅ |
| `sfx.brake.mp3` | `sfx.brake` | ✅ |
| `sfx.collision.mp3` | `sfx.collision` | ✅ |
| `sfx.dockingClamp.mp3` | `sfx.dockingClamp` | ✅ |
| `sfx.explosion.mp3` | `sfx.explosion` | — (needs `onCrash` hook) |
| `sfx.fuelWarning.mp3` | `sfx.fuelWarning` | — (needs low-fuel hook) |
| `sfx.lander.thrusterBurst.mp3` | `sfx.lander.thrusterBurst` | ✅ |
| `sfx.lander.thrusterLoop.mp3` | `sfx.lander.thrusterLoop` | ✅ |
| `sfx.landing.mp3` | `sfx.landing` | ✅ |
| `sfx.level.arrival.mp3` | `sfx.level.arrival` | ✅ |
| `sfx.orbitCapture.mp3` | `sfx.orbitCapture` | ✅ |
| `sfx.slingshot.mp3` | `sfx.slingshot` | ✅ |
| `sfx.slingshot.charge.mp3` | `sfx.slingshot.charge` | ✅ |
| `sfx.thrusterBurst.mp3` | `sfx.thrusterBurst` | ✅ |
| `sfx.thrusterLoop.mp3` | `sfx.thrusterLoop` | ✅ |
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
- `sfx.slingshotCharge` (rising whine loop while E held)
- `sfx.fuelWarning` needs hook (file exists, just needs in-game trigger)
- `sfx.explosion` needs `onCrash` hook in `LevelViewController`
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
