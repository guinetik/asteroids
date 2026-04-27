# Rocket Survey — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the multitool's SCI mode reveal the closest matching unmined rock when the player shoots the gather mission's delivery rocket — a hidden, discover-it-yourself utility for "I cannot find olivine" moments.

**Architecture:** Pure-TS state machine + new facade (`RocketSurveyFacade`) own the entire mechanic. `LevelViewController` only instantiates the facade. New `'science_rocket'` impact kind on `ProjectileSystem` routes science bolts to a registered rocket AABB. Reuses existing `WaypointMarkers`, `PickupToast`, `LevelAudioDirector` patterns shipped with the rock-prospecting feature.

**Tech Stack:** Vue 3 + TypeScript, Three.js, Vitest. Spec: `docs/superpowers/specs/2026-04-26-rocket-survey-design.md`.

**Important alignment with the actual codebase (refines the spec):**

- The `GatherMinigame` quotas track only `minedKg` and `targetKg` — there is no per-mineral `deliveredKg`. The deposit interaction is atomic (all minerals delivered at once when the player presses E with every quota met). Therefore the state machine's "awaiting" phase is `awaitingMarkerConsume` (locked until the placed marker's rock is consumed via mining), not `awaitingDelivery`. A scannable mineral is any quota where `minedKg < targetKg`.
- `RockYieldSystem` already exposes `peekRock(spawnIndex)` and `rolledItemIds` but has no iterator. We add a small `findActiveRocksByItemId(itemId)` helper.

---

## File Structure

**New files:**
- `src/lib/level/rocketSurveyConstants.ts` — tunables.
- `src/lib/level/rocketSurveyState.ts` — pure-TS state machine.
- `src/lib/level/__tests__/rocketSurveyState.spec.ts` — full unit coverage.
- `src/lib/level/RocketSurveyFacade.ts` — facade orchestrating bolt routing → state → waypoint/toast/audio.

**Modified:**
- `src/lib/fps/projectileSystem.ts` — rocket AABB registration, `onScienceRocketHit` callback, `'science_rocket'` impact kind.
- `src/lib/mining/rockYieldSystem.ts` — `findActiveRocksByItemId` helper.
- `src/three/DepositRocketModel.ts` — `flash(progressRatio)` method, world position accessor.
- `src/three/WaypointMarkers.ts` — accept color override on `addWaypointMarker`.
- `src/lib/minigame/GatherMinigame.ts` — accessors so the facade can read the rocket group + quotas + register a quota-change listener.
- `src/audio/audioManifest.ts` — register `sfx.tool.surveyReveal`.
- `src/audio/LevelAudioDirector.ts` — `notifySurveyReveal(worldPos, camera)` method.
- `src/components/PickupToast.vue` — `surveyEntries` sibling array.
- `src/views/LevelView.vue` — `surveyEntries` ref + `recordSurvey` + `onSurvey` wiring.
- `src/views/LevelViewController.ts` — instantiate / dispose `RocketSurveyFacade`. **Two lines of new logic; no business logic added.**

---

## Task 1: Add tunables in `rocketSurveyConstants.ts`

**Files:**
- Create: `src/lib/level/rocketSurveyConstants.ts`

- [ ] **Step 1: Create the constants file**

```ts
/**
 * Tunables for the SCI-gun rocket-survey hidden utility.
 *
 * @author guinetik
 * @date 2026-04-26
 * @spec docs/superpowers/specs/2026-04-26-rocket-survey-design.md
 */

/** Total survey HP for one scan cycle, in damage-equivalent units. */
export const ROCKET_SURVEY_HP = 32

/** Damage applied per science bolt hit on the rocket. ~8 hits per reveal. */
export const ROCKET_SURVEY_DAMAGE_PER_HIT = 4

/** Survey marker beam color (science green). */
export const ROCKET_SURVEY_MARKER_COLOR = 0x22c55e

/** Per-hit rocket flash decay duration in seconds. */
export const ROCKET_SURVEY_FLASH_HIT_DURATION = 0.25

/** Reveal moment flash decay duration in seconds. */
export const ROCKET_SURVEY_FLASH_REVEAL_DURATION = 0.6

/** Survey toast text. RP-flavored, no mineral name. */
export const ROCKET_SURVEY_TOAST_LABEL = 'DEPOSIT SIGNATURE LOCATED'

/** Survey toast lifetime in seconds before it auto-dismisses. */
export const ROCKET_SURVEY_TOAST_LIFETIME_SEC = 5.0
```

- [ ] **Step 2: Verify type-check passes**

Run: `bun run type-check`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/level/rocketSurveyConstants.ts
git commit -m "feat(level): add rocket-survey tunables"
```

---

## Task 2: Survey state machine — initial state and `setQuotas` (TDD)

**Files:**
- Test: `src/lib/level/__tests__/rocketSurveyState.spec.ts`
- Create: `src/lib/level/rocketSurveyState.ts`

- [ ] **Step 1: Create the test file with the first failing test**

Write `src/lib/level/__tests__/rocketSurveyState.spec.ts`:

```ts
/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RocketSurveyState, type SurveyQuotaSnapshot } from '../rocketSurveyState'

const ALWAYS_FOUND = (itemId: string) => ({ spawnIndex: itemId === 'olivine' ? 1 : 2 })
const NEVER_FOUND = () => null

const QUOTA_OLIVINE_PENDING: SurveyQuotaSnapshot = { itemId: 'olivine', minedKg: 0, targetKg: 10 }
const QUOTA_IRON_PENDING: SurveyQuotaSnapshot = { itemId: 'iron', minedKg: 0, targetKg: 10 }
const QUOTA_OLIVINE_COMPLETE: SurveyQuotaSnapshot = {
  itemId: 'olivine',
  minedKg: 10,
  targetKg: 10,
}

