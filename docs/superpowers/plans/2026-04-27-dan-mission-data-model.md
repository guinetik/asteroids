# DAN Mission Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the first implementation slice for DAN missions: make `dan` a valid asteroid objective type, make Jovian Trojan region data type-check honestly, add Jovian Society and Cinderline DAN templates, and prove the generator can roll or force a DAN mission. Do not wire level gameplay, VFX, HUD, particles, terminals, or enemies in this slice.

**Spec:** `docs/superpowers/specs/2026-04-27-dan-mission-design.md`

**Architecture:** This is a data/model pass inside `src/lib/missions/` and `src/data/missions/`. The generator should produce concrete DAN objectives with all timing and pressure fields populated. Level runtime can still ignore `dan` until the later gameplay slice.

**Acceptance Criteria:**
- `ObjectiveType` includes `'dan'`.
- `MissionRegion` includes `'jovian-trojans'`.
- `ScalableParams` includes `DanScalableParams`.
- `ConcreteObjective` can carry DAN scan duration, required hit count, grace window, particle tier, and enemy tier.
- `rollObjective()` returns a concrete `dan` objective from a DAN slot.
- `generateAsteroidMission(..., requiredObjectiveType: 'dan')` can produce a Jovian Society DAN mission across the intended difficulty band.
- Jovian Society mission data includes both photometry and DAN offerings with corporate cross-talk euphemism copy.
- Cinderline mission data exists, is imported by the giver catalog, and includes liturgical DAN offerings.
- Targeted mission tests pass.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/missions/types.ts` | Modify | Add `dan`, `jovian-trojans`, DAN params, concrete DAN fields |
| `src/lib/missions/asteroidMissionGenerator.ts` | Modify | Roll concrete DAN values |
| `src/data/missions/givers/jovian-society.json` | Modify | Add DAN objective type and Jovian DAN templates |
| `src/data/missions/givers/cinderline.json` | Add | Add Cinderline DAN giver and templates |
| `src/lib/missions/giverCatalog.ts` | Modify | Import and register Cinderline giver data |
| `src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts` | Modify | Add DAN roll/generation coverage |
| `docs/superpowers/specs/2026-04-27-dan-mission-design.md` | Reference only | Keep implementation aligned with the DAN spec |

---

## Task 1: Type The DAN Objective

- [ ] **Step 1: Update `ObjectiveType`**

In `src/lib/missions/types.ts`, add `'dan'` to the `ObjectiveType` union immediately after `'photometry'`.

- [ ] **Step 2: Update `MissionRegion`**

Add `'jovian-trojans'` to the `MissionRegion` union. Existing Jovian Society data already uses this key, and tests already treat it as a valid runtime region. This change makes the type model match authored data.

- [ ] **Step 3: Add pressure tier type**

Add a small type alias near the objective params:

```ts
/** Difficulty bucket for DAN particle and enemy pressure. */
export type DanPressureTier = 'low' | 'medium' | 'high'
```

- [ ] **Step 4: Add `DanScalableParams`**

Add the interface after `PhotometryScalableParams`:

```ts
/** Scalable params for DAN subsurface survey objectives. */
export interface DanScalableParams {
  /** Discriminator for the union type. */
  type: 'dan'
  /** Active scan duration, in seconds. */
  scanDurationSeconds: NumberRange
  /** Particle hits required to complete the scan. */
  requiredParticleHits: NumberRange
  /** Seconds before viroid pressure starts after scan activation. */
  enemyGraceSeconds: NumberRange
  /** Particle pressure preset for the later runtime DAN system. */
  particleTier: DanPressureTier
  /** Enemy pressure preset for the later runtime DAN system. */
  enemyTier: DanPressureTier
}
```

- [ ] **Step 5: Extend `ScalableParams`**

Add `DanScalableParams` to the `ScalableParams` union.

- [ ] **Step 6: Extend `ConcreteObjective`**

Add optional DAN fields after the photometry fields:

```ts
/** For DAN: active scan duration, in seconds. */
scanDurationSeconds?: number
/** For DAN: particle hits needed to complete the scan. */
requiredParticleHits?: number
/** For DAN: seconds before viroid spawns begin. */
enemyGraceSeconds?: number
/** For DAN: particle pressure preset. */
particleTier?: DanPressureTier
/** For DAN: enemy pressure preset. */
enemyTier?: DanPressureTier
```

---

## Task 2: Roll Concrete DAN Objectives

- [ ] **Step 1: Add generator branch**

In `src/lib/missions/asteroidMissionGenerator.ts`, add a `case 'dan'` branch in `rollObjective()` after `photometry`:

```ts
case 'dan':
  return {
    type: 'dan',
    x: 0,
    z: 0,
    scanDurationSeconds: interpolateRange(slot.params.scanDurationSeconds, difficulty),
    requiredParticleHits: interpolateRange(slot.params.requiredParticleHits, difficulty),
    enemyGraceSeconds: interpolateRange(slot.params.enemyGraceSeconds, difficulty),
    particleTier: slot.params.particleTier,
    enemyTier: slot.params.enemyTier,
    reward,
  }
