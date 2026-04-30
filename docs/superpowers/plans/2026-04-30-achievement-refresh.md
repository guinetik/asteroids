# Achievement Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand achievements to cover economy, contracts, journeys, mission families, navigation, portals, and worldline distance using persisted profile stats plus the existing contract snapshot.

**Architecture:** Add `PlayerAchievementStats` to `PlayerProfile` for durable counters that cannot be reconstructed after refresh. Keep contract and mission-family progress derived from `ContractStoreSnapshot`. Achievement unlocks remain pure predicates in `src/lib/achievements.ts`, with map/shop integration points only responsible for updating profile stats.

**Tech Stack:** Vue 3, TypeScript, Three.js controllers, Bun, Vitest, localStorage-backed profile and contract persistence.

---

## File Structure

- Modify `src/lib/player/types.ts`: add `PlayerAchievementStats` and `achievementStats`.
- Modify `src/lib/player/profile.ts`: normalize legacy saves, initialize stats, update money stats, add stat helper functions.
- Modify `src/lib/player/__tests__/profile.spec.ts`: cover stat defaults, migration, money, navigation, worldline, objective helpers.
- Modify `src/lib/shop/shopSession.ts`: increment trade-only earnings on successful trade-good sales.
- Modify `src/lib/shop/__tests__/shopSession.spec.ts`: cover trade-only earnings.
- Modify `src/lib/map/overlay/MapOverlayProjector.ts`: return appended worldline segment distance.
- Modify `src/lib/map/overlay/__tests__/MapOverlayProjector.spec.ts`: cover segment-distance return values.
- Modify `src/data/achievements.ts`: add contract category, new kinds, metadata fields, and achievement rows.
- Modify `src/lib/achievements.ts`: evaluate new kinds and locked hints.
- Modify `src/lib/__tests__/achievements.spec.ts`: cover new evaluator kinds and hints.
- Modify `src/views/MapViewController.ts`: update stats at slingshot, gravity surf, manifold, portal, worldline, and mission-objective event points; expose `getContractSnapshot()`.
- Modify `src/views/MapView.vue`: pass contract snapshot into `AchievementProgress` and keep it refreshed.
- Review mission reward emission sites touched by `MapViewController` and `LevelViewController`: increment objective stats when a concrete objective type is known.

Commits are intentionally omitted from this plan unless the user explicitly asks for commits.

---

### Task 1: Profile Achievement Stats

**Files:**

- Modify: `src/lib/player/types.ts`
- Modify: `src/lib/player/profile.ts`
- Test: `src/lib/player/__tests__/profile.spec.ts`
- **Step 1: Add failing profile tests**

Add tests that assert fresh profiles and migrated legacy profiles include zeroed achievement stats,
money helpers update lifetime totals, and stat helper functions update immutable copies.

