# Gather Mission Design

- **Date**: 2026-04-18
- **Author**: guinetik
- **Status**: Implemented

## Problem

The `gather` mission type was fully scaffolded — `'gather'` was in
`ObjectiveType`, four mission templates rolled gather objectives, the
drill multi-tool mode existed, and the HUD/compass already rendered
the `GATHER` label — but nothing connected those pieces. Drill bolts
fired into rocks but nothing was extracted, no inventory was granted,
and `LevelViewController.init()` skipped `gather` when constructing
minigames. Mining was effectively a cosmetic action.

## Goals

- Universal mining: every `SurfaceRockController` rock can be drilled,
  not just deposits flagged by a mission.
- Mining writes minerals to the shuttle inventory immediately. No
  EVA-side staging, no lander handoff, no exfil bookkeeping.
- Gather objectives ask the player to mine `N` distinct minerals up to
  a per-mineral kg quota, where `N` scales with difficulty (1 at
  easy, 2 at mid, 3 at hard). The crate is a "ship it" gate after
  quotas are met, not a transactional drop point.
- Existing `collect` minigame keeps working with its glowing crate
  visual; the new gather minigame reuses the same prop with a tinted
  variant.

## Non-Goals

- Designing a tiered drill upgrade tree (out of scope for this pass).
- Deposit "vein" props or hand-authored ore prefabs — every rock is a
  fair target.
- Reworking how `asteroidMissionRewards.ts` grants payouts. CR continues
  to flow through `mission.totalReward`; minerals already arrived
  during play.

## Design

### Universal mining loop

```
Drill bolt hits a registered rock
  -> ProjectileSystem.onRockHit(spawnIndex, position)
     -> RockYieldSystem.mineRock(spawnIndex)
        -> deduct kg, fire onMineralExtracted(itemId, kg, spawnIndex)
           -> LevelViewController writes to shuttle inventory
           -> GatherMinigame increments matching quota (if any)
        -> if depleted: fire onConsume(spawnIndex)
           -> SurfaceRockController.hideRock(spawnIndex)
           -> LevelViewController.removeRockCollider(spawnIndex)
           -> ProjectileSystem.removeRock(spawnIndex)
```

The `RockYieldSystem` is renderer-agnostic. It owns:

- A weighted composition picker that resolves each rock to a single
  mineral id at registration time (deterministic from `seed +
  spawnIndex`).
- A per-rock kg budget derived from `spawn.diameter`, clamped to
  `[MIN_ROCK_YIELD_KG, MAX_ROCK_YIELD_KG]`.
- Two callbacks (`onMineralExtracted`, `onConsume`) that the host
  wires up at construction time.

Drill bolts get a separate registry inside `ProjectileSystem` —
`addRock(entry)` / `removeRock(spawnIndex)` — so weapon and med bolts
never collide with rocks. The closest-hit pattern matches the existing
enemy/hostage path.

### Gather minigame

`GatherMinigame` listens to `RockYieldSystem.onMineralExtracted` (it
wraps the existing handler so the inventory write still happens),
matches the `itemId` against its quotas, and increments `minedKg` until
the target is met. The mineral list is rolled from the asteroid's
`composition[]` weighted by `percentage`, deterministic given `seed +
objectiveIndex`. Per-mineral target = `ceil(resourceAmount / count)`.

A glowing `DepositCrateModel` (extracted from `CollectMinigame`) is
spawned at the objective waypoint. While quotas are unmet, the prompt
nudges the player to keep mining. Once every quota is met the prompt
flips to `[E] DEPOSIT MINERALS`, and the next interact press marks the
objective complete.

### Tracker UI

`MiniGameStep` gained an optional `progress: { current, target, unit }`
field. `MissionTracker.vue` renders it to the right of the step label
(`Mine Olivine     23/75 kg`). Other minigames keep working unchanged
because the field is optional.

## Files

- New: `src/lib/mining/rockYieldSystem.ts`,
  `src/lib/mining/constants.ts`,
  `src/lib/asteroids/mineralItemMap.ts`,
  `src/lib/minigame/GatherMinigame.ts`,
  `src/three/DepositCrateModel.ts`,
  plus three `__tests__` specs.
- Modified: `src/data/inventory/items.json` (12 new mineral items),
  `src/three/controllers/SurfaceRockController.ts` (`hideRock` +
  spawn-index location map),
  `src/lib/fps/projectileSystem.ts` (`addRock`, `removeRock`,
  `onRockHit`, drill-only swept collision),
  `src/lib/minigame/MiniGame.ts` (`MiniGameStepProgress`),
  `src/lib/minigame/CollectMinigame.ts` (uses `DepositCrateModel`),
  `src/components/MissionTracker.vue` (per-step progress chip),
  `src/views/LevelViewController.ts` (rock yield wiring + gather minigame
  branch).

## Tuning constants

- `MINERAL_KG_PER_DIAMETER_UNIT = 8`
- `MIN_ROCK_YIELD_KG = 4`
- `MAX_ROCK_YIELD_KG = 60`
- `BOLT_DAMAGE_KG_PER_HIT = 6`
- Difficulty → mineral count: `{1..4}=1, {5..9}=2, {10}=3`

## Risks

- The mineral-id lookup depends on stable composition names matching
  the inventory item IDs (kebab-case derived from the name).
  `mineralItemMap.spec.ts` walks every asteroid and asserts every name
  resolves to a registered item, which guards against silent drift.
- `RockYieldSystem` only supports a single `onMineralExtracted`
  listener; the gather minigame wraps the host's handler. If another
  consumer needs the stream later, the system should be promoted to a
  multicast pattern.
