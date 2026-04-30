# Achievement Refresh Design

**Date:** 2026-04-30
**Status:** Approved

## Overview

Refresh achievements so they reflect the systems now in the game: contracts, journey arcs,
mission families, money flow, upgrades, grav jumping, manifold travel, and worldline travel.

The achievement system remains derived from saved progress. It does not become a general event
log. New durable achievement-only counters live on `PlayerProfile.achievementStats`; contract and
mission-family progress continues to come from `ContractStoreSnapshot`.

## Goals

- Add achievements for money earned, money spent, contracts, Act I, navigation milestones,
worldline distance, mission families, NPC/partner arcs, and story upgrades.
- Keep achievement evaluation pure and testable in `src/lib/achievements.ts`.
- Persist achievement progress that cannot be reconstructed after a refresh.
- Avoid shipping unreachable Act II achievements before the Act II journey and Saturn contract
exist.

## Non-Goals

- No generic analytics/event-log system.
- No backend or account-level achievement sync.
- No retroactive reconstruction for stats that were not previously tracked, except where existing
profile or contract state can safely derive progress.

## Current System

`src/data/achievements.ts` defines achievement rows and currently evaluates against:

```ts
interface AchievementProgress {
  profile: PlayerProfile
  upgradeLevels: UpgradeLevels
}
```

Existing unlock kinds cover welcome journey completion, total missions, unique asteroids, credit
balance, upgrade tiers, specific upgrade unlocks, and first orbit around solar bodies.

Missing coverage:

- Lifetime credits earned and spent.
- Contract completion milestones.
- Per-mission-family completions.
- Slingshot, gravity surf, and manifold usage.
- Worldline distance travelled across refreshes.
- Act I journey completion.
- Planned Act II completion after Jovian plus Saturn contract work.

## Data Model

Add a nested stats object to `PlayerProfile`:

```ts
interface PlayerAchievementStats {
  lifetimeCreditsEarned: number
  lifetimeCreditsSpent: number
  lifetimeTradeCreditsEarned: number
  missionObjectivesCompletedByType: Record<string, number>
  slingshotLaunches: number
  slingshotLaunchesByBody: Record<string, number>
  gravitySurfStarts: number
  manifoldRides: number
  portalDepartures: number
  lifetimeWorldLineDistance: number
  maxSingleRunWorldLineDistance: number
}

interface PlayerProfile {
  achievementStats: PlayerAchievementStats
}
```

Fresh profiles initialize every numeric field to `0` and maps to `{}`. Migrated profiles also
default missing fields to those values.

`lifetimeCreditsEarned` does not include starting credits. It increments when game systems call
`addCredits`. `lifetimeCreditsSpent` increments only after `spendCredits` succeeds.
`lifetimeTradeCreditsEarned` increments only from successful trade-good sell payouts in the
planetary shop. It is gross trading revenue, not net profit, because inventory items can come from
mission rewards, bunker loot, or purchases and do not currently store cost basis.
Upgrade purchases must count toward `lifetimeCreditsSpent`; upgrades are the largest money sink in
the game and should advance spending achievements through the same `spendCredits` path as shops,
repairs, and refuels.

`lifetimeWorldLineDistance` and `maxSingleRunWorldLineDistance` are measured in map world units
using the same sampled points that draw the worldline overlay. The visible worldline may reset on
refresh, respawn, or death; achievement distance must not reset.

## Achievement Progress Input

Extend `AchievementProgress`:

```ts
interface AchievementProgress {
  profile: PlayerProfile
  upgradeLevels: UpgradeLevels
  contractSnapshot: ContractStoreSnapshot
}
```

`MapView.vue` should pass the current contract snapshot into achievement evaluation. The map
controller exposes a `getContractSnapshot()` helper that returns a defensive copy from the hydrated
contract system; `syncPersistentProgressFromController()` refreshes it with the profile and upgrade
snapshots.

## Unlock Kinds

