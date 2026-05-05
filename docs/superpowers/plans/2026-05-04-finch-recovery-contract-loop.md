# Finch Recovery Contract Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a playable Finch Recovery contract loop — six contract steps (Saturn → Mars → Venus → Earth → Ceres → Neptune) that auto-stage either a telescope-EVA mission or a standard bunker mission per stop, with Saturn fast-travel + 2× pay-multiplier on completion. **No** Power Loader boss, **no** Carmen post-game letters, **no** deep archive, **no** grappling hook, **no** story flags.

**Architecture:** Reuse the existing `complete-missions` step kind with `specialMissionId` + `revealsBody` (same pattern as Jovian Society Prospection). Extend the special-mission system today's asteroid-only dispatch to also recognize planet-targeted missions (`evaPoiType: 'telescope'` and `bunkerSiteId`) and route them through the EVA mission board (`offeredEvaMission` / `activeEvaMissions`) instead of the asteroid-mission board. Author six new `kind: "special"` mission JSONs — three telescope EVAs and three bunker EVAs — register their offer-message ids, and validate the loop end-to-end on `/map`.

**Tech Stack:** Vue 3 + TypeScript + Vite, Pinia, Vitest. Files under `src/data/contracts/`, `src/data/missions/`, `src/lib/contracts/`, `src/lib/missions/`, `src/views/MapViewController.ts`.

---

## File Structure

**Files to modify:**
- `src/data/contracts/finch-recovery.json` — strip to scope, switch to `complete-missions` schema.
- `src/views/MapViewController.ts` — extend `stageSpecialMission` and `SPECIAL_MISSION_OFFER_IDS` to dispatch planet-targeted (EVA / bunker) special missions onto the EVA board.
- `src/lib/missions/specialMissions.ts` (or wherever `getSpecialMissionById` lives) — broaden the special-mission union to include planet-targeted variants.
- `src/lib/missions/types.ts` — extend `SpecialAsteroidMission` (or add a sibling type) so planet-targeted special missions validate.

**Files to create (six special-mission JSONs):**
- `src/data/missions/finch-recovery-saturn-telescope.json`
- `src/data/missions/finch-recovery-mars-bunker.json`
- `src/data/missions/finch-recovery-venus-telescope.json`
- `src/data/missions/finch-recovery-earth-telescope.json`
- `src/data/missions/finch-recovery-ceres-bunker.json`
- `src/data/missions/finch-recovery-neptune-bunker.json`

**Tests to create / extend:**
- `src/lib/contracts/__tests__/finch-recovery-contract.spec.ts` — step-by-step contract walkthrough (mirrors `jovian-contract.spec.ts`).
- `src/lib/missions/__tests__/specialMissions.spec.ts` — schema validation that the six new special-missions load and resolve.

---

## Phase 1 — Reshape the contract JSON

The existing `finch-recovery.json` was authored against the planned `kind: "contract-mission"` schema and references reward types (`delayed-inbox`, `install-suit-tool`, `open-giver-line`, `offer-special-mission`) that don't exist in `contractTypes.ts`. We strip it to the implemented schema (`complete-missions` + `specialMissionId` + `revealsBody`), drop the post-game rewards, and replace Step 6 (`carmen-boss-bunker`) with a standard bunker.

### Task 1: Snapshot the existing JSON before rewrite

**Files:**
- Read: `src/data/contracts/finch-recovery.json`

- [ ] **Step 1: Confirm starting state**

Run: `git status src/data/contracts/finch-recovery.json`
Expected: working tree clean for this file.

- [ ] **Step 2: Confirm the contract isn't loaded by any active fixture beyond `contractCatalog`**

Run from repo root:
```bash
grep -rn "finch-recovery" src/lib src/views src/components | head
```
Expected: only `contractCatalog.ts` (or wherever contract JSONs are statically imported) references the id. If any test references it, note for Phase 1 Task 4.

### Task 2: Write a failing contract walkthrough test

**Files:**
- Create: `src/lib/contracts/__tests__/finch-recovery-contract.spec.ts`

- [ ] **Step 1: Write the failing test**

