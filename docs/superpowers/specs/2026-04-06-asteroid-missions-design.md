# Asteroid Missions System — Design Spec

**Date:** 2026-04-06
**Author:** guinetik
**Status:** Draft

## Overview

Asteroid missions are the original mission type from the GDD — land on an asteroid, complete objectives (gather, exterminate, rescue), and return. Each mission is offered by an in-game character or organization with their own personality, mission types, and flavor text. The player accepts a mission from the mission board, flies to a waypoint in the asteroid belt (or kuiper belt for endgame), presses E to begin, and transitions to the `/level` route.

Mission difficulty is derived from the player's average upgrade level, which naturally gates progression: harder missions require better equipment, which is bought with credits from easier missions.

## Scope

**In scope:**
- Mission giver manifests (JSON data files with templates + flavor text)
- Difficulty derivation from upgrade levels
- Mission generator (template selection, param rolling, waypoint position)
- Waypoint marker on the map (sprite at world position, always visible)
- Waypoint on tactical map overlay (labeled dot with distance)
- "E Begin Mission" HUD prompt when near waypoint
- Active mission persistence in localStorage (for level route transition)
- Asteroid mission section in `ShuttleControlProgramMissions.vue`
- Board state extension for asteroid missions

**Out of scope:**
- Level scene changes (reading mission state, generating terrain, objectives)
- Return flow from level back to map
- Mission completion rewards (handled by return flow)
- Asteroid mission-specific 3D asteroid at waypoint (beyond a marker sprite)

## Difficulty System

### Derivation from Upgrades

The player's mission difficulty is derived from their average upgrade level across all 6 upgrades in `CURRENT_PLAYER_UPGRADE_LEVELS`:

```ts
function computeMissionDifficulty(levels: UpgradeLevels): number {
  const upgradeIds = Object.keys(UPGRADE_DEFINITIONS) as UpgradeId[]
  const sum = upgradeIds.reduce((acc, id) => acc + (levels[id] ?? 0), 0)
  const avg = sum / upgradeIds.length  // 0.0 to 3.0
  return Math.max(1, Math.min(10, Math.floor(avg / 3 * 9) + 1))
}
```

- All level 0 → avg 0.0 → difficulty 1
- All level 1 → avg 1.0 → difficulty 4
- All level 2 → avg 2.0 → difficulty 7
- All level 3 → avg 3.0 → difficulty 10

This maps cleanly to `regionByDifficulty` in existing templates:
- Difficulty 1-3 → near-earth
- Difficulty 4-7 → asteroid-belt
- Difficulty 8-10 → kuiper-belt

## Data Model

### Mission Giver Manifest

JSON files in `src/data/missions/givers/`. Each giver defines who they are and what missions they offer.

**`src/data/missions/givers/jay-mercer.json`:**
```json
{
  "id": "jay",
  "name": "Jay Mercer",
  "title": "Senior Hauler",
  "objectiveTypes": ["gather"],
  "minDifficulty": 1,
  "maxDifficulty": 5,
  "missions": [
    {
      "id": "jay_mineral_survey",
      "name": "Mineral Survey",
      "briefing": "There is a rock out near the belt tagged for survey. Grab samples and bring them back. Easy money.",
      "objectiveSlots": [
        {
          "type": "gather",
          "weight": 1,
          "params": { "type": "gather", "resourceAmount": { "min": 50, "max": 100 } },
          "reward": { "min": 300, "max": 600 }
        }
      ],
      "completionBonus": { "min": 100, "max": 300 },
      "regionByDifficulty": {
        "near-earth": [1, 2],
        "asteroid-belt": [3, 5]
      }
    },
    {
      "id": "jay_deep_core_sample",
      "name": "Deep Core Sample",
      "briefing": "Science division wants a heavy extraction. Drill deep, fill the hold. The rock is further out this time.",
      "objectiveSlots": [
        {
          "type": "gather",
          "weight": 1,
          "params": { "type": "gather", "resourceAmount": { "min": 80, "max": 150 } },
          "reward": { "min": 500, "max": 900 }
        }
      ],
      "completionBonus": { "min": 200, "max": 500 },
      "regionByDifficulty": {
        "asteroid-belt": [3, 5]
      }
    }
  ]
}
```

