# Ceres Institute for Eternal Biology Contract — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the seven-step Ceres Institute contract — Dean Bernard Porter recruits the player for an escalating sequence of errands, surveys, and rescues that resolves at a Kuiper-Belt bunker terminal with a transmit/sabotage choice. Adds a `requiredUpgrades` offer prerequisite, an `astronaut-chimera` enemy variant, and a Ceres research station body.

**Architecture:** Mirrors `jovian-society-prospection` end-to-end. Contract JSON in `src/data/contracts/`, six special-mission JSONs in `src/data/missions/`, six offer-message templates registered with the message system, the giver in `src/data/missions/givers/`, and the choice-mission terminal pattern reused for Step 7. The two net-new infra pieces (`requiredUpgrades` prereq + `astronaut-chimera` variant) are landed first as isolated changes; everything else is content authoring against existing systems.

**Tech Stack:** Vue 3 + TypeScript + Vite, Pinia, Vitest, Three.js, Bun.

---

## File Structure

**Modify:**

- `src/lib/contracts/contractTypes.ts` — extend `offerWhenPrerequisites` with `requiredUpgrades`
- `src/lib/contracts/ContractSystem.ts` — extend `evaluatePrerequisiteContractOffers` to AND the new gate (using `getInstalledUpgradeLevel` hook)
- `src/lib/contracts/contractCatalog.ts` — register the new contract import
- `src/views/MapViewController.ts` — add 6 entries to `SPECIAL_MISSION_OFFER_IDS`
- `src/data/achievements.ts` — add 5 new achievements
- `src/lib/achievements.ts` — wire any new evaluator branches if needed (existing `specific_contract_completed` and `mission_kind_completed` rules cover most; `ceres-first-psychosphere` may need a new rule kind — discovery task)

**Create:**

Contract:
- `src/data/contracts/ceres-institute-eternal-biology.json`

Giver:
- `src/data/missions/givers/ceres-institute.json`

Special missions (6):
- `src/data/missions/ceres-institute-earth-supplies.json`
- `src/data/missions/ceres-institute-rescue-1.json`
- `src/data/missions/ceres-institute-mineral-analysis.json`
- `src/data/missions/ceres-institute-dan.json`
- `src/data/missions/ceres-institute-rescue-2.json`
- `src/data/missions/ceres-institute-archive-bunker.json`

Tests:
- `src/lib/contracts/__tests__/ceres-institute-contract.spec.ts` — full walkthrough mirroring `jovian-contract.spec.ts`
- `src/lib/contracts/__tests__/requiredUpgrades-gate.spec.ts` — isolated prereq-field test

**Discovery (resolve location during the relevant task):**
- Ceres research station body — likely `src/data/planets/planetarium.json` and/or a `pinnedBodies` array. Confirm in Task 9.
- Astronaut-chimera variant — locate the chimera enemy controller (likely `src/three/enemies/` or `src/three/` near `Bacteriophage`/`Spire`). Confirm in Task 12.
- Offer-message templates — locate where `consortium-certification-offer` is authored (search `src/lib/messages/` and `src/data/messages/`). Confirm in Task 14.

---

## Phase 1 — Add the `requiredUpgrades` offer prerequisite

This is a small, isolated TypeScript+test change with no content dependencies. Land it first so the contract JSON in Phase 2 can use the new field.

### Task 1: Write the failing test for `requiredUpgrades` gate

**Files:**
- Create: `src/lib/contracts/__tests__/requiredUpgrades-gate.spec.ts`

- [ ] **Step 1: Write the test file**

```ts
/**
 * Tests for the requiredUpgrades offer prerequisite — contract is offered only
 * when the player has every listed upgrade at >= minLevel AND every other
 * prerequisite is satisfied.
 *
 * @author guinetik
 * @date 2026-05-04
 * @spec docs/superpowers/specs/2026-05-04-ceres-institute-contract-design.md
 */
import { describe, expect, it } from 'vitest'
import { MessageSystem } from '@/lib/messages/messageSystem'
import { ContractSystem } from '../ContractSystem'
import { emptyContractSnapshot } from '../contractStorage'
import type { Contract, ContractStoreSnapshot } from '../contractTypes'

const fixture: Contract = {
  id: 'requiredUpgrades-fixture',
  inboxName: 'Test Institute',
  from: 'Test Liaison',
  sentAt: '2306-05-04 00:00 UTC',
  offerWhenPrerequisites: {
    requiredUpgrades: [
      { upgradeId: 'gravitySurfing', minLevel: 1 },
      { upgradeId: 'orbitalSurfing', minLevel: 1 },
    ],
    triggerOnPlanetVisited: 'ceres',
  },
  introSubject: 'Hello',
  introBody: ['hi'],
  steps: [
    {
      kind: 'visit-planet',
      planetId: 'ceres',
      subject: 'Step 1',
      flavor: ['x'],
    },
  ],
  completionSubject: 'Done',
  completionBody: ['done'],
  rewards: [],
}

function emptyMessageStore() {
  return { load: () => ({}), save: () => undefined }
}

function inMemoryPersistence(): {
  load: () => ContractStoreSnapshot
  save: (snap: ContractStoreSnapshot) => void
} {
  let snap = emptyContractSnapshot()
  return { load: () => snap, save: (next) => (snap = next) }
}

describe('requiredUpgrades offer prerequisite', () => {
  it('does NOT offer when the player has no upgrades and visits the planet', () => {
    const messages = new MessageSystem([], emptyMessageStore())
    const system = new ContractSystem([fixture], messages, inMemoryPersistence(), {
      getInstalledUpgradeLevel: () => 0,
    })
    system.notifyPlanetVisited('ceres')
    expect(system.getInstance(fixture.id)).toBeNull()
  })

  it('does NOT offer when only one of the required upgrades is installed', () => {
    const messages = new MessageSystem([], emptyMessageStore())
    const system = new ContractSystem([fixture], messages, inMemoryPersistence(), {
      getInstalledUpgradeLevel: (id) => (id === 'gravitySurfing' ? 1 : 0),
    })
    system.notifyPlanetVisited('ceres')
    expect(system.getInstance(fixture.id)).toBeNull()
  })

  it('offers when both required upgrades are installed AND the planet is visited', () => {
    const messages = new MessageSystem([], emptyMessageStore())
    const system = new ContractSystem([fixture], messages, inMemoryPersistence(), {
      getInstalledUpgradeLevel: () => 1,
    })
    system.notifyPlanetVisited('ceres')
    expect(system.getInstance(fixture.id)?.status).toBe('available')
  })

  it('does NOT offer when upgrades are present but the trigger planet has not been visited', () => {
    const messages = new MessageSystem([], emptyMessageStore())
    const system = new ContractSystem([fixture], messages, inMemoryPersistence(), {
      getInstalledUpgradeLevel: () => 1,
    })
    expect(system.getInstance(fixture.id)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `bun test:unit src/lib/contracts/__tests__/requiredUpgrades-gate.spec.ts`
Expected: FAIL — TypeScript error on `requiredUpgrades` (field doesn't exist on `offerWhenPrerequisites`).

### Task 2: Add the `requiredUpgrades` field to the schema

**Files:**
- Modify: `src/lib/contracts/contractTypes.ts` (around line 376–385, the `offerWhenPrerequisites` block)

- [ ] **Step 1: Add the field**

In `Contract.offerWhenPrerequisites`, add the new optional field alongside the existing ones:

```ts
  offerWhenPrerequisites?: {
    /** Optional — id of a contract the player must have finished. */
    requiredCompletedContractId?: string
    /** Optional — giver-planet completion gate (legacy combined gate). */
    minGiverPlanetCompletions?: { planetId: string; min: number }
    /** Optional — fires when the player orbits this planet, with all other gates met. */
    triggerOnPlanetVisited?: string
    /**
     * Optional — every listed upgrade must be installed at >= minLevel for the
     * offer to fire. Read via {@link ContractSystemHooks.getInstalledUpgradeLevel}
     * at evaluation time. AND-ed against every other present sub-field.
     */
    requiredUpgrades?: Array<{ upgradeId: UpgradeId; minLevel: number }>
  }
