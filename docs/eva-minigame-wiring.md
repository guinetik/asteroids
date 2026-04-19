# EVA Maintenance Minigame Wiring

How the in-EVA terminal minigame plugs into the existing
[OrbitalMiniGame](../src/lib/minigame/OrbitalMiniGame.ts) factory and the visit-relay mission lifecycle on
the solar map. This is the end-to-end flow the player exercises today; per-type
minigame UIs (`relay_repair`, `satellite_servicing`, `telescope_alignment`)
plug in at step 5 below.

> **Spec:** [`docs/superpowers/specs/2026-04-18-visit-relay-mission-design.md`](./superpowers/specs/2026-04-18-visit-relay-mission-design.md) (Phases 3.5 + 4)

## TL;DR Flow

1. Dock at any planet → EVA mission offered in shuttle terminal.
2. Accept → POI prop spawns near the giver planet's predicted position; beam
   marker visible from across the map.
3. Fly to the waypoint, park the shuttle, press **F** → cargo bay opens, EVA
   begins.
4. Float to the POI → "START MAINTENANCE [F]" prompt within 3.5 world units
   of the POI center.
5. Press **F** → minigame overlay opens; pointer lock released; EVA RCS audio
   muted.
6. Click **Complete Maintenance** (or whatever the per-type UI exposes) →
   reward paid, toast notification shown, overlay closes, EVA resumes.
7. Fly back to the shuttle → "Return to Shuttle [F]" → re-enter, mission gone
   from active list.

There is no fly-back-to-the-giver delivery step. Visit-relay missions complete
in one shot at the EVA terminal — the journey is the deliver leg.

## Component Map

```text
EvaSession (src/three/EvaSession.ts)
  └─ mode: idle → opening → active → minigame → active → idle
  └─ onStartEvaMinigame() ─────────────┐
                                       ▼
MapViewController.beginEvaMinigame()
  ├─ MapMissionFacade.getActiveEvaMissionAtPoi() → mission
  ├─ createOrbitalMiniGame(missionId, type, …)   → minigame
  ├─ wires minigame.onComplete → evaMinigameComplete(missionId)
  └─ emits onEvaMinigameChange({ mission, minigame })
                                       ▼
MapView.vue
  └─ <EvaMinigameOverlay :mission :minigame
                         @complete @close />
                                       ▼
On complete:
  EvaMinigameOverlay → minigame.complete()
                         └─ fires minigame.onComplete(missionId)
                              └─ MapViewController.evaMinigameComplete()
                                   ├─ MapMissionFacade.completeEvaMission()
                                   │    └─ shuttleMissionSession.completeEvaMission()
                                   │         └─ addCredits + drop from board
                                   ├─ saveProfile + onCreditsUpdate
                                   ├─ shuttleAudio.notifyMissionDelivered()
                                   ├─ onEvaMissionComplete(mission)  ← toast
                                   └─ evaSession.endMinigame()       ← back to active
```

## State Machine — `EvaSession`

```text
idle ─(F near POI + canEva)→ opening ─(door open ≥ 0.98)→ active
active ─(F near POI 3D 3.5 u)→ minigame ─(endMinigame)→ active
active ─(F near shuttle 6 u XZ)→ idle (closes door, restores everything)
```

`isActive` returns true for both `active` and `minigame` so the helmet visor,
FPS HUD, and bloom overrides persist while the overlay is open.
`isMinigameOpen` is the dedicated probe for "overlay has input control".

## Minigame Dispatch

The factory at [`src/lib/minigame/orbitalMiniGameFactory.ts`](../src/lib/minigame/orbitalMiniGameFactory.ts)
switches on the `minigameType` string. Currently `relay_repair`,
`satellite_servicing`, and `telescope_alignment` are **not** registered, so
they fall through to `DefaultOrbitalMiniGame` (single-button stub). This is
intentional — the EVA loop should be playable end-to-end with the default
before per-type UIs land.

To add a new EVA-only minigame:

1. Implement an `OrbitalMiniGame` (see existing examples like
   `MaintenanceMiniGame`).
2. Register it in `orbitalMiniGameFactory.ts`.
3. Add a `v-if`-branch in [`EvaMinigameOverlay.vue`](../src/components/EvaMinigameOverlay.vue) that
   renders the minigame's canvas component (mirror the pattern in
   `MissionMiniGameOverlay.vue`).

## Reward + Persistence

`shuttleMissionSession.completeEvaMission(board, missionId, profile)` does
the full state mutation:

- `addCredits(profile, mission.template.reward)` — reward was already scaled
  by distance at offer time (see Phase 2.5 in the spec).
- Removes the mission from `activeEvaMissions`.
- Returns the new board + profile.

`MapMissionFacade.completeEvaMission` then persists the board via
`saveMissionBoard` (the same path used by gather/asteroid missions) so a
reload picks up the cleared state.

## Edge Cases Worth Knowing

- **POI proximity wins over shuttle return.** The `tick` loop checks the POI
  range first, so accidentally drifting back into the shuttle's return radius
  while standing on top of the POI doesn't steal the prompt.
- **Pointer lock.** `beginMinigame` releases pointer lock so the overlay can
  receive clicks; `endMinigame` re-attaches via the canvas-click listener.
- **`canEva` gate.** The shuttle must not be in `orbiting` or `approaching`
  state — the prompt becomes "EXIT ORBIT TO EVA" instead of "EVA [F]".
- **Disposal.** If the EVA session is force-disposed mid-minigame, the
  overlay state in Vue stays around until next `onEvaMinigameChange`. Worth
  hardening if it ever bites; currently the only path to dispose is route
  unmount, which clears the whole view anyway.

## Files Touched in This Pass

- `src/three/EvaSession.ts` — `minigame` sub-state, `EVA_TERMINAL_PROMPT_RANGE`,
  `onStartEvaMinigame` config hook, `endMinigame()` API.
- `src/lib/missions/shuttleMissionSession.ts` — `completeEvaMission()`.
- `src/lib/map/missions/MapMissionFacade.ts` — `getActiveEvaMissionAtPoi()`,
  `completeEvaMission()`.
- `src/views/MapViewController.ts` — `beginEvaMinigame()`,
  `evaMinigameComplete()`, `evaMinigameClose()`, `onEvaMinigameChange`,
  `onEvaMissionComplete` callbacks.
- `src/components/EvaMinigameOverlay.vue` — modal UI (default branch).
- `src/views/MapView.vue` — refs + handlers + overlay markup.

@author guinetik
@date 2026-04-19
