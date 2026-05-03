# Mission Tip Budget & Priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap each runtime visor tip at two completed missions before it stops appearing, persist the show-count only on mission completion (mid-mission refresh re-fires), and make runtime tips outrank objective/first-run tips in the visible visor stack.

**Architecture:** Add a per-id show-count map to `PlayerAchievementStats` plus a recorder that runs at mission completion. Gate `pushRuntimeMissionTip` on the persisted count. Reuse the existing `runtime:*` id prefix already produced by `resolveRuntimeMissionTipTransmission` to drive priority sorting in `getVisibleMissionTipsForView` — no `MissionTipTransmission` schema change required.

**Tech Stack:** TypeScript, Vue 3, Vitest, Pinia, localStorage (existing player profile).

**Out of scope:** Authoring new combat/rescue runtime tips. The existing runtime tip set (`oxygenLow`, `rtgLow`, `drillWalking`, `gatherRocketScience`, `landerDescentWarning`, `landerAttitudeWarning`, `landerGroundBoost`, `landerObjectiveExfil`, `landerHullRepair`) is the full set governed by this budget.

---

## File Structure

**Create:** none.

**Modify:**
- `src/lib/player/types.ts` — add `runtimeTipsShownCount` to `PlayerAchievementStats`.
- `src/lib/player/profile.ts` — default/normalize the new field, add `recordRuntimeTipsShown` mutator.
- `src/lib/level/missionTips.ts` — add `MISSION_TIP_RUNTIME_SHOW_LIMIT` and `isRuntimeTipShowable` helpers.
- `src/lib/level/missionTipQueue.ts` — sort runtime ids (`runtime:*`) ahead of others in `getVisibleMissionTipsForView`.
- `src/views/LevelView.vue` — gate `pushRuntimeMissionTip` on the budget; flush dispatched ids to profile in `onMissionComplete`.

**Tests:**
- `src/lib/player/__tests__/profile.spec.ts` — extend with cases for the new field + recorder.
- `src/lib/level/__tests__/missionTips.spec.ts` — extend with cases for `isRuntimeTipShowable`.
- `src/lib/level/__tests__/missionTipQueue.spec.ts` — extend with priority-ordering cases.

---

## Task 1: Persisted runtime tip show counts on profile

**Files:**
- Modify: `src/lib/player/types.ts:18-41`
- Modify: `src/lib/player/profile.ts:84-138`
- Test: `src/lib/player/__tests__/profile.spec.ts`

- [ ] **Step 1: Write the failing test for the default field**

Append to `src/lib/player/__tests__/profile.spec.ts`:

```ts
describe('runtimeTipsShownCount field', () => {
  it('defaults to an empty map on a fresh profile', () => {
    const profile = createProfile('Pilot')
    expect(profile.achievementStats.runtimeTipsShownCount).toEqual({})
  })

  it('seeds an empty map when loading legacy stats without the field', () => {
    localStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({
        name: 'Pilot',
        credits: 0,
        achievementStats: { lifetimeCreditsEarned: 0 },
      }),
    )
    const loaded = loadProfile()
    expect(loaded?.achievementStats.runtimeTipsShownCount).toEqual({})
  })

  it('round-trips show counts through save/load', () => {
    const profile = {
      ...createProfile('Pilot'),
      achievementStats: {
        ...createProfile('Pilot').achievementStats,
        runtimeTipsShownCount: { oxygenLow: 1, drillWalking: 2 },
      },
    }
    saveProfile(profile)
    const loaded = loadProfile()
    expect(loaded?.achievementStats.runtimeTipsShownCount).toEqual({
      oxygenLow: 1,
      drillWalking: 2,
    })
  })
})
```

The existing test file already imports `createProfile`, `loadProfile`, `saveProfile`, and `PROFILE_STORAGE_KEY` from earlier suites — confirm those imports are present (they are; see existing `describe('credits')`).

