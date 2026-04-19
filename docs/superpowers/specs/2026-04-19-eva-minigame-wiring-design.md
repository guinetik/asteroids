# EVA Minigame Wiring — Substrate Design Spec

**Date:** 2026-04-19
**Author:** guinetik
**Status:** Draft
**Related:**
- `2026-04-18-visit-relay-mission-design.md` (visit-relay mission type)
- `2026-04-10-orbital-minigame-design.md` (`OrbitalMiniGame` interface)
- `docs/eva-minigame-wiring.md` (current end-to-end flow)
- `docs/inspo/EvaMinigames.design.md` (game-design doc covering all 3 minigames)
- `docs/inspo/SatelliteServicing.plan.md` (in-scene minigame plan)
- `docs/inspo/RelayRepairMinigame.jsx`, `docs/inspo/TelescopeMinigame.jsx` (React prototypes)

## Problem

EVA visit-relay missions are wired end-to-end today, but every mission falls through to `DefaultOrbitalMiniGame` — a single "Complete Maintenance" button in `EvaMinigameOverlay.vue`. Three real minigame types (`relay_repair`, `telescope_alignment`, `satellite_servicing`) are authored in the JSON data but none have implementations.

Two of the three (`relay_repair`, `telescope_alignment`) follow the established overlay pattern: a Vue SFC canvas mounts on top of the 3D scene, takes input, fires `onComplete` on lock-in. The third, `satellite_servicing`, **does not use an overlay** — it drives the live 3D scene (wireframe damage, camera lock, screen-space drag tracing over a fixed hero framing). The current `MapViewController.beginEvaMinigame` unconditionally emits `onEvaMinigameChange` to open the overlay; that breaks satellite servicing.

This spec is the **substrate** — the shared wiring changes that land once and unblock all three per-type minigame specs. Individual minigame specs (starting with telescope) reference this as a prerequisite.

## Goals

- Let each `OrbitalMiniGame` declare whether it presents as a Vue overlay or as an in-scene 3D experience, without changing the common lifecycle (`status`, `complete()`, `onComplete`).
- Document the overlay-branch registration pattern so adding `telescope_alignment` / `relay_repair` Vue canvases is mechanical.
- Define the in-scene controller contract for `satellite_servicing` — how it attaches to the EVA scene, locks camera + input, and reports completion.
- Scope the satellite minigame's **starter roster** to the original `SatelliteModel` only. `HubbleModel` (telescope) and any future probe model sit out until the loop is proven.

## Non-Goals (this pass)

- Per-minigame mechanics, asset lists, tuning constants — those live in each minigame's own spec.
- Changes to `EvaSession` sub-states or the `beginEvaMinigame` entry path; the sub-state machine is fine.
- Audio hooks. Each minigame spec adds its own.
- Controller/gamepad support. Mouse + keyboard only for this pass.
- Persistent per-component damage state across save/load (satellite damage is rolled at mission-accept time; on the first pass it can live only on the active mission object, not in `missionStorage`).

## Presentation Mode

### Interface change

Add one readonly field to `OrbitalMiniGame` (`src/lib/minigame/OrbitalMiniGame.ts`):

```ts
/** How this minigame presents to the player. Determines whether the host opens a Vue overlay or hands control to an in-scene controller. */
export type OrbitalMiniGamePresentation = 'overlay' | 'in_scene'

export interface OrbitalMiniGame {
  // …existing fields…
  readonly presentation: OrbitalMiniGamePresentation
}
```

Backward compatibility: every existing minigame (`DefaultOrbitalMiniGame`, `GasCollectionMiniGame`, `IceHarvestMiniGame`, `MaintenanceMiniGame`, `LogisticsRouteMiniGame`, `ProbeDeployMiniGame`) gets `readonly presentation = 'overlay'` as a trivial addition. No behavior change for gather missions or orbital minigames; the field is only *read* on the EVA path.

### Dispatch change

`MapViewController.beginEvaMinigame` inspects `minigame.presentation` after the factory call:

```text
beginEvaMinigame()
  ├─ factory creates minigame
  ├─ wires onComplete → evaMinigameComplete
  ├─ if presentation === 'overlay':
  │    emit onEvaMinigameChange({ mission, minigame })   // opens EvaMinigameOverlay (today's path)
  └─ if presentation === 'in_scene':
       hand to SatelliteRepairController.attach(minigame, mission, scene)
       — no overlay emitted; controller drives the scene and calls minigame.complete() when done
```