```ts
it('creates profiles with zeroed achievement stats', () => {
  const profile = createProfile('Pilot')

  expect(profile.achievementStats).toEqual({
    lifetimeCreditsEarned: 0,
    lifetimeCreditsSpent: 0,
    lifetimeTradeCreditsEarned: 0,
    missionObjectivesCompletedByType: {},
    slingshotLaunches: 0,
    slingshotLaunchesByBody: {},
    gravitySurfStarts: 0,
    manifoldRides: 0,
    portalDepartures: 0,
    lifetimeWorldLineDistance: 0,
    maxSingleRunWorldLineDistance: 0,
  })
})

it('migrates legacy profiles without achievement stats', () => {
  localStorage.setItem(
    PROFILE_STORAGE_KEY,
    JSON.stringify({
      name: 'Legacy',
      credits: 1234,
      completedMissionCount: 2,
      visitedAsteroids: { bennu: 1 },
    }),
  )

  expect(loadProfile()?.achievementStats.lifetimeCreditsEarned).toBe(0)
  expect(loadProfile()?.achievementStats.slingshotLaunchesByBody).toEqual({})
})

it('tracks earned and spent lifetime credits', () => {
  const earned = addCredits(createProfile('Pilot'), 500)
  expect(earned.credits).toBe(1500)
  expect(earned.achievementStats.lifetimeCreditsEarned).toBe(500)

  const spent = spendCredits(earned, 300)
  expect(spent?.achievementStats.lifetimeCreditsSpent).toBe(300)
  expect(spendCredits(earned, 999999)).toBeNull()
})

it('updates achievement stats through focused helpers', () => {
  let profile = createProfile('Pilot')
  profile = recordTradeCreditsEarned(profile, 250)
  profile = recordMissionObjectiveComplete(profile, 'survey')
  profile = recordSlingshotLaunch(profile, 'sun')
  profile = recordGravitySurfStart(profile)
  profile = recordManifoldRide(profile)
  profile = recordPortalDeparture(profile)
  profile = recordWorldLineDistance(profile, 100, 250)

  expect(profile.achievementStats.lifetimeTradeCreditsEarned).toBe(250)
  expect(profile.achievementStats.missionObjectivesCompletedByType.survey).toBe(1)
  expect(profile.achievementStats.slingshotLaunches).toBe(1)
  expect(profile.achievementStats.slingshotLaunchesByBody.sun).toBe(1)
  expect(profile.achievementStats.gravitySurfStarts).toBe(1)
  expect(profile.achievementStats.manifoldRides).toBe(1)
  expect(profile.achievementStats.portalDepartures).toBe(1)
  expect(profile.achievementStats.lifetimeWorldLineDistance).toBe(100)
  expect(profile.achievementStats.maxSingleRunWorldLineDistance).toBe(250)
})
```

- **Step 2: Run profile tests to verify failure**

Run:

```bash
bun test:unit src/lib/player/__tests__/profile.spec.ts
```

Expected: fail with missing `achievementStats` fields and helper exports.

- **Step 3: Add the profile type**

In `src/lib/player/types.ts`, add exported `PlayerAchievementStats` with TSDoc for every property,
then add this property to `PlayerProfile`:

```ts
/** Achievement-only counters persisted with the player profile. */
export interface PlayerAchievementStats {
  /** Lifetime credits earned after profile creation. Starting credits are excluded. */
  lifetimeCreditsEarned: number
  /** Lifetime credits spent through successful credit sinks, including upgrades. */
  lifetimeCreditsSpent: number
  /** Gross credits earned from successful trade-good sales only. */
  lifetimeTradeCreditsEarned: number
  /** Objective type id to completed count, e.g. `{ survey: 1, photometry: 2 }`. */
  missionObjectivesCompletedByType: Record<string, number>
  /** Number of outbound slingshot launches released from orbit. */
  slingshotLaunches: number
  /** Stable body id to outbound slingshot count, e.g. `{ sun: 1 }`. */
  slingshotLaunchesByBody: Record<string, number>
  /** Number of successful Gravity Surf rail coupling starts. */
  gravitySurfStarts: number
  /** Number of completed orbital manifold rides. */
  manifoldRides: number
  /** Number of outbound Vibe Jam edge portal crossings. */
  portalDepartures: number
  /** Lifetime sampled worldline distance in map world units. */
  lifetimeWorldLineDistance: number
  /** Longest sampled worldline distance in one continuous run. */
  maxSingleRunWorldLineDistance: number
}
```

- **Step 4: Add defaults and migration**

In `src/lib/player/profile.ts`, add `createDefaultAchievementStats()` and
`normalizeAchievementStats(raw)` near the other normalization helpers. Use finite non-negative
numbers and copy only string-keyed numeric maps.

```ts
function createDefaultAchievementStats(): PlayerAchievementStats {
  return {
    lifetimeCreditsEarned: 0,
    lifetimeCreditsSpent: 0,
    lifetimeTradeCreditsEarned: 0,
    missionObjectivesCompletedByType: {},
    slingshotLaunches: 0,
    slingshotLaunchesByBody: {},
    gravitySurfStarts: 0,
    manifoldRides: 0,
    portalDepartures: 0,
    lifetimeWorldLineDistance: 0,
    maxSingleRunWorldLineDistance: 0,
  }
}
```

Import `PlayerAchievementStats`, call `normalizeAchievementStats(p.achievementStats)` in
`normalizeLoadedProfile`, and set `achievementStats: createDefaultAchievementStats()` in
`createProfile`.