Use `jovian-contract.spec.ts` as the template — same setup pattern (instantiate `ContractSystem`, accept the contract, drive it step-by-step by emitting `complete-missions` completions, assert `currentStepIndex` advances and `revealsBody` events fire on the right steps).

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { ContractSystem } from '../ContractSystem'
import type { ContractStepActivatedPayload } from '../ContractSystem'
import finchRecovery from '@/data/contracts/finch-recovery.json'

describe('Finch Recovery contract', () => {
  let system: ContractSystem

  beforeEach(() => {
    system = new ContractSystem({
      contracts: [finchRecovery as never],
      messageSystem: makeFakeMessageSystem(),
      persistence: makeMemoryPersistence(),
    })
  })

  it('exposes six steps and Saturn home-planet rewards', () => {
    const contract = system.getContract('finch-recovery')!
    expect(contract.steps).toHaveLength(6)
    expect(contract.rewards).toEqual(
      expect.arrayContaining([
        { type: 'fast-travel', planetId: 'saturn' },
        { type: 'mission-pay-multiplier', planetId: 'saturn', multiplier: 2 },
      ]),
    )
  })

  it('auto-activates the Saturn telescope EVA on accept and reveals Mars on completion', () => {
    const events: ContractStepActivatedPayload[] = []
    system.subscribeStepActivated((p) => events.push(p))
    system.acceptContract('finch-recovery')

    expect(events.at(-1)).toMatchObject({
      stepIndex: 0,
      specialMissionId: 'finch-recovery-saturn-telescope',
    })

    system.notifyMissionCompleted({ missionId: 'finch-recovery-saturn-telescope' })
    expect(events.at(-1)).toMatchObject({
      stepIndex: 1,
      specialMissionId: 'finch-recovery-mars-bunker',
      revealsBody: 'mars',
    })
  })
})
```

(Reuse the `makeFakeMessageSystem` / `makeMemoryPersistence` helpers from `jovian-contract.spec.ts`. If they aren't exported, copy them into the new spec file.)

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bun test:unit src/lib/contracts/__tests__/finch-recovery-contract.spec.ts`
Expected: FAIL — JSON schema mismatch (current step kind is `"contract-mission"`, not `"complete-missions"`), so the contract definition won't even parse.

### Task 3: Rewrite `finch-recovery.json` to the implemented schema

**Files:**
- Modify: `src/data/contracts/finch-recovery.json` (full rewrite)

- [ ] **Step 1: Replace the file body**

