# Orbital MiniGame Interface Design

**Date:** 2026-04-10
**Author:** guinetik
**Status:** Draft

## Problem

Shuttle missions have a `minigameType` field per planet (e.g. `"gas-collection"`, `"probe-deploy"`) but the orbital mission completion is hardcoded as a single "Complete Mission" button in `MissionMiniGameOverlay.vue`. There is no way to swap in different minigame implementations per mission type.

The existing `MiniGame` interface (`src/lib/minigame/MiniGame.ts`) is designed for the level scene — it assumes EVA state, lander position, heightmaps, and 3D scene objects on terrain. Orbital missions live in the map scene with completely different context (orbit state, planet distance, ship heading). Forcing orbital minigames through the level `MiniGame` interface would be awkward.

## Solution

Create a standalone `OrbitalMiniGame` interface — same shape as `MiniGame` (status, steps, tick, dispose) but with its own `OrbitalMiniGameContext`. A factory dispatches on `minigameType`. For this pass, every type returns the `DefaultOrbitalMiniGame` which wraps the current button behavior.

## Design

### OrbitalMiniGameContext

Context passed to orbital minigames each frame. Carries map-scene state instead of level-scene state.

```ts
interface OrbitalMiniGameContext {
  /** Ship world position. */
  shipPosition: { x: number; y: number; z: number }
  /** Current orbit state ('free' | 'approaching' | 'orbiting'). */
  orbitState: string
  /** Planet id being orbited (null if not orbiting). */
  orbitedPlanetId: string | null
  /** Distance from ship to orbited body center (null if not orbiting). */
  distanceToPlanet: number | null
}
```

### OrbitalMiniGame Interface

```ts
type OrbitalMiniGameStatus = 'idle' | 'active' | 'completed' | 'failed'

interface OrbitalMiniGameStep {
  label: string
  complete: boolean
  active: boolean
}

interface OrbitalMiniGameEvents {
  onComplete: ((missionId: string) => void) | null
  onStepChange: ((steps: readonly OrbitalMiniGameStep[]) => void) | null
}

interface OrbitalMiniGame {
  readonly status: OrbitalMiniGameStatus
  readonly missionId: string
  readonly steps: readonly OrbitalMiniGameStep[]
  readonly progressCurrent: number | null
  readonly progressTotal: number | null

  /** Per-frame update. No-op for UI-driven minigames. */
  tick(dt: number, ctx: OrbitalMiniGameContext): void
  /** Called by UI when the player completes the minigame via button/interaction. */
  complete(): void
  /** Clean up resources. */
  dispose(): void
}
```

Key differences from level `MiniGame`:
- `complete()` method — allows UI-driven completion (the button). Tick-driven minigames can ignore this and complete themselves via `tick()`.
- `missionId` instead of `objectiveIndex` — orbital minigames track a shuttle mission, not an objective within a multi-objective asteroid mission.
- No `isPlayerNearInteraction` or `timeRemaining` — not relevant for the default. Future orbital minigames can add these as needed on their concrete classes.
- Context carries orbital state, not EVA/lander state.

### DefaultOrbitalMiniGame

The current button behavior wrapped in the interface.

```ts
class DefaultOrbitalMiniGame implements OrbitalMiniGame, OrbitalMiniGameEvents {
  readonly missionId: string
  private _status: OrbitalMiniGameStatus = 'active'
  private readonly _steps: OrbitalMiniGameStep[] = [
    { label: 'Complete Mission', complete: false, active: true },
  ]

  onComplete: ((missionId: string) => void) | null = null
  onStepChange: ((steps: readonly OrbitalMiniGameStep[]) => void) | null = null

  get status() { return this._status }
  get steps() { return this._steps }
  get progressCurrent() { return null }
  get progressTotal() { return null }

  tick(_dt: number, _ctx: OrbitalMiniGameContext): void {
    // No-op — UI-driven
  }

  complete(): void {
    if (this._status !== 'active') return
    this._steps[0].complete = true
    this._steps[0].active = false
    this._status = 'completed'
    this.onStepChange?.(this._steps)
    this.onComplete?.(this.missionId)
  }

  dispose(): void {
    // No resources to clean up
  }
}
```

### Factory

`src/lib/minigame/orbitalMiniGameFactory.ts` — dispatches on `minigameType` string from `planet-orbital-config.json`.

```ts
function createOrbitalMiniGame(missionId: string, minigameType: string): OrbitalMiniGame {
  switch (minigameType) {
    case 'gas-collection':
    case 'probe-deploy':
    case 'logistics':
    case 'chemistry':
    case 'ice-harvest':
    case 'maintenance':
    default:
      return new DefaultOrbitalMiniGame(missionId)
  }
}
```

When the next minigame type is built (e.g. `GasCollectionMiniGame`), replace one case line.

### Ownership — MapMissionFacade

`MapMissionFacade` gains:

- `activeMinigame: OrbitalMiniGame | null` — the current orbital minigame instance.
- On `openMissionOverlay()`: creates the minigame via the factory, wires `onComplete` to call the existing `completeMission()` flow.
- On overlay close or `reset()`: calls `minigame.dispose()`, nulls the reference.
- `tick()` already runs each frame — add `this.activeMinigame?.tick(ctx)` for future tick-driven minigames.

`MapViewController` does not grow. It passes orbital context into the facade's tick and relays the minigame reference to the overlay component.

### Overlay Changes — MissionMiniGameOverlay.vue

The overlay receives the `OrbitalMiniGame` instance (or a reactive wrapper) as a prop. The "Complete Mission" button calls `minigame.complete()` instead of emitting `complete`. Steps are read from `minigame.steps` for future HUD integration.

For this pass the visual result is identical — same button, same card, same behavior. The difference is structural: the minigame owns the completion logic, not the overlay.

## File Plan

| File | Action |
|------|--------|
| `src/lib/minigame/OrbitalMiniGame.ts` | New — interface + context + step types |
| `src/lib/minigame/DefaultOrbitalMiniGame.ts` | New — default button implementation |
| `src/lib/minigame/orbitalMiniGameFactory.ts` | New — factory with switch dispatch |
| `src/lib/map/missions/MapMissionFacade.ts` | Edit — own minigame instance, wire lifecycle |
| `src/components/MissionMiniGameOverlay.vue` | Edit — receive minigame, call complete() |
| `src/views/MapViewController.ts` | Edit — pass orbital context to facade tick |

## Testing

Unit tests for `DefaultOrbitalMiniGame`:
- `complete()` transitions status from active → completed
- `complete()` fires `onComplete` callback with mission id
- `complete()` is idempotent (second call is no-op)
- `tick()` is a no-op (status stays active)
- Steps update on completion

Unit tests for `createOrbitalMiniGame`:
- All known minigame types return a valid `OrbitalMiniGame`
- Unknown type falls through to default

## Out of Scope

- Actual gameplay minigames (gas-collection, probe-deploy, etc.) — future work, one at a time.
- Timer or progress bar for the default minigame — it's instant.
- Changes to asteroid mission minigames (`MiniGame` interface stays untouched).