- **Step 5: Update money functions and add stat helpers**

Change `addCredits` and `spendCredits` to update stats for positive finite amounts. Add focused
helpers:

```ts
export function recordTradeCreditsEarned(profile: PlayerProfile, amount: number): PlayerProfile
export function recordMissionObjectiveComplete(profile: PlayerProfile, objectiveType: string): PlayerProfile
export function recordSlingshotLaunch(profile: PlayerProfile, bodyId: string): PlayerProfile
export function recordGravitySurfStart(profile: PlayerProfile): PlayerProfile
export function recordManifoldRide(profile: PlayerProfile): PlayerProfile
export function recordPortalDeparture(profile: PlayerProfile): PlayerProfile
export function recordWorldLineDistance(
  profile: PlayerProfile,
  segmentDistance: number,
  currentRunDistance: number,
): PlayerProfile
```

Each helper returns the same profile for invalid zero/negative inputs where applicable, otherwise a
new profile with only `achievementStats` changed.

- **Step 6: Run profile tests to verify pass**

Run:

```bash
bun test:unit src/lib/player/__tests__/profile.spec.ts
```

Expected: pass.

---

### Task 2: Shop Trading And Worldline Segment Distance

**Files:**

- Modify: `src/lib/shop/shopSession.ts`
- Test: `src/lib/shop/__tests__/shopSession.spec.ts`
- Modify: `src/lib/map/overlay/MapOverlayProjector.ts`
- Test: `src/lib/map/overlay/__tests__/MapOverlayProjector.spec.ts`
- **Step 1: Add failing shop trading test**

In `shopSession.spec.ts`, add:

```ts
it('tracks trade-only credits from successful sales', () => {
  const session = createShopSession('earth')
  const profile = createProfile('Joe')
  const inventory = addItem(createInventory(), 'cryogenic-coolants', 10).inventory

  const result = sellTradeGood(session, profile, inventory, 'cryogenic-coolants', 5)

  expect(result.ok).toBe(true)
  expect(result.profile.achievementStats.lifetimeTradeCreditsEarned).toBe(
    result.profile.credits - profile.credits,
  )
})
```

- **Step 2: Add failing worldline distance tests**

In `MapOverlayProjector.spec.ts`, update `recordWorldLinePoint` expectations:

```ts
expect(
  proj.recordWorldLinePoint({ orbitState: 'free', shipX: 100, shipZ: 0, shipDead: false }, 10),
).toBe(0)

expect(
  proj.recordWorldLinePoint({ orbitState: 'free', shipX: 5, shipZ: 0, shipDead: false }, 10),
).toBe(0)

expect(
  proj.recordWorldLinePoint({ orbitState: 'free', shipX: 20, shipZ: 0, shipDead: false }, 10),
).toBe(20)
```

- **Step 3: Run targeted tests to verify failure**

Run:

```bash
bun test:unit src/lib/shop/__tests__/shopSession.spec.ts src/lib/map/overlay/__tests__/MapOverlayProjector.spec.ts
```

Expected: fail because trade-only earnings are not tracked and `recordWorldLinePoint` returns
`void`.

- **Step 4: Update successful trade-good sale**

In `shopSession.ts`, import `recordTradeCreditsEarned`. After `addCredits(profile, totalPayout)`,
wrap the profile:

```ts
const creditedProfile = addCredits(profile, totalPayout)
const updatedProfile = recordTradeCreditsEarned(creditedProfile, totalPayout)
```

Return `updatedProfile`.

- **Step 5: Return segment distance from `MapOverlayProjector.recordWorldLinePoint`**

Change the method signature to `: number`. If recording is skipped, return `0`. Capture the last
point before append, append using `appendWorldLinePoint`, and return the Euclidean distance only if
the array length increased.

```ts
const previous = this.worldLineHistory[this.worldLineHistory.length - 1]
const next = appendWorldLinePoint(...)
const appended = next.length > this.worldLineHistory.length
this.worldLineHistory = next
if (!appended || !previous) return 0
return Math.hypot(input.shipX - previous.x, input.shipZ - previous.z)
```