```json
{
  "id": "finch-recovery",
  "inboxName": "Mr. Finch",
  "from": "Mr. Finch, Saturn Ringside Estate",
  "sentAt": "2306-05-18 22:14 UTC",
  "homePlanet": "saturn",
  "offerWhenPrerequisites": {
    "minGiverPlanetCompletions": { "planetId": "saturn", "min": 1 },
    "triggerOnPlanetVisited": "saturn"
  },
  "introSubject": "A Quiet Inquiry, At Some Length",
  "introBody": [
    "[bored] Young pilot,",
    "I have been stolen from. I had not been stolen from in some time. It is, I confess, refreshing.",
    "The party responsible is a young woman who calls herself Madame Sedna-Deimos — Carmen, professionally. She removed a small hardware wallet from my study. The contents are of considerable size, financially speaking, and there are also certain personal records on the device to which I am, for reasons I shall not bore you with, attached. I would like the device returned. Intact, if possible. As-found, if not.",
    "I have a still photograph from the estate's perimeter cameras. The horizon behind her, regrettably, is not clear. I am told a properly tuned long-baseline telescope can extract the relevant detail.",
    "Six stops, I should think. The compensation is correspondingly serious.",
    "Two notes. First — Madame Sedna-Deimos is, by her conduct, not a violent person. Recovery is the brief. The brief is recovery. Second — the authorities are not to be involved at any stage, on any pretext.",
    "— Halloran"
  ],
  "steps": [
    {
      "kind": "complete-missions",
      "specialMissionId": "finch-recovery-saturn-telescope",
      "revealsBody": "mars",
      "creditsReward": 1500,
      "subject": "Step 1 — She Has Not Yet Been Seen",
      "flavor": [
        "[bored] Young pilot,",
        "The photograph is in your secure inbox; the EVA listing is on the Saturn ringside spaceport board, posted under my name. The telescope — long-baseline, calibrated for horizon detail — is at the listed site.",
        "Tune the long-baseline telescope until our Madame's surroundings resolve. I am told the relevant detail is the horizon. I am told you will know it when you see it.",
        "— Finch"
      ]
    },
    {
      "kind": "complete-missions",
      "specialMissionId": "finch-recovery-mars-bunker",
      "revealsBody": "venus",
      "creditsReward": 2000,
      "subject": "Step 2 — A Trail at Mars",
      "flavor": [
        "Young pilot,",
        "Mars confirms the trail. Our Madame appears to have used an abandoned Marines training bunker as a transfer point — local intelligence indicates the site is overrun and effectively forgotten by the Corps.",
        "Clear what is in the bunker. Recover what she left in it.",
        "— Finch"
      ]
    },
    {
      "kind": "complete-missions",
      "specialMissionId": "finch-recovery-venus-telescope",
      "revealsBody": "earth",
      "creditsReward": 2500,
      "subject": "Step 3 — A Floor Camera at Venus",
      "flavor": [
        "[amused] Young pilot,",
        "The fence — was — at the Zeppelin Exchange. The floor cameras at that establishment are real and they captured a transaction. The horizon, again, is the matter of interest.",
        "Tune your knobs.",
        "— Finch"
      ]
    },
    {
      "kind": "complete-missions",
      "specialMissionId": "finch-recovery-earth-telescope",
      "revealsBody": "ceres",
      "creditsReward": 3000,
      "subject": "Step 4 — A Posed Photograph at Earth",
      "flavor": [
        "[amused] Young pilot,",
        "The Earth image is from a private gallery. The composition is the composition of someone who is now aware she is being followed and has decided to make a study of the matter.",
        "Tune the image. The destination is in the photograph. She placed it there.",
        "— Finch"
      ]
    },
    {
      "kind": "complete-missions",
      "specialMissionId": "finch-recovery-ceres-bunker",
      "revealsBody": "neptune",
      "creditsReward": 4000,
      "subject": "Step 5 — A Letter at Ceres",
      "flavor": [
        "Young pilot,",
        "Ceres. An exhausted nickel-platinum operation, decommissioned in the early colonization era, never properly sealed. Our Madame appears to favor the sites that no one is paying to remember.",
        "What you find at the end is for you. I have asked for nothing from this stop except that you survive it.",
        "— Finch"
      ]
    },
    {
      "kind": "complete-missions",
      "specialMissionId": "finch-recovery-neptune-bunker",
      "creditsReward": 8000,
      "subject": "Step 6 — Neptune, End of the Trail",
      "flavor": [
        "Young pilot,",
        "Neptune. The end of the trail. The brief, again, is recovery. Anything beyond that is between you and her.",
        "When you are finished, return to Saturn. I shall have the closeout ready.",
        "— Finch"
      ]
    }
  ],
  "completionSubject": "Concluded — With Thanks",
  "completionBody": [
    "[soft] Young pilot,",
    "It is in my hand. It has been in my hand for an hour. I have not opened it yet. I shall, in my own time.",
    "Your closeout has been credited. The Saturn pay multiplier is now in effect on contracts posted from this estate; the spaceport's traffic control has been instructed to extend you fast-travel return privileges in perpetuity.",
    "[long pause] With thanks.",
    "— Halloran"
  ],
  "rewards": [
    { "type": "fast-travel", "planetId": "saturn" },
    { "type": "mission-pay-multiplier", "planetId": "saturn", "multiplier": 2 }
  ]
}
```

- [ ] **Step 2: Type-check**

