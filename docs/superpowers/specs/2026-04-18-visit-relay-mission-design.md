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

### Phase 1 — EVA sandbox in `/shuttle` (current focus)

No missions, no POI, no data model. Just the mechanic.

1. **Exit-to-EVA trigger.** When the shuttle is within interaction range of the prototype relay antenna already in the shuttle scene, show "[E] EVA". On press, freeze the shuttle and hand control to a free-float EVA controller.
2. **FreeFloatEvaController.** New controller with 6-DoF input, no gravity, no terrain. Camera cuts from the vehicle camera to the EVA first-person camera.
3. **Terminal prop.** Add an emissive box to `RelayAntennaController` (or `SatelliteModel`) with an interaction zone.
4. **Minigame overlay stub.** On terminal interaction, show a modal with a "Complete Repair" button (like `DefaultOrbitalMiniGame`). Dismiss on click.
5. **Return-to-shuttle trigger.** When the EVA player is within range of the frozen shuttle, "[E] Return to Shuttle" → cut back to vehicle camera and unfreeze the shuttle.

Deliverable: in `/shuttle`, player can fly to the prototype relay, EVA out, click the terminal, dismiss the modal, EVA back to the shuttle, continue flying. All visual; no mission bookkeeping.

### Phase 2 — Port to `/level` MapView

Wire the same transition and controller into `LevelViewController` via its state machine. The shuttle/EVA state transitions are new nodes in the existing machine.

### Phase 3 — Mission data model + dispatch

Add the `type` discriminator, migrate existing JSON, author 1–2 `visit_relay` entries, and implement POI rendering + waypoint trigger on the map.

### Phase 4 — Real `relay_repair` minigame

Separate spec once the flow is proven.

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