- **Step 6: Run targeted tests to verify pass**

Run:

```bash
bun test:unit src/lib/shop/__tests__/shopSession.spec.ts src/lib/map/overlay/__tests__/MapOverlayProjector.spec.ts
```

Expected: pass.

---

### Task 3: Achievement Data And Evaluator

**Files:**

- Modify: `src/data/achievements.ts`
- Modify: `src/lib/achievements.ts`
- Test: `src/lib/__tests__/achievements.spec.ts`
- **Step 1: Add failing achievement evaluator tests**

Add helpers in `achievements.spec.ts`:

```ts
import { ACT_1_JOURNEY_ID, WELCOME_JOURNEY_ID } from '@/lib/journeys'
import { emptyContractSnapshot } from '@/lib/contracts/contractStorage'
import type { ContractStoreSnapshot } from '@/lib/contracts/contractTypes'

function progress(
  profile = createProfile('Pilot'),
  contractSnapshot: ContractStoreSnapshot = emptyContractSnapshot(),
): AchievementProgress {
  return { profile, upgradeLevels: {}, contractSnapshot }
}
```

Add cases for lifetime credits, contracts, mission kinds, objective kinds, navigation, portal,
worldline, Act I, and Hektor outcomes:

```ts
it('unlocks expanded economy achievements from profile stats', () => {
  const profile = {
    ...createProfile('Pilot'),
    credits: 10000,
    achievementStats: {
      ...createProfile('Pilot').achievementStats,
      lifetimeCreditsEarned: 100000,
      lifetimeCreditsSpent: 50000,
      lifetimeTradeCreditsEarned: 10000,
    },
  }

  const ids = evaluateAchievementUnlocks(progress(profile), []).newlyUnlocked.map((a) => a.id)
  expect(ids).toContain('credits-earned-one-hundred-thousand')
  expect(ids).toContain('credits-spent-fifty-thousand')
  expect(ids).toContain('credits-trade-ten-thousand')
})

it('unlocks contract and mission family achievements from contract snapshot', () => {
  const snapshot = emptyContractSnapshot()
  snapshot.instances['usc-venus-certification'] = {
    contractId: 'usc-venus-certification',
    status: 'completed',
    currentStepIndex: 1,
    stepCounters: [1],
    offeredAt: null,
    acceptedAt: null,
    completedAt: '2306-04-30T00:00:00.000Z',
    resolvedOutcomeId: null,
  }
  snapshot.missionCompletionsByKind = { asteroid: 5, eva: 1, mining: 1, shuttle: 1 }

  const ids = evaluateAchievementUnlocks(progress(createProfile('Pilot'), snapshot), []).newlyUnlocked.map(
    (a) => a.id,
  )
  expect(ids).toContain('contracts-first-complete')
  expect(ids).toContain('contracts-usc-venus-certification')
  expect(ids).toContain('missions-asteroid-five')
})
```

- **Step 2: Run achievement tests to verify failure**

Run:

```bash
bun test:unit src/lib/__tests__/achievements.spec.ts
```

Expected: fail with missing `contractSnapshot`, kinds, and row ids.

- **Step 3: Extend achievement types and imports**

In `src/data/achievements.ts`, import `ACT_1_JOURNEY_ID`, `ContractMissionType`, and
`ContractStoreSnapshot`. Add category `'contracts'`. Add the new kind literals and optional fields:
`contractId`, `missionKind`, `objectiveType`.

Update `AchievementProgress` to include `contractSnapshot: ContractStoreSnapshot`.

- **Step 4: Add achievement rows**

Add rows from the spec with stable ids:

