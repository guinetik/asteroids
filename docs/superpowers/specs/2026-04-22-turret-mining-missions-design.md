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
- Extend the loot system to produce a kuiper-specific ore (`kuiper-ice`) for the late-game USC missions, without touching level-scene mining.

## Non-Goals (this pass)

- Changes to the turret beam, aim, or session lifecycle. Turret spec (2026-04-20) stands unchanged.
- A new minigame at delivery. Delivery is a dock-time auto-complete.
- Map waypoints for mining missions. All mining missions are count-based — player mines anywhere that produces the right ore. (Decided during brainstorming.)
- New planet entries. Pluto already exists in `planetarium.json` (verified at L713) and has trade-goods, planet-demand, and access-requirements wiring.
- Market/shop changes. Ore is consumed on delivery; whether the player sells surplus ore at the shop is unchanged.
- New turret upgrades. `turretMiningYield` and `turretMiningEfficiency` from the turret spec cover throughput and fuel.

## User Flow

1. Player has purchased `turretMiningUnlock`. The "Mining" tab in Shuttle Control unlocks at any giver planet (Mars, Jupiter, Uranus, Neptune, Pluto).
2. Player docks at **Mars** → opens Shuttle Control → Mining tab → sees one offered mission (e.g. "Marines need 450 kg of silicate-ore — 1,400 CR"). Presses **Accept**.
3. Mission moves to `activeMiningMissions[]` with `minedKg = 0`. Restock timer starts (180 s) before Mars offers a new one.
4. Player undocks, presses **T** on the map, turret-mines the belt. Each beam tick that yields silicate-ore increments the Mars mission's `minedKg`. HUD shows progress (e.g. "Mars Mining 210 / 450 kg"). Ore also accumulates normally in inventory.
5. When `minedKg >= targetKg`, mission flips to `ready-to-deliver`. HUD toast: *"Mining contract complete — return to Mars"*.
6. Player flies back to Mars, docks. On dock, any `activeMiningMissions[i]` with `status === 'ready-to-deliver'` and matching `giverPlanet` auto-completes:
   - `targetKg` of the specified ore is removed from inventory.
   - Credits awarded (`reward × scienceStationMultiplier`).
   - Entry removed from `activeMiningMissions[]`.
   - `contractSystem.notifyMissionCompleted({ kind: 'mining', ... })` fires.
7. Player can hold multiple mining missions across different givers simultaneously. The shared `TurretYieldCoordinator.onMineralExtracted` tick increments every matching active mission — e.g. mining silicate-ore with a Mars (silicate) and an "any" Jupiter contract active counts toward both.

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
 * What ore a mining mission wants. `'any'` counts every ore toward progress (easy tier).
 * Specific IDs restrict progress tracking to that exact item.
 */
export type MiningOreCategory =
  | 'any'
  | 'silicate-ore'
  | 'iron-ore'
  | 'nickel-ore'
  | 'rare-metal'
  | 'kuiper-ice'

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

Silicate specialization (armor plating, structural material). Easy / medium-silicate / hard-rare-metal.

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
      "id": "mars_marines_silicate_plating",
      "name": "Armor Plating Contract",
      "description": "Silicate-ore for new armor lamination. Marines want it clean — no crosscontamination from other ores.",
      "difficulty": "medium",
      "oreCategory": "silicate-ore",
      "targetKg": 475,
      "reward": 1350
    },
    {
      "id": "mars_marines_rare_metal",
      "name": "Classified Procurement",
      "description": "Marines need rare-metal for projects they won't explain. Small quantity, generous payout.",
      "difficulty": "hard",
      "oreCategory": "rare-metal",
      "targetKg": 200,
      "reward": 2200
    }
  ]
}
```

### `jupiter.json` — Jovian Cloud City

Iron specialization (city infrastructure). Easy / medium-iron / hard-rare-metal.

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
      "id": "jupiter_cloud_city_iron",
      "name": "Platform Reinforcement",
      "description": "New residential sectors need iron-ore for support frames. Purity matters — Cloud City inspectors reject mixed loads.",
      "difficulty": "medium",
      "oreCategory": "iron-ore",
      "targetKg": 500,
      "reward": 1500
    },
    {
      "id": "jupiter_cloud_city_rare_metal",
      "name": "Executive Suites",
      "description": "Premium rare-metal fittings for the new orbital penthouse tier. Discreet delivery, excellent pay.",
      "difficulty": "hard",
      "oreCategory": "rare-metal",
      "targetKg": 225,
      "reward": 2500
    }
  ]
}
```

### `uranus.json` / `neptune.json` / `pluto.json` — United Space Consortium

Kuiper-ice only. One or two hard-tier missions per planet. Flavor differs per location; giver is the same organization.

