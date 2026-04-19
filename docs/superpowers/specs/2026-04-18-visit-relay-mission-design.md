# Visit-Relay Mission Type — Game Design Spec

**Date:** 2026-04-18
**Author:** guinetik
**Status:** Draft
**Related:** `2026-04-06-shuttle-missions-design.md`, `2026-04-10-orbital-minigame-design.md`

## Problem

Shuttle missions currently have one implicit flavor: fly to a target planet, play an orbital minigame to `gather` N items, fly back, deliver. The prototype relay satellite (`RelayAntennaController`, `SatelliteModel`) has no gameplay role — it's a decorative prop. We want a new mission *type* that uses these props and exercises a different verb: **visit a point in deep space, EVA out of the shuttle, repair the relay, EVA back, deliver for reward.**

The new flavor is distinct enough from the "gather at planet" flow that it deserves its own type rather than being shoehorned into the existing `ShuttleMissionTemplate`. It also exercises a new scene transition — free-float EVA in vacuum — which the existing FPS scene (`FpsView`) does not support (the FPS controller assumes terrain + heightmap + surface gravity).

## Goals

- Add a second shuttle mission type driven by data (JSON), not code.
- Reuse the existing asteroid-mission POI pipeline to render the target waypoint on the map.
- Reuse the existing `OrbitalMiniGame` factory so the repair minigame plugs in like other minigames.
- Introduce a "free-float EVA" mode that can run inside the shuttle scene first, then be ported to the map scene.

## Non-Goals (this pass)

- Full EVA suit HUD, oxygen timer, tethers. Stub oxygen; revisit after the basic flow works.
- Multiple simultaneous visit-relay missions.
- Combat during EVA. The relay waypoint is safe space.
- New asteroid props near the waypoint. Just the satellite.

## Player Flow

1. Player docks at a planet (giver). The shuttle mission board offers a mission of type `visit_relay` alongside the usual `gather` offerings. The template specifies a waypoint position in world space (or a rule to derive one — e.g. "lagrange point between Earth and Sun").
2. Player accepts the mission. A POI marker appears on the tactical map with a satellite icon, labeled by mission name.
3. Player flies the shuttle toward the waypoint. At some threshold distance (e.g. 60 world units), the in-scene camera shows a visible relay satellite model, and a HUD prompt appears: "[E] EVA".
4. Pressing `E` triggers a transition: shuttle freezes, camera cuts to first-person, player floats in vacuum. A free-float EVA controller handles movement (omnidirectional thrust, no gravity, no terrain).
5. Player flies toward the satellite. When within interaction range of the terminal prop, a prompt appears: "[E] Access Terminal".
6. Pressing `E` opens a minigame overlay (`relay_repair` — design TBD, start with a stub placeholder).
7. Completing the minigame marks the mission as `ready-to-deliver` and dismisses the overlay. A prompt appears: "[E] Return to Shuttle".
8. Player flies back within range of the shuttle and presses `E` to re-enter. Scene transitions back to the shuttle cockpit. Shuttle becomes controllable again.
9. Player returns to the giver planet and delivers. Reward paid.

## Data Model

### Discriminated Union on `ShuttleMissionTemplate`

```ts
// src/lib/missions/types.ts

export type ShuttleMissionType = 'gather' | 'visit_relay'

interface GatherShuttleMissionTemplate {
  type: 'gather' // default when omitted for backward-compat
  id: string
  name: string
  description: string
  targetPlanet: string
  gatherQuantity: number
  reward: number
}

interface VisitRelayShuttleMissionTemplate {
  type: 'visit_relay'
  id: string
  name: string
  description: string
  /** World-space position of the relay satellite POI. */
  waypoint: { worldX: number; worldZ: number }
  /** Minigame id dispatched to OrbitalMiniGameFactory (e.g. "relay_repair"). */
  minigameType: string
  reward: number
}

export type ShuttleMissionTemplate =
  | GatherShuttleMissionTemplate
  | VisitRelayShuttleMissionTemplate
```

Existing JSON files keep working: missions without a `type` field are treated as `gather`. A migration pass adds `"type": "gather"` explicitly to all current entries for clarity.

### Example JSON

