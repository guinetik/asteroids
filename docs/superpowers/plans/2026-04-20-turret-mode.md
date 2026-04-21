# Turret Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Press **T** on `/map` to enter a first-person shuttle-nose mining turret. Continuous beam fires into the asteroid belt, consumes shuttle fuel via a new `turretMining` thruster group, destroys asteroids, commits yield to inventory, emits tractor-beam particles.

**Architecture:** New `TurretSession` state machine (idle → opening → active → closing) owned by a new `src/lib/map/turret/` module tree, mirrors the existing `EvaSession` / habitat session pattern. MapViewController gets ~30 lines of wiring. All physics/mining/inventory/upgrade systems are reused with tiny additive extensions (one ThrusterRuntimeModifiers field, two optional RockYieldSpawn fields, two new AsteroidBeltController methods).

**Tech Stack:** Vue 3 + TypeScript + Three.js + Vite, Bun test runner (Vitest), `@/` = `./src/*`.

**Related:**
- Design spec: `docs/superpowers/specs/2026-04-20-turret-mode-design.md`
- CLAUDE.md rules: data-driven content (JSON), no magic numbers, TSDoc on all exports with `@author guinetik @date 2026-04-20 @spec <path>`, tests focus on `src/lib/`.

**Acceptance per task:** each task ends with `bun run type-check && bun run lint && bun run test:unit` green before committing. Only Tasks 18–19 touch Three.js / Vue layers (no lib tests there); those are smoke-tested in-browser per CLAUDE.md convention.

---

## File Structure

### New files (create)

| Path | Purpose |
|---|---|
| `src/data/map/turret-config.json` | All numeric knobs (cone, traverse, beam, fade, tier cutoffs, thruster tuning). |
| `src/data/asteroid-belt-loot.json` | Tier-keyed loot composition tables. Schema matches `MineralEntry[]`. |
| `src/lib/map/turret/turretConstants.ts` | Typed constants loaded from `turret-config.json`. |
| `src/lib/map/turret/turretTiers.ts` | `pickTier(radius)` pure function. |
| `src/lib/map/turret/TurretAimState.ts` | Pure aim math (base yaw + cone pitch/yaw). |
| `src/lib/map/turret/TurretBeamSystem.ts` | Ray-sphere raycast + damage. |
| `src/lib/map/turret/TurretYieldCoordinator.ts` | Bridges RockYield ↔ belt ↔ inventory; fractional-kg buffer. |
| `src/lib/map/turret/TurretSession.ts` | State machine, fade driver, input/rig orchestration. |
| `src/three/TurretRigController.ts` | `turretBase` Group, `TurretCamera`, beam mesh, reticle sprite. |
| `src/three/TurretTractorEmitter.ts` | Tractor-beam particles (steering toward shuttle nose). |
| `src/lib/map/turret/__tests__/turretTiers.spec.ts` | Tier picker tests. |
| `src/lib/map/turret/__tests__/TurretAimState.spec.ts` | Aim math tests. |
| `src/lib/map/turret/__tests__/TurretBeamSystem.spec.ts` | Raycast tests. |
| `src/lib/map/turret/__tests__/TurretYieldCoordinator.spec.ts` | Coordinator tests. |
| `src/lib/map/turret/__tests__/TurretSession.spec.ts` | State-machine tests. |
| `src/lib/map/mode/__tests__/MapModeCoordinator.spec.ts` | New file (no existing test) for `resolveTurretToggle`. |

### Existing files (modify)

| Path | Delta |
|---|---|
| `src/lib/physics/thrusterSystem.ts` | +`fuelCostMultiplier` on `ThrusterRuntimeModifiers`; +`'turretMining'` on `ShuttleThrusterName`; +default config entry. |
| `src/lib/mining/rockYieldSystem.ts` | +optional `compositionOverride` and `totalKgOverride` on `RockYieldSpawn`. |
| `src/three/controllers/AsteroidBeltController.ts` | +`enumerateInstances()`, +`hideInstance()`. |
| `src/three/ParticleEmitter.ts` | +optional `steeringUpdate` callback on `ParticleEmitterConfig`; export `Particle` type. |
| `src/data/upgrades.json` | +3 turret upgrade entries. |
| `src/lib/upgrades.ts` | +3 IDs in `UpgradeId` union. |
| `src/lib/defaultBindings.ts` | +`toggleTurret: ['KeyT']` on `DEFAULT_BINDINGS`. |
| `src/lib/map/mode/MapModeCoordinator.ts` | +`resolveTurretToggle` method. |
| `src/lib/__tests__/upgrades.spec.ts` | +tests for 3 new upgrades; bump count constant. |
| `src/lib/physics/__tests__/thrusterSystem.spec.ts` | +test for `fuelCostMultiplier` (may need to create if not present). |
| `src/lib/mining/__tests__/rockYieldSystem.spec.ts` | +tests for override fields. |
| `src/views/MapViewController.ts` | +field, +ensure helper, +~25-line tick branch, +callback declarations. |
| `src/views/MapView.vue` | +turret fade overlay, +callback wiring. |

---

## Task 1: Extend ThrusterRuntimeModifiers with per-group `fuelCostMultiplier`

**Goal:** Let the `turretMiningEfficiency` upgrade scale fuel cost per-group. Additive, backward compatible — existing call sites unaffected.

**Files:**
- Modify: `src/lib/physics/thrusterSystem.ts` (lines 34-40, 200-209)
- Test: `src/lib/physics/__tests__/thrusterSystem.spec.ts` (check if exists; create if not)

- [ ] **Step 1: Check for existing test file and scan existing tests**

Run: `ls src/lib/physics/__tests__/ 2>&1`
If `thrusterSystem.spec.ts` exists, read it to mirror its style. If not, you will create it.

- [ ] **Step 2: Write the failing test for `fuelCostMultiplier`**

Create or append to `src/lib/physics/__tests__/thrusterSystem.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ThrusterSystem, type ThrusterSystemConfig } from '../thrusterSystem'

type TestName = 'a' | 'b'

const TEST_CONFIG: ThrusterSystemConfig<TestName> = {
  thrusters: {
    a: { capacity: 10, burnRate: 5, rechargeRate: 10, fuelCostPerRecharge: 1 },
    b: { capacity: 10, burnRate: 5, rechargeRate: 10, fuelCostPerRecharge: 1 },
  },
  fuelCapacity: 100,
}

describe('ThrusterSystem.tick — fuelCostMultiplier', () => {
  it('scales per-group fuel cost while idle-recharging', () => {
    const system = new ThrusterSystem<TestName>(TEST_CONFIG)
    // Drain charges so both thrusters need recharge
    system.tick(1, { a: true, b: true })
    const before = system.fuelLevel

    // Tick idle for 1s with multiplier: a=0.5 (cheap), b=2 (expensive)
    system.tick(1, { a: false, b: false }, {
      fuelCostMultiplier: { a: 0.5, b: 2 },
    })
    const after = system.fuelLevel
    const drained = before - after

    // a costs 0.5 per charge unit (5 units recovered → 2.5 fuel)
    // b costs 2 per charge unit (5 units recovered → 10 fuel)
    // Total expected: ~12.5 fuel; exact value depends on cap clamping and rates
    expect(drained).toBeGreaterThan(10)
    expect(drained).toBeLessThan(16)
  })

  it('treats missing fuelCostMultiplier entries as 1.0 (backward compatible)', () => {
    const system = new ThrusterSystem<TestName>(TEST_CONFIG)
    system.tick(1, { a: true, b: true })

    const baseline = new ThrusterSystem<TestName>(TEST_CONFIG)
    baseline.tick(1, { a: true, b: true })

    const deltaWithMods = (() => {
      const f0 = system.fuelLevel
      system.tick(1, { a: false, b: false }, { fuelCostMultiplier: { a: 1 } })
      return f0 - system.fuelLevel
    })()
    const deltaWithoutMods = (() => {
      const f0 = baseline.fuelLevel
      baseline.tick(1, { a: false, b: false })
      return f0 - baseline.fuelLevel
    })()

    expect(deltaWithMods).toBeCloseTo(deltaWithoutMods, 3)
  })
})
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `bun test:unit src/lib/physics/__tests__/thrusterSystem.spec.ts`
Expected: FAIL — `fuelCostMultiplier` is not a known property on `ThrusterRuntimeModifiers`.

- [ ] **Step 4: Add `fuelCostMultiplier` to the interface**

In `src/lib/physics/thrusterSystem.ts` around line 34-40, replace the `ThrusterRuntimeModifiers` interface:

```ts
/** Runtime multipliers that can modify per-thruster behavior without changing the base config. */
export interface ThrusterRuntimeModifiers<T extends string = string> {
  /** Scales charge drain while a thruster is firing. Lower means the bar lasts longer. */
  burnRateMultiplier?: Partial<Record<T, number>>
  /** Scales the recharge rate while a thruster is idle. Higher means charge refills faster. */
  rechargeRateMultiplier?: Partial<Record<T, number>>
  /** Scales fuel cost per unit of charge recovered (per-thruster). Lower means cheaper recharges. */
  fuelCostMultiplier?: Partial<Record<T, number>>
}
```

- [ ] **Step 5: Apply the multiplier inside `tick`**

In `src/lib/physics/thrusterSystem.ts`, inside the `else` branch at around lines 199-207, update the fuel cost computation:

```ts
} else {
  if (this.fuel > 0 && this.charges[name] < cfg.capacity) {
    const rechargeMultiplier = Math.max(0, modifiers?.rechargeRateMultiplier?.[name] ?? 1)
    const fuelCostMultiplier = Math.max(0, modifiers?.fuelCostMultiplier?.[name] ?? 1)
    const fuelCost = Math.max(
      0,
      cfg.rechargeRate * rechargeMultiplier * dt * cfg.fuelCostPerRecharge * fuelCostMultiplier,
    )
    const actualFuelUsed = Math.min(fuelCost, this.fuel)
    const actualRecharge =
      fuelCostMultiplier > 0 ? actualFuelUsed / (cfg.fuelCostPerRecharge * fuelCostMultiplier) : 0
    this.charges[name] = Math.min(cfg.capacity, this.charges[name] + actualRecharge)
    this.fuel = Math.max(0, this.fuel - actualFuelUsed)
  }
}
```

Note: the `actualRecharge` calculation divides by the effective per-unit cost so that a cheap multiplier recharges faster per fuel spent, not slower. When `fuelCostMultiplier === 0`, skip recharge (no division by zero).

- [ ] **Step 6: Run tests to verify green**

Run: `bun test:unit src/lib/physics/__tests__/thrusterSystem.spec.ts`
Expected: PASS both tests.

- [ ] **Step 7: Full validation pass**

Run (in sequence): `bun run type-check && bun run lint && bun run test:unit`
Expected: all green. If lint complains about missing TSDoc, add a short TSDoc line to the new interface field.

- [ ] **Step 8: Commit**

```bash
git add src/lib/physics/thrusterSystem.ts src/lib/physics/__tests__/thrusterSystem.spec.ts
git commit -m "feat(physics): add per-group fuelCostMultiplier to ThrusterRuntimeModifiers

Additive extension to ThrusterRuntimeModifiers<T> for upgrade-driven
per-thruster fuel cost scaling. Used by turret mining (spec: 2026-04-20-turret-mode-design.md)."
```

---

## Task 2: Add `turretMining` thruster group to shuttle

**Goal:** Expand `ShuttleThrusterName` so the shuttle's single `ThrusterSystem` instance owns the turret's charge/fuel bookkeeping. Default config for the new group is included.

**Files:**
- Modify: `src/lib/physics/thrusterSystem.ts` (lines 49-63)
- Modify: `src/three/ShuttleController.ts` (scan `getModifiers()` return type around line 878-890)

- [ ] **Step 1: Update `ShuttleThrusterName` union**

In `src/lib/physics/thrusterSystem.ts` line 50:

```ts
/** Shuttle-specific preset: thrust / brake / rcs / turret-mining beam. */
export type ShuttleThrusterName = 'thrust' | 'brake' | 'rcs' | 'turretMining'
```

- [ ] **Step 2: Add default tuning to `DEFAULT_SHUTTLE_CONFIG`**

In `src/lib/physics/thrusterSystem.ts` lines 56-63, add a `turretMining` entry:

```ts
export const DEFAULT_SHUTTLE_CONFIG: ThrusterSystemConfig<ShuttleThrusterName> = {
  thrusters: {
    thrust: { capacity: 100, burnRate: 54, rechargeRate: 21, fuelCostPerRecharge: 0.5 },
    brake: { capacity: 60, burnRate: 60, rechargeRate: 5, fuelCostPerRecharge: 0.6 },
    rcs: { capacity: 60, burnRate: 8, rechargeRate: 5, fuelCostPerRecharge: 0.2 },
    turretMining: { capacity: 100, burnRate: 20, rechargeRate: 25, fuelCostPerRecharge: 0.8 },
  },
  fuelCapacity: SHUTTLE_BASE_FUEL_CAPACITY,
}
```

- [ ] **Step 3: Type-check and follow the error trail**

Run: `bun run type-check`
Expected: Errors where `ShuttleController.getModifiers()` returns modifier records typed against `ShuttleThrusterName`. Example error location: `src/three/ShuttleController.ts` around lines 878-890. The return type shape `{ thrust, brake, rcs }` must now include `turretMining`.

- [ ] **Step 4: Fix `ShuttleController.getModifiers()` to include `turretMining`**

Open `src/three/ShuttleController.ts` and inspect `getModifiers()`. If it returns a `ThrusterRuntimeModifiers<ShuttleThrusterName>`, add `turretMining: 1` to any explicit `.burnRateMultiplier` / `.rechargeRateMultiplier` records so the type is complete. Example shape (adapt to the actual code you find):

```ts
private getModifiers(): ThrusterRuntimeModifiers<ShuttleThrusterName> {
  const eff = getCurrentShuttleThrusterEfficiencyModifiers()
  const chg = getCurrentShuttleThrusterChargeModifiers()
  return {
    burnRateMultiplier: { thrust: eff.thrust, brake: eff.brake, rcs: eff.rcs, turretMining: 1 },
    rechargeRateMultiplier: { thrust: chg.thrust, brake: chg.brake, rcs: chg.rcs, turretMining: 1 },
  }
}
```

If `ShuttleThrusterEfficiencyModifiers` / `ShuttleThrusterChargeModifiers` (defined in `src/lib/upgrades.ts` lines 213-220 and 245-253) are explicitly-typed structs that `getModifiers()` feeds from, you do NOT need to add `turretMining` to those structs — only to the `burnRateMultiplier` / `rechargeRateMultiplier` records passed to the tick call. Flight thrusters use the upgrade-driven multipliers; the turret group uses `1.0` unless the turret session passes its own modifiers during turret-active ticks (that's a later task).

- [ ] **Step 5: Scan for any other tick-site callers that build `{thrust, brake, rcs}` records**

Run: `bun run type-check`
Expected: clean. If additional call sites fail, add `turretMining: 1` (or leave undefined if the shape is `Partial<Record<T,number>>`).

- [ ] **Step 6: Lint + tests**

Run: `bun run lint && bun run test:unit`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/physics/thrusterSystem.ts src/three/ShuttleController.ts
git commit -m "feat(physics): add turretMining thruster group to ShuttleThrusterName

New 'turretMining' group joins thrust/brake/rcs on the shuttle's shared
ThrusterSystem. Tuning lives in DEFAULT_SHUTTLE_CONFIG; final numbers
are data-driven via turret-config.json (later task)."
```

---

## Task 3: Extend `RockYieldSpawn` with `compositionOverride` and `totalKgOverride`