Add these achievement kinds to `AchievementDefinition.kind`:

```ts
type AchievementKind =
  | 'credits_lifetime_earned'
  | 'credits_lifetime_spent'
  | 'credits_trade_earned'
  | 'contract_completed_count'
  | 'specific_contract_completed'
  | 'mission_kind_completed'
  | 'mission_objective_completed'
  | 'slingshot_launches'
  | 'slingshot_from_body'
  | 'gravity_surf_starts'
  | 'manifold_rides'
  | 'portal_departures'
  | 'worldline_lifetime_distance'
  | 'worldline_single_run_distance'
```

Add optional fields:

```ts
interface AchievementDefinition {
  contractId?: string
  missionKind?: ContractMissionType
  objectiveType?: string
}
```

Use existing fields where possible:

- `threshold` for counts, credits, and distances.
- `orbitBodyKey` for slingshot body ids such as `"sun"`.
- `journeyId` for Welcome and Act I journey achievements.
- `upgradeId` for specific upgrade achievements.

## Tracking Points

### Money

Update `src/lib/player/profile.ts`.

- `addCredits(profile, amount)` increments `profile.achievementStats.lifetimeCreditsEarned` by
positive `amount`.
- `spendCredits(profile, amount)` increments `profile.achievementStats.lifetimeCreditsSpent` only
when the spend succeeds.
- `sellTradeGood(session, profile, inventory, itemId, quantity)` increments
`profile.achievementStats.lifetimeTradeCreditsEarned` by the successful sale payout.
- Non-trade credit sources, achievement rewards, mission payouts, refuel purchases, repairs, and
upgrade purchases must not increment `lifetimeTradeCreditsEarned`.

### Slingshot / Grav Jump

Update the existing slingshot release path in `MapViewController`.

- `notifyOrbitalLaunchFromBodyName(bodyName)` already resolves the body name to a stable body id
for contract `launch-from-body` steps.
- After resolving the body id, increment `slingshotLaunches`.
- Increment `slingshotLaunchesByBody[bodyId]`.
- The first grav-jump achievement uses `slingshotLaunches >= 1`.
- The Sun-launch achievement uses `slingshotLaunchesByBody.sun >= 1`.

### Gravity Surf

Use `GravitySurfingController.onCouplingStart`.

- Increment `gravitySurfStarts` once per successful rail coupling start.
- Do not increment when the player only toggles the grid or fails to snap to a rail.

### Manifold Ride

Use `OrbitalSurfingController.onComplete`.

- Increment `manifoldRides` once per completed manifold ride.
- The first manifold achievement uses `manifoldRides >= 1`.

### Vibe Jam Portal Crossing

Use `PortalBoundarySystem.onDepart`, wired in `MapViewController` through
`sceneEnvironment.boundarySystem.onDepart`.

- Increment `portalDepartures` immediately before calling `new VibePortal().depart(...)`.
- Persist the profile before navigation changes `window.location.href`.
- The portal-crossing achievement uses `portalDepartures >= 1`.
- Portal arrivals from another game do not increment this counter; the achievement is for crossing
one of this game's outbound edge portals.

### Worldline Distance

Update `MapOverlayProjector.recordWorldLinePoint` to return the appended segment distance.

When a new sampled point is appended:

- Compute distance from the previous sampled point to the new sampled point.
- Add that distance to `achievementStats.lifetimeWorldLineDistance`.
- Track a runtime-only `currentRunWorldLineDistance` in `MapViewController`.
- Add the segment distance to `currentRunWorldLineDistance`.
- Set `maxSingleRunWorldLineDistance` to the max of its saved value and
`currentRunWorldLineDistance`.

When the visual worldline resets, reset only `currentRunWorldLineDistance`. Do not subtract from
`lifetimeWorldLineDistance` or `maxSingleRunWorldLineDistance`.

### Contracts And Mission Families

Use `ContractStoreSnapshot` for:

- Completed contract count: count instances where `status === 'completed'`.
- Specific contract completion: check the instance status for `contractId`.
- Mission family completion: read `missionCompletionsByKind`.

This keeps contract progress in the contract system and avoids duplicate counters in the profile.

### Mission Objective Types

Persist objective-family completions in `PlayerAchievementStats.missionObjectivesCompletedByType`.

- When a mission-completion event includes a non-empty `objectiveType`, increment that objective
key.
- Asteroid and special mission completion paths should emit the primary objective type already
present on their mission definitions: `gather`, `survey`, `photometry`, `dan`, `bunker`,
`prospectus-terminal`, and similar authored objective ids.
- Shuttle and EVA emissions that currently report `''` should not increment objective counters
until they emit a real objective type.

## Achievement Catalog

### Credits

- `credits-two-thousand`: existing balance milestone.
- `credits-five-thousand`: existing balance milestone.
- `credits-ten-thousand`: hold 10,000 CR at once.
- `credits-earned-twenty-five-thousand`: earn 25,000 lifetime CR.
- `credits-earned-fifty-thousand`: earn 50,000 lifetime CR.
- `credits-earned-one-hundred-thousand`: earn 100,000 lifetime CR.
- `credits-spent-ten-thousand`: spend 10,000 lifetime CR.
- `credits-spent-fifty-thousand`: spend 50,000 lifetime CR.
- `credits-trade-ten-thousand`: earn 10,000 CR from trade-good sales.

### Contracts

Create a new category `contracts` with label `Contracts`.

- First completed contract.
- Three completed contracts.
- `usc-venus-certification` complete.
- `space-cowboys-mars-hq` complete.
- `martian-marine-corps-cohort` complete.
- `cinderline-mercury-consecration` complete.
- `jovian-society-prospection` complete.
- Hektor liberated, based on `profile.bodyAccess.hektor === 'liberated'`.
- Hektor destroyed, based on `profile.bodyAccess.hektor === 'destroyed'`.

Hektor outcome achievements are mutually exclusive in normal play because the player selects one
final Jovian outcome.
Only one should be unlockable in a normal save.

### Journeys

- Keep `flight-first-launch` tied to `WELCOME_JOURNEY_ID`.
- Add an Act I achievement tied to `ACT_1_JOURNEY_ID`.
- Plan an Act II achievement in this spec, but do not add it to
`ACHIEVEMENT_DEFINITIONS` until:
  - a new Act II journey id exists in `JourneyId`,
  - the Jovian Society contract is part of that journey,
  - a Saturn contract exists and is part of that journey.

The planned Act II completion condition is: complete the Jovian Society contract and the future
Saturn contract, then complete the Act II journey. Until those systems exist, there must be no
dead achievement row visible in the achievements dialog.

### Flight And Navigation

- First slingshot / grav jump.
- Ten slingshot launches.
- Launch from the Sun.
- First Gravity Surf rail coupling.
- First completed manifold ride.
- First Vibe Jam portal crossing at the edge of the solar system.

### Worldline

Worldline achievements use distance, not sample count.

- `worldline-first-trace`: travel 100 world units of sampled worldline distance.
- `worldline-long-thread`: reach 2,500 world units in one continuous run.
- `worldline-lifetime-ten-thousand`: travel 10,000 lifetime sampled worldline units.
- `worldline-lifetime-fifty-thousand`: travel 50,000 lifetime sampled worldline units.

### Mission Families

Use `ContractMissionType` counts from `contractSnapshot.missionCompletionsByKind`.

- First shuttle mission.
- First asteroid mission.
- First EVA mission.
- First mining mission.
- Five asteroid missions.
- Five EVA missions.
- Five mining missions.
- Five shuttle missions.

Use `profile.achievementStats.missionObjectivesCompletedByType` for objective-type achievements.

- First photometry mission.
- First DAN mission.
- First gravitometric survey mission, keyed by objective type `survey`.
- First bunker mission.
- First prospectus terminal mission.
- Five gather missions.