**`src/data/missions/givers/belt-mining-corp.json`:**
```json
{
  "id": "belt-mining",
  "name": "Belt Mining Corp",
  "title": "Mining Contractor",
  "objectiveTypes": ["gather"],
  "minDifficulty": 3,
  "maxDifficulty": 10,
  "missions": [
    {
      "id": "bmc_standard_extraction",
      "name": "Standard Extraction",
      "briefing": "Contract #4471. Target asteroid tagged for mineral extraction. Standard rates apply. Fill your hold and return to any station.",
      "objectiveSlots": [
        {
          "type": "gather",
          "weight": 1,
          "params": { "type": "gather", "resourceAmount": { "min": 100, "max": 300 } },
          "reward": { "min": 800, "max": 2000 }
        }
      ],
      "completionBonus": { "min": 300, "max": 1000 },
      "regionByDifficulty": {
        "asteroid-belt": [3, 7],
        "kuiper-belt": [8, 10]
      }
    }
  ]
}
```

**`src/data/missions/givers/frontier-rescue.json`:**
```json
{
  "id": "frontier-rescue",
  "name": "Frontier Rescue",
  "title": "Emergency Services",
  "objectiveTypes": ["rescue"],
  "minDifficulty": 3,
  "maxDifficulty": 10,
  "missions": [
    {
      "id": "fr_distress_signal",
      "name": "Distress Signal",
      "briefing": "We are picking up a distress beacon. Colonists are trapped. Clock is ticking — get in there and pull them out.",
      "objectiveSlots": [
        {
          "type": "rescue",
          "weight": 1,
          "params": { "type": "rescue", "colonistCount": { "min": 1, "max": 3 }, "oxygenTime": { "min": 120, "max": 45 }, "guardedChance": 0.2 },
          "reward": { "min": 1000, "max": 3000 }
        }
      ],
      "completionBonus": { "min": 500, "max": 2000 },
      "regionByDifficulty": {
        "near-earth": [3, 4],
        "asteroid-belt": [5, 8],
        "kuiper-belt": [9, 10]
      }
    }
  ]
}
```

**`src/data/missions/givers/colonial-guard.json`:**
```json
{
  "id": "colonial-guard",
  "name": "Colonial Guard",
  "title": "Pest Control Division",
  "objectiveTypes": ["exterminate"],
  "minDifficulty": 2,
  "maxDifficulty": 10,
  "missions": [
    {
      "id": "cg_nest_clearance",
      "name": "Nest Clearance",
      "briefing": "Bug infestation confirmed on a near-Earth rock. Clear the nests before they spread to the shipping lanes.",
      "objectiveSlots": [
        {
          "type": "exterminate",
          "weight": 1,
          "params": { "type": "exterminate", "nestCount": { "min": 1, "max": 3 }, "swarmSize": { "min": 3, "max": 8 }, "spitterChance": 0.1 },
          "reward": { "min": 800, "max": 2500 }
        }
      ],
      "completionBonus": { "min": 400, "max": 1500 },
      "regionByDifficulty": {
        "near-earth": [2, 4],
        "asteroid-belt": [5, 7],
        "kuiper-belt": [8, 10]
      }
    }
  ]
}
```

The giver manifest reuses the existing `ObjectiveSlot`, `NumberRange`, and `regionByDifficulty` structures from the original `MissionTemplate` type. The key difference: each giver file IS a template collection, and each mission has a `briefing` string for flavor text.

### Runtime Types

New types in `src/lib/missions/types.ts`:

```ts
/** A mission giver — character or organization. */
interface MissionGiver {
  id: string
  name: string
  title: string
  objectiveTypes: ObjectiveType[]
  minDifficulty: number
  maxDifficulty: number
  missions: MissionGiverTemplate[]
}

/** A mission template within a giver's manifest. */
interface MissionGiverTemplate {
  id: string
  name: string
  briefing: string
  objectiveSlots: ObjectiveSlot[]
  completionBonus: NumberRange
  regionByDifficulty: Record<MissionRegion, [number, number]>
}

/** Concrete rolled objective values. */
interface ConcreteObjective {
  type: ObjectiveType
  /** For gather: kg to collect. */
  resourceAmount?: number
  /** For exterminate: nest count. */
  nestCount?: number
  /** For exterminate: swarm size per nest. */
  swarmSize?: number
  /** For exterminate: whether spitters are present. */
  hasSpitters?: boolean
  /** For rescue: colonist count. */
  colonistCount?: number
  /** For rescue: seconds of oxygen. */
  oxygenTime?: number
  /** For rescue: whether site is guarded. */
  isGuarded?: boolean
  /** Credit reward for this objective. */
  reward: number
}

/** A fully generated asteroid mission ready for play. */
interface GeneratedAsteroidMission {
  /** Unique instance id (templateId + timestamp). */
  id: string
  /** Giver id (e.g. "jay"). */
  giverId: string
  /** Giver display name (e.g. "Jay Mercer"). */
  giverName: string
  /** Template id (e.g. "jay_mineral_survey"). */
  templateId: string
  /** Mission display name. */
  name: string
  /** Flavor text from the giver. */
  briefing: string
  /** Rolled difficulty (1-10). */
  difficulty: number
  /** Belt region where waypoint spawns. */
  region: MissionRegion
  /** Concrete objectives with rolled values. */
  objectives: ConcreteObjective[]
  /** Total credits: sum of objective rewards + completion bonus. */
  totalReward: number
  /** Waypoint world position. */
  waypoint: { worldX: number; worldZ: number }
  /** Mission status. */
  status: 'available' | 'accepted' | 'in-transit'
}
```