```

- [ ] **Step 2: Run the test, confirm new error**

Run: `bun test:unit src/lib/contracts/__tests__/requiredUpgrades-gate.spec.ts`
Expected: FAIL — schema parses now, but the gate evaluator ignores the new field, so the "does NOT offer when no upgrades" test will pass *for the wrong reason* (the prereq is honored by accident because no other field tells it not to offer). The "offers when both upgrades installed" test will FAIL because the player still hasn't visited Ceres in that case — actually wait, that test does `notifyPlanetVisited('ceres')`. So it will FAIL because the gate evaluator doesn't check `requiredUpgrades` at all. Run and confirm.

### Task 3: Wire the gate evaluator

**Files:**
- Modify: `src/lib/contracts/ContractSystem.ts` (`evaluatePrerequisiteContractOffers`, around line 934–955)

- [ ] **Step 1: Add the upgrade check**

Inside the `evaluatePrerequisiteContractOffers` loop, after the existing `triggerOnPlanetVisited` check, insert:

```ts
      if (p.requiredUpgrades !== undefined) {
        let allInstalled = true
        for (const required of p.requiredUpgrades) {
          const level = this.hooks.getInstalledUpgradeLevel?.(required.upgradeId) ?? 0
          if (level < required.minLevel) {
            allInstalled = false
            break
          }
        }
        if (!allInstalled) continue
      }
```

- [ ] **Step 2: Run the test, confirm pass**

Run: `bun test:unit src/lib/contracts/__tests__/requiredUpgrades-gate.spec.ts`
Expected: PASS — all four tests green.

- [ ] **Step 3: Type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: PASS, 0 errors / 0 warnings.

### Task 4: Wire the `getInstalledUpgradeLevel` hook in runtime

The runtime in `src/lib/contracts/runtime.ts` already provides `getInstalledUpgradeLevel` for `install-upgrade` step support. Confirm it's wired (no code change expected; this is a verification task).

**Files:**
- Read only: `src/lib/contracts/runtime.ts`

- [ ] **Step 1: Confirm hook is wired**

Run:
```bash
grep -n "getInstalledUpgradeLevel" src/lib/contracts/runtime.ts
```
Expected: at least one match showing the hook is passed into `new ContractSystem(...)` with a real implementation.

If absent, add it. Mirror the existing `consumeItemsForDelivery` / `hasOrbitedPlanet` hook wiring — read the player profile and look up upgrade level. Do not add this work to this plan unless it's missing; the task is purely verification.

- [ ] **Step 2: Commit Phase 1**

```bash
git add src/lib/contracts/contractTypes.ts \
        src/lib/contracts/ContractSystem.ts \
        src/lib/contracts/__tests__/requiredUpgrades-gate.spec.ts
git commit -m "$(cat <<'EOF'
feat(contracts): add requiredUpgrades offer prerequisite

Extends offerWhenPrerequisites with an optional requiredUpgrades array
that is AND-ed against the other prerequisite fields. Each entry is
{ upgradeId, minLevel }; the gate reads installed levels via the
existing getInstalledUpgradeLevel hook.

@spec docs/superpowers/specs/2026-05-04-ceres-institute-contract-design.md
EOF
)"
```

---

## Phase 2 — Author the contract JSON and walkthrough test

The walkthrough test will go red until special missions and the giver are authored, but the contract definition itself parses against the existing schema (plus the new `requiredUpgrades` field).

### Task 5: Write the failing walkthrough test

**Files:**
- Create: `src/lib/contracts/__tests__/ceres-institute-contract.spec.ts`

- [ ] **Step 1: Write the test**

```ts
/**
 * Walkthrough tests for the ceres-institute-eternal-biology contract: schema
 * parses, end-to-end walkability with stub events for both arms, and per-outcome
 * reward dispatch.
 *
 * @author guinetik
 * @date 2026-05-04
 * @spec docs/superpowers/specs/2026-05-04-ceres-institute-contract-design.md
 */
import { describe, expect, it } from 'vitest'
import { MessageSystem } from '@/lib/messages/messageSystem'
import ceresRaw from '@/data/contracts/ceres-institute-eternal-biology.json'
import { ContractSystem } from '../ContractSystem'
import { emptyContractSnapshot } from '../contractStorage'
import type {
  ChoiceMissionStep,
  Contract,
  ContractStoreSnapshot,
  MissionCompletedEvent,
  RewardEffect,
} from '../contractTypes'

const ceres = ceresRaw as Contract

function emptyMessageStore() {
  return { load: () => ({}), save: () => undefined }
}

function inMemoryPersistence(): {
  load: () => ContractStoreSnapshot
  save: (snap: ContractStoreSnapshot) => void
} {
  let snap = emptyContractSnapshot()
  return { load: () => snap, save: (next) => (snap = next) }
}