Completion / cleanup is identical for both paths — `evaMinigameComplete(missionId)` still runs reward payout + persistence + `evaSession.endMinigame()`. Only the *between* differs.

## Overlay Branching Pattern

`EvaMinigameOverlay.vue` becomes a thin dispatcher mirroring `MissionMiniGameOverlay.vue`:

```vue
<script setup lang="ts">
import { TelescopeAlignmentMiniGame } from '@/lib/minigame/telescopeAlignment/TelescopeAlignmentMiniGame'
import { RelayRepairMiniGame } from '@/lib/minigame/relayRepair/RelayRepairMiniGame'
import TelescopeAlignmentCanvas from '@/components/TelescopeAlignmentCanvas.vue'
import RelayRepairCanvas from '@/components/RelayRepairCanvas.vue'
// …

const isTelescope = computed(() => props.minigame instanceof TelescopeAlignmentMiniGame)
const isRelay     = computed(() => props.minigame instanceof RelayRepairMiniGame)
</script>

<template>
  <div class="mission-minigame-overlay">
    <TelescopeAlignmentCanvas
      v-if="isTelescope"
      :minigame="minigame"
      :mission="mission"
      @complete="handleComplete"
      @close="emit('close')"
    />
    <RelayRepairCanvas
      v-else-if="isRelay"
      :minigame="minigame"
      :mission="mission"
      @complete="handleComplete"
      @close="emit('close')"
    />
    <!-- default card retained as the fallback while per-type canvases roll out -->
    <div v-else class="mission-minigame-card">
      … existing default card markup …
    </div>
  </div>
</template>
```

**Rules for every per-type canvas component**:

- Receives `mission: ActiveVisitRelayMission` + `minigame: OrbitalMiniGame` as props.
- Calls `props.minigame.complete()` then emits `complete` on lock-in.
- Emits `close` on user-initiated abort (dedicated Close button or explicit cancel). Do not emit `close` on the minigame's own success — the overlay's ESC handler already routes ESC to `close` in capture phase.
- Does **not** touch pointer lock, audio, or EVA state directly. All of that is already handled by `EvaSession.beginMinigame` / `endMinigame`.
- Styled against the shared palette in `EvaMinigames.design.md` §2.4. No inline CSS in `.vue` files — Tailwind `@apply` utilities per CLAUDE.md rule #4.

## In-Scene Controller Contract (Satellite Servicing)

### `SatelliteRepairController` — new module

Lives at `src/three/SatelliteRepairController.ts`. Instantiated on demand by `MapViewController.beginEvaMinigame` when `presentation === 'in_scene'`. One-shot: disposed on completion or abort.

```ts
export interface SatelliteRepairControllerConfig {
  /** The scene root to attach damage overlays to. */
  scene: THREE.Scene
  /** The POI object3D — root of the satellite model whose components get damaged. */
  poiObject: THREE.Object3D
  /** EVA camera — the controller takes temporary control during each repair. */
  camera: THREE.PerspectiveCamera
  /** EVA controller — input is yielded while a repair sub-mode is active. */
  evaController: EvaTetherController
  /** The minigame instance to drive. Controller calls `minigame.complete()` when all components repaired. */
  minigame: SatelliteServicingMiniGame
  /** The active mission — used to read `brokenComponents` + `satelliteId`. */
  mission: ActiveVisitRelayMission
}

export class SatelliteRepairController {
  attach(cfg: SatelliteRepairControllerConfig): void
  tick(dt: number): void       // called from the EVA tick loop
  dispose(): void              // removes overlays, releases camera/input
}
```

### Attachment responsibilities

On `attach`:
1. Read `mission.brokenComponents: string[]` (names of rigged sub-objects). Walk the POI `Object3D` tree, find each by name, apply a red wireframe overlay (mesh clone with `wireframe: true`, emissive red, `depthWrite: false`).
2. Register a per-frame proximity check: within N world units of a still-broken component → emit "FIX [F]" billboard above that component (nearest-only).
3. On F-press inside range → enter repair sub-mode (camera ease 400ms, EVA input lock, mount a 2D canvas overlay Vue component with screen-space anchor-point drag).
4. On successful drag trace → remove the wireframe, increment `minigame._repaired`, release camera + EVA input.
5. When all components repaired → call `minigame.complete()` (which triggers the existing payout + persistence + `endMinigame` chain via `onComplete`).