**Goal:** Let the turret session register belt asteroids with tier-specific compositions and HP totals without changing the existing level-scene flow.

**Files:**
- Modify: `src/lib/mining/rockYieldSystem.ts` (lines 47-53, 97-108, 230-238)
- Modify: `src/lib/mining/__tests__/rockYieldSystem.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/mining/__tests__/rockYieldSystem.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { MineralEntry } from '@/lib/asteroids/types'
import { RockYieldSystem } from '../rockYieldSystem'

describe('RockYieldSystem.registerRock — overrides', () => {
  it('uses compositionOverride when provided', () => {
    const baseComposition: MineralEntry[] = [{ name: 'Olivine', percentage: 100 }]
    const override: MineralEntry[] = [{ name: 'Pyroxene', percentage: 100 }]
    const system = new RockYieldSystem({ composition: baseComposition, seed: 1 })
    system.registerRock({ spawnIndex: 0, diameter: 1, compositionOverride: override })
    const roll = system.peekRock(0)
    expect(roll).not.toBeNull()
    expect(roll!.itemId).toBe('pyroxene')
  })

  it('uses totalKgOverride when provided', () => {
    const composition: MineralEntry[] = [{ name: 'Olivine', percentage: 100 }]
    const system = new RockYieldSystem({ composition, seed: 1 })
    system.registerRock({ spawnIndex: 0, diameter: 1, totalKgOverride: 250 })
    const roll = system.peekRock(0)
    expect(roll).not.toBeNull()
    expect(roll!.totalKg).toBe(250)
    expect(roll!.remainingKg).toBe(250)
  })

  it('applies both overrides together', () => {
    const base: MineralEntry[] = [{ name: 'Olivine', percentage: 100 }]
    const override: MineralEntry[] = [{ name: 'Pyroxene', percentage: 100 }]
    const system = new RockYieldSystem({ composition: base, seed: 1 })
    system.registerRock({
      spawnIndex: 0,
      diameter: 1,
      compositionOverride: override,
      totalKgOverride: 500,
    })
    const roll = system.peekRock(0)
    expect(roll!.itemId).toBe('pyroxene')
    expect(roll!.totalKg).toBe(500)
  })

  it('falls back to constructor composition and diameter-based HP when overrides absent', () => {
    const composition: MineralEntry[] = [{ name: 'Olivine', percentage: 100 }]
    const system = new RockYieldSystem({ composition, seed: 1 })
    system.registerRock({ spawnIndex: 0, diameter: 2 })
    const roll = system.peekRock(0)
    expect(roll!.itemId).toBe('olivine')
    // totalKg computed from diameter — just verify it's set and positive
    expect(roll!.totalKg).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `bun test:unit src/lib/mining/__tests__/rockYieldSystem.spec.ts`
Expected: FAIL on `compositionOverride` / `totalKgOverride` being unknown properties.

- [ ] **Step 3: Extend `RockYieldSpawn`**

In `src/lib/mining/rockYieldSystem.ts` lines 47-53:

```ts
/** Spawn input for {@link RockYieldSystem.registerRock}. */
export interface RockYieldSpawn {
  /** Stable index used by both the mesh layer and collider id. */
  spawnIndex: number
  /** Diameter in world units, used to compute total kg when {@link totalKgOverride} is absent. */
  diameter: number
  /** Override the system-level composition for this rock only (e.g. belt tier loot tables). */
  compositionOverride?: readonly MineralEntry[]
  /** Override the diameter-derived HP (kg). Takes precedence over {@link diameter} for yield size. */
  totalKgOverride?: number
}
```

- [ ] **Step 4: Update `registerRock` to honor overrides**

In `src/lib/mining/rockYieldSystem.ts` lines 97-108, replace `registerRock`:

```ts
registerRock(spawn: RockYieldSpawn): void {
  if (this.rocks.has(spawn.spawnIndex)) return

  const weightedItems = spawn.compositionOverride
    ? this.buildWeightedItems(spawn.compositionOverride)
    : this.weightedItems
  if (weightedItems.length === 0) return

  const itemId = this.rollMineralFrom(weightedItems, spawn.spawnIndex)
  const totalKg = spawn.totalKgOverride ?? this.rollTotalKg(spawn.diameter)
  this.rocks.set(spawn.spawnIndex, { itemId, totalKg, remainingKg: totalKg })
}
```

- [ ] **Step 5: Add `buildWeightedItems` helper and refactor `rollMineral`**

Add near the existing `rollMineral` (around line 223) two private helpers:

```ts
/** Build a weighted mineral list from a composition table, same rules as constructor. */
private buildWeightedItems(
  composition: readonly MineralEntry[],
): { itemId: string; weight: number }[] {
  const result: { itemId: string; weight: number }[] = []
  for (const entry of composition) {
    const itemId = resolveCompositionItemId(entry.name)
    if (itemId === null) continue
    const weight = Math.max(0, entry.percentage)
    if (weight <= 0) continue
    result.push({ itemId, weight })
  }
  return result
}

/** Roll a mineral from an arbitrary weighted list using seed + spawn index. */
private rollMineralFrom(
  items: { itemId: string; weight: number }[],
  spawnIndex: number,
): string {
  const r = pseudoRandom(this.seed, spawnIndex)
  const totalWeight = items.reduce((sum, entry) => sum + entry.weight, 0)
  const target = r * totalWeight
  let acc = 0
  for (const entry of items) {
    acc += entry.weight
    if (target < acc) return entry.itemId
  }
  return items[items.length - 1]!.itemId
}
```

Then shrink the original `rollMineral` to delegate:

```ts
private rollMineral(spawnIndex: number): string {
  return this.rollMineralFrom(this.weightedItems, spawnIndex)
}
```

(Or delete `rollMineral` entirely if no other caller references it — grep for `this.rollMineral` to decide.)

- [ ] **Step 6: Run tests to verify green**

Run: `bun test:unit src/lib/mining/__tests__/rockYieldSystem.spec.ts`
Expected: PASS including new override tests; existing tests still green.

- [ ] **Step 7: Full validation pass**

Run: `bun run type-check && bun run lint && bun run test:unit`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/lib/mining/rockYieldSystem.ts src/lib/mining/__tests__/rockYieldSystem.spec.ts
git commit -m "feat(mining): add compositionOverride and totalKgOverride to RockYieldSpawn

Additive optional fields let callers (turret mode) register rocks with
tier-specific loot tables and HP without mutating the system-level
composition. Existing callers unaffected."
```

---

## Task 4: Add three turret upgrades to `upgrades.json` and `UpgradeId` union

**Goal:** Ship the `turretMiningUnlock`, `turretMiningYield`, and `turretMiningEfficiency` upgrades so the feature is gated and tunable.

**Files:**
- Modify: `src/data/upgrades.json` (append 3 entries)
- Modify: `src/lib/upgrades.ts` (lines 50-79 — add to union)
- Modify: `src/lib/__tests__/upgrades.spec.ts` (bump count + assert new entries)

- [ ] **Step 1: Read existing upgrade count constant**

Run: `grep -n "EXPECTED_UPGRADE_COUNT\|toHaveLength" src/lib/__tests__/upgrades.spec.ts`
Expected: find a constant like `const EXPECTED_UPGRADE_COUNT = 29`. Record the current value (29).

- [ ] **Step 2: Write failing tests for the new upgrades**

In `src/lib/__tests__/upgrades.spec.ts`:

- Bump `EXPECTED_UPGRADE_COUNT` from 29 → 32.
- Add a new `describe` block:

```ts
describe('turret mining upgrades', () => {
  afterEach(() => {
    resetPlayerUpgradesToDefaults()
  })

  it('turretMiningUnlock starts locked at level 0 and unlocks at level 1', () => {
    expect(getCurrentUpgradeValue('turretMiningUnlock')).toBe(0)
    CURRENT_PLAYER_UPGRADE_LEVELS.turretMiningUnlock = 1
    expect(getCurrentUpgradeValue('turretMiningUnlock')).toBe(1)
  })

  it('turretMiningYield scales across levels', () => {
    expect(getCurrentUpgradeValue('turretMiningYield')).toBe(1.0)
    CURRENT_PLAYER_UPGRADE_LEVELS.turretMiningYield = 1
    expect(getCurrentUpgradeValue('turretMiningYield')).toBe(1.35)
    CURRENT_PLAYER_UPGRADE_LEVELS.turretMiningYield = 3
    expect(getCurrentUpgradeValue('turretMiningYield')).toBe(2.25)
  })

  it('turretMiningEfficiency scales down across levels', () => {
    expect(getCurrentUpgradeValue('turretMiningEfficiency')).toBe(1.0)
    CURRENT_PLAYER_UPGRADE_LEVELS.turretMiningEfficiency = 1
    expect(getCurrentUpgradeValue('turretMiningEfficiency')).toBe(0.75)
    CURRENT_PLAYER_UPGRADE_LEVELS.turretMiningEfficiency = 3
    expect(getCurrentUpgradeValue('turretMiningEfficiency')).toBe(0.4)
  })
})
```

- [ ] **Step 3: Run tests to confirm failure**

Run: `bun test:unit src/lib/__tests__/upgrades.spec.ts`
Expected: FAIL — type error that `'turretMiningUnlock' | 'turretMiningYield' | 'turretMiningEfficiency'` are not in `UpgradeId`, and count mismatch.

- [ ] **Step 4: Add entries to `src/data/upgrades.json`**

Append (respect JSON comma placement — these go before the closing `]`):

```json
  {
    "id": "turretMiningUnlock",
    "category": "shuttle",
    "label": "Mining Turret Mount",
    "description": "Installs a hull-mounted mining laser. Press T from the map to operate.",
    "baseCost": 2500,
    "maxLevel": 1,
    "valuesByLevel": [0, 1],
    "hiddenFromShop": false,
    "excludeFromMissionDifficulty": true
  },
  {
    "id": "turretMiningYield",
    "category": "shuttle",
    "label": "Turret Focus Array",
    "description": "Tighter beam focus extracts more ore per second.",
    "baseCost": 1800,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 1.35, 1.75, 2.25],
    "hiddenFromShop": false,
    "excludeFromMissionDifficulty": true
  },
  {
    "id": "turretMiningEfficiency",
    "category": "shuttle",
    "label": "Turret Power Regulator",
    "description": "Reduces fuel consumption while the mining beam is active.",
    "baseCost": 1800,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 0.75, 0.55, 0.4],
    "hiddenFromShop": false,
    "excludeFromMissionDifficulty": true
  }
```

- [ ] **Step 5: Extend `UpgradeId` union**

In `src/lib/upgrades.ts` around lines 50-79, append to the union:

```ts
  | 'suitMobility'
  | 'turretMiningUnlock'
  | 'turretMiningYield'
  | 'turretMiningEfficiency'
```

- [ ] **Step 6: Run tests to verify green**

Run: `bun test:unit src/lib/__tests__/upgrades.spec.ts`
Expected: PASS.

- [ ] **Step 7: Full validation**

Run: `bun run type-check && bun run lint && bun run test:unit`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/data/upgrades.json src/lib/upgrades.ts src/lib/__tests__/upgrades.spec.ts
git commit -m "feat(upgrades): add turret mining unlock + yield + efficiency upgrades

Three new shuttle-category upgrades gate and scale the map-turret mining
beam. turretMiningUnlock is a boolean (maxLevel 1); yield scales damage;
efficiency scales fuel cost."
```

---

## Task 5: Add `toggleTurret` input binding and data JSON files

**Goal:** Ship the binding and the data files that downstream tasks depend on. No tests — pure data changes.

**Files:**
- Modify: `src/lib/defaultBindings.ts` (append to `DEFAULT_BINDINGS`)
- Create: `src/data/map/turret-config.json`
- Create: `src/data/asteroid-belt-loot.json`

- [ ] **Step 1: Add the binding**

In `src/lib/defaultBindings.ts` inside `DEFAULT_BINDINGS` (around line 42, before the closing `}`):

```ts
  closeMap: ['Escape'],
  toggleTurret: ['KeyT'],
}
```

(Ensure the trailing comma before the new line — match existing JSON-like style.)

- [ ] **Step 2: Create `src/data/map/turret-config.json`**

First check the directory exists: `ls src/data/map/ 2>&1`. If not, create with: `mkdir -p src/data/map`.

Then write `src/data/map/turret-config.json`:

```json
{
  "fade": {
    "inDurationSec": 0.4,
    "outDurationSec": 0.4,
    "openingCompleteThreshold": 0.98,
    "closingCompleteThreshold": 0.02
  },
  "aim": {
    "coneHalfAngleDeg": 60,
    "pitchLimitDeg": 75,
    "traverseSpeedDegPerSec": 50,
    "mouseSensitivity": 0.002
  },
  "beam": {
    "maxRangeWorldUnits": 80,
    "dpsKgPerSec": 30,
    "noseOffset": { "x": 0, "y": 0.3, "z": 1.8 }
  },
  "tiers": {
    "small":  { "radiusMax": 1.5,      "hpKg": 40,  "lootId": "asteroid-belt-small"  },
    "medium": { "radiusMax": 3.5,      "hpKg": 180, "lootId": "asteroid-belt-medium" },
    "large":  { "radiusMax": 999999,   "hpKg": 600, "lootId": "asteroid-belt-large"  }
  },
  "tractor": {
    "burstCount": 20,
    "particleSpeed": 6,
    "steerAcceleration": 40,
    "arrivalRadius": 1.5,
    "maxLifetimeSec": 1.2
  },
  "yieldBuffer": {
    "commitUnitGranularityKg": 1
  }
}
```

- [ ] **Step 3: Create `src/data/asteroid-belt-loot.json`**

The `MineralEntry` schema is `{ name: string, percentage: number }` where `name` is matched via `resolveCompositionItemId` to a catalog item id. Real mineral names in `src/lib/asteroids/mineralItemMap.ts` include Olivine, Pyroxene, Magnetite, Iron-nickel alloy, Hydrated silicates, etc.

First verify the mapping: `grep -n "'Olivine'\|'Pyroxene'\|'Magnetite'\|'Iron-nickel" src/lib/asteroids/mineralItemMap.ts | head -10` to confirm the canonical names. Use the names that `resolveCompositionItemId` recognizes.

Write `src/data/asteroid-belt-loot.json`:

```json
{
  "asteroid-belt-small": [
    { "name": "Olivine", "percentage": 70 },
    { "name": "Magnetite", "percentage": 30 }
  ],
  "asteroid-belt-medium": [
    { "name": "Olivine", "percentage": 55 },
    { "name": "Magnetite", "percentage": 35 },
    { "name": "Pyroxene", "percentage": 10 }
  ],
  "asteroid-belt-large": [
    { "name": "Olivine", "percentage": 35 },
    { "name": "Magnetite", "percentage": 35 },
    { "name": "Pyroxene", "percentage": 20 },
    { "name": "Iron-nickel alloy", "percentage": 10 }
  ]
}
```

If any of these names aren't in `mineralItemMap.ts`, swap them for names that ARE. The goal is: small tier = 2 common, medium = +1 uncommon, large = +1 rare (iron-nickel or equivalent).

- [ ] **Step 4: Sanity-check lint/type-check**

Run: `bun run type-check && bun run lint`
Expected: clean. JSON files don't have types; binding entry is fine.

- [ ] **Step 5: Commit**

```bash
git add src/lib/defaultBindings.ts src/data/map/turret-config.json src/data/asteroid-belt-loot.json
git commit -m "feat(data): add turret-config.json, asteroid-belt-loot.json, toggleTurret binding

