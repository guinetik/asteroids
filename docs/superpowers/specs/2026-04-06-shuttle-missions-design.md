# Shuttle Missions System — Design Spec

**Date:** 2026-04-06
**Author:** guinetik
**Status:** Draft

## Overview

Shuttle missions are planet-to-planet orbital tasks. Each planet offers missions that send the player to another planet to perform an orbital activity (minigame), gather materials, and return to deliver them for credit rewards. Missions are the supply chain — raw material gathering that feeds the trade goods economy.

The shuttle cannot land on planets. All mission activities happen from orbit: deploying drones, collecting cargo shipments, running probes, performing maintenance. Each target planet has a fixed activity type (e.g., Venus = gas collection, Mars = chemistry). The minigame is tied to the target planet, not the mission.

## Scope

**In scope:**
- Shuttle mission data model and types
- Per-planet mission pool JSON data files
- Mission session management (offer, accept, complete, deliver)
- Restock timer (same pattern as shop)
- `I Mission` button in OrbitPrompt (when at target planet with active mission)
- `MissionMiniGameOverlay.vue` placeholder (just a "Complete Mission" button)
- Mission board UI in `ShuttleControlProgramMissions.vue` (browse, accept, deliver)
- Inventory check before starting minigame (cargo must fit)
- New item category `'mission-material'` for gathered items

**Out of scope:**
- Asteroid missions (LevelView)
- Actual minigame implementations (placeholder only)
- Mission difficulty scaling
- Map overlay mission markers

## Data Model

### Planet Orbital Config

New JSON file `src/data/missions/planet-orbital-config.json` — defines what each planet produces when visited for a mission:

```json
[
  {
    "planetId": "venus",
    "gatherItem": "venusian-gas",
    "minigameType": "gas-collection"
  },
  {
    "planetId": "earth",
    "gatherItem": "cargo-container",
    "minigameType": "logistics"
  },
  {
    "planetId": "mars",
    "gatherItem": "methane-sample",
    "minigameType": "chemistry"
  },
  {
    "planetId": "mercury",
    "gatherItem": "probe-telemetry",
    "minigameType": "probe-deploy"
  },
  {
    "planetId": "jupiter",
    "gatherItem": "jovian-hydrogen",
    "minigameType": "gas-collection"
  },
  {
    "planetId": "saturn",
    "gatherItem": "ring-ice",
    "minigameType": "ice-harvest"
  },
  {
    "planetId": "neptune",
    "gatherItem": "solar-alignment-data",
    "minigameType": "maintenance"
  },
  {
    "planetId": "uranus",
    "gatherItem": "magnetic-field-data",
    "minigameType": "probe-deploy"
  }
]
```

The `minigameType` is stored but ignored until each minigame is built. All planets use the placeholder "Complete" button for now.

### Mission Items

New entries in `src/data/inventory/items.json` for each mission material. These are real items with weight, category `"mission-material"`, and inventory constraints:

```json
{
  "id": "venusian-gas",
  "category": "mission-material",
  "label": "Venusian Gas",
  "description": "Atmospheric gas samples collected from Venus's upper cloud layer.",
  "icon": "venusian-gas.png",
  "weightPerUnit": 3,
  "maxStack": 20,
  "sellable": false
}
```

The `"mission-material"` category must be added to the `ItemCategory` union in `src/lib/inventory/types.ts` and the validation set in `src/lib/inventory/catalog.ts`.

### Shuttle Mission Template

Per-planet mission pool JSON files in `src/data/shuttle-missions/`. One file per giver planet. Each contains 3 missions:

**`src/data/shuttle-missions/earth.json`:**
```json
{
  "planetId": "earth",
  "missions": [
    {
      "id": "earth_venus_gas_science",
      "name": "Venus Atmospheric Survey",
      "description": "The science division needs gas samples from Venus's upper atmosphere for climate modeling.",
      "targetPlanet": "venus",
      "gatherQuantity": 5,
      "reward": 300
    },
    {
      "id": "earth_mars_methane",
      "name": "Martian Methane Analysis",
      "description": "Exobiology lab requests methane samples from the Martian surface for biomarker analysis.",
      "targetPlanet": "mars",
      "gatherQuantity": 3,
      "reward": 250
    },
    {
      "id": "earth_mercury_probe",
      "name": "Mercury Probe Deployment",
      "description": "Deploy a thermal probe into Mercury's orbit and return the telemetry data.",
      "targetPlanet": "mercury",
      "gatherQuantity": 1,
      "reward": 400
    }
  ]
}
```

The `gatherItem` is NOT in the mission template — it's derived from the target planet's orbital config. Mission just says "go to venus, bring back 5 units" and the system knows Venus produces `venusian-gas`.

### Runtime Types

New types in `src/lib/missions/types.ts`:

```ts
/** A shuttle mission template from JSON — one entry in a planet's pool. */
interface ShuttleMissionTemplate {
  id: string
  name: string
  description: string
  targetPlanet: string
  gatherQuantity: number
  reward: number
}

/** A planet's full shuttle mission pool loaded from JSON. */
interface ShuttleMissionPool {
  planetId: string
  missions: ShuttleMissionTemplate[]
}

/** Planet orbital config — what a planet produces when visited. */
interface PlanetOrbitalConfig {
  planetId: string
  gatherItem: string
  minigameType: string
}

/** Status of an active shuttle mission. */
type ShuttleMissionStatus = 'active' | 'ready-to-deliver'

/** A mission the player has accepted and is working on. */
interface ActiveShuttleMission {
  template: ShuttleMissionTemplate
  giverPlanet: string
  status: ShuttleMissionStatus
}

/** The mission board state for the shuttle control terminal. */
interface ShuttleMissionBoard {
  /** Currently offered mission at the docked planet (null if restocking or not docked). */
  offeredMission: ShuttleMissionTemplate | null
  /** Which planet is offering (null if not docked). */
  offeringPlanet: string | null
  /** Restock timer — counts down after a mission is taken. */
  restockTimer: RestockTimer | null
  /** All active missions the player has accepted. */
  activeMissions: ActiveShuttleMission[]
}
```

Reuses the existing `RestockTimer` type from `src/lib/shop/tradeTypes.ts`.

## Mission Session Management

New file `src/lib/missions/shuttleMissionSession.ts` — pure functions, same pattern as `shopSession.ts`.

### Key Functions

**`createMissionBoard()`** — Initialize an empty mission board.

**`offerMission(board, planetId)`** — When docking at a planet, pick 1 random mission from the planet's pool of 3. Skip missions where the target planet is the same as where the player currently is (shouldn't happen with proper data, but guard against it). Sets `offeredMission` and `offeringPlanet`.

**`acceptMission(board)`** — Player takes the offered mission:
1. Move the offered mission to `activeMissions` with status `'active'`.
2. Clear `offeredMission`, start restock timer.
3. Return updated board.

No inventory check at accept time — the player might free up space before arriving at the target planet.

**`completeMission(board, missionId, inventory)`** — Player completes the minigame at the target planet:
1. Find the active mission by ID.
2. Look up `gatherItem` from planet orbital config using `template.targetPlanet`.
3. Add items to inventory via `addItem(inventory, gatherItem, gatherQuantity)`.
4. Update mission status to `'ready-to-deliver'`.
5. Return updated board and inventory.

**`deliverMission(board, missionId, profile, inventory)`** — Player delivers at the giver planet:
1. Find the active mission by ID, verify status is `'ready-to-deliver'`.
2. Remove items from inventory via `removeItem(inventory, gatherItem, gatherQuantity)`.
3. Award credits via `addCredits(profile, mission.reward)`.
4. Remove mission from `activeMissions`.
5. Return updated board, profile, and inventory.

**`tickMissionBoard(board, dt)`** — Tick the restock timer. When it expires, do NOT auto-offer a new mission — the next offer happens when the player docks at a planet.

**`getActiveMissionsForPlanet(board, planetId)`** — Returns active missions where `targetPlanet === planetId`. Used to decide if the `I Mission` button shows.

**`getDeliverableMissions(board, planetId)`** — Returns active missions where `giverPlanet === planetId` and status is `'ready-to-deliver'`. Used by the mission board UI.

### Restock Timing

Same constants as shop: 120–240 second random timer. Timer starts when a mission is accepted. Timer ticking happens in `tickMissionBoard()`. When timer expires, `offeredMission` stays null until player next docks at a planet with a pool.

## Integration Points

### 1. OrbitPrompt — `I Mission` Button

**File:** `src/components/OrbitPrompt.vue`

Add a new button below the shop button:
```html
<button
  v-if="missionAvailable && orbitState.state === 'orbiting'"
  type="button"
  class="orbit-prompt-mission-btn"
  @click="emit('openMission')"
>
  I  Mission
</button>
```

New props: `missionAvailable?: boolean`
New emit: `openMission: []`

The button is visible when:
- Player is orbiting a planet
- Player has an active mission with `targetPlanet` matching the orbited planet
- Mission status is `'active'` (not yet completed)
- Mission minigame overlay is not already open

### 2. MapViewController — Mission Callbacks

**File:** `src/views/MapViewController.ts`

New callbacks (following `onShopButton` pattern):
- `onMissionButton?.(visible: boolean, planetName: string)` — controls OrbitPrompt mission button
- `onMissionOverlay?.(visible: boolean, mission: ActiveShuttleMission | null)` — controls minigame overlay
- `onMissionBoardUpdate?.(board: ShuttleMissionBoard)` — pushes board state to Vue

New state:
- `missionBoard: ShuttleMissionBoard` — the persistent mission state
- Track the `I` key in the input system

In the tick loop, after orbit state update:
- If orbiting a planet with an active mission targeting it → `onMissionButton(true, planetName)`
- If `I` pressed while mission button visible → `onMissionOverlay(true, mission)`

### 3. MapView.vue — Wiring

**File:** `src/views/MapView.vue`

New reactive state:
- `missionButtonVisible`, `missionButtonPlanet`
- `missionOverlayVisible`, `missionOverlayMission`
- `missionBoard` (for passing to shuttle control)

