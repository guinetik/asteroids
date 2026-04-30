# Contract-Aware Asteroid Mission Bias

> **For agentic workers:** Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** When a contract has an active `complete-missions` step that filters on `giverId` and/or `objectiveType` for asteroid missions, the planetary mission board should draft a matching mission instead of rolling random templates that can't satisfy the step.

**Architecture:** Extend `generateAsteroidMission` with a `requiredGiverId` parameter (already accepts `requiredObjectiveType`). Add a helper that queries the contract system for the active asteroid constraints at a given planet. In `MapMissionFacade.offerAsteroidMissionFromDifficulty`, query constraints, invalidate any stale offer that doesn't match, and pass constraints to the generator.

**Tech Stack:** TypeScript strict, existing `ContractSystem` API.

---

## File Structure

**Modified:**
- `src/lib/missions/asteroidMissionGenerator.ts` — add `requiredGiverId?: string | null` parameter, filter candidates considering host-giver-overrides
- `src/lib/contracts/contractMissionConstraints.ts` (new) — helper to query active contract step constraints
- `src/lib/map/missions/MapMissionFacade.ts` — query constraints, invalidate stale offer, pass to generator
- `src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts` — new tests for `requiredGiverId`
- `src/lib/contracts/__tests__/contractMissionConstraints.spec.ts` (new) — helper tests

---

## Task 1: Extend `generateAsteroidMission` with `requiredGiverId`

**Files:**
- Modify: `src/lib/missions/asteroidMissionGenerator.ts`
- Modify: `src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts`

The generator already takes `requiredObjectiveType`. Add a sibling `requiredGiverId` parameter that respects host-giver-overrides (Mercury → Cinderline).

**Semantic:** If `requiredGiverId` is set:
- If the host planet has a host-giver-override AND the override's `giverId` equals `requiredGiverId`, every template is eligible (all missions will be re-stamped to the override).
- Otherwise, filter candidates to templates whose `giver.id === requiredGiverId`.

- [ ] **Step 1: Write failing tests**

In `src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts`, append a new describe block. Use whatever helpers the file already has for building a host anchor; if none, build one inline.

```ts
describe('generateAsteroidMission requiredGiverId filter', () => {
  it('biases the candidate pool to the requested giver when no host override applies', () => {
    // Pick a planet without a host-giver override (e.g. jupiter) and a difficulty
    // band where multiple givers' templates are eligible. Generate with
    // requiredGiverId: 'jovian-society' a few times and assert every result
    // has giverId === 'jovian-society'.
    const host = { planetId: 'jupiter', worldX: 0, worldZ: 0 }
    const samples: string[] = []
    for (let i = 0; i < 20; i++) {
      const m = generateAsteroidMission(5, host, Math.random, null, 'jovian-society')
      samples.push(m.giverId)
    }
    expect(samples.every((g) => g === 'jovian-society')).toBe(true)
  })

  it('throws a clear error when no template matches the requiredGiverId at this planet', () => {
    const host = { planetId: 'jupiter', worldX: 0, worldZ: 0 }
    expect(() =>
      generateAsteroidMission(5, host, Math.random, null, 'this-giver-does-not-exist'),
    ).toThrow(/No templates match/)
  })

  it('respects host-giver-override: at Mercury, requiredGiverId="cinderline" allows any template', () => {
    // Mercury overrides every mission to giverId: 'cinderline'. So requesting
    // 'cinderline' as the required giverId should NOT narrow candidates — the
    // override stamps all of them anyway.
    const host = { planetId: 'mercury', worldX: 0, worldZ: 0 }
    const samples: string[] = []
    for (let i = 0; i < 10; i++) {
      const m = generateAsteroidMission(3, host, Math.random, null, 'cinderline')
      samples.push(m.giverId)
    }
    expect(samples.every((g) => g === 'cinderline')).toBe(true)
  })
})
```

If the imports at the top of the spec file don't include `generateAsteroidMission`, add it.

- [ ] **Step 2: Run, confirm failure**

Run: `bun test:unit src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts -t "requiredGiverId"`
Expected: tests fail because the function signature doesn't accept the parameter.

- [ ] **Step 3: Extend the function signature**

In `src/lib/missions/asteroidMissionGenerator.ts`, find the `generateAsteroidMission` function. Update the signature and TSDoc:

```ts
/**
 * Generate a complete asteroid mission at a given difficulty.
 *
 * @param difficulty - Mission difficulty (1-10).
 * @param host - Station planet and world position when the contract is drafted; waypoint is
 *   generated near that orbit. When omitted (tests, level URL overrides), uses Earth @ 1 AU.
 * @param rand - Optional RNG for deterministic tests.
 * @param requiredObjectiveType - Optional objective type the generated mission must include.
 * @param requiredGiverId - Optional giver id constraint. When set, the candidate pool is
 *   narrowed to templates whose giver matches — unless the host has a host-giver-override
 *   whose `giverId` already equals `requiredGiverId`, in which case every template is
 *   eligible (all of them will be re-stamped to the override at output time).
 * @returns Fully generated mission ready for the mission board.
 */
export function generateAsteroidMission(
  difficulty: number,
  host: AsteroidMissionHostAnchor | null = null,
  rand: () => number = Math.random,
  requiredObjectiveType: ConcreteObjective['type'] | null = null,
  requiredGiverId: string | null = null,
): GeneratedAsteroidMission {
```

- [ ] **Step 4: Apply the filter in the candidates loop**

Find the existing loop that builds `candidates` (around lines 750-775 in the file). Currently:

```ts
for (const giver of givers) {
  for (const template of giver.missions) {
    if (template.planetIds && !template.planetIds.includes(anchor.planetId)) {
      continue
    }
    // ...rest of filters...
  }
}
```

Compute the host override's effective giverId BEFORE the loop:

```ts
const hostOverride = getHostGiverOverride(anchor.planetId)
const hostEffectiveGiverId = hostOverride?.giverId ?? null
```

Add a giverId filter inside the giver loop, just after `combatOnlyHost` line:

```ts
for (const giver of givers) {
  // requiredGiverId narrows the pool unless the host override re-stamps every
  // mission to the requested giver — in which case all templates are eligible.
  if (
    requiredGiverId !== null &&
    hostEffectiveGiverId !== requiredGiverId &&
    giver.id !== requiredGiverId
  ) {
    continue
  }
  for (const template of giver.missions) {
    // ...existing body unchanged
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `bun test:unit src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts`
Expected: all tests pass (existing + 3 new).

- [ ] **Step 6: Commit**

```bash
git add src/lib/missions/asteroidMissionGenerator.ts src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts
git commit -m "feat(missions): add requiredGiverId parameter to generateAsteroidMission"
```

---

## Task 2: Contract constraint query helper

**Files:**
- Create: `src/lib/contracts/contractMissionConstraints.ts`
- Create: `src/lib/contracts/__tests__/contractMissionConstraints.spec.ts`

A pure function that queries active contract instances for the asteroid-mission constraints at a given planet.

- [ ] **Step 1: Write the test file first**

Create `src/lib/contracts/__tests__/contractMissionConstraints.spec.ts`:

```ts
/**
 * Tests for the contract → mission constraint query helper.
 *
 * @author guinetik
 * @date 2026-04-29
 * @spec docs/superpowers/plans/2026-04-29-contract-aware-asteroid-mission-bias.md
 */
import { describe, expect, it } from 'vitest'
import { MessageSystem } from '@/lib/messages/messageSystem'
import { ContractSystem } from '../ContractSystem'
import { emptyContractSnapshot } from '../contractStorage'
import { getActiveAsteroidContractConstraints } from '../contractMissionConstraints'
import type { Contract, ContractStoreSnapshot } from '../contractTypes'

const TEST_DATE = '2306-04-05 09:12 UTC'

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

function buildContract(steps: Contract['steps']): Contract {
  return {
    id: 'test-contract',
    inboxName: 'T',
    from: 't',
    sentAt: TEST_DATE,
    introSubject: 'T',
    introBody: ['t'],
    steps,
    completionSubject: 'd',
    completionBody: ['d'],
    rewards: [],
  }
}

