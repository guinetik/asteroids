# Jovian Hektor + Saturn Special Missions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author the four Jovian special missions (Hektor photometry/DAN, Saturn photometry/DAN), the two named asteroid bodies they target (Hektor + Asset 2306-S), and the engine plumbing that auto-activates a special mission and reveals Hektor when contract step 4/5/7/8 becomes current.

**Architecture:** Three slices. (1) Content: 2 asteroid JSONs, 4 special-mission JSONs, 4 offer-message catalog entries. (2) Engine: tighten `matchesMissionEvent` for `pinnedAssetRef`/`targetRegion`/`specialMissionId`; emit those fields from the asteroid completion site; add a new `onStepActivated` hook on `ContractSystem` that fires when a step becomes current; runtime dispatches `revealsBody` via `setBodyAccess` and re-emits a `contract_special_mission_requested` listener that `MapViewController` subscribes to. (3) Contract JSON: rewire Jovian Steps 4, 5, 7, 8 to use `specialMissionId`; Step 4 also carries `revealsBody: 'hektor'`.

The activation pattern reuses the existing `MapViewController.stageConsortiumCertification` shape — extracted to a private generic helper that takes the special mission id + offer message id, called from a new step-activated subscription.

**Tech Stack:** TypeScript strict, Vue 3, Vite, Vitest. Uses existing `SPECIAL_MISSIONS` registry, `messageFacade.enqueueById`, `saveActiveMission`, `setBodyAccess`.

**Spec:** `docs/superpowers/specs/2026-04-29-jovian-hektor-mission-routing-design.md`

---

## File Structure

**Created:**
- `src/data/asteroids/hektor.json` — full asteroid profile (D-type Trojan)
- `src/data/asteroids/asset-2306-s.json` — fictional Saturn co-orbital
- `src/data/missions/jovian-prospection-hektor-photometry.json`
- `src/data/missions/jovian-prospection-hektor-dan.json`
- `src/data/missions/jovian-prospection-saturn-photometry.json`
- `src/data/missions/jovian-prospection-saturn-dan.json`

**Modified:**
- `src/lib/asteroids/catalog.ts` — register both new asteroids
- `src/lib/missions/specialMissions.ts` — register 4 new specials
- `src/lib/messages/messageCatalog.ts` — 4 new offer messages + export them in the catalog array
- `src/lib/contracts/contractTypes.ts` — add `specialMissionId?: string` to `MissionCompletedEvent`
- `src/lib/contracts/ContractSystem.ts` — extend `matchesMissionEvent`; add `onStepActivated` hook; refactor `acceptContract` and `advanceStep` to call it; add `ContractStepActivatedPayload`
- `src/lib/contracts/runtime.ts` — wire `onStepActivated`, dispatch `revealsBody` via `setBodyAccess`, expose `onContractStepActivated` subscription
- `src/lib/missions/asteroidMissionRewards.ts` — emit `specialMissionId` + `pinnedAssetRef` + `region` for special missions
- `src/views/MapViewController.ts` — refactor `stageConsortiumCertification` to a generic helper `stageSpecialMission(missionId, offerMessageId)`; subscribe to `onContractStepActivated` and stage on demand
- `src/data/contracts/jovian-society-prospection.json` — Steps 4, 5, 7, 8 carry `specialMissionId`; Step 4 carries `revealsBody: 'hektor'`; drop now-redundant `objectiveType`/`pinnedAssetRef` filters on those steps
- `src/lib/contracts/__tests__/jovian-contract.spec.ts` — synthetic events use `specialMissionId` to satisfy the tightened filters

**New tests:**
- New describe blocks in `ContractSystem.spec.ts` for the matcher fields and the `onStepActivated` hook
- Asteroid catalog validation test in `src/lib/asteroids/__tests__/catalog.spec.ts` (extend if exists, or rely on the load-time `validateAsteroid` throwing)
- Special mission lookup test in `src/lib/missions/__tests__/specialMissions.spec.ts` (new file)

---

## Task 1: Author Hektor asteroid catalog entry

**Files:**
- Create: `src/data/asteroids/hektor.json`
- Modify: `src/lib/asteroids/catalog.ts`

The Hektor `.glb` already exists at `public/models/hektor.glb` (from plan 1).

- [ ] **Step 1: Read an existing dark asteroid for reference**

Read `src/data/asteroids/bennu.json` (already loaded). Note the field shapes — composition sums to 100, dimensions in meters, modelPath relative to `/public/`.

- [ ] **Step 2: Create `src/data/asteroids/hektor.json`**

```json
{
  "id": "hektor",
  "name": "Hektor",
  "designation": "624 Hektor",
  "type": "Dark D-type Trojan",
  "biome": "rocky",
  "description": "The largest Jupiter Trojan and a contact-binary asteroid leading the L4 Lagrange cluster. D-type spectrum, vanishingly low albedo, primordial Solar System material thought to have settled at the L4 point billions of years ago.",
  "composition": [
    { "name": "Carbonaceous Chondrite", "percentage": 38 },
    { "name": "Organic Macromolecules", "percentage": 22 },
    { "name": "Hydrated Silicates", "formula": "Mg3Si2O5(OH)4", "percentage": 18 },
    { "name": "Water Ice", "formula": "H2O", "percentage": 14 },
    { "name": "Magnetite", "formula": "Fe3O4", "percentage": 5 },
    { "name": "Iron-Nickel", "formula": "Fe-Ni", "percentage": 3 }
  ],
  "shape": {
    "dimensions": [37000, 19500, 19500],
    "elongation": 1.9,
    "lobeCount": 2,
    "irregularity": 0.65
  },
  "surface": {
    "craterDensity": 0.85,
    "craterMaxScale": 0.4,
    "boulderDensity": 0.55,
    "ridgeFrequency": 0.4,
    "roughness": 0.7,
    "dustCoverage": 0.6,
    "modelPath": "/models/hektor.glb",
    "modelScale": 1300,
    "surfaceTextures": "/textures/asteroids/rocky",
    "surfaceTextureRepeat": 13,
    "surfaceModulatorStrength": 0.9,
    "surfaceModulatorColorBlend": 0.1,
    "surfaceAOStrength": 0.6,
    "surfaceEmissionStrength": 0.4
  },
  "visual": {
    "albedo": 0.025,
    "baseColor": [0.18, 0.16, 0.14],
    "valleyTone": 0.05,
    "peakTone": 1.6
  },
  "physical": {
    "mass": 7.9e18,
    "density": 1000,
    "surfaceGravity": 0.018,
    "rotationPeriod": 6.92,
    "surfaceTemperature": 125
  },
  "lighting": {
    "sunAzimuth": 45,
    "sunElevation": 35,
    "sunColor": [0.95, 0.96, 1.0],
    "sunIntensity": 1.1,
    "ambientIntensity": 0.7
  }
}
```

(Composition: 38 + 22 + 18 + 14 + 5 + 3 = 100 ✓.)

- [ ] **Step 3: Register in `catalog.ts`**

In `src/lib/asteroids/catalog.ts`, add the import and add to the array:

```ts
import hektorData from '@/data/asteroids/hektor.json'
```

And include `hektorData` in the `ASTEROID_CATALOG` array (keep alphabetical or matching the existing convention — append to the end is fine):

```ts
export const ASTEROID_CATALOG: AsteroidDefinition[] = [
  bennuData,
  erosData,
  itokawaData,
  vestaData,
  psycheData,
  xg7Data,
  kr3Data,
  hektorData,
].map((data) => validateAsteroid(data as unknown as AsteroidDefinition))
```

- [ ] **Step 4: Verify**

Run: `bun run type-check && bun test:unit`
Expected: all pass. The `validateAsteroid` call at module load throws if composition is wrong; clean run confirms 100-sum.

- [ ] **Step 5: Commit**

```bash
git add src/data/asteroids/hektor.json src/lib/asteroids/catalog.ts
git commit -m "feat(asteroids): add Hektor (624 Hektor) D-type Trojan to catalog"
```

---

## Task 2: Author Asset 2306-S (Saturn co-orbital)

**Files:**
- Create: `src/data/asteroids/asset-2306-s.json`
- Modify: `src/lib/asteroids/catalog.ts`