Run: `bun run type-check`
Expected: PASS. (If it fails, the contract loader's TS shape may need updating — fix the type, not the JSON.)

- [ ] **Step 3: Run the new test**

Run: `bun test:unit src/lib/contracts/__tests__/finch-recovery-contract.spec.ts`
Expected: still FAIL — but now with a different error: `Special mission not found: finch-recovery-saturn-telescope`. This is correct: the JSON now parses, the contract activates step 0 with the right id, but the mission JSON doesn't exist yet. Phase 3 fixes this.

### Task 4: Commit

- [ ] **Step 1: Commit**

```bash
git add src/data/contracts/finch-recovery.json src/lib/contracts/__tests__/finch-recovery-contract.spec.ts
git commit -m "$(cat <<'EOF'
feat(finch): reshape contract JSON to complete-missions schema

Strips post-game rewards (delayed-inbox letters, deep archive, grappling
hook), replaces Step 6 boss with a standard bunker, and switches all six
steps from the unimplemented contract-mission kind to the existing
complete-missions kind with specialMissionId + revealsBody. Saturn
fast-travel and 2x pay multiplier are the only rewards.

Walkthrough test added; currently red on missing special-mission JSONs
(authored in a follow-up).
EOF
)"
```

---

## Phase 2 — Extend the special-mission system to dispatch planet-targeted EVA + bunker missions

Today's special-mission system targets asteroids only: `getSpecialMissionById` returns a `GeneratedAsteroidMission`, and `MapViewController.stageSpecialMission` writes it into `missionBoard.activeAsteroidMission`. Finch needs three telescope EVAs (planet-targeted) and three bunker EVAs (planet-targeted), which both belong on the EVA board (`offeredEvaMission` / `activeEvaMissions`), not the asteroid board.

We add a discriminated `kind: "special"` variant for planet-targeted EVA missions, route it through `acceptEvaMission` instead of the asteroid slot, and keep the existing asteroid-special path untouched.

> **Discovery note:** Before each task in this phase, spend ~3 minutes reading the current `getSpecialMissionById`, `stageSpecialMission`, and `acceptEvaMission` to confirm the exact shape of `ShuttleMissionBoard`. The tasks below describe the *intent* of the change; the exact field names may need to track the existing types.

### Task 5: Add a discriminated planet-EVA special-mission type

**Files:**
- Modify: `src/lib/missions/types.ts` (search for `AsteroidMissionKind` and the special-mission shape).
- Modify: `src/lib/missions/specialMissions.ts` (or wherever `getSpecialMissionById` is defined — `grep -rn "getSpecialMissionById" src/lib/missions`).

- [ ] **Step 1: Write the failing schema test**

Create or extend `src/lib/missions/__tests__/specialMissions.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getSpecialMissionById } from '@/lib/missions/specialMissions'

describe('planet-targeted special missions', () => {
  it('loads the Saturn telescope EVA', () => {
    const m = getSpecialMissionById('finch-recovery-saturn-telescope')
    expect(m).toBeDefined()
    expect(m!.kind).toBe('special')
    expect(m!.target).toEqual({ kind: 'planet-eva', planetId: 'saturn', poiType: 'telescope' })
  })

  it('loads the Mars bunker EVA', () => {
    const m = getSpecialMissionById('finch-recovery-mars-bunker')
    expect(m!.target).toEqual({ kind: 'planet-eva', planetId: 'mars', poiType: 'bunker' })
  })
})
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `bun test:unit src/lib/missions/__tests__/specialMissions.spec.ts`
Expected: FAIL — `getSpecialMissionById` returns `undefined` for those ids; types don't include `target`.

- [ ] **Step 3: Add the discriminated `target` union**

In `src/lib/missions/types.ts`, add (or place next to the existing special-mission interface):

```ts
/**
 * Where a `kind: 'special'` mission is staged.
 *
 * - `'asteroid'` — current behavior; mission is placed on the asteroid mission slot
 *   and pinned to `asteroidId` in the procedural belt.
 * - `'planet-eva'` — mission is placed on the EVA mission board for `planetId`,
 *   spawning a single POI of `poiType` (currently `'telescope'` or `'bunker'`).
 *
 * @author guinetik
 * @date 2026-05-04
 * @spec docs/superpowers/plans/2026-05-04-finch-recovery-contract-loop.md
 */
export type SpecialMissionTarget =
  | { kind: 'asteroid'; asteroidId: string; region: string }
  | { kind: 'planet-eva'; planetId: string; poiType: 'telescope' | 'bunker' }
```

Update the special-mission interface to carry `target`. Existing asteroid JSONs (`jovian-prospection-*`, `consortium-certification`) currently use top-level `asteroidId`/`region` — keep a backwards-compat reader in `getSpecialMissionById` that synthesizes `target: { kind: 'asteroid', asteroidId, region }` when the JSON lacks an explicit `target`. New JSONs declare `target` directly.

- [ ] **Step 4: Run the test, confirm it passes**

Run: `bun test:unit src/lib/missions/__tests__/specialMissions.spec.ts`
Expected: still FAIL on `getSpecialMissionById('finch-recovery-saturn-telescope')` returning `undefined` — the JSON files don't exist yet. Phase 3 authors them. **Skip ahead** to keep the schema test honest: write a *unit* test that calls a hypothetical `parseSpecialMission(rawJson)` against an inline JSON literal so this task can land green now. Add the file-discovery test back in Phase 3.

```ts
import { parseSpecialMission } from '@/lib/missions/specialMissions'

it('parses a planet-eva special-mission JSON', () => {
  const parsed = parseSpecialMission({
    kind: 'special',
    id: 'test-saturn-telescope',
    giverId: 'mr-finch',
    giverName: 'Mr. Finch',
    templateId: 'test-saturn-telescope',
    name: 'Test',
    briefing: '...',
    difficulty: 1,
    target: { kind: 'planet-eva', planetId: 'saturn', poiType: 'telescope' },
    objectives: [],
    totalReward: 0,
    waypoint: { worldX: 0, worldZ: 0 },
    status: 'available',
  })
  expect(parsed.target).toEqual({ kind: 'planet-eva', planetId: 'saturn', poiType: 'telescope' })
})
```

Run: `bun test:unit src/lib/missions/__tests__/specialMissions.spec.ts`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `bun run type-check`
Expected: PASS. (If existing asteroid JSONs fail, fix their loader to synthesize `target` rather than touch every JSON.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/missions/types.ts src/lib/missions/specialMissions.ts src/lib/missions/__tests__/specialMissions.spec.ts
git commit -m "feat(missions): add planet-eva target to special-mission schema"
```

### Task 6: Branch `MapViewController.stageSpecialMission` on target kind

**Files:**
- Modify: `src/views/MapViewController.ts` around `stageSpecialMission` (line 4519) and `handleContractStepActivated` (line 4565).

- [ ] **Step 1: Write a failing controller test (or smoke-spec)**

If no controller-level test harness exists, skip the unit test and rely on the Phase 3 end-to-end smoke. Otherwise mirror an existing MapViewController spec.

- [ ] **Step 2: Add a planet-EVA dispatch branch**

Around line 4519, replace the body of `stageSpecialMission` with a switch on `mission.target.kind`:

```ts
private stageSpecialMission(missionId: string, offerMessageId: string | null): void {
  const mission = getSpecialMissionById(missionId)
  if (!mission) {
    console.warn(`[MapView] Special mission not found: ${missionId}`)
    return
  }

  if (offerMessageId !== null) {
    this.messageFacade.enqueueById(offerMessageId, this.onMessageUpdate)
  }

  switch (mission.target.kind) {
    case 'asteroid':
      this.stageAsteroidSpecialMission(mission)
      return
    case 'planet-eva':
      this.stagePlanetEvaSpecialMission(mission)
      return
  }
}
```

Move the existing body into `stageAsteroidSpecialMission(mission)` (no behavior change for Jovian / Consortium).

Implement `stagePlanetEvaSpecialMission(mission)`:
- Resolve a waypoint near the target planet's current world position (reuse `snapshotBodyWorldPositions()`; pull the planet's XZ and add a small offset; use the existing `MISSION_FOCUS_CAMERA_*` distances or a fresh constant `PLANET_EVA_POI_OFFSET_M = 80` for clarity — name it, do not magic-number it).
- Build an `ActiveVisitRelayMission`-shaped record (or whichever shape `acceptEvaMission` returns) with `template` derived from the special mission's name/briefing/reward and `giverPlanet` set from `mission.target.planetId`.
- Append it to `this.missionBoard.activeEvaMissions` via the existing `acceptEvaMission` helper, or directly if the helper insists on `offeredEvaMission` being set first (in that case, briefly stage as offered then accept).
- Persist via `saveMissionBoard(this.missionBoard)` and call `this.onMissionBoardUpdate?.(this.missionBoard)`.