### EVA session hooks

No new `EvaSession` API is needed for the common path. But the controller needs:
- **Temporary camera control** — `EvaSession` already exposes a camera via `EvaSceneHost`. The controller tweens it to hero framing, snapshots its pre-repair transform, restores on release. No `EvaSession` change.
- **EVA input yield** — the controller sets a local flag; while true, the `EvaTetherController.tick` should early-return on input reads. Cleanest move: pass a `setInputLocked(boolean)` hook through `EvaSessionConfig` analogous to how audio mute works today. Telescope + relay don't need this because the overlay already intercepts all input via its own modal root.

### Satellite roster scope

For this pass the controller supports **only** the prototype `SatelliteModel` (the one behind `/shuttle` and the EVA satellite POI). `HubbleModel` and any future probe model are explicitly out. Behavior when a `satellite_servicing` mission spawns on a `poiType` other than `'satellite'`: log a warning, fall back to `DefaultOrbitalMiniGame` for that mission.

### Per-satellite component manifest

A new data file at `src/data/satellite-manifests.json`:

```json
{
  "satellite": {
    "components": ["reaction_wheel", "solar_panel_a", "solar_panel_b", "high_gain_antenna", "thruster_cluster"]
  }
}
```

Loaded statically by Vite. Keys match `poiType`. Only `"satellite"` is populated in this pass. The first task during satellite-servicing spec implementation is to verify `SatelliteModel`'s GLB actually exposes ≥ 4 named sub-objects — if not, the rigging pass comes before code.

## Mission-Accept-Time Damage Roll

`satellite_servicing` missions need per-mission damage state (which components are broken). This is rolled at `acceptEvaMission` time and stored on the active mission:

```ts
interface ActiveVisitRelayMission {
  // …existing fields…
  /** For satellite_servicing missions only: names of broken components. Seeded by mission id for determinism on retry. */
  brokenComponents?: string[]
}
```

Seeding: `rngFromSeed(missionId)`; pick N without replacement from the manifest's `components` list; N = 1/2/3 by distance tier (see `SatelliteServicing.plan.md` §3). No additional persistence — a reload re-derives from `missionId` + manifest, so the damage is identical.

For `telescope_alignment` and `relay_repair` the field stays `undefined`. No damage-roll runs.

## Factory Registration

The factory in `src/lib/minigame/orbitalMiniGameFactory.ts` gains three cases. `planetId` already flows through — add a fourth param for the active mission when a minigame needs mission-level data (satellite servicing needs `brokenComponents`):

```ts
export function createOrbitalMiniGame(
  missionId: string,
  minigameType: string,
  targetGas: number,
  planetId?: string,
  mission?: ActiveVisitRelayMission,   // NEW — only read by EVA types
): OrbitalMiniGame {
  switch (minigameType) {
    // …existing cases…
    case 'telescope_alignment':
      return new TelescopeAlignmentMiniGame(missionId)
    case 'relay_repair':
      return new RelayRepairMiniGame(missionId)
    case 'satellite_servicing':
      return new SatelliteServicingMiniGame(missionId, mission?.brokenComponents ?? [])
    default:
      return new DefaultOrbitalMiniGame(missionId)
  }
}
```

`MapViewController.beginEvaMinigame` passes the `mission` through. `ShuttleControlProgramMissions.vue` (the gather-mission path) passes `undefined` — gather minigames ignore it.

## Implementation Order

Each phase is independently shippable; each unblocks a per-minigame spec.

### Phase W1 — Interface + dispatch (prereq for all 3)

- Add `presentation` field to `OrbitalMiniGame` interface + every existing implementation (trivial — all return `'overlay'`).
- Modify `MapViewController.beginEvaMinigame` to branch on `presentation`. For this phase, `'in_scene'` logs "not implemented" and falls through to overlay — no satellite controller yet. This lets phase W2 + the telescope spec land before satellite lands.
- Extend `createOrbitalMiniGame` signature with the optional `mission` param; thread through `MapViewController`.

**Done means:** No behavior change visible to the player; `type-check`, `lint`, `test:unit` all green.

### Phase W2 — Overlay dispatcher (prereq for telescope + relay)

