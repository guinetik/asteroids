# Orbital MiniGame Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a standalone `OrbitalMiniGame` interface for shuttle missions with a default button-press implementation and a factory that dispatches on `minigameType`, wired through `MapMissionFacade`.

**Architecture:** New `OrbitalMiniGame` interface (separate from the level-scene `MiniGame`) with its own orbital context. `DefaultOrbitalMiniGame` wraps the existing button behavior. A factory maps `minigameType` strings from `planet-orbital-config.json` to implementations (all default for now). `MapMissionFacade` owns the minigame instance lifecycle. The overlay calls `minigame.complete()` instead of emitting events.

**Tech Stack:** TypeScript, Vitest, Vue 3

**Spec:** `docs/superpowers/specs/2026-04-10-orbital-minigame-design.md`

---

### Task 1: OrbitalMiniGame Interface & Types

**Files:**
- Create: `src/lib/minigame/OrbitalMiniGame.ts`

- [ ] **Step 1: Create the interface file**

```ts
/**
 * Orbital minigame interface for shuttle missions.
 *
 * Standalone interface — not related to the level-scene MiniGame.
 * Each planet's minigameType maps to a concrete implementation.
 * The default implementation wraps the current "press button to complete" behavior.
 *
 * @author guinetik
 * @date 2026-04-10
 * @spec docs/superpowers/specs/2026-04-10-orbital-minigame-design.md
 */

/** Orbital minigame lifecycle status. */
export type OrbitalMiniGameStatus = 'idle' | 'active' | 'completed' | 'failed'

/** A single step in an orbital minigame's progression. */
export interface OrbitalMiniGameStep {
  /** Step label shown in the tracker. */
  label: string
  /** Whether this step is complete. */
  complete: boolean
  /** Whether this is the currently active step. */
  active: boolean
}

/** Context passed to orbital minigames each frame. Carries map-scene state. */
export interface OrbitalMiniGameContext {
  /** Ship world position. */
  shipPosition: { x: number; y: number; z: number }
  /** Current orbit state ('free' | 'approaching' | 'orbiting'). */
  orbitState: string
  /** Planet id being orbited (null if not orbiting). */
  orbitedPlanetId: string | null
  /** Distance from ship to orbited body center (null if not orbiting). */
  distanceToPlanet: number | null
}

/** Events an orbital minigame can emit. */
export interface OrbitalMiniGameEvents {
  /** Minigame completed — pass mission id. */
  onComplete: ((missionId: string) => void) | null
  /** Steps changed — pass updated steps for reactivity. */
  onStepChange: ((steps: readonly OrbitalMiniGameStep[]) => void) | null
}

/**
 * Orbital minigame interface. All shuttle mission minigames implement this.
 *
 * @author guinetik
 * @date 2026-04-10
 */
export interface OrbitalMiniGame {
  /** Current minigame status. */
  readonly status: OrbitalMiniGameStatus
  /** The shuttle mission id this minigame tracks. */
  readonly missionId: string
  /** Ordered steps for the tracker HUD. */
  readonly steps: readonly OrbitalMiniGameStep[]
  /** Progress numerator (null if not applicable). */
  readonly progressCurrent: number | null
  /** Progress denominator (null if not applicable). */
  readonly progressTotal: number | null

  /** Per-frame update. No-op for UI-driven minigames. */
  tick(dt: number, ctx: OrbitalMiniGameContext): void
  /** Called by UI when the player completes the minigame via button/interaction. */
  complete(): void
  /** Clean up resources. */
  dispose(): void
}
```

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: PASS (new file, no consumers yet)

- [ ] **Step 3: Run lint**

Run: `bun lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/minigame/OrbitalMiniGame.ts
git commit -m "feat: add OrbitalMiniGame interface and types"
```

---

### Task 2: DefaultOrbitalMiniGame Implementation