Fictional ~12 km Saturn co-orbital. Reuses `bennu.glb` (no new model authoring).

- [ ] **Step 1: Create `src/data/asteroids/asset-2306-s.json`**

```json
{
  "id": "asset-2306-s",
  "name": "Asset 2306-S",
  "designation": "Asset 2306-S",
  "type": "Dark Outer-System Trojan",
  "biome": "rocky",
  "description": "A Society-ledger entry for a fictional Saturn co-orbital body. Dark D-type analogue, ~12 km mean diameter, deep cold. Society analysts treat it as a peer body to Asset 2306-J for portfolio comparison.",
  "composition": [
    { "name": "Carbonaceous Chondrite", "percentage": 36 },
    { "name": "Organic Macromolecules", "percentage": 24 },
    { "name": "Hydrated Silicates", "formula": "Mg3Si2O5(OH)4", "percentage": 16 },
    { "name": "Water Ice", "formula": "H2O", "percentage": 17 },
    { "name": "Magnetite", "formula": "Fe3O4", "percentage": 4 },
    { "name": "Iron-Nickel", "formula": "Fe-Ni", "percentage": 3 }
  ],
  "shape": {
    "dimensions": [12000, 9500, 8800],
    "elongation": 1.2,
    "lobeCount": 1,
    "irregularity": 0.55
  },
  "surface": {
    "craterDensity": 0.7,
    "craterMaxScale": 0.3,
    "boulderDensity": 0.7,
    "ridgeFrequency": 0.3,
    "roughness": 0.75,
    "dustCoverage": 0.55,
    "modelPath": "/models/asteroids/bennu.glb",
    "modelScale": 1300,
    "surfaceTextures": "/textures/asteroids/rocky",
    "surfaceTextureRepeat": 13,
    "surfaceModulatorStrength": 0.9,
    "surfaceModulatorColorBlend": 0.1,
    "surfaceAOStrength": 0.55,
    "surfaceEmissionStrength": 0.4
  },
  "visual": {
    "albedo": 0.04,
    "baseColor": [0.18, 0.18, 0.21],
    "valleyTone": 0.06,
    "peakTone": 1.8
  },
  "physical": {
    "mass": 1.1e15,
    "density": 1100,
    "surfaceGravity": 0.0006,
    "rotationPeriod": 9.5,
    "surfaceTemperature": 110
  },
  "lighting": {
    "sunAzimuth": 45,
    "sunElevation": 30,
    "sunColor": [0.90, 0.93, 1.0],
    "sunIntensity": 0.9,
    "ambientIntensity": 0.6
  }
}
```

(Composition: 36 + 24 + 16 + 17 + 4 + 3 = 100 ✓.)

- [ ] **Step 2: Register in `catalog.ts`**

Add the import and append to the array:

```ts
import asset2306SData from '@/data/asteroids/asset-2306-s.json'
```

```ts
export const ASTEROID_CATALOG: AsteroidDefinition[] = [
  bennuData,
  erosData,
  itokawaData,
  vestaData,
  psycheData,
  xg7Data,
  kr3Data,
  hektorData,
  asset2306SData,
].map((data) => validateAsteroid(data as unknown as AsteroidDefinition))
```

- [ ] **Step 3: Verify**

Run: `bun run type-check && bun test:unit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/data/asteroids/asset-2306-s.json src/lib/asteroids/catalog.ts
git commit -m "feat(asteroids): add Asset 2306-S fictional Saturn co-orbital body"
```

---

## Task 3: Author 4 Jovian special missions

**Files:**
- Create: `src/data/missions/jovian-prospection-hektor-photometry.json`
- Create: `src/data/missions/jovian-prospection-hektor-dan.json`
- Create: `src/data/missions/jovian-prospection-saturn-photometry.json`
- Create: `src/data/missions/jovian-prospection-saturn-dan.json`
- Modify: `src/lib/missions/specialMissions.ts`
- Modify: `src/lib/missions/types.ts` — add `'saturn-trojans'` to `MissionRegion` union

Each mission follows the consortium-certification shape: pre-baked `GeneratedAsteroidMission` with `kind: "special"`, fixed objectives, fixed reward.

- [ ] **Step 0: Extend `MissionRegion` to include `'saturn-trojans'`**

In `src/lib/missions/types.ts`, find:

```ts
export type MissionRegion = 'near-earth' | 'asteroid-belt' | 'kuiper-belt' | 'jovian-trojans'
```

Replace with:

```ts
export type MissionRegion =
  | 'near-earth'
  | 'asteroid-belt'
  | 'kuiper-belt'
  | 'jovian-trojans'
  | 'saturn-trojans'
```

The Saturn special missions reference this region; without the union extension, type-check fails.

- [ ] **Step 1: Read consortium reference**

Already loaded: `src/data/missions/consortium-certification.json` shows the shape. Note `kind: "special"`, the `objectives[0]` shape, and `waypoint` is a single `{ worldX, worldZ }` pair.

- [ ] **Step 2: Read the photometry/DAN objective shapes**

Read `src/lib/missions/types.ts` lines 450–500 (the `ConcreteObjective` interface) to confirm photometry and DAN objective fields. Photometry uses `scanHoldSeconds`, `probeDistance`, `timeLimit`. DAN uses `scanDurationSeconds`, `requiredParticleHits`, `enemyGraceSeconds`, `particleTier`, `enemyTier`. Both have `type`, `x`, `z`, `reward`.

(If a field is missing or the shapes differ, adapt to the actual interface — `bun run type-check` will catch it.)

- [ ] **Step 3: Create `jovian-prospection-hektor-photometry.json`**

```json
{
  "kind": "special",
  "id": "jovian-prospection-hektor-photometry",
  "asteroidId": "hektor",
  "giverId": "jovian-society",
  "giverName": "Jovian Society",
  "templateId": "jovian-prospection-hektor-photometry",
  "name": "OP 4 — Photometric Assessment, Asset 2306-J",
  "briefing": "Pilot, calibration unit registers green. You're cleared for photometry tasking. First assignment: a candidate body in the Jovian Trojans, currently flagged 'preliminary review' in our portfolio. We're calling it Asset 2306-J for ledger purposes. Single photometric pass, standard deliverable. The Society values clean telemetry; please prioritize signal quality over speed. — Vance",
  "difficulty": 5,
  "region": "jovian-trojans",
  "objectives": [
    {
      "type": "photometry",
      "x": 0,
      "z": 0,
      "scanHoldSeconds": 8,
      "probeDistance": 2700,
      "timeLimit": 240,
      "reward": 4500
    }
  ],
  "totalReward": 4500,
  "waypoint": { "worldX": 0, "worldZ": 0 },
  "status": "available"
}
```

- [ ] **Step 4: Create `jovian-prospection-hektor-dan.json`**

```json
{
  "kind": "special",
  "id": "jovian-prospection-hektor-dan",
  "asteroidId": "hektor",
  "giverId": "jovian-society",
  "giverName": "Jovian Society",
  "templateId": "jovian-prospection-hektor-dan",
  "name": "OP 7 — Subsurface Survey, Asset 2306-J",
  "briefing": "Pilot, DAN instrument is shipped and registered to your lander. First subsurface pass: the same Jovian Trojan candidate from the photometry series. You'll find the body familiar. Park in the center of the impact crater the Society marked during your earlier visit, switch to science mode, and run the scan. A note from the instrumentation team: the neutron pulse occasionally registers ambient disturbance during operation. They assure us this is sensor cross-talk and not a hazard. Please complete the survey regardless. — Vance",
  "difficulty": 6,
  "region": "jovian-trojans",
  "objectives": [
    {
      "type": "dan",
      "x": 0,
      "z": 0,
      "scanDurationSeconds": 70,
      "requiredParticleHits": 28,
      "enemyGraceSeconds": 9,
      "particleTier": "medium",
      "enemyTier": "medium",
      "reward": 6000
    }
  ],
  "totalReward": 6000,
  "waypoint": { "worldX": 0, "worldZ": 0 },
  "status": "available"
}
```

- [ ] **Step 5: Create `jovian-prospection-saturn-photometry.json`**

