# Intro Cinematic Expansion — Design Spec

**Date:** 2026-04-09
**Author:** guinetik
**Status:** Draft

---

## Overview

Expand the map intro cinematic from 3 beats / 14 seconds to 6 visual moments across 5 story beats / ~30 seconds. New beats establish core lore: the Enceladus discovery, the Viroid threat, and Jupiter's cloud-city shipyards before zooming to the player's shuttle near Earth.

## GDD Lore Updates

The following lore points are canonized (update `docs/asteroid-lander-gdd.md`):

1. **Neutron thrusters** were discovered on Enceladus (Saturn's moon), not invented. They enable relativistic acceleration.
2. **Viroids** — silicate creatures from interstellar space — were already on Enceladus in stasis. Humanity's activity woke them. They are territorial and lethal.
3. Neutron thrusters fit remarkably well with 21st-century space tech (NASA-era designs).
4. **Jupiter's cloud city** houses 3D-printing assembly lines. Raw materials come from Jupiter's moons. Ships based on old NASA designs were mass-produced here.
5. Humanity spread rapidly to the outer solar system thanks to the neutron thruster.
6. The player character is Earth-born, lived on the Moon, is now retired and lives aboard his refurbished shuttle.

## Caption Sequence

| Beat | Eased Progress | Duration | Caption |
|------|---------------|----------|---------|
| 1 — Wide Solar System | 0.00–0.12 | ~3.6s | `SOLAR SYSTEM, 2299 AD.` |
| 2 — Enceladus Discovery | 0.12–0.28 | ~4.8s | `A DISCOVERY ON ENCELADUS UNLOCKED RELATIVISTIC ACCELERATION AT OUR FINGERTIPS: THE NEUTRON THRUSTER.` |
| 3 — Viroid Reveal | 0.28–0.42 | ~4.2s | `BUT IT WAS HOME TO SOMETHING ELSE. SILICATE CREATURES FROM INTERSTELLAR SPACE. TERRITORIAL AND LETHAL. WE CALL THEM VIROIDS.` |
| 4a — Jupiter Approach | 0.42–0.56 | ~4.2s | `FROM THE NEUTRON, HUMANITY SPREAD TO THE OUTER SYSTEM. JUPITER'S MOONS PROVIDED THE RAW MATERIALS.` |
| 4b — Cloud City Reveal | 0.56–0.70 | ~4.2s | `ABOVE THE SURFACE, A CLOUD CITY 3D-PRINTED THE ASSEMBLY LINES.` |
| 5 — Earth & Player | 0.70–1.00 | ~9.0s | `A RETIRED LANDER OPERATOR JUST RECEIVED A REFURBISHED SHUTTLE FROM THE SPACE PROGRAM.` |

## Camera Beats

### Beat 1 — Wide Solar System (existing)

- **Camera:** starts at `(0, 320, 900)`, FOV 32, looking at origin
- **Visual:** full orrery visible, letterbox bars active
- **No changes** to current behavior in this range

### Beat 2 — Enceladus Discovery

- **Camera:** lerps from wide shot toward Saturn's current world position
- **Target:** the Enceladus moon mesh (child of Saturn's `PlanetSystemController.group`)
- **Framing:** camera arrives at an offset that keeps Saturn visible in background with Enceladus prominent in foreground
- **FOV:** narrows slightly (e.g. 28) to telescope in on the moon
- **Implementation:** use `getPlanetControllerById('saturn')` to get Saturn's group position. Enceladus is the 2nd moon entry (index 1) in Saturn's moon array. Read its mesh world position for the camera target.

### Beat 3 — Viroid Reveal

- **Camera:** holds near Enceladus, pulls slightly closer
- **Visual:** a `VirusModel` instance is created (async, preloaded during beat 2 transition) and placed in-scene near Enceladus's world position, rotating slowly on Y axis
- **Rotation:** ~0.3 rad/s yaw, giving it a slow menacing spin
- **Scale:** large enough to read clearly against Enceladus (tune visually)
- **Cleanup:** virus model is disposed when camera exits beat 3

### Beat 4a — Jupiter Approach

- **Camera:** sweeps from Saturn region to Jupiter's current world position
- **Target:** Jupiter center (from `getPlanetControllerById('jupiter')`)
- **Framing:** wider than the Enceladus shot — show Jupiter and its moon system to convey industrial scale
- **FOV:** opens up slightly (e.g. 35) to sell the gas giant's size

### Beat 4b — Cloud City Reveal

- **Camera:** holds on Jupiter, pulls slightly closer (same pattern as beat 3 Viroid reveal)
- **Visual:** a `CityModel` instance spawns inside Jupiter (below surface Y) and rises upward through the atmosphere during the beat, selling the idea that the cloud city lives inside the gas giant
- **Rise animation:** Y position lerps from below-surface start to above-surface end, eased with `easeInOut`
- **Scale:** tuned visually to read against Jupiter's display radius (0.0165)
- **Rotation:** slow yaw spin (~0.2 rad/s) on Y axis
- **Cleanup:** city model is disposed when camera exits beat 4b

### Beat 5 — Earth & Player (existing, repositioned)

- **Camera:** sweeps from Jupiter to the shuttle near Earth
- **Transition:** lerps from Jupiter framing to the existing hero offset position (`MAP_INTRO_HERO_OFFSET` relative to shuttle)
- **Hero hold:** same as current — camera locks on shuttle with `MAP_INTRO_HERO_FOV = 42`
- **Orbit handoff:** same as current — lerps from hero to `VehicleCamera` position
- **Sub-beats within 0.70–1.00:**
  - 0.70–0.82: travel from Jupiter to hero position
  - 0.82–0.92: hero hold (shuttle close-up)
  - 0.92–1.00: orbit camera handoff

## File Changes

### `src/lib/mapIntroState.ts`

- Update `MAP_INTRO_CINEMATIC_DURATION` from 14 to 30
- Replace the 2 threshold constants with 5 new beat boundaries (0.12, 0.28, 0.42, 0.56, 0.70)
- Add all 6 caption constants
- Update `mapIntroCaptionForEasedProgress()` to select from 6 captions

### `src/views/MapViewController.ts`

- Add camera position/FOV constants for Enceladus, Jupiter, and the transitions between them
- Expand `tickStartupIntroCamera()` from 3 branches to 6+ branches matching the new beat boundaries
- In beat 2: look up Saturn controller, compute Enceladus world position for camera target
- In beat 3: spawn `VirusModel` instance near Enceladus, rotate it each tick, dispose on exit
- In beat 4a: look up Jupiter controller for camera target
- In beat 4b: spawn `CityModel` instance near Jupiter surface, rotate it each tick, dispose on exit
- In beat 5: reuse existing hero hold and orbit handoff logic

### `src/views/MapView.vue`

- No structural changes expected — captions already driven reactively from `mapIntroState`

### `docs/asteroid-lander-gdd.md`

- Update Lore & Setting section with the 6 canonized lore points above

## Intro Prop Lifecycles

Both props follow the same pattern: preload early, spawn at beat start, animate with slow yaw, dispose on beat exit.

### VirusModel (Beat 3)

- **Preload:** call `VirusModel.preload()` during scene init
- **Create:** `VirusModel.create()` at start of beat 3 (progress crosses 0.28)
- **Place:** position near Enceladus world position with a small offset so it doesn't clip the moon mesh
- **Animate:** increment `group.rotation.y` by ~0.3 rad/s each tick
- **Dispose:** call `dispose()` and remove from scene when progress exits 0.42
- **State:** `private introVirusModel: VirusModel | null` on `MapViewController`

### CityModel (Beat 4b)

- **Preload:** call `CityModel.preload()` during scene init (alongside VirusModel)
- **Create:** `CityModel.create()` at start of beat 4b (progress crosses 0.56)
- **Place:** starts below Jupiter's surface (Y = -0.5 relative to Jupiter), rises to above surface (Y = 1.5) during beat 4b via eased Y lerp
- **Animate:** yaw rotation at ~0.2 rad/s + Y-axis rise from atmosphere (eased lerp tied to beat progress)
- **Dispose:** call `dispose()` and remove from scene when progress exits 0.70
- **State:** `private introCityModel: CityModel | null` on `MapViewController`

## Testing

- Unit tests for `mapIntroCaptionForEasedProgress()` updated to cover 6 caption boundaries
- No new test files needed — this is cinematic/visual code

## Open Questions

- Exact camera offsets for Enceladus and Jupiter framing will need visual tuning in-engine
- VirusModel scale relative to Enceladus needs tuning (Enceladus displayRadius is 0.0008, very small)
- Whether orbit lines / space-time grid should be suppressed during beats 2-4 (currently suppressed during entire cinematic via `suppressIntroMapLayers()`)
