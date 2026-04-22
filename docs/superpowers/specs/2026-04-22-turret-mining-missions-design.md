# Turret Mining Missions — Design Spec

**Date:** 2026-04-22
**Author:** guinetik
**Status:** Draft
**Related:**
- `docs/asteroid-lander-gdd.md` (game design doc)
- `2026-04-20-turret-mode-design.md` (turret mechanic this depends on)
- `2026-04-18-visit-relay-mission-design.md` (EVA mission pattern reference)
- `2026-04-18-gather-mission-design.md` (planetary mining flow reference)
- `2026-04-06-asteroid-missions-design.md` (asteroid mission difficulty scaling reference)

## Problem

The turret (2026-04-20 spec) lets the player mine asteroid-belt rocks directly from the map. Today, that mining is purely extractive — the player pulls ore into inventory, takes it to a shop, and sells it. There is no contract-driven reason to mine in a particular place, for a particular ore, at a particular volume. The turret spec's own "Future Work" section names the missing piece: *"Ship mining missions — mission type that specifies a minimum yield from the belt, completable via turret mining."* This spec is that piece.

Missions also create economic pressure the current turret loop doesn't. Mining is only worthwhile in volume, but the base 500 kg cargo bay caps the player's run. A mining-mission ask tuned above the base cap turns the `shuttleCargoBay` upgrade from optional into necessary. This is the intentional progression lever.

## Goals

- Add a new mission type — **Turret Mining Missions** — offered at specific giver planets, requiring the turret, deliverable by returning to the giver with the specified ore.
- Reuse existing systems: `ShuttleMissionBoard`, `TurretYieldCoordinator`, inventory pipeline, restock timers, Science Station multiplier, contract notify.
- Gate the mission type behind `turretMiningUnlock >= 1` so players without the turret never see it.
- Put visible quantity pressure on the `shuttleCargoBay` upgrade — medium and hard missions should not fit a base-cap inventory alongside normal trade goods.
- Reuse the existing mineral catalog: Mars/Jupiter contracts ask for specific main-belt ores already produced by the turret (`olivine`, `magnetite`, `iron-nickel-alloy`), and USC contracts ask for `water-ice` from the already-mineable kuiper belt. No new items, no loot-table changes.

## Non-Goals (this pass)

- Changes to the turret beam, aim, or session lifecycle. Turret spec (2026-04-20) stands unchanged.
- A new minigame at delivery. Delivery is a dock-time auto-complete.
- Map waypoints for mining missions. All mining missions are count-based — player mines anywhere that produces the right ore. (Decided during brainstorming.)
- New planet entries. Pluto already exists in `planetarium.json` (verified at L713) and has trade-goods, planet-demand, and access-requirements wiring.
- New inventory items or loot tables. `olivine`, `magnetite`, `iron-nickel-alloy`, `water-ice` all ship today in `src/data/inventory/items.json`. The kuiper belt is already instanced and mineable with its own loot composition in `asteroid-belt-loot.json`.
- Market/shop changes. Ore is consumed on delivery; whether the player sells surplus ore at the shop is unchanged.
- New turret upgrades. `turretMiningYield` and `turretMiningEfficiency` from the turret spec cover throughput and fuel.

## User Flow

1. Player has purchased `turretMiningUnlock`. The "Mining" tab in Shuttle Control unlocks at any giver planet (Mars, Jupiter, Uranus, Neptune, Pluto).
2. Player docks at **Mars** → opens Shuttle Control → Mining tab → sees one offered mission (e.g. "Marines need 475 kg of olivine — 1,350 CR"). Presses **Accept**.
3. Mission moves to `activeMiningMissions[]` with `minedKg = 0`. Restock timer starts (120–240 s, matching existing mission kinds via `randomRestockDuration()`) before Mars offers a new one.
4. Player undocks, presses **T** on the map, turret-mines the belt. Each whole-kg commit that yields olivine increments the Mars mission's `minedKg`. HUD shows progress (e.g. "Mars Mining 210 / 475 kg"). Ore also accumulates normally in inventory.
5. When `minedKg >= targetKg`, mission flips to `ready-to-deliver`. HUD toast: *"Mining contract complete — return to Mars"*.
6. Player flies back to Mars, docks. On dock, any `activeMiningMissions[i]` with `status === 'ready-to-deliver'` and matching `giverPlanet` auto-completes:
   - `targetKg` of the specified ore is removed from inventory.
   - Credits awarded (`reward × scienceStationMultiplier`).
   - Entry removed from `activeMiningMissions[]`.
   - `contractSystem.notifyMissionCompleted({ kind: 'mining', ... })` fires.