```json
{
  "kind": "special",
  "id": "jovian-prospection-saturn-photometry",
  "asteroidId": "asset-2306-s",
  "giverId": "jovian-society",
  "giverName": "Jovian Society",
  "templateId": "jovian-prospection-saturn-photometry",
  "name": "OP 5 — Photometric Assessment, Asset 2306-S",
  "briefing": "Pilot, strong returns on the Jovian pass. Routing you to a sister asset in the Saturn co-orbital region — yes, slightly outside our usual operating envelope, but the portfolio review is system-wide this quarter and we like the way you fly. Travel premium is included in the line item. Please do not cite the figure to other contractors. Same instrumentation, same protocol, longer trip. Asset 2306-S. Single photometric pass. — Vance",
  "difficulty": 6,
  "region": "saturn-trojans",
  "objectives": [
    {
      "type": "photometry",
      "x": 0,
      "z": 0,
      "scanHoldSeconds": 9,
      "probeDistance": 2900,
      "timeLimit": 230,
      "reward": 6000
    }
  ],
  "totalReward": 6000,
  "waypoint": { "worldX": 0, "worldZ": 0 },
  "status": "available"
}
```

- [ ] **Step 6: Create `jovian-prospection-saturn-dan.json`**

```json
{
  "kind": "special",
  "id": "jovian-prospection-saturn-dan",
  "asteroidId": "asset-2306-s",
  "giverId": "jovian-society",
  "giverName": "Jovian Society",
  "templateId": "jovian-prospection-saturn-dan",
  "name": "OP 8 — Subsurface Survey, Asset 2306-S",
  "briefing": "Pilot, final survey deliverable. Saturn co-orbital body — Asset 2306-S, the same body you photometry'd in OP 5. DAN protocol, same procedure as the Jovian pass. I will note that several pilots in the cohort have reported elevated 'sensor cross-talk' on subsurface passes near gas-giant assets. The instrumentation team continues to investigate. You are cleared to proceed at your discretion. Travel premium applies on this leg as well. Bring the data home and we'll begin compiling the full prospectus. — Vance",
  "difficulty": 8,
  "region": "saturn-trojans",
  "objectives": [
    {
      "type": "dan",
      "x": 0,
      "z": 0,
      "scanDurationSeconds": 90,
      "requiredParticleHits": 34,
      "enemyGraceSeconds": 7,
      "particleTier": "high",
      "enemyTier": "high",
      "reward": 7500
    }
  ],
  "totalReward": 7500,
  "waypoint": { "worldX": 0, "worldZ": 0 },
  "status": "available"
}
```

- [ ] **Step 7: Register all 4 in `specialMissions.ts`**

Edit `src/lib/missions/specialMissions.ts`. Add four imports and include them in the array:

```ts
import consortiumCertificationData from '@/data/missions/consortium-certification.json'
import jovianHektorPhotometry from '@/data/missions/jovian-prospection-hektor-photometry.json'
import jovianHektorDan from '@/data/missions/jovian-prospection-hektor-dan.json'
import jovianSaturnPhotometry from '@/data/missions/jovian-prospection-saturn-photometry.json'
import jovianSaturnDan from '@/data/missions/jovian-prospection-saturn-dan.json'

export const SPECIAL_MISSIONS: GeneratedAsteroidMission[] = [
  consortiumCertificationData,
  jovianHektorPhotometry,
  jovianHektorDan,
  jovianSaturnPhotometry,
  jovianSaturnDan,
] as unknown as GeneratedAsteroidMission[]
```

- [ ] **Step 8: Add a quick lookup test**

Create `src/lib/missions/__tests__/specialMissions.spec.ts`:

```ts
/**
 * Tests for the special-mission registry.
 *
 * @author guinetik
 * @date 2026-04-29
 * @spec docs/superpowers/specs/2026-04-29-jovian-hektor-mission-routing-design.md
 */
import { describe, expect, it } from 'vitest'
import { getSpecialMissionById, SPECIAL_MISSIONS } from '../specialMissions'

describe('SPECIAL_MISSIONS registry', () => {
  it('includes consortium-certification (regression)', () => {
    expect(getSpecialMissionById('consortium-certification')).toBeTruthy()
  })

  it('includes the four Jovian special missions', () => {
    const ids = [
      'jovian-prospection-hektor-photometry',
      'jovian-prospection-hektor-dan',
      'jovian-prospection-saturn-photometry',
      'jovian-prospection-saturn-dan',
    ]
    for (const id of ids) {
      expect(getSpecialMissionById(id), `expected ${id} in registry`).toBeTruthy()
    }
  })

  it('returns deep-cloned missions (mutation does not leak)', () => {
    const a = getSpecialMissionById('jovian-prospection-hektor-photometry')
    const b = getSpecialMissionById('jovian-prospection-hektor-photometry')
    expect(a).not.toBe(b)
    if (a) a.totalReward = 999999
    expect(b?.totalReward).not.toBe(999999)
  })

  it('all five missions are kind: "special"', () => {
    for (const mission of SPECIAL_MISSIONS) {
      expect(mission.kind).toBe('special')
    }
  })
})
```

- [ ] **Step 9: Verify**

Run: `bun run type-check && bun test:unit src/lib/missions/__tests__/specialMissions.spec.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/data/missions/jovian-prospection-*.json \
        src/lib/missions/specialMissions.ts \
        src/lib/missions/__tests__/specialMissions.spec.ts
git commit -m "feat(missions): author 4 Jovian special missions for Hektor and Saturn"
```

---

## Task 4: Author 4 offer messages in messageCatalog

**Files:**
- Modify: `src/lib/messages/messageCatalog.ts`

Each special mission has an offer message that's enqueued when the contract step activates. The Jovian contract folder is `jovian-society-prospection` (matches `Contract.id`); offers go into the contract's inbox folder via existing folder-routing semantics.

- [ ] **Step 1: Read existing message exports**

Read `src/lib/messages/messageCatalog.ts` lines 200–230 (around the consortium message) to understand the export shape and how messages are aggregated into the catalog array.

- [ ] **Step 2: Add 4 offer messages**

Append these exports near the consortium one (anywhere in the file is fine, but grouping is friendlier):

```ts
/** Jovian Step 4 — Hektor photometry offer. */
export const JOVIAN_HEKTOR_PHOTOMETRY_OFFER: ShipMessageDefinition = {
  id: 'jovian-prospection-hektor-photometry-offer',
  from: 'Vance Hoyt, Senior Asset Officer (Cloud City)',
  subject: 'Tasking: Photometric Pass — Asset 2306-J',
  sentAt: '2306-05-04 09:18 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: 80,
  folderId: 'jovian-society-prospection',
  folderLabel: 'Jovian Society',
  body: [
    'Pilot,',
    'Calibration cleared. The Society has staged Asset 2306-J on your active mission ledger — Jovian Trojans, L4 cluster, leading Jupiter by approximately sixty degrees. You will see the body on your nav momentarily.',
    'Standard photometric protocol. Hold standoff, capture telemetry, return for processing. Travel safe.',
    '— Vance',
  ],
}

/** Jovian Step 5 — Saturn photometry offer. */
export const JOVIAN_SATURN_PHOTOMETRY_OFFER: ShipMessageDefinition = {
  id: 'jovian-prospection-saturn-photometry-offer',
  from: 'Vance Hoyt, Senior Asset Officer (Cloud City)',
  subject: 'Tasking: Photometric Pass — Asset 2306-S',
  sentAt: '2306-05-09 11:42 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: 80,
  folderId: 'jovian-society-prospection',
  folderLabel: 'Jovian Society',
  body: [
    'Pilot,',
    'Routing you outsystem on this one. Asset 2306-S is staged in the Saturn co-orbital region. Travel premium is in the line item.',
    'Same protocol as the Jovian pass. Bring back clean telemetry.',
    '— Vance',
  ],
}

/** Jovian Step 7 — Hektor DAN offer. */
export const JOVIAN_HEKTOR_DAN_OFFER: ShipMessageDefinition = {
  id: 'jovian-prospection-hektor-dan-offer',
  from: 'Vance Hoyt, Senior Asset Officer (Cloud City)',
  subject: 'Tasking: Subsurface Survey — Asset 2306-J',
  sentAt: '2306-05-15 14:08 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: 80,
  folderId: 'jovian-society-prospection',
  folderLabel: 'Jovian Society',
  body: [
    'Pilot,',
    'Instrumentation Bay confirms DAN unit registered to your lander. The Society has staged the subsurface pass on Asset 2306-J — same body you photometry-d in OP 4. Familiar territory.',
    'Park in the marked crater, switch to science mode, run the pulse. Disregard ambient cross-talk per prior guidance.',
    '— Vance',
  ],
}

/** Jovian Step 8 — Saturn DAN offer. */
export const JOVIAN_SATURN_DAN_OFFER: ShipMessageDefinition = {
  id: 'jovian-prospection-saturn-dan-offer',
  from: 'Vance Hoyt, Senior Asset Officer (Cloud City)',
  subject: 'Tasking: Subsurface Survey — Asset 2306-S',
  sentAt: '2306-05-21 10:30 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: 80,
  folderId: 'jovian-society-prospection',
  folderLabel: 'Jovian Society',
  body: [
    'Pilot,',
    'Final survey deliverable. Asset 2306-S is staged for DAN. Saturn co-orbital body — same one you photometry-d in OP 5.',
    'Travel premium applies on this leg as well. Bring the data home and we will begin compiling the prospectus.',
    '— Vance',
  ],
}
```