### Board State Extension

`ShuttleMissionBoard` gets three new fields:

```ts
  /** Currently offered asteroid mission (null if restocking). */
  offeredAsteroidMission: GeneratedAsteroidMission | null
  /** The one active asteroid mission (null if none accepted). */
  activeAsteroidMission: GeneratedAsteroidMission | null
  /** Restock timer for asteroid missions. */
  asteroidRestockTimer: RestockTimer | null
```

Only 1 asteroid mission active at a time.

## Mission Generator

New file `src/lib/missions/asteroidMissionGenerator.ts` — pure functions.

### Key Functions

**`computeMissionDifficulty(levels: UpgradeLevels): number`**
Average of all upgrade levels, mapped to 1-10.

**`generateAsteroidMission(difficulty: number): GeneratedAsteroidMission`**
1. Filter givers by `minDifficulty <= difficulty <= maxDifficulty`
2. From eligible givers, collect all mission templates
3. Filter templates where `regionByDifficulty` has a matching region for this difficulty
4. Pick one weighted by `objectiveSlots[].weight`
5. Roll concrete objective values by interpolating `NumberRange` params: `value = min + (difficulty - 1) / 9 * (max - min)`
6. Roll completion bonus the same way
7. Get region via `getRegionForDifficulty`
8. Generate waypoint position within belt bounds (random angle, random radius in belt's inner/outer range, scaled by `ORBIT_SCALE`)
9. Return `GeneratedAsteroidMission`

**`generateWaypointInRegion(region: MissionRegion): { worldX: number; worldZ: number }`**
Uses `ASTEROID_BELTS` catalog data to pick a position within the belt.
- `asteroid-belt` → random position within main-belt's `innerRadius` to `outerRadius` (420–660 × ORBIT_SCALE)
- `kuiper-belt` → random position within kuiper-belt's `innerRadius` to `outerRadius` (1400–2400 × ORBIT_SCALE)
- `near-earth` → random position between Earth's orbit (semi-major axis ~200) and the main belt's inner edge (420), scaled by ORBIT_SCALE. These are close-range asteroids in the Mars crosser zone.

## Persistence

New file `src/lib/missions/missionStorage.ts`:

```ts
const ACTIVE_MISSION_KEY = 'asteroid-lander-active-mission-v1'

function saveActiveMission(mission: GeneratedAsteroidMission): void
function loadActiveMission(): GeneratedAsteroidMission | null
function clearActiveMission(): void
```

Follows the `messageStorage.ts` pattern: JSON.stringify/parse with try/catch safety.

Written when player presses E at waypoint. Read by `LevelViewController` on init. Cleared on mission completion or abandonment.

## Session Management

Extend `shuttleMissionSession.ts` with asteroid mission functions:

**`offerAsteroidMission(board, difficulty)`** — Generate and offer an asteroid mission.

**`acceptAsteroidMission(board)`** — Move offered to active, start restock timer, set status to `accepted`.

**`beginAsteroidMission(board)`** — Set status to `in-transit`, save to localStorage. Called when player presses E at waypoint.

**`tickAsteroidMissionBoard(board, dt)`** — Tick the asteroid restock timer.

## Integration Points

### 1. Waypoint Marker — Map Scene

**File:** `src/views/MapViewController.ts`

New THREE.Sprite at `(waypoint.worldX, 0, waypoint.worldZ)`:
- Canvas-drawn diamond icon, amber/orange color
- Constant apparent screen size (same formula as ship reticle)
- Pulsing opacity animation (sine wave)
- Created when asteroid mission is accepted, removed when completed/abandoned

### 2. Tactical Map Overlay

**File:** `src/components/MapOverlay.vue` + `src/lib/ShuttleTelemetry.ts`

Add waypoint to `MapOverlayState`:
```ts
  missionWaypoint?: { screenX: number; screenY: number; name: string; distance: string } | null
```

Rendered as a labeled dot (amber colored) with distance, same pattern as planet labels.

### 3. Begin Mission HUD Prompt

**File:** `src/views/MapView.vue`

New HUD element, similar to OrbitPrompt:
```html
<div v-if="missionApproachVisible" class="mission-approach-prompt">
  <span class="mission-approach-prompt__name">{{ approachMissionName }}</span>
  <span class="mission-approach-prompt__action">E  Begin Mission</span>
</div>
```

Visible when shuttle is within threshold distance of waypoint and has an active asteroid mission.

### 4. E Key at Waypoint

**File:** `src/views/MapViewController.ts`

In the tick loop, when shuttle is within `MISSION_APPROACH_RADIUS` (e.g. 15 world units) of the waypoint and orbit state is `free`:
- Show approach HUD via callback
- On E press: call `beginAsteroidMission()`, save to localStorage, `router.push('/level')`

Needs router access — passed in via `init()` or a callback.

### 5. Mission Board — Asteroid Section

**File:** `src/components/shuttle-control/ShuttleControlProgramMissions.vue`

New section below shuttle missions: "Asteroid Missions"
- Shows offered asteroid mission with giver name, briefing, objectives summary, reward, region
- Accept button
- Active asteroid mission with status and waypoint region
- No deliver — asteroid missions auto-complete via level scene

### 6. MapView.vue — Wiring

New callbacks:
- `onMissionApproach?.(visible: boolean, missionName: string)`
- `onBeginMission?.(mission: GeneratedAsteroidMission)` → save + navigate

New reactive state for approach prompt visibility.

## File Inventory

**New files:**
- `src/data/missions/givers/jay-mercer.json`
- `src/data/missions/givers/belt-mining-corp.json`
- `src/data/missions/givers/frontier-rescue.json`
- `src/data/missions/givers/colonial-guard.json`
- `src/lib/missions/giverCatalog.ts` (loader)
- `src/lib/missions/asteroidMissionGenerator.ts`
- `src/lib/missions/missionStorage.ts`
- `src/lib/missions/missionDifficulty.ts`
- `src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts`
- `src/lib/missions/__tests__/missionDifficulty.spec.ts`
- `src/lib/missions/__tests__/missionStorage.spec.ts`

**Modified files:**
- `src/lib/missions/types.ts` — add giver + generated mission types
- `src/lib/missions/shuttleMissionSession.ts` — add asteroid mission board functions
- `src/lib/ShuttleTelemetry.ts` — add missionWaypoint to MapOverlayState
- `src/views/MapViewController.ts` — waypoint sprite, approach detection, E key, callbacks
- `src/views/MapView.vue` — approach prompt, new reactive state, callbacks
- `src/components/shuttle-control/ShuttleControlProgramMissions.vue` — asteroid mission section
- `src/components/MapOverlay.vue` — waypoint dot on tactical map
- `src/assets/css/main.css` — approach prompt and waypoint marker styles

## Player Flow (End-to-End)

1. Player opens shuttle control → Missions program
2. Sees "Asteroid Missions" section with an offered mission from Jay Mercer: "Mineral Survey"
3. Reads briefing, sees reward 450 CR, region: near-earth
4. Clicks Accept → mission moves to active, waypoint appears on map
5. Closes terminal, sees amber diamond marker on the map
6. Opens tactical map (M) → sees waypoint labeled "Mineral Survey" with distance
7. Flies toward waypoint
8. Within approach radius → "E  Begin Mission" HUD prompt appears
9. Presses E → mission saved to localStorage → screen transitions to `/level`
10. (Level scene reads mission from localStorage, generates appropriate asteroid — out of scope)

## Testing Strategy

Focus on `src/lib/missions/` pure functions:

- `computeMissionDifficulty` — correct mapping from upgrade levels to difficulty 1-10
- `generateAsteroidMission` — picks valid giver, valid template, rolls params within ranges
- `generateWaypointInRegion` — position within belt bounds
- `missionStorage` — save/load/clear round-trip, handles corrupt data
- Board state — offer, accept, begin, tick timer
- Giver filtering by difficulty range
