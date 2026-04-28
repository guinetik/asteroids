# DAN Mission Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the first implementation slice for DAN missions: make `dan` a valid asteroid objective type, broaden `MissionRegion` to include `jovian-trojans` (already used in authored data), extend the existing Jovian Society and Cinderline giver manifests with DAN templates, and prove the generator can roll or force a DAN mission.

This slice does **not** wire any runtime behavior: no level orchestration, no minigame, no controllers, no HUD, no particles, no terminal interaction, no enemies, no partial-credit reward path. A rolled DAN objective is inert until the gameplay slices land it.

**Spec:** `docs/superpowers/specs/2026-04-27-dan-mission-design.md`

**Follow-up plans (do not start in this slice):**
- Plan B1: crater metadata + crater-aware asteroid rotation
- Plan B2: `DanMinigame` + `DanScanController` + HUD + projectile hookup + partial-credit reward

**Architecture:** Pure data/model pass inside `src/lib/missions/` and `src/data/missions/`. The generator produces concrete DAN objectives with all timing and pressure fields populated. Other systems can ignore `dan` until B2 consumes it.

**Convention deviations from the spec (locked in by codebase, do not re-litigate):**
- The spec proposes `src/lib/dan/danScanState.ts`, `danParticleSystem.ts`, and `danTuning.ts`. The codebase pattern (see `src/lib/minigame/PhotometryMinigame.ts`) puts minigame state and tuning constants in a single file under `src/lib/minigame/`. **No `src/lib/dan/` directory exists or should be created in any slice.** B2 will follow the minigame convention.
- The spec proposes binary success (100% or fail). The user has overridden this: DAN supports partial credit via min/max reward interpolation by completion quality. That infrastructure is B2 work, not this slice.
- The spec's fixed 45-second timer is overridden: `scanDurationSeconds` scales with difficulty.

**Givers are placeholders.** Jovian Society and Cinderline both get DAN templates in this slice so the generator has variety to pick from. Final per-faction balance, host attribution, board routing, and tone calibration are deferred until all mission templates are designed.

**Acceptance Criteria:**
- `ObjectiveType` includes `'dan'`.
- `MissionRegion` includes `'jovian-trojans'`. Existing authored data type-checks honestly.
- `ScalableParams` includes `DanScalableParams`.
- `ConcreteObjective` carries DAN scan duration, required hit count, grace window, particle tier, and enemy tier as optional fields (matches the existing per-type optional-field pattern).
- `rollObjective()` returns a concrete `dan` objective from a DAN slot.
- `generateAsteroidMission(..., requiredObjectiveType: 'dan')` produces a Jovian Society or Cinderline DAN mission across the intended difficulty band.
- Jovian Society manifest advertises DAN alongside its existing photometry and bunker offerings, with corporate cross-talk euphemism copy.
- Cinderline manifest advertises DAN alongside its existing bunker offering, with liturgical copy.
- Targeted mission tests pass.
- `bun run type-check`, `bun run lint`, and `bun test:unit` all pass.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/missions/types.ts` | Modify | Add `dan`, `jovian-trojans`, `DanPressureTier`, `DanScalableParams`, concrete DAN fields |
| `src/lib/missions/asteroidMissionGenerator.ts` | Modify | Roll concrete DAN values via `interpolateRange` |
| `src/data/missions/givers/jovian-society.json` | Modify | Add `'dan'` to `objectiveTypes`; append two DAN templates |
| `src/data/missions/givers/cinderline.json` | Modify | Add `'dan'` to `objectiveTypes`; append two DAN templates |
| `src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts` | Modify | Add DAN roll/generation coverage |
| `docs/superpowers/specs/2026-04-27-dan-mission-design.md` | Reference only | Mission design intent |

`src/lib/missions/giverCatalog.ts` already imports and registers `cinderline.json` (line 18). **No change needed.** Earlier drafts of this plan assumed the file did not exist; it does, with a single bunker template. We are extending it, not creating it.

---

## Task 1: Type The DAN Objective

- [ ] **Step 1: Add `dan` to `ObjectiveType`**

In `src/lib/missions/types.ts`, add `'dan'` to the `ObjectiveType` union immediately after `'photometry'`:

```ts
export type ObjectiveType =
  | 'gather'
  | 'exterminate'
  | 'rescue'
  | 'survey'
  | 'photometry'
  | 'dan'
  | 'collect'
  | 'bunker'