```json
// src/data/shuttle-missions/earth.json
{
  "planetId": "earth",
  "missions": [
    {
      "type": "gather",
      "id": "earth_venus_gas_science",
      "name": "Venus Atmospheric Survey",
      "targetPlanet": "venus",
      "gatherQuantity": 5,
      "reward": 1125,
      "description": "..."
    },
    {
      "type": "visit_relay",
      "id": "earth_relay_deepspace_maintenance",
      "name": "Deep-Space Relay Maintenance",
      "description": "Comms relay TX-4 is offline. EVA out, reboot the cold-gas thruster array.",
      "waypoint": { "worldX": 900, "worldZ": -650 },
      "minigameType": "relay_repair",
      "reward": 1800
    }
  ]
}
```

## Systems

### POI Rendering on Map

Reuse the asteroid-mission POI pipeline (`mapAsteroidMissionApproach.ts` for distance checks, `WaypointMarkers` for the on-map icon). A new renderer variant draws a small satellite glyph instead of the asteroid ring. Both share the "close to waypoint triggers something" check — the callback path diverges by mission type.

### In-Scene Satellite

When a visit_relay mission is active and the shuttle is within render distance of the waypoint, spawn a `RelayAntennaController` + `SatelliteModel` pair at the waypoint position (same composition as the shuttle-scene prototype). They are decorative; the interaction zone is a sphere around the waypoint, not the mesh bounds.

### Free-Float EVA Controller (new)

A new `FreeFloatEvaController` in `src/three/` — first-person camera with:
- 6-DoF thruster input (WASD = lateral, Space/Ctrl = up/down, Q/E = roll; mouse = yaw/pitch)
- No gravity, no terrain clamping
- Linear damping (low, so momentum carries)
- Shared `ThrusterSystem<'eva_thrust'>` for fuel/recharge consistency with the rest of the game
- Interaction raycast for terminal prop pickup

Why new instead of extending `FpsPlayerController`: that controller assumes heightmap + gravity + footsteps. Cleaner to write a sibling than to gate every assumption behind a flag. Shared interfaces where they overlap (e.g. interaction prompt, input bindings).

### Terminal Prop on Satellite

Add an `EvaInteractable` attachment to `SatelliteModel` or `RelayAntennaController` — a small emissive box mesh with an interaction range sphere. When the EVA player's raycast hits it within range, a HUD prompt appears. Interacting opens the minigame overlay.

### Minigame Dispatch

Register `"relay_repair"` in `orbitalMiniGameFactory.ts`. For this pass, return `DefaultOrbitalMiniGame` (the single-button stub) to unblock the flow. The real minigame (cable-routing puzzle, frequency tuning, etc.) is a separate spec.

### Mission Session State

`ShuttleMissionBoard` already tracks `activeMissions`. Extend the session API:
- `isVisitRelayMissionAtWaypoint(board, position, threshold) → mission | null` — for the map/shuttle-scene POI trigger
- `markVisitRelayReadyToDeliver(board, missionId)` — called when minigame completes
- Existing `deliverMission` handles the giver-planet payout.

## Implementation Order

The goal is to get the EVA loop right first, inside the existing shuttle scene, before wiring any of this to the mission system or the map. That way each step is playable.

### Phase 1 — EVA sandbox in `/shuttle` ✅ DONE

Playable in `/shuttle`: fly to the prototype relay, press E to open the cargo bay, egress in first-person, fly on a TRON-cyan tether with O2/RTG life support, return, shuttle unfreezes.

Shipped:
- `EvaTetherController` — 6-DoF thrust (WASD+Space/Shift), zero-g drift, verlet-rope tether with spring + hard-stop, O2 + RTG drain/recharge, TRON hologram tube visual.
- `EvaSession` — portable state machine (idle → opening → active). Owns door gating, pointer lock, huge-scale swap, camera hand-off, telemetry emission. Scene-agnostic; scene-specific knowledge injected via `EvaSessionConfig`.
- `HelmetVisor` component, `FpsHud variant="eva"` that hides combat UI.
- `ShuttleController` gained `openDoors/closeDoors/doorOpenProgress` accessors.
- EVA input bindings on `DEFAULT_BINDINGS`.
- EVA RCS audio hooked via `EvaRcsSound`.

### Phase 3 — Mission data model + board wiring ✅ DONE (ahead of Phase 2)