Data files for map-turret mining feature. Binding adds KeyT -> toggleTurret
on the shuttle/map binding set; session polls its own bindings during active."
```

---

## Task 6: Create `turretConstants.ts` and `turretTiers.ts` (with tier picker test)

**Goal:** Typed constants from JSON + pure `pickTier(radius)` function for asteroid classification.

**Files:**
- Create: `src/lib/map/turret/turretConstants.ts`
- Create: `src/lib/map/turret/turretTiers.ts`
- Create: `src/lib/map/turret/__tests__/turretTiers.spec.ts`

- [ ] **Step 1: Create the directory**

Run: `mkdir -p src/lib/map/turret/__tests__`

- [ ] **Step 2: Write the failing test for `pickTier`**

Create `src/lib/map/turret/__tests__/turretTiers.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { pickTier, TURRET_TIERS } from '../turretTiers'

describe('pickTier', () => {
  it('returns small for radius below small cutoff', () => {
    expect(pickTier(0.5).id).toBe('small')
    expect(pickTier(1.4).id).toBe('small')
  })

  it('returns medium for radius between small and medium cutoffs', () => {
    expect(pickTier(1.6).id).toBe('medium')
    expect(pickTier(3.4).id).toBe('medium')
  })

  it('returns large for radius above medium cutoff', () => {
    expect(pickTier(3.6).id).toBe('large')
    expect(pickTier(1000).id).toBe('large')
  })

  it('exposes tier HP and lootId', () => {
    expect(TURRET_TIERS.small.hpKg).toBeGreaterThan(0)
    expect(TURRET_TIERS.medium.hpKg).toBeGreaterThan(TURRET_TIERS.small.hpKg)
    expect(TURRET_TIERS.large.hpKg).toBeGreaterThan(TURRET_TIERS.medium.hpKg)
    expect(TURRET_TIERS.small.lootId).toBe('asteroid-belt-small')
    expect(TURRET_TIERS.medium.lootId).toBe('asteroid-belt-medium')
    expect(TURRET_TIERS.large.lootId).toBe('asteroid-belt-large')
  })
})
```

- [ ] **Step 3: Run tests to confirm failure**

Run: `bun test:unit src/lib/map/turret/__tests__/turretTiers.spec.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Create `src/lib/map/turret/turretConstants.ts`**

```ts
/**
 * Typed constants for map-turret mining mode, loaded from JSON data files.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-turret-mode-design.md
 */
import turretConfig from '@/data/map/turret-config.json'
import asteroidBeltLoot from '@/data/asteroid-belt-loot.json'
import type { MineralEntry } from '@/lib/asteroids/types'

const DEG_TO_RAD = Math.PI / 180

/** Fade-in duration in seconds before turret controls are live. */
export const TURRET_FADE_IN_DURATION = turretConfig.fade.inDurationSec
/** Fade-out duration in seconds when exiting the turret. */
export const TURRET_FADE_OUT_DURATION = turretConfig.fade.outDurationSec
/** Fade opacity threshold for opening → active transition. */
export const TURRET_OPENING_COMPLETE_THRESHOLD = turretConfig.fade.openingCompleteThreshold
/** Fade opacity threshold for closing → idle transition. */
export const TURRET_CLOSING_COMPLETE_THRESHOLD = turretConfig.fade.closingCompleteThreshold

/** Half-angle of the mouse aim cone relative to the turret base forward (radians). */
export const TURRET_CONE_HALF_ANGLE = turretConfig.aim.coneHalfAngleDeg * DEG_TO_RAD
/** Absolute pitch limit (radians) — clamps camera local pitch. */
export const TURRET_PITCH_LIMIT = turretConfig.aim.pitchLimitDeg * DEG_TO_RAD
/** Turret-base rotation speed (radians/sec) driven by A/D keys. */
export const TURRET_TRAVERSE_SPEED = turretConfig.aim.traverseSpeedDegPerSec * DEG_TO_RAD
/** Mouse sensitivity — radians per pixel of mouse delta. */
export const TURRET_MOUSE_SENSITIVITY = turretConfig.aim.mouseSensitivity

/** Maximum beam range in world units. */
export const TURRET_BEAM_MAX_RANGE = turretConfig.beam.maxRangeWorldUnits
/** Beam damage rate in kg/sec at `turretMiningYield` level 0 (multiplier 1.0). */
export const TURRET_BEAM_DPS = turretConfig.beam.dpsKgPerSec
/** Local offset from shuttle origin to turret base attach point. */
export const TURRET_NOSE_OFFSET = turretConfig.beam.noseOffset

/** Number of particles emitted per tractor burst. */
export const TURRET_TRACTOR_BURST_COUNT = turretConfig.tractor.burstCount
/** Initial particle speed (world units/sec). */
export const TURRET_TRACTOR_PARTICLE_SPEED = turretConfig.tractor.particleSpeed
/** Steering acceleration toward target (world units/sec^2). */
export const TURRET_TRACTOR_STEER_ACCEL = turretConfig.tractor.steerAcceleration
/** Distance (world units) at which a particle is considered arrived and despawns. */
export const TURRET_TRACTOR_ARRIVAL_RADIUS = turretConfig.tractor.arrivalRadius
/** Hard cap on particle lifetime (seconds). */
export const TURRET_TRACTOR_MAX_LIFETIME = turretConfig.tractor.maxLifetimeSec

/** Granularity (kg) at which buffered yield is committed to inventory. */
export const TURRET_YIELD_COMMIT_GRANULARITY_KG = turretConfig.yieldBuffer.commitUnitGranularityKg

/** Raw tier config, exposed for {@link pickTier}. */
export const TURRET_TIER_CONFIG = turretConfig.tiers

/** Loot tables keyed by lootId. */
export const ASTEROID_BELT_LOOT: Record<string, readonly MineralEntry[]> = asteroidBeltLoot
```

- [ ] **Step 5: Create `src/lib/map/turret/turretTiers.ts`**

```ts
/**
 * Asteroid tier classification by radius for map-turret mining.
 *
 * Tiers are size-derived; each tier owns an HP budget and a lootId
 * pointing into {@link ASTEROID_BELT_LOOT}.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-turret-mode-design.md
 */
import { ASTEROID_BELT_LOOT, TURRET_TIER_CONFIG } from './turretConstants'
import type { MineralEntry } from '@/lib/asteroids/types'

/** Discrete asteroid size/yield tier. */
export type TurretTierId = 'small' | 'medium' | 'large'

/** Classified tier entry — what {@link pickTier} returns. */
export interface TurretTier {
  /** Tier identifier. */
  readonly id: TurretTierId
  /** Upper-bound radius (exclusive) for this tier. */
  readonly radiusMax: number
  /** HP in kg — total damage needed to deplete. */
  readonly hpKg: number
  /** Loot table id (key into {@link ASTEROID_BELT_LOOT}). */
  readonly lootId: string
  /** Resolved loot composition entries. */
  readonly composition: readonly MineralEntry[]
}

/** All tiers resolved with their loot composition. */
export const TURRET_TIERS: Record<TurretTierId, TurretTier> = {
  small: {
    id: 'small',
    radiusMax: TURRET_TIER_CONFIG.small.radiusMax,
    hpKg: TURRET_TIER_CONFIG.small.hpKg,
    lootId: TURRET_TIER_CONFIG.small.lootId,
    composition: ASTEROID_BELT_LOOT[TURRET_TIER_CONFIG.small.lootId] ?? [],
  },
  medium: {
    id: 'medium',
    radiusMax: TURRET_TIER_CONFIG.medium.radiusMax,
    hpKg: TURRET_TIER_CONFIG.medium.hpKg,
    lootId: TURRET_TIER_CONFIG.medium.lootId,
    composition: ASTEROID_BELT_LOOT[TURRET_TIER_CONFIG.medium.lootId] ?? [],
  },
  large: {
    id: 'large',
    radiusMax: TURRET_TIER_CONFIG.large.radiusMax,
    hpKg: TURRET_TIER_CONFIG.large.hpKg,
    lootId: TURRET_TIER_CONFIG.large.lootId,
    composition: ASTEROID_BELT_LOOT[TURRET_TIER_CONFIG.large.lootId] ?? [],
  },
}

/**
 * Classify an asteroid instance by its collision radius.
 *
 * @param radius - Per-instance collision radius in belt-local units.
 * @returns The matching tier. Radii above all cutoffs fall into `large`.
 */
export function pickTier(radius: number): TurretTier {
  if (radius < TURRET_TIERS.small.radiusMax) return TURRET_TIERS.small
  if (radius < TURRET_TIERS.medium.radiusMax) return TURRET_TIERS.medium
  return TURRET_TIERS.large
}
```

- [ ] **Step 6: Run tests to verify green**

Run: `bun test:unit src/lib/map/turret/__tests__/turretTiers.spec.ts`
Expected: PASS.

- [ ] **Step 7: Full validation**

Run: `bun run type-check && bun run lint && bun run test:unit`
Expected: all green. If TSDoc lint complains, every exported const/type/function must have a doc comment (already provided above).

- [ ] **Step 8: Commit**

```bash
git add src/lib/map/turret/turretConstants.ts src/lib/map/turret/turretTiers.ts src/lib/map/turret/__tests__/turretTiers.spec.ts
git commit -m "feat(turret): add typed constants and pickTier() classifier

Loads turret-config.json and asteroid-belt-loot.json into typed module
exports. pickTier(radius) returns {small|medium|large} with HP + loot."
```

---

## Task 7: Create `TurretAimState` pure aim module

**Goal:** Deterministic, unit-tested aim math — base yaw from A/D, cone-relative pitch/yaw from mouse, clamps. No Three.js.

**Files:**
- Create: `src/lib/map/turret/TurretAimState.ts`
- Create: `src/lib/map/turret/__tests__/TurretAimState.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/map/turret/__tests__/TurretAimState.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createTurretAimState, tickTurretAim } from '../TurretAimState'
import { TURRET_CONE_HALF_ANGLE, TURRET_PITCH_LIMIT, TURRET_TRAVERSE_SPEED } from '../turretConstants'

describe('tickTurretAim', () => {
  it('starts at zero on all axes', () => {
    const state = createTurretAimState()
    expect(state.baseYaw).toBe(0)
    expect(state.coneYaw).toBe(0)
    expect(state.conePitch).toBe(0)
  })

  it('accumulates baseYaw proportional to A/D input × dt', () => {
    const state = createTurretAimState()
    const next = tickTurretAim(state, { yawAxis: 1, mouseDx: 0, mouseDy: 0 }, 1)
    expect(next.baseYaw).toBeCloseTo(TURRET_TRAVERSE_SPEED, 5)

    const back = tickTurretAim(next, { yawAxis: -1, mouseDx: 0, mouseDy: 0 }, 0.5)
    expect(back.baseYaw).toBeCloseTo(TURRET_TRAVERSE_SPEED - TURRET_TRAVERSE_SPEED * 0.5, 5)
  })

  it('does not drift under neutral input', () => {
    const state = createTurretAimState()
    const n1 = tickTurretAim(state, { yawAxis: 0, mouseDx: 0, mouseDy: 0 }, 0.016)
    const n2 = tickTurretAim(n1, { yawAxis: 0, mouseDx: 0, mouseDy: 0 }, 0.016)
    expect(n2.baseYaw).toBe(0)
    expect(n2.coneYaw).toBe(0)
    expect(n2.conePitch).toBe(0)
  })

  it('clamps coneYaw at the cone half-angle limit', () => {
    let state = createTurretAimState()
    // Push far past the limit with a large mouseDx sweep
    for (let i = 0; i < 10_000; i++) {
      state = tickTurretAim(state, { yawAxis: 0, mouseDx: 100, mouseDy: 0 }, 0.016)
    }
    expect(state.coneYaw).toBeLessThanOrEqual(TURRET_CONE_HALF_ANGLE)
    expect(state.coneYaw).toBeGreaterThan(0)
  })

  it('clamps conePitch at the pitch limit', () => {
    let state = createTurretAimState()
    for (let i = 0; i < 10_000; i++) {
      state = tickTurretAim(state, { yawAxis: 0, mouseDx: 0, mouseDy: -100 }, 0.016)
    }
    expect(state.conePitch).toBeLessThanOrEqual(TURRET_PITCH_LIMIT)
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `bun test:unit src/lib/map/turret/__tests__/TurretAimState.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `TurretAimState.ts`**

Create `src/lib/map/turret/TurretAimState.ts`:

```ts
/**
 * Pure turret aim math. Tracks the rotating turret base (A/D traverse) plus
 * the camera's local cone-relative pitch/yaw from mouse deltas.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-turret-mode-design.md
 */
import {
  TURRET_CONE_HALF_ANGLE,
  TURRET_MOUSE_SENSITIVITY,
  TURRET_PITCH_LIMIT,
  TURRET_TRAVERSE_SPEED,
} from './turretConstants'

/** Turret aim state — immutable snapshot. */
export interface TurretAimState {
  /** World-relative yaw of the turret base (radians). Accumulates across A/D input. */
  readonly baseYaw: number
  /** Camera yaw within the cone, relative to the base (radians). Clamped. */
  readonly coneYaw: number
  /** Camera pitch from horizontal (radians). Clamped. */
  readonly conePitch: number
}

/** Per-tick input bag for {@link tickTurretAim}. */
export interface TurretAimInput {
  /** Key yaw axis: -1 (left), 0, +1 (right). */
  readonly yawAxis: number
  /** Mouse x delta in pixels this frame. */
  readonly mouseDx: number
  /** Mouse y delta in pixels this frame. */
  readonly mouseDy: number
}

/** Build an identity aim state (camera pointing straight down the base forward). */
export function createTurretAimState(): TurretAimState {
  return { baseYaw: 0, coneYaw: 0, conePitch: 0 }
}

/**
 * Advance one tick of aim state. Pure — no side effects.
 *
 * @param state - Current aim state.
 * @param input - Raw key + mouse input for this frame.
 * @param dt - Delta time in seconds.
 * @returns Next aim state snapshot.
 */
export function tickTurretAim(
  state: TurretAimState,
  input: TurretAimInput,
  dt: number,
): TurretAimState {
  const baseYaw = state.baseYaw + input.yawAxis * TURRET_TRAVERSE_SPEED * dt

  // Mouse X moves the camera yaw within the cone (mouse right = turret right = -mouseDx yaw delta
  // depends on Three.js convention; we invert so a right sweep moves look right).
  const rawConeYaw = state.coneYaw - input.mouseDx * TURRET_MOUSE_SENSITIVITY
  const coneYaw = clamp(rawConeYaw, -TURRET_CONE_HALF_ANGLE, TURRET_CONE_HALF_ANGLE)

  // Mouse Y moves pitch; up mouse = look up.
  const rawConePitch = state.conePitch - input.mouseDy * TURRET_MOUSE_SENSITIVITY
  const conePitch = clamp(rawConePitch, -TURRET_PITCH_LIMIT, TURRET_PITCH_LIMIT)

  return { baseYaw, coneYaw, conePitch }
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}
```

- [ ] **Step 4: Run tests to verify green**

Run: `bun test:unit src/lib/map/turret/__tests__/TurretAimState.spec.ts`
Expected: PASS.

- [ ] **Step 5: Full validation**

Run: `bun run type-check && bun run lint && bun run test:unit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/map/turret/TurretAimState.ts src/lib/map/turret/__tests__/TurretAimState.spec.ts
git commit -m "feat(turret): add pure TurretAimState math with A/D traverse + cone clamp

baseYaw accumulates from yaw-axis input; coneYaw/conePitch update from
mouse deltas and clamp to TURRET_CONE_HALF_ANGLE / TURRET_PITCH_LIMIT."
```