- [ ] **Step 3: Register them in `SHIP_MESSAGE_CATALOG`**

Find the `SHIP_MESSAGE_CATALOG` array near the bottom of `messageCatalog.ts` (around line 275). Add the four new exports:

```ts
export const SHIP_MESSAGE_CATALOG: ShipMessageDefinition[] = [
  STARTUP_SELLER_MESSAGE,
  CONSORTIUM_CERTIFICATION_MESSAGE,
  JOVIAN_HEKTOR_PHOTOMETRY_OFFER,
  JOVIAN_SATURN_PHOTOMETRY_OFFER,
  JOVIAN_HEKTOR_DAN_OFFER,
  JOVIAN_SATURN_DAN_OFFER,
  JAY_STARTUP_FOLLOW_UP_MESSAGE,
  JAY_FIRST_SLINGSHOT_MESSAGE,
  // ...rest of the array stays as-is
]
```

(Insert the four new entries adjacent to `CONSORTIUM_CERTIFICATION_MESSAGE` for grouping.)

- [ ] **Step 4: Verify**

Run: `bun run type-check && bun test:unit`
Expected: PASS.

If any TSDoc/lint warning appears on the new exports, fix in place — every export needs TSDoc per project rules.

- [ ] **Step 5: Commit**

```bash
git add src/lib/messages/messageCatalog.ts
git commit -m "feat(messages): add Jovian special-mission offer messages for steps 4/5/7/8"
```

---

## Task 5: `MissionCompletedEvent.specialMissionId` + matcher tighten

**Files:**
- Modify: `src/lib/contracts/contractTypes.ts`
- Modify: `src/lib/contracts/ContractSystem.ts`
- Modify: `src/lib/contracts/__tests__/ContractSystem.spec.ts`

The matcher already honors `objectiveType` (plan 3). Plan 4 adds three filters: `pinnedAssetRef`, `targetRegion`, `specialMissionId`.

- [ ] **Step 1: Add `specialMissionId?: string` to `MissionCompletedEvent`**

In `src/lib/contracts/contractTypes.ts`, find the `MissionCompletedEvent` interface. After `pinnedAssetRef?: string`, add:

```ts
  /**
   * Optional special-mission id the completed mission carries (e.g.
   * `'jovian-prospection-hektor-photometry'`). Plan 4 populates from the
   * asteroid mission completion path when the active mission is `kind: 'special'`.
   */
  specialMissionId?: string
```

- [ ] **Step 2: Write failing tests in `ContractSystem.spec.ts`**

Append a new `describe('matcher full filter set', ...)` block at the bottom of `src/lib/contracts/__tests__/ContractSystem.spec.ts`. Use the file's existing helpers.

```ts
describe('matcher full filter set', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key]
  })

  function buildContract(stepFilters: {
    missionType?: ContractMissionType
    pinnedAssetRef?: string
    targetRegion?: string
    specialMissionId?: string
  }): Contract {
    return {
      id: `match-${stepFilters.specialMissionId ?? stepFilters.pinnedAssetRef ?? stepFilters.targetRegion ?? 'x'}`,
      inboxName: 'M',
      from: 't',
      sentAt: TEST_DATE,
      introSubject: 'M',
      introBody: ['m'],
      steps: [
        {
          kind: 'complete-missions',
          count: 1,
          ...stepFilters,
          subject: 's',
          flavor: ['f'],
        },
      ],
      completionSubject: 'd',
      completionBody: ['d'],
      rewards: [],
    }
  }

  function buildSystem(c: Contract) {
    const messages = new MessageSystem(emptyMessageStore())
    const contracts = new ContractSystem([c], messages, inMemoryPersistence())
    contracts.resetForTests()
    contracts.offerForTests(c.id)
    contracts.acceptContract(c.id)
    return contracts
  }

  it('advances when specialMissionId matches', () => {
    const c = buildContract({
      missionType: 'asteroid',
      specialMissionId: 'jovian-prospection-hektor-photometry',
    })
    const contracts = buildSystem(c)
    contracts.notifyMissionCompleted({
      kind: 'asteroid',
      giverPlanetId: null,
      giverId: null,
      targetPlanetId: null,
      specialMissionId: 'jovian-prospection-hektor-photometry',
    })
    expect(contracts.getInstance(c.id)?.status).toBe('completed')
  })

  it('does NOT advance when specialMissionId differs', () => {
    const c = buildContract({
      missionType: 'asteroid',
      specialMissionId: 'jovian-prospection-hektor-photometry',
    })
    const contracts = buildSystem(c)
    contracts.notifyMissionCompleted({
      kind: 'asteroid',
      giverPlanetId: null,
      giverId: null,
      targetPlanetId: null,
      specialMissionId: 'jovian-prospection-saturn-photometry',
    })
    expect(contracts.getInstance(c.id)?.status).toBe('active')
  })

  it('advances when pinnedAssetRef matches', () => {
    const c = buildContract({ missionType: 'asteroid', pinnedAssetRef: 'hektor' })
    const contracts = buildSystem(c)
    contracts.notifyMissionCompleted({
      kind: 'asteroid',
      giverPlanetId: null,
      giverId: null,
      targetPlanetId: null,
      pinnedAssetRef: 'hektor',
    })
    expect(contracts.getInstance(c.id)?.status).toBe('completed')
  })

  it('does NOT advance when pinnedAssetRef differs', () => {
    const c = buildContract({ missionType: 'asteroid', pinnedAssetRef: 'hektor' })
    const contracts = buildSystem(c)
    contracts.notifyMissionCompleted({
      kind: 'asteroid',
      giverPlanetId: null,
      giverId: null,
      targetPlanetId: null,
      pinnedAssetRef: 'asset-2306-s',
    })
    expect(contracts.getInstance(c.id)?.status).toBe('active')
  })

  it('advances when targetRegion matches event.region', () => {
    const c = buildContract({ missionType: 'asteroid', targetRegion: 'saturn-trojans' })
    const contracts = buildSystem(c)
    contracts.notifyMissionCompleted({
      kind: 'asteroid',
      giverPlanetId: null,
      giverId: null,
      targetPlanetId: null,
      region: 'saturn-trojans',
    })
    expect(contracts.getInstance(c.id)?.status).toBe('completed')
  })

  it('does NOT advance when targetRegion differs from event.region', () => {
    const c = buildContract({ missionType: 'asteroid', targetRegion: 'saturn-trojans' })
    const contracts = buildSystem(c)
    contracts.notifyMissionCompleted({
      kind: 'asteroid',
      giverPlanetId: null,
      giverId: null,
      targetPlanetId: null,
      region: 'jovian-trojans',
    })
    expect(contracts.getInstance(c.id)?.status).toBe('active')
  })
})
```

- [ ] **Step 3: Run tests, confirm failure**

Run: `bun test:unit src/lib/contracts/__tests__/ContractSystem.spec.ts -t "matcher full filter set"`
Expected: 6 tests fail because the matcher ignores the new fields.

- [ ] **Step 4: Tighten `matchesMissionEvent`**

In `src/lib/contracts/ContractSystem.ts`, find the existing `matchesMissionEvent` free function. Replace with:

```ts
/** True when a `complete-missions` step matches the supplied event filters. */
function matchesMissionEvent(
  step: {
    missionType?: string
    giverId?: string
    giverPlanetId?: string
    objectiveType?: string
    pinnedAssetRef?: string
    targetRegion?: string
    specialMissionId?: string
  },
  event: MissionCompletedEvent,
): boolean {
  if (step.missionType !== undefined && step.missionType !== event.kind) return false
  if (step.giverId !== undefined && step.giverId !== event.giverId) return false
  if (step.giverPlanetId !== undefined && step.giverPlanetId !== event.giverPlanetId) return false
  if (step.objectiveType !== undefined && step.objectiveType !== event.objectiveType) return false
  if (step.pinnedAssetRef !== undefined && step.pinnedAssetRef !== event.pinnedAssetRef) {
    return false
  }
  if (step.targetRegion !== undefined && step.targetRegion !== event.region) return false
  if (step.specialMissionId !== undefined && step.specialMissionId !== event.specialMissionId) {
    return false
  }
  return true
}
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `bun test:unit src/lib/contracts/__tests__/ContractSystem.spec.ts -t "matcher full filter set"`
Expected: all 6 pass.

Run: `bun test:unit src/lib/contracts/__tests__/`
Expected: ContractSystem suite green, but `jovian-contract.spec.ts` may fail because the synthetic asteroid events don't carry `specialMissionId` for steps 4/7 (after Task 9 those are added, plus the JSON edit adds the filter). For now, leave it.

- [ ] **Step 6: TSDoc updates**

In `src/lib/contracts/contractTypes.ts`:
- Update `pinnedAssetRef?: string`'s docstring on `CompleteMissionsStep` (lines ~85): replace "Plan 4 wires the activation. Plan 2 stores the field." with "Honored by the matcher — only events with the matching `pinnedAssetRef` advance."
- Same for the `targetRegion` doc — replace any "ignored / later plans tighten" wording with "Honored by the matcher — only events with matching `region` advance."

If TSDoc is currently accurate, leave it.

- [ ] **Step 7: Commit**

```bash
git add src/lib/contracts/
git commit -m "feat(contracts): honor pinnedAssetRef, targetRegion, specialMissionId in matcher"
```

---

## Task 6: Mission completion plumbing for special missions

**Files:**
- Modify: `src/lib/missions/asteroidMissionRewards.ts`
- Modify: `src/lib/missions/__tests__/asteroidMissionRewards.spec.ts`

When the active asteroid mission is `kind: 'special'`, the completion event must carry `specialMissionId`, `pinnedAssetRef` (when applicable), and `region` so the contract step's filters can match.

- [ ] **Step 1: Read the current emission**

In `src/lib/missions/asteroidMissionRewards.ts`, find the `contractSystem.notifyMissionCompleted({...})` call near the end of `persistCompletedAsteroidMissionRewards`. It currently passes `objectiveType: mission.objectives[0]?.type ?? ''` (from plan 3).

- [ ] **Step 2: Update the emission to populate special-mission fields**

Replace the `notifyMissionCompleted` block with:

```ts
  contractSystem.notifyMissionCompleted({
    kind: 'asteroid',
    giverPlanetId: null,
    giverId: mission.giverId ?? null,
    targetPlanetId: null,
    objectiveType: mission.objectives[0]?.type ?? '',
    region: mission.region,
    pinnedAssetRef: mission.kind === 'special' ? pinnedAssetRefForAsteroid(mission.asteroidId) : undefined,
    specialMissionId: mission.kind === 'special' ? mission.id : undefined,
  })
```

Then add the helper to the same file (above `persistCompletedAsteroidMissionRewards` or at the end of the file):

```ts
/**
 * Map an asteroid id to its pinned-asset ref. Currently only Hektor is a
 * pinned body — Asset 2306-S is a regular catalog body, not pinned. Returns
 * `undefined` for non-pinned ids so the contract matcher's `pinnedAssetRef`
 * filter only narrows when the body is genuinely pinned.
 *
 * @param asteroidId - Asteroid catalog id (e.g. `'hektor'`).
 * @returns Pinned-asset ref or `undefined`.
 */
function pinnedAssetRefForAsteroid(asteroidId: string): string | undefined {
  if (asteroidId === 'hektor') return 'hektor'
  return undefined
}
```

- [ ] **Step 3: Add emission tests**

In `src/lib/missions/__tests__/asteroidMissionRewards.spec.ts`, append two new tests inside the existing `describe('persistCompletedAsteroidMissionRewards', ...)` block:

```ts
  it('emits specialMissionId and pinnedAssetRef when a special Hektor mission completes', () => {
    const mission: GeneratedAsteroidMission = {
      ...BASE_MISSION,
      kind: 'special',
      id: 'jovian-prospection-hektor-photometry',
      asteroidId: 'hektor',
      region: 'jovian-trojans',
      objectives: [{ type: 'photometry', x: 0, z: 0 }],
    } as GeneratedAsteroidMission
    localStorage.setItem(ACTIVE_MISSION_KEY, JSON.stringify(mission))
    const spy = vi.spyOn(contractSystem, 'notifyMissionCompleted')
    persistCompletedAsteroidMissionRewards(mission, 1)
    const callArg = spy.mock.calls[0]?.[0]
    expect(callArg?.specialMissionId).toBe('jovian-prospection-hektor-photometry')
    expect(callArg?.pinnedAssetRef).toBe('hektor')
    expect(callArg?.region).toBe('jovian-trojans')
    spy.mockRestore()
  })

  it('emits specialMissionId without pinnedAssetRef for a non-pinned special mission', () => {
    const mission: GeneratedAsteroidMission = {
      ...BASE_MISSION,
      kind: 'special',
      id: 'jovian-prospection-saturn-photometry',
      asteroidId: 'asset-2306-s',
      region: 'saturn-trojans',
      objectives: [{ type: 'photometry', x: 0, z: 0 }],
    } as GeneratedAsteroidMission
    localStorage.setItem(ACTIVE_MISSION_KEY, JSON.stringify(mission))
    const spy = vi.spyOn(contractSystem, 'notifyMissionCompleted')
    persistCompletedAsteroidMissionRewards(mission, 1)
    const callArg = spy.mock.calls[0]?.[0]
    expect(callArg?.specialMissionId).toBe('jovian-prospection-saturn-photometry')
    expect(callArg?.pinnedAssetRef).toBeUndefined()
    expect(callArg?.region).toBe('saturn-trojans')
    spy.mockRestore()
  })

  it('emits region but no specialMissionId for non-special asteroid missions', () => {
    const mission: GeneratedAsteroidMission = {
      ...BASE_MISSION,
      id: 'standard-mission-1',
      region: 'near-earth',
      objectives: [{ type: 'gather', x: 0, z: 0 }],
    }
    localStorage.setItem(ACTIVE_MISSION_KEY, JSON.stringify(mission))
    const spy = vi.spyOn(contractSystem, 'notifyMissionCompleted')
    persistCompletedAsteroidMissionRewards(mission, 1)
    const callArg = spy.mock.calls[0]?.[0]
    expect(callArg?.specialMissionId).toBeUndefined()
    expect(callArg?.pinnedAssetRef).toBeUndefined()
    expect(callArg?.region).toBe('near-earth')
    spy.mockRestore()
  })