```json
{
  "planetId": "uranus",
  "giverName": "United Space Consortium",
  "missions": [
    {
      "id": "usc_uranus_ice_research",
      "name": "Cryogenic Research Shipment",
      "description": "USC labs need primordial kuiper ice for deep-cold chemistry studies. Bring it fresh from the belt.",
      "difficulty": "hard",
      "oreCategory": "kuiper-ice",
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
      "description": "Neptune station's fusion reactor runs on kuiper-ice moderators. Quantity matters — run short, station goes dark.",
      "difficulty": "hard",
      "oreCategory": "kuiper-ice",
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
      "description": "USC wants deep kuiper ice from the furthest belt. Nobody goes out this far without the right gear. That's why the pay is what it is.",
      "difficulty": "hard",
      "oreCategory": "kuiper-ice",
      "targetKg": 500,
      "reward": 3200
    }
  ]
}
```

Quantities and rewards are the initial authoring — balance may adjust during implementation.

## Loot Table & Inventory Extension

### New inventory item — `kuiper-ice`

Added to `src/lib/inventory/catalog.ts`:

```ts
{
  id: 'kuiper-ice',
  label: 'Kuiper Ice',
  description: 'Ancient ice from trans-Neptunian rocks, chemically distinct from water ice — laced with precursor compounds.',
  icon: 'kuiper-ice.png',
  weightPerUnit: 1,
  maxStack: 100,
  basePrice: 45,
}
```

Initial `basePrice` of 45 CR/unit sits at the common-ore band so the shop remains a fallback sell channel; the mining mission payout is the premium path. Final value resolved at implementation time by matching existing ore prices (see research-needed item 6).

### Loot table entries — `src/data/asteroid-belt-loot.json`

Extend with three kuiper tiers:

```json
{
  "asteroid-belt-small":  [ /* existing */ ],
  "asteroid-belt-medium": [ /* existing */ ],
  "asteroid-belt-large":  [ /* existing */ ],
  "kuiper-belt-small":    [{ "itemId": "kuiper-ice", "weightKg": 1.0 }],
  "kuiper-belt-medium":   [{ "itemId": "kuiper-ice", "weightKg": 1.0 }],
  "kuiper-belt-large":    [{ "itemId": "kuiper-ice", "weightKg": 1.0 }]
}
```

Kuiper rocks drop 100% `kuiper-ice`. No mixed composition — single-mineral belt.

### Belt routing — research-needed