const earthSupplyEvent: MissionCompletedEvent = {
  kind: 'shuttle',
  giverPlanetId: 'ceres',
  giverId: 'ceres-institute',
  targetPlanetId: 'earth',
  objectiveType: '',
  specialMissionId: 'ceres-institute-earth-supplies',
}

const rescue1Event: MissionCompletedEvent = {
  kind: 'asteroid',
  giverPlanetId: 'ceres',
  giverId: 'ceres-institute',
  targetPlanetId: null,
  objectiveType: 'rescue',
  specialMissionId: 'ceres-institute-rescue-1',
}

const mineralEvent: MissionCompletedEvent = {
  kind: 'asteroid',
  giverPlanetId: 'ceres',
  giverId: 'ceres-institute',
  targetPlanetId: null,
  objectiveType: 'mineral-analysis',
  specialMissionId: 'ceres-institute-mineral-analysis',
}

const danEvent: MissionCompletedEvent = {
  kind: 'asteroid',
  giverPlanetId: 'ceres',
  giverId: 'ceres-institute',
  targetPlanetId: null,
  objectiveType: 'dan',
  specialMissionId: 'ceres-institute-dan',
}

const rescue2Event: MissionCompletedEvent = {
  kind: 'asteroid',
  giverPlanetId: 'ceres',
  giverId: 'ceres-institute',
  targetPlanetId: null,
  objectiveType: 'rescue',
  specialMissionId: 'ceres-institute-rescue-2',
}

describe('ceres-institute-eternal-biology schema', () => {
  it('parses with 7 steps, completionByOutcome, pinnedAssets, requiredUpgrades', () => {
    expect(ceres.id).toBe('ceres-institute-eternal-biology')
    expect(ceres.steps.length).toBe(7)
    expect(ceres.completionByOutcome).toBeTruthy()
    expect(ceres.completionByOutcome?.transmit).toBeTruthy()
    expect(ceres.completionByOutcome?.sabotage).toBeTruthy()
    expect(ceres.pinnedAssets?.[0]?.assetRef).toBe('ceres-archive-site')
    expect(ceres.offerWhenPrerequisites?.requiredUpgrades?.length).toBe(2)
    expect(ceres.homePlanet).toBe('ceres')
  })

  it('step 7 is a choice-mission with transmit/sabotage outcomes', () => {
    const step = ceres.steps[6] as ChoiceMissionStep
    expect(step.kind).toBe('choice-mission')
    expect(step.outcomes.map((o) => o.outcomeId)).toEqual(['transmit', 'sabotage'])
    expect(step.specialMissionId).toBe('ceres-institute-archive-bunker')
  })

  it('step credits sum to 37,000 across the six non-choice steps (50,000 total includes the 13,000 outcome)', () => {
    const sum = ceres.steps
      .slice(0, 6)
      .reduce((acc, step) => acc + ('creditsReward' in step ? (step.creditsReward ?? 0) : 0), 0)
    expect(sum).toBe(37_000)
  })
})