```ts
credits-ten-thousand
credits-earned-twenty-five-thousand
credits-earned-fifty-thousand
credits-earned-one-hundred-thousand
credits-spent-ten-thousand
credits-spent-fifty-thousand
credits-trade-ten-thousand
contracts-first-complete
contracts-three-complete
contracts-usc-venus-certification
contracts-space-cowboys-mars-hq
contracts-martian-marine-corps-cohort
contracts-cinderline-mercury-consecration
contracts-jovian-society-prospection
contracts-hektor-liberated
contracts-hektor-destroyed
journey-act-1-inner-system
flight-first-slingshot
flight-ten-slingshots
flight-sun-launch
flight-first-gravity-surf
flight-first-manifold
flight-first-portal-departure
worldline-first-trace
worldline-long-thread
worldline-lifetime-ten-thousand
worldline-lifetime-fifty-thousand
missions-shuttle-first
missions-asteroid-first
missions-eva-first
missions-mining-first
missions-asteroid-five
missions-eva-five
missions-mining-five
missions-shuttle-five
missions-photometry-first
missions-dan-first
missions-survey-first
missions-bunker-first
missions-prospectus-terminal-first
missions-gather-five
upgrades-orbital-surfing
upgrades-turret-mining-unlock
upgrades-ten-tiers
upgrades-twenty-tiers
```

Keep Act II out of `ACHIEVEMENT_DEFINITIONS`.

- **Step 5: Implement evaluator helpers**

In `src/lib/achievements.ts`, add helpers:

```ts
function getCompletedContractCount(snapshot: ContractStoreSnapshot): number
function hasCompletedContract(snapshot: ContractStoreSnapshot, contractId: string): boolean
function getMissionKindCount(snapshot: ContractStoreSnapshot, kind: ContractMissionType): number
function getObjectiveCount(profile: PlayerProfile, objectiveType: string): number
function getAchievementStats(profile: PlayerProfile): PlayerAchievementStats
```

Add `switch` cases for every new kind. Add Hektor body access as a specific kind or use
`specific_contract_completed` only for contract rows and add a `body_access_state` kind for the two
Hektor rows. If using `body_access_state`, add `bodyId?: string` and `bodyAccessState?: BodyAccessState`
to `AchievementDefinition`.

- **Step 6: Implement locked hints**

Add contextual hints for every new kind. Use `toLocaleString()` for credits and rounded worldline
distances:

```ts
return `Earn ${needed.toLocaleString()} CR from trade-good sales (${current.toLocaleString()}/${needed.toLocaleString()} CR).`
return `Travel ${needed.toLocaleString()} worldline units (${Math.floor(current).toLocaleString()}/${needed.toLocaleString()}).`
```

- **Step 7: Run achievement tests to verify pass**

Run:

```bash
bun test:unit src/lib/__tests__/achievements.spec.ts
```

Expected: pass.

---

### Task 4: Vue Progress Snapshot And Contract Snapshot

**Files:**

- Modify: `src/views/MapViewController.ts`
- Modify: `src/views/MapView.vue`
- **Step 1: Add contract snapshot state to `MapView.vue`**

Import `ContractStoreSnapshot` and `emptyContractSnapshot`. Add:

```ts
const contractSnapshot = ref<ContractStoreSnapshot>(emptyContractSnapshot())
```

Update `achievementProgress`:

```ts
const achievementProgress = computed<AchievementProgress>(() => ({
  profile: playerProfileSnapshot.value,
  upgradeLevels: upgradeLevelsUi.value,
  contractSnapshot: contractSnapshot.value,
}))
```

- **Step 2: Expose defensive contract snapshot from controller**

In `MapViewController.ts`, add:

```ts
getContractSnapshot(): ContractStoreSnapshot {
  return structuredClone(contractSystem.getSnapshot())
}
```

If `ContractSystem` does not expose `getSnapshot()`, add a read-only method there that returns
`structuredClone(this.snapshot)`.

- **Step 3: Refresh snapshot in sync helper**

Update `syncPersistentProgressFromController()`:

```ts
contractSnapshot.value = viewController.getContractSnapshot()
```

Also call `syncPersistentProgressFromController()` after contract-changing operations already
handled by MapView callbacks, and after mission/trade paths that can update contract counters.

- **Step 4: Run type-check to catch integration errors**

Run:

```bash
bun run type-check
```

Expected: pass or show exact missing method/import errors to fix before continuing.

---

### Task 5: Map Controller Stat Wiring

**Files:**