- [ ] **Step 3: Type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 4: Run all contract-related tests**

Run:
```bash
bun test:unit src/lib/contracts src/lib/missions
```
Expected: PASS (the Finch walkthrough test still fails on missing mission JSONs — that's Phase 3).

- [ ] **Step 5: Commit**

```bash
git add src/views/MapViewController.ts
git commit -m "feat(map): dispatch planet-eva special missions onto the EVA board"
```

### Task 7: Register Finch offer-message ids and stub their messages

**Files:**
- Modify: `src/views/MapViewController.ts` (`SPECIAL_MISSION_OFFER_IDS` map at line 290).
- Modify: wherever message templates live (search: `grep -rn "consortium-certification-offer" src/data src/lib`).

- [ ] **Step 1: Add six offer-message ids**

```ts
const SPECIAL_MISSION_OFFER_IDS: Record<string, string> = {
  'consortium-certification': 'consortium-certification-offer',
  'jovian-prospection-hektor-photometry': 'jovian-prospection-hektor-photometry-offer',
  'jovian-prospection-hektor-dan': 'jovian-prospection-hektor-dan-offer',
  'jovian-prospection-hektor-prospectus': 'jovian-prospection-hektor-prospectus-offer',
  'jovian-prospection-saturn-photometry': 'jovian-prospection-saturn-photometry-offer',
  'jovian-prospection-saturn-dan': 'jovian-prospection-saturn-dan-offer',
  'finch-recovery-saturn-telescope': 'finch-recovery-saturn-telescope-offer',
  'finch-recovery-mars-bunker': 'finch-recovery-mars-bunker-offer',
  'finch-recovery-venus-telescope': 'finch-recovery-venus-telescope-offer',
  'finch-recovery-earth-telescope': 'finch-recovery-earth-telescope-offer',
  'finch-recovery-ceres-bunker': 'finch-recovery-ceres-bunker-offer',
  'finch-recovery-neptune-bunker': 'finch-recovery-neptune-bunker-offer',
}
```

- [ ] **Step 2: Author the six offer-message templates**

Use the existing `consortium-certification-offer` template as a model. Each Finch offer message should reuse the corresponding step's `subject` and `flavor` from `finch-recovery.json`, sender `Mr. Finch`, inbox name `Mr. Finch`. (If offer messages are loaded from a JSON registry rather than authored inline, add the six entries there.)

- [ ] **Step 3: Type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: PASS / 0 errors / 0 warnings.

- [ ] **Step 4: Commit**

```bash
git add src/views/MapViewController.ts <message-templates-files>
git commit -m "feat(finch): register offer-message ids for the six contract steps"
```

---

## Phase 3 — Author the six special-mission JSONs and validate end-to-end

### Task 8: Author the three telescope-EVA special missions

**Files:**
- Create: `src/data/missions/finch-recovery-saturn-telescope.json`
- Create: `src/data/missions/finch-recovery-venus-telescope.json`
- Create: `src/data/missions/finch-recovery-earth-telescope.json`

- [ ] **Step 1: Write Saturn telescope JSON**

```json
{
  "kind": "special",
  "id": "finch-recovery-saturn-telescope",
  "giverId": "mr-finch",
  "giverName": "Mr. Finch",
  "templateId": "finch-recovery-saturn-telescope",
  "target": { "kind": "planet-eva", "planetId": "saturn", "poiType": "telescope" },
  "name": "She Has Not Yet Been Seen",
  "briefing": "Tune the long-baseline telescope on Saturn ringside until the still resolves. Mr. Finch is paying for the horizon, not the foreground.",
  "difficulty": 3,
  "objectives": [
    {
      "type": "telescope",
      "x": 0,
      "z": 0,
      "calibrationThreshold": 0.95,
      "reward": 1500
    }
  ],
  "totalReward": 1500,
  "waypoint": { "worldX": 0, "worldZ": 0 },
  "status": "available"
}
```

- [ ] **Step 2: Write Venus and Earth telescope JSONs**

Identical shape; swap `planetId`, `id`, `templateId`, `name`, briefing, and `totalReward` (`2500` for Venus, `3000` for Earth).

- [ ] **Step 3: Run the contract walkthrough test**

Run: `bun test:unit src/lib/contracts/__tests__/finch-recovery-contract.spec.ts`
Expected: progress further — fails on `finch-recovery-mars-bunker` not being found.

- [ ] **Step 4: Commit**

```bash
git add src/data/missions/finch-recovery-{saturn,venus,earth}-telescope.json
git commit -m "feat(finch): author three telescope-EVA special missions"
```

### Task 9: Author the three bunker-EVA special missions

**Files:**
- Create: `src/data/missions/finch-recovery-mars-bunker.json`
- Create: `src/data/missions/finch-recovery-ceres-bunker.json`
- Create: `src/data/missions/finch-recovery-neptune-bunker.json`

- [ ] **Step 1: Write Mars bunker JSON**

```json
{
  "kind": "special",
  "id": "finch-recovery-mars-bunker",
  "giverId": "mr-finch",
  "giverName": "Mr. Finch",
  "templateId": "finch-recovery-mars-bunker",
  "target": { "kind": "planet-eva", "planetId": "mars", "poiType": "bunker" },
  "name": "A Trail at Mars",
  "briefing": "Abandoned Marines training bunker, overrun. Clear it. Recover what she left.",
  "difficulty": 4,
  "objectives": [
    {
      "type": "bunker",
      "x": 0,
      "z": 0,
      "reward": 2000
    }
  ],
  "totalReward": 2000,
  "waypoint": { "worldX": 0, "worldZ": 0 },
  "status": "available"
}
```

- [ ] **Step 2: Write Ceres and Neptune bunker JSONs**

Identical shape; swap `planetId`, `id`, `templateId`, `name`, briefing, and `totalReward` (`4000` Ceres, `8000` Neptune).

- [ ] **Step 3: Run the contract walkthrough test**

Run: `bun test:unit src/lib/contracts/__tests__/finch-recovery-contract.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/data/missions/finch-recovery-{mars,ceres,neptune}-bunker.json
git commit -m "feat(finch): author three bunker-EVA special missions"
```

### Task 10: Acceptance gates

**Files:** none (CI-style verification).

- [ ] **Step 1: Type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 2: Lint**

Run: `bun lint`
Expected: oxlint 0 errors, ESLint 0 errors / 0 warnings.

- [ ] **Step 3: Full test suite**

Run: `bun test:unit`
Expected: all green.

- [ ] **Step 4: Manual smoke test on `/map`**

```bash
bun dev
```
- Load a save with at least one Saturn-spaceport mission already completed and Saturn currently visited (the contract's offer prerequisites).
- Open the inbox. Confirm the Finch contract offer is present.
- Accept the contract.
- Confirm Step 1's offer message appears (`Mr. Finch — She Has Not Yet Been Seen`) and the Saturn telescope EVA appears in the EVA mission slot.
- Complete the Saturn telescope EVA. Confirm Step 2 activates: Mars bunker offer message arrives, Mars bunker EVA appears, and the map reveals Mars (`revealsBody: 'mars'`).
- Walk Steps 3 → 6 the same way.
- After Step 6 completes, confirm the contract closes: completion message arrives, Saturn fast-travel is unlocked, and Saturn-board missions show 2× pay multiplier.

- [ ] **Step 5: Final commit (if any cleanup landed)**

```bash
git status
# if anything: git add -p && git commit -m "chore(finch): post-smoke cleanup"
```

---

## Out of scope (do not implement in this plan)

- Power Loader / Walker reskin / Carmen boss fight
- Carmen post-game letters (recruitment, grappling-hook enticement, archive tool)
- Grappling-hook upgrade
- Deep archive system + 5 archive entries + Mr. Finch mid-archive letter
- Mr. Finch's "I would not have him judged" mercy letter
- `set-story-flag: "finchRecovered"` (Act 3 hook — add when Act 3 starts consuming it)
- Custom telescope clue images / datapad clue text / lower-third reveal beat (just use the default telescope EVA + default bunker)
- Journey wiring (no Act 3 journey definition yet)

These are documented in `docs/inspo/finch-recovery-gdd.md` and tracked separately.