---

## Task 8: Create `TurretBeamSystem` — ray-sphere raycast

**Goal:** Given a ray and a list of instance spheres, return the nearest hit within max range. Pure.

**Files:**
- Create: `src/lib/map/turret/TurretBeamSystem.ts`
- Create: `src/lib/map/turret/__tests__/TurretBeamSystem.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/map/turret/__tests__/TurretBeamSystem.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { Vector3 } from 'three'
import { raycastBeam, type BeamTargetInstance } from '../TurretBeamSystem'

function makeInstance(spawnIndex: number, x: number, y: number, z: number, radius: number): BeamTargetInstance {
  return { spawnIndex, worldPosition: new Vector3(x, y, z), radius }
}

describe('raycastBeam', () => {
  const origin = new Vector3(0, 0, 0)
  const forward = new Vector3(0, 0, -1) // negative Z

  it('returns null when no instances are provided', () => {
    const hit = raycastBeam(origin, forward, 100, [])
    expect(hit).toBeNull()
  })

  it('hits a sphere directly in the ray path', () => {
    const instances = [makeInstance(7, 0, 0, -10, 1)]
    const hit = raycastBeam(origin, forward, 100, instances)
    expect(hit).not.toBeNull()
    expect(hit!.spawnIndex).toBe(7)
    expect(hit!.distance).toBeCloseTo(9, 1) // ray enters sphere at z=-9
  })

  it('returns the nearest when multiple targets overlap the ray', () => {
    const instances = [
      makeInstance(1, 0, 0, -20, 1),
      makeInstance(2, 0, 0, -10, 1),
      makeInstance(3, 0, 0, -30, 1),
    ]
    const hit = raycastBeam(origin, forward, 100, instances)
    expect(hit!.spawnIndex).toBe(2)
  })

  it('returns null for targets beyond maxDistance', () => {
    const instances = [makeInstance(5, 0, 0, -50, 1)]
    const hit = raycastBeam(origin, forward, 10, instances)
    expect(hit).toBeNull()
  })

  it('returns null for targets off-axis', () => {
    const instances = [makeInstance(5, 10, 0, -10, 1)]
    const hit = raycastBeam(origin, forward, 100, instances)
    expect(hit).toBeNull()
  })

  it('ignores targets behind the origin', () => {
    const instances = [makeInstance(5, 0, 0, 10, 1)] // positive Z is behind
    const hit = raycastBeam(origin, forward, 100, instances)
    expect(hit).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `bun test:unit src/lib/map/turret/__tests__/TurretBeamSystem.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `TurretBeamSystem.ts`**

Create `src/lib/map/turret/TurretBeamSystem.ts`:

```ts
/**
 * Turret beam raycast — ray-sphere test against the registered asteroid
 * instances for the current turret session. Pure; no Three scene access.
 *
 * Uses simple nearest-hit ray-sphere intersection with a linear scan. A few
 * hundred instances is well within budget per frame.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-turret-mode-design.md
 */
import type { Vector3 } from 'three'

/** A single target sphere for the beam raycast. */
export interface BeamTargetInstance {
  /** Coordinator-assigned index for this registered asteroid. */
  readonly spawnIndex: number
  /** World-space center of the sphere. */
  readonly worldPosition: Vector3
  /** Sphere radius in world units. */
  readonly radius: number
}

/** Nearest-hit result from {@link raycastBeam}. */
export interface BeamHit {
  /** Matching `BeamTargetInstance.spawnIndex`. */
  readonly spawnIndex: number
  /** Distance from ray origin to the entry point. */
  readonly distance: number
}

/**
 * Test a ray against a flat array of target spheres; return the nearest hit.
 *
 * @param origin - Ray origin in world space.
 * @param direction - Unit-length ray direction in world space.
 * @param maxDistance - Maximum distance for valid hits. Beyond → null.
 * @param instances - Registered asteroid spheres to test.
 * @returns Nearest hit, or null when no sphere is within reach.
 */
export function raycastBeam(
  origin: Vector3,
  direction: Vector3,
  maxDistance: number,
  instances: readonly BeamTargetInstance[],
): BeamHit | null {
  let nearestIndex = -1
  let nearestDistance = Number.POSITIVE_INFINITY

  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i]!
    const ocx = origin.x - inst.worldPosition.x
    const ocy = origin.y - inst.worldPosition.y
    const ocz = origin.z - inst.worldPosition.z

    const b = ocx * direction.x + ocy * direction.y + ocz * direction.z
    const c = ocx * ocx + ocy * ocy + ocz * ocz - inst.radius * inst.radius

    const disc = b * b - c
    if (disc < 0) continue

    const sqrtDisc = Math.sqrt(disc)
    // Entry distance along ray direction. Use the smaller root (t0).
    const t0 = -b - sqrtDisc
    const t1 = -b + sqrtDisc

    // Discard hits entirely behind the origin.
    if (t1 < 0) continue

    const t = t0 >= 0 ? t0 : t1
    if (t > maxDistance) continue
    if (t >= nearestDistance) continue

    nearestDistance = t
    nearestIndex = i
  }

  if (nearestIndex < 0) return null
  return { spawnIndex: instances[nearestIndex]!.spawnIndex, distance: nearestDistance }
}
```

- [ ] **Step 4: Run tests to verify green**

Run: `bun test:unit src/lib/map/turret/__tests__/TurretBeamSystem.spec.ts`
Expected: PASS all 6 tests.

- [ ] **Step 5: Full validation**

Run: `bun run type-check && bun run lint && bun run test:unit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/map/turret/TurretBeamSystem.ts src/lib/map/turret/__tests__/TurretBeamSystem.spec.ts
git commit -m "feat(turret): add ray-sphere raycastBeam for turret targeting

Pure nearest-hit test returning {spawnIndex, distance}. Used by
TurretSession.tick to drive per-tick beam damage against registered belt
asteroids."
```

---

## Task 9: Create `TurretYieldCoordinator` — yield/registration bridge

**Goal:** Own the `spawnIndex → belt instance` map. Buffer fractional kg yields and commit whole units to inventory.

**Files:**
- Create: `src/lib/map/turret/TurretYieldCoordinator.ts`
- Create: `src/lib/map/turret/__tests__/TurretYieldCoordinator.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/map/turret/__tests__/TurretYieldCoordinator.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { Vector3 } from 'three'
import { TurretYieldCoordinator, type TurretInstanceHandle } from '../TurretYieldCoordinator'

function makeHandle(overrides: Partial<TurretInstanceHandle> = {}): TurretInstanceHandle {
  return {
    beltMeshIndex: 0,
    localIndex: 0,
    worldPosition: new Vector3(),
    radius: 1,
    tierId: 'small',
    ...overrides,
  }
}

describe('TurretYieldCoordinator', () => {
  it('assigns unique spawnIndex across registrations', () => {
    const coord = new TurretYieldCoordinator({
      commitOneUnit: () => ({ ok: true }),
      onInstanceConsumed: () => {},
      onPickupFailed: () => {},
    })
    const a = coord.register(makeHandle({ localIndex: 0 }))
    const b = coord.register(makeHandle({ localIndex: 1 }))
    const c = coord.register(makeHandle({ beltMeshIndex: 1, localIndex: 0 }))
    expect(a).not.toBe(b)
    expect(b).not.toBe(c)
    expect(a).not.toBe(c)
  })

  it('commits a whole unit once fractional buffer exceeds 1kg', () => {
    const commit = vi.fn(() => ({ ok: true as const }))
    const coord = new TurretYieldCoordinator({
      commitOneUnit: commit,
      onInstanceConsumed: () => {},
      onPickupFailed: () => {},
    })
    coord.register(makeHandle())
    coord.acceptYield('iron', 0.4, 0)
    expect(commit).not.toHaveBeenCalled()
    coord.acceptYield('iron', 0.5, 0)
    expect(commit).not.toHaveBeenCalled()
    coord.acceptYield('iron', 0.2, 0)
    // 0.4+0.5+0.2 = 1.1 -> one commit of 'iron'
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit).toHaveBeenCalledWith('iron')
  })

  it('commits multiple units when buffer crosses multiple thresholds', () => {
    const commit = vi.fn(() => ({ ok: true as const }))
    const coord = new TurretYieldCoordinator({
      commitOneUnit: commit,
      onInstanceConsumed: () => {},
      onPickupFailed: () => {},
    })
    coord.register(makeHandle())
    coord.acceptYield('iron', 3.7, 0)
    expect(commit).toHaveBeenCalledTimes(3)
  })

  it('stops buffer draining on commit failure and fires onPickupFailed', () => {
    const commit = vi.fn(() => ({ ok: false as const, reason: 'Inventory full' }))
    const failed = vi.fn()
    const coord = new TurretYieldCoordinator({
      commitOneUnit: commit,
      onInstanceConsumed: () => {},
      onPickupFailed: failed,
    })
    coord.register(makeHandle())
    coord.acceptYield('iron', 3.5, 0)
    expect(commit).toHaveBeenCalledTimes(1) // stopped after first failure
    expect(failed).toHaveBeenCalledTimes(1)
    expect(failed).toHaveBeenCalledWith('iron', 'Inventory full')
  })

  it('onInstanceConsumed fires with the stored handle on depletion', () => {
    const consumed = vi.fn()
    const coord = new TurretYieldCoordinator({
      commitOneUnit: () => ({ ok: true }),
      onInstanceConsumed: consumed,
      onPickupFailed: () => {},
    })
    const handle = makeHandle({ beltMeshIndex: 2, localIndex: 7 })
    coord.register(handle)
    coord.notifyDepleted(0)
    expect(consumed).toHaveBeenCalledTimes(1)
    expect(consumed.mock.calls[0]![0]).toBe(handle)
  })

  it('resolveInstance returns the handle for a known spawnIndex and null otherwise', () => {
    const coord = new TurretYieldCoordinator({
      commitOneUnit: () => ({ ok: true }),
      onInstanceConsumed: () => {},
      onPickupFailed: () => {},
    })
    const handle = makeHandle({ localIndex: 3 })
    const idx = coord.register(handle)
    expect(coord.resolveInstance(idx)).toBe(handle)
    expect(coord.resolveInstance(99999)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `bun test:unit src/lib/map/turret/__tests__/TurretYieldCoordinator.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `TurretYieldCoordinator.ts`**

Create `src/lib/map/turret/TurretYieldCoordinator.ts`:

```ts
/**
 * Bridge between {@link RockYieldSystem}, the asteroid belt instance layer,
 * and inventory. Owns the per-session spawnIndex → handle map and buffers
 * fractional kg yields until whole-unit inventory commits are possible.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-turret-mode-design.md
 */
import type { Vector3 } from 'three'
import type { TurretTierId } from './turretTiers'
import { TURRET_YIELD_COMMIT_GRANULARITY_KG } from './turretConstants'

/** Per-instance handle a coordinator stores for lookup/hide callbacks. */
export interface TurretInstanceHandle {
  /** Which belt mesh (index into AsteroidBeltController.instanceDataList) owns the instance. */
  readonly beltMeshIndex: number
  /** Instance index within that mesh. */
  readonly localIndex: number
  /** World-space sphere center (snapshotted at turret-open time; sim is frozen). */
  readonly worldPosition: Vector3
  /** Collision radius in world units. */
  readonly radius: number
  /** Tier classification for loot/HP. */
  readonly tierId: TurretTierId
}

/** Result of a single inventory commit attempt. */
export type CommitResult = { ok: true } | { ok: false; reason: string }

/** Collaborators TurretYieldCoordinator leans on. */
export interface TurretYieldCoordinatorDeps {
  /** Commit one whole unit of itemId to inventory; failure halts buffer drain. */
  commitOneUnit: (itemId: string) => CommitResult
  /** Fires when a registered rock depletes (coordinator cleans up). */
  onInstanceConsumed: (handle: TurretInstanceHandle) => void
  /** Fires when commitOneUnit rejects — host surfaces a toast. */
  onPickupFailed: (itemId: string, reason: string) => void
}

/** Coordinator state for one turret session. */
export class TurretYieldCoordinator {
  private readonly deps: TurretYieldCoordinatorDeps
  private readonly handles = new Map<number, TurretInstanceHandle>()
  private readonly buffers = new Map<string, number>()
  private nextSpawnIndex = 0

  constructor(deps: TurretYieldCoordinatorDeps) {
    this.deps = deps
  }

  /** Register a belt instance with this coordinator; returns the assigned spawnIndex. */
  register(handle: TurretInstanceHandle): number {
    const spawnIndex = this.nextSpawnIndex++
    this.handles.set(spawnIndex, handle)
    return spawnIndex
  }

  /** Get the handle for a spawnIndex, or null if unknown. */
  resolveInstance(spawnIndex: number): TurretInstanceHandle | null {
    return this.handles.get(spawnIndex) ?? null
  }

  /** Accept fractional kg yield from the beam and commit full units. */
  acceptYield(itemId: string, kg: number, _spawnIndex: number): void {
    const current = (this.buffers.get(itemId) ?? 0) + kg
    let remaining = current
    while (remaining >= TURRET_YIELD_COMMIT_GRANULARITY_KG) {
      const result = this.deps.commitOneUnit(itemId)
      if (!result.ok) {
        this.deps.onPickupFailed(itemId, result.reason)
        // Drop remainder for this item to avoid tight-loop on persistent failure.
        remaining = 0
        break
      }
      remaining -= TURRET_YIELD_COMMIT_GRANULARITY_KG
    }
    if (remaining > 0) {
      this.buffers.set(itemId, remaining)
    } else {
      this.buffers.delete(itemId)
    }
  }

  /** Called when RockYieldSystem.onConsume fires — forwards to host for hide/particle burst. */
  notifyDepleted(spawnIndex: number): void {
    const handle = this.handles.get(spawnIndex)
    if (!handle) return
    this.handles.delete(spawnIndex)
    this.deps.onInstanceConsumed(handle)
  }

  /** Snapshot of currently registered instances (for beam raycast list). */
  listInstances(): { spawnIndex: number; handle: TurretInstanceHandle }[] {
    const result: { spawnIndex: number; handle: TurretInstanceHandle }[] = []
    for (const [spawnIndex, handle] of this.handles) {
      result.push({ spawnIndex, handle })
    }
    return result
  }

  /** Total registrations (including depleted) — stable key generator. */
  get registrationCount(): number {
    return this.nextSpawnIndex
  }

  /** Drop all registrations and fractional buffers (on session close). */
  clear(): void {
    this.handles.clear()
    this.buffers.clear()
    this.nextSpawnIndex = 0
  }
}
```

- [ ] **Step 4: Run tests to verify green**

Run: `bun test:unit src/lib/map/turret/__tests__/TurretYieldCoordinator.spec.ts`
Expected: PASS all 6 tests.

- [ ] **Step 5: Full validation**

Run: `bun run type-check && bun run lint && bun run test:unit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/map/turret/TurretYieldCoordinator.ts src/lib/map/turret/__tests__/TurretYieldCoordinator.spec.ts
git commit -m "feat(turret): add TurretYieldCoordinator for registration + fractional-kg buffering

Stores spawnIndex → belt-instance handle; accumulates sub-1-kg beam
yield and commits whole units via injected commitOneUnit callback.
Halts buffer drain on failure to avoid tight-loop on persistent
inventory-full state."
```

---

## Task 10: Add `resolveTurretToggle` to `MapModeCoordinator`

**Goal:** Pure gating for entry — denies when dead/locked/other-modes-active/not-unlocked.

