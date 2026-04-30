# Jovian Outcome Side Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship plan 7 of the Jovian Society Prospection contract — make the persisted outcome flags mean something mechanically. Apply the shuttle buff to ship stats. Play a one-time video epilogue on transmit. Surface Hektor in the Jupiter asteroid pool when liberated. Suppress the Society giver post-tamper. Surface three replacement givers (Mr. Finch, Jay Mercer expansion, Cloud City Ops) gated by a new `activeStoryFlags['jovianContractTampered']` flag. Auto-grant fast-travel to the contract's `homePlanet` on every completion across all six existing contracts.

**Architecture:**
- New profile fields (`seenJovianEpilogue`, `activeStoryFlags`) extend `PlayerProfile`. Helpers `setStoryFlag`/`hasStoryFlag` colocated in `profile.ts`.
- New reward effect `set-story-flag` plumbed through `applyRewardToProfile` — generalizable for Act 3.
- New optional fields `requiresFlag` (giver + mission entries) and `homePlanet` (`Contract`). Surfacing logic in `getGiversForDifficulty` gains `disabledGiverIds` + `requiresFlag` filters.
- New `src/lib/shuttle/buffs.ts` with pure `applyShuttleBuffs(profile, baseValue, statKey)`. Wrapped at every stat read site (fuel capacity, hull HP, top speed, thruster capacity/recharge, slingshot).
- New `JovianEpilogueOverlay.vue` mounted in `MapView` after exfil from `/level`. `Timer.after(5, ...)` fires the video; Continue button sets `seenJovianEpilogue` and persists.
- New replacement giver JSONs (`mr-finch.json`, `cloud-city-ops.json`) and Jay Mercer expansion entries gated by `requiresFlag: 'jovianContractTampered'`.

**Tech Stack:** Vue 3 + TypeScript + Vite, Pinia, Tailwind v4, Vitest + JSDOM, `Timer` (RAF-based), Web Audio (already in tree).

---

## Existing context (audit before coding)

The integration points map I built has the line numbers — paste it once into your head, then let it go:

- `src/lib/player/types.ts:43-123` — `PlayerProfile`. Existing: `shuttleBuffs?: Record<string, number>`, `bodyAccess?`, `disabledGiverIds?: Record<string, true>`. Missing: `seenJovianEpilogue`, `activeStoryFlags`.
- `src/lib/player/profile.ts:754-827` — `unlockFastTravelPlanet`, `setShuttleBuff`, `disableGiver` helpers. All idempotent. `isBodyRendered` at line 478 already returns `false` for `'destroyed'`.
- `src/lib/player/profile.ts:506-518` — `loadProfile` / `saveProfile`.
- `src/lib/contracts/runtime.ts:125-158` — `applyRewardToProfile` switch-on-effect-type. Currently handles: `fast-travel`, `mission-pay-multiplier`, `shuttle-upgrade`, `shuttle-buff`, `disable-giver`, `set-body-access`. Plan 7 adds: `set-story-flag`.
- `src/lib/contracts/runtime.ts:161-221` — singleton `contractSystem` wiring, `onContractCompleted` is the hook insertion point for auto-grant.
- `src/lib/contracts/contractTypes.ts:351-413` — `Contract` interface. Plan 7 adds `homePlanet?: string`.
- `src/lib/missions/types.ts:416-431` — `MissionGiver` interface. Plan 7 adds `requiresFlag?: string`.
- `src/lib/missions/giverCatalog.ts:23-32` (catalog imports), `:55-59` (`getGiversForDifficulty`). Plan 7 extends to filter by disabled givers + `requiresFlag`.
- `src/lib/missions/asteroidMissionGenerator.ts` — picks named bodies for regions. Audit needed for where Hektor would conditionally enter the `jovian-trojans` pool.
- `src/lib/physics/thrusterSystem.ts:73-81` — `DEFAULT_SHUTTLE_CONFIG` per-group capacities/rates. Line 70 has `SHUTTLE_BASE_FUEL_CAPACITY = 1000`.
- `src/lib/map/mapViewControllerConfig.ts:275` — `SLINGSHOT_CHARGE_TIME = 2.0`.
- `src/views/MapViewController.ts:2472-2477` — `getRenderedSolarBodies()` already filters destroyed bodies. ✓
- `src/lib/Timer.ts:102` — `Timer.after(delaySec, fn): TimerHandle`. Use for the 5s post-exfil delay.
- `src/views/MapView.vue` — host for the new overlay. `MapViewController` exposes the contract-completion + post-exfil hooks.
- `src/data/contracts/` — six existing contracts. All need `homePlanet` audit.
- `src/data/missions/givers/jay-mercer.json` — extant giver, gets expansion missions.
- `src/data/missions/givers/mr-finch.json` and `cloud-city-ops.json` — new files.
- `src/components/ProspectusOverlay.vue` (plan 6) — sibling component pattern reference for the new epilogue overlay.

---

## Task 1: Profile schema — `seenJovianEpilogue` + `activeStoryFlags`

**Files:**
- Modify: `src/lib/player/types.ts:43-123`
- Modify: `src/lib/player/profile.ts` (add `setStoryFlag`/`hasStoryFlag`, defaults)
- Test: `src/lib/player/__tests__/profile.spec.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/player/__tests__/profile.spec.ts`, append:

```ts
describe('story flags', () => {
  it('hasStoryFlag returns false on a fresh profile', () => {
    const p = createDefaultProfile()
    expect(hasStoryFlag(p, 'jovianContractTampered')).toBe(false)
  })

  it('setStoryFlag persists the flag', () => {
    const p = setStoryFlag(createDefaultProfile(), 'jovianContractTampered')
    expect(hasStoryFlag(p, 'jovianContractTampered')).toBe(true)
  })

  it('setStoryFlag is idempotent', () => {
    let p = createDefaultProfile()
    p = setStoryFlag(p, 'x')
    p = setStoryFlag(p, 'x')
    expect(Object.keys(p.activeStoryFlags ?? {})).toEqual(['x'])
  })

  it('seenJovianEpilogue defaults to false', () => {
    const p = createDefaultProfile()
    expect(p.seenJovianEpilogue).toBe(false)
  })
})
```