```

Do not add level behavior here. A rolled DAN objective is inert until the later runtime slice consumes these fields.

- [ ] **Step 2: Keep interpolation simple**

Use the generic `interpolateRange()` for this first pass. Do not create DAN-specific interpolation unless playtesting shows a need. The authored min/max values can be equal for fixed durations.

---

## Task 3: Author Faction DAN Templates

- [ ] **Step 1: Advertise DAN**

In `src/data/missions/givers/jovian-society.json`, update:

```json
"objectiveTypes": ["photometry", "dan"]
```

- [ ] **Step 2: Add medium-tier Jovian DAN template**

Append a mission entry after `jovian_prelim_eval` or before `jovian_phase_two_scan`:

```json
{
  "id": "jovian_subsurface_pass",
  "name": "Subsurface Verification Pass",
  "briefing": "Per current portfolio review, this asset has cleared preliminary photometric screening. Next step is DAN: Dynamic Albedo of Neutrons, with emphasis on buried volatiles and lattice traces relevant to neutron-thruster production. Kindly capture clean return particles and disregard any sensor cross-talk inside the instrumentation envelope. Warm regards, Vance Hoyt.",
  "objectiveSlots": [
    {
      "type": "dan",
      "weight": 1.0,
      "params": {
        "type": "dan",
        "scanDurationSeconds": { "min": 45, "max": 45 },
        "requiredParticleHits": { "min": 40, "max": 55 },
        "enemyGraceSeconds": { "min": 10, "max": 8 },
        "particleTier": "medium",
        "enemyTier": "medium"
      },
      "reward": { "min": 3000, "max": 6500 }
    }
  ],
  "completionBonus": { "min": 500, "max": 1500 },
  "regionByDifficulty": { "jovian-trojans": [4, 7] }
}
```

- [ ] **Step 3: Add high-tier Jovian DAN template**

Append:

```json
{
  "id": "jovian_extraction_grade_dan",
  "name": "Extraction-Grade DAN Survey",
  "briefing": "Stakeholders require extraction-grade subsurface confidence before this body advances. Run a full Dynamic Albedo of Neutrons pass and classify any lattice-positive bands against the Phobos reference family. Please advise if elevated ambient disturbance compromises telemetry quality; otherwise continue the pass unless the hull is compromised. Warm regards, Vance Hoyt.",
  "objectiveSlots": [
    {
      "type": "dan",
      "weight": 1.0,
      "params": {
        "type": "dan",
        "scanDurationSeconds": { "min": 45, "max": 45 },
        "requiredParticleHits": { "min": 55, "max": 65 },
        "enemyGraceSeconds": { "min": 9, "max": 6 },
        "particleTier": "high",
        "enemyTier": "high"
      },
      "reward": { "min": 5000, "max": 9000 }
    }
  ],
  "completionBonus": { "min": 1500, "max": 2500 },
  "regionByDifficulty": { "jovian-trojans": [8, 10] }
}
```

- [ ] **Step 4: Add Cinderline giver data**

Create `src/data/missions/givers/cinderline.json`:

```json
{
  "id": "cinderline",
  "name": "The Cinderline",
  "title": "At The Anvil",
  "objectiveTypes": ["dan"],
  "minDifficulty": 4,
  "maxDifficulty": 10,
  "missions": [
    {
      "id": "cinderline_first_listening",
      "name": "The First Listening",
      "briefing": "Pilot, the body has been listened to before from a distance. It is time to listen again. Set the pulse into the regolith and gather what reply the stone chooses to give. Hold your vigil until the answer is complete. A seat will be kept.",
      "objectiveSlots": [
        {
          "type": "dan",
          "weight": 1,
          "params": {
            "type": "dan",
            "scanDurationSeconds": { "min": 45, "max": 45 },
            "requiredParticleHits": { "min": 40, "max": 55 },
            "enemyGraceSeconds": { "min": 10, "max": 8 },
            "particleTier": "medium",
            "enemyTier": "medium"
          },
          "reward": { "min": 3000, "max": 6500 }
        }
      ],
      "completionBonus": { "min": 500, "max": 1500 },
      "regionByDifficulty": { "jovian-trojans": [4, 7] }
    },
    {
      "id": "cinderline_vigil_threshold",
      "name": "Vigil at the Threshold",
      "briefing": "Pilot, this body is close to waking without our call. We do not require speed. We require attention. What replies will reply; meet it with restraint, and withdraw cleanly when the listening is done. Walk in the light.",
      "objectiveSlots": [
        {
          "type": "dan",
          "weight": 1,
          "params": {
            "type": "dan",
            "scanDurationSeconds": { "min": 45, "max": 45 },
            "requiredParticleHits": { "min": 55, "max": 65 },
            "enemyGraceSeconds": { "min": 9, "max": 6 },
            "particleTier": "high",
            "enemyTier": "high"
          },
          "reward": { "min": 5000, "max": 9000 }
        }
      ],
      "completionBonus": { "min": 1500, "max": 2500 },
      "regionByDifficulty": { "jovian-trojans": [8, 10] }
    }
  ]
}
```

- [ ] **Step 5: Register Cinderline**

In `src/lib/missions/giverCatalog.ts`, import `cinderline.json` and include it in `MISSION_GIVERS`.

- [ ] **Step 6: Validate JSON**

Use the editor or `bun` tests to catch malformed commas. Do not introduce comments into JSON.

---

## Task 4: Add Generator Tests

- [ ] **Step 1: Add `rollObjective` DAN test**

In `src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts`, add a test near the photometry tests:

```ts
it('rolls DAN objective with concrete scan values', () => {
  const slot = {
    type: 'dan' as const,
    weight: 1,
    params: {
      type: 'dan' as const,
      scanDurationSeconds: { min: 45, max: 45 },
      requiredParticleHits: { min: 40, max: 55 },
      enemyGraceSeconds: { min: 10, max: 8 },
      particleTier: 'medium' as const,
      enemyTier: 'medium' as const,
    },
    reward: { min: 3000, max: 6500 },
  }

  const obj = rollObjective(slot, 5)

  expect(obj.type).toBe('dan')
  expect(obj.scanDurationSeconds).toBe(45)
  expect(obj.requiredParticleHits).toBeGreaterThanOrEqual(40)
  expect(obj.requiredParticleHits).toBeLessThanOrEqual(55)
  expect(obj.enemyGraceSeconds).toBeGreaterThanOrEqual(8)
  expect(obj.enemyGraceSeconds).toBeLessThanOrEqual(10)
  expect(obj.particleTier).toBe('medium')
  expect(obj.enemyTier).toBe('medium')
})
```

- [ ] **Step 2: Add forced DAN generation test**

Add near the forced photometry tests:

```ts
it('can force a DAN mission for DAN-capable contracts', () => {
  const mission = generateAsteroidMission(6, null, () => 0, 'dan')

  expect(['jovian-society', 'cinderline']).toContain(mission.giverId)
  expect(mission.region).toBe('jovian-trojans')
  expect(mission.objectives.some((objective) => objective.type === 'dan')).toBe(true)
})
```

- [ ] **Step 3: Add full-band forced DAN test**

```ts
it('can force DAN across its authored difficulty band', () => {
  for (const difficulty of [4, 7, 8, 10]) {
    const mission = generateAsteroidMission(difficulty, null, () => 0, 'dan')

    expect(['jovian-society', 'cinderline']).toContain(mission.giverId)
    expect(mission.difficulty).toBe(difficulty)
    expect(mission.objectives.some((objective) => objective.type === 'dan')).toBe(true)
  }
})
```

If difficulty 4 or 7 ever picks the photometry template first because of candidate ordering, keep the `requiredObjectiveType` sort behavior intact; it already prioritizes matching slots before slicing objectives.

---

## Task 5: Verify

- [ ] **Step 1: Run targeted mission tests**

```bash
bun test:unit src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts --run
```

Expected: all tests pass.

- [ ] **Step 2: Run type-check**

```bash
bun run type-check
```

Expected: no TypeScript errors. Pay particular attention to `MissionRegion` and JSON import typing.

- [ ] **Step 3: Optional full mission test sweep**

```bash
bun test:unit src/lib/missions/ --run
```

Expected: all mission-domain tests pass.

---

## Follow-Up Slice

After this plan is complete, the next implementation plan should be `DAN scan domain state`:

- create `src/lib/dan/danScanState.ts`
- create `src/lib/dan/danTuning.ts`
- add pure unit tests for scan start, ticking, timeout, hit progress, completion, and failure reasons
- leave particle rendering, projectile collision, terminal interaction, and enemies for later slices