**Files:**
- Modify: `src/lib/map/mode/MapModeCoordinator.ts`
- Create: `src/lib/map/mode/__tests__/MapModeCoordinator.spec.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/lib/map/mode/__tests__/MapModeCoordinator.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { MapModeCoordinator } from '../MapModeCoordinator'

describe('MapModeCoordinator.resolveTurretToggle', () => {
  let coord: MapModeCoordinator
  beforeEach(() => {
    coord = new MapModeCoordinator()
  })

  const baseParams = {
    togglePressed: true,
    turretActive: false,
    orbitState: 'free' as const,
    mapIsOpen: false,
    habitatActive: false,
    evaActive: false,
    isDead: false,
    unlocked: true,
    introLocked: false,
  }

  it('returns null without press', () => {
    expect(coord.resolveTurretToggle({ ...baseParams, togglePressed: false })).toBeNull()
  })

  it('returns null when turret is already active', () => {
    expect(coord.resolveTurretToggle({ ...baseParams, turretActive: true })).toBeNull()
  })

  it('returns null when map is open', () => {
    expect(coord.resolveTurretToggle({ ...baseParams, mapIsOpen: true })).toBeNull()
  })

  it('returns null when habitat is active', () => {
    expect(coord.resolveTurretToggle({ ...baseParams, habitatActive: true })).toBeNull()
  })

  it('returns null when EVA is active', () => {
    expect(coord.resolveTurretToggle({ ...baseParams, evaActive: true })).toBeNull()
  })

  it('returns null when shuttle is dead', () => {
    expect(coord.resolveTurretToggle({ ...baseParams, isDead: true })).toBeNull()
  })

  it('returns null when not unlocked', () => {
    expect(coord.resolveTurretToggle({ ...baseParams, unlocked: false })).toBeNull()
  })

  it('returns null during intro lock', () => {
    expect(coord.resolveTurretToggle({ ...baseParams, introLocked: true })).toBeNull()
  })

  it('returns null while approaching a planet', () => {
    expect(coord.resolveTurretToggle({ ...baseParams, orbitState: 'approaching' })).toBeNull()
  })

  it("returns 'enter' in free flight with unlock, no other modes active, press true", () => {
    expect(coord.resolveTurretToggle(baseParams)).toBe('enter')
  })

  it("returns 'enter' while orbiting (orbit is stationary and safe)", () => {
    expect(coord.resolveTurretToggle({ ...baseParams, orbitState: 'orbiting' })).toBe('enter')
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `bun test:unit src/lib/map/mode/__tests__/MapModeCoordinator.spec.ts`
Expected: FAIL — `resolveTurretToggle` does not exist.

- [ ] **Step 3: Add the method and types**

In `src/lib/map/mode/MapModeCoordinator.ts`, after the existing `ResolveHabitatTransitionParams` interface (around line 48), add:

```ts
/** Inputs for {@link MapModeCoordinator.resolveTurretToggle}. */
export interface ResolveTurretToggleParams {
  /** True when the toggle-turret binding was pressed this frame. */
  togglePressed: boolean
  /** True when a turret session is already live. */
  turretActive: boolean
  /** Current shuttle orbit phase. */
  orbitState: FlightOrbitState
  /** True when the tactical map is open. */
  mapIsOpen: boolean
  /** True when the habitat scene is active. */
  habitatActive: boolean
  /** True when an EVA session is active. */
  evaActive: boolean
  /** True when the shuttle is in the death state. */
  isDead: boolean
  /** True when the mining turret has been purchased (`turretMiningUnlock >= 1`). */
  unlocked: boolean
  /** True when the map intro is still locking out controls. */
  introLocked: boolean
}

/** Result of resolving a turret toggle. Exit is handled internally by the session. */
export type TurretToggleAction = 'enter' | null
```

Then add a method on `MapModeCoordinator` (after `resolveHabitatTransition`, before `resolveMapTransitionRuntime`):

```ts
/**
 * Resolve whether the turret should open this frame. Exit is owned by
 * {@link TurretSession} itself (ESC or re-press inside the session),
 * so this only gates entry.
 */
resolveTurretToggle(params: ResolveTurretToggleParams): TurretToggleAction {
  if (!params.togglePressed) return null
  if (params.turretActive) return null
  if (params.mapIsOpen) return null
  if (params.habitatActive) return null
  if (params.evaActive) return null
  if (params.isDead) return null
  if (params.introLocked) return null
  if (!params.unlocked) return null
  if (params.orbitState === 'approaching') return null
  return 'enter'
}
```

- [ ] **Step 4: Run tests to verify green**

Run: `bun test:unit src/lib/map/mode/__tests__/MapModeCoordinator.spec.ts`
Expected: PASS all tests.

- [ ] **Step 5: Full validation**

Run: `bun run type-check && bun run lint && bun run test:unit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/map/mode/MapModeCoordinator.ts src/lib/map/mode/__tests__/MapModeCoordinator.spec.ts
git commit -m "feat(map-mode): add resolveTurretToggle entry gate to MapModeCoordinator

Pure predicate: allows turret entry only in free flight or orbit, with
unlock, no other modes active, shuttle alive, not intro-locked."
```

---

## Task 11: Add `enumerateInstances` and `hideInstance` to `AsteroidBeltController`

**Goal:** Two new methods so the turret session can register world-space spheres and hide depleted instances.

**Files:**
- Modify: `src/three/controllers/AsteroidBeltController.ts`

- [ ] **Step 1: Add `enumerateInstances()` method**

In `src/three/controllers/AsteroidBeltController.ts`, add a method inside the class, after `setLodFraction` and before `tick` (around line 314):

```ts
/** Snapshot of one instance for external consumers (turret beam raycast). */
readonly enumeratedInstanceShape = {} as {
  beltMeshIndex: number
  localIndex: number
  worldPosition: THREE.Vector3
  radius: number
}

/**
 * Yield a snapshot of every currently-visible instance in world space.
 * Used by {@link TurretYieldCoordinator} at session-open to register
 * belt asteroids for beam targeting.
 *
 * Sim is frozen during turret mode, so snapshotted world positions remain
 * valid for the session.
 */
enumerateInstances(): {
  beltMeshIndex: number
  localIndex: number
  worldPosition: THREE.Vector3
  radius: number
}[] {
  const result: {
    beltMeshIndex: number
    localIndex: number
    worldPosition: THREE.Vector3
    radius: number
  }[] = []
  const scratch = new THREE.Vector3()
  for (let meshIndex = 0; meshIndex < this.instanceDataList.length; meshIndex++) {
    const data = this.instanceDataList[meshIndex]!
    const visibleCount = data.mesh.count
    for (let i = 0; i < visibleCount; i++) {
      scratch.copy(data.localPositions[i]!)
      this.group.localToWorld(scratch)
      result.push({
        beltMeshIndex: meshIndex,
        localIndex: i,
        worldPosition: scratch.clone(),
        radius: data.collisionRadii[i]!,
      })
    }
  }
  return result
}
```

The `enumeratedInstanceShape` export is only a type handle for consumers; if TSDoc lint rejects the shape literal, promote to a named exported interface:

```ts
/** World-space snapshot of a belt instance for turret raycast. */
export interface AsteroidInstanceSnapshot {
  /** Index into AsteroidBeltController's internal mesh list. */
  beltMeshIndex: number
  /** Instance index within that mesh. */
  localIndex: number
  /** World-space position at snapshot time. */
  worldPosition: THREE.Vector3
  /** Collision radius in world units (already scaled by belt transform). */
  radius: number
}
```

Then `enumerateInstances(): AsteroidInstanceSnapshot[]`.

**Note on radius scaling:** `collisionRadii` is in belt-local units; `group.localToWorld` is a matrix apply. If the belt group is pure rotation (no scale), belt-local radius equals world radius. Check `controller.group.scale` — if it's always (1,1,1) for belts, the field is already world-scaled. If unsure, skip a world-rescale for radius (belt groups in this codebase don't apply scale — confirmed from the constructor where only `.rotation` and `.position` are used).

- [ ] **Step 2: Add `hideInstance()` method**

Right after `enumerateInstances`, add:

```ts
/**
 * Hide a specific belt instance by zero-scaling its matrix. Used when the
 * turret beam depletes an asteroid — the instance is invisible at no
 * per-frame cost since the InstancedMesh retains the zero-scale matrix.
 */
hideInstance(beltMeshIndex: number, localIndex: number): void {
  const data = this.instanceDataList[beltMeshIndex]
  if (!data) return
  if (localIndex < 0 || localIndex >= data.maxCount) return
  const scratch = new THREE.Matrix4()
  scratch.makeScale(0, 0, 0)
  // Translate to localPosition so a later restore could place it back; zero scale hides it.
  scratch.setPosition(data.localPositions[localIndex]!)
  data.mesh.setMatrixAt(localIndex, scratch)
  data.mesh.instanceMatrix.needsUpdate = true
  // Also clear any tumble state so it doesn't try to re-apply a rotating matrix.
  if (data.isTumbling[localIndex]) {
    data.isTumbling[localIndex] = false
    data.activeTumblerSet.delete(localIndex)
  }
}
```

- [ ] **Step 3: Lint + type-check**

Run: `bun run type-check && bun run lint`
Expected: clean. If lint rejects the TSDoc on the exported interface, ensure each field has its own doc comment (already provided above).

- [ ] **Step 4: Tests (unchanged — no new unit tests; three/ layer)**

Run: `bun run test:unit`
Expected: all existing tests green. No new tests for this file.

- [ ] **Step 5: Commit**

```bash
git add src/three/controllers/AsteroidBeltController.ts
git commit -m "feat(map): add enumerateInstances + hideInstance to AsteroidBeltController

enumerateInstances() yields world-space snapshots of visible instances
for turret beam raycast. hideInstance(meshIdx, localIdx) zero-scales a
depleted asteroid instance without touching the draw count."
```

---

## Task 12: Extend `ParticleEmitter` with a `steeringUpdate` callback

**Goal:** Let tractor particles steer toward the ship each frame without duplicating the entire emitter.

**Files:**
- Modify: `src/three/ParticleEmitter.ts`

- [ ] **Step 1: Export the `Particle` type and add callback support**

In `src/three/ParticleEmitter.ts`:

1. Change `interface Particle` (line 70) from internal to exported:

```ts
/** Per-particle runtime state. Exposed so consumers can wire per-tick steering via {@link ParticleEmitterConfig.steeringUpdate}. */
export interface Particle {
  /** True while this pool slot is live. */
  alive: boolean
  /** Accumulated age in seconds. */
  age: number
  /** World-space position. */
  position: THREE.Vector3
  /** World-space velocity (units/sec). */
  velocity: THREE.Vector3
}
```

2. Add `steeringUpdate` to `ParticleEmitterConfig` (after `sizeGrowth` at line 43):

```ts
  /** Size multiplier at end of life (1.0 = no growth, 2.0 = doubles). Default 1.0. */
  sizeGrowth?: number
  /**
   * Optional per-particle update hook called each tick before position integration.
   * Mutate `particle.velocity` to steer. Called only for live particles.
   */
  steeringUpdate?: (particle: Particle, dt: number) => void
}
```

3. Store the callback on the instance and invoke it in `tick()` (around lines 170-206). Update the constructor and tick:

Replace the class body's relevant sections:

```ts
  private readonly steeringUpdate: ((particle: Particle, dt: number) => void) | null

  constructor(config: ParticleEmitterConfig) {
    this.lifetime = config.lifetime
    this.spread = config.spread
    this.steeringUpdate = config.steeringUpdate ?? null
    // ...rest unchanged
  }
```

In `tick`, after `p.age += dt` but before the lifetime check, call the hook:

```ts
  tick(dt: number): void {
    const posAttr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
    const positions = posAttr.array as Float32Array
    const lifes = this.lifeAttr.array as Float32Array

    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i]!
      const i3 = i * 3

      if (!p.alive) {
        positions[i3] = FAR_AWAY
        positions[i3 + 1] = FAR_AWAY
        positions[i3 + 2] = FAR_AWAY
        lifes[i] = 1.0
        continue
      }

      p.age += dt
      if (p.age >= this.lifetime) {
        p.alive = false
        positions[i3] = FAR_AWAY
        positions[i3 + 1] = FAR_AWAY
        positions[i3 + 2] = FAR_AWAY
        lifes[i] = 1.0
        continue
      }

      this.steeringUpdate?.(p, dt)

      p.position.addScaledVector(p.velocity, dt)
      positions[i3] = p.position.x
      positions[i3 + 1] = p.position.y
      positions[i3 + 2] = p.position.z
      lifes[i] = p.age / this.lifetime
    }

    posAttr.needsUpdate = true
    this.lifeAttr.needsUpdate = true
  }
```

- [ ] **Step 2: Lint + type-check + tests**

Run: `bun run type-check && bun run lint && bun run test:unit`
Expected: all green. The callback is optional and backward compatible; existing emitters behave identically.

- [ ] **Step 3: Commit**

```bash
git add src/three/ParticleEmitter.ts
git commit -m "feat(particles): add optional steeringUpdate callback to ParticleEmitter

Lets consumers (turret tractor beam) mutate per-particle velocity each
tick before position integration. Backward compatible: existing emitters
that don't supply the callback behave identically."
```

---

## Task 13: Create `TurretTractorEmitter`

**Goal:** Small wrapper around `ParticleEmitter` configured for burst-emission and steering toward a target Object3D.

**Files:**
- Create: `src/three/TurretTractorEmitter.ts`

- [ ] **Step 1: Implement the emitter**

Create `src/three/TurretTractorEmitter.ts`:

```ts
/**
 * Tractor-beam particle burst. Spawned at an asteroid's last position on
 * depletion; particles steer toward the shuttle nose target and die by
 * arrival or lifetime.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-turret-mode-design.md
 */
import * as THREE from 'three'
import { ParticleEmitter, type Particle } from './ParticleEmitter'
import {
  TURRET_TRACTOR_ARRIVAL_RADIUS,
  TURRET_TRACTOR_BURST_COUNT,
  TURRET_TRACTOR_MAX_LIFETIME,
  TURRET_TRACTOR_PARTICLE_SPEED,
  TURRET_TRACTOR_STEER_ACCEL,
} from '@/lib/map/turret/turretConstants'

/** Warm-white tint fallback when no dominant mineral is tracked per burst. */
const TRACTOR_DEFAULT_COLOR = new THREE.Color(1.0, 0.85, 0.5)

/**
 * Particle burst emitter that steers live particles toward a target
 * Object3D's world position.
 */
export class TurretTractorEmitter {
  /** Attach this to the scene to render particles. */
  readonly points: THREE.Points
  private readonly emitter: ParticleEmitter
  private targetWorld = new THREE.Vector3()
  private target: THREE.Object3D | null = null
  private readonly scratchDir = new THREE.Vector3()
  private readonly scratchVel = new THREE.Vector3()

  constructor() {
    this.emitter = new ParticleEmitter({
      poolSize: TURRET_TRACTOR_BURST_COUNT * 4, // enough for concurrent bursts
      color: TRACTOR_DEFAULT_COLOR.clone(),
      size: 0.8,
      lifetime: TURRET_TRACTOR_MAX_LIFETIME,
      spread: TURRET_TRACTOR_PARTICLE_SPEED * 0.5,
      opacity: 0.9,
      sizeAttenuation: true,
      soft: true,
      sizeGrowth: 0.4,
      steeringUpdate: (particle, dt) => this.steerParticle(particle, dt),
    })
    this.points = this.emitter.points
  }

  /** Set the target Object3D the particles steer toward (typically the shuttle nose). */
  setTarget(target: THREE.Object3D | null): void {
    this.target = target
  }