7. Player can hold multiple mining missions across different givers simultaneously. The shared `onResourcePickup` hook in `MapViewController` forwards each committed kg to every matching active mission — e.g. mining olivine with a Mars (olivine) and an "any-main-belt" Jupiter contract active credits both.

## Architecture

New missions live alongside planetary, EVA, and asteroid in `ShuttleMissionBoard`. Mirrors the EVA-slot pattern almost exactly — one offered per dock, multiple actives across givers, per-dock restock.

```
ShuttleMissionBoard (extended)
  ├─ existing planetary fields      (unchanged)
  ├─ existing EVA fields            (unchanged)
  ├─ existing asteroid fields       (unchanged)
  └─ NEW mining fields
      ├─ offeredMiningMission: TurretMiningMissionTemplate | null
      ├─ offeringMiningPlanet: string | null
      ├─ miningRestockTimer: RestockTimer | null
      └─ activeMiningMissions: ActiveTurretMiningMission[]
```

```
Turret session tick
  └─ TurretYieldCoordinator.onMineralExtracted(itemId, kg)
      ├─ (existing) inventory commit on whole-kg boundaries
      └─ (NEW) miningMissionTracker.record(itemId, kg)
          └─ for each activeMiningMissions[i]:
              if matches(itemId, template.oreCategory):
                  minedKg += kg
                  if minedKg >= targetKg: status = 'ready-to-deliver'
              persist board
```

```
Dock at giver planet
  └─ for each activeMiningMissions[i] where giverPlanet === currentPlanet:
      if status === 'ready-to-deliver':
          deliverMiningMission(mission, inventory, profile)
            ├─ removeItem(inventory, template.oreCategory, template.targetKg)
            ├─ addCredits(profile, template.reward × scienceMult)
            ├─ activeMiningMissions.splice(i, 1)
            └─ contractSystem.notifyMissionCompleted({ kind: 'mining', ... })
```

## Data Model

New types in `src/lib/missions/types.ts`:

```ts
/** Difficulty tier of a turret mining mission. Drives ore specificity and reward band. */
export type MiningMissionDifficulty = 'easy' | 'medium' | 'hard'

/**
 * What ore a mining mission wants. `'any'` counts every asteroid-belt ore toward progress
 * (easy tier). Specific IDs restrict progress tracking to that exact item and must match
 * real catalog entries from `src/data/inventory/items.json`.
 */
export type MiningOreCategory =
  | 'any'
  | 'olivine'
  | 'magnetite'
  | 'iron-nickel-alloy'
  | 'water-ice'

/** A turret mining mission template from JSON — one entry in a giver planet's pool. */
export interface TurretMiningMissionTemplate {
  /** Unique key, e.g. "mars_marines_silicate_medium". */
  id: string
  /** Display name shown on the mission board. */
  name: string
  /** Flavor text / briefing from the giver. */
  description: string
  /** Difficulty tier — drives authoring of ore category and reward. */
  difficulty: MiningMissionDifficulty
  /** Which ore counts toward progress. */
  oreCategory: MiningOreCategory
  /** Kilograms required to mark the mission ready-to-deliver. */
  targetKg: number
  /** Credits awarded on delivery (before Science Station multiplier). */
  reward: number
}

/** A giver planet's mining mission pool loaded from JSON. */
export interface TurretMiningMissionPool {
  /** Planet id that offers these missions. */
  planetId: string
  /** Display name of the giver organization (e.g. "Martian Marines Corps"). */
  giverName: string
  /** Missions in this planet's mining pool. */
  missions: TurretMiningMissionTemplate[]
}

/** Status of an active mining mission. */
export type TurretMiningMissionStatus = 'active' | 'ready-to-deliver'

/** A mining mission the player has accepted. */
export interface ActiveTurretMiningMission {
  /** The original template. */
  template: TurretMiningMissionTemplate
  /** Planet where the mission was accepted (and where delivery must occur). */
  giverPlanet: string
  /** Kilograms mined toward this mission since acceptance. */
  minedKg: number
  /** Current mission status. */
  status: TurretMiningMissionStatus
}
```