(Use whatever the actual default-profile factory is named — check imports at the top of the existing spec file. If it's `defaultProfile`, `freshProfile`, `loadProfile()` against an empty store, etc., adapt.)

- [ ] **Step 2: Run test, verify it fails**

```bash
bun test:unit src/lib/player/__tests__/profile.spec.ts
```

Expected: FAIL on the new `describe`.

- [ ] **Step 3: Add the fields to `PlayerProfile`**

In `src/lib/player/types.ts`, inside the `PlayerProfile` interface near the other contract-outcome fields:

```ts
/**
 * Story flags set by contract outcomes (and future Act 3 events). Read by
 * giver/mission surfacing to gate post-resolution content.
 */
activeStoryFlags?: Record<string, true>

/**
 * Whether the player has seen the Jovian transmit epilogue video. Set on
 * Continue. Once `true`, the video never replays — even on save reload.
 */
seenJovianEpilogue?: boolean
```

- [ ] **Step 4: Add helpers to `src/lib/player/profile.ts`**

Near `setShuttleBuff` / `disableGiver`:

```ts
/**
 * Set a story flag on the player profile. Idempotent — re-setting an existing
 * flag is a no-op. Returns a new profile object (does not mutate input).
 *
 * @param profile - Source profile.
 * @param flag - Stable string id (e.g. `'jovianContractTampered'`).
 * @returns Profile with `activeStoryFlags[flag] = true`.
 */
export function setStoryFlag(profile: PlayerProfile, flag: string): PlayerProfile {
  const existing = profile.activeStoryFlags ?? {}
  if (existing[flag] === true) return profile
  return {
    ...profile,
    activeStoryFlags: { ...existing, [flag]: true as const },
  }
}

/**
 * Check whether a story flag is set on the player profile.
 *
 * @param profile - Profile to check.
 * @param flag - Flag id.
 * @returns `true` when the flag is set, `false` otherwise.
 */
export function hasStoryFlag(profile: PlayerProfile, flag: string): boolean {
  return profile.activeStoryFlags?.[flag] === true
}
```

If the project has a `createDefaultProfile()` (or `freshProfile()`) factory, ensure `seenJovianEpilogue` defaults to `false` there. If profiles are created via spread `{...}` literals, the default is implicit (`undefined` is falsy — `seenJovianEpilogue === false` per the test means accessing `p.seenJovianEpilogue` should be falsy or literal `false`). Adjust the test if reading `undefined` (use `expect(p.seenJovianEpilogue).toBeFalsy()`).

- [ ] **Step 5: Run test, verify pass + run lint/type-check**

```bash
bun test:unit src/lib/player/__tests__/profile.spec.ts
bun run type-check && bun run lint
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/player/types.ts src/lib/player/profile.ts src/lib/player/__tests__/profile.spec.ts
git commit -m "feat(profile): story flags + seenJovianEpilogue field"
```

---

## Task 2: `requiresFlag` on `MissionGiver` + mission entries

**Files:**
- Modify: `src/lib/missions/types.ts:416-431` (`MissionGiver`)
- Modify: `src/lib/missions/types.ts` (mission-entry interface — find `MissionGiver.missions[i]`'s type and add `requiresFlag?: string` there too)
- Test: `src/lib/missions/__tests__/giverTypes.spec.ts` (new, light type-only)

- [ ] **Step 1: Write a type-only test**

```ts
// src/lib/missions/__tests__/giverTypes.spec.ts
import { describe, it, expectTypeOf } from 'vitest'
import type { MissionGiver } from '@/lib/missions/types'

describe('MissionGiver', () => {
  it('accepts requiresFlag at giver level', () => {
    const g: MissionGiver = {
      id: 'x',
      name: 'X',
      title: 'T',
      objectiveTypes: ['gather'],
      minDifficulty: 1,
      maxDifficulty: 5,
      missions: [],
      requiresFlag: 'jovianContractTampered',
    }
    expectTypeOf(g.requiresFlag).toEqualTypeOf<string | undefined>()
  })

  it('accepts requiresFlag at mission level', () => {
    const g: MissionGiver = {
      id: 'x',
      name: 'X',
      title: 'T',
      objectiveTypes: ['gather'],
      minDifficulty: 1,
      maxDifficulty: 5,
      missions: [
        {
          // ...other mission fields...
          requiresFlag: 'jovianContractTampered',
        } as MissionGiver['missions'][number],
      ],
    }
    expect(g.missions[0]?.requiresFlag).toBe('jovianContractTampered')
  })
})
```

The cast `as MissionGiver['missions'][number]` lets the test compile without enumerating every field of the mission shape. Adapt other-fields if the mission shape rejects partial literal.

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Add the field to both interfaces**

In `src/lib/missions/types.ts`:

```ts
export interface MissionGiver {
  // ...existing fields...
  /**
   * Optional story flag gating this giver. When set, the giver only surfaces
   * if `profile.activeStoryFlags[requiresFlag] === true`. Use for post-outcome
   * content. (Mission-level `requiresFlag` is supported separately.)
   */
  requiresFlag?: string
}
```

Find the per-mission entry interface (search for `MissionGiver['missions'][number]` consumers — it's likely a `MissionTemplate` or similar). Add the same field with the same TSDoc, scoped per-mission.

- [ ] **Step 4: Run tests + type-check**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(missions): requiresFlag on giver + mission entries"
```

---

## Task 3: `homePlanet` on `Contract`

**Files:**
- Modify: `src/lib/contracts/contractTypes.ts:351-413`
- Test: `src/lib/contracts/__tests__/contractTypes.spec.ts` (new — type-level, lightweight)

- [ ] **Step 1: Write the failing type test**

```ts
// src/lib/contracts/__tests__/contractTypes.spec.ts
import { describe, it, expectTypeOf } from 'vitest'
import type { Contract } from '@/lib/contracts/contractTypes'

describe('Contract', () => {
  it('accepts homePlanet', () => {
    expectTypeOf<Contract['homePlanet']>().toEqualTypeOf<string | undefined>()
  })
})
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Add the field**

```ts
export interface Contract {
  // ...existing fields...
  /**
   * Home planet for the contract. When set, completing the contract auto-grants
   * `unlockFastTravelPlanet(profile, homePlanet)` regardless of authored rewards
   * or which `completionByOutcome` arm resolved. Idempotent — re-grants no-op.
   * When unset (legacy), no-op; explicit `fast-travel` rewards still work.
   */
  homePlanet?: string
}
```

- [ ] **Step 4: Run + commit**

```bash
git commit -m "feat(contracts): homePlanet field on Contract"
```

---

## Task 4: `set-story-flag` reward type

**Files:**
- Modify: `src/lib/contracts/contractTypes.ts:309-319` (the `RewardEffect` discriminated union)
- Modify: `src/lib/contracts/runtime.ts:125-158` (`applyRewardToProfile`)
- Test: `src/lib/contracts/__tests__/runtime.spec.ts` (or wherever applyRewardToProfile is tested — check first; if no spec exists, create `applyRewardToProfile.spec.ts` colocated)

- [ ] **Step 1: Write the failing test**

```ts
it('set-story-flag persists the flag on the profile', () => {
  const before = createDefaultProfile()
  const after = applyRewardToProfile({ type: 'set-story-flag', flag: 'jovianContractTampered' }, before)
  expect(hasStoryFlag(after, 'jovianContractTampered')).toBe(true)
})
```

Adapt to the actual `applyRewardToProfile` signature — if it mutates a passed profile in place vs. returns a new one, adjust the assertion.

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Add the union arm**

In `contractTypes.ts:309-319`:

```ts
export type RewardEffect =
  | { type: 'fast-travel'; planetId: string }
  | { type: 'mission-pay-multiplier'; planetId: string; multiplier: number }
  | { type: 'shuttle-upgrade'; upgradeId: UpgradeId; minLevel: number }
  | { type: 'shuttle-buff'; buffId: string; multiplier: number }
  | { type: 'disable-giver'; giverId: string }
  | { type: 'set-body-access'; bodyId: string; state: 'restricted' | 'unrestricted' | 'liberated' | 'destroyed' }
  | { type: 'set-story-flag'; flag: string }
```

- [ ] **Step 4: Add the case to `applyRewardToProfile`**

In `runtime.ts:125-158`, add a new `case 'set-story-flag':` arm:

```ts
case 'set-story-flag':
  return setStoryFlag(profile, effect.flag)
```

(Match the surrounding pattern — if other cases use `return setBodyAccess(...)`, mirror it.)

- [ ] **Step 5: Run + lint + commit**

```bash
git commit -m "feat(contracts): set-story-flag reward type"
```

---

## Task 5: Wire `homePlanet` auto-grant + audit all six contracts

**Files:**
- Modify: `src/lib/contracts/runtime.ts:161-221` (the `onContractCompleted` listener)
- Modify: All six contract JSONs in `src/data/contracts/`:
  - `space-cowboys-mars-hq.json` → `"homePlanet": "mars"`
  - `martian-marine-corps-cohort.json` → `"homePlanet": "mars"`
  - `usc-venus-certification.json` → `"homePlanet": "venus"`
  - `venusian-zeppelin-trade-loop.json` → `"homePlanet": "venus"`
  - `the-cinderline.json` → `"homePlanet": "mercury"`
  - `jovian-society-prospection.json` → `"homePlanet": "jupiter"`
- Test: `src/lib/contracts/__tests__/jovian-contract.spec.ts` (already exists; add cases here) plus a small audit test in `src/data/contracts/__tests__/contractCatalog.spec.ts` (new)

- [ ] **Step 1: Write the failing tests**

```ts
// In jovian-contract.spec.ts:
it('grants Jupiter fast-travel on transmit completion', () => {
  contracts.offerForTests('jovian-society-prospection')
  contracts.acceptContract('jovian-society-prospection')
  for (let i = 0; i < 8; i++) contracts.advanceStepForTests('jovian-society-prospection')
  contracts.notifyChoiceResolved('jovian_final_prospectus', 'transmit')
  const profile = loadProfile()
  expect(profile?.fastTravelUnlocks?.jupiter).toBeTruthy()
})

it('grants Jupiter fast-travel on tamper completion', () => {
  // same, but with 'tamper'
})
```

```ts
// In src/data/contracts/__tests__/contractCatalog.spec.ts (new):
import { describe, it, expect } from 'vitest'
import { CONTRACT_CATALOG } from '@/lib/contracts/contractCatalog' // or wherever the catalog is imported

describe('CONTRACT_CATALOG homePlanet audit', () => {
  it('every contract has a homePlanet set', () => {
    for (const contract of CONTRACT_CATALOG) {
      expect(contract.homePlanet, `${contract.id} missing homePlanet`).toBeTruthy()
    }
  })
})
```

(Find the actual catalog import path — likely `src/lib/contracts/contracts.ts` or sibling. Adapt.)

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Wire the auto-grant**

In `runtime.ts` near where `onContractCompleted` is defined, find the listener that fires on contract completion. Add:

```ts
contractSystem.onContractCompleted((contractId) => {
  const contract = contractSystem.getContract(contractId)
  if (!contract) return
  if (contract.homePlanet) {
    const profile = loadProfile()
    if (profile) {
      saveProfile(unlockFastTravelPlanet(profile, contract.homePlanet))
    }
  }
})
```

Add to the existing listener block (don't replace — there may be other completion logic). Idempotent: `unlockFastTravelPlanet` no-ops on re-grant, so replay is safe.

- [ ] **Step 4: Add `"homePlanet"` to all 6 contract JSONs**

Single one-line edit at the top level of each contract JSON, alongside `"id"`. For Jovian:

```json
{
  "id": "jovian-society-prospection",
  "homePlanet": "jupiter",
  "name": "...",
  ...
}
```

Repeat for the other five with the planet from the table above.

- [ ] **Step 5: Tests pass**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(contracts): auto-grant homePlanet fast-travel on completion"
```

---

## Task 6: Add `set-story-flag` reward to Jovian tamper arm

**Files:**
- Modify: `src/data/contracts/jovian-society-prospection.json` (`completionByOutcome.tamper.rewards`)

- [ ] **Step 1: Add the reward**

In `completionByOutcome.tamper.rewards` (the array currently ending with `set-body-access` and `disable-giver`), append:

```json
{ "type": "set-story-flag", "flag": "jovianContractTampered" }
```

The transmit arm does NOT get this — only tamper triggers the post-Society replacement givers.

- [ ] **Step 2: Run jovian-contract.spec.ts**

Add a test:

```ts
it('tamper outcome sets the jovianContractTampered story flag', () => {
  contracts.offerForTests('jovian-society-prospection')
  contracts.acceptContract('jovian-society-prospection')
  for (let i = 0; i < 8; i++) contracts.advanceStepForTests('jovian-society-prospection')
  contracts.notifyChoiceResolved('jovian_final_prospectus', 'tamper')
  const profile = loadProfile()
  expect(profile && hasStoryFlag(profile, 'jovianContractTampered')).toBe(true)
})

it('transmit outcome does NOT set the tamper flag', () => {
  contracts.offerForTests('jovian-society-prospection')
  contracts.acceptContract('jovian-society-prospection')
  for (let i = 0; i < 8; i++) contracts.advanceStepForTests('jovian-society-prospection')
  contracts.notifyChoiceResolved('jovian_final_prospectus', 'transmit')
  const profile = loadProfile()
  expect(profile && hasStoryFlag(profile, 'jovianContractTampered')).toBe(false)
})
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(contracts): jovian tamper sets jovianContractTampered story flag"
```

---

## Task 7: `disabledGiverIds` + `requiresFlag` filtering in `getGiversForDifficulty`

**Files:**
- Modify: `src/lib/missions/giverCatalog.ts:55-59`
- Test: `src/lib/missions/__tests__/giverCatalog.spec.ts` (or sibling — find the existing spec for `getGiversForDifficulty`)

- [ ] **Step 1: Write the failing tests**

```ts
describe('getGiversForDifficulty surfacing filters', () => {
  it('skips givers in profile.disabledGiverIds', () => {
    const profile = { ...createDefaultProfile(), disabledGiverIds: { 'jovian-society': true } }
    const givers = getGiversForDifficulty(5, profile)
    expect(givers.find((g) => g.id === 'jovian-society')).toBeUndefined()
  })

  it('skips givers with requiresFlag when the flag is unset', () => {
    const giver: MissionGiver = { /* ... */ requiresFlag: 'jovianContractTampered' /* ... */ }
    const givers = getGiversForDifficulty(5, createDefaultProfile(), [giver])
    expect(givers).toHaveLength(0)
  })

  it('includes givers with requiresFlag when the flag is set', () => {
    const giver: MissionGiver = { /* ... */ requiresFlag: 'jovianContractTampered' /* ... */ }
    const profile = setStoryFlag(createDefaultProfile(), 'jovianContractTampered')
    const givers = getGiversForDifficulty(5, profile, [giver])
    expect(givers).toHaveLength(1)
  })
})
```

(The test signature here assumes you can pass a profile + optional giver-list override. If the current function reads catalog from a module-level import, refactor the function to accept a profile parameter — the tests will then drive the signature change.)

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Update the function signature + body**

```ts
/**
 * Surfaces all givers eligible at `difficulty`, filtered by:
 * - `profile.disabledGiverIds` — skip blacklisted givers.
 * - giver-level `requiresFlag` — skip when flag absent.
 *
 * @param difficulty - Mission difficulty in the `[1, 10]` range.
 * @param profile - Player profile (drives `disabledGiverIds` and story flags).
 * @param givers - Optional override (for tests). Defaults to `MISSION_GIVERS`.
 * @returns Filtered, eligible givers.
 */
export function getGiversForDifficulty(
  difficulty: number,
  profile: PlayerProfile,
  givers: readonly MissionGiver[] = MISSION_GIVERS,
): MissionGiver[] {
  return givers.filter((g) => {
    if (g.minDifficulty > difficulty) return false
    if (g.maxDifficulty < difficulty) return false
    if (profile.disabledGiverIds?.[g.id]) return false
    if (g.requiresFlag !== undefined && !hasStoryFlag(profile, g.requiresFlag)) return false
    return true
  })
}
```

(Adjust to whatever the existing signature is — the existing function may not take a profile yet. Adding the parameter is the breaking change; update all callers.)

- [ ] **Step 4: Update callers**

`getGiversForDifficulty` is called from at least one caller in `asteroidMissionGenerator.ts`. Pass the profile through. Audit with:

```bash
grep -rn "getGiversForDifficulty" src/
```

For each caller, ensure a profile is in scope. If the call site doesn't have one, get it via `loadProfile()` (read-only is fine — the function is pure).

- [ ] **Step 5: Tests pass + lint + type-check**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(missions): filter givers by disabledGiverIds and requiresFlag"
```

---

## Task 8: Mission-level `requiresFlag` filter

**Files:**
- Modify: wherever per-mission filtering happens for surfacing — likely inside the giver iteration in `getMissionsForGiver` or inside the asteroid mission generator's mission-template selection.
- Test: same spec as Task 7 OR a new sibling spec for the mission-level filter.

- [ ] **Step 1: Find the mission-template selection site**

```bash
grep -rn "g\.missions\|giver\.missions" src/lib/missions/
```

Find where the per-mission filter happens. Add the `requiresFlag` skip logic right next to it.

- [ ] **Step 2: Write the failing test**

```ts
it('skips mission entries with requiresFlag when the flag is absent', () => {
  // Build a giver whose missions include one flagged and one not.
  const giver: MissionGiver = {
    /* ... */
    missions: [
      { /* always-on */ },
      { /* requiresFlag: 'jovianContractTampered' */ },
    ],
  }
  // Surface for a profile without the flag.
  const profile = createDefaultProfile()
  const surfaced = surfaceMissionsForGiver(giver, profile) // adapt to actual API
  expect(surfaced).toHaveLength(1)
})

it('includes flagged missions when the flag is set', () => {
  const profile = setStoryFlag(createDefaultProfile(), 'jovianContractTampered')
  // ... same giver as above
  const surfaced = surfaceMissionsForGiver(giver, profile)
  expect(surfaced).toHaveLength(2)
})
```

- [ ] **Step 3: Implement the filter**

Add the `m.requiresFlag !== undefined && !hasStoryFlag(profile, m.requiresFlag)` skip at the per-mission loop site.

- [ ] **Step 4: Tests + lint + commit**

```bash
git commit -m "feat(missions): filter mission entries by requiresFlag"
```

---

## Task 9: Hektor `liberated` — add to `jovian-trojans` named-body pool

**Files:**
- Modify: `src/lib/missions/asteroidMissionGenerator.ts` (the named-body pool selection for the `jovian-trojans` region)
- Test: `src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts`

- [ ] **Step 1: Audit how named bodies are picked for a region**

```bash
grep -rn "jovian-trojans\|namedBodies\|asteroidId" src/lib/missions/
```

Identify the data source. Two likely shapes:
- (a) A region map JSON / TS file that lists named asteroids per region (e.g. `{ 'jovian-trojans': ['eurybates', 'agamemnon', ...] }`).
- (b) Mission generator iterates the asteroid catalog filtered by `region`.

If (b): the catalog already includes Hektor, but the generator likely **excludes pinned bodies** when no contract is active (otherwise, every Jupiter-board mission could roll Hektor mid-contract). Find the exclusion. Plan 7 changes the rule: include Hektor only when `bodyAccess['hektor'] === 'liberated'`.

If (a): the static list does not include Hektor. Plan 7 conditionally appends it when `liberated`.

- [ ] **Step 2: Write the failing test**

```ts
import { generateAsteroidMission } from '@/lib/missions/asteroidMissionGenerator'

describe('jovian-trojans pool with Hektor', () => {
  it('does NOT include Hektor when bodyAccess is unrestricted', () => {
    const profile = { ...createDefaultProfile(), bodyAccess: { hektor: 'unrestricted' as const } }
    const candidates = pickNamedBodyCandidates('jovian-trojans', profile) // adapt
    expect(candidates).not.toContain('hektor')
  })

  it('INCLUDES Hektor when bodyAccess is liberated', () => {
    const profile = { ...createDefaultProfile(), bodyAccess: { hektor: 'liberated' as const } }
    const candidates = pickNamedBodyCandidates('jovian-trojans', profile)
    expect(candidates).toContain('hektor')
  })

  it('does NOT include Hektor when bodyAccess is destroyed', () => {
    const profile = { ...createDefaultProfile(), bodyAccess: { hektor: 'destroyed' as const } }
    const candidates = pickNamedBodyCandidates('jovian-trojans', profile)
    expect(candidates).not.toContain('hektor')
  })
})
```

(The test pulls a function name `pickNamedBodyCandidates` that may need to be extracted from the generator. If the existing logic is inline, factor out a small helper for testability.)

- [ ] **Step 3: Implement**

Either:
- Add Hektor to the static jovian-trojans list and gate inclusion at runtime via a `bodyAccess` check, OR
- Refactor the named-body selection to include any catalog asteroid with `region === 'jovian-trojans'` AND `bodyAccess[id] !== 'restricted' && !== 'destroyed'`. The latter is more general — gate on access, not on hardcoded inclusion.

Add a TSDoc note on the gating function explaining the asymmetry: pinned bodies (Hektor while contract is active) are restricted; liberated bodies are open.

- [ ] **Step 4: Tests + lint + commit**

```bash
git commit -m "feat(missions): liberated bodies join the procedural pool"
```

---

## Task 10: `applyShuttleBuffs` math (pure function + tests)

**Files:**
- Create: `src/lib/shuttle/buffs.ts`
- Create: `src/lib/shuttle/__tests__/buffs.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/shuttle/__tests__/buffs.spec.ts
import { describe, it, expect } from 'vitest'
import { applyShuttleBuffs } from '@/lib/shuttle/buffs'
import type { PlayerProfile } from '@/lib/player/types'

describe('applyShuttleBuffs', () => {
  it('returns base value when shuttleBuffs is undefined', () => {
    const p = {} as PlayerProfile
    expect(applyShuttleBuffs(p, 100, 'fuel')).toBe(100)
  })

  it('returns base when shuttleBuffs is empty', () => {
    const p = { shuttleBuffs: {} } as PlayerProfile
    expect(applyShuttleBuffs(p, 100, 'fuel')).toBe(100)
  })

  it('multiplies by jovianEmpowerment', () => {
    const p = { shuttleBuffs: { jovianEmpowerment: 1.5 } } as PlayerProfile
    expect(applyShuttleBuffs(p, 100, 'fuel')).toBe(150)
  })

  it('compounds multiple buffs', () => {
    const p = { shuttleBuffs: { a: 1.5, b: 2 } } as PlayerProfile
    expect(applyShuttleBuffs(p, 100, '_')).toBe(300)
  })
})
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

```ts
/**
 * Multiplicative shuttle-buff application. Reads `profile.shuttleBuffs` and
 * compounds every registered multiplier into a base stat value.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-29-jovian-outcome-side-effects-design.md
 */
import type { PlayerProfile } from '@/lib/player/types'

/**
 * Apply registered shuttle buffs to a base stat value.
 *
 * @param profile - Player profile (read-only).
 * @param baseValue - Unbuffed stat value.
 * @param _statKey - Reserved for future per-stat buffs. `jovianEmpowerment` is global, so the key is currently ignored.
 * @returns Buffed stat value (compounded multiplicatively).
 */
export function applyShuttleBuffs(
  profile: PlayerProfile,
  baseValue: number,
  _statKey: string,
): number {
  const buffs = profile.shuttleBuffs
  if (!buffs) return baseValue
  let value = baseValue
  for (const multiplier of Object.values(buffs)) {
    value *= multiplier
  }
  return value
}
```

- [ ] **Step 4: Test + lint + commit**

```bash
git commit -m "feat(shuttle): applyShuttleBuffs multiplicative buff math"
```

---

## Task 11: Wire buffs into shuttle/lander stat reads

**Files:** TBD by audit. Probable touchpoints:
- `src/lib/physics/thrusterSystem.ts` (fuel capacity, group capacity, recharge rate)
- Wherever shuttle hull HP is initialized
- Wherever shuttle top speed is read for the main thruster
- `src/lib/map/orbit/MapOrbitFacade.ts` line 239 area (slingshot energy gain)

- [ ] **Step 1: Audit stat call sites**

```bash
grep -rn "fuelCapacity\|maxHp\|maxHull\|MAX_HULL\|MAX_FUEL\|topSpeed\|maxSpeed\|MAX_SPEED" src/lib/ src/three/
```

For each call site, decide:
- (a) Is this a base-value read at vehicle init? Wrap with `applyShuttleBuffs(profile, baseValue, statKey)`.
- (b) Is this a per-frame read? Cache the buffed value at init; don't re-call per frame.
- (c) Is this for a non-shuttle vehicle (e.g. EVA player movement)? Skip — buffs are shuttle/lander only.

Plan 7's stat targets per spec:
- **Top speed** — main thruster max velocity.
- **Fuel capacity** — `SHUTTLE_BASE_FUEL_CAPACITY`.
- **Hull HP** — shuttle + lander max HP.
- **Thruster charge** — every `ThrusterSystem` group's `capacity`.
- **Recharge rate** — every group's `rechargeRate`.
- **Slingshot charge** — energy gained per orbit.

- [ ] **Step 2: Write end-to-end test**

```ts
// In src/lib/shuttle/__tests__/buffs.spec.ts:
it('end-to-end: profile with buff produces expected effective fuel capacity', () => {
  const p = { shuttleBuffs: { jovianEmpowerment: 1.5 } } as PlayerProfile
  const ts = new ThrusterSystem(buildShuttleConfigForProfile(p))
  expect(ts.fuelCapacity).toBe(SHUTTLE_BASE_FUEL_CAPACITY * 1.5)
})
```

(Adapt to whatever the actual init shape is. The point is a single end-to-end check that the wrapper is wired through one stat — fuel is a good representative.)

- [ ] **Step 3: Implement the wraps**

For each call site, change:
```ts
const fuelCapacity = SHUTTLE_BASE_FUEL_CAPACITY
```
to:
```ts
const fuelCapacity = applyShuttleBuffs(profile, SHUTTLE_BASE_FUEL_CAPACITY, 'fuel')
```

For `ThrusterSystem` config: build the config with the profile in scope and apply buffs to each group's `capacity` and `rechargeRate` before constructing.

For top speed: the main thruster's `maxSpeed` (or equivalent) gets the wrap.

For hull HP: the shuttle and lander each have a max HP at construction; wrap both.

For slingshot: the per-orbit energy gain (per spec, line 275 of `mapViewControllerConfig.ts` is the charge-time, not the energy. Find the actual energy-gained-per-orbit constant — it's likely a multiplier in `MapOrbitFacade.ts:239`).

Use `loadProfile()` at each call site to fetch the profile read-only. For test isolation, pass profile as a parameter where natural.

- [ ] **Step 4: Manual sanity — `bun dev`**

Run `bun dev`, force-set `profile.shuttleBuffs.jovianEmpowerment = 1.5` from the dev console, reload — confirm the fuel gauge shows the buffed cap, the hull bar maxes out at 1.5×, and the thruster charge bars are taller. (Don't ship this dev hook; just validate.)

- [ ] **Step 5: Lint + type-check + commit**

```bash
git commit -m "feat(shuttle): apply buffs to fuel/hull/thruster/slingshot stats"
```

This is the largest behavior change in the plan. Expect 30-60 minutes of careful audit work.

---

## Task 12: `JovianEpilogueOverlay.vue` (component shell + render test)

**Files:**
- Create: `src/components/JovianEpilogueOverlay.vue`
- Create: `src/assets/css/jovian-epilogue-overlay.css`
- Modify: `src/assets/css/main.css` — add `@import './jovian-epilogue-overlay.css';`
- Create: `src/components/__tests__/JovianEpilogueOverlay.spec.ts`

- [ ] **Step 1: Render test**

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import JovianEpilogueOverlay from '@/components/JovianEpilogueOverlay.vue'

describe('JovianEpilogueOverlay', () => {
  it('renders the video, subtitle, and Continue button', () => {
    const wrapper = mount(JovianEpilogueOverlay, {
      props: { onContinue: () => {} },
    })
    const html = wrapper.html()
    expect(html).toContain('<video')
    expect(html).toContain('jovian-ending.mp4')
    expect(html).toContain('jovian-ending.webp') // poster
    expect(html).toContain('Asset 2306-J')
    expect(html).toContain('Continue')
  })
})
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement the component**

```vue
<!--
  JovianEpilogueOverlay.vue — One-time epilogue cutscene for the Jovian
  Society Prospection contract's transmit outcome. Plays a full-screen video
  with a Society-voiced subtitle line over a corporate-banal asset processing
  shot. Continue button dismisses; flag prevents replay.

  @author guinetik
  @date 2026-04-30
  @spec docs/superpowers/specs/2026-04-29-jovian-outcome-side-effects-design.md
-->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const props = defineProps<{
  /** Continue handler — fired exactly once when the player dismisses. */
  onContinue: () => void
}>()

const videoEl = ref<HTMLVideoElement | null>(null)
const dismissed = ref(false)

/** Subtitle copy from the spec (open question 2 — implementer's call). */
const SUBTITLE = 'Asset 2306-J · processing cycle initiated · estimated yield 2.8B CR · 14-month demolition schedule · Cohort: Q4 / 2306'

function handleContinue(): void {
  if (dismissed.value) return
  dismissed.value = true
  props.onContinue()
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
    e.preventDefault()
    handleContinue()
  }
}

onMounted(() => {
  videoEl.value?.play().catch(() => {
    // Autoplay blocked — user gesture (Continue click) will still dismiss.
  })
  window.addEventListener('keydown', onKeydown, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown, true)
})
</script>

<template>
  <div class="jovian-epilogue-overlay" data-test="jovian-epilogue">
    <video
      ref="videoEl"
      class="jovian-epilogue-overlay__video"
      src="/jovian-ending.mp4"
      poster="/jovian-ending.webp"
      muted
      playsinline
      preload="auto"
    />
    <div class="jovian-epilogue-overlay__subtitle">
      {{ SUBTITLE }}
    </div>
    <button
      type="button"
      class="jovian-epilogue-overlay__continue"
      :disabled="dismissed"
      @click="handleContinue"
    >
      Continue
    </button>
  </div>
</template>
```

Per CLAUDE.md: no `<style>` block. CSS goes in the sibling file. Pre-load the poster (already in `/public/`).

- [ ] **Step 4: Sibling CSS**

```css
.jovian-epilogue-overlay {
  @apply fixed inset-0 z-[60] bg-black flex items-center justify-center;
}

.jovian-epilogue-overlay__video {
  @apply absolute inset-0 w-full h-full object-cover;
}

.jovian-epilogue-overlay__subtitle {
  @apply absolute bottom-32 left-0 right-0 text-center font-mono text-base text-stone-100 tracking-wider px-8 drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)];
}

.jovian-epilogue-overlay__continue {
  @apply absolute bottom-8 left-1/2 -translate-x-1/2 bg-blue-700/90 hover:bg-blue-600 text-white font-bold px-8 py-3 rounded shadow-lg disabled:opacity-50 disabled:cursor-not-allowed;
}
```

- [ ] **Step 5: Import in main.css**

```css
@import './jovian-epilogue-overlay.css';
```

- [ ] **Step 6: Tests + lint + commit**

```bash
git commit -m "feat(epilogue): JovianEpilogueOverlay component"
```

---

## Task 13: Wire trigger — 5s post-exfil timer in MapView

**Files:**
- Modify: `src/views/MapView.vue` (mount the overlay)
- Modify: `src/views/MapViewController.ts` (expose hook for "post-/level remount with transmit outcome unseen")

- [ ] **Step 1: Audit MapView's post-exfil mount path**

`MapView` mounts when the player navigates from `/level` back to `/map`. The mount runs the controller's init, which includes `replayActiveContractStepStaging` (from plan 6's Task 14) and similar replay logic.

The trigger condition for the epilogue:
- A Jovian contract instance is `completed` AND its `resolvedOutcomeId === 'transmit'` AND `profile.seenJovianEpilogue !== true`.

- [ ] **Step 2: Add a controller hook**

In `MapViewController`, add:

```ts
/**
 * Callback fired when the player should see the Jovian epilogue video. Set
 * by `MapView.vue` to mount `JovianEpilogueOverlay` after a 5s delay
 * (Timer.after).
 */
onJovianEpilogueDue: (() => void) | null = null

/**
 * Check whether the Jovian epilogue should fire on this map mount. Returns
 * true when the contract resolved with transmit AND the player hasn't seen
 * the video yet. Idempotent — read-only, doesn't mutate.
 */
shouldFireJovianEpilogue(): boolean {
  const profile = loadProfile()
  if (!profile) return false
  if (profile.seenJovianEpilogue === true) return false
  const instance = contractSystem.getInstance('jovian-society-prospection')
  if (!instance) return false
  if (instance.status !== 'completed') return false
  if (instance.resolvedOutcomeId !== 'transmit') return false
  return true
}
```

In `onMounted` (or wherever the controller's init runs after a /level → /map transition), schedule:

```ts
if (this.shouldFireJovianEpilogue()) {
  Timer.after(5, () => {
    this.onJovianEpilogueDue?.()
  })
}
```

Import `Timer` from `@/lib/Timer`. The 5s delay is per the user's call: ship-loading → 5s → video.

- [ ] **Step 3: Mount the overlay in `MapView.vue`**

```ts
import JovianEpilogueOverlay from '@/components/JovianEpilogueOverlay.vue'
import { saveProfile, loadProfile } from '@/lib/player/profile'

const epilogueVisible = ref(false)

viewController.onJovianEpilogueDue = () => {
  epilogueVisible.value = true
}

function handleEpilogueContinue(): void {
  const profile = loadProfile()
  if (profile) {
    saveProfile({ ...profile, seenJovianEpilogue: true })
  }
  epilogueVisible.value = false
}
```

Template:

```vue
<JovianEpilogueOverlay
  v-if="epilogueVisible"
  :on-continue="handleEpilogueContinue"
/>
```

- [ ] **Step 4: Manual smoke**

```bash
bun dev
```

Console:
```js
__contracts.forceAccept('jovian-society-prospection')
for (let i = 0; i < 8; i++) __contracts.advanceStep('jovian-society-prospection')
```

Fly to Hektor, land, walk to terminal, press E, press E (transmit), launch lander, exit /level. After ~5s on map, video plays. Press Continue. Reload — video does NOT replay.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(epilogue): wire 5s post-exfil trigger and seenJovianEpilogue persist"
```

---

## Task 14: Author Mr. Finch giver

**Files:**
- Create: `src/data/missions/givers/mr-finch.json`
- Modify: `src/lib/missions/giverCatalog.ts` — register

- [ ] **Step 1: Author the giver JSON**

```json
{
  "id": "mr-finch",
  "name": "Mr. Finch",
  "title": "Saturn's Handler",
  "objectiveTypes": ["gather", "survey", "mining"],
  "minDifficulty": 4,
  "maxDifficulty": 9,
  "requiresFlag": "jovianContractTampered",
  "giverPlanetIds": ["jupiter"],
  "missions": [
    {
      "templateId": "finch-saturn-gather-1",
      "name": "Saturn ring gather pass",
      "briefing": "Pilot. Got a routine cycle out at Saturn — gravimetric work, three-stage shuttle pass, standard rates. The work's good if you don't mind the trip. Comm me when you get back. — Finch.",
      "objectiveType": "gather",
      "region": "jovian-trojans",
      "difficulty": 5,
      "reward": 5500
    },
    {
      "templateId": "finch-saturn-survey-1",
      "name": "Saturn co-orbital survey",
      "briefing": "Saturn co-orbital body needs eyes. Survey-grade pass, photometric run. Don't overthink it; the body's been sitting there since before us, it'll be there when you're done. — Finch.",
      "objectiveType": "survey",
      "region": "jovian-trojans",
      "difficulty": 6,
      "reward": 6500
    },
    {
      "templateId": "finch-saturn-mining-1",
      "name": "Saturn-trojan mining run",
      "briefing": "Mining work, Saturn-side. Standard cycle. — Finch.",
      "objectiveType": "mining",
      "region": "jovian-trojans",
      "difficulty": 7,
      "reward": 8000
    }
  ]
}
```

(Adapt fields to match the actual `MissionGiver` shape — the snippet above is a sketch. Region naming may need to be `saturn-trojans` if that exists; `jovian-trojans` is a plausible alias if Saturn missions in this game are bucketed there.)

- [ ] **Step 2: Register**

In `src/lib/missions/giverCatalog.ts:23-32`:

```ts
import mrFinch from '@/data/missions/givers/mr-finch.json'
// ...
export const MISSION_GIVERS: MissionGiver[] = [
  // ...existing...
  mrFinch as unknown as MissionGiver,
]
```

- [ ] **Step 3: Test surfacing**

```ts
it('Mr. Finch surfaces only when jovianContractTampered flag is set', () => {
  const profileNoFlag = createDefaultProfile()
  expect(getGiversForDifficulty(5, profileNoFlag).find((g) => g.id === 'mr-finch')).toBeUndefined()

  const profileWithFlag = setStoryFlag(createDefaultProfile(), 'jovianContractTampered')
  expect(getGiversForDifficulty(5, profileWithFlag).find((g) => g.id === 'mr-finch')).toBeDefined()
})
```

- [ ] **Step 4: Lint + commit**

```bash
git commit -m "feat(givers): Mr. Finch (post-tamper Saturn handler)"
```

---

## Task 15: Author Cloud City Operations giver

**Files:**
- Create: `src/data/missions/givers/cloud-city-ops.json`
- Modify: `src/lib/missions/giverCatalog.ts`

- [ ] **Step 1: Author**

```json
{
  "id": "cloud-city-ops",
  "name": "Cloud City Operations",
  "title": "Operations Bureau",
  "objectiveTypes": ["gather", "survey"],
  "minDifficulty": 3,
  "maxDifficulty": 7,
  "requiresFlag": "jovianContractTampered",
  "giverPlanetIds": ["jupiter"],
  "missions": [
    {
      "templateId": "cco-anchor-maintenance",
      "name": "Lower-band anchor maintenance",
      "briefing": "Cloud City Operations Bureau, contractor desk. Standing call: maintenance pass on lower-band atmospheric anchors, low-priority. File the receipt at any kiosk. — Operations.",
      "objectiveType": "gather",
      "region": "jovian-trojans",
      "difficulty": 4,
      "reward": 4200
    },
    {
      "templateId": "cco-survey-pass",
      "name": "Atmospheric survey pass",
      "briefing": "Operations, contractor desk. Survey pass requested on upper-band atmospheric strata. Standard rate. — Operations.",
      "objectiveType": "survey",
      "region": "jovian-trojans",
      "difficulty": 5,
      "reward": 5000
    }
  ]
}
```

- [ ] **Step 2: Register + test surfacing (same pattern as Task 14)**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(givers): Cloud City Operations (post-tamper Jupiter ops)"
```

---

## Task 16: Jay Mercer expansion missions

**Files:**
- Modify: `src/data/missions/givers/jay-mercer.json`
- Test: extend the giverCatalog spec

- [ ] **Step 1: Raise giver-level `maxDifficulty` from 5 to 8**

(Find the existing `maxDifficulty` in `jay-mercer.json` and bump it.)

- [ ] **Step 2: Append expansion missions with `requiresFlag`**

```json
{
  "templateId": "jay-jupiter-belt-1",
  "name": "Belt cycle, Jupiter side",
  "briefing": "Hey — we're running on Jupiter now too, did you hear? Got a belt cycle queued up if you're up for it. Higher cuts than the Earth runs. — Jay.",
  "objectiveType": "gather",
  "region": "jovian-trojans",
  "difficulty": 6,
  "reward": 6000,
  "requiresFlag": "jovianContractTampered"
}
```

Add 2-3 entries with mixed objective types (gather, survey, mining), difficulty 5-8, region `jovian-trojans` (or asteroid-belt — match spec line 278).

- [ ] **Step 3: Test**

```ts
it('Jay Mercer surfaces always; expansion missions only post-tamper', () => {
  const noFlag = createDefaultProfile()
  const givers = getGiversForDifficulty(7, noFlag)
  const jay = givers.find((g) => g.id === 'jay-mercer')
  expect(jay).toBeDefined() // existing surfacing
  // Mission-level filter: jay's expansion entries are absent.
  // (Adapt to actual surfaceMissionsForGiver API.)

  const flagged = setStoryFlag(createDefaultProfile(), 'jovianContractTampered')
  const giversFlagged = getGiversForDifficulty(7, flagged)
  const jayFlagged = giversFlagged.find((g) => g.id === 'jay-mercer')
  expect(jayFlagged).toBeDefined()
  // Expansion missions present.
})
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(givers): Jay Mercer Jupiter expansion missions"
```

---

## Task 17: End-to-end transmit + tamper outcome tests

**Files:**
- Modify: `src/lib/contracts/__tests__/jovian-contract.spec.ts`

- [ ] **Step 1: Append the end-to-end tests**

```ts
describe('Jovian outcome side effects', () => {
  it('transmit: sets all transmit-side profile state', () => {
    contracts.offerForTests('jovian-society-prospection')
    contracts.acceptContract('jovian-society-prospection')
    for (let i = 0; i < 8; i++) contracts.advanceStepForTests('jovian-society-prospection')
    contracts.notifyChoiceResolved('jovian_final_prospectus', 'transmit')
    const profile = loadProfile()!
    expect(profile.bodyAccess?.hektor).toBe('destroyed')
    expect(profile.shuttleBuffs?.jovianEmpowerment).toBe(1.5)
    expect(profile.fastTravelUnlocks?.jupiter).toBeTruthy()
    expect(profile.disabledGiverIds?.['jovian-society']).toBeUndefined()
    expect(hasStoryFlag(profile, 'jovianContractTampered')).toBe(false)
  })

  it('tamper: sets all tamper-side profile state', () => {
    contracts.offerForTests('jovian-society-prospection')
    contracts.acceptContract('jovian-society-prospection')
    for (let i = 0; i < 8; i++) contracts.advanceStepForTests('jovian-society-prospection')
    contracts.notifyChoiceResolved('jovian_final_prospectus', 'tamper')
    const profile = loadProfile()!
    expect(profile.bodyAccess?.hektor).toBe('liberated')
    expect(profile.shuttleBuffs?.jovianEmpowerment).toBeUndefined()
    expect(profile.fastTravelUnlocks?.jupiter).toBeTruthy() // auto-grant on either arm
    expect(profile.disabledGiverIds?.['jovian-society']).toBe(true)
    expect(hasStoryFlag(profile, 'jovianContractTampered')).toBe(true)
  })

  it('replay safety: persisted profile recovers all flags', () => {
    contracts.offerForTests('jovian-society-prospection')
    contracts.acceptContract('jovian-society-prospection')
    for (let i = 0; i < 8; i++) contracts.advanceStepForTests('jovian-society-prospection')
    contracts.notifyChoiceResolved('jovian_final_prospectus', 'tamper')
    const beforeReload = loadProfile()
    // Simulate reload — drop the in-memory state and re-init.
    contracts.replayCompletedRewards()
    const afterReload = loadProfile()
    expect(afterReload).toEqual(beforeReload)
  })
})
```

- [ ] **Step 2: Run + fix any cross-cutting issues**

If a test fails because `replayCompletedRewards` re-fires `set-story-flag` and the flag setter is non-idempotent — fix in Task 1's `setStoryFlag` (it should already be idempotent per its TSDoc).

- [ ] **Step 3: Commit**

```bash
git commit -m "test(contracts): jovian end-to-end outcome side effects"
```

---

## Task 18: Manual end-to-end smoke + acceptance gate

- [ ] **Step 1: All gates green**

```bash
bun run type-check && bun run lint && bun test:unit
```

All must pass.

- [ ] **Step 2: Manual transmit playthrough**

```bash
bun dev
```

Console:
```js
__contracts.forceAccept('jovian-society-prospection')
for (let i = 0; i < 8; i++) __contracts.advanceStep('jovian-society-prospection')
```

Verify:
- Fly to Hektor, land, terminal, E (transmit), launch, exfil. ~5s on map → video plays. Continue dismisses. Reload → no replay.
- Inbox: "Welcome To The Manifest".
- Shuttle stats: fuel/hull/thruster bars all 1.5× their pre-completion size. Top speed and slingshot feel meaningfully bigger.
- Map: Hektor is gone (per plan 1's renderer skip).
- Fast travel to Jupiter is now available from any other planet's kiosk.
- Society listings still visible on Jupiter mission board (cohort-member, not blacklisted).
- Mr. Finch / Cloud City Ops / Jay's expansion missions do NOT appear (no flag set).

- [ ] **Step 3: Manual tamper playthrough**

Reset profile, repeat with Q at the terminal:
- No video plays.
- Inbox: "Cohort Departure Confirmed".
- Shuttle stats: unchanged (no buff).
- Map: Hektor is still visible.
- Jupiter board: Society listings GONE. Mr. Finch, Cloud City Ops, Jay's expansion missions appear with their distinct voices.
- Hektor occasionally rolls up as a target for non-Society Jupiter givers (e.g. mining mission from Cloud City Ops).
- Fast travel to Jupiter unlocked.

- [ ] **Step 4: Plans 1-6 regression spot-check**

Drive a fresh save through OP 4 (Hektor photometry) and OP 7 (Hektor DAN) — those steps still close on photometry/dan completion. The contract still flows step 1 → step 9 → resolution as in plan 6.

- [ ] **Step 5: Final commit (only if smoke turned up patches)**

If smoke required a fix, commit it. Otherwise close out the plan.

---

## Acceptance criteria (mirror of spec §Acceptance criteria)

1. `bun run type-check` passes.
2. `bun run lint` passes.
3. `bun run test:unit` passes including new tests.
4. **Manual: transmit playthrough mechanics meaningfully different.** Buff is felt; Hektor is gone; Society persists.
5. **Manual: tamper playthrough mechanics meaningfully different.** No buff; Hektor stays in pool; Society invisible; Mr. Finch / Cloud City Ops / Jay's expansion populate Jupiter board.
6. **Plans 1-6 regression.** All prior acceptance criteria still pass.
7. **Replay-stable.** Save/reload mid-state recovers all flags correctly.

---

## Out of scope (Act 3)

- **Cinderline / moon-worker follow-up message.** Defer per spec unless the scheduling primitive turns up trivially while implementing Task 13 (the Timer-based delay there isn't the same as a "schedule for in-game date" mechanism). If you find one, ship it; otherwise don't author a new system.
- Any new contracts.
- Any UI redesign beyond the new overlay + the suppression filter.
- Refactoring the buff system into a more general modifier pipeline.
- Voice polish / additional missions for the three replacement givers beyond the starter set.

## Open questions left to the implementer

1. **Buff scope tuning.** If top-speed +50% breaks navigation, narrow inline. Document which stats were excluded.
2. **Subtitle copy.** The spec proposes the `Asset 2306-J · processing cycle initiated...` line. Authoring open if you want a colder/more cinematic alternative.
3. **Liberated body in pre-flag state.** Plan 7's default: Hektor only enters the pool when `liberated`. If pre-resolution access feels more natural (e.g. while contract is `unrestricted` mid-Movement-2/3), that's a tunable; don't change the spec.
4. **Cinderline follow-up.** Defer unless trivial.
5. **Mr. Finch / Cloud City Ops mission set.** 2-3 starter entries each is the floor; more can land in a follow-up content pass.