Wire up callbacks from MapViewController. Mount `MissionMiniGameOverlay`.

### 4. MissionMiniGameOverlay.vue — Placeholder

**File:** `src/components/MissionMiniGameOverlay.vue`

A full-screen overlay (same z-index pattern as shop dialog). Shows:
- Mission name and description
- Target planet name
- "Complete Mission" button (placeholder for future minigames)
- "Cargo Full" warning if inventory check fails, with Complete button disabled

Emits: `complete`, `close`

On complete:
- Calls `completeMission()` on the session
- Adds items to inventory
- Closes overlay
- Mission status becomes `ready-to-deliver`

### 5. ShuttleControlProgramMissions.vue — Mission Board

**File:** `src/components/shuttle-control/ShuttleControlProgramMissions.vue`

Props: `board: ShuttleMissionBoard`, `dockedPlanet: string | null`

**Layout:**

```
┌─ AVAILABLE MISSION ─────────────────────┐
│ Venus Atmospheric Survey                │
│ Collect gas samples from Venus...       │
│ Target: Venus  |  Reward: 300 CR        │
│ [ACCEPT]                                │
│                                         │
│ — or —                                  │
│ Restocking in 1:45                      │
│ — or —                                  │
│ (not docked at a planet)                │
├─ ACTIVE MISSIONS ───────────────────────┤
│ ▸ Venus Atmospheric Survey              │
│   Earth → Venus | Travel to Venus       │
│                                         │
│ ▸ Martian Methane Analysis              │
│   Earth → Mars | Return to Earth        │
│   [DELIVER]                             │
└─────────────────────────────────────────┘
```

Emits: `accept-mission`, `deliver-mission: [missionId]`

### 6. ShuttleControlOverlay.vue — Pass Mission Data

The shuttle control overlay needs to pass `missionBoard` and `dockedPlanet` down to the missions program component. The `dockedPlanet` comes from the orbit state — if orbiting, that's the docked planet.

### 7. Inventory Types Update

**File:** `src/lib/inventory/types.ts`

Add `'mission-material'` to the `ItemCategory` union:
```ts
export type ItemCategory = 'mineral' | 'upgrade' | 'consumable' | 'equipment' | 'trade-good' | 'mission-material'
```

**File:** `src/lib/inventory/catalog.ts`

Add `'mission-material'` to `VALID_CATEGORIES`.

## Player Flow (End-to-End)

1. Player orbits Earth, docks (opens shuttle control terminal)
2. Opens Missions program → sees "Venus Atmospheric Survey" offered
3. Clicks Accept → mission moves to active list, restock timer starts
4. Closes terminal, slingshots to Venus
5. Orbits Venus → `I Mission` button appears in OrbitPrompt
6. Presses I → MissionMiniGameOverlay opens
7. Checks inventory has room for 5 venusian-gas (15 kg) → shows "Complete Mission" button
8. Clicks Complete → 5 venusian-gas added to inventory, overlay closes
9. Mission status changes to `ready-to-deliver`
10. Flies back to Earth, orbits, docks
11. Opens Missions program → sees "Venus Atmospheric Survey" with Deliver button
12. Clicks Deliver → 5 venusian-gas removed, +300 CR awarded, mission removed from active list
13. A new mission may be offered if restock timer has expired

## Testing Strategy

Focus on `src/lib/missions/` pure functions:

- `offerMission` picks 1 of 3, respects pool boundaries
- `acceptMission` rejects when inventory can't fit items
- `completeMission` adds correct items to inventory, updates status
- `deliverMission` removes items, awards credits, removes mission
- `tickMissionBoard` advances restock timer, expires correctly
- `getActiveMissionsForPlanet` filters correctly
- `getDeliverableMissions` filters by planet and status

No need to test Vue or Three.js layers.

## File Inventory

**New files:**
- `src/data/missions/planet-orbital-config.json`
- `src/data/shuttle-missions/earth.json` (and one per planet that offers missions)
- `src/data/inventory/mission-materials.json` (item definitions for mission materials, registered same as trade goods)
- `src/lib/missions/shuttleMissionSession.ts`
- `src/lib/missions/shuttleMissionTemplates.ts` (loader, same pattern as shop tradeGoods.ts)
- `src/lib/missions/planetOrbitalConfig.ts` (loader for planet orbital config)
- `src/components/MissionMiniGameOverlay.vue`
- `src/lib/missions/__tests__/shuttleMissionSession.spec.ts`

**Modified files:**
- `src/lib/inventory/types.ts` — add `'mission-material'` to ItemCategory
- `src/lib/inventory/catalog.ts` — add `'mission-material'` to VALID_CATEGORIES
- `src/lib/missions/types.ts` — add shuttle mission types
- `src/components/OrbitPrompt.vue` — add `I Mission` button
- `src/components/shuttle-control/ShuttleControlProgramMissions.vue` — implement mission board
- `src/components/ShuttleControlOverlay.vue` — pass mission data to programs
- `src/views/MapView.vue` — wire mission callbacks and overlay
- `src/views/MapViewController.ts` — mission button logic, I key handling, mission state