```

- [ ] **Step 4: Run tests**

Run: `bun test:unit src/lib/missions/__tests__/asteroidMissionRewards.spec.ts`
Expected: all pass (existing + 3 new).

`bun run type-check` must also pass — the cast `as GeneratedAsteroidMission` covers any type-strictness on the partial fixture.

- [ ] **Step 5: Commit**

```bash
git add src/lib/missions/asteroidMissionRewards.ts src/lib/missions/__tests__/asteroidMissionRewards.spec.ts
git commit -m "feat(missions): emit specialMissionId/pinnedAssetRef/region on asteroid completion"
```

---

## Task 7: `onStepActivated` hook + `revealsBody` dispatch

**Files:**
- Modify: `src/lib/contracts/ContractSystem.ts`
- Modify: `src/lib/contracts/runtime.ts`
- Modify: `src/lib/contracts/__tests__/ContractSystem.spec.ts`

Add a hook that fires when a step transitions from "not current" to "current" (both at `acceptContract` for step 0 and at every `advanceStep` for the next step). The hook payload carries the contract id, step index, `specialMissionId`, and `revealsBody`. Runtime listens and dispatches the body-access flip; map view will subscribe in Task 8.

- [ ] **Step 1: Add the payload + hook to `ContractSystem`**

In `src/lib/contracts/ContractSystem.ts`, near `ChoiceOutcomeResolvedPayload`, add:

```ts
/** Payload for {@link ContractSystemHooks.onStepActivated}. */
export interface ContractStepActivatedPayload {
  /** Contract whose step just became current. */
  contractId: string
  /** Step index that just activated. */
  stepIndex: number
  /** When set, runtime should auto-activate this special mission. */
  specialMissionId: string | null
  /** When set, runtime should call `setBodyAccess(profile, body, 'unrestricted')`. */
  revealsBody: string | null
}
```

Add to `ContractSystemHooks` interface (near `onChoiceOutcomeResolved`):

```ts
  /**
   * Called when a contract step transitions from "not current" to "current"
   * (both at acceptance for step 0 and on every advance for the next step).
   * Receivers handle side effects — auto-activating special missions, flipping
   * `bodyAccess` for `revealsBody` steps, etc.
   *
   * @param payload - Contract id, step index, and the activation directives
   *   from the step (`specialMissionId`, `revealsBody`).
   */
  onStepActivated?: (payload: ContractStepActivatedPayload) => void
```

- [ ] **Step 2: Fire the hook from `acceptContract` and `advanceStep`**

In `acceptContract`, find the block that delivers the first step's flavor message:

```ts
this.deliverBriefMessage(contract)
this.deliverStepMessage(contract, 0)
this.evaluatePassiveCurrentStep(contract)
```

Just before `this.deliverStepMessage(contract, 0)`, add a call to a new private helper `notifyStepActivated`:

```ts
this.deliverBriefMessage(contract)
this.notifyStepActivated(contract, 0)
this.deliverStepMessage(contract, 0)
this.evaluatePassiveCurrentStep(contract)
```

In `advanceStep`, find the branch where the step advances (`updated = { ...updated, currentStepIndex: nextIndex }`). After the snapshot mutation and before `this.deliverStepMessage(contract, nextIndex)`, add:

```ts
this.notifyStepActivated(contract, nextIndex)
this.deliverStepMessage(contract, nextIndex)
this.evaluatePassiveCurrentStep(contract)
```

Add the private helper near the other private methods:

```ts
  /**
   * Fire the `onStepActivated` hook for the step at `stepIndex`. Reads the
   * step's `specialMissionId` and `revealsBody` to populate the payload. Only
   * fires for `'complete-missions'` and `'choice-mission'` steps; passive
   * steps (`install-upgrade`, `visit-planet`) don't have these activation
   * directives.
   *
   * @param contract - Contract whose step just became current.
   * @param stepIndex - Index of the activated step.
   */
  private notifyStepActivated(contract: Contract, stepIndex: number): void {
    const step = contract.steps[stepIndex]
    if (!step) return
    let specialMissionId: string | null = null
    let revealsBody: string | null = null
    if (step.kind === 'complete-missions') {
      specialMissionId = step.specialMissionId ?? null
      revealsBody = step.revealsBody ?? null
    }
    this.hooks.onStepActivated?.({
      contractId: contract.id,
      stepIndex,
      specialMissionId,
      revealsBody,
    })
  }
```

- [ ] **Step 3: Wire the hook in `runtime.ts`**

In `src/lib/contracts/runtime.ts`, near the existing listener Sets at the top, add a new listener Set:

```ts
/** Subscribers notified when a contract step transitions to current. */
const contractStepActivatedListeners = new Set<(payload: ContractStepActivatedPayload) => void>()
```

Add the import for the type:

```ts
import {
  ContractSystem,
  type ContractStepCompletedPayload,
  type ContractStepActivatedPayload,
} from './ContractSystem'
```

In the `new ContractSystem(...)` hook block, add an `onStepActivated` entry adjacent to `onContractStepCompleted`:

```ts
  onStepActivated: (payload) => {
    if (payload.revealsBody) {
      const profile = loadProfile()
      if (profile) {
        saveProfile(setBodyAccess(profile, payload.revealsBody, 'unrestricted'))
      }
    }
    for (const listener of Array.from(contractStepActivatedListeners)) {
      try {
        listener(payload)
      } catch {
        // listeners must not break the system
      }
    }
  },
```

`setBodyAccess` is already imported (added in plan 2). If not, add to the imports from `'@/lib/player/profile'`.

Add a public subscribe function near the other subscription exports:

```ts
/**
 * Subscribe to "a contract step just transitioned to current". Receivers
 * typically auto-activate special missions, refresh active-mission UI, etc.
 *
 * @param listener - Receives the activation payload.
 * @returns Unsubscribe function.
 */
export function onContractStepActivated(
  listener: (payload: ContractStepActivatedPayload) => void,
): () => void {
  contractStepActivatedListeners.add(listener)
  return () => contractStepActivatedListeners.delete(listener)
}
```

- [ ] **Step 4: Add tests**

In `src/lib/contracts/__tests__/ContractSystem.spec.ts`, append:

```ts
describe('onStepActivated hook', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key]
  })

  it('fires when a contract is accepted (step 0)', () => {
    const c: Contract = {
      id: 'sa-accept',
      inboxName: 'SA',
      from: 't',
      sentAt: TEST_DATE,
      introSubject: 'SA',
      introBody: ['s'],
      steps: [
        {
          kind: 'complete-missions',
          count: 1,
          missionType: 'asteroid',
          specialMissionId: 'jovian-prospection-hektor-photometry',
          revealsBody: 'hektor',
          subject: 's',
          flavor: ['f'],
        },
      ],
      completionSubject: 'd',
      completionBody: ['d'],
      rewards: [],
    }
    const messages = new MessageSystem(emptyMessageStore())
    const events: ContractStepActivatedPayload[] = []
    const contracts = new ContractSystem([c], messages, inMemoryPersistence(), {
      onStepActivated: (p) => events.push(p),
    })
    contracts.resetForTests()
    contracts.offerForTests('sa-accept')
    contracts.acceptContract('sa-accept')
    expect(events).toHaveLength(1)
    expect(events[0]?.stepIndex).toBe(0)
    expect(events[0]?.specialMissionId).toBe('jovian-prospection-hektor-photometry')
    expect(events[0]?.revealsBody).toBe('hektor')
  })

  it('fires when a step advances (step 1)', () => {
    const c: Contract = {
      id: 'sa-advance',
      inboxName: 'SA',
      from: 't',
      sentAt: TEST_DATE,
      introSubject: 'SA',
      introBody: ['s'],
      steps: [
        {
          kind: 'complete-missions',
          count: 1,
          missionType: 'asteroid',
          subject: 's0',
          flavor: ['f'],
        },
        {
          kind: 'complete-missions',
          count: 1,
          missionType: 'asteroid',
          specialMissionId: 'jovian-prospection-hektor-dan',
          subject: 's1',
          flavor: ['f'],
        },
      ],
      completionSubject: 'd',
      completionBody: ['d'],
      rewards: [],
    }
    const messages = new MessageSystem(emptyMessageStore())
    const events: ContractStepActivatedPayload[] = []
    const contracts = new ContractSystem([c], messages, inMemoryPersistence(), {
      onStepActivated: (p) => events.push(p),
    })
    contracts.resetForTests()
    contracts.offerForTests('sa-advance')
    contracts.acceptContract('sa-advance')
    contracts.notifyMissionCompleted({
      kind: 'asteroid',
      giverPlanetId: null,
      giverId: null,
      targetPlanetId: null,
    })
    // First fire was step 0 at accept; second fire is step 1 after advance.
    expect(events.map((e) => e.stepIndex)).toEqual([0, 1])
    expect(events[1]?.specialMissionId).toBe('jovian-prospection-hektor-dan')
    expect(events[1]?.revealsBody).toBeNull()
  })

  it('emits null specialMissionId / revealsBody for vanilla steps', () => {
    const c: Contract = {
      id: 'sa-vanilla',
      inboxName: 'SA',
      from: 't',
      sentAt: TEST_DATE,
      introSubject: 'SA',
      introBody: ['s'],
      steps: [
        {
          kind: 'complete-missions',
          count: 1,
          missionType: 'asteroid',
          subject: 's',
          flavor: ['f'],
        },
      ],
      completionSubject: 'd',
      completionBody: ['d'],
      rewards: [],
    }
    const messages = new MessageSystem(emptyMessageStore())
    const events: ContractStepActivatedPayload[] = []
    const contracts = new ContractSystem([c], messages, inMemoryPersistence(), {
      onStepActivated: (p) => events.push(p),
    })
    contracts.resetForTests()
    contracts.offerForTests('sa-vanilla')
    contracts.acceptContract('sa-vanilla')
    expect(events).toHaveLength(1)
    expect(events[0]?.specialMissionId).toBeNull()
    expect(events[0]?.revealsBody).toBeNull()
  })
})
```

Add the import at the top of the test file if missing:

```ts
import type { ContractStepActivatedPayload } from '../ContractSystem'
```

- [ ] **Step 5: Run tests**

Run: `bun test:unit src/lib/contracts/__tests__/ContractSystem.spec.ts`
Expected: 3 new tests pass plus existing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/contracts/
git commit -m "feat(contracts): add onStepActivated hook and revealsBody dispatch"
```