- Types: `VisitRelayShuttleMissionTemplate`, `ActiveVisitRelayMission`, `VisitRelayMissionStatus`, `VisitRelayMissionPool`. `ShuttleMissionBoard` extended with `offeredEvaMission`, `offeringEvaPlanet`, `evaRestockTimer`, `activeEvaMissions`.
- Content: 2 authored missions per planet (all 8) under `src/data/shuttle-missions/eva/*.json`.
- Pool loader: `evaMissionPools.ts` with `getEvaMissionPool`.
- Session API: `offerEvaMission`, `acceptEvaMission`, `tickEvaMissionBoard`. Reward scaling via `planetRewardMultiplier = max(0.85, sqrt(semiMajorAxis))`, 1000 CR floor, rounded to 50.
- Facade: `MapMissionFacade.offerEvaMissionAtPlanet` + `evaMissionAccept`. Persisted across reloads via the new `loadMissionBoard` / `saveMissionBoard` pair in `missionStorage`.
- Wiring: `MapViewController.offerEvaMissionAtPlanet` called on planet dock; UI section in `ShuttleControlProgramMissions.vue` shows offered + active + restocking states; `accept-eva-mission` event forwards through `ShuttleControlOverlay` → `MapView` → `viewController.evaMissionAccept()`.

Done means: player can dock at any planet, see an EVA mission offer with a reward scaled to that planet's distance, press Accept, and see it in the active list with the waypoint coordinates.

### Phase 2 — Port to `/map` MapView ✅ DONE

Playable on `/map`: accept an EVA mission at any planet, see a waypoint beam + POI spawn near the giver's leading orbital position, park the shuttle over the waypoint column, press E to EVA up/down and back.

Shipped:
- **`EvaSceneHost` interface** on `EvaSession` — `SceneManager` satisfies it naturally, and `MapViewController` injects a small adapter that swaps the composer's `RenderPass.camera` for the FPS camera on `setActiveCamera`.
- **POI container is a scene-level sibling of the beam root** (`MapMissionFacade.evaPoiContainer`). Beam root keeps its per-frame constant-apparent-size rescale so players can find the waypoint from across the map; the POI sits in real world units (shuttle-cargo proportion) so it becomes a distant speck, not a Earth-visible object.
- **`MapViewController.createEvaSession`**: `getVehicle` → shuttle; `getPoi` → `missionFacade.getEvaPoiWorldPos()`; huge-scale targets = shuttle (×100) + sun (×4); `spawnOffsetScale = 1`; `helmetLightIntensityScale = 0.08` to stop the flashlight blowing out the sunlit hull.
- **Auto-rescale freezes during EVA.** `tickShuttleScale` and the beam root's per-frame rescale in `tickWaypointVisuals` both early-return while `evaSession.isActive`, and `tickStartupIntroCamera` also skips so `introFacade` stops overwriting the render-pass camera.
- **Bloom override**: EVA mode snapshots + boosts threshold / lowers strength so the shuttle's scaled TRON panels don't saturate. Restored on exit.
- **Shuttle fuel drain paused** while EVA is active.
- **Distance checks are XZ-planar** in `EvaSession` so the `EVA [E]` prompt fires when parked over the waypoint column regardless of the POI's vertical offset.
- **HUD gates in `MapView.vue`**: `ShuttleHud`, `OrbitPrompt`, `GravityWarning`, nav bar, map toggles, credits/achievements badges all hide on `evaActive`. `HelmetVisor` + `FpsHud variant="eva"` render while active.
- **Dedicated EVA crosshair** in `FpsHud` (soft cyan reticle, no tool).
- **`FuelTank` indicator** is now a solid, depth-tested `MeshStandardMaterial`. Previously `depthTest: false` + `renderOrder: 1` leaked the fuel gauges through the shuttle chassis; the new version is properly occluded.

### Phase 2.5 — EVA mission POI system ✅ DONE

A distinct prop variant per mission, chosen from JSON. Same session/minigame pipeline for all variants.