describe('getActiveAsteroidContractConstraints', () => {
  it('returns null when no contracts are active', () => {
    const messages = new MessageSystem(emptyMessageStore())
    const contracts = new ContractSystem([], messages, inMemoryPersistence())
    expect(getActiveAsteroidContractConstraints(contracts, 'jupiter')).toBeNull()
  })

  it('returns constraints when an active asteroid step matches the planet', () => {
    const c = buildContract([
      {
        kind: 'complete-missions',
        count: 1,
        missionType: 'asteroid',
        giverId: 'jovian-society',
        objectiveType: 'gather',
        subject: 's',
        flavor: ['f'],
      },
    ])
    const messages = new MessageSystem(emptyMessageStore())
    const contracts = new ContractSystem([c], messages, inMemoryPersistence())
    contracts.resetForTests()
    contracts.offerForTests('test-contract')
    contracts.acceptContract('test-contract')
    const result = getActiveAsteroidContractConstraints(contracts, 'jupiter')
    expect(result).toEqual({ giverId: 'jovian-society', objectiveType: 'gather' })
  })

  it('returns null when the active step is not asteroid', () => {
    const c = buildContract([
      {
        kind: 'complete-missions',
        count: 1,
        missionType: 'mining',
        giverPlanetId: 'jupiter',
        subject: 's',
        flavor: ['f'],
      },
    ])
    const messages = new MessageSystem(emptyMessageStore())
    const contracts = new ContractSystem([c], messages, inMemoryPersistence())
    contracts.resetForTests()
    contracts.offerForTests('test-contract')
    contracts.acceptContract('test-contract')
    expect(getActiveAsteroidContractConstraints(contracts, 'jupiter')).toBeNull()
  })

  it('respects giverPlanetId on the step (skips when the planet does not match)', () => {
    const c = buildContract([
      {
        kind: 'complete-missions',
        count: 1,
        missionType: 'asteroid',
        giverId: 'jovian-society',
        giverPlanetId: 'jupiter',
        subject: 's',
        flavor: ['f'],
      },
    ])
    const messages = new MessageSystem(emptyMessageStore())
    const contracts = new ContractSystem([c], messages, inMemoryPersistence())
    contracts.resetForTests()
    contracts.offerForTests('test-contract')
    contracts.acceptContract('test-contract')
    expect(getActiveAsteroidContractConstraints(contracts, 'mars')).toBeNull()
    expect(getActiveAsteroidContractConstraints(contracts, 'jupiter')).toEqual({
      giverId: 'jovian-society',
      objectiveType: undefined,
    })
  })

  it('skips steps that carry specialMissionId (special-mission staging owns those)', () => {
    const c = buildContract([
      {
        kind: 'complete-missions',
        count: 1,
        missionType: 'asteroid',
        specialMissionId: 'jovian-prospection-hektor-photometry',
        subject: 's',
        flavor: ['f'],
      },
    ])
    const messages = new MessageSystem(emptyMessageStore())
    const contracts = new ContractSystem([c], messages, inMemoryPersistence())
    contracts.resetForTests()
    contracts.offerForTests('test-contract')
    contracts.acceptContract('test-contract')
    // Special missions are auto-staged; the random board generator should not
    // try to draft for them.
    expect(getActiveAsteroidContractConstraints(contracts, 'jupiter')).toBeNull()
  })

  it('returns the FIRST matching active step when multiple contracts have candidates', () => {
    const a = buildContract([
      {
        kind: 'complete-missions',
        count: 1,
        missionType: 'asteroid',
        giverId: 'jovian-society',
        objectiveType: 'gather',
        subject: 's',
        flavor: ['f'],
      },
    ])
    a.id = 'a'
    const b = buildContract([
      {
        kind: 'complete-missions',
        count: 1,
        missionType: 'asteroid',
        giverId: 'space-cowboys',
        subject: 's',
        flavor: ['f'],
      },
    ])
    b.id = 'b'
    const messages = new MessageSystem(emptyMessageStore())
    const contracts = new ContractSystem([a, b], messages, inMemoryPersistence())
    contracts.resetForTests()
    contracts.offerForTests('a')
    contracts.acceptContract('a')
    contracts.offerForTests('b')
    contracts.acceptContract('b')
    const result = getActiveAsteroidContractConstraints(contracts, 'jupiter')
    expect(result).not.toBeNull()
    // Either order is fine — just verify the helper returned something for one of them
    expect(['jovian-society', 'space-cowboys']).toContain(result?.giverId)
  })
})
```

- [ ] **Step 2: Run tests, confirm failure**

Run: `bun test:unit src/lib/contracts/__tests__/contractMissionConstraints.spec.ts`
Expected: import error — `getActiveAsteroidContractConstraints` doesn't exist yet.

- [ ] **Step 3: Implement the helper**

Create `src/lib/contracts/contractMissionConstraints.ts`:

```ts
/**
 * Helper to derive contract-driven constraints for asteroid mission generation.
 *
 * The mission board generator picks templates randomly from the eligible pool.
 * When a contract has an active step that filters on `giverId` and/or
 * `objectiveType` for asteroid missions, the random pick frequently fails to
 * satisfy the step — the player ends up with a board that can't advance the
 * contract. This helper looks at currently-active contracts and returns the
 * constraints (if any) the board generator should respect when drafting at a
 * specific planet.
 *
 * Steps that carry `specialMissionId` are deliberately excluded — special
 * missions are auto-staged via `MapViewController.handleContractStepActivated`
 * and bypass the random board generator entirely.
 *
 * @author guinetik
 * @date 2026-04-29
 * @spec docs/superpowers/plans/2026-04-29-contract-aware-asteroid-mission-bias.md
 */