- [ ] **Step 2: Run the test to confirm it fails**

Run: `bun test:unit src/lib/player/__tests__/profile.spec.ts -t "runtimeTipsShownCount"`
Expected: FAIL with `runtimeTipsShownCount` undefined / not a property of stats.

- [ ] **Step 3: Add the field to the type**

In `src/lib/player/types.ts`, inside `interface PlayerAchievementStats` (after `missionObjectivesCompletedByType`), insert:

```ts
  /**
   * Runtime mission-tip id → number of completed missions in which this tip was shown,
   * for example `{ oxygenLow: 1 }` after one completed mission where O2 dipped below half.
   * Used to retire each runtime tip after a fixed completed-mission budget.
   */
  runtimeTipsShownCount: Record<string, number>
```

- [ ] **Step 4: Default and normalize the field on profile load**

In `src/lib/player/profile.ts`:

1. In `createDefaultAchievementStats()` (around line 85), add the field:

```ts
    missionObjectivesCompletedByType: {},
    runtimeTipsShownCount: {},
    slingshotLaunches: 0,
```

2. In `normalizeAchievementStats(raw)` (around line 121), add a normalization line alongside the existing `missionObjectivesCompletedByType` line:

```ts
    missionObjectivesCompletedByType: normalizeNumericMap(
      stats['missionObjectivesCompletedByType'],
    ),
    runtimeTipsShownCount: normalizeNumericMap(stats['runtimeTipsShownCount']),
    slingshotLaunches:
```

`normalizeNumericMap` already drops malformed values and returns `{}` for missing input — no new helper needed.

- [ ] **Step 5: Run the test to confirm it passes**

Run: `bun test:unit src/lib/player/__tests__/profile.spec.ts -t "runtimeTipsShownCount"`
Expected: PASS.

- [ ] **Step 6: Run the whole profile suite to confirm no regressions**

Run: `bun test:unit src/lib/player/__tests__/profile.spec.ts`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/player/types.ts src/lib/player/profile.ts src/lib/player/__tests__/profile.spec.ts
git commit -m "feat(profile): track per-id runtime tip show counts"
```

---

## Task 2: Recorder — `recordRuntimeTipsShown`

**Files:**
- Modify: `src/lib/player/profile.ts` (append after `recordMissionObjectiveComplete`, around line 645)
- Test: `src/lib/player/__tests__/profile.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/player/__tests__/profile.spec.ts`:

```ts
describe('recordRuntimeTipsShown', () => {
  it('increments each id by one', () => {
    const profile = createProfile('Pilot')
    const updated = recordRuntimeTipsShown(profile, ['oxygenLow', 'drillWalking'])
    expect(updated.achievementStats.runtimeTipsShownCount).toEqual({
      oxygenLow: 1,
      drillWalking: 1,
    })
  })

  it('accumulates across calls', () => {
    let profile = createProfile('Pilot')
    profile = recordRuntimeTipsShown(profile, ['oxygenLow'])
    profile = recordRuntimeTipsShown(profile, ['oxygenLow', 'rtgLow'])
    expect(profile.achievementStats.runtimeTipsShownCount).toEqual({
      oxygenLow: 2,
      rtgLow: 1,
    })
  })

  it('returns the same profile reference when ids is empty', () => {
    const profile = createProfile('Pilot')
    expect(recordRuntimeTipsShown(profile, [])).toBe(profile)
  })

  it('skips blank or non-string ids', () => {
    const profile = createProfile('Pilot')
    const updated = recordRuntimeTipsShown(profile, ['', '  '])
    expect(updated.achievementStats.runtimeTipsShownCount).toEqual({})
  })
})
```

Add `recordRuntimeTipsShown` to the existing import block at the top of the file.

- [ ] **Step 2: Run tests to confirm they fail**

Run: `bun test:unit src/lib/player/__tests__/profile.spec.ts -t "recordRuntimeTipsShown"`
Expected: FAIL — `recordRuntimeTipsShown` is not exported.

- [ ] **Step 3: Implement the recorder**

In `src/lib/player/profile.ts`, after `recordMissionObjectiveComplete` (around line 645), add:

```ts
/**
 * Record a batch of runtime mission-tip ids that fired during one completed mission.
 * Each id increments the tip's lifetime show count; blank ids are ignored.
 *
 * @param profile - Current profile.
 * @param ids - Runtime tip ids dispatched in the just-completed mission.
 * @returns Updated profile, or the same profile when nothing valid was passed.
 */