- Modify: `src/views/MapViewController.ts`
- Review: `src/three/PortalBoundarySystem.ts`
- **Step 1: Add runtime worldline field and stat imports**

Import profile stat helpers:

```ts
recordGravitySurfStart,
recordManifoldRide,
recordMissionObjectiveComplete,
recordPortalDeparture,
recordSlingshotLaunch,
recordWorldLineDistance,
```

Add field:

```ts
private currentRunWorldLineDistance = 0
```

- **Step 2: Wire outbound portal departure**

Change boundary departure handler:

```ts
this.sceneEnvironment.boundarySystem.onDepart = (state) => {
  this.playerProfile = recordPortalDeparture(this.playerProfile)
  this.persistPlayerProfile()
  new VibePortal().depart(state as Record<string, string | number>)
}
```

- **Step 3: Wire gravity surf and manifold stats**

In `gravitySurfingController.onCouplingStart`, call:

```ts
this.playerProfile = recordGravitySurfStart(this.playerProfile)
this.persistPlayerProfile()
```

In `orbitalSurfingController.onComplete`, before or after orbit handoff, call:

```ts
this.playerProfile = recordManifoldRide(this.playerProfile)
this.persistPlayerProfile()
```

- **Step 4: Wire slingshot stats**

In `notifyOrbitalLaunchFromBodyName`, after resolving the stable body id used for contract launch
events, call:

```ts
this.playerProfile = recordSlingshotLaunch(this.playerProfile, bodyId)
this.persistPlayerProfile()
```

- **Step 5: Wire worldline distance**

Update `recordWorldLinePoint()`:

```ts
const segmentDistance = this.overlayProjector.recordWorldLinePoint(...args)
if (segmentDistance > 0) {
  this.currentRunWorldLineDistance += segmentDistance
  this.playerProfile = recordWorldLineDistance(
    this.playerProfile,
    segmentDistance,
    this.currentRunWorldLineDistance,
  )
  this.persistPlayerProfile()
}
```

Update `resetWorldLineHistory()` to set `this.currentRunWorldLineDistance = 0` after resetting the
visible trail.

- **Step 6: Wire objective stats**

At the same points that call `contractSystem.notifyMissionCompleted`, inspect the emitted
`objectiveType`. For non-empty strings:

```ts
this.playerProfile = recordMissionObjectiveComplete(this.playerProfile, objectiveType)
this.persistPlayerProfile()
```

Do not increment objective counters for shuttle/EVA events that still emit `''`.

- **Step 7: Run map-adjacent tests and type-check**

Run:

```bash
bun run type-check
bun test:unit src/lib/map/overlay/__tests__/MapOverlayProjector.spec.ts src/lib/__tests__/achievements.spec.ts
```

Expected: pass.

---

### Task 6: Final Verification

**Files:**

- All modified files.
- **Step 1: Run formatter**

Run:

```bash
bun format
```

Expected: files formatted with repo style.

- **Step 2: Run type-check**

Run:

```bash
bun run type-check
```

Expected: no TypeScript errors.

- **Step 3: Run lint**

Run:

```bash
bun run lint
```

Expected: oxlint 0 errors, ESLint 0 errors and 0 warnings.

- **Step 4: Run unit tests**

Run:

```bash
bun run test:unit
```

Expected: all Vitest tests pass.

- **Step 5: Manual smoke check**

Start the app:

```bash
bun dev
```

Expected manual checks:

- Achievements dialog opens and shows the new categories without crashing.
- Existing achievements still show locked/unlocked state.
- Selling a trade good advances trade-only earned credits.
- Crossing an outbound portal persists `portalDepartures` before navigation.
- Worldline distance stats increase while free-flying and survive refresh.

---

## Self-Review

- Spec coverage: profile stats, contract snapshot, money, trading, journeys, Act II exclusion,
navigation, portals, worldline distance, mission families, objective types, upgrades, UI hints,
and tests are covered.
- Placeholder scan: no open-ended markers or deferred implementation steps are used.
- Type consistency: plan uses `PlayerAchievementStats`, `AchievementProgress.contractSnapshot`,
`ContractStoreSnapshot`, `ContractMissionType`, and helper names consistently across tasks.