The turret-mode spec describes the turret raycasting a `beltControllers` plural. For kuiper missions to be playable, the map must:
1. Instance an `AsteroidBeltController` at kuiper orbital distance (outside Neptune's orbit).
2. Route that controller's loot-table lookup to the `kuiper-belt-*` keys.

**If kuiper belt is not yet instanced on the map**, USC pools ship as authored but the "Mining" tab's offered-slot filter hides kuiper-ice missions until the belt exists (same pattern planet-access-requirements uses for locked planets). Document this branch as a follow-up task — not a design blocker.

**If kuiper belt is already instanced**, the loot-table lookup needs a region tag on `AsteroidBeltController` so `TurretYieldCoordinator.registerRock` picks `kuiper-belt-*` vs `asteroid-belt-*`. Implementation confirms which branch is live.

## Progress Tracking

Extend `TurretYieldCoordinator` with a subscribe slot (if one doesn't already exist). On every whole-kg commit to inventory, fire `onMineralExtracted(itemId, kg)`. The new `miningMissionTracker` subscribes:

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
  if (category === 'any') return isAsteroidOre(itemId)  // excludes non-ore items
  return category === itemId
}
```

**Design choices:**
- Progress only counts ore mined **after** the mission was accepted. The tracker subscribes to live `onMineralExtracted` events, not inventory state. Mining 500 kg of iron before accepting does not auto-complete a later iron mission.
- `'any'` matches asteroid ores only — silicate/iron/nickel/rare-metal. It does **not** count kuiper-ice (kuiper-ice is hard-specific) or non-ore drops. `isAsteroidOre(itemId)` is a tiny helper over the known ore list.
- Multiple matching missions all receive the same `kg` increment each tick. Mining 10 kg of iron with two iron missions active credits 10 kg to both — this is intentional and matches how the player conceptually "fulfills two contracts from one run".
- Persistence is localStorage-backed (via `saveMissionBoard`). The turret's whole-kg buffering means this saves at human-scale rates, not per-frame.

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
| Easy | Mars (Marines) | any | 350 | 750 |
| Easy | Jupiter (Cloud City) | any | 380 | 820 |
| Medium | Mars (Marines) | silicate-ore | 475 | 1350 |
| Medium | Jupiter (Cloud City) | iron-ore | 500 | 1500 |
| Hard | Mars (Marines) | rare-metal | 200 | 2200 |
| Hard | Jupiter (Cloud City) | rare-metal | 225 | 2500 |
| Hard | Uranus (USC) | kuiper-ice | 425 | 2600 |
| Hard | Neptune (USC) | kuiper-ice | 475 | 2900 |
| Hard | Pluto (USC) | kuiper-ice | 500 | 3200 |

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

- `offerMiningMission(board: ShuttleMissionBoard, planetId: string): ShuttleMissionBoard` — when player docks, select one mission from the pool (simplest: random among not-currently-active). Filter out missions whose `oreCategory === 'kuiper-ice'` if kuiper belt isn't mineable yet.
- `takeMiningMission(board, template, planetId): ShuttleMissionBoard` — move from offered to active, start restock timer.
- `tickMiningRestock(board, dt): ShuttleMissionBoard` — when timer runs out, refill `offeredMiningMission` from the pool.
- `getReadyMiningMissions(board, planetId): ActiveTurretMiningMission[]` — for dock-time delivery.

Restock window: **180 s**, matching planetary.

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
| `src/lib/missions/missionStorage.ts` | +4 field round-trips | Persistence. |
| `src/lib/missions/shuttleMissionSession.ts` | +4 helpers | Offer/take/restock/getReady. |
| `src/lib/map/turret/TurretYieldCoordinator.ts` | +1 subscribe hook | If `onMineralExtracted` isn't already exposed to a subscriber slot, add one. |
| `src/lib/inventory/catalog.ts` | +1 item | `kuiper-ice`. |
| `src/data/asteroid-belt-loot.json` | +3 entries | `kuiper-belt-small/medium/large`. |
| `src/components/shuttle-control/ShuttleControlProgramMissions.vue` + controller | Mining tab | UI layer. |
| Dock handler (TBD in code — find existing deliverMission call site) | Call `deliverMiningMissionsAtDock(planetId)` | Delivery trigger. |

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
  - Kuiper filter: when kuiper belt not mineable, `offerMiningMission` skips `oreCategory === 'kuiper-ice'` templates for USC planets.
  - Offered selection does not repeat a currently-active mission from the same planet.

- **`turretMiningSession.spec.ts`**
  - `takeMiningMission` moves offered → active, starts restock timer, clears offered.
  - `recordMiningProgress` increments `minedKg` only for matching ore; ignores mismatched ore; `'any'` matches all asteroid ores but NOT kuiper-ice.
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

## Open Questions / Research-Needed

Flagged during design for implementation to resolve:

1. **Kuiper belt on map.** Verify whether an `AsteroidBeltController` is instanced at kuiper orbital distance (beyond Neptune). If not, USC missions ship but are filtered-out of the offered slot until kuiper is mineable. Follow-up task: instance kuiper belt + region tag.
2. **`TurretYieldCoordinator` subscribe hook.** If the coordinator doesn't already expose a consumer callback beyond inventory commit, add a lightweight `addMineralListener(fn)` so `miningMissionTracker` can register without tight coupling.
3. **`shuttleCargoBay` values confirmation.** Spec assumes base 500 / L1 675 / L2 825 / L3 1000 kg based on multipliers `[1.0, 1.35, 1.65, 2.0]` applied to `DEFAULT_MAX_WEIGHT_KG = 500`. Implementation reads the current values; tuning retargets if numbers drifted.
4. **`removeOreByCategory` helper.** Inventory's current API removes by `itemId` + quantity. The mining delivery needs a helper that removes N kg of a specific ore. Straightforward additive change to `src/lib/inventory/inventory.ts`.
5. **Dock-time delivery call site.** Planetary missions deliver on dock — need to locate that call site and add `deliverMiningMissionsAtDock(planetId)` alongside (or under the same dock handler).
6. **`kuiper-ice` basePrice.** Tune during implementation by matching the common-ore band in the shop. Mission is the premium path; shop fallback should exist but pay less per kg than the contract.

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
   - With two active missions (Mars silicate + Jupiter iron), mining silicate does NOT credit Jupiter; mining iron does NOT credit Mars.
   - Dock Uranus without `shuttleFreezeResistance` 3: USC tab visible, but offered mining slot hidden or shows locked.

## Future Work (documented, not implemented)

- **Variant pools per restock cycle** so the same player doesn't see the identical offered slot every time at a giver.
- **Combined mining + trade route missions** where the giver wants ore + a trade good delivered together.
- **Rival miner events** on the belt — an NPC ship racing the player for the same contract deadline.
- **Dynamic quantities** scaled to player upgrade average (like asteroid missions), rather than authored per-template. Current pass authors a single value per template; a future pass can introduce `NumberRange` scaling.