```

- [ ] **Step 2: Add `jovian-trojans` to `MissionRegion`**

```ts
export type MissionRegion = 'near-earth' | 'asteroid-belt' | 'kuiper-belt' | 'jovian-trojans'
```

Existing Jovian Society photometry templates already use `regionByDifficulty: { "jovian-trojans": [...] }`. This change makes the type union honest with authored data. No behavioral change to other regions.

- [ ] **Step 3: Add the pressure tier alias**

Above `DanScalableParams`:

```ts
/** Difficulty bucket for DAN particle and enemy pressure. Consumed by the runtime DAN tuning table in B2. */
export type DanPressureTier = 'low' | 'medium' | 'high'
```

- [ ] **Step 4: Add `DanScalableParams`**

After `PhotometryScalableParams`:

```ts
/** Scalable params for DAN subsurface survey objectives. */
export interface DanScalableParams {
  /** Discriminator for the union type. */
  type: 'dan'
  /** Active scan duration, in seconds. Scales up with difficulty (e.g. medium tier 35→50, high tier 45→65). */
  scanDurationSeconds: NumberRange
  /** Particle hits required to complete the scan meter. Scales up with difficulty. */
  requiredParticleHits: NumberRange
  /** Seconds before viroid pressure starts after scan activation. INVERTED for harder bands (less grace). */
  enemyGraceSeconds: NumberRange
  /** Particle pressure preset for the runtime DAN system in B2. */
  particleTier: DanPressureTier
  /** Enemy pressure preset for the runtime DAN system in B2. */
  enemyTier: DanPressureTier
}
```

- [ ] **Step 5: Extend `ScalableParams`**

Add `DanScalableParams` to the `ScalableParams` union immediately after `PhotometryScalableParams`.

- [ ] **Step 6: Extend `ConcreteObjective`**

After the photometry fields, before `collectItemId`:

```ts
/** For DAN: active scan duration, in seconds. */
scanDurationSeconds?: number
/** For DAN: particle hits needed to complete the scan meter. */
requiredParticleHits?: number
/** For DAN: seconds before viroid spawns begin. */
enemyGraceSeconds?: number
/** For DAN: particle pressure preset, consumed by runtime tuning in B2. */
particleTier?: DanPressureTier
/** For DAN: enemy pressure preset, consumed by runtime tuning in B2. */
enemyTier?: DanPressureTier
```

`scanDurationSeconds` is DAN-specific. Photometry uses `timeLimit` separately and is unaffected.

---

## Task 2: Roll Concrete DAN Objectives

- [ ] **Step 1: Add the generator branch**

In `src/lib/missions/asteroidMissionGenerator.ts`, add a `case 'dan'` branch in `rollObjective()` after the `'photometry'` branch and before `'collect'`:

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

`interpolateRange` (line 351) is `Math.round(min + t * (max - min))` and handles inverted ranges (min > max) correctly. `enemyGraceSeconds: { min: 10, max: 6 }` rolls 10s at difficulty 1 and 6s at difficulty 10.

Do not introduce a DAN-specific interpolator. Use the generic helper. The `x: 0, z: 0` placeholders are stamped later by `generateFlatZones()` inside `generateAsteroidMission`.

---

## Task 3: Author Faction DAN Templates

The duration ranges below scale with difficulty per the user's design call: medium tier scans 35→50s, high tier scans 45→65s. `enemyGraceSeconds` shrinks with difficulty (more pressure, less ramp).

- [ ] **Step 1: Update Jovian Society `objectiveTypes`**

In `src/data/missions/givers/jovian-society.json`, change the top-level array:

```json
"objectiveTypes": ["photometry", "bunker", "dan"]
```

- [ ] **Step 2: Append the medium-tier Jovian DAN template**

Insert into the `missions` array, after `jovian_phase_two_scan` and before `jovian_asset_substrate_recovery`:

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
        "scanDurationSeconds": { "min": 35, "max": 50 },
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

- [ ] **Step 3: Append the high-tier Jovian DAN template**

Append to the `missions` array:

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
        "scanDurationSeconds": { "min": 45, "max": 65 },
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

- [ ] **Step 4: Update Cinderline `objectiveTypes`**

In `src/data/missions/givers/cinderline.json`, change:

```json
"objectiveTypes": ["bunker", "dan"]
```

- [ ] **Step 5: Append two Cinderline DAN templates**

Insert into the `missions` array after `cinderline_anvil_substation`:

```json
{
  "id": "cinderline_first_listening",
  "name": "The First Listening",
  "briefing": "Pilot, the body has been listened to before from a distance. It is time to listen again. Set the pulse into the regolith and gather what reply the stone chooses to give. Hold your vigil until the answer is complete. A seat will be kept.",
  "objectiveSlots": [
    {
      "type": "dan",
      "weight": 1.0,
      "params": {
        "type": "dan",
        "scanDurationSeconds": { "min": 35, "max": 50 },
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
      "weight": 1.0,
      "params": {
        "type": "dan",
        "scanDurationSeconds": { "min": 45, "max": 65 },
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

DAN templates do **not** set `planetIds` — they roll from any host whose difficulty band overlaps the template, same as photometry. Per-host attribution and gating is later board-routing work.

The existing `cinderline_anvil_substation` bunker template has `"planetIds": ["mercury"]` — leave that untouched. Cinderline DAN templates intentionally have no host gate so they appear at any DAN-capable board.

- [ ] **Step 6: Validate JSON**

Vite's JSON imports surface parse errors at type-check time. No comments in JSON. Ensure trailing commas are absent and that the new objects are inserted with the correct preceding/following commas.

---

## Task 4: Add Generator Tests

- [ ] **Step 1: Add `rollObjective` DAN test**

In `src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts`, near the photometry tests:

```ts
it('rolls DAN objective with concrete scan values', () => {
  const slot = {
    type: 'dan' as const,
    weight: 1,
    params: {
      type: 'dan' as const,
      scanDurationSeconds: { min: 35, max: 50 },
      requiredParticleHits: { min: 40, max: 55 },
      enemyGraceSeconds: { min: 10, max: 8 },
      particleTier: 'medium' as const,
      enemyTier: 'medium' as const,
    },
    reward: { min: 3000, max: 6500 },
  }

  const obj = rollObjective(slot, 5)

  expect(obj.type).toBe('dan')
  expect(obj.scanDurationSeconds).toBeGreaterThanOrEqual(35)
  expect(obj.scanDurationSeconds).toBeLessThanOrEqual(50)
  expect(obj.requiredParticleHits).toBeGreaterThanOrEqual(40)
  expect(obj.requiredParticleHits).toBeLessThanOrEqual(55)
  expect(obj.enemyGraceSeconds).toBeGreaterThanOrEqual(8)
  expect(obj.enemyGraceSeconds).toBeLessThanOrEqual(10)
  expect(obj.particleTier).toBe('medium')
  expect(obj.enemyTier).toBe('medium')
  expect(obj.reward).toBeGreaterThanOrEqual(3000)
  expect(obj.reward).toBeLessThanOrEqual(6500)
})
```

- [ ] **Step 2: Add forced DAN generation test**

```ts
it('can force a DAN mission for DAN-capable givers', () => {
  const mission = generateAsteroidMission(6, null, () => 0, 'dan')

  expect(['jovian-society', 'cinderline']).toContain(mission.giverId)
  expect(mission.region).toBe('jovian-trojans')
  expect(mission.objectives.some((o) => o.type === 'dan')).toBe(true)
})
```

Note: `generateAsteroidMission` uses `Math.random` (not the injected `rand`) for picking among eligible templates, so which giver is selected is non-deterministic. The OR assertion is intentional. The injected `rand` is only used for waypoint placement.

- [ ] **Step 3: Add full-band forced DAN test**

```ts
it('can force DAN across its authored difficulty band', () => {
  for (const difficulty of [4, 7, 8, 10]) {
    const mission = generateAsteroidMission(difficulty, null, () => 0, 'dan')

    expect(['jovian-society', 'cinderline']).toContain(mission.giverId)
    expect(mission.difficulty).toBe(difficulty)
    expect(mission.objectives.some((o) => o.type === 'dan')).toBe(true)
  }
})
```

The candidate sort in `generateAsteroidMission` already prefers slots whose type matches `requiredObjectiveType` before slicing by `objectiveCountForDifficulty`, so DAN slots survive the slice even when a giver's other templates would otherwise dominate.

---

## Task 5: Verify

- [ ] **Step 1: Run targeted mission tests**

```bash
bun test:unit src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts
```

All tests pass.

- [ ] **Step 2: Run type-check**

```bash
bun run type-check
```

Zero TypeScript errors. Pay attention to the `MissionRegion` widening — anything matching exhaustively over the union must update if it does not already use `Partial<Record<MissionRegion, ...>>`.

- [ ] **Step 3: Run lint**

```bash
bun run lint
```

Zero oxlint errors, zero ESLint warnings (max-warnings 0). New types and interface fields require TSDoc — verify each new export has a comment.

- [ ] **Step 4: Optional full mission test sweep**

```bash
bun test:unit src/lib/missions/
```

All mission-domain tests pass.

---

## Follow-Up Slices

This plan ends at "DAN missions roll and survive type-check, lint, and tests." A rolled DAN objective has no runtime behavior yet.

**Plan B1 — Crater metadata + crater-aware asteroid rotation** (next):
- Expose crater positions, radii, and depths from terrain generation as queryable metadata.
- Add a "rotate-to-face-crater" helper that picks a crater and computes the asteroid rotation that places it on the play side.
- Pure terrain/level work; independently testable; no DAN-specific code.

**Plan B2 — DAN runtime encounter** (after B1):
- Add `src/lib/minigame/DanMinigame.ts` mirroring `PhotometryMinigame.ts`. Minigame state, callbacks, and tuning constants live in this single file. Do **not** create `src/lib/dan/`.
- Add `src/three/DanScanController.ts` for particle meshes, beam visuals, completion pulse.
- Wire DAN through `LevelMinigameFacade`, `LevelTelemetryFacade`, `LanderHud.vue` using the same hooks photometry uses today.
- Register DAN particles with `ProjectileSystem` so SCI bolts capture them via the same registry pattern as mineable rocks (`addRock`/`removeRock` shape).
- Introduce partial-credit reward path: extend `ConcreteObjective` with `rewardMin` (defaults to `reward` for binary objectives) and have `onComplete(index, quality?)` lerp `rewardMin → reward` by quality before crediting. All other objectives keep working with `quality === undefined → 1`.
- Use B1's crater-aware rotation to place the lander and terminal in a real crater bowl.