describe('ceres-institute-eternal-biology walkability', () => {
  function buildSystem() {
    const messages = new MessageSystem([], emptyMessageStore())
    const granted: RewardEffect[] = []
    const completed: string[] = []
    const credits: number[] = []
    const contracts = new ContractSystem([ceres], messages, inMemoryPersistence(), {
      onRewardGranted: (effect) => granted.push(effect),
      onContractCompleted: (id) => completed.push(id),
      onChoiceOutcomeResolved: (p) => credits.push(p.creditsReward),
      hasOrbitedPlanet: () => true, // Step 2 visit-planet auto-satisfies via passive eval
    })
    contracts.resetForTests()
    contracts.offerForTests(ceres.id)
    contracts.acceptContract(ceres.id)
    return { contracts, granted, completed, credits }
  }

  function driveToChoice(contracts: ContractSystem) {
    contracts.notifyMissionCompleted(earthSupplyEvent) // Step 1
    // Step 2 (visit-planet ceres-research-station) auto-completes via hasOrbitedPlanet stub
    contracts.notifyMissionCompleted(rescue1Event) // Step 3
    contracts.notifyMissionCompleted(mineralEvent) // Step 4
    contracts.notifyMissionCompleted(danEvent) // Step 5
    contracts.notifyMissionCompleted(rescue2Event) // Step 6
  }

  it('drives transmit arm end-to-end', () => {
    const { contracts, granted, completed, credits } = buildSystem()
    driveToChoice(contracts)
    const inst = contracts.getInstance(ceres.id)
    expect(inst?.currentStepIndex).toBe(6)
    const step = ceres.steps[6] as ChoiceMissionStep
    const ok = contracts.notifyChoiceResolved(step.missionId, 'transmit')
    expect(ok).toBe(true)
    expect(contracts.getInstance(ceres.id)?.status).toBe('completed')
    expect(contracts.getInstance(ceres.id)?.resolvedOutcomeId).toBe('transmit')
    expect(completed).toContain(ceres.id)
    expect(credits).toEqual([13_000])
    const types = granted.map((e) => e.type)
    expect(types).toContain('fast-travel')
    expect(types).toContain('mission-pay-multiplier')
    expect(types).toContain('set-story-flag')
  })

  it('drives sabotage arm end-to-end with disable-giver and exposed flag', () => {
    const { contracts, granted, credits } = buildSystem()
    driveToChoice(contracts)
    const step = ceres.steps[6] as ChoiceMissionStep
    contracts.notifyChoiceResolved(step.missionId, 'sabotage')
    expect(contracts.getInstance(ceres.id)?.resolvedOutcomeId).toBe('sabotage')
    expect(credits).toEqual([13_000])
    const types = granted.map((e) => e.type)
    expect(types).toContain('disable-giver')
    expect(types).toContain('fast-travel')
    expect(granted.filter((e) => e.type === 'set-story-flag').length).toBe(2)
  })
})
```

- [ ] **Step 2: Run the test, confirm fails on missing JSON**

Run: `bun test:unit src/lib/contracts/__tests__/ceres-institute-contract.spec.ts`
Expected: FAIL — `Cannot find module '@/data/contracts/ceres-institute-eternal-biology.json'`.

### Task 6: Author the contract JSON

**Files:**
- Create: `src/data/contracts/ceres-institute-eternal-biology.json`

- [ ] **Step 1: Write the file**

```json
{
  "id": "ceres-institute-eternal-biology",
  "homePlanet": "ceres",
  "inboxName": "Ceres Institute",
  "from": "Dean Bernard Porter, Ceres Institute for Eternal Biology",
  "sentAt": "2306-05-04 09:12 UTC",
  "offerWhenPrerequisites": {
    "requiredUpgrades": [
      { "upgradeId": "gravitySurfing", "minLevel": 1 },
      { "upgradeId": "orbitalSurfing", "minLevel": 1 }
    ],
    "triggerOnPlanetVisited": "ceres"
  },
  "pinnedAssets": [
    {
      "assetRef": "ceres-archive-site",
      "region": "kuiper-belt",
      "label": "Site CIB-7"
    }
  ],
  "introSubject": "An Introduction, and a Standing Invitation",
  "introBody": [
    "Young pilot —",
    "Your work for our funders has not gone unnoticed. The Institute would be honored to retain you for a sequence of small services. Nothing taxing. Largely errands, with a few calibrations toward the end. Compensation is academic-grade, which is to say generous.",
    "We do not advertise our work. Most of what we publish is in journals you would not have heard of, and most of what we do is, regrettably, the kind of patient laboratory science that does not photograph well. But it is good science. And it is well-funded.",
    "Acceptance below. Please read at your leisure.",
    "— Dean Bernard Porter, Ceres Institute for Eternal Biology"
  ],
  "steps": [
    {
      "kind": "complete-missions",
      "count": 1,
      "missionType": "shuttle",
      "giverPlanetId": "ceres",
      "specialMissionId": "ceres-institute-earth-supplies",
      "creditsReward": 2500,
      "subject": "Step 1 — Calibration Standards from Earth",
      "flavor": [
        "Young pilot —",
        "We need spectrometry calibration standards from the ESA stockpile on Earth. Our equipment is finicky; the standards drift if they are sourced from anywhere closer to the sun, and the Earth lab is willing to release a set under our standing requisition. Treat it as a paid familiarization run.",
        "Pickup details are on your kiosk. Bring the case home in one piece.",
        "— Porter"
      ]
    },
    {
      "kind": "visit-planet",
      "planetId": "ceres-research-station",
      "creditsReward": 4000,
      "subject": "Step 2 — Welcome to the Station",
      "flavor": [
        "Young pilot —",
        "Ceres orbit is a beast even with both packages installed. You'll need both your gravity surfing and orbital surfing rigs to make the corotating insertion — there is no other way to get to us cleanly. Come up. Have a look around. The lab tour is short; the coffee, if you'll forgive the indulgence, is from a private supplier.",
        "We keep the heavier work elsewhere.",
        "— Porter"
      ]
    },
    {
      "kind": "complete-missions",
      "count": 1,
      "missionType": "asteroid",
      "giverPlanetId": "ceres",
      "objectiveType": "rescue",
      "specialMissionId": "ceres-institute-rescue-1",
      "creditsReward": 6500,
      "subject": "Step 3 — A Field Team, Silent",
      "flavor": [
        "Young pilot —",
        "A field team went silent on a viroid sample run. Extract who you can. The viroids are a known hazard of the work, but a hazard worth braving — the data their samples produce is, frankly, irreplaceable.",
        "While you are out there: collect a few units of psychosphere for us. The research is promising, and the material is harmless in handled quantities. The Institute pays the going rate per unit.",
        "Bring our people home.",
        "— Porter"
      ]
    },
    {
      "kind": "complete-missions",
      "count": 1,
      "missionType": "asteroid",
      "giverPlanetId": "ceres",
      "objectiveType": "mineral-analysis",
      "specialMissionId": "ceres-institute-mineral-analysis",
      "creditsReward": 6000,
      "subject": "Step 4 — Surface Composition Pass",
      "flavor": [
        "Young pilot —",
        "Ceres's eccentric orbit puts certain rare-earth resonances within reach nowhere else in the system. The readings refine our theoretical model. The model is — well. You'll hear about the model when there is something to hear.",
        "Run the mineral analysis. Submit clean readings. The Institute prefers signal quality over speed.",
        "— Porter"
      ]
    },
    {
      "kind": "complete-missions",
      "count": 1,
      "missionType": "asteroid",
      "giverPlanetId": "ceres",
      "objectiveType": "dan",
      "specialMissionId": "ceres-institute-dan",
      "creditsReward": 7500,
      "subject": "Step 5 — DAN Albedo Survey",
      "flavor": [
        "Young pilot —",
        "There is a phenomenon we call DAN albedo. Neutron-rich materials seem to *attract* viroid attention — the readings spike as the colonies approach. We are studying why. We have hypotheses.",
        "Run a Dynamic Albedo of Neutrons pass on the asset on file. Capture the particle return cleanly; ignore any sensor cross-talk you may register during the pass. The instrumentation team is, I am told, certain that the cross-talk is harmless.",
        "— Porter"
      ]
    },
    {
      "kind": "complete-missions",
      "count": 1,
      "missionType": "asteroid",
      "giverPlanetId": "ceres",
      "objectiveType": "rescue",
      "specialMissionId": "ceres-institute-rescue-2",
      "creditsReward": 10500,
      "subject": "Step 6 — Another Team",
      "flavor": [
        "Young pilot —",
        "Another team. The viroids do not discriminate, and we do not abandon our own. I am sorry to ask twice.",
        "More psychosphere if your cargo allows. The DAN series is recalibrating and the instrumentation team is on a tight schedule.",
        "Bring them home.",
        "— Porter"
      ]
    },
    {
      "kind": "choice-mission",
      "missionId": "ceres_archive_transmission",
      "minigameType": "terminal-prospectus",
      "pinnedAssetRef": "ceres-archive-site",
      "specialMissionId": "ceres-institute-archive-bunker",
      "outcomes": [
        { "outcomeId": "transmit", "label": "Transmit Archive", "creditsReward": 13000 },
        { "outcomeId": "sabotage", "label": "Sabotage Archive", "creditsReward": 13000 }
      ],
      "subject": "Step 7 — Archive Transmission",
      "flavor": [
        "Young pilot —",
        "One last matter. We have prepared an archive — a culmination of the past several months of your work. The terminal at the Kuiper site, Site CIB-7, is the secure transmit point. Reach it the same way you reached the station.",
        "There is a chimera presence at the site. Please clear it. After transmission, walk away with our full thanks.",
        "Please don't read the archive. It would only confuse you.",
        "— Porter"
      ]
    }
  ],
  "completionByOutcome": {
    "transmit": {
      "completionSubject": "Concluded — With the Institute's Thanks",
      "completionBody": [
        "Young pilot —",
        "You have helped us cross a threshold. The Foundation will remember.",
        "Your retainer is paid in full, with the Institute's gratitude. Cerean traffic control has been instructed to extend you fast-travel privileges in perpetuity, and your future work with us — should you choose it — will be compensated at our partner rate.",
        "We hope to see you again soon.",
        "— Porter"
      ],
      "rewards": [
        { "type": "fast-travel", "planetId": "ceres" },
        { "type": "mission-pay-multiplier", "planetId": "ceres", "multiplier": 2 },
        { "type": "set-story-flag", "flag": "ceres-archive-transmitted" }
      ]
    },
    "sabotage": {
      "completionSubject": "File Closure",
      "completionBody": [
        "You are, of course, no longer welcome at the Institute.",
        "Your retainer has been settled. We will not be in contact again.",
        "— Porter"
      ],
      "rewards": [
        { "type": "fast-travel", "planetId": "ceres" },
        { "type": "disable-giver", "giverId": "ceres-institute" },
        { "type": "set-story-flag", "flag": "ceres-archive-sabotaged" },
        { "type": "set-story-flag", "flag": "ceres-cult-exposed" }
      ]
    }
  }
}
```

- [ ] **Step 2: Run the walkthrough test**

Run: `bun test:unit src/lib/contracts/__tests__/ceres-institute-contract.spec.ts`
Expected: schema parses; the walkthrough tests are still likely RED because (a) the catalog hasn't registered the contract yet, and (b) special-mission events fire but no special missions exist on disk to match. Schema-only tests should PASS.

### Task 7: Register the contract in the catalog

**Files:**
- Modify: `src/lib/contracts/contractCatalog.ts`

- [ ] **Step 1: Add the import + array entry**

```ts
import ceresInstitute from '@/data/contracts/ceres-institute-eternal-biology.json'
// …
export const CONTRACT_CATALOG: Contract[] = [
  spaceCowboysMarsHq as Contract,
  uscVenusCertification as Contract,
  martianMarineCorpsCohort as Contract,
  venusianZeppelinTradeLoop as Contract,
  theCinderline as Contract,
  jovianSocietyProspection as Contract,
  ceresInstitute as Contract,
]
```

- [ ] **Step 2: Run the walkthrough test**

Run: `bun test:unit src/lib/contracts/__tests__/ceres-institute-contract.spec.ts`
Expected: walkability tests should PASS — the test stubs synthesize events with the right `specialMissionId` field directly, so they don't need the special-mission JSONs to exist for the test to run. If they still fail, inspect the failure and confirm the issue is on the production code path (not the test fixture).

- [ ] **Step 3: Type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: PASS, 0 errors / 0 warnings.

- [ ] **Step 4: Commit Phase 2**

```bash
git add src/data/contracts/ceres-institute-eternal-biology.json \
        src/lib/contracts/contractCatalog.ts \
        src/lib/contracts/__tests__/ceres-institute-contract.spec.ts