export function recordRuntimeTipsShown(
  profile: PlayerProfile,
  ids: readonly string[],
): PlayerProfile {
  const valid = ids.filter((id) => typeof id === 'string' && id.trim().length > 0)
  if (valid.length === 0) return profile
  const achievementStats = getAchievementStats(profile)
  let runtimeTipsShownCount = achievementStats.runtimeTipsShownCount
  for (const id of valid) {
    runtimeTipsShownCount = incrementCountMap(runtimeTipsShownCount, id)
  }
  return {
    ...profile,
    achievementStats: {
      ...achievementStats,
      runtimeTipsShownCount,
    },
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `bun test:unit src/lib/player/__tests__/profile.spec.ts -t "recordRuntimeTipsShown"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/player/profile.ts src/lib/player/__tests__/profile.spec.ts
git commit -m "feat(profile): add recordRuntimeTipsShown mutator"
```

---

## Task 3: `isRuntimeTipShowable` helper + budget constant

**Files:**
- Modify: `src/lib/level/missionTips.ts` (add at the bottom)
- Test: `src/lib/level/__tests__/missionTips.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/level/__tests__/missionTips.spec.ts`:

```ts
describe('isRuntimeTipShowable', () => {
  function profileWithCounts(counts: Record<string, number>): PlayerProfile {
    return {
      ...basePlayerProfile(),
      achievementStats: {
        ...basePlayerProfile().achievementStats,
        runtimeTipsShownCount: counts,
      },
    }
  }

  it('allows a tip with no recorded shows', () => {
    expect(isRuntimeTipShowable(profileWithCounts({}), 'oxygenLow')).toBe(true)
  })

  it('allows a tip below the limit', () => {
    expect(
      isRuntimeTipShowable(profileWithCounts({ oxygenLow: 1 }), 'oxygenLow'),
    ).toBe(true)
  })

  it('blocks a tip that has reached the limit', () => {
    expect(
      isRuntimeTipShowable(
        profileWithCounts({ oxygenLow: MISSION_TIP_RUNTIME_SHOW_LIMIT }),
        'oxygenLow',
      ),
    ).toBe(false)
  })

  it('treats a null profile as showable (fresh save)', () => {
    expect(isRuntimeTipShowable(null, 'oxygenLow')).toBe(true)
  })
})
```

If `basePlayerProfile()` is not already a helper in this spec file, inline a minimal builder for the test fixture (use `createProfile('Pilot')` from `@/lib/player/profile`). Add `MISSION_TIP_RUNTIME_SHOW_LIMIT`, `isRuntimeTipShowable`, and `PlayerProfile` to the imports.

- [ ] **Step 2: Run tests to confirm they fail**

Run: `bun test:unit src/lib/level/__tests__/missionTips.spec.ts -t "isRuntimeTipShowable"`
Expected: FAIL — exports not found.

- [ ] **Step 3: Implement the helper**

Append to `src/lib/level/missionTips.ts`:

```ts
/** Maximum number of completed missions that may show the same runtime tip before it retires. */
export const MISSION_TIP_RUNTIME_SHOW_LIMIT = 2

/**
 * Check if a runtime tip can still be shown given persisted profile counts.
 *
 * @param profile - Current player profile, or `null` for a fresh save.
 * @param id - Runtime tip id, for example `oxygenLow`.
 * @returns True when the tip has appeared in fewer than the budget of completed missions.
 */
export function isRuntimeTipShowable(profile: PlayerProfile | null, id: string): boolean {
  const shown = profile?.achievementStats.runtimeTipsShownCount[id] ?? 0
  return shown < MISSION_TIP_RUNTIME_SHOW_LIMIT
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `bun test:unit src/lib/level/__tests__/missionTips.spec.ts -t "isRuntimeTipShowable"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/level/missionTips.ts src/lib/level/__tests__/missionTips.spec.ts
git commit -m "feat(level): add runtime tip show-budget helper"
```

---

## Task 4: Sort runtime ids ahead of mission tips in the visor queue

**Files:**
- Modify: `src/lib/level/missionTipQueue.ts:42-64`
- Test: `src/lib/level/__tests__/missionTipQueue.spec.ts`

The runtime resolver already prefixes ids with `runtime:` (`missionTips.ts:166`). Objective tips use `objective:<type>` and the lander first-run uses `first-run-lander`. We sort `runtime:*` first inside the existing visible window without changing the canonical insertion order (which the dedupe / dismiss logic depends on).

- [ ] **Step 1: Write failing tests**

Append to `src/lib/level/__tests__/missionTipQueue.spec.ts`:

```ts
describe('priority ordering', () => {
  function tipWith(id: string, view: MissionTipView = 'fps'): MissionTipTransmission {
    return {
      id,
      speaker: 'Test',
      channel: 'TEST',
      view,
      tone: 'mining',
      message: '...',
      objectiveType: 'gather',
    }
  }

  it('places runtime ids ahead of objective ids in the visible window', () => {
    const queue = [tipWith('objective:gather'), tipWith('runtime:landerHullRepair')]
    const visible = getVisibleMissionTipsForView(queue, 'fps')
    expect(visible.map((t) => t.id)).toEqual(['runtime:landerHullRepair', 'objective:gather'])
  })

  it('places runtime ids ahead of the first-run lander tip', () => {
    const queue = [tipWith('first-run-lander', 'lander'), tipWith('runtime:landerDescentWarning', 'lander')]
    const visible = getVisibleMissionTipsForView(queue, 'lander')
    expect(visible[0]?.id).toBe('runtime:landerDescentWarning')
  })

  it('preserves insertion order among runtime ids', () => {
    const queue = [tipWith('runtime:oxygenLow'), tipWith('runtime:rtgLow')]
    const visible = getVisibleMissionTipsForView(queue, 'fps')
    expect(visible.map((t) => t.id)).toEqual(['runtime:oxygenLow', 'runtime:rtgLow'])
  })

  it('preserves insertion order among non-runtime ids', () => {
    const queue = [tipWith('objective:gather'), tipWith('first-run-lander', 'fps')]
    const visible = getVisibleMissionTipsForView(queue, 'fps')
    expect(visible.map((t) => t.id)).toEqual(['objective:gather', 'first-run-lander'])
  })
})
```

Ensure `MissionTipTransmission` and `MissionTipView` are imported in this spec file (they likely already are — check the top of the existing file).

- [ ] **Step 2: Run tests to confirm they fail**

Run: `bun test:unit src/lib/level/__tests__/missionTipQueue.spec.ts -t "priority ordering"`
Expected: FAIL — current `getVisibleMissionTipsForView` returns insertion order, so the runtime tip stays in slot 2.

- [ ] **Step 3: Implement priority sort**

Replace `getVisibleMissionTipsForView` in `src/lib/level/missionTipQueue.ts` with:

```ts
/** Prefix used by the runtime resolver to mark reactive guidance ids. */
const RUNTIME_TIP_ID_PREFIX = 'runtime:'

/**
 * Return whether a transmission id was produced by the runtime resolver.
 *
 * @param id - Tip id, for example `runtime:oxygenLow` or `objective:gather`.
 * @returns True when the id starts with the runtime prefix.
 */
function isRuntimeTipId(id: string): boolean {
  return id.startsWith(RUNTIME_TIP_ID_PREFIX)
}

/**
 * Return visible transmissions for the current gameplay view, with runtime tips
 * promoted ahead of objective/first-run tips so reactive guidance always wins
 * the top slot. Order is otherwise stable (insertion order within each tier).
 *
 * @param queue - Full queue ordered oldest to newest.
 * @param view - Current gameplay view, for example `fps` during EVA.
 * @returns At most two visible transmissions matching the current view.
 */
export function getVisibleMissionTipsForView(
  queue: readonly MissionTipTransmission[],
  view: MissionTipView,
): MissionTipTransmission[] {
  const matching = queue.filter((entry) => entry.view === view)
  const runtimeTips = matching.filter((entry) => isRuntimeTipId(entry.id))
  const otherTips = matching.filter((entry) => !isRuntimeTipId(entry.id))
  return [...runtimeTips, ...otherTips].slice(0, MISSION_TIP_VISIBLE_COUNT)
}
```

`getVisibleMissionTips` (the unfiltered helper) should keep insertion order — it is used only in tests and for dismiss accounting; do not modify it.

- [ ] **Step 4: Run tests to confirm they pass**

Run: `bun test:unit src/lib/level/__tests__/missionTipQueue.spec.ts`
Expected: PASS, including the existing FIFO/dedupe cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/level/missionTipQueue.ts src/lib/level/__tests__/missionTipQueue.spec.ts
git commit -m "feat(level): runtime tips outrank objective tips in visor"
```

---

## Task 5: Wire the show-count gate into LevelView

**Files:**
- Modify: `src/views/LevelView.vue:43, 405-417`

- [ ] **Step 1: Add the helper to the import block**

Find the existing import block from `@/lib/level/missionTips` near the top of the `<script setup>` block (currently around lines 36-47) and add `isRuntimeTipShowable`:

```ts
import {
  getMissionTipObjectiveType,
  isRuntimeTipShowable,
  resolveFirstRunLanderTipTransmission,
  resolveMissionTipTransmission,
  resolveRuntimeMissionTipTransmission,
  // ...existing imports preserved
} from '@/lib/level/missionTips'
```

- [ ] **Step 2: Gate `pushRuntimeMissionTip` on the persisted budget**

In `src/views/LevelView.vue`, replace the existing `pushRuntimeMissionTip` (currently lines 405-417) with:

```ts
function pushRuntimeMissionTip(id: string): void {
  if (dispatchedRuntimeTipIds.has(id)) return
  if (!isRuntimeTipShowable(loadProfile(), id)) return
  const objectiveType = activeMissionObjectiveType.value
  if (!objectiveType) return
  const tip = resolveRuntimeMissionTipTransmission(id, objectiveType)
  if (!tip) return

  dispatchedRuntimeTipIds.add(id)
  if (id === 'gatherRocketScience') {
    missionTipQueue.value = removeMissionTipQueueEntry(missionTipQueue.value, 'objective:gather')
  }
  pushMissionTip(tip)
}
```

`loadProfile` is already imported in this file (verify by searching `loadProfile` in `LevelView.vue`); if not, add it to the existing `@/lib/player/profile` import block.

- [ ] **Step 3: Type-check and lint**

Run: `bun run type-check && bun lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Run unit tests**

Run: `bun test:unit`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/views/LevelView.vue
git commit -m "feat(level): gate runtime tips on persisted show budget"
```

---

## Task 6: Persist dispatched ids on mission completion

**Files:**
- Modify: `src/views/LevelView.vue:680-682`

- [ ] **Step 1: Add `recordRuntimeTipsShown` to the player profile import**

Locate the existing `import { ... } from '@/lib/player/profile'` block in `LevelView.vue` and add `recordRuntimeTipsShown` and `saveProfile`:

```ts
import {
  loadProfile,
  recordRuntimeTipsShown,
  saveProfile,
  // ...existing imports preserved
} from '@/lib/player/profile'
```

- [ ] **Step 2: Flush the dispatched set in `onMissionComplete`**

Replace the existing `onMissionComplete` handler (currently lines 680-682):

```ts
viewController.onMissionComplete = () => {
  missionCompleteVisible.value = true
}
```

with:

```ts
viewController.onMissionComplete = () => {
  if (dispatchedRuntimeTipIds.size > 0) {
    const existing = loadProfile()
    if (existing !== null) {
      saveProfile(recordRuntimeTipsShown(existing, [...dispatchedRuntimeTipIds]))
    }
  }
  missionCompleteVisible.value = true
}
```

`persistCompletedAsteroidMissionRewards` runs from `LevelViewController.enterComplete` *before* this callback fires (see `LevelViewController.ts:2300`), so `loadProfile()` here observes the post-reward state and our increment is layered on top.

- [ ] **Step 3: Type-check, lint, and run unit tests**

Run: `bun run type-check && bun lint && bun test:unit`
Expected: 0 errors, 0 warnings, all tests pass.

- [ ] **Step 4: Manual smoke test**

Run: `bun dev`

In the browser, start a mining mission:

1. Trigger an oxygen-low tip (let O2 fall under 50%) and a drill-walking tip (try to fire DRL while moving).
2. Refresh the page mid-mission — both tips should fire again on the next eligible state.
3. Complete the mission.
4. Start a second mining mission, repeat both triggers — they should fire again (count is now `1`, still under the limit of `2`).
5. Complete that mission too. Start a third mining mission and trigger both conditions — neither tip should appear.

Note any deviation; if found, debug before committing.

- [ ] **Step 5: Commit**

```bash
git add src/views/LevelView.vue
git commit -m "feat(level): persist runtime tip show counts on mission complete"
```

---

## Task 7: Wrap-up and acceptance gate

- [ ] **Step 1: Run the merge gate**

Run: `bun run type-check && bun lint && bun test:unit`
Expected: TypeScript 0 errors; oxlint 0 errors; ESLint 0 errors / 0 warnings; all Vitest specs green.

- [ ] **Step 2: Confirm acceptance criteria**

Verify by inspection that:

- `PlayerAchievementStats.runtimeTipsShownCount` defaults to `{}` on fresh and legacy saves.
- `recordRuntimeTipsShown` is called only from `LevelView.vue#onMissionComplete`, with the dispatched-set contents as input.
- `pushRuntimeMissionTip` skips when `isRuntimeTipShowable` returns false.
- `getVisibleMissionTipsForView` places `runtime:*` ids ahead of others.
- No code path increments `runtimeTipsShownCount` outside mission completion (so a refresh mid-mission does not burn budget).

- [ ] **Step 3: Final commit gate**

If any cleanup edits were needed during Step 2, commit them with `chore(level): post-review tidy for mission tip budget`. Otherwise this task closes the plan.

---

## Self-review notes

- **Spec coverage:** show-count budget (Tasks 1-3, 5), persist-only-on-completion (Task 6), runtime priority (Task 4). All three explicit requirements covered.
- **Type consistency:** `runtimeTipsShownCount: Record<string, number>` is named identically across `types.ts`, `profile.ts`, the recorder, and `isRuntimeTipShowable`. Tip ids passed through `dispatchedRuntimeTipIds` are bare ids (e.g. `oxygenLow`), matching the keys used by `MISSION_TIPS.runtimeTips` and the persisted map. The priority sort keys off the `runtime:` prefix that `resolveRuntimeMissionTipTransmission` already produces (`missionTips.ts:166`), so no plumbing change is needed there.
- **No placeholders:** every code step shows the literal code; every test step shows the assertions.