describe('RocketSurveyState', () => {
  let state: RocketSurveyState

  beforeEach(() => {
    state = new RocketSurveyState({ rockAvailability: ALWAYS_FOUND })
  })

  it('initialises in idle phase with no scan target', () => {
    expect(state.phase).toBe('idle')
    expect(state.surveyHp).toBe(0)
    expect(state.targetItemId).toBeNull()
  })

  it('moves to exhausted when all quotas are met via setQuotas', () => {
    state.setQuotas([QUOTA_OLIVINE_COMPLETE])
    expect(state.phase).toBe('exhausted')
  })

  it('stays idle when at least one quota has remaining work', () => {
    state.setQuotas([QUOTA_OLIVINE_PENDING, QUOTA_OLIVINE_COMPLETE])
    expect(state.phase).toBe('idle')
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun test:unit src/lib/level/__tests__/rocketSurveyState.spec.ts`
Expected: FAIL — `Cannot find module '../rocketSurveyState'`.

- [ ] **Step 3: Create the state-machine skeleton**

Write `src/lib/level/rocketSurveyState.ts`:

```ts
/**
 * Pure-TS state machine for the SCI-gun rocket-survey hidden utility.
 *
 * Owns the per-bolt HP ramp, target-mineral selection, and the
 * "awaitingMarkerConsume" lockout that runs from a successful reveal
 * until the marked rock is mined. The facade injects a
 * `rockAvailability` predicate so the state machine stays renderer-
 * and game-state-free.
 *
 * @author guinetik
 * @date 2026-04-26
 * @spec docs/superpowers/specs/2026-04-26-rocket-survey-design.md
 */
import {
  ROCKET_SURVEY_DAMAGE_PER_HIT,
  ROCKET_SURVEY_HP,
} from './rocketSurveyConstants'

/** Lifecycle phase reported by {@link RocketSurveyState}. */
export type RocketSurveyPhase = 'idle' | 'ramping' | 'awaitingMarkerConsume' | 'exhausted'

/** Snapshot of one gather-mission quota the facade pushes in. */
export interface SurveyQuotaSnapshot {
  /** Inventory item id for the quota (matches `RockYieldSystem` itemIds). */
  itemId: string
  /** Total kg already mined across all rocks for this mineral. */
  minedKg: number
  /** Target kg the gather minigame is asking the player to mine. */
  targetKg: number
}

/** Result returned by {@link RocketSurveyState.scienceHit}. */
export interface ScienceHitResult {
  /** Phase after this hit. */
  phase: RocketSurveyPhase
  /** Survey HP after this hit. */
  surveyHp: number
  /** Survey HP at the start of the current scan cycle (used by VFX). */
  surveyHpInitial: number
  /** Whether THIS hit revealed a marker. */
  justRevealed: boolean
  /** Item id of the revealed mineral (only set when `justRevealed`). */
  targetItemId: string | null
  /** Spawn index of the revealed rock (only set when `justRevealed`). */
  targetSpawnIndex: number | null
}

/** Construction options for {@link RocketSurveyState}. */
export interface RocketSurveyStateOptions {
  /**
   * Predicate that asks the facade whether a mineable rock exists for
   * `itemId`. Returns `{ spawnIndex }` for the closest matching rock to
   * the rocket, or `null` when no such rock exists. The state machine
   * calls this only at the reveal step.
   */
  rockAvailability: (itemId: string) => { spawnIndex: number } | null
}

/**
 * Pure-TS rocket-survey state machine. Side effects flow through the
 * return value of {@link scienceHit}; no callbacks fire from inside.
 */
export class RocketSurveyState {
  private _phase: RocketSurveyPhase = 'idle'
  private _surveyHp = 0
  private _surveyHpInitial = 0
  private _targetItemId: string | null = null
  private _quotas: readonly SurveyQuotaSnapshot[] = []
  private readonly _skipped = new Set<string>()
  private readonly _rockAvailability: (itemId: string) => { spawnIndex: number } | null

  constructor(options: RocketSurveyStateOptions) {
    this._rockAvailability = options.rockAvailability
  }

  /** Current lifecycle phase. */
  get phase(): RocketSurveyPhase {
    return this._phase
  }

  /** Survey HP at the current point in the ramp (0 outside `ramping`). */
  get surveyHp(): number {
    return this._surveyHp
  }

  /** Survey HP at the start of the current scan cycle. */
  get surveyHpInitial(): number {
    return this._surveyHpInitial
  }

  /** Currently targeted mineral, or `null` when no scan is active. */
  get targetItemId(): string | null {
    return this._targetItemId
  }

  /**
   * Push a fresh quota snapshot from the gather minigame. Call on every
   * quota change (mining grant or completion). Transitions to
   * `exhausted` when no quota has remaining work.
   */
  setQuotas(quotas: readonly SurveyQuotaSnapshot[]): void {
    this._quotas = quotas
    if (this.allQuotasMet()) {
      this._phase = 'exhausted'
      this._surveyHp = 0
      this._targetItemId = null
    }
  }

  private allQuotasMet(): boolean {
    if (this._quotas.length === 0) return false
    for (const quota of this._quotas) {
      if (quota.minedKg < quota.targetKg) return false
    }
    return true
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/level/__tests__/rocketSurveyState.spec.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/level/rocketSurveyState.ts src/lib/level/__tests__/rocketSurveyState.spec.ts
git commit -m "feat(level): add rocket-survey state machine skeleton"
```

---

## Task 3: `scienceHit` — idle → ramping and decrement (TDD)

**Files:**
- Test: `src/lib/level/__tests__/rocketSurveyState.spec.ts`
- Modify: `src/lib/level/rocketSurveyState.ts`

- [ ] **Step 1: Append failing tests**

Append inside the existing `describe('RocketSurveyState', () => { ... })` block, before its closing `})`:

```ts
  it('returns null and stays idle when no scannable mineral exists', () => {
    state.setQuotas([])
    const result = state.scienceHit()
    expect(result).toBeNull()
    expect(state.phase).toBe('idle')
  })

  it('transitions idle → ramping on the first hit and initialises survey HP', () => {
    state.setQuotas([QUOTA_OLIVINE_PENDING, QUOTA_IRON_PENDING])
    const result = state.scienceHit()
    expect(result).not.toBeNull()
    expect(result!.phase).toBe('ramping')
    expect(result!.justRevealed).toBe(false)
    expect(result!.surveyHp).toBe(28)
    expect(result!.surveyHpInitial).toBe(32)
    expect(result!.targetItemId).toBe('olivine')
    expect(state.phase).toBe('ramping')
    expect(state.targetItemId).toBe('olivine')
  })

  it('decrements survey HP per hit while in ramping', () => {
    state.setQuotas([QUOTA_OLIVINE_PENDING])
    state.scienceHit() // hp 32 -> 28
    state.scienceHit() // hp 28 -> 24
    const result = state.scienceHit() // hp 24 -> 20
    expect(result!.phase).toBe('ramping')
    expect(result!.surveyHp).toBe(20)
    expect(result!.justRevealed).toBe(false)
  })

  it('returns null while exhausted', () => {
    state.setQuotas([QUOTA_OLIVINE_COMPLETE])
    expect(state.scienceHit()).toBeNull()
  })
```

- [ ] **Step 2: Run tests to verify failure**

Run: `bun test:unit src/lib/level/__tests__/rocketSurveyState.spec.ts`
Expected: 4 new tests FAIL with `state.scienceHit is not a function`.

- [ ] **Step 3: Implement `scienceHit` (idle/ramping branches only)**

In `src/lib/level/rocketSurveyState.ts`, add a `scienceHit` method just below `setQuotas`. Also add a private `pickScannableItemId` helper:

```ts
  /**
   * Apply one science-bolt hit to the rocket. Returns `null` when the
   * state is `exhausted` or no scannable mineral exists. Otherwise
   * returns the post-hit snapshot — callers use `justRevealed` to know
   * whether THIS hit placed a marker.
   */
  scienceHit(): ScienceHitResult | null {
    if (this._phase === 'exhausted') return null
    if (this._phase === 'awaitingMarkerConsume') return null

    if (this._phase === 'idle') {
      const next = this.pickScannableItemId()
      if (next === null) return null
      this._phase = 'ramping'
      this._targetItemId = next
      this._surveyHp = ROCKET_SURVEY_HP
      this._surveyHpInitial = ROCKET_SURVEY_HP
    }

    // ramping
    this._surveyHp = Math.max(0, this._surveyHp - ROCKET_SURVEY_DAMAGE_PER_HIT)
    if (this._surveyHp > 0) {
      return {
        phase: this._phase,
        surveyHp: this._surveyHp,
        surveyHpInitial: this._surveyHpInitial,
        justRevealed: false,
        targetItemId: this._targetItemId,
        targetSpawnIndex: null,
      }
    }

    // surveyHp reached zero — reveal step handled in Task 4
    return {
      phase: this._phase,
      surveyHp: this._surveyHp,
      surveyHpInitial: this._surveyHpInitial,
      justRevealed: false,
      targetItemId: this._targetItemId,
      targetSpawnIndex: null,
    }
  }

  /**
   * Pick the first quota in mission order with remaining work that
   * isn't currently in {@link _skipped}. Returns `null` when no
   * scannable mineral exists.
   */
  private pickScannableItemId(): string | null {
    for (const quota of this._quotas) {
      if (quota.minedKg >= quota.targetKg) continue
      if (this._skipped.has(quota.itemId)) continue
      return quota.itemId
    }
    return null
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/level/__tests__/rocketSurveyState.spec.ts`
Expected: PASS — all tests green. The HP-reaches-zero branch returns `justRevealed: false` for now; Task 4 wires the reveal.

- [ ] **Step 5: Commit**

```bash
git add src/lib/level/rocketSurveyState.ts src/lib/level/__tests__/rocketSurveyState.spec.ts
git commit -m "feat(level): rocket-survey ramping and HP decrement"
```

---

## Task 4: Reveal step + skip-and-retry rule (TDD)

**Files:**
- Test: `src/lib/level/__tests__/rocketSurveyState.spec.ts`
- Modify: `src/lib/level/rocketSurveyState.ts`

- [ ] **Step 1: Append failing tests**

Append inside the existing `describe` block:

```ts
  it('reveals a marker when HP reaches zero and a rock is available', () => {
    state.setQuotas([QUOTA_OLIVINE_PENDING])
    // 32 HP / 4 per hit = 8 hits to reveal
    let result: ReturnType<typeof state.scienceHit> = null
    for (let i = 0; i < 8; i++) result = state.scienceHit()
    expect(result!.justRevealed).toBe(true)
    expect(result!.phase).toBe('awaitingMarkerConsume')
    expect(result!.targetItemId).toBe('olivine')
    expect(result!.targetSpawnIndex).toBe(1)
    expect(state.phase).toBe('awaitingMarkerConsume')
  })

  it('returns null while awaitingMarkerConsume so further hits no-op', () => {
    state.setQuotas([QUOTA_OLIVINE_PENDING])
    for (let i = 0; i < 8; i++) state.scienceHit()
    expect(state.phase).toBe('awaitingMarkerConsume')
    expect(state.scienceHit()).toBeNull()
  })

  it('skips an itemId with no available rock and re-picks the next still-needed mineral', () => {
    const skipFn = vi.fn((itemId: string): { spawnIndex: number } | null => {
      return itemId === 'olivine' ? null : { spawnIndex: 9 }
    })
    state = new RocketSurveyState({ rockAvailability: skipFn })
    state.setQuotas([QUOTA_OLIVINE_PENDING, QUOTA_IRON_PENDING])
    let result: ReturnType<typeof state.scienceHit> = null
    for (let i = 0; i < 8; i++) result = state.scienceHit()
    // Reveal step: olivine has no rock -> skip; next quota is iron -> ramping resumes for iron.
    expect(result!.justRevealed).toBe(false)
    expect(result!.phase).toBe('ramping')
    expect(result!.surveyHp).toBe(32)
    expect(state.targetItemId).toBe('iron')
  })

  it('returns to idle when the last scannable itemId is skipped', () => {
    const neverFound = vi.fn(() => null)
    state = new RocketSurveyState({ rockAvailability: neverFound })
    state.setQuotas([QUOTA_OLIVINE_PENDING])
    let result: ReturnType<typeof state.scienceHit> = null
    for (let i = 0; i < 8; i++) result = state.scienceHit()
    expect(result!.justRevealed).toBe(false)
    expect(result!.phase).toBe('idle')
    expect(state.targetItemId).toBeNull()
    expect(state.scienceHit()).toBeNull()
  })
```

- [ ] **Step 2: Run tests to verify failure**

Run: `bun test:unit src/lib/level/__tests__/rocketSurveyState.spec.ts`
Expected: 4 new tests FAIL — reveal still returns `justRevealed: false`, no `awaitingMarkerConsume` transition.

- [ ] **Step 3: Implement the reveal + skip-and-retry block**

In `src/lib/level/rocketSurveyState.ts`, replace the existing `// surveyHp reached zero — reveal step handled in Task 4` block (the bottom of `scienceHit`) with the reveal logic:

```ts
    // surveyHp reached zero — reveal step.
    while (this._targetItemId !== null) {
      const found = this._rockAvailability(this._targetItemId)
      if (found !== null) {
        const revealed = this._targetItemId
        this._phase = 'awaitingMarkerConsume'
        return {
          phase: this._phase,
          surveyHp: this._surveyHp,
          surveyHpInitial: this._surveyHpInitial,
          justRevealed: true,
          targetItemId: revealed,
          targetSpawnIndex: found.spawnIndex,
        }
      }

      // No rock for this itemId. Skip it and try the next still-needed mineral.
      this._skipped.add(this._targetItemId)
      const next = this.pickScannableItemId()
      if (next === null) {
        this._phase = 'idle'
        this._targetItemId = null
        this._surveyHp = 0
        this._surveyHpInitial = 0
        return {
          phase: this._phase,
          surveyHp: this._surveyHp,
          surveyHpInitial: this._surveyHpInitial,
          justRevealed: false,
          targetItemId: null,
          targetSpawnIndex: null,
        }
      }
      this._targetItemId = next
      this._phase = 'ramping'
      this._surveyHp = ROCKET_SURVEY_HP
      this._surveyHpInitial = ROCKET_SURVEY_HP
      return {
        phase: this._phase,
        surveyHp: this._surveyHp,
        surveyHpInitial: this._surveyHpInitial,
        justRevealed: false,
        targetItemId: this._targetItemId,
        targetSpawnIndex: null,
      }
    }

    // Defensive: targetItemId went null mid-flight. Drop to idle.
    this._phase = 'idle'
    this._surveyHp = 0
    this._surveyHpInitial = 0
    return null
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/level/__tests__/rocketSurveyState.spec.ts`
Expected: PASS — all 11 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/level/rocketSurveyState.ts src/lib/level/__tests__/rocketSurveyState.spec.ts
git commit -m "feat(level): rocket-survey reveal + skip-and-retry"
```

---

## Task 5: `notifyMarkerConsumed` and `detach` (TDD)

**Files:**
- Test: `src/lib/level/__tests__/rocketSurveyState.spec.ts`
- Modify: `src/lib/level/rocketSurveyState.ts`

- [ ] **Step 1: Append failing tests**

Append inside the existing `describe` block:

```ts
  it('returns to idle when the placed marker is consumed', () => {
    state.setQuotas([QUOTA_OLIVINE_PENDING, QUOTA_IRON_PENDING])
    for (let i = 0; i < 8; i++) state.scienceHit()
    expect(state.phase).toBe('awaitingMarkerConsume')
    state.notifyMarkerConsumed('olivine')
    expect(state.phase).toBe('idle')
    expect(state.targetItemId).toBeNull()
  })

  it('clears the consumed itemId from the skip set so future scans may re-target it', () => {
    const fn = vi
      .fn<(itemId: string) => { spawnIndex: number } | null>()
      .mockReturnValueOnce(null) // first reveal: olivine skipped
      .mockReturnValueOnce({ spawnIndex: 5 }) // first reveal: iron found
      .mockReturnValueOnce({ spawnIndex: 1 }) // post-consume: olivine found again
    state = new RocketSurveyState({ rockAvailability: fn })
    state.setQuotas([QUOTA_OLIVINE_PENDING, QUOTA_IRON_PENDING])
    for (let i = 0; i < 8; i++) state.scienceHit() // olivine skipped, ramping for iron
    for (let i = 0; i < 8; i++) state.scienceHit() // iron revealed
    expect(state.phase).toBe('awaitingMarkerConsume')
    expect(state.targetItemId).toBe('iron')
    state.notifyMarkerConsumed('iron')
    expect(state.phase).toBe('idle')
    // Now scan again — olivine should be considered, not stuck in skipped
    const next = state.scienceHit()
    expect(next!.targetItemId).toBe('olivine')
  })

  it('ignores notifyMarkerConsumed when the itemId does not match the active target', () => {
    state.setQuotas([QUOTA_OLIVINE_PENDING])
    for (let i = 0; i < 8; i++) state.scienceHit()
    expect(state.phase).toBe('awaitingMarkerConsume')
    state.notifyMarkerConsumed('iron')
    expect(state.phase).toBe('awaitingMarkerConsume')
  })

  it('detach resets phase, target, and skipped set', () => {
    const neverFound = vi.fn(() => null)
    state = new RocketSurveyState({ rockAvailability: neverFound })
    state.setQuotas([QUOTA_OLIVINE_PENDING])
    for (let i = 0; i < 8; i++) state.scienceHit() // olivine -> skipped, idle
    state.detach()
    expect(state.phase).toBe('idle')
    expect(state.targetItemId).toBeNull()
    // After detach the skipped set is cleared — set quotas back and verify
    state.setQuotas([QUOTA_OLIVINE_PENDING])
    const result = state.scienceHit()
    expect(result!.targetItemId).toBe('olivine')
  })

  it('moves to exhausted when setQuotas reports all met after a delivery', () => {
    state.setQuotas([QUOTA_OLIVINE_PENDING])
    expect(state.phase).toBe('idle')
    state.setQuotas([QUOTA_OLIVINE_COMPLETE])
    expect(state.phase).toBe('exhausted')
    expect(state.scienceHit()).toBeNull()
  })
```

- [ ] **Step 2: Run tests to verify failure**

Run: `bun test:unit src/lib/level/__tests__/rocketSurveyState.spec.ts`
Expected: 5 new tests FAIL — `notifyMarkerConsumed` / `detach` not defined.

- [ ] **Step 3: Implement `notifyMarkerConsumed` and `detach`**

In `src/lib/level/rocketSurveyState.ts`, append two methods to the class (just below `pickScannableItemId`):

```ts
  /**
   * The marker placed for `itemId` has been consumed (its rock was mined).
   * Releases the lockout so the next bolt re-enters ramping for the next
   * still-needed mineral. Also removes `itemId` from the skipped set so
   * future scans may consider it again.
   */
  notifyMarkerConsumed(itemId: string): void {
    if (this._phase !== 'awaitingMarkerConsume') return
    if (this._targetItemId !== itemId) return
    this._skipped.delete(itemId)
    this._phase = 'idle'
    this._targetItemId = null
    this._surveyHp = 0
    this._surveyHpInitial = 0
  }

  /**
   * Tear down state for a level exit / mission completion. Clears
   * skipped tracking and any in-progress ramp.
   */
  detach(): void {
    this._phase = 'idle'
    this._targetItemId = null
    this._surveyHp = 0
    this._surveyHpInitial = 0
    this._skipped.clear()
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/level/__tests__/rocketSurveyState.spec.ts`
Expected: PASS — all 16 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/level/rocketSurveyState.ts src/lib/level/__tests__/rocketSurveyState.spec.ts
git commit -m "feat(level): rocket-survey marker-consume + detach"
```

---

## Task 6: Add `findActiveRocksByItemId` to `RockYieldSystem`

**Files:**
- Modify: `src/lib/mining/rockYieldSystem.ts`

The facade needs to enumerate spawn indices that match an itemId and have remaining yield. The current API only exposes `peekRock(spawnIndex)` and `rolledItemIds`. We add a small helper.

- [ ] **Step 1: Add the new method**

In `src/lib/mining/rockYieldSystem.ts`, add a method just below `countRolls`:

```ts
  /**
   * Return spawn indices for every currently registered rock whose
   * itemId matches `itemId` and has remaining kg. Used by the rocket-
   * survey facade to find candidates before picking the closest to
   * the rocket. Cheap — the rocks map is bounded to a few hundred
   * entries.
   */
  findActiveRocksByItemId(itemId: string): readonly number[] {
    const matches: number[] = []
    for (const [spawnIndex, roll] of this.rocks.entries()) {
      if (roll.itemId !== itemId) continue
      if (roll.remainingKg <= 0) continue
      matches.push(spawnIndex)
    }
    return matches
  }
```

- [ ] **Step 2: Run type-check + tests**

Run: `bun run type-check && bun test:unit`
Expected: no type errors; existing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/mining/rockYieldSystem.ts
git commit -m "feat(mining): findActiveRocksByItemId helper"
```

---

## Task 7: Expose color override on `addWaypointMarker`

**Files:**
- Modify: `src/three/WaypointMarkers.ts`

The mission objective beam is cyan. The survey beam needs to be science green. The existing `createWaypointMarkerGroup` already accepts a color. We just route it through `addWaypointMarker`.

- [ ] **Step 1: Add an optional `color` parameter**

Find the existing `addWaypointMarker` (around line 282) and replace it with:

```ts
/**
 * Add a waypoint marker to the scene at the given world position.
 *
 * @param id - Unique marker id.
 * @param x - World X position.
 * @param z - World Z position.
 * @param groundY - Terrain height at (x, z).
 * @param scene - Three.js scene to add marker to.
 * @param color - Optional hex color; defaults to {@link WAYPOINT_MARKER_DEFAULT_COLOR}.
 */
export function addWaypointMarker(
  id: string,
  x: number,
  z: number,
  groundY: number,
  scene: THREE.Scene,
  color: number = WAYPOINT_MARKER_DEFAULT_COLOR,
): void {
  if (markers.find((m) => m.id === id)) return
  const group = createWaypointMarkerGroup(color, 'surface')
  group.position.set(x, groundY, z)
  scene.add(group)
  markers.push({ id, group })
}
```

- [ ] **Step 2: Run type-check + tests**

Run: `bun run type-check && bun test:unit`
Expected: no type errors; existing tests still pass (the new parameter is optional).

- [ ] **Step 3: Commit**

```bash
git add src/three/WaypointMarkers.ts
git commit -m "feat(three): waypoint marker color override"
```

---

## Task 8: Add `flash(progressRatio)` to `DepositRocketModel`

**Files:**
- Modify: `src/three/DepositRocketModel.ts`

Per-hit green flash on the rocket's screen and antenna tip emissive. Driven by the facade per `onProgress`.

- [ ] **Step 1: Add the flash method, scratch state, and tunables**

In `src/three/DepositRocketModel.ts`, add new constants near the top (after the existing constant block):

```ts
const SURVEY_FLASH_BASE_EMISSIVE = 0x25ffd0
const SURVEY_FLASH_GREEN_EMISSIVE = 0x22c55e
const SURVEY_FLASH_BASE_INTENSITY = 1.7
const SURVEY_FLASH_PEAK_INTENSITY = 4.5
```

Add new private fields to the class (just after `private flightTime = 0`):

```ts
  /** Active green-flash decay timer in seconds; 0 = idle. */
  private surveyFlashTimer = 0
  /** Total decay duration of the active flash (so we can normalise progress). */
  private surveyFlashDuration = 0
```

Add the `flash` method (just after `setVisible`):

```ts
  /**
   * Trigger a green emissive pulse on the screen + antenna tip. Driven
   * by the SCI-gun rocket-survey facade per bolt hit. The flash uses an
   * exponential-style decay over `duration` seconds.
   *
   * @param duration - Decay duration in seconds. Higher = brighter / longer.
   */
  flash(duration: number): void {
    const safeDuration = Math.max(0.05, duration)
    if (safeDuration > this.surveyFlashTimer) {
      this.surveyFlashTimer = safeDuration
      this.surveyFlashDuration = safeDuration
    }
  }
```

Modify `tick(dt)` to advance the flash. Currently `tick` returns early on `!this._isTakingOff`. The flash should run regardless. Replace the existing `tick` with:

```ts
  tick(dt: number): boolean {
    this.advanceSurveyFlash(dt)
    if (!this._isTakingOff) return false

    const previousFlightTime = this.flightTime
    this.flightTime += dt
    const activeFlightDt = Math.max(0, this.flightTime - IGNITION_HOLD_SECONDS) - Math.max(
      0,
      previousFlightTime - IGNITION_HOLD_SECONDS,
    )

    if (activeFlightDt > 0) {
      this.velocityY += LAUNCH_ACCELERATION * activeFlightDt
      this.group.position.y += this.velocityY * activeFlightDt
      this.group.position.x += LAUNCH_DRIFT_SPEED * activeFlightDt
      this.group.rotation.z += LAUNCH_ROLL_SPEED * activeFlightDt
    }

    const flicker = Math.sin(this.flightTime * EXHAUST_FLICKER_FREQUENCY) * 0.5 + 0.5
    this.exhaustMesh.scale.setScalar(EXHAUST_BASE_SCALE + flicker * EXHAUST_FLICKER_SCALE)
    this.exhaustMaterial.opacity = EXHAUST_BASE_OPACITY + flicker * EXHAUST_FLICKER_OPACITY

    const visibleWindowElapsed = this.flightTime > LAUNCH_MIN_VISIBLE_SECONDS
    return visibleWindowElapsed && this.group.position.y > LAUNCH_DONE_HEIGHT
  }

  /**
   * Decay the active green flash and apply the resulting emissive
   * intensity / color to the screen material. Reverts to the default
   * cyan emissive when the flash timer reaches zero.
   */
  private advanceSurveyFlash(dt: number): void {
    if (this.surveyFlashTimer <= 0) {
      // Idle — ensure default cyan
      this.screenMaterial.emissive.setHex(SURVEY_FLASH_BASE_EMISSIVE)
      this.screenMaterial.emissiveIntensity = SURVEY_FLASH_BASE_INTENSITY
      return
    }
    this.surveyFlashTimer = Math.max(0, this.surveyFlashTimer - dt)
    const progress = this.surveyFlashDuration > 0
      ? this.surveyFlashTimer / this.surveyFlashDuration
      : 0
    // Lerp green→cyan over the decay; interpolate intensity peak→base
    this.screenMaterial.emissive.setHex(SURVEY_FLASH_GREEN_EMISSIVE)
    const intensity =
      SURVEY_FLASH_BASE_INTENSITY +
      (SURVEY_FLASH_PEAK_INTENSITY - SURVEY_FLASH_BASE_INTENSITY) * progress
    this.screenMaterial.emissiveIntensity = intensity
  }
```

- [ ] **Step 2: Run type-check + tests**

Run: `bun run type-check && bun test:unit`
Expected: no type errors; existing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/three/DepositRocketModel.ts
git commit -m "feat(three): rocket survey flash on DepositRocketModel"
```

---

## Task 9: Register `sfx.tool.surveyReveal` cue + `notifySurveyReveal`

**Files:**
- Modify: `src/audio/audioManifest.ts`
- Modify: `src/audio/LevelAudioDirector.ts`

- [ ] **Step 1: Add the new id to the literal-union list**

In `src/audio/audioManifest.ts`, find the literal-union list near the top of the file (around line 100-105 — `'sfx.tool.heal'` and `'sfx.tool.prospectComplete'` are listed there). Add `'sfx.tool.surveyReveal'` immediately after `'sfx.tool.prospectComplete'`:

```ts
  'sfx.tool.prospectComplete',
  'sfx.tool.surveyReveal',
```

- [ ] **Step 2: Add the manifest entry**

Find the `'sfx.tool.prospectComplete'` map entry (around line 850). Add the new entry immediately after it:

```ts
  'sfx.tool.surveyReveal': {
    id: 'sfx.tool.surveyReveal',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.5,
    effect: 'none',
    procedural: 'tool-heal',
  },
```

(`procedural: 'tool-heal'` is the same placeholder `prospectComplete` uses; a dedicated synth can replace it later without touching call sites.)

- [ ] **Step 3: Run audio manifest tests**

Run: `bun test:unit src/audio/__tests__/audioManifest.spec.ts`
Expected: PASS — the manifest test asserts every listed id has a matching map entry.

- [ ] **Step 4: Add `notifySurveyReveal` to `LevelAudioDirector`**

In `src/audio/LevelAudioDirector.ts`, immediately below the existing `notifyProspectComplete` method, add:

```ts
  /**
   * The rocket-survey scan revealed a marker; play the analytical-beep
   * cue as a positional point source so it reads as coming from the
   * rocket itself.
   *
   * @param worldPos - World-space position of the rocket group.
   * @param camera - FPS camera (for `worldPointToHearing`).
   */
  notifySurveyReveal(worldPos: Vector3, camera: PerspectiveCamera): void {
    const w = worldPointToHearing(camera, worldPos, {
      refDistance: PROSPECT_SPATIAL_REF_DISTANCE,
      minVolumeScale: PROSPECT_SPATIAL_MIN_VOLUME,
    })
    const def = getAudioDefinition('sfx.tool.surveyReveal')
    const handle = this.audio.play('sfx.tool.surveyReveal', {
      volume: def.volume * w.volumeScale,
    })
    handle.setStereo(w.pan)
  }
```

- [ ] **Step 5: Run type-check + tests**

Run: `bun run type-check && bun test:unit`
Expected: no type errors; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/audio/audioManifest.ts src/audio/LevelAudioDirector.ts
git commit -m "feat(audio): register survey-reveal cue and notifier"
```

---

## Task 10: Add `'science_rocket'` impact kind + `onScienceRocketHit` + rocket AABB to `ProjectileSystem`

**Files:**
- Modify: `src/lib/fps/projectileSystem.ts`

- [ ] **Step 1: Extend `ProjectileImpactKind`**

Find:

```ts
export type ProjectileImpactKind = 'terrain' | 'drill_rock' | 'science_rock' | 'enemy' | 'hostage'
```

Replace with:

```ts
export type ProjectileImpactKind =
  | 'terrain'
  | 'drill_rock'
  | 'science_rock'
  | 'science_rocket'
  | 'enemy'
  | 'hostage'
```

- [ ] **Step 2: Add the new callback declaration**

Just below the existing `onScienceRockHit` declaration, add:

```ts
  /**
   * Called when a **science** bolt hits the registered survey target
   * (the gather-mission delivery rocket). Hidden mechanic — never
   * surfaced via HUD.
   *
   * @param position - **Transient** impact point. Mutated on the next
   *   callback; copy if you need to keep it past the synchronous handler body.
   */
  onScienceRocketHit: ((position: THREE.Vector3) => void) | null = null
```

- [ ] **Step 3: Add the survey-target registration API + private state**

Find the `private lander: LanderController | null = null` declaration. Below it, add:

```ts
  /** Registered survey target (gather-mission rocket). Null when no gather mission is active. */
  private surveyTarget: THREE.Object3D | null = null
  /** Survey-target half extents (X, Y, Z) used for AABB hit testing. */
  private readonly _surveyHalfExtents = new THREE.Vector3()
  /** Reused scratch — survey target world position. */
  private readonly _surveyCenter = new THREE.Vector3()
```

Find the `setLander` method. Just below it, add:

```ts
  /**
   * Register (or clear) the rocket-survey target. Pass `null` to clear.
   * Half extents define a local-axis AABB around the rocket world
   * position; the science-bolt branch checks this AABB before falling
   * through to the rock cascade.
   */
  setSurveyTarget(target: THREE.Object3D | null, halfExtents: THREE.Vector3 | null): void {
    this.surveyTarget = target
    if (halfExtents) {
      this._surveyHalfExtents.copy(halfExtents)
    } else {
      this._surveyHalfExtents.set(0, 0, 0)
    }
  }
```

- [ ] **Step 4: Add a private rocket-AABB hit helper**

Find the `private closestRockHit(...)` method. Above it, add a sibling helper:

```ts
  /**
   * Whether the swept segment from `from` to `to` intersects the
   * registered survey target AABB. Returns the (clamped) impact point
   * via `out`, or `null` when no intersection.
   */
  private surveyTargetHit(
    from: THREE.Vector3,
    to: THREE.Vector3,
    out: THREE.Vector3,
  ): THREE.Vector3 | null {
    if (!this.surveyTarget) return null
    this.surveyTarget.getWorldPosition(this._surveyCenter)
    const minX = this._surveyCenter.x - this._surveyHalfExtents.x
    const maxX = this._surveyCenter.x + this._surveyHalfExtents.x
    const minY = this._surveyCenter.y - this._surveyHalfExtents.y
    const maxY = this._surveyCenter.y + this._surveyHalfExtents.y
    const minZ = this._surveyCenter.z - this._surveyHalfExtents.z
    const maxZ = this._surveyCenter.z + this._surveyHalfExtents.z
    // Slab method — axis-aligned box / segment intersection.
    const dx = to.x - from.x
    const dy = to.y - from.y
    const dz = to.z - from.z
    let tEnter = 0
    let tExit = 1
    const slab = (origin: number, delta: number, lo: number, hi: number): boolean => {
      if (Math.abs(delta) < 1e-6) return origin >= lo && origin <= hi
      const t1 = (lo - origin) / delta
      const t2 = (hi - origin) / delta
      const tMin = Math.min(t1, t2)
      const tMax = Math.max(t1, t2)
      if (tMin > tEnter) tEnter = tMin
      if (tMax < tExit) tExit = tMax
      return tEnter <= tExit
    }
    if (!slab(from.x, dx, minX, maxX)) return null
    if (!slab(from.y, dy, minY, maxY)) return null
    if (!slab(from.z, dz, minZ, maxZ)) return null
    if (tEnter > 1 || tExit < 0) return null
    out.set(from.x + dx * tEnter, from.y + dy * tEnter, from.z + dz * tEnter)
    return out
  }
```

- [ ] **Step 5: Insert rocket detection into the science branch**

Find the science-bolt branch in `tick`:

```ts
      if (p.boltKind === 'science') {
        const hostageHit = this.closestHostageHealHit(this._prevPos, pos)
        if (hostageHit) {
          // ...
        } else {
          let landerHit = false
          if (this.lander) {
            // ...
          }
          if (!landerHit) {
            const rockHit = this.closestRockHit(this._prevPos, pos)
            if (rockHit) {
              this._callbackPos.copy(pos)
              this.onScienceRockHit?.(rockHit.spawnIndex, this._callbackPos)
              hitRock = true
            }
          }
        }
      }
```

The existing target order (per the file comment) is `hostage → lander → rock`. We insert rocket detection between `lander` and `rock` so the lander still wins when standing inside its hull radius (rare but possible). Also add a new local flag `hitRocket`.

Add `let hitRocket = false` to the local hit flags right after `let hitRock = false`. Then replace the science branch with:

```ts
      if (p.boltKind === 'science') {
        const hostageHit = this.closestHostageHealHit(this._prevPos, pos)
        if (hostageHit) {
          hostageHit.hostage.heal(HEAL_BOLT_AMOUNT)
          this._callbackPos.copy(pos)
          this.onHostageBolt?.(hostageHit.hostage, this._callbackPos, 'heal')
          hitHostage = true
        } else {
          let landerHit = false
          if (this.lander) {
            this.lander.group.getWorldPosition(this._landerCenter)
            const distSq = pos.distanceToSquared(this._landerCenter)
            // ~13.4 unit radius around lander center
            if (distSq < 180) {
              this.lander.healHull(HEAL_BOLT_AMOUNT)
              this._callbackPos.copy(pos)
              hitHostage = true // reuse flag so onImpact fires for VFX
              landerHit = true
            }
          }
          if (!landerHit) {
            const surveyImpact = this.surveyTargetHit(this._prevPos, pos, this._callbackPos)
            if (surveyImpact !== null) {
              this.onScienceRocketHit?.(this._callbackPos)
              hitRocket = true
            } else {
              const rockHit = this.closestRockHit(this._prevPos, pos)
              if (rockHit) {
                this._callbackPos.copy(pos)
                this.onScienceRockHit?.(rockHit.spawnIndex, this._callbackPos)
                hitRock = true
              }
            }
          }
        }
      }
```

- [ ] **Step 6: Update the impact-kind classification block**

Find the existing block:

```ts
          let kind: ProjectileImpactKind
          if (hitEnemy) {
            kind = 'enemy'
          } else if (hitHostage) {
            kind = 'hostage'
          } else if (hitRock) {
            if (p.boltKind === 'drill') kind = 'drill_rock'
            else if (p.boltKind === 'science') kind = 'science_rock'
            else kind = 'terrain'
          } else {
            kind = 'terrain'
          }
          this.onImpact?.(this._callbackPos, { boltKind: p.boltKind, kind })
```

Replace with:

```ts
          let kind: ProjectileImpactKind
          if (hitEnemy) {
            kind = 'enemy'
          } else if (hitRocket) {
            kind = 'science_rocket'
          } else if (hitHostage) {
            kind = 'hostage'
          } else if (hitRock) {
            if (p.boltKind === 'drill') kind = 'drill_rock'
            else if (p.boltKind === 'science') kind = 'science_rock'
            else kind = 'terrain'
          } else {
            kind = 'terrain'
          }
          this.onImpact?.(this._callbackPos, { boltKind: p.boltKind, kind })
```

Also extend the early-return condition that decides whether to fire `onImpact` and `removeProjectile`:

Find:

```ts
      if (hitEnemy || hitHostage || hitRock || hitTerrain || p.age >= BOLT_MAX_LIFETIME) {
        if (hitTerrain || hitEnemy || hitHostage || hitRock) {
```

Replace with:

```ts
      if (
        hitEnemy ||
        hitHostage ||
        hitRock ||
        hitRocket ||
        hitTerrain ||
        p.age >= BOLT_MAX_LIFETIME
      ) {
        if (hitTerrain || hitEnemy || hitHostage || hitRock || hitRocket) {
```

- [ ] **Step 7: Run type-check + tests**

Run: `bun run type-check && bun test:unit`
Expected: no type errors; all tests pass. The new bolt route is dormant until the facade calls `setSurveyTarget`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/fps/projectileSystem.ts
git commit -m "feat(fps): science_rocket impact kind and rocket AABB routing"
```

---

## Task 11: Expose accessors on `GatherMinigame`

**Files:**
- Modify: `src/lib/minigame/GatherMinigame.ts`

The facade reads the rocket group + quotas from the active gather minigame. We add a few accessors plus a quota-change callback the facade can subscribe to.

- [ ] **Step 1: Add `onQuotaChange` callback declaration**

In `src/lib/minigame/GatherMinigame.ts`, find the existing `onPrompt`, `onComplete`, `onStepChange` declarations on the `GatherMinigame` class (around line 160). Add a new public callback below them:

```ts
  /**
   * Fired whenever any mineral quota changes (mining grant or
   * deposit). The rocket-survey facade subscribes to this so it
   * can refresh the state machine's quota snapshot.
   */
  onQuotaChange: ((quotas: readonly GatherMineralQuota[]) => void) | null = null
```

- [ ] **Step 2: Fire `onQuotaChange` from `handleExtraction` and `tick`**

In `handleExtraction`, find the existing `this.onStepChange?.(this.objectiveIndex, this._steps)` line at the end. Add an `onQuotaChange` fire above it (so the facade sees the snapshot before the step-change UI fires):

```ts
    if (!updated) return
    this.refreshActiveStep()
    this.onQuotaChange?.(this.quotas)
    this.onStepChange?.(this.objectiveIndex, this._steps)
```

In the deposit branch of `tick` (search for `this._status = 'completed'`), add an `onQuotaChange` fire just before the `this.onComplete?.(this.objectiveIndex)` line. Even though deposit doesn't change `minedKg`, this gives the facade a final snapshot to flip to `exhausted`:

```ts
    this._status = 'completed'
    this.onPrompt?.(null)
    this.rocket.takeOff()
    this.onQuotaChange?.(this.quotas)
    this.onStepChange?.(this.objectiveIndex, this._steps)
    this.onComplete?.(this.objectiveIndex)
```

- [ ] **Step 3: Add a public `rocketGroup` accessor**

Add a getter just below the existing `mineralQuotas` getter (around line 195):

```ts
  /** The rocket Three.js group for the rocket-survey facade. */
  get rocketGroup(): THREE.Group {
    return this.rocket.group
  }
```

- [ ] **Step 4: Null `onQuotaChange` in `dispose`**

In `dispose()`, add `this.onQuotaChange = null` to the existing null-out block:

```ts
  dispose(): void {
    this._disposed = true
    this.scene.remove(this.rocket.group)
    this.rocket.dispose()
    this.onPrompt = null
    this.onComplete = null
    this.onStepChange = null
    this.onQuotaChange = null
  }
```

- [ ] **Step 5: Run type-check + tests**

Run: `bun run type-check && bun test:unit`
Expected: no type errors; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/minigame/GatherMinigame.ts
git commit -m "feat(gather): expose rocket group + quota-change callback"
```

---

## Task 12: `RocketSurveyFacade` skeleton — deps, bindings, attach/detach

**Files:**
- Create: `src/lib/level/RocketSurveyFacade.ts`

- [ ] **Step 1: Create the facade file**

Write `src/lib/level/RocketSurveyFacade.ts`:

```ts
/**
 * Runtime wiring for the SCI-gun rocket-survey hidden utility.
 *
 * Owns the callback plumbing between:
 * - {@link ProjectileSystem} science-bolt rocket hits
 * - {@link GatherMinigame} quota state and rocket placement
 * - {@link RockYieldSystem} rock candidate enumeration
 * - {@link SurfaceRockController} world positions for the closest-rock pick
 * - {@link WaypointMarkers} surface-beam placement / removal
 * - host UI callbacks (toast + audio)
 *
 * @author guinetik
 * @date 2026-04-26
 * @spec docs/superpowers/specs/2026-04-26-rocket-survey-design.md
 */
import * as THREE from 'three'
import type { GatherMinigame } from '@/lib/minigame/GatherMinigame'
import type { Heightmap } from '@/lib/terrain/heightmap'
import type { LevelAudioDirector } from '@/audio/LevelAudioDirector'
import type { ProjectileSystem } from '@/lib/fps/projectileSystem'
import type { RockYieldSystem } from '@/lib/mining/rockYieldSystem'
import type { SurfaceRockController } from '@/three/controllers/SurfaceRockController'
import type { ParticleEmitter } from '@/three/ParticleEmitter'
import type { FpsCamera } from '@/three/FpsCamera'
import { addWaypointMarker, removeWaypointMarker } from '@/three/WaypointMarkers'
import { RocketSurveyState } from './rocketSurveyState'
import {
  ROCKET_SURVEY_FLASH_HIT_DURATION,
  ROCKET_SURVEY_FLASH_REVEAL_DURATION,
  ROCKET_SURVEY_MARKER_COLOR,
  ROCKET_SURVEY_TOAST_LABEL,
} from './rocketSurveyConstants'

/** Half-extents (X, Y, Z) used for the rocket AABB. Sized to cover body + nose. */
const ROCKET_AABB_HALF_X = 1.4
const ROCKET_AABB_HALF_Y = 6.0
const ROCKET_AABB_HALF_Z = 1.4
/** Particles emitted at each science-bolt rocket hit. */
const SURVEY_IMPACT_PARTICLES = 6
/** Vertical launch speed for survey impact chips. */
const SURVEY_IMPACT_VERTICAL_SPEED = 2.5
/** Lateral scatter for survey impact chips. */
const SURVEY_IMPACT_LATERAL_SPEED = 1.5

/** Host bindings the facade needs. */
export interface RocketSurveyBindings {
  /** Toast sink: the survey successfully revealed a marker. */
  onSurvey: (label: string) => void
}

/** Runtime collaborators the facade needs. */
export interface RocketSurveyDeps {
  scene: THREE.Scene
  projectileSystem: ProjectileSystem
  rockYieldSystem: RockYieldSystem
  surfaceRocks: SurfaceRockController
  heightmap: Heightmap
  impactEmitter: ParticleEmitter
  fpsCamera: FpsCamera
  levelAudio: LevelAudioDirector
  gather: GatherMinigame
}

/**
 * Facade owning the rocket-survey lifecycle. Mirrors the
 * `LevelCombatMiningFacade` shape used elsewhere.
 */
export class RocketSurveyFacade {
  private readonly state: RocketSurveyState
  private readonly deps: RocketSurveyDeps
  private readonly bindings: RocketSurveyBindings
  private readonly halfExtents = new THREE.Vector3(
    ROCKET_AABB_HALF_X,
    ROCKET_AABB_HALF_Y,
    ROCKET_AABB_HALF_Z,
  )
  private activeMarkerSpawnIndex: number | null = null
  private activeMarkerItemId: string | null = null
  private previousOnConsume: ((spawnIndex: number) => void) | null = null
  private readonly _scratchCenter = new THREE.Vector3()

  constructor(deps: RocketSurveyDeps, bindings: RocketSurveyBindings) {
    this.deps = deps
    this.bindings = bindings
    this.state = new RocketSurveyState({
      rockAvailability: (itemId) => this.findClosestRock(itemId),
    })
  }

  /** Wire callbacks and register the rocket AABB on the projectile system. */
  attach(): void {
    this.deps.projectileSystem.setSurveyTarget(this.deps.gather.rocketGroup, this.halfExtents)
    this.deps.projectileSystem.onScienceRocketHit = (impactPos) => this.onBoltHit(impactPos)

    this.deps.gather.onQuotaChange = (quotas) => {
      this.state.setQuotas(
        quotas.map((q) => ({
          itemId: q.itemId,
          minedKg: q.minedKg,
          targetKg: q.targetKg,
        })),
      )
    }
    this.state.setQuotas(
      this.deps.gather.mineralQuotas.map((q) => ({
        itemId: q.itemId,
        minedKg: q.minedKg,
        targetKg: q.targetKg,
      })),
    )

    // Chain onConsume so we can release the marker when its rock is mined out.
    this.previousOnConsume = this.deps.rockYieldSystem.onConsume
    this.deps.rockYieldSystem.onConsume = (spawnIndex) => {
      this.previousOnConsume?.(spawnIndex)
      this.handleRockConsumed(spawnIndex)
    }
  }

  /** Tear down callbacks, dispose any active marker. */
  detach(): void {
    this.deps.projectileSystem.setSurveyTarget(null, null)
    this.deps.projectileSystem.onScienceRocketHit = null
    this.deps.gather.onQuotaChange = null
    if (this.previousOnConsume !== undefined) {
      this.deps.rockYieldSystem.onConsume = this.previousOnConsume
      this.previousOnConsume = null
    }
    if (this.activeMarkerSpawnIndex !== null) {
      removeWaypointMarker(`rocket-survey-${this.activeMarkerSpawnIndex}`, this.deps.scene)
      this.activeMarkerSpawnIndex = null
      this.activeMarkerItemId = null
    }
    this.state.detach()
  }

  /** Per-bolt rocket hit handler. Implementation lands in Task 13. */
  private onBoltHit(_impactPos: THREE.Vector3): void {
    // Implemented in Task 13.
  }

  /** Closest-rock-by-itemId helper for the state machine. Implementation lands in Task 13. */
  private findClosestRock(_itemId: string): { spawnIndex: number } | null {
    return null
  }

  /** onConsume chain — release the lockout when the marked rock is mined. */
  private handleRockConsumed(spawnIndex: number): void {
    if (this.activeMarkerSpawnIndex !== spawnIndex) return
    const itemId = this.activeMarkerItemId
    removeWaypointMarker(`rocket-survey-${spawnIndex}`, this.deps.scene)
    this.activeMarkerSpawnIndex = null
    this.activeMarkerItemId = null
    if (itemId !== null) this.state.notifyMarkerConsumed(itemId)
  }
}

/** Re-export tunables consumers reach for. */
export { ROCKET_SURVEY_TOAST_LABEL, ROCKET_SURVEY_FLASH_HIT_DURATION, ROCKET_SURVEY_FLASH_REVEAL_DURATION }
```

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: no errors. The new file builds; bolt routing is wired but the hit handler is a stub (Task 13 fills it in).

- [ ] **Step 3: Commit**

```bash
git add src/lib/level/RocketSurveyFacade.ts
git commit -m "feat(level): RocketSurveyFacade skeleton"
```

---

## Task 13: Implement `onBoltHit`, `findClosestRock`, and reveal flow

**Files:**
- Modify: `src/lib/level/RocketSurveyFacade.ts`

- [ ] **Step 1: Implement `findClosestRock`**

In `src/lib/level/RocketSurveyFacade.ts`, replace the placeholder `findClosestRock` with:

```ts
  /**
   * Find the closest still-mineable rock with the given itemId to the
   * rocket's world position. Returns `null` when no candidate exists.
   */
  private findClosestRock(itemId: string): { spawnIndex: number } | null {
    const candidates = this.deps.rockYieldSystem.findActiveRocksByItemId(itemId)
    if (candidates.length === 0) return null

    const rocketPos = this._scratchRocketPos
    this.deps.gather.rocketGroup.getWorldPosition(rocketPos)
    const candidateCenter = this._scratchCandidate

    let bestSpawnIndex = -1
    let bestDistSq = Number.POSITIVE_INFINITY
    for (const spawnIndex of candidates) {
      const center = this.deps.surfaceRocks.getRockCenter(
        spawnIndex,
        this.deps.heightmap,
        candidateCenter,
      )
      if (!center) continue
      const dx = center.x - rocketPos.x
      const dy = center.y - rocketPos.y
      const dz = center.z - rocketPos.z
      const distSq = dx * dx + dy * dy + dz * dz
      if (distSq < bestDistSq) {
        bestDistSq = distSq
        bestSpawnIndex = spawnIndex
      }
    }
    return bestSpawnIndex >= 0 ? { spawnIndex: bestSpawnIndex } : null
  }
```

Add the supporting scratch vectors near the existing `_scratchCenter` field:

```ts
  private readonly _scratchRocketPos = new THREE.Vector3()
  private readonly _scratchCandidate = new THREE.Vector3()
  private readonly _impactVel = new THREE.Vector3()
```

- [ ] **Step 2: Implement `onBoltHit`**

Replace the placeholder `onBoltHit` body with:

```ts
  /**
   * Each science-bolt impact on the rocket. Drives the per-hit flash,
   * impact sparks, and (on the reveal step) the marker placement +
   * toast + audio.
   */
  private onBoltHit(impactPos: THREE.Vector3): void {
    // Per-hit chip burst for tactile feedback.
    this._impactVel.set(
      (Math.random() - 0.5) * SURVEY_IMPACT_LATERAL_SPEED,
      SURVEY_IMPACT_VERTICAL_SPEED + Math.random(),
      (Math.random() - 0.5) * SURVEY_IMPACT_LATERAL_SPEED,
    )
    for (let i = 0; i < SURVEY_IMPACT_PARTICLES; i++) {
      this.deps.impactEmitter.emit(impactPos, this._impactVel)
    }

    const result = this.state.scienceHit()
    if (result === null) return

    // Always flash on a hit, even if the bolt didn't advance state.
    if (result.justRevealed) {
      this.deps.gather.rocketGroup.userData['__rocketModel']?.flash?.(
        ROCKET_SURVEY_FLASH_REVEAL_DURATION,
      )
    } else {
      this.deps.gather.rocketGroup.userData['__rocketModel']?.flash?.(
        ROCKET_SURVEY_FLASH_HIT_DURATION,
      )
    }

    if (!result.justRevealed) return
    if (result.targetItemId === null || result.targetSpawnIndex === null) return

    // Place the surface waypoint at the rock.
    const rockCenter = this.deps.surfaceRocks.getRockCenter(
      result.targetSpawnIndex,
      this.deps.heightmap,
      this._scratchCenter,
    )
    if (!rockCenter) return
    const groundY = this.deps.heightmap.heightAt(rockCenter.x, rockCenter.z)
    addWaypointMarker(
      `rocket-survey-${result.targetSpawnIndex}`,
      rockCenter.x,
      rockCenter.z,
      groundY,
      this.deps.scene,
      ROCKET_SURVEY_MARKER_COLOR,
    )
    this.activeMarkerSpawnIndex = result.targetSpawnIndex
    this.activeMarkerItemId = result.targetItemId

    // Toast + audio.
    this.bindings.onSurvey(ROCKET_SURVEY_TOAST_LABEL)
    const rocketPos = this._scratchRocketPos
    this.deps.gather.rocketGroup.getWorldPosition(rocketPos)
    this.deps.levelAudio.notifySurveyReveal(rocketPos, this.deps.fpsCamera.camera)
  }
```

The `userData['__rocketModel']` lookup is a small handle the gather minigame attaches in Task 14 (so the facade can call `flash()` without holding a `DepositRocketModel` reference type-imported from `@/three/...` — which would create a circular-import nuisance through the `lib/level` boundary). The fallback `?.flash?.()` is safe if the handle is missing.

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`
Expected: no errors. (The `__rocketModel` handle is added in Task 14; the optional chain guards against absence.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/level/RocketSurveyFacade.ts
git commit -m "feat(level): rocket-survey reveal flow + closest-rock pick"
```

---

## Task 14: Attach `__rocketModel` handle in `GatherMinigame`

**Files:**
- Modify: `src/lib/minigame/GatherMinigame.ts`

The facade calls `rocketGroup.userData['__rocketModel'].flash()`. To make that work without a `lib → three` import chain, the gather minigame stamps a flash handle onto the rocket group's userData at construction.

- [ ] **Step 1: Stamp `userData['__rocketModel']`**

In `src/lib/minigame/GatherMinigame.ts`, find the `this.rocket = new DepositRocketModel(...)` line in the constructor. Just below it (and above the `groundY` calculation), add:

```ts
    this.rocket.group.userData['__rocketModel'] = this.rocket
```

This exposes the `flash()` method to the facade through the group userData without dragging the DepositRocketModel type across the lib boundary.

- [ ] **Step 2: Run type-check + tests**

Run: `bun run type-check && bun test:unit`
Expected: no errors; all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/minigame/GatherMinigame.ts
git commit -m "feat(gather): expose rocket model flash via userData handle"
```

---

## Task 15: Wire `RocketSurveyFacade` into `LevelViewController`

**Files:**
- Modify: `src/views/LevelViewController.ts`

We instantiate the facade for any active gather minigame and tear it down on level exit. **No business logic added to `LevelViewController`** — it is wiring only.

- [ ] **Step 1: Add the import**

Find the existing imports (around line 97 — `import { LevelCombatMiningFacade } ...`). Add immediately below:

```ts
import { RocketSurveyFacade } from '@/lib/level/RocketSurveyFacade'
```

- [ ] **Step 2: Add the field**

Find the `private combatMining: LevelCombatMiningFacade | null = null` field (around line 209). Add immediately below:

```ts
  private rocketSurvey: RocketSurveyFacade | null = null
```

- [ ] **Step 3: Add the public binding**

Find `onProspect: ((itemId: string) => void) | null = null` (around line 306). Add immediately below:

```ts
  /** Called when the rocket-survey scan reveals a marker. Host shows the survey toast. */
  onSurvey: ((label: string) => void) | null = null
```

- [ ] **Step 4: Instantiate after the minigame init step**

After `await this.minigames.initializeObjectives({ ... })` completes (around line 871-end), search for the next code block (probably the `this.tickHandler.register(this.minigames, ...)` line). Just before that, add a hook that finds the gather minigame and instantiates the facade:

```ts
    // ── Rocket-survey hidden utility for gather missions ─────────
    if (this.surfaceRocks && this.heightmap && this.fpsCamera && this.rockYieldSystem) {
      const gatherMinigame = mission.objectives
        .map((_, idx) => this.getMinigame(idx))
        .find((mg): mg is GatherMinigame => mg instanceof GatherMinigame)
      if (gatherMinigame) {
        this.rocketSurvey = new RocketSurveyFacade(
          {
            scene: this.sceneManager.scene,
            projectileSystem: this.projectileSystem,
            rockYieldSystem: this.rockYieldSystem,
            surfaceRocks: this.surfaceRocks,
            heightmap: this.heightmap,
            impactEmitter: this.impactEmitter,
            fpsCamera: this.fpsCamera,
            levelAudio: this.levelAudio,
            gather: gatherMinigame,
          },
          {
            onSurvey: (label) => this.onSurvey?.(label),
          },
        )
        this.rocketSurvey.attach()
      }
    }
```

Add the `GatherMinigame` import to the top of the file alongside the other minigame imports (search for `GatherMinigame` — it might already be imported by another path; if not, add):

```ts
import { GatherMinigame } from '@/lib/minigame/GatherMinigame'
```

`this.getMinigame(idx)` is the existing public method on `LevelViewController` that returns the minigame for a given objective index (verify the exact name in the file — at the time of writing it is `getMinigame`).

- [ ] **Step 5: Tear down in dispose**

Find the dispose block where `combatMining?.detach()` runs (around line 2504). Add immediately below:

```ts
    this.rocketSurvey?.detach()
    this.rocketSurvey = null
```

- [ ] **Step 6: Run type-check + tests**

Run: `bun run type-check && bun test:unit`
Expected: no errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/views/LevelViewController.ts
git commit -m "feat(level): wire RocketSurveyFacade in LevelViewController"
```

---

## Task 16: Survey toast in `PickupToast.vue`

**Files:**
- Modify: `src/components/PickupToast.vue`

- [ ] **Step 1: Extend the type and props**

In `src/components/PickupToast.vue`, just below the existing `ProspectEntry` interface, add:

```ts
/** A survey-reveal entry shown alongside mineral pickups and prospect completes. */
export interface SurveyEntry {
  /** Stable v-for key. */
  id: string
  /** Display label — vague RP-flavored text. */
  label: string
}
```

Update `defineProps`:

```ts
const props = defineProps<{
  /** Active mineral pickups, oldest first. */
  pickups: readonly PickupEntry[]
  /** Active prospect-complete entries, oldest first. */
  prospectEntries?: readonly ProspectEntry[]
  /** Active survey-reveal entries, oldest first. */
  surveyEntries?: readonly SurveyEntry[]
  /** Optional max number of toasts to render simultaneously. */
  maxVisible?: number
}>()
```

Add a `visibleSurveys` computed mirroring `visibleProspects`:

```ts
const visibleSurveys = computed(() => {
  const list = props.surveyEntries ?? []
  const max = props.maxVisible ?? 5
  if (list.length <= max) return list
  return list.slice(list.length - max)
})
```

- [ ] **Step 2: Render the survey entries**

Inside the existing `<transition-group>` in the template, after the `v-for="entry in visibleProspects"` block, add:

```vue
      <div
        v-for="entry in visibleSurveys"
        :key="entry.id"
        class="pickup-toast__entry pickup-toast__entry--survey"
      >
        <span class="pickup-toast__check">▲</span>
        <span class="pickup-toast__survey-label">{{ entry.label }}</span>
      </div>
```

- [ ] **Step 3: Add the survey style block**

Find the existing `.pickup-toast__entry--prospect` rule in the `<style>` block. Add a sibling rule immediately below:

```css
.pickup-toast__entry--survey {
  color: rgba(34, 197, 94, 0.95);
  border-color: rgba(34, 197, 94, 0.55);
  background: rgba(2, 32, 14, 0.62);
  box-shadow:
    0 0 14px rgba(34, 197, 94, 0.22),
    inset 0 0 8px rgba(34, 197, 94, 0.08);
}
.pickup-toast__survey-label {
  color: rgba(34, 197, 94, 0.95);
  letter-spacing: 0.18em;
}
```

- [ ] **Step 4: Run type-check + tests**

Run: `bun run type-check && bun test:unit`
Expected: no errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/PickupToast.vue
git commit -m "feat(hud): survey-reveal toast variant in PickupToast stack"
```

---

## Task 17: Wire `surveyEntries` in `LevelView.vue`

**Files:**
- Modify: `src/views/LevelView.vue`

- [ ] **Step 1: Import the new type**

In `src/views/LevelView.vue`, find the existing `ProspectEntry` import. Update it to include `SurveyEntry`:

```ts
import type { PickupEntry, ProspectEntry, SurveyEntry } from '@/components/PickupToast.vue'
```

- [ ] **Step 2: Add the survey state and recorder**

Just below the existing `prospectEntries` block (the one ending with `prospectTimers.set(entry.id, handle)`), add:

```ts
const surveyEntries = ref<SurveyEntry[]>([])
const SURVEY_TOAST_LIFETIME_SEC = 5.0
const surveyTimers = new Map<string, ReturnType<typeof Timer.after>>()
let surveySeq = 0

/**
 * Push a survey-reveal entry that auto-removes after
 * {@link SURVEY_TOAST_LIFETIME_SEC}. Each call gets its own timer so
 * back-to-back reveals don't clobber each other.
 */
function recordSurvey(label: string): void {
  surveySeq += 1
  const entry: SurveyEntry = { id: `survey-${surveySeq}`, label }
  surveyEntries.value.push(entry)
  const handle = Timer.after(SURVEY_TOAST_LIFETIME_SEC, () => {
    const idx = surveyEntries.value.findIndex((p) => p.id === entry.id)
    if (idx >= 0) surveyEntries.value.splice(idx, 1)
    surveyTimers.delete(entry.id)
  })
  surveyTimers.set(entry.id, handle)
}
```

- [ ] **Step 3: Extend `clearPickups` to reset surveys**

Find the existing `clearPickups` body. Add the survey clear block alongside the prospect clear:

```ts
function clearPickups(): void {
  for (const { handle } of pickupTimers.values()) Timer.cancel(handle)
  pickupTimers.clear()
  pickups.value = []
  for (const handle of prospectTimers.values()) Timer.cancel(handle)
  prospectTimers.clear()
  prospectEntries.value = []
  for (const handle of surveyTimers.values()) Timer.cancel(handle)
  surveyTimers.clear()
  surveyEntries.value = []
  for (const handle of pickupFailedTimers) Timer.cancel(handle)
  pickupFailedTimers.clear()
  pickupFailed.value = null
}
```

- [ ] **Step 4: Wire the view-controller callback**

Find the existing `viewController.onProspect = ...` handler (around line 323). Add immediately below:

```ts
    viewController.onSurvey = (label) => {
      recordSurvey(label)
    }
```

- [ ] **Step 5: Pass the new array to `<PickupToast>`**

Find the existing `<PickupToast :pickups="pickups" :prospect-entries="prospectEntries" />` usage. Replace with:

```vue
        <PickupToast
          :pickups="pickups"
          :prospect-entries="prospectEntries"
          :survey-entries="surveyEntries"
        />
```

- [ ] **Step 6: Run type-check + tests**

Run: `bun run type-check && bun test:unit`
Expected: no errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/views/LevelView.vue
git commit -m "feat(hud): wire survey toast in LevelView"
```

---

## Task 18: Lint, full test, and manual smoke

**Files:**
- (no edits expected — merge gate)

- [ ] **Step 1: Run the full lint pass**

Run: `bun lint`
Expected: oxlint **0 errors**, ESLint **0 errors / 0 warnings**. Fix any TSDoc gaps inline (every new exported function/class/interface needs a TSDoc block per project rules; the plan above includes them but verify nothing was missed during integration).

- [ ] **Step 2: Run the full unit test pass**

Run: `bun test:unit`
Expected: all tests pass.

- [ ] **Step 3: Run the type-check**

Run: `bun run type-check`
Expected: no errors.

- [ ] **Step 4: Manual smoke test**

Run: `bun dev`

Walk through:
1. Open `/level` for a gather mission with at least 2 required minerals (any belt/asteroid mission with `gather` objective and difficulty >= 5).
2. Drop into EVA. Confirm the delivery rocket is rendered as usual.
3. Switch to SCI mode on the multitool.
4. Aim at the rocket and fire — confirm:
   - The rocket's screen flashes green per hit (not the lander hull, not nothing).
   - Per-hit chip-burst sparks at the impact point.
5. Continue firing. Around the 8th hit, confirm:
   - A green waypoint beam appears on top of a nearby rock.
   - The toast "DEPOSIT SIGNATURE LOCATED" appears in the right-stack.
   - An analytical-beep plays.
6. Drill the marked rock to depletion. Confirm the green beam disappears the moment the rock depletes.
7. Re-scan the rocket. Confirm a new beam appears (either on another rock for the same mineral if the quota isn't met, or on a rock for the next still-needed mineral).
8. Once **all** quotas are filled (drill enough to satisfy all required minerals) but the deposit hasn't happened, confirm SCI hits on the rocket no longer place markers (state goes to `exhausted`).
9. Press E at the rocket to deposit. Mission completes; rocket takes off as usual.

If anything misbehaves, reopen the relevant task and fix; do not paper over.

- [ ] **Step 5: Final commit if anything was tweaked during smoke; otherwise skip**

```bash
git add -A
git commit -m "chore(rocket-survey): smoke-test polish"
```

---

## Self-Review Checklist (run by author before handoff)

- [ ] Every spec section has a task: tunables (T1), state machine (T2-T5), rock-iterator helper (T6), waypoint color (T7), rocket flash (T8), audio cue (T9), bolt routing (T10), gather accessors + flash handle (T11, T14), facade (T12-T13), level-controller wiring (T15), HUD (T16-T17), lint + verify (T18).
- [ ] No placeholders, TBDs, or "implement later" steps. Each step shows exact code or exact commands.
- [ ] Type/property names consistent across tasks: `RocketSurveyState`, `RocketSurveyFacade`, `RocketSurveyPhase`, `SurveyQuotaSnapshot`, `ScienceHitResult`, `notifyMarkerConsumed`, `setSurveyTarget`, `onScienceRocketHit`, `onSurvey`, `surveyEntries`, `SurveyEntry`, `recordSurvey`, `findActiveRocksByItemId`, `flash`.
- [ ] TDD for the pure-TS state machine (T2-T5). Three.js / Vue layers verified via type-check + manual smoke per CLAUDE.md.
- [ ] Frequent commits — one per task.
- [ ] State machine matches the actual `GatherMinigame` data model (uses `minedKg < targetKg`, no `deliveredKg`).