`ShuttleMissionBoard` in the same file gains four fields:

```ts
/** Currently offered mining mission at the docked planet (null if restocking or not docked). */
offeredMiningMission: TurretMiningMissionTemplate | null
/** Which planet is offering the mining mission (null if not docked). */
offeringMiningPlanet: string | null
/** Restock timer for mining missions — counts down after one is taken. */
miningRestockTimer: RestockTimer | null
/** All active mining missions the player has accepted. */
activeMiningMissions: ActiveTurretMiningMission[]
```

## Giver Pools (Data-Driven)

Five pool JSON files under `src/data/shuttle-missions/mining/`:

### `mars.json` — Martian Marines Corps

Olivine specialization (Olivine is described in items.json as "Valuable for industrial silicate production" — fits the Marines' armor-plating/structural usage lore). Easy / medium-olivine / hard-iron-nickel-alloy.

```json
{
  "planetId": "mars",
  "giverName": "Martian Marines Corps",
  "missions": [
    {
      "id": "mars_marines_bulk_supply",
      "name": "Forward Base Supply",
      "description": "Marines need bulk asteroid ore for temporary forward bases. Any rock will do — just fill the hold.",
      "difficulty": "easy",
      "oreCategory": "any",
      "targetKg": 350,
      "reward": 750
    },
    {
      "id": "mars_marines_olivine_plating",
      "name": "Armor Plating Contract",
      "description": "Raw olivine for a new armor lamination run. Marines want it clean — no cross-contamination from other ores.",
      "difficulty": "medium",
      "oreCategory": "olivine",
      "targetKg": 475,
      "reward": 1350
    },
    {
      "id": "mars_marines_iron_nickel",
      "name": "Classified Procurement",
      "description": "Marines need iron-nickel alloy for projects they won't explain. Small quantity, generous payout.",
      "difficulty": "hard",
      "oreCategory": "iron-nickel-alloy",
      "targetKg": 200,
      "reward": 2200
    }
  ]
}
```

### `jupiter.json` — Jovian Cloud City

Magnetite specialization (items.json: "Used in electronics and radiation shielding" — fits Cloud City's orbital-platform infrastructure lore). Easy / medium-magnetite / hard-iron-nickel-alloy.

```json
{
  "planetId": "jupiter",
  "giverName": "Jovian Cloud City",
  "missions": [
    {
      "id": "jupiter_cloud_city_any_ore",
      "name": "Construction Supplies",
      "description": "Cloud City is always expanding. They'll take whatever ore you can bring.",
      "difficulty": "easy",
      "oreCategory": "any",
      "targetKg": 380,
      "reward": 820
    },
    {
      "id": "jupiter_cloud_city_magnetite",
      "name": "Shielded Platform Reinforcement",
      "description": "New residential sectors need magnetite for radiation-shielded support frames. Purity matters — Cloud City inspectors reject mixed loads.",
      "difficulty": "medium",
      "oreCategory": "magnetite",
      "targetKg": 500,
      "reward": 1500
    },
    {
      "id": "jupiter_cloud_city_iron_nickel",
      "name": "Executive Suites",
      "description": "Premium iron-nickel fittings for the new orbital penthouse tier. Discreet delivery, excellent pay.",
      "difficulty": "hard",
      "oreCategory": "iron-nickel-alloy",
      "targetKg": 225,
      "reward": 2500
    }
  ]
}
```

### `uranus.json` / `neptune.json` / `pluto.json` — United Space Consortium

Kuiper water-ice only. One hard-tier mission per planet. Flavor differs per location; giver is the same organization.

```json
{
  "planetId": "uranus",
  "giverName": "United Space Consortium",
  "missions": [
    {
      "id": "usc_uranus_ice_research",
      "name": "Cryogenic Research Shipment",
      "description": "USC labs need primordial water-ice for deep-cold chemistry studies. Bring it fresh from the kuiper belt.",
      "difficulty": "hard",
      "oreCategory": "water-ice",
      "targetKg": 425,
      "reward": 2600
    }
  ]
}
```

```json
{
  "planetId": "neptune",
  "giverName": "United Space Consortium",
  "missions": [
    {
      "id": "usc_neptune_ice_reactor",
      "name": "Reactor Coolant Resupply",
      "description": "Neptune station's fusion reactor runs on water-ice moderators pulled from kuiper rocks. Quantity matters — run short, station goes dark.",
      "difficulty": "hard",
      "oreCategory": "water-ice",
      "targetKg": 475,
      "reward": 2900
    }
  ]
}
```

```json
{
  "planetId": "pluto",
  "giverName": "United Space Consortium",
  "missions": [
    {
      "id": "usc_pluto_deep_ice_survey",
      "name": "Trans-Neptunian Ice Sampling",
      "description": "USC wants deep water-ice from the furthest reaches of the kuiper belt. Nobody goes out this far without the right gear. That's why the pay is what it is.",
      "difficulty": "hard",
      "oreCategory": "water-ice",
      "targetKg": 500,
      "reward": 3200
    }
  ]
}
```

Quantities and rewards are the initial authoring — balance may adjust during implementation.

## Ore Catalog & Belt Routing — Already In Place

No new items or loot tables. Research during design confirmed:

- **`src/data/inventory/items.json`** already contains `olivine`, `magnetite`, `pyroxene`, `iron-nickel-alloy`, `water-ice`, `carbon-dioxide-ice`, `sodium-chloride`, and others (items.json L2–L17).
- **`src/data/asteroid-belt-loot.json`** already defines both `asteroid-belt-small/medium/large` and `kuiper-belt-small/medium/large` compositions.
- **`src/lib/map/turret/turretTiers.ts`** already exposes `TurretBeltId = 'main-belt' | 'kuiper-belt'` and routes loot per belt.
- **Kuiper belt is already instanced** on the map alongside the main belt.

All four mining-target ores — `olivine`, `magnetite`, `iron-nickel-alloy`, `water-ice` — are already produced by the turret during normal play. The mission system simply reads what the turret already yields; no ore plumbing needed.

## Progress Tracking

The existing turret integration in `MapViewController.ts` already has an `onResourcePickup(itemId, quantity, label)` callback that fires on every successful inventory commit (see `TurretSessionController.commitOneUnit` → `deps.onResourcePickup`). The mining tracker hooks into that same callback with zero changes to the turret internals:

```ts
function recordMiningProgress(itemId: string, kg: number): void {
  const board = loadMissionBoard()
  if (!board || board.activeMiningMissions.length === 0) return

  let changed = false
  const nextActives = board.activeMiningMissions.map((active) => {
    if (active.status === 'ready-to-deliver') return active
    if (!matchesOreCategory(active.template.oreCategory, itemId)) return active
    const minedKg = active.minedKg + kg
    const status = minedKg >= active.template.targetKg ? 'ready-to-deliver' : 'active'
    if (status === 'ready-to-deliver') {
      onMissionReadyForDelivery?.(active)  // HUD toast hook
    }
    changed = true
    return { ...active, minedKg, status }
  })

  if (changed) saveMissionBoard({ ...board, activeMiningMissions: nextActives })
}

function matchesOreCategory(category: MiningOreCategory, itemId: string): boolean {
  if (category === 'any') return isMainBeltOre(itemId)  // excludes kuiper ices
  return category === itemId
}
```

**Design choices:**
- Progress only counts ore mined **after** the mission was accepted. The tracker subscribes to live `onResourcePickup` events, not inventory state. Mining 500 kg of magnetite before accepting does not auto-complete a later magnetite mission.
- `'any'` matches main-belt ores only — `olivine`, `magnetite`, `pyroxene`, `iron-nickel-alloy`, and any other items emitted by `asteroid-belt-*` loot tiers. It does NOT count kuiper ices (`water-ice`, etc.) — kuiper contracts are hard-tier and tracked via their specific `oreCategory`. `isMainBeltOre(itemId)` is a tiny helper over the known main-belt ore list, authored inside `turretMiningSession.ts`.
- Multiple matching missions all receive the same `kg` increment each tick. Mining 10 kg of magnetite with two magnetite missions active credits 10 kg to both — intentional; matches the "one run fulfills multiple contracts" fantasy.
- Persistence is localStorage-backed (via `saveMissionBoard`). The turret's whole-kg commit buffering means this saves at human-scale rates, not per-frame.

## Delivery

Dock handler in the Shuttle Control path (same call site as planetary delivery today):

```ts
function deliverMiningMissionsAtDock(planetId: string): DeliveryReport {
  const board = loadMissionBoard()
  if (!board) return { delivered: [] }
  const inventory = loadInventory() ?? createInventory()
  const profile = loadProfile()
  if (!profile) return { delivered: [] }

  const deliverable = board.activeMiningMissions.filter(
    (m) => m.giverPlanet === planetId && m.status === 'ready-to-deliver',
  )
  if (deliverable.length === 0) return { delivered: [] }

  const scienceMult = getScienceStationMultiplier(profile.upgradeLevels)
  let workingInventory = inventory
  let workingProfile = profile
  const delivered: ActiveTurretMiningMission[] = []

  for (const mission of deliverable) {
    const { oreCategory, targetKg, reward } = mission.template
    const removal = removeOreByCategory(workingInventory, oreCategory, targetKg)
    if (!removal.ok) continue  // defensive: player jettisoned ore before docking
    workingInventory = removal.inventory
    workingProfile = addCredits(workingProfile, Math.round(reward * scienceMult))
    delivered.push(mission)
    contractSystem.notifyMissionCompleted({
      kind: 'mining',
      giverPlanetId: mission.giverPlanet,
      giverId: null,
      targetPlanetId: null,
    })
  }

  saveInventory(workingInventory)
  saveProfile(workingProfile)
  saveMissionBoard({
    ...board,
    activeMiningMissions: board.activeMiningMissions.filter((m) => !delivered.includes(m)),
  })
  return { delivered }
}
```

**Edge case — inventory shortfall at delivery:** if the player jettisoned or sold ore between `ready-to-deliver` and docking, `removeOreByCategory` returns `ok: false`. The mission stays `ready-to-deliver` and shows a HUD toast *"Not enough [ore] to deliver — mine more"*. The contract does not auto-fail. The player can mine more and try again.

## Tuning Table

| Difficulty | Giver | Ore | Target kg | Reward (CR) |
|---|---|---|---|---|
| Easy | Mars (Marines) | any main-belt | 350 | 750 |
| Easy | Jupiter (Cloud City) | any main-belt | 380 | 820 |
| Medium | Mars (Marines) | olivine | 475 | 1350 |
| Medium | Jupiter (Cloud City) | magnetite | 500 | 1500 |
| Hard | Mars (Marines) | iron-nickel-alloy | 200 | 2200 |
| Hard | Jupiter (Cloud City) | iron-nickel-alloy | 225 | 2500 |
| Hard | Uranus (USC) | water-ice | 425 | 2600 |
| Hard | Neptune (USC) | water-ice | 475 | 2900 |
| Hard | Pluto (USC) | water-ice | 500 | 3200 |

**Cargo bay pressure:**
- Base 500 kg: holds easy missions if inventory empty; medium/hard-kuiper don't fit alongside anything else.
- L1 675 kg: medium (500 kg) fits with a small trade buffer; hard-kuiper Pluto at 500 kg fits if single-mission.
- L2 825 kg: comfortable for medium + ongoing trade goods; or double-kuiper if juggling two USC missions.
- L3 1000 kg: headroom for concurrent contracts + trade goods.

The medium/hard band is intentionally the pressure point for the `shuttleCargoBay` upgrade. Player cannot chain these contracts without committing to the upgrade.

**Reward position relative to other missions:**

- EVA: 300–350 CR (short trip, no cargo).
- Planetary: 3125–6875 CR (cross-system travel + minigame).
- Asteroid: 400–6500 CR (hazard, full level scene).
- **Mining: 750–3200 CR** — between EVA's convenience and asteroid's expedition. More than EVA (longer, cargo-committed) but less than a full asteroid mission (simpler, no level scene).

Science Station multiplier (up to 1.75×) applies on delivery, same as planetary/asteroid.

## Board Integration

### `shuttleMissionSession.ts` additions

Mirror the existing `offerEvaMission` / `takeEvaMission` / etc. helpers:

- `offerMiningMission(board: ShuttleMissionBoard, planetId: string): ShuttleMissionBoard` — when player docks, select one mission from the pool (random among not-currently-active).
- `takeMiningMission(board, template, planetId): ShuttleMissionBoard` — move from offered to active, start restock timer.
- `tickMiningRestock(board, dt): ShuttleMissionBoard` — when timer runs out, clear the timer so the next dock can refill `offeredMiningMission`.
- `getReadyMiningMissions(board, planetId): ActiveTurretMiningMission[]` — for dock-time delivery.

Restock window: reuse the existing `randomRestockDuration()` (120–240 s) from `shuttleMissionSession.ts` for consistency with planetary and EVA cadence.

### `missionStorage.ts` additions

Round-trip the four new fields through `loadMissionBoard` / `saveMissionBoard`. No schema version bump if we tolerate missing fields (`activeMiningMissions: parsed.activeMiningMissions ?? []`); older saves just have no mining data. That's the pattern the existing EVA fields use.

### `ShuttleControlProgramMissions.vue` + controller

New **Mining** tab, visible only when `turretMiningUnlock >= 1`. Tab contents:

- If `offeredMiningMission` exists for current planet: show name, description, ore/qty, reward. **Accept** button.
- If restock timer running: show countdown.
- Active mining missions at other planets (not this one): show a compact list with progress bars.
- Active mining missions at this planet that are `ready-to-deliver`: show as deliverable (auto-completes on dock-enter; shown here as confirmation).

No new components — extend existing tab infrastructure.

### HUD — turret mode

While turret session is active, if any `activeMiningMissions[i]` exists, show a compact progress strip in the turret HUD overlay: `[Mars — silicate 210/475 kg]`. One line per active mission. No chrome beyond that.

## Module Boundaries

### New files (lib)

- `src/lib/missions/turretMiningPools.ts` — pool loaders (`loadMiningPool(planetId)`), pool-to-offered selection, kuiper filter.
- `src/lib/missions/turretMiningSession.ts` — accept / tick progress / ready-for-delivery transitions; exports `recordMiningProgress(itemId, kg)` and `offer/take/restock` helpers wired into `shuttleMissionSession`.
- `src/lib/missions/turretMiningRewards.ts` — `deliverMiningMissionsAtDock(planetId)` — inventory consume + credits + contract notify.

### Edits to existing files

| File | Delta | Nature |
|---|---|---|
| `src/lib/missions/types.ts` | +4 types + 4 board fields | Data model. |
| `src/lib/missions/missionStorage.ts` | +4 field round-trips + 1 new timer revival | Persistence. |
| `src/lib/missions/shuttleMissionSession.ts` | +1 field in `createMissionBoard` initializer | Board default shape. |
| `src/lib/contracts/contractTypes.ts` | `ContractMissionType` union gains `'mining'` | Contract step matching. |
| `src/views/MapViewController.ts` | ~5 lines near the turret `onResourcePickup` wiring | Fire `recordMiningProgress(itemId, quantity)` when the turret commits ore. |
| `src/views/MapView.vue` (dock handler) | ~6 lines near the existing planetary `deliverMission` call | Call `deliverMiningMissionsAtDock(...)` on dock-enter at a giver planet. |
| `src/components/shuttle-control/ShuttleControlProgramMissions.vue` + any host layer | Mining tab | UI layer. |

### New data files

- `src/data/shuttle-missions/mining/mars.json`
- `src/data/shuttle-missions/mining/jupiter.json`
- `src/data/shuttle-missions/mining/uranus.json`
- `src/data/shuttle-missions/mining/neptune.json`
- `src/data/shuttle-missions/mining/pluto.json`

## Testing Plan

New files under `src/lib/missions/__tests__/`:

- **`turretMiningPools.spec.ts`**
  - Pool loader returns missions for the requested planet.
  - Offered selection does not repeat a currently-active mission from the same planet.

- **`turretMiningSession.spec.ts`**
  - `takeMiningMission` moves offered → active, starts restock timer, clears offered.
  - `recordMiningProgress` increments `minedKg` only for matching ore; ignores mismatched ore; `'any'` matches main-belt ores (`olivine`, `magnetite`, `pyroxene`, `iron-nickel-alloy`) but NOT kuiper ices (`water-ice`, `carbon-dioxide-ice`, `sodium-chloride`).
  - Transition to `ready-to-deliver` when `minedKg >= targetKg`.
  - Multiple matching actives all receive the same increment.
  - `tickMiningRestock` refills offered slot when timer elapses.

- **`turretMiningRewards.spec.ts`**
  - `deliverMiningMissionsAtDock` consumes `targetKg` from inventory, awards `reward × scienceMult`, removes active entry, fires contract notify.
  - Shortfall: if inventory has less ore than `targetKg`, mission stays `ready-to-deliver`, no credits awarded, no inventory mutation.
  - Multi-delivery: two ready missions at same planet both settle in one dock, each consuming its own ore.

Extensions:
- `missionStorage.spec.ts` — round-trip the four new fields, tolerate older saves missing them.

Not tested (per CLAUDE.md — framework/rendering layers):
- Vue Mining tab markup.
- Dock call-site wiring (covered by smoke test).

## Resolved Design Questions

All design-time research items are resolved:

1. **Kuiper belt on map.** Confirmed instanced. `TurretBeltId = 'main-belt' | 'kuiper-belt'` and kuiper tier tables already exist in `turretTiers.ts`; `asteroid-belt-loot.json` already defines kuiper tiers.
2. **Turret progress hook.** Reuse the existing `deps.onResourcePickup(itemId, quantity, label)` callback wired from `MapViewController` to `TurretSessionController`. No new subscribe hook needed.
3. **`shuttleCargoBay` values.** Confirmed at 500 / 675 / 825 / 1000 kg via `DEFAULT_MAX_WEIGHT_KG = 500` in `src/lib/inventory/inventory.ts` × upgrade multipliers `[1.0, 1.35, 1.65, 2.0]`.
4. **Inventory delivery helper.** Existing `removeItem(inventory, itemId, quantity)` covers specific-ore delivery. For `'any'`-tier missions, the delivery helper walks main-belt ore stacks and removes up to `targetKg` across them; this is authored inside `turretMiningRewards.ts`, not in `inventory.ts`.
5. **Dock-time delivery call site.** Lives in `src/views/MapView.vue` near the existing planetary `deliverMission` (grep `contractSystem.notifyMissionCompleted({ kind: 'shuttle' ... })` — around line 715).
6. **Ore catalog.** All four target ores are already in `src/data/inventory/items.json`. No catalog edits.

## Scoped-Out / Non-Blocking

1. **Mission pool variety per restock.** Each giver currently offers one mission selected randomly. A future pass could keep history so the same mission doesn't repeat.
2. **Dynamic quantity scaling with upgrade average.** Current pass uses authored-per-template values; a `NumberRange`-driven scaler is future work.

## Acceptance Criteria

Per CLAUDE.md merge gate:

1. `bun run type-check` — no TypeScript errors.
2. `bun run lint` — oxlint 0 errors, ESLint 0 errors & 0 warnings. All new exports carry TSDoc with `@author guinetik`, `@date 2026-04-22`, `@spec docs/superpowers/specs/2026-04-22-turret-mining-missions-design.md`.
3. `bun run test:unit` — all new specs green, existing specs unchanged.
4. In-browser smoke test:
   - Purchase `turretMiningUnlock` → dock Mars → Mining tab appears with one offered mission.
   - Accept easy "Forward Base Supply" → restock timer starts → offered slot clears.
   - Undock → enter turret → mine belt → HUD progress updates → mission flips `ready-to-deliver`.
   - Return to Mars → dock → mission auto-delivers → credits awarded → ore removed from inventory.
   - Restock timer elapses → Mars offers a new mission.
   - With two active missions (Mars olivine + Jupiter magnetite), mining olivine does NOT credit Jupiter; mining magnetite does NOT credit Mars.
   - Dock Uranus without `shuttleFreezeResistance` 3: per existing access-requirements gate, Uranus is already unreachable — no extra check needed in the mining tab.

## Future Work (documented, not implemented)

- **Variant pools per restock cycle** so the same player doesn't see the identical offered slot every time at a giver.
- **Combined mining + trade route missions** where the giver wants ore + a trade good delivered together.
- **Rival miner events** on the belt — an NPC ship racing the player for the same contract deadline.
- **Dynamic quantities** scaled to player upgrade average (like asteroid missions), rather than authored per-template. Current pass authors a single value per template; a future pass can introduce `NumberRange` scaling.