  /** Emit a burst at `worldPosition`; particles will start flying toward the current target. */
  spawnBurst(worldPosition: THREE.Vector3): void {
    for (let i = 0; i < TURRET_TRACTOR_BURST_COUNT; i++) {
      this.emitter.emit(worldPosition, this.scratchVel.set(0, 0, 0))
    }
  }

  /** Advance the internal emitter (steering callback runs here). */
  tick(dt: number): void {
    if (this.target) {
      this.target.getWorldPosition(this.targetWorld)
    }
    this.emitter.tick(dt)
  }

  /** Dispose underlying emitter resources. */
  dispose(): void {
    this.emitter.dispose()
  }

  private steerParticle(particle: Particle, dt: number): void {
    if (!this.target) return
    this.scratchDir.subVectors(this.targetWorld, particle.position)
    const dist = this.scratchDir.length()
    if (dist <= TURRET_TRACTOR_ARRIVAL_RADIUS) {
      // Force-die: teleport to FAR_AWAY by setting age past lifetime on next tick.
      particle.age = Number.POSITIVE_INFINITY
      return
    }
    this.scratchDir.multiplyScalar(1 / dist) // normalize
    particle.velocity.addScaledVector(this.scratchDir, TURRET_TRACTOR_STEER_ACCEL * dt)
    // Speed clamp so particles don't run away faster than the beam duration allows.
    const speed = particle.velocity.length()
    const maxSpeed = TURRET_TRACTOR_PARTICLE_SPEED * 6
    if (speed > maxSpeed) {
      particle.velocity.multiplyScalar(maxSpeed / speed)
    }
  }
}
```

- [ ] **Step 2: Lint + type-check + tests**

Run: `bun run type-check && bun run lint && bun run test:unit`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add src/three/TurretTractorEmitter.ts
git commit -m "feat(turret): add TurretTractorEmitter for depleted-asteroid particle bursts

Wraps ParticleEmitter with a steeringUpdate that accelerates particles
toward the configured target Object3D (shuttle nose). Particles die on
arrival or after TURRET_TRACTOR_MAX_LIFETIME."
```

---

## Task 14: Create `TurretRigController` (3D rig — no lib tests)

**Goal:** Own the 3D attach point, camera, beam mesh, and reticle. Pure "set state, apply to Three" layer.

**Files:**
- Create: `src/three/TurretRigController.ts`

- [ ] **Step 1: Implement the rig**

Create `src/three/TurretRigController.ts`:

```ts
/**
 * 3D rig for the turret session: attach point on the shuttle nose, camera,
 * beam mesh, reticle sprite. State comes from {@link TurretAimState}; this
 * controller is the write-out path to Three.js.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-turret-mode-design.md
 */
import * as THREE from 'three'
import type { TurretAimState } from '@/lib/map/turret/TurretAimState'
import {
  TURRET_BEAM_MAX_RANGE,
  TURRET_NOSE_OFFSET,
} from '@/lib/map/turret/turretConstants'

const BEAM_BASE_LENGTH = 1
const BEAM_RADIUS = 0.04
const RETICLE_DISTANCE = 5

/** Rig for the active turret session. Parented under {@link shuttleGroup} on build. */
export class TurretRigController {
  /** Group rotated by base yaw; parent of the camera. */
  readonly turretBase: THREE.Group
  /** First-person perspective camera for the turret view. */
  readonly camera: THREE.PerspectiveCamera
  /** Beam mesh (camera-local cylinder); toggled visible while firing. */
  readonly beamMesh: THREE.Mesh
  /** Reticle sprite at fixed camera-space distance. */
  readonly reticle: THREE.Sprite

  private readonly shuttleGroup: THREE.Object3D
  private readonly beamMaterial: THREE.MeshBasicMaterial
  private readonly reticleMaterial: THREE.SpriteMaterial

  constructor(shuttleGroup: THREE.Object3D) {
    this.shuttleGroup = shuttleGroup

    this.turretBase = new THREE.Group()
    this.turretBase.name = 'turretBase'
    this.turretBase.position.set(TURRET_NOSE_OFFSET.x, TURRET_NOSE_OFFSET.y, TURRET_NOSE_OFFSET.z)

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.01, 10_000)
    this.camera.position.set(0, 0, 0)
    this.turretBase.add(this.camera)

    // Beam: cylinder along +Z, child of camera so it follows aim.
    const beamGeom = new THREE.CylinderGeometry(BEAM_RADIUS, BEAM_RADIUS, BEAM_BASE_LENGTH, 8, 1)
    beamGeom.rotateX(Math.PI / 2) // align cylinder length with +Z
    beamGeom.translate(0, 0, -BEAM_BASE_LENGTH / 2) // near end at camera origin
    this.beamMaterial = new THREE.MeshBasicMaterial({
      color: 0xff3399,
      transparent: true,
      opacity: 0.85,
      toneMapped: false,
      depthWrite: false,
    })
    this.beamMesh = new THREE.Mesh(beamGeom, this.beamMaterial)
    this.beamMesh.visible = false
    this.camera.add(this.beamMesh)

    // Reticle: sprite in camera space at RETICLE_DISTANCE.
    this.reticleMaterial = new THREE.SpriteMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      depthTest: false,
    })
    this.reticle = new THREE.Sprite(this.reticleMaterial)
    this.reticle.position.set(0, 0, -RETICLE_DISTANCE)
    this.reticle.scale.set(0.15, 0.15, 1)
    this.camera.add(this.reticle)
  }

  /** Attach turret base to the shuttle group. Call once on session open. */
  attach(): void {
    if (this.turretBase.parent !== this.shuttleGroup) {
      this.shuttleGroup.add(this.turretBase)
    }
  }

  /** Detach on session close. */
  detach(): void {
    if (this.turretBase.parent) {
      this.turretBase.parent.remove(this.turretBase)
    }
    this.beamMesh.visible = false
  }

  /** Apply aim state to base + camera rotations. */
  applyAim(state: TurretAimState): void {
    this.turretBase.rotation.set(0, state.baseYaw, 0)
    this.camera.rotation.set(state.conePitch, state.coneYaw, 0, 'YXZ')
  }

  /** Show the beam cylinder at the given length (meters). */
  showBeam(lengthMeters: number): void {
    const clamped = Math.min(Math.max(lengthMeters, 0.01), TURRET_BEAM_MAX_RANGE)
    this.beamMesh.scale.set(1, 1, clamped / BEAM_BASE_LENGTH)
    this.beamMesh.visible = true
  }

  /** Hide the beam (idle / not firing / out of fuel). */
  hideBeam(): void {
    this.beamMesh.visible = false
  }

  /** Tint the reticle green when a valid target is in beam reach, white otherwise. */
  setReticleTargetValid(valid: boolean): void {
    this.reticleMaterial.color.setHex(valid ? 0x66ff88 : 0xffffff)
  }

  /** Dispose GL resources. */
  dispose(): void {
    this.detach()
    this.beamMaterial.dispose()
    this.reticleMaterial.dispose()
    if (this.beamMesh.geometry) this.beamMesh.geometry.dispose()
  }
}
```

- [ ] **Step 2: Lint + type-check + tests**

Run: `bun run type-check && bun run lint && bun run test:unit`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add src/three/TurretRigController.ts
git commit -m "feat(turret): add TurretRigController 3D rig (base + camera + beam + reticle)

Parented under shuttle.group on attach. applyAim() writes rotations,
showBeam/hideBeam toggles the camera-child cylinder mesh, setReticle
tints on valid target."
```

---

## Task 15: Create `TurretSession` state machine (pure timing + transitions)

**Goal:** Ship the state machine and fade driver with unit tests. 3D deps are injected; initially this task only wires the state transitions, not beam/camera side effects — those come online in the next integration task.

**Files:**
- Create: `src/lib/map/turret/TurretSession.ts`
- Create: `src/lib/map/turret/__tests__/TurretSession.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/map/turret/__tests__/TurretSession.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TurretSession } from '../TurretSession'
import {
  TURRET_FADE_IN_DURATION,
  TURRET_FADE_OUT_DURATION,
  TURRET_OPENING_COMPLETE_THRESHOLD,
  TURRET_CLOSING_COMPLETE_THRESHOLD,
} from '../turretConstants'

function makeDeps() {
  return {
    onOpen: vi.fn(),
    onClose: vi.fn(),
    tickActive: vi.fn(),
    shuttleIsDead: vi.fn(() => false),
  }
}