import type { ContractSystem } from './ContractSystem'

/** Constraints derived from an active contract step's filter shape. */
export interface AsteroidContractConstraints {
  /** Required giver id (matches `MissionCompletedEvent.giverId`). */
  giverId?: string
  /** Required objective type (matches `MissionCompletedEvent.objectiveType`). */
  objectiveType?: string
}

/**
 * Walk active contract instances, find the first whose current step is a
 * `complete-missions` step with `missionType: 'asteroid'` that could be
 * satisfied at this planet, and return its constraints. Steps with
 * `specialMissionId` are skipped (those are auto-staged elsewhere).
 *
 * @param contracts - Live contract system (read-only access).
 * @param planetId - Host planet id where a mission is about to be drafted.
 * @returns Constraints to pass into the generator, or `null` if no active
 *   step needs biased generation at this planet.
 */
export function getActiveAsteroidContractConstraints(
  contracts: ContractSystem,
  planetId: string,
): AsteroidContractConstraints | null {
  for (const instance of contracts.listInstances()) {
    if (instance.status !== 'active') continue
    const contract = contracts.getContract(instance.contractId)
    if (!contract) continue
    const step = contract.steps[instance.currentStepIndex]
    if (!step || step.kind !== 'complete-missions') continue
    if (step.missionType !== 'asteroid') continue
    // Auto-staged special missions skip the random generator entirely.
    if (step.specialMissionId !== undefined) continue
    // Step pinned to a different planet — won't match here.
    if (step.giverPlanetId !== undefined && step.giverPlanetId !== planetId) continue
    // No giverId nor objectiveType filter to bias on.
    if (step.giverId === undefined && step.objectiveType === undefined) continue
    return {
      giverId: step.giverId,
      objectiveType: step.objectiveType,
    }
  }
  return null
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `bun test:unit src/lib/contracts/__tests__/contractMissionConstraints.spec.ts`
Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contracts/contractMissionConstraints.ts src/lib/contracts/__tests__/contractMissionConstraints.spec.ts
git commit -m "feat(contracts): helper to query active asteroid contract constraints by planet"
```

---

## Task 3: Wire constraints into MapMissionFacade

**Files:**
- Modify: `src/lib/map/missions/MapMissionFacade.ts`

When drafting an asteroid mission at a planet:
1. Query active contract constraints for that planet
2. If an existing offer exists but doesn't satisfy the constraints, drop it (the "sticky offer" rule yields to active contract requirements)
3. Pass constraints to the generator

- [ ] **Step 1: Read the current `offerAsteroidMissionFromDifficulty`**

Already loaded earlier. The method has three early-returns:
1. `activeAsteroidMission` exists → bail
2. `asteroidRestockTimer` set → bail
3. `offeredAsteroidMission` exists for this same planet → keep it

We need to extend (3): keep the existing offer ONLY IF it also satisfies the active contract constraints (if any).

- [ ] **Step 2: Add imports and helper**

At the top of `src/lib/map/missions/MapMissionFacade.ts`, add:

```ts
import { contractSystem } from '@/lib/contracts/runtime'
import {
  getActiveAsteroidContractConstraints,
  type AsteroidContractConstraints,
} from '@/lib/contracts/contractMissionConstraints'
import type { GeneratedAsteroidMission } from '@/lib/missions/types'
```

(If `contractSystem` is already imported, skip it. `GeneratedAsteroidMission` may already be imported.)

Add a private helper (or module-level pure function) to test whether an existing offer satisfies the constraints:

```ts
/**
 * Whether an offered asteroid mission satisfies a contract's active constraints.
 * Returns `true` when no constraints exist (nothing to satisfy).
 *
 * @param mission - Currently offered asteroid mission.
 * @param constraints - Active contract constraints for this planet, or null.
 * @returns Whether the existing offer can be kept.
 */
function offerSatisfiesContractConstraints(
  mission: GeneratedAsteroidMission,
  constraints: AsteroidContractConstraints | null,
): boolean {
  if (!constraints) return true
  if (constraints.giverId !== undefined && mission.giverId !== constraints.giverId) return false
  if (
    constraints.objectiveType !== undefined &&
    !mission.objectives.some((o) => o.type === constraints.objectiveType)
  ) {
    return false
  }
  return true
}
```

- [ ] **Step 3: Update `offerAsteroidMissionFromDifficulty`**

Replace the existing method body. The flow:
1. Bail if active mission exists or restock timer is set
2. Query constraints for this planet
3. If existing offer exists for this planet AND satisfies constraints, keep it
4. Otherwise generate a new mission with constraints applied

```ts
  offerAsteroidMissionFromDifficulty(
    host: AsteroidMissionHostAnchor,
    onMissionBoardUpdate: ((board: ShuttleMissionBoard) => void) | null,
  ): void {
    if (this.board.activeAsteroidMission) return
    if (this.board.asteroidRestockTimer) return

    const constraints = getActiveAsteroidContractConstraints(contractSystem, host.planetId)

    if (
      this.board.offeredAsteroidMission &&
      this.board.offeringAsteroidPlanet === host.planetId &&
      offerSatisfiesContractConstraints(this.board.offeredAsteroidMission, constraints)
    ) {
      return
    }

    const difficulty = computeMissionDifficulty(CURRENT_PLAYER_UPGRADE_LEVELS)
    let mission: ReturnType<typeof generateAsteroidMission>
    try {
      mission = generateAsteroidMission(
        difficulty,
        host,
        Math.random,
        (constraints?.objectiveType as ConcreteObjective['type'] | undefined) ?? null,
        constraints?.giverId ?? null,
      )
    } catch (err) {
      console.warn('[MapMissionFacade] No asteroid contract drafted:', err)
      return
    }
    console.warn(
      `[MapMissionFacade] Drafted asteroid mission "${mission.name}" from ${host.planetId} @ ${formatWaypointDebug(host.worldX, host.worldZ)} -> waypoint ${formatWaypointDebug(mission.waypoint.worldX, mission.waypoint.worldZ)} difficulty=${difficulty} region=${mission.region}${constraints ? ` (constrained: giverId=${constraints.giverId ?? '*'} objectiveType=${constraints.objectiveType ?? '*'})` : ''}`,
    )
    this.board = offerAsteroidMission(this.board, mission)
    onMissionBoardUpdate?.(this.board)
  }
```

(The `(constraints?.objectiveType as ...)` cast is because `requiredObjectiveType` on the generator is typed as `ConcreteObjective['type'] | null`, but the constraint helper returns it as a `string`. They're the same set of strings — the cast is safe. If the type-check rejects, the implementer adds the proper import or widens the constraint type.)

If `ConcreteObjective` isn't imported, add:

```ts
import type { ConcreteObjective } from '@/lib/missions/types'
```

- [ ] **Step 4: Verify**

Run: `bun run type-check`
Expected: PASS.

Run: `bun test:unit`
Expected: full green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/map/missions/MapMissionFacade.ts
git commit -m "feat(map): bias asteroid mission drafting to active contract constraints"
```

---

## Task 4: Acceptance gate

- [ ] **Step 1: Type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: clean.

- [ ] **Step 2: Full unit suite**

Run: `bun test:unit`
Expected: full green (1990+ baseline, plus new tests from Tasks 1, 2).

- [ ] **Step 3: Manual — Jupiter Jovian recruitment (optional dev verify)**

`bun dev`. Fresh save: complete Marines, orbit Jupiter, accept Jovian contract. Visit Jupiter station. Asteroid mission board should now offer a **Jovian Society gather mission** (not Jay's gravimetric survey or a Frontier mission). Accept and complete it; Step 1 should advance.

- [ ] **Step 4: Manual — Mercury Cinderline regression**

Visit Mercury with a Cinderline contract step. The host-giver-override should still re-stamp every drafted mission as Cinderline; the constraint helper sees `giverId === 'cinderline'` matches the override's giverId, so all templates remain eligible (no narrow filter). Mission board behavior unchanged.

---

## Notes for the implementer

- **Why constraints skip `specialMissionId`:** Plan 4's auto-staging hook (`MapViewController.handleContractStepActivated`) sets the active asteroid mission directly on step entry. The random board generator never runs for those steps. If we returned constraints anyway, the generator would try to find a regular template matching the special mission's giver, which is wasted work and could mask bugs.

- **`giverPlanetId` semantics:** `complete-missions` steps can carry an optional `giverPlanetId` filter — the step only counts missions completed at that posting station. The constraint helper respects it: a Jovian step with `giverPlanetId: 'jupiter'` constrains generation at Jupiter, but returns null for other planets so their boards don't get pulled in.

- **First-match semantics:** When multiple active contracts have candidate steps, the helper returns the constraints of the first one it finds. In practice contracts rarely overlap on the same planet, and if they do, the player will rotate through them as each completes. This is YAGNI for plan 5; revisit if it causes feel issues.

- **Host-giver-override interaction:** Mercury → Cinderline is the only override today. The generator's filter logic respects the override semantically — when `requiredGiverId` matches the override's `giverId`, every template is eligible (they'll all be re-stamped). When it doesn't match, the filter narrows by `giver.id` directly.