**Files:**
- Create: `src/lib/minigame/DefaultOrbitalMiniGame.ts`
- Create: `src/lib/minigame/__tests__/DefaultOrbitalMiniGame.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi } from 'vitest'
import { DefaultOrbitalMiniGame } from '../DefaultOrbitalMiniGame'
import type { OrbitalMiniGameContext } from '../OrbitalMiniGame'

const STUB_CTX: OrbitalMiniGameContext = {
  shipPosition: { x: 0, y: 0, z: 0 },
  orbitState: 'orbiting',
  orbitedPlanetId: 'venus',
  distanceToPlanet: 100,
}

describe('DefaultOrbitalMiniGame', () => {
  it('starts with active status and one step', () => {
    const mg = new DefaultOrbitalMiniGame('test-mission')
    expect(mg.status).toBe('active')
    expect(mg.missionId).toBe('test-mission')
    expect(mg.steps).toHaveLength(1)
    expect(mg.steps[0]!.label).toBe('Complete Mission')
    expect(mg.steps[0]!.active).toBe(true)
    expect(mg.steps[0]!.complete).toBe(false)
  })

  it('has null progress values', () => {
    const mg = new DefaultOrbitalMiniGame('test-mission')
    expect(mg.progressCurrent).toBeNull()
    expect(mg.progressTotal).toBeNull()
  })

  it('complete() transitions status to completed', () => {
    const mg = new DefaultOrbitalMiniGame('test-mission')
    mg.complete()
    expect(mg.status).toBe('completed')
    expect(mg.steps[0]!.complete).toBe(true)
    expect(mg.steps[0]!.active).toBe(false)
  })

  it('complete() fires onComplete callback with mission id', () => {
    const mg = new DefaultOrbitalMiniGame('test-mission')
    const cb = vi.fn()
    mg.onComplete = cb
    mg.complete()
    expect(cb).toHaveBeenCalledWith('test-mission')
  })

  it('complete() fires onStepChange callback', () => {
    const mg = new DefaultOrbitalMiniGame('test-mission')
    const cb = vi.fn()
    mg.onStepChange = cb
    mg.complete()
    expect(cb).toHaveBeenCalledOnce()
    expect(cb.mock.calls[0]![0][0].complete).toBe(true)
  })

  it('complete() is idempotent — second call is no-op', () => {
    const mg = new DefaultOrbitalMiniGame('test-mission')
    const cb = vi.fn()
    mg.onComplete = cb
    mg.complete()
    mg.complete()
    expect(cb).toHaveBeenCalledOnce()
  })

  it('tick() is a no-op — status stays active', () => {
    const mg = new DefaultOrbitalMiniGame('test-mission')
    mg.tick(0.016, STUB_CTX)
    mg.tick(1.0, STUB_CTX)
    expect(mg.status).toBe('active')
  })

  it('dispose() does not throw', () => {
    const mg = new DefaultOrbitalMiniGame('test-mission')
    expect(() => mg.dispose()).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/minigame/__tests__/DefaultOrbitalMiniGame.spec.ts`
Expected: FAIL — `DefaultOrbitalMiniGame` does not exist

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Default orbital minigame — instant button completion.
 *
 * Wraps the existing "Complete Mission" button behavior in the
 * OrbitalMiniGame interface. tick() is a no-op; complete() is
 * called directly by the overlay UI.
 *
 * @author guinetik
 * @date 2026-04-10
 * @spec docs/superpowers/specs/2026-04-10-orbital-minigame-design.md
 */
import type {
  OrbitalMiniGame,
  OrbitalMiniGameContext,
  OrbitalMiniGameEvents,
  OrbitalMiniGameStatus,
  OrbitalMiniGameStep,
} from './OrbitalMiniGame'

/**
 * Default orbital minigame — instant completion via button press.
 *
 * @author guinetik
 * @date 2026-04-10
 */
export class DefaultOrbitalMiniGame implements OrbitalMiniGame, OrbitalMiniGameEvents {
  readonly missionId: string

  private _status: OrbitalMiniGameStatus = 'active'
  private readonly _steps: OrbitalMiniGameStep[] = [
    { label: 'Complete Mission', complete: false, active: true },
  ]

  onComplete: ((missionId: string) => void) | null = null
  onStepChange: ((steps: readonly OrbitalMiniGameStep[]) => void) | null = null

  constructor(missionId: string) {
    this.missionId = missionId
  }

  get status(): OrbitalMiniGameStatus {
    return this._status
  }

  get steps(): readonly OrbitalMiniGameStep[] {
    return this._steps
  }

  get progressCurrent(): number | null {
    return null
  }

  get progressTotal(): number | null {
    return null
  }

  tick(_dt: number, _ctx: OrbitalMiniGameContext): void {
    // No-op — UI-driven completion
  }

  complete(): void {
    if (this._status !== 'active') return
    this._steps[0]!.complete = true
    this._steps[0]!.active = false
    this._status = 'completed'
    this.onStepChange?.(this._steps)
    this.onComplete?.(this.missionId)
  }