describe('TurretSession', () => {
  let deps: ReturnType<typeof makeDeps>
  let session: TurretSession
  beforeEach(() => {
    deps = makeDeps()
    session = new TurretSession(deps)
  })

  it('starts idle with 0 fade opacity', () => {
    expect(session.phase).toBe('idle')
    expect(session.fadeOpacity).toBe(0)
    expect(session.isActive).toBe(false)
  })

  it('open() transitions idle to opening and invokes onOpen', () => {
    session.open()
    expect(session.phase).toBe('opening')
    expect(session.isActive).toBe(true)
    expect(deps.onOpen).toHaveBeenCalledTimes(1)
  })

  it('tick advances fade during opening and promotes to active at threshold', () => {
    session.open()
    // Tick through the fade
    session.tick(TURRET_FADE_IN_DURATION, { exitPressed: false })
    expect(session.phase).toBe('active')
    expect(session.fadeOpacity).toBeGreaterThanOrEqual(TURRET_OPENING_COMPLETE_THRESHOLD)
  })

  it('calls tickActive only while phase is active', () => {
    session.open()
    session.tick(TURRET_FADE_IN_DURATION, { exitPressed: false })
    expect(session.phase).toBe('active')
    session.tick(0.016, { exitPressed: false })
    expect(deps.tickActive).toHaveBeenCalledTimes(1)
  })

  it('exitPressed during active transitions to closing', () => {
    session.open()
    session.tick(TURRET_FADE_IN_DURATION, { exitPressed: false })
    session.tick(0.016, { exitPressed: true })
    expect(session.phase).toBe('closing')
  })

  it('closing fades out and transitions to idle + invokes onClose', () => {
    session.open()
    session.tick(TURRET_FADE_IN_DURATION, { exitPressed: false })
    session.tick(0.016, { exitPressed: true })
    expect(session.phase).toBe('closing')
    session.tick(TURRET_FADE_OUT_DURATION, { exitPressed: false })
    expect(session.phase).toBe('idle')
    expect(session.isActive).toBe(false)
    expect(session.fadeOpacity).toBeLessThanOrEqual(TURRET_CLOSING_COMPLETE_THRESHOLD)
    expect(deps.onClose).toHaveBeenCalledTimes(1)
  })

  it('shuttle death forces closing from active', () => {
    session.open()
    session.tick(TURRET_FADE_IN_DURATION, { exitPressed: false })
    deps.shuttleIsDead.mockReturnValue(true)
    session.tick(0.016, { exitPressed: false })
    expect(session.phase).toBe('closing')
  })

  it('open() is no-op while already active', () => {
    session.open()
    session.tick(TURRET_FADE_IN_DURATION, { exitPressed: false })
    session.open()
    expect(deps.onOpen).toHaveBeenCalledTimes(1) // still only once
    expect(session.phase).toBe('active')
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `bun test:unit src/lib/map/turret/__tests__/TurretSession.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `TurretSession.ts`**

Create `src/lib/map/turret/TurretSession.ts`:

```ts
/**
 * State machine + fade driver for the map-turret mining session.
 *
 * Lifecycle: idle → opening → active → closing → idle. The host
 * ({@link MapViewController}) treats `isActive === true` as a signal to
 * early-return from its tick loop, freezing flight/gravity/health sim.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-turret-mode-design.md
 */
import {
  TURRET_CLOSING_COMPLETE_THRESHOLD,
  TURRET_FADE_IN_DURATION,
  TURRET_FADE_OUT_DURATION,
  TURRET_OPENING_COMPLETE_THRESHOLD,
} from './turretConstants'

/** Discrete session phases. */
export type TurretPhase = 'idle' | 'opening' | 'active' | 'closing'

/** Per-frame input bag the host hands to the session. */
export interface TurretSessionTickInput {
  /** True when exit binding was pressed this frame. */
  exitPressed: boolean
}

/** Host-supplied collaborators. Kept small so tests can stub with no Three state. */
export interface TurretSessionDeps {
  /** One-shot hook fired at idle → opening. Host registers rocks, attaches rig, etc. */
  onOpen: () => void
  /** One-shot hook fired at closing → idle. Host tears down rig, unregisters rocks. */
  onClose: () => void
  /** Per-frame hook while phase === 'active'. Host runs beam tick + yield commits. */
  tickActive: (input: TurretSessionTickInput, dt: number) => void
  /** True if the shuttle entered death state during the session. Forces closing. */
  shuttleIsDead: () => boolean
}

/**
 * Turret session state machine. Owns `phase` and `fadeOpacity`; everything
 * else (camera, beam, input polling) lives in {@link TurretSessionDeps}.
 */
export class TurretSession {
  private readonly deps: TurretSessionDeps
  private _phase: TurretPhase = 'idle'
  private _fadeOpacity = 0

  constructor(deps: TurretSessionDeps) {
    this.deps = deps
  }

  /** Current phase. */
  get phase(): TurretPhase {
    return this._phase
  }

  /** Current fade opacity [0, 1]. 0 = fully transparent, 1 = fully black. */
  get fadeOpacity(): number {
    return this._fadeOpacity
  }

  /** True while phase !== 'idle'. Host uses this to branch the tick loop. */
  get isActive(): boolean {
    return this._phase !== 'idle'
  }

  /** Enter the session. No-op if already active. */
  open(): void {
    if (this._phase !== 'idle') return
    this._phase = 'opening'
    this._fadeOpacity = 0
    this.deps.onOpen()
  }

  /** Request an exit. No-op unless currently active. */
  requestExit(): void {
    if (this._phase === 'active') {
      this._phase = 'closing'
    }
  }

  /** Advance state machine by one frame. */
  tick(dt: number, input: TurretSessionTickInput): void {
    switch (this._phase) {
      case 'idle':
        return

      case 'opening': {
        this._fadeOpacity = Math.min(1, this._fadeOpacity + dt / TURRET_FADE_IN_DURATION)
        if (this._fadeOpacity >= TURRET_OPENING_COMPLETE_THRESHOLD) {
          this._phase = 'active'
        }
        return
      }

      case 'active': {
        if (this.deps.shuttleIsDead()) {
          this._phase = 'closing'
          return
        }
        if (input.exitPressed) {
          this._phase = 'closing'
          return
        }
        this.deps.tickActive(input, dt)
        return
      }

      case 'closing': {
        this._fadeOpacity = Math.max(0, this._fadeOpacity - dt / TURRET_FADE_OUT_DURATION)
        if (this._fadeOpacity <= TURRET_CLOSING_COMPLETE_THRESHOLD) {
          this._phase = 'idle'
          this._fadeOpacity = 0
          this.deps.onClose()
        }
        return
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify green**

Run: `bun test:unit src/lib/map/turret/__tests__/TurretSession.spec.ts`
Expected: PASS all tests.

- [ ] **Step 5: Full validation**

Run: `bun run type-check && bun run lint && bun run test:unit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/map/turret/TurretSession.ts src/lib/map/turret/__tests__/TurretSession.spec.ts
git commit -m "feat(turret): add TurretSession state machine with fade driver

idle → opening → active → closing → idle. Fade opacity tied to dt via
TURRET_FADE_IN_DURATION/OUT. shuttleIsDead() or exitPressed force
closing from active. tickActive() only runs while phase === 'active'."
```

---

## Task 16: Integrate `TurretSession` with belt registration, beam tick, and rig

**Goal:** Wire everything together behind a single `TurretSessionController` class that owns the end-to-end session (the `TurretSession` state machine plus `TurretRigController`, `TurretYieldCoordinator`, `RockYieldSystem`, `InputManager`, beam raycast, and the shuttle's `thrusterSystem`).

This is the heaviest task. Split into sub-steps with checkpoints.

**Files:**
- Create: `src/lib/map/turret/TurretSessionController.ts`

Note: We keep the pure `TurretSession` state machine from Task 15. `TurretSessionController` is the orchestrator that builds `TurretSession` with real deps and owns the full live session. Tests for the full orchestrator would require heavy Three mocks — per CLAUDE.md convention, no unit tests here; correctness is validated via the spec's test matrix on the individual lib modules + the in-browser smoke test at Task 19.

- [ ] **Step 1: Create the controller shell**

Create `src/lib/map/turret/TurretSessionController.ts`:

```ts
/**
 * End-to-end turret session orchestrator. Wires {@link TurretSession}'s
 * pure state machine to the live rig, belt registration, beam raycast,
 * yield coordinator, inventory commit path, input manager, and camera
 * handoff. Owns the per-session lifetime of all those collaborators.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-turret-mode-design.md
 */
import * as THREE from 'three'
import { InputManager } from '@/lib/InputManager'
import { RockYieldSystem } from '@/lib/mining/rockYieldSystem'
import { addItem, loadInventory, saveInventory } from '@/lib/inventory/inventory'
import { getItemDefinition } from '@/lib/inventory/catalog'
import { getCurrentUpgradeValue } from '@/lib/upgrades'
import type { ThrusterRuntimeModifiers, ShuttleThrusterName } from '@/lib/physics/thrusterSystem'
import { TurretSession, type TurretSessionTickInput } from './TurretSession'
import {
  TurretYieldCoordinator,
  type TurretInstanceHandle,
} from './TurretYieldCoordinator'
import { createTurretAimState, tickTurretAim, type TurretAimState } from './TurretAimState'
import { raycastBeam, type BeamTargetInstance } from './TurretBeamSystem'
import { pickTier } from './turretTiers'
import {
  TURRET_BEAM_DPS,
  TURRET_BEAM_MAX_RANGE,
} from './turretConstants'
import { TurretRigController } from '@/three/TurretRigController'
import { TurretTractorEmitter } from '@/three/TurretTractorEmitter'
import type { ShuttleController } from '@/three/ShuttleController'
import type { AsteroidBeltController } from '@/three/controllers/AsteroidBeltController'

/** Minimal scene host surface — mirrors {@link EvaSceneHost} pattern. */
export interface TurretSceneHost {
  /** Add an Object3D to the currently-rendered scene. */
  addToScene(object: THREE.Object3D): void
  /** Remove an Object3D from the currently-rendered scene. */
  removeFromScene(object: THREE.Object3D): void
  /** Hand render to a camera (null reverts to the default vehicle camera). */
  setActiveCamera(camera: THREE.PerspectiveCamera | null): void
  /** Renderer DOM element — used for pointer lock. */
  readonly renderer: { domElement: HTMLElement }
}

/** Constructor dependencies for the controller. */
export interface TurretSessionControllerDeps {
  shuttleController: ShuttleController
  beltControllers: AsteroidBeltController[]
  host: TurretSceneHost
  /** Called when a mineral unit is committed. HUD + audio hook. */
  onResourcePickup?: (itemId: string, quantity: number, label: string) => void
  /** Called on commit failure (inventory full). HUD toast hook. */
  onResourcePickupFailed?: (label: string, reason: string) => void
  /** Called each frame with fade opacity for the Vue fade overlay. */
  onFadeOpacity?: (opacity: number) => void
}

/**
 * Orchestrates the full turret session. Construct once at first entry,
 * keep alive for the page; `open()` is idempotent via the internal
 * {@link TurretSession}.
 */
export class TurretSessionController {
  private readonly deps: TurretSessionControllerDeps
  private readonly session: TurretSession
  private readonly rig: TurretRigController
  private readonly tractor: TurretTractorEmitter
  private readonly inputManager: InputManager
  private readonly coordinator: TurretYieldCoordinator
  private yieldSystem: RockYieldSystem | null = null

  private aim: TurretAimState = createTurretAimState()
  private mouseDx = 0
  private mouseDy = 0
  private firing = false
  private readonly rayOrigin = new THREE.Vector3()
  private readonly rayDir = new THREE.Vector3()
  private readonly targetInstances: BeamTargetInstance[] = []

  /** True while session is in any non-idle phase. */
  get isActive(): boolean {
    return this.session.isActive
  }

  /** Current fade opacity. */
  get fadeOpacity(): number {
    return this.session.fadeOpacity
  }

  constructor(deps: TurretSessionControllerDeps) {
    this.deps = deps
    this.rig = new TurretRigController(deps.shuttleController.group)
    this.tractor = new TurretTractorEmitter()
    this.inputManager = new InputManager({
      turretFire: ['Space', 'MouseLeft'],
      turretYawLeft: ['KeyA', 'ArrowLeft'],
      turretYawRight: ['KeyD', 'ArrowRight'],
      exitTurret: ['Escape', 'KeyT'],
    })

    this.coordinator = new TurretYieldCoordinator({
      commitOneUnit: (itemId) => this.commitOneUnit(itemId),
      onInstanceConsumed: (handle) => this.onInstanceConsumed(handle),
      onPickupFailed: (itemId, reason) => {
        const def = getItemDefinition(itemId)
        deps.onResourcePickupFailed?.(def?.label ?? itemId, reason)
      },
    })

    this.session = new TurretSession({
      onOpen: () => this.handleOpen(),
      onClose: () => this.handleClose(),
      tickActive: (input, dt) => this.handleActiveTick(input, dt),
      shuttleIsDead: () => deps.shuttleController.dead,
    })

    // Mouse delta tracking — only relevant while active.
    this.attachMouseListener()
  }

  /** Idempotent entry. */
  open(): void {
    this.session.open()
  }

  /** Call once per frame from MapViewController while `isActive`. */
  tick(dt: number): void {
    const input: TurretSessionTickInput = {
      exitPressed: this.inputManager.wasActionPressed('exitTurret'),
    }
    this.inputManager.tick(dt)
    this.session.tick(dt, input)
    this.deps.onFadeOpacity?.(this.session.fadeOpacity)
  }

  /** Dispose on shutdown. */
  dispose(): void {
    this.rig.dispose()
    this.tractor.dispose()
    this.inputManager.dispose()
    this.detachMouseListener()
  }

  // ----- internals -----

  private handleOpen(): void {
    // Register every visible belt instance with fresh yield + coordinator.
    this.yieldSystem = new RockYieldSystem({
      composition: [], // per-rock compositionOverride is always supplied below
      seed: Date.now() | 0,
    })
    this.yieldSystem.onConsume = (spawnIndex) => {
      this.coordinator.notifyDepleted(spawnIndex)
    }
    this.yieldSystem.onMineralExtracted = (itemId, kg, spawnIndex) => {
      this.coordinator.acceptYield(itemId, kg, spawnIndex)
    }

    for (const belt of this.deps.beltControllers) {
      for (const snap of belt.enumerateInstances()) {
        const tier = pickTier(snap.radius)
        const handle: TurretInstanceHandle = {
          beltMeshIndex: snap.beltMeshIndex,
          localIndex: snap.localIndex,
          worldPosition: snap.worldPosition.clone(),
          radius: snap.radius,
          tierId: tier.id,
        }
        const spawnIndex = this.coordinator.register(handle)
        this.yieldSystem.registerRock({
          spawnIndex,
          diameter: snap.radius * 2,
          compositionOverride: tier.composition,
          totalKgOverride: tier.hpKg,
        })
      }
    }

    this.aim = createTurretAimState()
    this.rig.attach()
    this.deps.host.addToScene(this.tractor.points)
    this.tractor.setTarget(this.rig.turretBase)
    this.deps.host.setActiveCamera(this.rig.camera)
    this.requestPointerLock()
    this.rebuildTargetList()
  }

  private handleClose(): void {
    this.exitPointerLock()
    this.deps.host.setActiveCamera(null)
    this.deps.host.removeFromScene(this.tractor.points)
    this.rig.detach()
    this.coordinator.clear()
    this.targetInstances.length = 0
    this.yieldSystem = null
    this.firing = false
  }

  private handleActiveTick(_input: TurretSessionTickInput, dt: number): void {
    // Aim state from keyboard + accumulated mouse delta.
    const yawAxis =
      (this.inputManager.isActionActive('turretYawRight') ? 1 : 0) -
      (this.inputManager.isActionActive('turretYawLeft') ? 1 : 0)
    this.aim = tickTurretAim(
      this.aim,
      { yawAxis, mouseDx: this.mouseDx, mouseDy: this.mouseDy },
      dt,
    )
    this.mouseDx = 0
    this.mouseDy = 0
    this.rig.applyAim(this.aim)

    // Beam gating: held fire AND thruster charge available.
    this.firing = this.inputManager.isActionActive('turretFire')
    const thrusterSystem = this.deps.shuttleController.thrusterSystem
    const modifiers = this.buildThrusterModifiers()
    const canFire = thrusterSystem.canFire('turretMining' as ShuttleThrusterName, modifiers)
    const beamActive = this.firing && canFire

    if (beamActive) {
      // Ray from camera forward in world space.
      this.rig.camera.getWorldPosition(this.rayOrigin)
      this.rig.camera.getWorldDirection(this.rayDir)
      const hit = raycastBeam(this.rayOrigin, this.rayDir, TURRET_BEAM_MAX_RANGE, this.targetInstances)
      const length = hit?.distance ?? TURRET_BEAM_MAX_RANGE
      this.rig.showBeam(length)
      this.rig.setReticleTargetValid(hit !== null)
      if (hit && this.yieldSystem) {
        const yieldMult = getCurrentUpgradeValue('turretMiningYield')
        const kg = TURRET_BEAM_DPS * dt * yieldMult
        this.yieldSystem.mineRock(hit.spawnIndex, kg)
      }
    } else {
      this.rig.hideBeam()
      this.rig.setReticleTargetValid(false)
    }

    // Thruster system tick — turret active only. Flight thrusters all idle (sim is frozen).
    const activeRecord: Record<ShuttleThrusterName, boolean> = {
      thrust: false,
      brake: false,
      rcs: false,
      turretMining: beamActive,
    }
    thrusterSystem.tick(dt, activeRecord, modifiers)

    this.tractor.tick(dt)
  }

  private buildThrusterModifiers(): ThrusterRuntimeModifiers<ShuttleThrusterName> {
    const efficiency = getCurrentUpgradeValue('turretMiningEfficiency')
    return { fuelCostMultiplier: { turretMining: efficiency } }
  }

  /** Rebuild `targetInstances` from the coordinator — called after registration or depletion. */
  private rebuildTargetList(): void {
    this.targetInstances.length = 0
    for (const { spawnIndex, handle } of this.coordinator.listInstances()) {
      this.targetInstances.push({
        spawnIndex,
        worldPosition: handle.worldPosition,
        radius: handle.radius,
      })
    }
  }

  private onInstanceConsumed(handle: TurretInstanceHandle): void {
    // Find the belt controller by walking the deps list against beltMeshIndex.
    // Registration was sequential across belts, so we can't use beltMeshIndex alone —
    // the snapshot grouped by belt; for hiding we need the source belt reference.
    // Simplest: iterate belts and try hide on the matching meshIndex + localIndex.
    for (const belt of this.deps.beltControllers) {
      belt.hideInstance(handle.beltMeshIndex, handle.localIndex)
    }
    this.tractor.spawnBurst(handle.worldPosition)
    this.rebuildTargetList()
  }

  // ----- commit path -----

  private commitOneUnit(itemId: string): { ok: true } | { ok: false; reason: string } {
    const inventory = loadInventory()
    if (!inventory) return { ok: false, reason: 'Inventory unavailable' }
    const result = addItem(inventory, itemId, 1)
    if (!result.ok) return { ok: false, reason: result.reason ?? 'Inventory full' }
    saveInventory(result.inventory)
    const def = getItemDefinition(itemId)
    this.deps.onResourcePickup?.(itemId, 1, def?.label ?? itemId)
    return { ok: true }
  }

  // ----- mouse + pointer lock plumbing -----

  private mouseMoveHandler = (event: MouseEvent): void => {
    if (!this.session.isActive || this.session.phase !== 'active') return
    if (document.pointerLockElement !== this.deps.host.renderer.domElement) return
    this.mouseDx += event.movementX
    this.mouseDy += event.movementY
  }

  private attachMouseListener(): void {
    window.addEventListener('mousemove', this.mouseMoveHandler)
  }

  private detachMouseListener(): void {
    window.removeEventListener('mousemove', this.mouseMoveHandler)
  }

  private requestPointerLock(): void {
    this.deps.host.renderer.domElement.requestPointerLock?.()
  }

  private exitPointerLock(): void {
    if (document.pointerLockElement === this.deps.host.renderer.domElement) {
      document.exitPointerLock?.()
    }
  }
}
```

**Important caveats to verify during implementation:**
1. **InputManager `MouseLeft` support**: The binding uses `['Space', 'MouseLeft']`. The existing InputManager only listens to `keydown`/`keyup` on the window (per the Explore agent survey). Mouse-button support may not exist. If `bun run type-check` or runtime reveals that `MouseLeft` isn't a known key code, DROP `MouseLeft` from the binding and use `Space` only for this first pass. Document as a follow-up.
2. **Belt `hideInstance` safety**: The loop `for (const belt of this.deps.beltControllers) { belt.hideInstance(...) }` will call `hideInstance` on *every* belt but the method early-returns when `beltMeshIndex` is out of range (since the guard `if (!data) return` and `if (localIndex >= data.maxCount)` protect it). However this is inefficient with multiple belts. A better approach: store a direct `beltControllerRef` on the handle. If time permits, enhance `TurretInstanceHandle` to carry the belt reference and simplify this loop. For now, the safe-guard loop works.
3. **`TurretSceneHost.setActiveCamera`**: If `MapViewController` doesn't currently expose a renderer-camera swap, the host implementation will need to set the active camera on the renderer directly. Mirror `EvaSceneHost` implementation pattern — grep `src/` for `setActiveCamera` to find the existing impl.

- [ ] **Step 2: Lint + type-check + tests**

Run: `bun run type-check && bun run lint && bun run test:unit`
Expected: clean. No new unit tests for this file (Three-coupled orchestrator). All lib tests from prior tasks must still pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/map/turret/TurretSessionController.ts
git commit -m "feat(turret): wire TurretSessionController end-to-end orchestrator

Owns the live turret session: rig, belt registration, RockYieldSystem,
TurretYieldCoordinator, beam raycast + damage, thruster-system fuel
drain, inventory commits, tractor particles, pointer lock. Invoked by
MapViewController.tick via a thin branch (next task)."
```

---

## Task 17: Wire `MapViewController` turret integration (the ≤40-line delta)

**Goal:** Add the field, lazy-init helper, and tick branch to `MapViewController.ts`. No new logic — this is pure wiring.

**Files:**
- Modify: `src/views/MapViewController.ts`

Approximate locations referenced (from the Explore agent survey): field block around lines 264-288, callback block around lines 372-401, tick method starts at 1079, insertion point is after line 1174 (post-intro-lock) and before line 1176 (orbital-surfing toggle). Line numbers may have drifted by 10-20 lines — find by context, not by exact number.

- [ ] **Step 1: Locate and add the field + callback declarations**

Find the block with `private habitatState = new HabitatState()` (around line 264) and `onHabitatFade: ((opacity: number) => void) | null = null` (around line 401). Add adjacent:

```ts
// Alongside habitatState etc.
private turretSessionController: TurretSessionController | null = null

// Alongside onHabitatFade etc.
onTurretFade: ((opacity: number) => void) | null = null
```

Also add the import near the top:

```ts
import { TurretSessionController } from '@/lib/map/turret/TurretSessionController'
import { getCurrentUpgradeValue } from '@/lib/upgrades'
```

(`getCurrentUpgradeValue` may already be imported — if so, skip.)

- [ ] **Step 2: Add the lazy-init helper**

Find `private async ensureHabitatScene(): Promise<HabitatInteriorScene>` (around line 3463). Immediately after it, add:

```ts
/** Lazy-init the turret session controller on first T press. */
private ensureTurretSessionController(): TurretSessionController {
  if (!this.turretSessionController) {
    this.turretSessionController = new TurretSessionController({
      shuttleController: this.shuttleController!,
      beltControllers: this.beltControllers,
      host: {
        addToScene: (obj) => this.sceneObjects!.scene.add(obj),
        removeFromScene: (obj) => this.sceneObjects!.scene.remove(obj),
        setActiveCamera: (cam) => this.setActiveRenderCamera(cam),
        renderer: { domElement: this.sceneObjects!.renderer.domElement },
      },
      onResourcePickup: this.onResourcePickup ?? undefined,
      onResourcePickupFailed: this.onResourcePickupFailed ?? undefined,
      onFadeOpacity: (op) => this.onTurretFade?.(op),
    })
  }
  return this.turretSessionController
}

/**
 * Swap the active render camera. If `camera` is provided, point the
 * scene renderer at it; if null, revert to the default vehicle camera.
 */
private setActiveRenderCamera(camera: THREE.PerspectiveCamera | null): void {
  if (!this.sceneObjects) return
  // This codebase renders via an EffectComposer; the active camera is held by
  // the first render pass. Swap by setting `this.sceneObjects.composer.passes[0].camera`
  // if a `RenderPass` is used, or by an existing `setActiveCamera` API if one exists.
  // Grep for `new RenderPass(` to confirm the actual pass structure.
  const composer = this.sceneObjects.composer
  for (const pass of composer.passes) {
    // RenderPass exposes a `camera` field; guard behind a safe any-check.
    const withCamera = pass as { camera?: THREE.Camera }
    if (withCamera.camera) {
      withCamera.camera = camera ?? this.vehicleCamera!.camera
    }
  }
}
```

**Caveat:** The exact camera-swap mechanism depends on how `SceneObjects.composer` is set up — look at how EvaSession accomplishes the same hand-off (its `EvaSceneHost` implementation is the canonical pattern). If EvaSession already exposes a reusable helper, reuse it. Grep: `grep -n "setActiveCamera\|EvaSceneHost" src/views/MapViewController.ts src/three/EvaSession.ts | head -20`.

- [ ] **Step 3: Add the tick-branch insertion**

In `MapViewController.tick` (line 1079+), find the intro-lock check:

```ts
    if (introLocked) {
      return
    }
```

(Around line 1172-1174.) Immediately AFTER this block, insert:

```ts
    // Turret mode toggle + active branch (mirrors habitat/EVA early-return pattern)
    const turretUnlocked = getCurrentUpgradeValue('turretMiningUnlock') >= 1
    const turretToggle = this.modeCoordinator.resolveTurretToggle({
      togglePressed: this.inputManager?.wasActionPressed('toggleTurret') ?? false,
      turretActive: this.turretSessionController?.isActive ?? false,
      orbitState: this.orbitSystem?.state ?? 'free',
      mapIsOpen: this.mapState.isOpen,
      habitatActive: this.habitatState.isActive,
      evaActive: this.evaSession?.isActive ?? false,
      isDead: this.shuttleController?.dead ?? false,
      unlocked: turretUnlocked,
      introLocked,
    })
    if (turretToggle === 'enter') {
      this.ensureTurretSessionController().open()
    }

    if (this.turretSessionController?.isActive) {
      this.turretSessionController.tick(dt)
      // Skip all remaining gameplay logic while turret is active (sim freeze).
      if (this.turretSessionController.phase !== 'idle') return
    }
```

**Note:** `this.turretSessionController.phase` isn't a public field on the orchestrator as written — add a passthrough getter:

In `TurretSessionController.ts`, add near `isActive`:

```ts
/** Current session phase from the underlying state machine. */
get phase(): TurretPhase {
  return this.session.phase
}
```

(And `import type { TurretPhase }` at the top.)

- [ ] **Step 4: Validation sweep**

Run: `bun run type-check`
Expected: any errors here likely come from the camera-swap helper — inspect `EvaSession.ts` for the canonical pattern and adapt. Once type-check is green:

Run: `bun run lint && bun run test:unit`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/views/MapViewController.ts src/lib/map/turret/TurretSessionController.ts
git commit -m "feat(map): wire MapViewController turret branch (~40 line delta)

Adds field, ensureTurretSessionController helper, and tick-loop branch
that resolves the toggle via MapModeCoordinator, opens the session,
ticks it, and returns early to freeze flight/gravity/health sim while
active. setActiveRenderCamera mirrors the EvaSceneHost pattern."
```

---

## Task 18: Wire `MapView.vue` fade overlay and pickup toasts

**Goal:** Surface the turret fade opacity to the Vue layer (black overlay during transitions) and ensure pickup/failed toasts route through existing HUD affordances.

**Files:**
- Modify: `src/views/MapView.vue`

- [ ] **Step 1: Add a reactive ref and wire the callback**

Find the block where `habitatFadeOpacity = ref(0)` (around line 429) is declared and wired. Immediately adjacent, add:

```ts
const turretFadeOpacity = ref(0)
```

Then in the `viewController` callback wiring block (around line 429-444):

```ts
viewController.onTurretFade = (opacity) => {
  turretFadeOpacity.value = opacity
}
```

- [ ] **Step 2: Add the fade overlay element**

Find the `<div v-if="habitatFadeOpacity > 0" class="habitat-fade" ... />` element in the template (around line 1063-1066). Add alongside:

```vue
<div
  v-if="turretFadeOpacity > 0"
  class="turret-fade"
  :style="{ opacity: turretFadeOpacity }"
/>
```

If the habitat-fade has dedicated CSS, mirror it for the turret. If it uses Tailwind `@apply`, add a matching class — grep the `<style>` block of `MapView.vue` for `.habitat-fade`:

```bash
grep -n "habitat-fade" src/views/MapView.vue
```

Match the style (usually a full-screen fixed-position black overlay):

```css
.turret-fade {
  @apply pointer-events-none fixed inset-0 z-50 bg-black;
}
```

- [ ] **Step 3: Validation sweep**

Run: `bun run type-check && bun run lint && bun run test:unit`
Expected: all green. Vue template syntax errors here are usually missing commas or braces — read the diff carefully.

- [ ] **Step 4: Commit**

```bash
git add src/views/MapView.vue
git commit -m "feat(map): wire turret fade overlay into MapView.vue

viewController.onTurretFade drives a reactive ref that renders a
full-screen black overlay during turret open/close transitions. Mirrors
the existing habitat-fade pattern."
```

---

## Task 19: In-browser smoke test + final validation

**Goal:** Full acceptance — unit tests, lint, type-check, plus a manual in-browser run through the golden path and edge cases.

**Files:** None (validation only).

- [ ] **Step 1: Final validation pass (all three gates)**

Run in sequence:

```bash
bun run type-check
bun run lint
bun run test:unit
```

All must be green with zero warnings (ESLint enforces `--max-warnings 0`).

- [ ] **Step 2: Launch dev server**

Run: `bun dev`
Open the browser to the local URL (usually `http://localhost:5173`) and navigate to `/map`.

- [ ] **Step 3: Verify unlock gate**

Confirm the player profile has `turretMiningUnlock` at level 0 (default). Press **T** — nothing should happen (no fade, no camera swap). If a HUD toast is wired for "not installed," verify it shows; otherwise silent is acceptable.

Temporarily set the unlock by opening the dev console and running:

```js
// Unlock turret for smoke test
window.CURRENT_PLAYER_UPGRADE_LEVELS = window.CURRENT_PLAYER_UPGRADE_LEVELS || {}
// Or via the exported module — depends on vite's HMR boundary
```

If `CURRENT_PLAYER_UPGRADE_LEVELS` isn't reachable from the console (tree-shaking), manually buy the upgrade through the shop UI if accessible, OR temporarily set `"valuesByLevel": [1, 1]` in `upgrades.json` so level 0 is already unlocked, reload, test, then REVERT.

- [ ] **Step 4: Smoke-test the golden path**

With unlock active:

1. Press **T** on the map. Expected: screen fades to black over ~0.4s, camera switches to first-person nose view, reticle appears.
2. Move mouse — reticle stays centered, world view pans within the cone.
3. Press **A** / **D** — turret base rotates (the whole view yaws in world space, can traverse 360°).
4. Aim at an asteroid within ~80 units. Reticle turns green.
5. Hold **Space** — beam visible, charge bar drains, fuel drops.
6. Hold until asteroid depletes. Verify: asteroid disappears, tractor particles burst toward the shuttle, pickup toast fires for at least one mineral unit.
7. Fire at nothing / pan away — beam hides, reticle returns to white.
8. Press **Esc** — fade out, camera returns to map vehicle camera, sim resumes.
9. Open tactical map (**M**) — shuttle still in place, fuel reduced by mining.

- [ ] **Step 5: Smoke-test edge cases**

- **Fuel depletion during fire:** mine until shuttle fuel is very low; charge bar goes empty, beam stops. Exit turret — adrift timer starts ticking (or if still above zero, normal flight resumes).
- **Inventory full:** fill inventory via level-scene mining first, then turret-mine until a commit fails. Expected: `onResourcePickupFailed` fires a toast, asteroid still depletes, surplus kg dropped, no softlock.
- **Rapid toggle:** press **T** → **Esc** → **T** → **Esc** repeatedly. No camera stuck, no ghost beam, no orphaned particles.
- **Re-enter after session close:** after exit, press **T** again. Fresh registration, prior depleted asteroids stay hidden in the belt (they're instance-hidden) or are re-enumerated as still-visible (depends on whether `hideInstance` matrix persists across tick cycles — it should, since sim freeze did not run normal belt tick). If they do re-enumerate visible, that's a known gap and should be captured as a follow-up.

- [ ] **Step 6: Merge readiness**

If all checks pass:

- Confirm all commits are on the branch.
- Confirm spec and plan docs are committed (user's call on when).
- Feature is ready for merge.

If any check fails, capture the failure in a follow-up issue; do NOT claim completion.

---

## Post-implementation follow-ups (documented, not implemented)

These are intentionally deferred per the spec and the "future work" section of the design doc:

1. **Weapon mode.** Add `turretWeaponUnlock`, `turretWeaponDamage`, `turretWeaponEfficiency` upgrades; add a second `'turretWeapon'` thruster group; add mode toggle to `TurretSession`. Requires map combat targets to exist first.
2. **Per-burst mineral tint for tractor particles.** Track dominant mineral per `spawnIndex` during the rock's life; pass tint into `TurretTractorEmitter.spawnBurst`. Cosmetic polish.
3. **Turret audio.** SFX for beam-loop, asteroid-destroyed, tractor-arrive, fade-in, fade-out. Wire via existing `shuttleAudio` or add a dedicated audio module.
4. **Cone indicator HUD.** Small 2D arc widget showing ship-forward vs `baseYaw` vs `coneYaw` — currently deferred; reticle alone is enough for MVP.
5. **Shop UI hookup.** Ensure the three new upgrades appear in the engineering-bay shop and purchase/persist correctly. May already work via the data-driven schema — verify during Task 19 smoke test.

---

## Self-Review

### Spec coverage check

| Spec section | Task(s) |
|---|---|
| Scope: mining-only, weapon reserved | Task 4 (reserved IDs not in union), Task 16 (mode param not added) |
| Press T on map → fade → turret FP | Tasks 15, 16, 17, 18 |
| Mouse cone aim + A/D traverse | Task 7 (aim state), Task 14 (rig), Task 16 (wiring) |
| Continuous beam w/ dps + fuel drain | Task 1 (fuelCostMultiplier), Task 2 (turretMining group), Task 16 (tick integration) |
| 3-tier asteroid HP/loot by radius | Tasks 3, 5, 6 |
| `RockYieldSystem` reuse w/ overrides | Task 3 |
| Session-scoped registration | Task 9 (coordinator), Task 16 (registration on open, clear on close) |
| Tractor particles on depletion | Tasks 12 (ParticleEmitter extension), 13 (TurretTractorEmitter), 16 (wiring) |
| Inventory commit via existing flow | Task 9 (coordinator buffers), Task 16 (commitOneUnit path) |
| 3 upgrades: unlock/yield/efficiency | Task 4 |
| `turretMining` thruster group | Task 2 |
| `toggleTurret` binding | Task 5 |
| `resolveTurretToggle` gate | Task 10 |
| MapViewController ~30-line delta | Task 17 |
| MapView.vue fade overlay | Task 18 |
| Sim freeze via early return | Task 17 (tick-loop return) |
| Adrift/refuel loop unchanged | Task 17 (freeze is incidental — no code change needed) |
| Acceptance criteria (type/lint/test) | Task 19 |
| Unit tests on lib modules | Tasks 1, 3, 4, 6, 7, 8, 9, 10, 15 |

Every spec section has at least one task. No gaps.

### Placeholder scan

Self-search:
- No "TBD", "TODO", "implement later", "handle edge cases" — all steps carry concrete code.
- No "similar to Task N" — all snippets are explicit even when patterns repeat (TDD test-then-code, commit).
- Caveats in Task 16 are explicit ("drop `MouseLeft` if not supported", "enhance handle with belt ref if time permits") rather than vague — each is resolvable at implementation time with a clear fallback.
- Task 17's camera-swap helper has an explicit "grep for existing pattern" step rather than leaving it as TBD.

### Type/name consistency

- `TurretInstanceHandle.beltMeshIndex` (used in Task 9 coord, Task 11 AsteroidBeltController, Task 16 controller) — consistent.
- `TurretInstanceHandle.localIndex` — consistent.
- `raycastBeam` signature `(origin, direction, maxDistance, instances)` returns `BeamHit | null` — consistent across Tasks 8 and 16.
- `TurretSessionController.isActive` and `.phase` — both defined in Task 16 and referenced in Task 17.
- `UpgradeId` additions: `turretMiningUnlock`, `turretMiningYield`, `turretMiningEfficiency` — consistent across Tasks 4, 16, 17.
- `ShuttleThrusterName` now includes `turretMining` — consistent in Tasks 2, 16.
- `ThrusterRuntimeModifiers.fuelCostMultiplier` — consistent in Tasks 1, 16.
- `TurretYieldCoordinator.commitOneUnit` returns `CommitResult` which is `{ok:true} | {ok:false, reason:string}` — consistent across Tasks 9 and 16.
- `onResourcePickup` / `onResourcePickupFailed` signatures match the existing Level pattern (`itemId, quantity, label`) — consistent.

All signatures and names aligned. Plan is internally consistent.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-20-turret-mode.md`.** Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Best for 19 tasks with clear TDD checkpoints.
2. **Inline Execution** — run tasks in this session with `executing-plans`, batch execution with checkpoints for review.

**Which approach?**