### Upgrades

Keep existing total-tier and `gravitySurfing` achievements. Add:

- `orbitalSurfing` unlock.
- `turretMiningUnlock` unlock.
- Ten total upgrade tiers.
- Twenty total upgrade tiers.

## UI Behavior

`AchievementsDialog` should continue grouping rows by category in definition order. Locked hints
must be contextual for the new kinds:

- Contract count: show completed count and target.
- Specific contract: name the contract or partner.
- Mission kind: show current family count and target.
- Money earned/spent: show current lifetime value and target.
- Trade earnings: show current trade-only earnings and target.
- Worldline: show current distance and target.
- Navigation: show current count and target.
- Portal crossing: show whether the player has crossed an outbound portal.

Achievement reward credits still flow through the existing banner path in `MapView.vue`.
Reward credits count as earned credits because they are real credits added to the profile.

## Testing Plan

Update `src/lib/player/__tests__/profile.spec.ts`:

- Fresh profiles include zeroed `achievementStats`.
- Loaded legacy profiles migrate missing `achievementStats`.
- `addCredits` increments `lifetimeCreditsEarned`.
- `spendCredits` increments `lifetimeCreditsSpent` only on success.
- Successful trade-good sales increment `lifetimeTradeCreditsEarned`.

Update `src/lib/__tests__/achievements.spec.ts`:

- Unlocks lifetime earned and spent credit achievements.
- Unlocks trade-only credit achievements from `lifetimeTradeCreditsEarned`.
- Unlocks contract count and specific-contract achievements from `ContractStoreSnapshot`.
- Unlocks mission-kind achievements from `missionCompletionsByKind`.
- Unlocks objective-type achievements from `missionObjectivesCompletedByType`.
- Unlocks Act I from `ACT_1_JOURNEY_ID`.
- Unlocks slingshot, gravity surf, manifold, and worldline achievements from
`profile.achievementStats`.
- Unlocks the portal-crossing achievement from `portalDepartures`.
- Returns useful locked hints for the new kinds.

Update map overlay tests for the `recordWorldLinePoint` segment-distance return:

- First point appends with `0` distance.
- Below-threshold movement appends nothing and returns `0`.
- Above-threshold movement returns the segment distance.

## File Impact

- `src/data/achievements.ts`: new category, kinds, row definitions, and optional metadata fields.
- `src/lib/achievements.ts`: evaluator and locked hints for new kinds.
- `src/lib/player/types.ts`: `PlayerAchievementStats`.
- `src/lib/player/profile.ts`: migration, defaults, money/objective stat updates, stat helper
functions.
- `src/lib/shop/shopSession.ts`: increment trade-only earnings on successful trade-good sales.
- `src/lib/__tests__/achievements.spec.ts`: evaluator coverage.
- `src/lib/player/__tests__/profile.spec.ts`: profile stat coverage.
- `src/lib/map/overlay/MapOverlayProjector.ts`: expose appended worldline segment distance.
- `src/views/MapViewController.ts`: update navigation and worldline stats at existing event points.
- `src/three/PortalBoundarySystem.ts`: no model change expected; existing `onDepart` remains the
crossing signal.
- `src/views/MapView.vue`: include contract snapshot in `AchievementProgress`.
- Mission reward emission sites: increment objective-type stats when a concrete objective type is
known.

## Acceptance Criteria

- Existing achievements still unlock from existing saves.
- Legacy saves load with defaulted achievement stats.
- Act I achievement unlocks when `ACT_1_JOURNEY_ID` is complete.
- No Act II achievement row is visible until the Act II journey and Saturn contract exist.
- Worldline achievements advance by distance travelled and survive refreshes.
- Portal-crossing achievement persists before outbound portal navigation.
- Contract and mission-family achievements derive from `ContractStoreSnapshot`.
- `bun run type-check`, `bun run lint`, and `bun run test:unit` pass.