  dispose(): void {
    // No resources to clean up
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/minigame/__tests__/DefaultOrbitalMiniGame.spec.ts`
Expected: PASS — all 7 tests green

- [ ] **Step 5: Run lint**

Run: `bun lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/minigame/DefaultOrbitalMiniGame.ts src/lib/minigame/__tests__/DefaultOrbitalMiniGame.spec.ts
git commit -m "feat: add DefaultOrbitalMiniGame with tests"
```

---

### Task 3: Orbital MiniGame Factory

**Files:**
- Create: `src/lib/minigame/orbitalMiniGameFactory.ts`
- Create: `src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { createOrbitalMiniGame } from '../orbitalMiniGameFactory'
import { DefaultOrbitalMiniGame } from '../DefaultOrbitalMiniGame'

const ALL_MINIGAME_TYPES = [
  'gas-collection',
  'probe-deploy',
  'logistics',
  'chemistry',
  'ice-harvest',
  'maintenance',
]

describe('createOrbitalMiniGame', () => {
  it.each(ALL_MINIGAME_TYPES)(
    'returns a valid OrbitalMiniGame for type "%s"',
    (minigameType) => {
      const mg = createOrbitalMiniGame('mission-1', minigameType)
      expect(mg.status).toBe('active')
      expect(mg.missionId).toBe('mission-1')
      expect(mg).toBeInstanceOf(DefaultOrbitalMiniGame)
    },
  )

  it('returns DefaultOrbitalMiniGame for unknown type', () => {
    const mg = createOrbitalMiniGame('mission-2', 'unknown-future-type')
    expect(mg).toBeInstanceOf(DefaultOrbitalMiniGame)
    expect(mg.missionId).toBe('mission-2')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts`
Expected: FAIL — `createOrbitalMiniGame` does not exist

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Orbital minigame factory.
 *
 * Dispatches on the minigameType string from planet-orbital-config.json
 * to create the appropriate OrbitalMiniGame implementation. All types
 * currently fall through to DefaultOrbitalMiniGame.
 *
 * @author guinetik
 * @date 2026-04-10
 * @spec docs/superpowers/specs/2026-04-10-orbital-minigame-design.md
 */
import type { OrbitalMiniGame } from './OrbitalMiniGame'
import { DefaultOrbitalMiniGame } from './DefaultOrbitalMiniGame'

/**
 * Create an orbital minigame for the given mission and minigame type.
 *
 * @param missionId - The shuttle mission id.
 * @param minigameType - The minigame type from planet-orbital-config.json.
 * @returns A new OrbitalMiniGame instance.
 *
 * @author guinetik
 * @date 2026-04-10
 */
export function createOrbitalMiniGame(missionId: string, minigameType: string): OrbitalMiniGame {
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts`
Expected: PASS — all 7 tests green

- [ ] **Step 5: Run lint**

Run: `bun lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/minigame/orbitalMiniGameFactory.ts src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts
git commit -m "feat: add orbital minigame factory with dispatch scaffold"
```

---

### Task 4: Wire OrbitalMiniGame into MapMissionFacade

**Files:**
- Modify: `src/lib/map/missions/MapMissionFacade.ts`

The facade owns the minigame instance lifecycle. It creates the minigame when the overlay opens, disposes it when closed, and calls `missionComplete` when the minigame fires `onComplete`.

- [ ] **Step 1: Add imports and the `activeMinigame` field**

At the top of `MapMissionFacade.ts`, add the import:

```ts
import { createOrbitalMiniGame } from '@/lib/minigame/orbitalMiniGameFactory'
import type { OrbitalMiniGame } from '@/lib/minigame/OrbitalMiniGame'
import { getPlanetOrbitalConfig } from '@/lib/missions/planetOrbitalConfig'
```

Note: `getPlanetOrbitalConfig` is already imported via `getGatherItemForPlanet` from the same module. Check if `getPlanetOrbitalConfig` is already imported — if not, add it. `getGatherItemForPlanet` is already imported; add `getPlanetOrbitalConfig` to the existing import line.

Add the field to `MapMissionFacade`:

```ts
activeMinigame: OrbitalMiniGame | null = null
```

Place it after the existing `buttonVisible = false` field on line 50.

- [ ] **Step 2: Create the minigame in `openMissionOverlay()`**

In the `openMissionOverlay` method, after `this.overlayOpen = true` (line 208), create the minigame:

```ts
    // Create orbital minigame for this mission
    const orbitalConfig = getPlanetOrbitalConfig(mission.template.targetPlanet)
    const minigameType = orbitalConfig?.minigameType ?? 'default'
    this.activeMinigame = createOrbitalMiniGame(mission.template.id, minigameType)
```

Do NOT wire `onComplete` here — the facade's `missionComplete()` method is already called by the controller. The minigame's `complete()` is called by the overlay UI, and the controller handles the rest.

- [ ] **Step 3: Dispose the minigame on overlay close**

In `toggleOrbitMissionOverlay()`, inside the close branch (after `this.overlayOpen = false`), add:

```ts
      this.activeMinigame?.dispose()
      this.activeMinigame = null
```

- [ ] **Step 4: Dispose in `missionComplete()`**

In the `missionComplete()` method, after `this.overlayOpen = false` (line 157), add:

```ts
    this.activeMinigame?.dispose()
    this.activeMinigame = null
```

- [ ] **Step 5: Dispose in `reset()`**

In the `reset()` method, inside the `if (this.overlayOpen)` block, add:

```ts
      this.activeMinigame?.dispose()
      this.activeMinigame = null
```

- [ ] **Step 6: Dispose in `dispose()`**

In the `dispose()` method, add at the top:

```ts
    this.activeMinigame?.dispose()
    this.activeMinigame = null
```

- [ ] **Step 7: Run type-check and lint**

Run: `bun run type-check && bun lint`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/lib/map/missions/MapMissionFacade.ts
git commit -m "feat: wire OrbitalMiniGame lifecycle into MapMissionFacade"
```

---

### Task 5: Update Overlay to Call minigame.complete()

**Files:**
- Modify: `src/components/MissionMiniGameOverlay.vue`
- Modify: `src/views/MapView.vue`

The overlay receives the minigame instance and calls `complete()` on it. The existing `handleMissionComplete` in `MapView.vue` continues to handle the `complete` emit for now — the minigame's `complete()` is called first, then the existing flow runs. This keeps the wiring change minimal.

- [ ] **Step 1: Add minigame prop to MissionMiniGameOverlay.vue**

In `MissionMiniGameOverlay.vue`, update the props to accept the minigame:

```ts
import type { OrbitalMiniGame } from '@/lib/minigame/OrbitalMiniGame'

const props = defineProps<{
  mission: ActiveShuttleMission
  canFitCargo: boolean
  minigame: OrbitalMiniGame | null
}>()
```

- [ ] **Step 2: Update the complete button handler**

Replace the button's `@click="emit('complete')"` with a function that calls `minigame.complete()` first, then emits:

```ts
function handleComplete() {
  props.minigame?.complete()
  emit('complete')
}
```

Update the button in the template:

```html
        <button
          type="button"
          class="mission-minigame-card__complete-btn"
          :disabled="!canFitCargo"
          @click="handleComplete"
        >
          Complete Mission
        </button>
```

- [ ] **Step 3: Pass the minigame from MapView.vue**

In `MapView.vue`, add a computed ref for the active minigame. After the `missionOverlayCanFit` ref (around line 190):

```ts
const activeOrbitalMinigame = computed(
  () => viewController.missionFacade.activeMinigame,
)
```

Then pass it to the overlay component:

```html
  <MissionMiniGameOverlay
    v-if="missionOverlayVisible && missionOverlayMission"
    :mission="missionOverlayMission"
    :can-fit-cargo="missionOverlayCanFit"
    :minigame="activeOrbitalMinigame"
    @complete="handleMissionComplete"
    @close="closeMissionOverlay"
  />
```

- [ ] **Step 4: Run type-check and lint**

Run: `bun run type-check && bun lint`
Expected: PASS

- [ ] **Step 5: Manual test in browser**

Run: `bun dev`

Test the golden path:
1. Dock at a planet, accept a shuttle mission from the mission board
2. Travel to the target planet, orbit it
3. Press I to open the mission overlay
4. Verify the overlay shows mission details and "Complete Mission" button
5. Click "Complete Mission" — mission should complete, inventory should update, overlay should close
6. Return to giver planet, deliver for credits

Verify no regressions:
- Opening/closing the overlay without completing still works
- Leaving orbit closes the overlay
- Cargo-full warning still disables the button

- [ ] **Step 6: Commit**

```bash
git add src/components/MissionMiniGameOverlay.vue src/views/MapView.vue
git commit -m "feat: overlay calls OrbitalMiniGame.complete() on button press"
```

---

### Task 6: Update minigameType TSDoc

**Files:**
- Modify: `src/lib/missions/types.ts:155`

- [ ] **Step 1: Update the comment on minigameType**

In `src/lib/missions/types.ts`, change:

```ts
  /** Minigame type (ignored until minigames are implemented). */
  minigameType: string
```

to:

```ts
  /** Minigame type — dispatched by orbitalMiniGameFactory to create the appropriate OrbitalMiniGame. */
  minigameType: string
```

- [ ] **Step 2: Run lint**

Run: `bun lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/missions/types.ts
git commit -m "docs: update minigameType TSDoc now that factory exists"
```