---

## Task 8: MapViewController auto-activates special missions

**Files:**
- Modify: `src/views/MapViewController.ts`

Refactor the existing `stageConsortiumCertification` to a generic helper `stageSpecialMission(missionId, offerMessageId)`. Subscribe to `onContractStepActivated` from `runtime.ts`. When a step's `specialMissionId` is set, look up the canonical offer message id and call the helper.

- [ ] **Step 1: Read the existing `stageConsortiumCertification`**

Already loaded — `MapViewController.ts:3947-3968`. The pattern: (1) `getSpecialMissionById(id)`, (2) `messageFacade.enqueueById(offerMessageId, this.onMessageUpdate)`, (3) build `acceptedMission` with `status: 'accepted'`, (4) write to `this.missionBoard`, (5) `saveActiveMission(acceptedMission)` + `saveMissionBoard(this.missionBoard)`, (6) `this.onMissionBoardUpdate?.(this.missionBoard)`.

- [ ] **Step 2: Extract the generic helper**

In `MapViewController.ts`, replace the existing `private stageConsortiumCertification(): void { ... }` method with a generic helper plus a thin call site. The generic helper:

```ts
  /**
   * Stage a special mission as the active asteroid mission and enqueue its
   * offer message into the relevant inbox folder. Idempotent on the active
   * mission slot — overwrites any existing offered/active asteroid mission
   * for the just-staged id, but does not re-stage if the same special mission
   * is already active (caller checks).
   *
   * @param missionId - Special mission id from `SPECIAL_MISSIONS`.
   * @param offerMessageId - Message id from the catalog enqueued before staging.
   */
  private stageSpecialMission(missionId: string, offerMessageId: string): void {
    const mission = getSpecialMissionById(missionId)
    if (!mission) {
      console.warn(`[MapView] Special mission not found: ${missionId}`)
      return
    }

    this.messageFacade.enqueueById(offerMessageId, this.onMessageUpdate)

    const acceptedMission: GeneratedAsteroidMission = {
      ...mission,
      status: 'accepted',
    }
    this.missionBoard = {
      ...this.missionBoard,
      offeredAsteroidMission: null,
      activeAsteroidMission: acceptedMission,
    }
    saveActiveMission(acceptedMission)
    saveMissionBoard(this.missionBoard)
    this.onMissionBoardUpdate?.(this.missionBoard)
  }

  /** Stage the Act 1 climax Consortium Certification mission. */
  private stageConsortiumCertification(): void {
    this.stageSpecialMission('consortium-certification', 'consortium-certification-offer')
  }
```

- [ ] **Step 3: Add the offer-id lookup map**

Add a constant near the top of `MapViewController.ts` (or a sibling file `src/lib/missions/specialMissionOffers.ts` if the implementer prefers to extract it):

```ts
/** Special mission id → offer-message id used for auto-staging. */
const SPECIAL_MISSION_OFFER_IDS: Record<string, string> = {
  'consortium-certification': 'consortium-certification-offer',
  'jovian-prospection-hektor-photometry': 'jovian-prospection-hektor-photometry-offer',
  'jovian-prospection-hektor-dan': 'jovian-prospection-hektor-dan-offer',
  'jovian-prospection-saturn-photometry': 'jovian-prospection-saturn-photometry-offer',
  'jovian-prospection-saturn-dan': 'jovian-prospection-saturn-dan-offer',
}
```