git commit -m "$(cat <<'EOF'
feat(contracts): author ceres institute for eternal biology contract

Seven-step contract centered on Dean Bernard Porter and the Ceres
Institute, terminating in a choice-mission terminal at a pinned
Kuiper-Belt site. Two arms: transmit (institute thrives, pay multiplier)
and sabotage (giver disabled, cult-exposed flag set). Step rewards sum
to 50,000 CR (37,000 across the first six steps + 13,000 on the
choice outcome).

@spec docs/superpowers/specs/2026-05-04-ceres-institute-contract-design.md
EOF
)"
```

---

## Phase 3 — Author the giver and special-mission JSONs

The contract walkthrough test passes already (it stubs events). This phase makes the contract *playable* by giving the in-game systems the missions they need to actually stage and complete.

### Task 8: Author the Ceres Institute giver

**Files:**
- Create: `src/data/missions/givers/ceres-institute.json`

- [ ] **Step 1: Reference an existing giver**

Read `src/data/missions/givers/jovian-society.json` for the shape. Copy field-for-field, replacing identity and biasing the procedural mission templates toward rescue / mineral-analysis / dan (the objective types Step 3-6 filter for, plus bunker for Step 7).

- [ ] **Step 2: Write the file**

```json
{
  "id": "ceres-institute",
  "name": "Dean Bernard Porter",
  "title": "Ceres Institute for Eternal Biology",
  "objectiveTypes": ["rescue", "mineral-analysis", "dan", "bunker", "gather"],
  "minDifficulty": 4,
  "maxDifficulty": 9,
  "missions": [
    {
      "id": "ceres_field_team_extraction",
      "name": "Field Team Extraction — Standing Tasking",
      "briefing": "Young pilot — periodic teams go quiet during sample runs. The Institute keeps an open contract for extraction; rates are above the standard rescue tier in recognition of the hazard. Bring our people home. — Porter",
      "objectiveSlots": [
        {
          "type": "rescue",
          "weight": 1.0,
          "params": {
            "type": "rescue",
            "colonistCount": { "min": 3, "max": 5 },
            "oxygenTime": { "min": 240, "max": 180 },
            "isGuarded": true
          },
          "reward": { "min": 3500, "max": 7500 }
        }
      ],
      "completionBonus": { "min": 800, "max": 1800 },
      "regionByDifficulty": { "asteroid-belt": [4, 7], "kuiper-belt": [7, 9] }
    },
    {
      "id": "ceres_mineral_resonance_pass",
      "name": "Resonance Survey — Mineral Composition",
      "briefing": "Young pilot — Ceres's eccentric orbit puts certain rare-earth resonances within reach nowhere else. We need a clean mineral analysis pass on a candidate body. Submit the report at the kiosk. — Porter",
      "objectiveSlots": [
        {
          "type": "mineral-analysis",
          "weight": 1.0,
          "params": {
            "type": "mineral-analysis",
            "analysisRockCount": { "min": 3, "max": 6 },
            "sampleKg": { "min": 30, "max": 80 }
          },
          "reward": { "min": 2800, "max": 6500 }
        }
      ],
      "completionBonus": { "min": 800, "max": 2200 },
      "regionByDifficulty": { "asteroid-belt": [4, 8] }
    },
    {
      "id": "ceres_dan_albedo_survey",
      "name": "DAN Albedo Survey",
      "briefing": "Young pilot — neutron-rich materials seem to attract viroid attention. We are studying why. Please run a clean Dynamic Albedo of Neutrons pass and disregard any cross-talk during operation. — Porter",
      "objectiveSlots": [
        {
          "type": "dan",
          "weight": 1.0,
          "params": {
            "type": "dan",
            "scanDurationSeconds": { "min": 50, "max": 75 },
            "requiredParticleHits": { "min": 24, "max": 32 },
            "enemyGraceSeconds": { "min": 10, "max": 7 },
            "particleTier": "medium",
            "enemyTier": "medium"
          },
          "reward": { "min": 3200, "max": 6800 }
        }
      ],
      "completionBonus": { "min": 700, "max": 1600 },
      "regionByDifficulty": { "asteroid-belt": [4, 7], "kuiper-belt": [7, 9] }
    }
  ]
}
```

- [ ] **Step 3: Verify the giver loads**

Run: `bun test:unit src/lib/missions`
Expected: any giver-catalog tests PASS — confirm the new giver doesn't break the catalog. If `giverCatalog.spec.ts` enumerates givers, it may need a new assertion (add one if so).

### Task 9: Resolve and add the Ceres research station body

**Files:**
- Read first: `src/data/planets/planetarium.json`, `src/lib/planets/types.ts`, `src/lib/planets/catalog.ts`

- [ ] **Step 1: Discover the right schema**

Run:
```bash
grep -n "PinnedBody\|pinnedBodies\|station" src/lib/planets/types.ts src/lib/planets/catalog.ts
```
Identify whether stations are added to a `pinnedBodies` array, are full `Planet` entries, or live in a separate registry. Report findings before continuing.

- [ ] **Step 2: Add `ceres-research-station`**

If it's a `PinnedBody`: append a new entry to the right array in `planetarium.json` with `id: "ceres-research-station"`, region, and rendering details. Use Ceres's actual orbit as a reference and offset slightly (the station is corotating).

If it's a `Planet`: add a minimal planet entry — the station doesn't need full shader/moons; copy the smallest existing planet and adjust.

If neither, this body needs a new registry concept. Do not invent one in this plan; instead, mark this task as blocked, file a note in the plan's "Open Questions" section, and proceed to Task 10. Step 2 of the contract will then fail to auto-satisfy at runtime; the rest of the contract still ships.

- [ ] **Step 3: Type-check + smoke-test the planet load**

Run: `bun run type-check && bun test:unit src/lib/planets`
Expected: PASS. If body-id-uniqueness validators fire, fix the entry.

- [ ] **Step 4: Commit if applicable**

```bash
git add src/data/planets/planetarium.json src/data/missions/givers/ceres-institute.json
git commit -m "feat(ceres): add Ceres research station body and Institute giver"
```

### Task 10: Author the six special-mission JSONs

**Files:**
- Create: `src/data/missions/ceres-institute-earth-supplies.json`
- Create: `src/data/missions/ceres-institute-rescue-1.json`
- Create: `src/data/missions/ceres-institute-mineral-analysis.json`
- Create: `src/data/missions/ceres-institute-dan.json`
- Create: `src/data/missions/ceres-institute-rescue-2.json`
- Create: `src/data/missions/ceres-institute-archive-bunker.json`

Each follows the existing `kind: "special"` shape (see `src/data/missions/jovian-prospection-hektor-photometry.json` and `jovian-prospection-hektor-prospectus.json` for templates).

- [ ] **Step 1: Author `ceres-institute-rescue-1.json`**

```json
{
  "kind": "special",
  "id": "ceres-institute-rescue-1",
  "asteroidId": "ceres-rescue-site-1",
  "giverId": "ceres-institute",
  "giverName": "Ceres Institute",
  "templateId": "ceres-institute-rescue-1",
  "name": "Step 3 — A Field Team, Silent",
  "briefing": "Young pilot — extract the Institute field team that went silent on a viroid sample run. Bring our people home. While you're out there, collect a few units of psychosphere for the lab. — Porter",
  "difficulty": 5,
  "region": "asteroid-belt",
  "objectives": [
    {
      "type": "rescue",
      "x": 0,
      "z": 0,
      "colonistCount": 4,
      "oxygenTime": 220,
      "isGuarded": true,
      "reward": 6500
    }
  ],
  "totalReward": 6500,
  "waypoint": { "worldX": 0, "worldZ": 0 },
  "status": "available"
}
```

- [ ] **Step 2: Author `ceres-institute-rescue-2.json`** — same shape, `id`/`templateId` swapped, difficulty 7, colonistCount 5, oxygenTime 200, region `asteroid-belt`, reward 10500.

- [ ] **Step 3: Author `ceres-institute-mineral-analysis.json`** — `objectives[0].type: "mineral-analysis"`, `analysisRockCount: 5`, `sampleKg: 60`, difficulty 6, reward 6000, region `asteroid-belt`.

- [ ] **Step 4: Author `ceres-institute-dan.json`** — `objectives[0].type: "dan"`, `scanDurationSeconds: 65`, `requiredParticleHits: 28`, `enemyGraceSeconds: 9`, `particleTier: "medium"`, `enemyTier: "medium"`, difficulty 6, reward 7500.

- [ ] **Step 5: Author `ceres-institute-archive-bunker.json`** — `objectives[0].type: "bunker"`, `enemyVariant: "astronaut-chimera"` (new field, wired in Phase 4), region `kuiper-belt`, difficulty 8, reward 0 (paid via choice outcome). Mirror the Jovian prospectus shape but with a `bunker` objective.

```json
{
  "kind": "special",
  "id": "ceres-institute-archive-bunker",
  "asteroidId": "ceres-archive-site",
  "giverId": "ceres-institute",
  "giverName": "Ceres Institute",
  "templateId": "ceres-institute-archive-bunker",
  "name": "Step 7 — Archive Transmission",
  "briefing": "Young pilot — clear the chimera presence at the Kuiper site, then approach the terminal and choose: transmit the archive to the Institute, or sabotage it. — Porter",
  "difficulty": 8,
  "region": "kuiper-belt",
  "objectives": [
    {
      "type": "bunker",
      "x": 0,
      "z": 0,
      "enemyVariant": "astronaut-chimera",
      "reward": 0
    }
  ],
  "totalReward": 0,
  "waypoint": { "worldX": 0, "worldZ": 0 },
  "status": "available"
}
```

- [ ] **Step 6: Author `ceres-institute-earth-supplies.json`**

Earth Supply Run is a *shuttle* mission, not asteroid. The current `stageSpecialMission` only stages onto `activeAsteroidMission`. Two paths:

  - **(A) Skip auto-staging for Step 1.** Author the special mission for shape consistency, but the contract step still lists `specialMissionId: ceres-institute-earth-supplies` so the matcher can recognize a completion event tagged with that id. The player picks any Ceres-board shuttle mission to Earth from the kiosk; the runtime tags the completion event with `specialMissionId` if the active mission's id matches.

  - **(B) Extend `stageSpecialMission` to handle shuttle missions.** Larger lift; mirrors the deferred Finch Recovery work.

Recommendation: **(A) for this plan.** The Ceres-board kiosk already offers Earth shuttle missions through normal procedural routing once the giver is registered (Task 8). The contract step's filters (`missionType: shuttle, giverPlanetId: ceres, targetPlanetId: earth`) will match any of them. We author the mission JSON so future work can wire auto-staging if desired, but we do not register it in `SPECIAL_MISSION_OFFER_IDS`.

```json
{
  "kind": "special",
  "id": "ceres-institute-earth-supplies",
  "asteroidId": "earth",
  "giverId": "ceres-institute",
  "giverName": "Ceres Institute",
  "templateId": "ceres-institute-earth-supplies",
  "name": "Step 1 — Calibration Standards from Earth",
  "briefing": "Young pilot — fetch the spectrometry calibration standards case from the ESA stockpile on Earth. Bring it home in one piece. — Porter",
  "difficulty": 3,
  "region": "near-earth",
  "objectives": [],
  "totalReward": 2500,
  "waypoint": { "worldX": 0, "worldZ": 0 },
  "status": "available"
}
```

- [ ] **Step 7: Run the missions test suite**

Run: `bun test:unit src/lib/missions src/lib/contracts`
Expected: PASS. The walkthrough test continues to pass against stubbed events (Task 5 doesn't require these JSONs to exist on disk for its assertions — but other discovery tests in the missions suite may load all special missions, so file presence must be valid JSON).

- [ ] **Step 8: Commit Phase 3 mission content**

```bash
git add src/data/missions/ceres-institute-*.json
git commit -m "feat(ceres): author six ceres institute special missions"
```

---

## Phase 4 — Astronaut-chimera enemy variant + offer-message wiring

### Task 11: Add the six offer-message ids to `SPECIAL_MISSION_OFFER_IDS`

**Files:**
- Modify: `src/views/MapViewController.ts` (around line 290)

- [ ] **Step 1: Add entries**

The Earth Supply Run uses path (A) above (no auto-staging), so it is **not** registered. The remaining five ids are:

```ts
const SPECIAL_MISSION_OFFER_IDS: Record<string, string> = {
  'consortium-certification': 'consortium-certification-offer',
  'jovian-prospection-hektor-photometry': 'jovian-prospection-hektor-photometry-offer',
  'jovian-prospection-hektor-dan': 'jovian-prospection-hektor-dan-offer',
  'jovian-prospection-hektor-prospectus': 'jovian-prospection-hektor-prospectus-offer',
  'jovian-prospection-saturn-photometry': 'jovian-prospection-saturn-photometry-offer',
  'jovian-prospection-saturn-dan': 'jovian-prospection-saturn-dan-offer',
  'ceres-institute-rescue-1': 'ceres-institute-rescue-1-offer',
  'ceres-institute-mineral-analysis': 'ceres-institute-mineral-analysis-offer',
  'ceres-institute-dan': 'ceres-institute-dan-offer',
  'ceres-institute-rescue-2': 'ceres-institute-rescue-2-offer',
  'ceres-institute-archive-bunker': 'ceres-institute-archive-bunker-offer',
}
```

- [ ] **Step 2: Type-check**

Run: `bun run type-check`
Expected: PASS.

### Task 12: Discover the chimera enemy controller and add the variant

**Files:**
- Read first: search for the chimera controller.

- [ ] **Step 1: Locate**

Run:
```bash
grep -rn "chimera" src/three src/lib/level src/lib/minigame --include="*.ts" | head -20
```
Identify the file that defines the chimera enemy and its spawn entry point. Report findings before continuing.

- [ ] **Step 2: Add the `astronaut-chimera` variant**

Implement the variant as a thin wrapper / parented mesh on the existing chimera. The visual goal: the chimera body stays, an astronaut figure (T-pose, mildly flailing arms) is parented on top. Use the existing rescue/colonist astronaut model if one exists in `public/models/`; otherwise drop a new GLB and load it.

Required behavior:
- Same combat stats as the standard chimera walker (this is *not* a boss — see spec)
- Variant is selected per-spawn via a string param threaded through the bunker spawner
- Plumb `objective.enemyVariant` from the special mission objective into the spawner

Test seam: a unit test that constructs the variant and asserts the parented mesh is added without errors. If the spawner is hard to test in isolation, a smoke check that loading the special-mission JSON and constructing the level scene does not throw is sufficient.

- [ ] **Step 3: Run tests**

Run: `bun test:unit`
Expected: PASS. If `enemyVariant` is a new objective field, also update the objective type in `src/lib/missions/types.ts` (`BunkerObjective` or equivalent) and run type-check.

- [ ] **Step 4: Commit**

```bash
git add src/three/<chimera-files> src/lib/missions/types.ts public/models/<new-glbs>
git commit -m "feat(enemies): add astronaut-chimera variant for ceres bunker wave"
```

### Task 13: Discover and author the six offer-message templates

**Files:**
- Read first: `src/lib/messages/messageCatalog.ts` and any data folder containing `consortium-certification-offer`.

- [ ] **Step 1: Locate the offer-message authoring site**

Run:
```bash
grep -rn "consortium-certification-offer" src/data src/lib --include="*.ts" --include="*.json" | head
```
Identify whether offer messages are inline TS or external JSON. Report findings.

- [ ] **Step 2: Author the five offer messages**

For each id (`ceres-institute-rescue-1-offer`, `…-mineral-analysis-offer`, `…-dan-offer`, `…-rescue-2-offer`, `…-archive-bunker-offer`), copy the consortium template and replace identity + body. Bodies should be a tightened version of the corresponding step's `flavor` prose from the contract JSON — the offer message arrives at activation as a kiosk-side prompt, not the long-form contract message.

Example body for `ceres-institute-rescue-1-offer`:

```ts
{
  id: 'ceres-institute-rescue-1-offer',
  from: 'Dean Bernard Porter, Ceres Institute',
  subject: 'Field Team Extraction — Tasking Active',
  body: [
    'Young pilot — the rescue listing is on the kiosk. Bring our people home.',
    'Psychosphere collection is paid out of the Institute discretionary line.',
    '— Porter',
  ],
  // …same trigger/folder fields the consortium template uses
}
```

The five offer messages all follow the same shape; do not collapse them into a loop unless the existing pattern is loop-based.

- [ ] **Step 3: Run the messaging tests**

Run: `bun test:unit src/lib/messages`
Expected: PASS. Some tests enumerate offer-message ids and may need new assertions; add them.

- [ ] **Step 4: Commit**

```bash
git add src/views/MapViewController.ts src/lib/messages/<files>
git commit -m "feat(ceres): wire offer messages and special-mission ids"
```

---

## Phase 5 — Achievements

### Task 14: Add the five achievements

**Files:**
- Modify: `src/data/achievements.ts`

- [ ] **Step 1: Read the existing pattern**

Read `src/data/achievements.ts` (first 200 lines and find the existing `contracts`-category achievements). Mirror the rule kinds — likely `specific_contract_completed` and `mission_kind_completed` plus possibly a new `mission_objective_completed` rule for "second rescue."

- [ ] **Step 2: Add the entries**

Five new achievement definitions:

```ts
{
  id: 'ceres-institute-accepted',
  category: 'contracts',
  // … glyph + title + subtitle
  rule: { kind: 'specific_contract_accepted', contractId: 'ceres-institute-eternal-biology' },
},
{
  id: 'ceres-first-psychosphere',
  category: 'contracts',
  rule: {
    kind: 'specific_contract_drop_collected',
    contractId: 'ceres-institute-eternal-biology',
    itemId: 'viroid-psychosphere',
    minCount: 1,
  },
},
{
  id: 'ceres-rescue-pattern',
  category: 'contracts',
  rule: {
    kind: 'specific_contract_step_completed',
    contractId: 'ceres-institute-eternal-biology',
    stepIndex: 5,
  },
},
{
  id: 'ceres-archive-transmitted',
  category: 'contracts',
  rule: {
    kind: 'specific_contract_completed',
    contractId: 'ceres-institute-eternal-biology',
    requiredOutcomeId: 'transmit',
  },
},
{
  id: 'ceres-archive-sabotaged',
  category: 'contracts',
  rule: {
    kind: 'specific_contract_completed',
    contractId: 'ceres-institute-eternal-biology',
    requiredOutcomeId: 'sabotage',
  },
},
```

If any of the rule kinds above don't exist (`specific_contract_accepted`, `specific_contract_drop_collected`, `specific_contract_step_completed`, `requiredOutcomeId`), add them to the `AchievementKind` union in `src/data/achievements.ts` and to the evaluator in `src/lib/achievements.ts`. Each new evaluator branch needs a unit test in `src/lib/__tests__/achievements.spec.ts`.

- [ ] **Step 3: Test the new achievements**

Run: `bun test:unit src/lib/__tests__/achievements.spec.ts`
Expected: PASS for existing tests; add a focused test for each new rule kind. Drive the contract through the same in-memory walkthrough as the contract spec and assert the relevant achievement unlocks.

- [ ] **Step 4: Commit**

```bash
git add src/data/achievements.ts src/lib/achievements.ts src/lib/__tests__/achievements.spec.ts
git commit -m "feat(achievements): add five ceres institute achievements"
```

---

## Phase 6 — Acceptance gates and manual smoke test

### Task 15: CI-style verification

- [ ] **Step 1: Type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 2: Lint**

Run: `bun run lint`
Expected: oxlint 0 errors, ESLint 0 errors / 0 warnings.

- [ ] **Step 3: Full test suite**

Run: `bun test:unit`
Expected: all green.

### Task 16: Manual smoke test on `/map`

- [ ] **Step 1: Boot dev server**

Run: `bun dev`

- [ ] **Step 2: Drive the contract end-to-end**

Use a save (or dev console) where the player has both `gravitySurfing` and `orbitalSurfing` installed at level ≥ 1. Orbit Ceres. Confirm Porter's intro arrives in the inbox. Accept it.

Walk steps 1–7:
- Pick the Earth supply shuttle mission from the Ceres kiosk; complete and orbit Ceres. Step 1 advances.
- Step 2 should auto-satisfy via `hasOrbitedPlanet` if the station is reachable; if not, fly to the station body and orbit it. Step advances.
- Steps 3, 4, 5, 6 — accept and complete the auto-staged Ceres special missions. Confirm offer messages arrive at each transition.
- Step 7 — accept the bunker mission, fly to the pinned Kuiper site, clear the wave (astronaut-chimera variants visible), interact with the terminal, choose **transmit**.

Confirm:
- Transmit arm completion message arrives
- `unlockedFastTravelPlanets` includes `'ceres'` (check via dev console: `loadProfile()`)
- `mission-pay-multiplier` for Ceres is set
- Story flag `ceres-archive-transmitted` is set

- [ ] **Step 3: Sabotage path on a separate save**

Reset, redrive the contract, choose **sabotage**. Confirm:
- Sabotage arm completion message arrives
- `disabledGiverIds['ceres-institute']` is `true`
- Story flags `ceres-archive-sabotaged` and `ceres-cult-exposed` are set
- Future Ceres-board listings no longer include Institute missions

- [ ] **Step 4: Final commit (if any cleanup landed)**

```bash
git status
# if changes: git add -p && git commit -m "chore(ceres): post-smoke cleanup"
```

---

## Out of scope (explicitly deferred)

- Cross-save / "completed both arms" achievement (`ceres-cult-exposed` — *The Foundation Will Remember*)
- Downstream contracts reading `ceres-cult-exposed` (Finch Act 3, USC reactions, Jovian reactions)
- Boss fight at the bunker (the wave is standard difficulty)
- Auto-staging of the Earth Supply Run shuttle mission (path B in Task 10 Step 6) — current plan uses path A
- Custom rescue mission flavor variants beyond the giver's procedural pool
- Time-attack "arrive within T seconds" gate for the station visit
- Carmen Act-3 wiring

---

## Open questions to resolve during implementation

1. **Ceres research station body schema** (Task 9). Confirm whether it's a `Planet`, `PinnedBody`, or new concept. If new, file a follow-up plan and ship Step 2 as a flavor-only `visit-planet` to `'ceres'` itself in the meantime.
2. **Astronaut-chimera variant entry point** (Task 12). The exact spawner that consumes `objective.enemyVariant` may need a new field or callsite.
3. **Achievement rule kinds** (Task 14). If `specific_contract_accepted` / `specific_contract_drop_collected` / `specific_contract_step_completed` don't exist, the evaluator needs new branches.