- Refactor `EvaMinigameOverlay.vue` into a dispatcher with `instanceof` branches. Leave the default card as the final fallback.
- Register placeholder imports + `computed` flags for `TelescopeAlignmentMiniGame` and `RelayRepairMiniGame` — gated behind `v-if="false"` until the classes exist (or do this in the telescope spec rather than here).

**Done means:** Structure in place; no new minigame visible yet.

### Phase W3 — Satellite in-scene controller (prereq for satellite_servicing spec)

- Verify `SatelliteModel` GLB sub-object names; author `satellite-manifests.json`.
- Add `brokenComponents` to `ActiveVisitRelayMission`; roll at `acceptEvaMission`.
- Implement `SatelliteRepairController` skeleton (wireframe overlay, proximity + FIX prompt, single-component single-click stub that immediately marks repaired). No drag mechanic yet — that's the satellite spec's job.
- Implement `SatelliteServicingMiniGame` with `presentation: 'in_scene'` and `_repaired` set.
- Wire the `'in_scene'` branch in `beginEvaMinigame` to attach the controller.

**Done means:** A satellite EVA mission is playable end-to-end with a stub "click to repair each glowing part" interaction. Reward pays out. This is the foundation the real drag mechanic builds on in the satellite spec.

## Risks

- **`presentation` field leaking into gather-mission code paths.** Mitigation: `MapViewController.beginEvaMinigame` is the *only* reader. `ShuttleControlProgramMissions.vue` never reads it. Keep it that way — don't add conditional branches elsewhere.
- **Satellite component names drift between Blender and runtime.** If someone re-exports the GLB with different names, the manifest silently breaks. Mitigation: on controller attach, validate every manifest entry exists in the POI tree; if any are missing, log a clear error listing what was expected vs. what was found and fall back to `DefaultOrbitalMiniGame`.
- **Per-mission damage state invalidated by manifest edits.** If `satellite-manifests.json` changes component names, existing saves with seeded `brokenComponents` point at names that no longer exist. Mitigation: if any stored `brokenComponents` entry is missing from the current manifest, re-roll from the seed on load. Log once.
- **Pointer-lock + overlay modal interaction.** Overlay minigames want lock released so the mouse can click the canvas. Satellite wants lock released too (mouse drag). The existing `beginMinigame` already releases lock. No change needed — just don't re-acquire lock inside a minigame.

## Test Plan

Pure domain unit tests (`src/lib/`):

- `createOrbitalMiniGame` dispatches the three new types to the correct classes when registered; still falls back to `Default` when not.
- `OrbitalMiniGame.presentation` is `'overlay'` for every existing implementation.
- Seeded damage roll: same `missionId` + manifest → same `brokenComponents`; different `missionId` → different (probabilistically). Difficulty tier picks the right count.
- Manifest validation: missing component names are detected and reported.

Manual in the browser (`/map`):

- Accept each of the three EVA mission types across different planets. Confirm the correct overlay/controller mounts (telescope canvas, relay canvas, satellite in-scene — stubs allowed for W1/W2).
- Confirm reward payout + mission removal works identically for all three presentation modes.
- Pointer lock: pressing F at the POI releases lock; completing the minigame re-acquires lock on EVA resume; ESC at any point aborts cleanly without stuck lock state.
- Reload mid-mission: each EVA mission type rehydrates with no error, `brokenComponents` stable for satellite missions.

## Open Questions

1. **Should `presentation` live on the interface or on the factory return metadata?** Current proposal: on the interface (simplest, co-located with behavior). Alternative: have the factory return `{ minigame, presentation }`. The interface approach keeps the contract self-describing and lets third parties identify in-scene minigames without the factory.
2. **Where does the satellite 2D drag overlay mount?** A child of `EvaMinigameOverlay` (reuse the Vue modal root) or a sibling layer owned by `SatelliteRepairController` directly? Leaning sibling-layer so the controller owns its full lifecycle. Revisit when writing the satellite spec.
3. **Progress reporting for in-scene minigames.** The HUD today doesn't show progress for EVA minigames. When the satellite minigame has `progressCurrent: 1, progressTotal: 3`, do we surface that somewhere (small corner indicator) or lean on the in-world wireframes disappearing as the progress cue? Leaning the latter — fewer UI moving parts.

@author guinetik
@date 2026-04-19