(If the implementer chooses to keep this list in `messageCatalog.ts` or `specialMissions.ts` for proximity to the messages/missions themselves, that's fine — pick whichever placement reads better.)

- [ ] **Step 4: Subscribe to `onContractStepActivated`**

Add the import at the top of `MapViewController.ts`:

```ts
import { onContractStepActivated } from '@/lib/contracts/runtime'
```

In the controller's constructor or init method (search for where `contractSystem.listInstances()` is called or where other contract subscriptions happen — the journey-trigger replay path is a likely spot), add:

```ts
this.disposers.push(
  onContractStepActivated((payload) => this.handleContractStepActivated(payload)),
)
```

(`this.disposers` is the existing pattern this controller uses for unsubscribing on dispose. If it's named differently, follow the existing pattern. Search for `Set<() => void>` or similar.)

Add the handler method:

```ts
  /**
   * Auto-stage a special mission when a contract step that carries
   * `specialMissionId` becomes the current step. Idempotent: skips if the
   * same special mission is already the active asteroid mission, on the
   * board, or persisted from a prior session.
   *
   * @param payload - The activation payload from `ContractSystem`.
   */
  private handleContractStepActivated(payload: ContractStepActivatedPayload): void {
    const missionId = payload.specialMissionId
    if (!missionId) return

    const offerMessageId = SPECIAL_MISSION_OFFER_IDS[missionId]
    if (!offerMessageId) {
      console.warn(`[MapView] No offer-message id for special mission: ${missionId}`)
      return
    }

    const activeId = this.missionBoard.activeAsteroidMission?.id
    if (activeId === missionId) return
    const stored = loadActiveMission()
    if (stored?.id === missionId) return

    this.stageSpecialMission(missionId, offerMessageId)
  }
```

Add the `ContractStepActivatedPayload` import:

```ts
import type { ContractStepActivatedPayload } from '@/lib/contracts/ContractSystem'
```

- [ ] **Step 5: Verify**

Run: `bun run type-check && bun run lint && bun test:unit`

Expected: type-check + lint pass. Tests pass except possibly `jovian-contract.spec.ts`, which Task 9 fixes.

- [ ] **Step 6: Commit**

```bash
git add src/views/MapViewController.ts
git commit -m "feat(map): auto-stage Jovian special missions on contract step activation"
```

---

## Task 9: Update Jovian contract JSON + test fixtures

**Files:**
- Modify: `src/data/contracts/jovian-society-prospection.json`
- Modify: `src/lib/contracts/__tests__/jovian-contract.spec.ts`

Steps 4, 5, 7, 8 of the Jovian contract get a `specialMissionId`. Step 4 also gets `revealsBody: 'hektor'`. The `objectiveType` and `pinnedAssetRef` fields on those steps become redundant once `specialMissionId` is set (the special mission is one fixed thing — the broad filters are no longer load-bearing). Drop them per the spec.

- [ ] **Step 1: Edit the contract JSON**

In `src/data/contracts/jovian-society-prospection.json`:

### Step 4 (OP 4)

Currently has `objectiveType: 'photometry'`, `pinnedAssetRef: 'hektor'`. Replace those with:

```json
      "specialMissionId": "jovian-prospection-hektor-photometry",
      "revealsBody": "hektor",
```

(Keep `kind`, `count`, `missionType: "asteroid"`, `giverId: "jovian-society"`, `creditsReward`, `subject`, `flavor`. The other filter fields go away.)

### Step 5 (OP 5)

Currently has `objectiveType: 'photometry'`, `targetRegion: 'saturn-trojans'`. Replace with:

```json
      "specialMissionId": "jovian-prospection-saturn-photometry",
```

### Step 7 (OP 7)

Currently has `objectiveType: 'dan'`, `pinnedAssetRef: 'hektor'`. Replace with:

```json
      "specialMissionId": "jovian-prospection-hektor-dan",
```

(No `revealsBody` — Hektor is already revealed by Step 4.)

### Step 8 (OP 8)

Currently has `objectiveType: 'dan'`, `targetRegion: 'saturn-trojans'`. Replace with:

```json
      "specialMissionId": "jovian-prospection-saturn-dan",
```

### Optional: drop `pinnedAssets`

The contract's `pinnedAssets` array is no longer load-bearing for Step matching (each special mission carries its own asset id). Per the spec, dropping it is fine — but keep it if you want the inbox-flavor "Asset 2306-J" label to source from the contract. Recommended: **keep it**, the engine ignores unused fields and inbox UI may still reference it.

- [ ] **Step 2: Update Jovian test fixtures**

In `src/lib/contracts/__tests__/jovian-contract.spec.ts`, the `driveToChoice` helper currently fires `asteroidPhotometry` / `asteroidDan` events for steps 4, 5, 7, 8. After this task, those steps filter on `specialMissionId`, so the events must include the specific special-mission id.

Add four new typed event constants near the existing fixtures:

```ts
const hektorPhotometryEvent: MissionCompletedEvent = {
  kind: 'asteroid',
  giverPlanetId: null,
  giverId: 'jovian-society',
  targetPlanetId: null,
  objectiveType: 'photometry',
  region: 'jovian-trojans',
  pinnedAssetRef: 'hektor',
  specialMissionId: 'jovian-prospection-hektor-photometry',
}

const saturnPhotometryEvent: MissionCompletedEvent = {
  kind: 'asteroid',
  giverPlanetId: null,
  giverId: 'jovian-society',
  targetPlanetId: null,
  objectiveType: 'photometry',
  region: 'saturn-trojans',
  specialMissionId: 'jovian-prospection-saturn-photometry',
}

const hektorDanEvent: MissionCompletedEvent = {
  kind: 'asteroid',
  giverPlanetId: null,
  giverId: 'jovian-society',
  targetPlanetId: null,
  objectiveType: 'dan',
  region: 'jovian-trojans',
  pinnedAssetRef: 'hektor',
  specialMissionId: 'jovian-prospection-hektor-dan',
}

const saturnDanEvent: MissionCompletedEvent = {
  kind: 'asteroid',
  giverPlanetId: null,
  giverId: 'jovian-society',
  targetPlanetId: null,
  objectiveType: 'dan',
  region: 'saturn-trojans',
  specialMissionId: 'jovian-prospection-saturn-dan',
}
```

(The plan-3 `asteroidPhotometry` / `asteroidDan` constants can stay — they're unused after this edit, the implementer can leave or remove. Removing is cleaner.)

Update `driveToChoice` to use the new typed events for steps 4, 5, 7, 8:

```ts
  function driveToChoice(contracts: ContractSystem) {
    // Step 1 (OP 1): asteroid + gather
    contracts.notifyMissionCompleted(asteroidGather)
    // Step 2 (OP 2): mining + Jupiter board
    contracts.notifyMissionCompleted(mining)
    // Step 3 (OP 3): collect-drops 3 viroid-psychosphere
    for (let i = 0; i < 3; i++) {
      contracts.notifyDropCollected({ itemId: 'viroid-psychosphere', quantity: 1 })
    }
    // Step 4 (OP 4): special mission, Hektor photometry
    contracts.notifyMissionCompleted(hektorPhotometryEvent)
    // Step 5 (OP 5): special mission, Saturn photometry
    contracts.notifyMissionCompleted(saturnPhotometryEvent)
    // Step 6 (OP 6): collect-drops 8
    for (let i = 0; i < 8; i++) {
      contracts.notifyDropCollected({ itemId: 'viroid-psychosphere', quantity: 1 })
    }
    // Step 7 (OP 7): special mission, Hektor DAN
    contracts.notifyMissionCompleted(hektorDanEvent)
    // Step 8 (OP 8): special mission, Saturn DAN
    contracts.notifyMissionCompleted(saturnDanEvent)
  }
```

- [ ] **Step 3: Run tests**

Run: `bun test:unit src/lib/contracts/__tests__/`
Expected: all tests pass — Jovian walkability now drives through the tightened filters.

Run: `bun test:unit` (full suite)
Expected: full green.

- [ ] **Step 4: Commit**

```bash
git add src/data/contracts/jovian-society-prospection.json src/lib/contracts/__tests__/jovian-contract.spec.ts
git commit -m "feat(contracts): wire Jovian Steps 4/5/7/8 to special missions and reveal hektor on Step 4"
```

---

## Task 10: Acceptance gate

- [ ] **Step 1: Type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 2: Lint**

Run: `bun run lint`
Expected: oxlint 0 errors, ESLint 0 errors / 0 warnings, 33 shaders pass.

If TSDoc warnings appear on new exports (the offer messages, `ContractStepActivatedPayload`, helpers), fix in place.

- [ ] **Step 3: Full unit suite**

Run: `bun test:unit`
Expected: full green.

- [ ] **Step 4: Manual — Step 4 activation (optional, dev verify)**

`bun dev`. From a fresh save: complete Marines, orbit Jupiter, accept Jovian, drive Steps 1-3 (asteroid gather + mining + 3 psychosphere). At Step 4 activation:

- Inbox gains the OP-4 step flavor message + the `jovian-prospection-hektor-photometry-offer` message in the Jovian Society folder
- Map shows Hektor at L4 (newly visible)
- Active mission HUD points at Hektor with the OP-4 mission card

Fly + complete photometry → Step 4 closes, Step 5 activates with the Saturn photometry waypoint on Asset 2306-S.

- [ ] **Step 5: Manual — Steps 7 + 8 (optional)**

After Step 5 closes and Step 6 (psychosphere ×8) is completed, Step 7 should auto-activate with Hektor DAN, then Step 8 with Saturn DAN.

- [ ] **Step 6: Manual — regression on Consortium Certification**

Verify the Act 1 Consortium Certification mission still stages at the right moment (after all three inner-system contracts complete, before gravity surfing is installed). The refactored `stageSpecialMission` helper should preserve its behavior.

- [ ] **Step 7: Final cleanup commit if anything dirty**

```bash
git status
# only if needed:
git add -A
git commit -m "chore(contracts): plan-4 final cleanup"
```

---

## Notes for the implementer

- **`onStepActivated` fires twice on the first step.** When the contract is accepted, step 0 becomes current and `notifyStepActivated(contract, 0)` fires. Then `evaluatePassiveCurrentStep` may auto-snap an `install-upgrade` or `visit-planet` step that's already satisfied, which calls `advanceStep` → which calls `notifyStepActivated(contract, 1)`. This is correct — every step that becomes current fires the hook exactly once.
- **`revealsBody` is a one-way assertion to `'unrestricted'`.** It does not override `'destroyed'` or `'liberated'` (plan 7 end-states). The current implementation just calls `setBodyAccess(profile, body, 'unrestricted')` unconditionally — which is fine because end-states are only reached at contract completion, after which the contract's steps no longer fire activation hooks. If a future system replays step activation post-completion, add an end-state guard.
- **Special mission staging is idempotent.** `MapViewController.handleContractStepActivated` checks both the live `activeAsteroidMission` and `loadActiveMission()` before re-staging. Reload-safe.
- **Offer messages use `priority: 80`** matching the contract message convention. They land in the contract folder (`folderId: 'jovian-society-prospection'`).
- **Saturn co-orbital region.** `region: 'saturn-trojans'` is consumed by the matcher's `targetRegion` filter. `MissionRegion` may need a new entry — check `src/lib/missions/types.ts` for the type. If `'saturn-trojans'` isn't a valid `MissionRegion`, add it to the union (similar to plan 3 expanding `objectiveType`).
- **Waypoints are pre-baked at `(0, 0)`**. The runtime maps `asteroidId → body position` at activation; if the consortium pattern uses fixed waypoints from the JSON, the implementer adapts the special-mission JSONs to point at the actual orbital positions. Confirm by tracing how the consortium mission's waypoint reaches the map.