- **`poiType` field** on `VisitRelayShuttleMissionTemplate`: `'satellite' | 'relay_antenna' | 'telescope'`. Future variants plug in as one more union member + one factory branch.
- **Waypoint generation at accept time**: `generateEvaWaypoint(planetX, planetZ)` picks a random `(angle, dist)` in `[60, 140]` around the giver planet, plus `poiLocalY` with `|y| ∈ [12, 25]` and random sign — enforces real verticality. The root itself stays on the Y=0 orbital plane so the beam marker aligns with the overhead map.
- **Planet lead prediction**: `PlanetSystemController.predictWorldPosXZ(simTime)` evaluates the Kepler orbit at a future time. `MapViewController.evaMissionAccept` calls it with `simTime + 3s` so the waypoint is placed where the giver planet *will* be, not where it is.
- **`EvaMissionPoi` factory** (`src/three/EvaMissionPoi.ts`): `createEvaMissionPoi(poiType, localY) → { object, tick, dispose }`.
  - `'satellite'` → `SatelliteModel` at `scale 0.02`, only `Object_7` gets the TRON panel material; `Object_8` keeps its GLB material.
  - `'relay_antenna'` → primitive `RelayAntennaController` at `scale 0.15`.
  - `'telescope'` → `HubbleModel` (new loader, no TRON — coloured in a follow-up) at `scale 0.03`.
- **Scale anchor**: `CARGO_LANDER_SCALE = 30` in `0.01` model space ≈ 0.3 world units. POI scales picked so each variant reads at roughly shuttle-cargo size, not billboard size.
- **Mission content**: one `poiType: 'telescope'` mission on Earth (`earth_hubble_optical_alignment`, 2200 CR). All 8 planets have at least one satellite + one relay_antenna mission.

### Phase 3.5 — Mission lifecycle completion ✅ DONE

**Design change from original spec:** EVA missions have no deliver step. Once the in-EVA terminal minigame completes, the reward (already distance-scaled at offer time) pays out immediately and the mission is removed from `activeEvaMissions`. Rationale: the player already did the interesting work out at the waypoint — forcing a return-to-giver trip just to click "Deliver" is busywork. Gather missions keep their deliver step because the cargo is the gameplay point.

Shipped:
- `completeEvaMission(board, missionId, profile)` in `shuttleMissionSession.ts` — pays reward, removes mission.
- `MapMissionFacade.completeEvaMission` + `MapViewController` wiring to fire on minigame success and trigger the delivered-sound.
- `VisitRelayMissionStatus = 'active' | 'ready-to-deliver'` union kept in `types.ts` for forward compatibility, but `'ready-to-deliver'` is currently unused. Safe to prune if nothing else adopts it.

### Phase 4 — Real `relay_repair` minigame 🟡 PENDING

- Register `"relay_repair"` in `orbitalMiniGameFactory.ts`. For a bootstrap pass, return `DefaultOrbitalMiniGame` so the EVA terminal interaction completes cleanly.
- A terminal prop (`EvaInteractable`) on the in-scene satellite with an interaction range sphere. The EVA player's raycast hits it → prompt appears → E opens the minigame overlay.
- Design and implement the actual `relay_repair` minigame (cable routing, frequency tuning, firmware flash — TBD) in a separate spec.

## Risks

- **Input collisions.** The EVA uses keys the shuttle also binds (WASD, E). Need clean state-machine hand-off so only one controller reads input at a time. The `InputManager` + `DEFAULT_BINDINGS` can remain shared if the controllers check their own active flag.
- **Camera discontinuity.** Cutting from vehicle camera to FPS camera without a transition will feel jarring. For the prototype, accept the cut; add a short dolly blend later if it bugs us.
- **Shuttle drift while EVA is active.** Freeze the shuttle's physics entirely (no gravity, no thrust) when EVA begins so the player doesn't emerge to find the shuttle 500 units away. Store and restore its full state on re-entry.
- **Oxygen timer scope creep.** Resist adding it in phase 1. A stubbed "unlimited O2" mode makes the flow testable without rescue state.

## Test Plan (Phase 1)

Manual in the browser on `/shuttle`:

- Fly toward the relay → prompt appears at the right distance.
- Press E → camera cuts, shuttle stops, EVA controls respond.
- Fly to the terminal → prompt appears, modal opens on E.
- Dismiss modal → prompt for return shows when near the shuttle.
- Press E near shuttle → camera cuts back, shuttle responsive again, no drift.
- Deliberately fly the EVA far from the shuttle → prompt disappears, no teleport bug, EVA continues to work.

No automated tests for scene transitions. Pure domain logic (distance thresholds, state transitions if they live in `src/lib/`) can be unit-tested.
