# Jovian Giver Pool Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generic-ify the Jovian Society giver pool (so Vance work is repeatable cycle work, not contract-flavored), add gather missions, tighten the contract matcher to honor the `objectiveType` filter that plan 2 stubbed, and populate `objectiveType` on every `MissionCompletedEvent` emission site.

**Architecture:** Three orthogonal changes. (1) Content edits to `jovian-society.json`: rewrite 5 entry briefings, add 2 gather missions, add `'gather'` to `objectiveTypes`. (2) Engine: extend `matchesMissionEvent` with the `objectiveType` filter; populate `objectiveType` at the four emission sites (asteroid mission rewards, turret mining rewards, MapView shuttle handler, MapView eva handler). (3) Contract JSON: drop the `giverId: 'jovian-society'` filter on Step 2 of the Jovian contract — Step 2 becomes "any Jupiter-board mining mission" per the cohort recruiting tone.

**Tech Stack:** TypeScript strict, Vue 3, Vite, Vitest. `objectiveType: string` already exists as an optional field on `MissionCompletedEvent` (added in plan 2's Task 3).

**Spec:** `docs/superpowers/specs/2026-04-29-jovian-giver-pool-expansion-design.md`

---

## File Structure

**Modified files:**
- `src/data/missions/givers/jovian-society.json` — rename ids/briefings on 5 entries, add 2 gather entries, add `'gather'` to `objectiveTypes`
- `src/data/contracts/jovian-society-prospection.json` — Step 2 drops `giverId: 'jovian-society'`
- `src/lib/contracts/ContractSystem.ts` — `matchesMissionEvent` honors `objectiveType` filter
- `src/lib/missions/asteroidMissionRewards.ts` — emit `objectiveType: mission.objectives[0]?.type ?? ''`
- `src/lib/missions/turretMiningRewards.ts` — emit `objectiveType: 'mining'`
- `src/views/MapView.vue` — emit `objectiveType: ''` for shuttle and eva (no clear slot type)
- `src/lib/contracts/__tests__/jovian-contract.spec.ts` — update synthetic events to include `objectiveType` per step
- `src/lib/contracts/__tests__/ContractSystem.spec.ts` — new matcher tests

**New tests:**
- New describe block in `ContractSystem.spec.ts` for `objectiveType` filter (3 tests)
- New focused tests in `src/lib/missions/__tests__/asteroidMissionRewards.spec.ts` and `src/lib/missions/__tests__/turretMiningRewards.spec.ts` verifying emission shape (1 test each)

---

## Task 1: Generic-ify the 5 existing Jovian Society entries

**Files:**
- Modify: `src/data/missions/givers/jovian-society.json`

This is a content task. The spec lists exact rename + tone-shift guidance per entry. Implementer takes the spec's sample briefings as the floor and may polish. No engine changes.

- [ ] **Step 1: Read the spec section "Generic-ifying the existing 5 entries"**

Read `docs/superpowers/specs/2026-04-29-jovian-giver-pool-expansion-design.md` lines 47-79. Note the rename guidance for each of the 5 entries.

- [ ] **Step 2: Rewrite `jovian_prelim_eval`**

In `src/data/missions/givers/jovian-society.json`, find `"id": "jovian_prelim_eval"`. Update:

- `"id"` → `"jovian_routine_telemetry"`
- `"name"` → `"Routine Asset Telemetry"`
- `"briefing"` → `"Per current portfolio review, the Society routes ad-hoc photometric coverage to qualified contractors. Standard pass: deploy probe, hold standoff, capture telemetry. Rates per the standing kiosk schedule. — Vance Hoyt, Asset Strategy."`

Keep `objectiveSlots`, `completionBonus`, `regionByDifficulty` unchanged.

- [ ] **Step 3: Rewrite `jovian_phase_two_scan`**

Find `"id": "jovian_phase_two_scan"`. Update:

- `"id"` → `"jovian_extraction_grade_telemetry"`
- `"name"` → `"Extraction-Grade Telemetry"`
- `"briefing"` → `"Higher tier, same protocol — extraction-grade tolerance for standoff drift and hold variance. Rates scale accordingly. Good telemetry returns advance the contractor's standing on our manifest. — Vance"`

Keep mechanics unchanged.

- [ ] **Step 4: Rewrite `jovian_subsurface_pass` briefing**

Find `"id": "jovian_subsurface_pass"`. Keep the id. Update:

- `"briefing"` → `"Per current portfolio review, the Society routes Dynamic Albedo of Neutrons surveys to qualified contractors. Emphasis on buried volatiles and lattice traces relevant to neutron-thruster production. Kindly capture clean return particles and disregard any sensor cross-talk inside the instrumentation envelope. Warm regards, Vance Hoyt."`

Keep `name`, `objectiveSlots`, `completionBonus`, `regionByDifficulty` unchanged.

- [ ] **Step 5: Leave `jovian_asset_substrate_recovery` as-is**

The spec confirms this entry's text already reads as generic recovery work. No edit needed.

- [ ] **Step 6: Rewrite `jovian_extraction_grade_dan`**

Find `"id": "jovian_extraction_grade_dan"`. Update:

- `"id"` → `"jovian_high_tier_dan"`
- `"name"` → `"High-Tier DAN Survey"`
- `"briefing"` → `"High-tier subsurface coverage at extraction-grade tolerance. Run a full Dynamic Albedo of Neutrons pass and classify any lattice-positive bands against the Phobos reference family. Please advise if elevated ambient disturbance compromises telemetry quality; otherwise continue the pass unless the hull is compromised. Warm regards, Vance Hoyt."`

Keep mechanics unchanged.

- [ ] **Step 7: Verify no test references the renamed ids**

Run: `bun test:unit 2>&1 | tail -10`
Expected: all green. If any test asserts on the old ids (`jovian_prelim_eval`, `jovian_phase_two_scan`, `jovian_extraction_grade_dan`), update the assertion to use the new ids.

Run: `grep -r "jovian_prelim_eval\|jovian_phase_two_scan\|jovian_extraction_grade_dan" src/`
Expected: no matches in source. (Use Grep tool, not bash.)

- [ ] **Step 8: Commit**

```bash
git add src/data/missions/givers/jovian-society.json
git commit -m "feat(missions): generic-ify Jovian Society giver entries for repeatable Vance work"
```

---

## Task 2: Add two gather missions to the Jovian Society pool

**Files:**
- Modify: `src/data/missions/givers/jovian-society.json`

- [ ] **Step 1: Add `jovian_substrate_gather`**

Append a new entry to the `missions` array in `src/data/missions/givers/jovian-society.json`:

```json
    {
      "id": "jovian_substrate_gather",
      "name": "Substrate Acquisition Run",
      "briefing": "Per current portfolio review, the Society maintains a rolling acquisition queue for surface-recovered substrate from candidate bodies. Standard pass: land, gather, return to any Cloud City intake. Rates per the standing kiosk schedule. — Vance Hoyt, Asset Strategy.",
      "objectiveSlots": [
        {
          "type": "gather",
          "weight": 1.0,
          "params": {
            "type": "gather",
            "resourceAmount": { "min": 60, "max": 110 }
          },
          "reward": { "min": 2400, "max": 5000 }
        }
      ],
      "completionBonus": { "min": 400, "max": 800 },
      "regionByDifficulty": { "jovian-trojans": [4, 7] }
    }
```

- [ ] **Step 2: Add `jovian_belt_gather`**

Append another entry:

```json
    {
      "id": "jovian_belt_gather",
      "name": "Deep-Cycle Substrate Run",
      "briefing": "Higher acquisition volume, deeper cycle, same compensation tier. Some pilots prefer the longer cycle for the quiet. Compensate yourself accordingly. — Vance",
      "objectiveSlots": [
        {
          "type": "gather",
          "weight": 1.0,
          "params": {
            "type": "gather",
            "resourceAmount": { "min": 90, "max": 160 }
          },
          "reward": { "min": 3200, "max": 6400 }
        }
      ],
      "completionBonus": { "min": 600, "max": 1200 },
      "regionByDifficulty": {
        "asteroid-belt": [5, 7],
        "jovian-trojans": [7, 9]
      }
    }
```

- [ ] **Step 3: Add `'gather'` to the giver's `objectiveTypes` array**

In the same file, find:

```json
  "objectiveTypes": ["photometry", "bunker", "dan"],
```

Replace with:

```json
  "objectiveTypes": ["photometry", "bunker", "dan", "gather"],
```

- [ ] **Step 4: Run type-check + tests**

Run: `bun run type-check && bun test:unit`
Expected: both pass. The new mission entries are pure JSON content — no type changes.

- [ ] **Step 5: Commit**

```bash
git add src/data/missions/givers/jovian-society.json
git commit -m "feat(missions): add Jovian Society gather missions and gather objectiveType"
```

---

## Task 3: Loosen Jovian contract Step 2's mining filter

**Files:**
- Modify: `src/data/contracts/jovian-society-prospection.json`

The contract's Step 2 (OP 2 — Demonstration Run, Belt Operations) currently filters on `giverId: 'jovian-society'`. Existing turret mining is per-planet, not per-giver, so the matcher rejects every mining completion. Per the spec, the cleanest resolution is to drop that filter and require only `missionType: 'mining'` + `giverPlanetId: 'jupiter'` — any Jupiter-board mining run counts as cohort recruiting throughput.

- [ ] **Step 1: Edit Step 2 of the Jovian contract JSON**

In `src/data/contracts/jovian-society-prospection.json`, find Step 2 (the second entry in the `steps` array, the one with `"subject": "OP 2 — Demonstration Run, Belt Operations"`). It currently looks like:

```json
    {
      "kind": "complete-missions",
      "count": 1,
      "missionType": "mining",
      "giverId": "jovian-society",
      "creditsReward": 1500,
      "subject": "OP 2 — Demonstration Run, Belt Operations",
      ...
    }
```

Replace `"giverId": "jovian-society"` with `"giverPlanetId": "jupiter"`. The result:

```json
    {
      "kind": "complete-missions",
      "count": 1,
      "missionType": "mining",
      "giverPlanetId": "jupiter",
      "creditsReward": 1500,
      "subject": "OP 2 — Demonstration Run, Belt Operations",
      ...
    }
```

(Keep all other fields — `flavor`, etc. — unchanged.)

- [ ] **Step 2: Update the Jovian contract test fixture**

In `src/lib/contracts/__tests__/jovian-contract.spec.ts`, find the `mining` event fixture (around the top of the file, near the `asteroid` fixture). It currently is:

```ts
const mining: MissionCompletedEvent = {
  kind: 'mining',
  giverPlanetId: 'jupiter',
  giverId: 'jovian-society',
  targetPlanetId: null,
}
```

Update `giverId` to `null` (since the contract no longer filters on giverId, and real mining events emit `giverId` based on the pool — null is the simplest faithful stub here):

```ts
const mining: MissionCompletedEvent = {
  kind: 'mining',
  giverPlanetId: 'jupiter',
  giverId: null,
  targetPlanetId: null,
}
```

- [ ] **Step 3: Run tests**

Run: `bun test:unit src/lib/contracts/__tests__/`
Expected: all green. The Jovian walkability test should still drive the contract through Step 2 because the matcher accepts the mining event on `giverPlanetId: 'jupiter'`.

- [ ] **Step 4: Commit**

```bash
git add src/data/contracts/jovian-society-prospection.json src/lib/contracts/__tests__/jovian-contract.spec.ts
git commit -m "feat(contracts): loosen Jovian Step 2 to any Jupiter-board mining mission"
```

---

## Task 4: Tighten `matchesMissionEvent` to honor `objectiveType` filter

**Files:**
- Modify: `src/lib/contracts/ContractSystem.ts`
- Modify: `src/lib/contracts/__tests__/ContractSystem.spec.ts`

The matcher in `ContractSystem.ts` currently checks `missionType`, `giverId`, and `giverPlanetId`. Plan 2 added `objectiveType` as an optional field on `CompleteMissionsStep` and `MissionCompletedEvent` but left the matcher ignoring it. This task wires the filter.

- [ ] **Step 1: Write the failing tests in ContractSystem.spec.ts**

Append a new `describe('objectiveType filter', ...)` block at the bottom of `src/lib/contracts/__tests__/ContractSystem.spec.ts`. Use the file's existing `emptyMessageStore` and `inMemoryPersistence` helpers.

```ts
describe('objectiveType filter', () => {
  beforeEach(() => {
    // Mirror the file's existing storage-reset pattern.
    for (const key of Object.keys(mockStorage)) delete mockStorage[key]
  })

  it('advances when the event objectiveType matches the step filter', () => {
    const c: Contract = {
      id: 'objtype-match',
      inboxName: 'OT',
      from: 't',
      sentAt: TEST_DATE,
      introSubject: 'OT',
      introBody: ['ot'],
      steps: [
        {
          kind: 'complete-missions',
          count: 1,
          missionType: 'asteroid',
          objectiveType: 'photometry',
          subject: 's',
          flavor: ['f'],
        },
      ],
      completionSubject: 'd',
      completionBody: ['d'],
      rewards: [],
    }
    const messages = new MessageSystem(emptyMessageStore())
    const contracts = new ContractSystem([c], messages, inMemoryPersistence())
    contracts.resetForTests()
    contracts.offerForTests('objtype-match')
    contracts.acceptContract('objtype-match')
    contracts.notifyMissionCompleted({
      kind: 'asteroid',
      giverPlanetId: null,
      giverId: null,
      targetPlanetId: null,
      objectiveType: 'photometry',
    })
    expect(contracts.getInstance('objtype-match')?.status).toBe('completed')
  })

  it('does NOT advance when the event objectiveType differs from the filter', () => {
    const c: Contract = {
      id: 'objtype-miss',
      inboxName: 'OT',
      from: 't',
      sentAt: TEST_DATE,
      introSubject: 'OT',
      introBody: ['ot'],
      steps: [
        {
          kind: 'complete-missions',
          count: 1,
          missionType: 'asteroid',
          objectiveType: 'photometry',
          subject: 's',
          flavor: ['f'],
        },
      ],
      completionSubject: 'd',
      completionBody: ['d'],
      rewards: [],
    }
    const messages = new MessageSystem(emptyMessageStore())
    const contracts = new ContractSystem([c], messages, inMemoryPersistence())
    contracts.resetForTests()
    contracts.offerForTests('objtype-miss')
    contracts.acceptContract('objtype-miss')
    contracts.notifyMissionCompleted({
      kind: 'asteroid',
      giverPlanetId: null,
      giverId: null,
      targetPlanetId: null,
      objectiveType: 'dan',
    })
    expect(contracts.getInstance('objtype-miss')?.status).toBe('active')
  })

  it('advances when the step has NO objectiveType filter (legacy behavior unchanged)', () => {
    const c: Contract = {
      id: 'objtype-omitted',
      inboxName: 'OT',
      from: 't',
      sentAt: TEST_DATE,
      introSubject: 'OT',
      introBody: ['ot'],
      steps: [
        {
          kind: 'complete-missions',
          count: 1,
          missionType: 'asteroid',
          subject: 's',
          flavor: ['f'],
        },
      ],
      completionSubject: 'd',
      completionBody: ['d'],
      rewards: [],
    }
    const messages = new MessageSystem(emptyMessageStore())
    const contracts = new ContractSystem([c], messages, inMemoryPersistence())
    contracts.resetForTests()
    contracts.offerForTests('objtype-omitted')
    contracts.acceptContract('objtype-omitted')
    contracts.notifyMissionCompleted({
      kind: 'asteroid',
      giverPlanetId: null,
      giverId: null,
      targetPlanetId: null,
      // No objectiveType — should still advance because the step doesn't filter.
    })
    expect(contracts.getInstance('objtype-omitted')?.status).toBe('completed')
  })
})
```

- [ ] **Step 2: Run tests, verify failure**

Run: `bun test:unit src/lib/contracts/__tests__/ContractSystem.spec.ts -t "objectiveType filter"`
Expected: FAIL on the second test (the matcher currently ignores `objectiveType`, so the event with `'dan'` would pass the filter and advance the step — wrong).

- [ ] **Step 3: Tighten `matchesMissionEvent`**

In `src/lib/contracts/ContractSystem.ts`, find the existing `matchesMissionEvent` free function (near the bottom of the file). Replace with:

```ts
/** True when a `complete-missions` step matches the supplied event filters. */
function matchesMissionEvent(
  step: {
    missionType?: string
    giverId?: string
    giverPlanetId?: string
    objectiveType?: string
  },
  event: MissionCompletedEvent,
): boolean {
  if (step.missionType !== undefined && step.missionType !== event.kind) return false
  if (step.giverId !== undefined && step.giverId !== event.giverId) return false
  if (step.giverPlanetId !== undefined && step.giverPlanetId !== event.giverPlanetId) return false
  if (step.objectiveType !== undefined && step.objectiveType !== event.objectiveType) return false
  return true
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `bun test:unit src/lib/contracts/__tests__/ContractSystem.spec.ts -t "objectiveType filter"`
Expected: all 3 tests pass.

- [ ] **Step 5: Run full contract test suite**

Run: `bun test:unit src/lib/contracts/__tests__/`

The Jovian walkability test in `jovian-contract.spec.ts` will likely fail now: the synthetic `asteroid` event has no `objectiveType`, but Jovian Steps 4 and 7 filter on `objectiveType: 'photometry'`/`'dan'` and Step 1 filters on `objectiveType: 'gather'`. Task 6 fixes the test fixtures.

For now, expect failures in `jovian-contract.spec.ts`. Don't fix them in this task — Task 6 owns it.

- [ ] **Step 6: Commit**

```bash
git add src/lib/contracts/ContractSystem.ts src/lib/contracts/__tests__/ContractSystem.spec.ts
git commit -m "feat(contracts): honor objectiveType filter on complete-missions matcher"
```

---

## Task 5: Populate `objectiveType` at every emission site

**Files:**
- Modify: `src/lib/missions/asteroidMissionRewards.ts`
- Modify: `src/lib/missions/turretMiningRewards.ts`
- Modify: `src/views/MapView.vue`
- Modify: `src/lib/missions/__tests__/asteroidMissionRewards.spec.ts`
- Modify: `src/lib/missions/__tests__/turretMiningRewards.spec.ts`

Four emission sites populate `MissionCompletedEvent`. Each needs `objectiveType` set:
1. Asteroid missions → `mission.objectives[0]?.type ?? ''` (the primary objective slot type, e.g. `'photometry'`, `'dan'`, `'gather'`, `'bunker'`)
2. Turret mining → `'mining'` (the family is the only meaningful objective type)
3. Shuttle planetary missions → `''` (no clear single slot type; the contract's `'shuttle'` family doesn't currently use the `objectiveType` filter)
4. EVA waypoint missions → `''` (same reasoning)

### Step 1: Update `asteroidMissionRewards.ts`

In `src/lib/missions/asteroidMissionRewards.ts`, find the `contractSystem.notifyMissionCompleted({...})` block at the end of `persistCompletedAsteroidMissionRewards`. Replace it with:

```ts
  contractSystem.notifyMissionCompleted({
    kind: 'asteroid',
    giverPlanetId: null,
    giverId: mission.giverId ?? null,
    targetPlanetId: null,
    objectiveType: mission.objectives[0]?.type ?? '',
  })
```

### Step 2: Add a focused emission test in `asteroidMissionRewards.spec.ts`

In `src/lib/missions/__tests__/asteroidMissionRewards.spec.ts`, near the imports add:

```ts
import { contractSystem } from '@/lib/contracts/runtime'
```

Append a new test inside the existing `describe('persistCompletedAsteroidMissionRewards', ...)` block:

```ts
  it('emits MissionCompletedEvent with objectiveType drawn from the primary objective slot', () => {
    const mission: GeneratedAsteroidMission = {
      ...BASE_MISSION,
      id: 'objtype-test',
      objectives: [
        {
          type: 'photometry',
          x: 0,
          z: 0,
        },
      ],
    }
    localStorage.setItem(ACTIVE_MISSION_KEY, JSON.stringify(mission))
    const spy = vi.spyOn(contractSystem, 'notifyMissionCompleted')
    persistCompletedAsteroidMissionRewards(mission, 1)
    const callArg = spy.mock.calls[0]?.[0]
    expect(callArg?.objectiveType).toBe('photometry')
    spy.mockRestore()
  })

  it('emits objectiveType: "" when objectives array is empty', () => {
    const mission: GeneratedAsteroidMission = {
      ...BASE_MISSION,
      id: 'objtype-empty',
      objectives: [],
    }
    localStorage.setItem(ACTIVE_MISSION_KEY, JSON.stringify(mission))
    const spy = vi.spyOn(contractSystem, 'notifyMissionCompleted')
    persistCompletedAsteroidMissionRewards(mission, 1)
    const callArg = spy.mock.calls[0]?.[0]
    expect(callArg?.objectiveType).toBe('')
    spy.mockRestore()
  })
```

(`vi` is already imported at the top of the file — see line 1.)

### Step 3: Update `turretMiningRewards.ts`

In `src/lib/missions/turretMiningRewards.ts`, find the `contractSystem.notifyMissionCompleted({...})` block. Replace with:

```ts
  contractSystem.notifyMissionCompleted({
    kind: 'mining',
    giverPlanetId: mission.giverPlanet,
    giverId,
    targetPlanetId: null,
    objectiveType: 'mining',
  })
```

### Step 4: Add a focused emission test in `turretMiningRewards.spec.ts`

Add `vi` to the existing vitest import and import `contractSystem`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { contractSystem } from '@/lib/contracts/runtime'
```

Then append a new test inside the existing `describe('deliverTurretMiningMission', ...)` block. This mirrors the existing "delivers a specific-ore mission" test:

```ts
  it('emits MissionCompletedEvent with objectiveType: "mining" and giverPlanetId from the mission', () => {
    const mission = activeMission({
      template: template({ oreCategory: 'olivine', targetKg: 150, reward: 1200 }),
      giverPlanet: 'jupiter',
    })
    const board = { ...createMissionBoard(), activeMiningMissions: [mission] }
    const withOre = addItem(createInventory(), 'olivine', 200).inventory
    const spy = vi.spyOn(contractSystem, 'notifyMissionCompleted')
    deliverTurretMiningMission(board, mission.template.id, 'jupiter', withOre, profile(0), 1)
    const callArg = spy.mock.calls[0]?.[0]
    expect(callArg?.kind).toBe('mining')
    expect(callArg?.objectiveType).toBe('mining')
    expect(callArg?.giverPlanetId).toBe('jupiter')
    spy.mockRestore()
  })
```

### Step 5: Update `MapView.vue` (shuttle and eva emissions)

In `src/views/MapView.vue`, find the `viewController.onEvaMissionComplete = (mission) => {...}` handler. Inside the `contractSystem.notifyMissionCompleted({...})` call, add:

```ts
        objectiveType: '',
```

Then find the `viewController.onMissionDeliver = (mission) => {...}` handler (the shuttle one). Inside its `contractSystem.notifyMissionCompleted({...})` call, add:

```ts
          objectiveType: '',
```

(Both shuttle and eva emit empty strings because no contract currently filters on a shuttle/eva slot type. Plan 4 may revisit if special missions add slot-typed steps.)

### Step 6: Run type-check + tests

Run: `bun run type-check`
Expected: PASS.

Run: `bun test:unit src/lib/missions/__tests__/`
Expected: PASS (existing + 3 new emission tests).

(`jovian-contract.spec.ts` likely still fails — Task 6 fixes it.)

### Step 7: Commit

```bash
git add src/lib/missions/asteroidMissionRewards.ts \
        src/lib/missions/turretMiningRewards.ts \
        src/views/MapView.vue \
        src/lib/missions/__tests__/asteroidMissionRewards.spec.ts \
        src/lib/missions/__tests__/turretMiningRewards.spec.ts
git commit -m "feat(missions): populate objectiveType on every MissionCompletedEvent emission"
```

---

## Task 6: Update Jovian contract test to include `objectiveType` per step

**Files:**
- Modify: `src/lib/contracts/__tests__/jovian-contract.spec.ts`

After Task 4 tightened the matcher and Task 5 populated emission sites, the synthetic events in the Jovian walkability test must include `objectiveType` to satisfy the contract's per-step filters (Steps 1, 4, 5, 7, 8 all filter on `objectiveType`). Step 2's mining filter no longer requires `giverId` (Task 3) so its event matches with just `kind: 'mining'` + `giverPlanetId: 'jupiter'` + `objectiveType: 'mining'`.

- [ ] **Step 1: Replace the synthetic event helpers**

In `src/lib/contracts/__tests__/jovian-contract.spec.ts`, find the `mining` and `asteroid` constant fixtures near the top of the file. Replace them with per-objective variants:

```ts
const mining: MissionCompletedEvent = {
  kind: 'mining',
  giverPlanetId: 'jupiter',
  giverId: null,
  targetPlanetId: null,
  objectiveType: 'mining',
}

const asteroidGather: MissionCompletedEvent = {
  kind: 'asteroid',
  giverPlanetId: 'jupiter',
  giverId: 'jovian-society',
  targetPlanetId: null,
  objectiveType: 'gather',
}

const asteroidPhotometry: MissionCompletedEvent = {
  kind: 'asteroid',
  giverPlanetId: 'jupiter',
  giverId: 'jovian-society',
  targetPlanetId: null,
  objectiveType: 'photometry',
}

const asteroidDan: MissionCompletedEvent = {
  kind: 'asteroid',
  giverPlanetId: 'jupiter',
  giverId: 'jovian-society',
  targetPlanetId: null,
  objectiveType: 'dan',
}
```

(Remove the old `asteroid` constant — it's replaced by the three typed variants above.)

- [ ] **Step 2: Update `driveToChoice` to use the right typed event per step**

In the same file, find the `driveToChoice(contracts: ContractSystem)` helper. Replace its body so each step gets the right `objectiveType`:

```ts
  function driveToChoice(contracts: ContractSystem) {
    // Step 1 (OP 1): asteroid + gather
    contracts.notifyMissionCompleted(asteroidGather)
    // Step 2 (OP 2): mining + Jupiter board
    contracts.notifyMissionCompleted(mining)
    // Step 3 (OP 3): collect-drops 3 viroid-psychosphere
    for (let i = 0; i < 3; i++) {
      contracts.notifyDropCollected({ itemId: 'viroid-psychosphere', quantity: 1 })
    }
    // Step 4 (OP 4): asteroid + photometry
    contracts.notifyMissionCompleted(asteroidPhotometry)
    // Step 5 (OP 5): asteroid + photometry (Saturn region; targetRegion still ignored per plan 5)
    contracts.notifyMissionCompleted(asteroidPhotometry)
    // Step 6 (OP 6): collect-drops 8
    for (let i = 0; i < 8; i++) {
      contracts.notifyDropCollected({ itemId: 'viroid-psychosphere', quantity: 1 })
    }
    // Step 7 (OP 7): asteroid + dan
    contracts.notifyMissionCompleted(asteroidDan)
    // Step 8 (OP 8): asteroid + dan (Saturn region; targetRegion still ignored)
    contracts.notifyMissionCompleted(asteroidDan)
  }
```

- [ ] **Step 3: Run the Jovian walkability tests**

Run: `bun test:unit src/lib/contracts/__tests__/jovian-contract.spec.ts`
Expected: all 6 tests pass.

- [ ] **Step 4: Run the full unit suite**

Run: `bun test:unit`
Expected: full green; no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contracts/__tests__/jovian-contract.spec.ts
git commit -m "test(contracts): use per-objective events to satisfy tightened Jovian filters"
```

---

## Task 7: Acceptance gate

- [ ] **Step 1: Type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 2: Lint**

Run: `bun run lint`
Expected: oxlint 0 errors, ESLint 0 errors / 0 warnings, all shaders pass.

If any TSDoc warnings appear on changed exports, fix in place.

- [ ] **Step 3: Full unit suite**

Run: `bun test:unit`
Expected: full green.

- [ ] **Step 4: Manual — generic feel (optional, dev verify)**

Start the dev server (`bun dev`), visit Jupiter on the map, open the Society mission board. Verify:
- Renamed missions read as routine cycle work, no "stakeholders are watching" / "your file advances the queue" phrasing.
- Two new gather missions surface on the board.
- Briefings are Vance-voiced (corporate, ledger-flavored).

- [ ] **Step 5: Manual — pre-contract play (optional, dev verify)**

Without accepting the Jovian contract, accept and complete a Society photometry mission. Verify it surfaces and pays out cleanly. Repeat with the new gather mission.

- [ ] **Step 6: Manual — regression check (optional, dev verify)**

Verify Belt Mining Corp gather missions still surface and complete normally; Cinderline / marines / cowboys contracts still progress.

- [ ] **Step 7: Final cleanup commit if anything is dirty**

```bash
git status
# only if something is uncommitted from polish:
git add -A
git commit -m "chore(contracts): plan-3 final cleanup"
```

---

## Notes for the implementer

- **Three orthogonal slices.** Tasks 1-2 are content edits to `jovian-society.json` — pure JSON, no engine. Tasks 4-5 are engine edits — the matcher widens and emission sites populate `objectiveType`. Tasks 3, 6 are JSON/test alignment that ride on the engine change. The plan separates them so each commit lands with cohesive scope.
- **Why Step 2 drops `giverId` rather than adding mining giver attribution.** The spec's "Resolution" path A: existing turret mining is per-planet, not per-giver, and propagating `giverId` through mining would require new content. Cohort recruiting tone supports "any Jupiter belt run counts" — see spec lines 96-105. Path B (attribution via `giverIdHint`) is deferred indefinitely.
- **`objectiveType: ''` on shuttle/eva emissions.** Plan 3 doesn't filter shuttle/eva missions on `objectiveType`. Empty string makes the filter reject anything that *would* filter on it, which is a safer default than a guessed slot type. Plan 4 may revisit.
- **Per-outcome emission tests use `vi.spyOn` on the singleton.** `contractSystem` is the live runtime singleton; spying on its `notifyMissionCompleted` from the per-site test isolates the emission shape without re-implementing the full rewards path.
- **`MissionCompletedEvent.objectiveType` is already optional from plan 2.** No type widening needed; the field exists.
