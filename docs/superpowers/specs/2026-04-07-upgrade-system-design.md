# Upgrade System Design

**Date:** 2026-04-07  
**Author:** guinetik  
**Status:** Draft

## Overview

26 upgrades across 4 categories (Shuttle, Lander, Multitool, Suit), each with levels 0–3. Upgrades are permanent level progressions purchased while orbiting any planet (spaceport console). No inventory items — upgrades are not things you carry, they are installed improvements.

Purchase flow and spaceport UI are **out of scope** for this spec. This spec covers definitions, data format, cost formula, and wiring into existing gameplay systems.

## Cost Formula

```
costForLevel(level) = baseCost * level
```

- `level` is 1, 2, or 3 (you never pay for level 0 — that's the default).
- Each upgrade has a `baseCost` in the JSON. Late-game upgrades simply have a higher base cost.
- Pure function — no side effects, easy to tweak by changing `baseCost` per upgrade.

### Cost Tiers

| Tier | Base Cost Range | Examples |
|------|----------------|---------|
| Early | 500–1000 CR | `shuttleThrusterEfficiency`, `landerThrusterEfficiency`, `suitStaminaCapacity`, `multitoolEfficiency` |
| Mid | 1000–2000 CR | `shuttleHull`, `shuttleCargoBay`, `multitoolDamage`, `suitArmor`, `shuttleScienceStation` |
| Late | 5000–7000 CR | `shuttleHeatResistance`, `shuttleFreezeResistance`, `shuttleRadiationResistance`, `suitO2Capacity`, `landerHull` |

## Data Format

All 26 upgrades live in `src/data/upgrades.json`. Each entry:

```json
{
  "id": "shuttleThrusterEfficiency",
  "category": "shuttle",
  "label": "Thruster Efficiency",
  "description": "Optimized fuel injectors reduce thruster fuel consumption.",
  "baseCost": 500,
  "maxLevel": 3,
  "valuesByLevel": [1.0, 0.75, 0.5, 0.25]
}
```

Fields:
- `id` — unique key, used by gameplay code.
- `category` — `"shuttle" | "lander" | "multitool" | "suit"`, for UI grouping.
- `label` — display name in the spaceport console.
- `description` — one-line flavor/effect text.
- `baseCost` — CR cost for level 1; levels 2 and 3 are `baseCost * level`.
- `maxLevel` — always 3 for now, but the system supports any max.
- `valuesByLevel` — numeric value at each level (index 0 = level 0 = default).

## Upgrade Catalog

### Shuttle (11 upgrades)

| ID | Label | Description | Base Cost | L0 | L1 | L2 | L3 | Direction |
|----|-------|-------------|-----------|----|----|----|----|-----------|
| `shuttleThrusterEfficiency` | Thruster Efficiency | Optimized fuel injectors reduce thruster fuel consumption. | 500 | 1.0 | 0.75 | 0.5 | 0.25 | lower = better |
| `shuttleThrusterCharge` | Thruster Charge | Improved capacitors accelerate thruster recharge rate. | 500 | 1.0 | 1.5 | 2.0 | 2.5 | higher = better |
| `shuttleThrusterSpeed` | Thruster Speed | Overclocked thrust nozzles increase top boost speed. | 750 | 1.0 | 1.25 | 1.5 | 1.75 | higher = better |
| `shuttleSystemsEfficiency` | Efficient Systems | Low-power avionics reduce passive fuel drain. | 600 | 3.0 | 2.0 | 1.0 | 0.0 | lower = better |
| `shuttleHull` | Hull Upgrade | Reinforced hull plating absorbs more impact damage. | 1000 | 1.0 | 1.35 | 1.65 | 2.0 | higher = better |
| `shuttleHeatResistance` | Heat Shield | Ablative coating reduces thermal damage near stars. | 5000 | 1.0 | 0.7 | 0.45 | 0.25 | lower = better |
| `shuttleFreezeResistance` | Cryo Insulation | Thermal lining resists cryogenic damage in deep space. | 5000 | 1.0 | 0.7 | 0.45 | 0.25 | lower = better |
| `shuttleRadiationResistance` | Radiation Shielding | Lead-lined compartments deflect ionizing radiation. | 6000 | 1.0 | 0.7 | 0.45 | 0.25 | lower = better |
| `shuttleCargoBay` | Cargo Bay Expansion | Modular cargo frame increases carrying capacity. | 1500 | 1.0 | 1.35 | 1.65 | 2.0 | higher = better |
| `shuttleFuelCapacity` | Fuel Tank Expansion | Auxiliary fuel bladder extends operational range. | 1200 | 1.0 | 1.35 | 1.65 | 2.0 | higher = better |
| `shuttleScienceStation` | Science Station | Onboard lab boosts CR earnings on mission completion. | 2000 | 1.0 | 1.25 | 1.5 | 1.75 | higher = better |

### Lander (5 upgrades)

| ID | Label | Description | Base Cost | L0 | L1 | L2 | L3 | Direction |
|----|-------|-------------|-----------|----|----|----|----|-----------|
| `landerThrusterEfficiency` | Thruster Efficiency | Refined propellant mix lowers fuel burn per thrust. | 500 | 1.0 | 0.75 | 0.5 | 0.25 | lower = better |
| `landerThrusterCharge` | Thruster Charge | Faster thruster recharge between burn cycles. | 500 | 1.0 | 1.5 | 2.0 | 2.5 | higher = better |
| `landerThrusterSpeed` | Thruster Power | Upgraded engine bells deliver more thrust force. | 750 | 1.0 | 1.25 | 1.5 | 1.75 | higher = better |
| `landerHull` | Hull Upgrade | Impact-resistant frame survives harder landings. | 5000 | 1.0 | 1.35 | 1.65 | 2.0 | higher = better |
| `landerFuelCapacity` | Fuel Tank Expansion | Extended fuel reservoir for longer surface operations. | 1000 | 1.0 | 1.35 | 1.65 | 2.0 | higher = better |

### Multitool (5 upgrades)

| ID | Label | Description | Base Cost | L0 | L1 | L2 | L3 | Direction |
|----|-------|-------------|-----------|----|----|----|----|-----------|
| `multitoolEfficiency` | Instrument Efficiency | Power-saving circuits reduce RTG fuel consumption. | 600 | 1.0 | 0.75 | 0.5 | 0.25 | lower = better |
| `multitoolDamage` | Damage Output | Amplified emitter deals more damage to targets. | 1000 | 1.0 | 1.35 | 1.65 | 2.0 | higher = better |
| `multitoolRtgCapacity` | RTG Capacity | Larger radioisotope core stores more charge. | 1200 | 1.0 | 1.35 | 1.65 | 2.0 | higher = better |
| `multitoolRtgCharge` | RTG Charge Boost | Each random charge pickup restores more energy. | 800 | 1.0 | 1.35 | 1.65 | 2.0 | higher = better |
| `multitoolScience` | Science Upgrade | Enhanced sensors boost CR earnings on mission completion. | 2000 | 1.0 | 1.25 | 1.5 | 1.75 | higher = better |

### Suit (5 upgrades)

| ID | Label | Description | Base Cost | L0 | L1 | L2 | L3 | Direction |
|----|-------|-------------|-----------|----|----|----|----|-----------|
| `suitArmor` | Suit Armor | Hardened exosuit plating increases hit points. | 1500 | 1.0 | 1.35 | 1.65 | 2.0 | higher = better |
| `suitStaminaCapacity` | Stamina Capacity | Muscle-assist servos extend sprint duration. | 600 | 1.0 | 1.35 | 1.65 | 2.0 | higher = better |
| `suitStaminaEfficiency` | Stamina Efficiency | Efficient rebreather uses less O2 to recharge stamina. | 800 | 1.0 | 0.75 | 0.5 | 0.25 | lower = better |
| `suitO2Capacity` | O2 Capacity | High-pressure tanks carry more breathable oxygen. | 5000 | 1.0 | 1.35 | 1.65 | 2.0 | higher = better |
| `suitMobility` | Mobility Upgrade | Low-friction joints improve walk speed, sprint speed, and jump distance. | 1000 | 1.0 | 1.15 | 1.35 | 1.5 | higher = better |

## Architecture

### Data file

`src/data/upgrades.json` — single JSON array of all 26 upgrade definitions. Imported statically by Vite.

### Resolver module

`src/lib/upgrades.ts` — loads definitions from JSON, exports:

- `UpgradeCategory` — `"shuttle" | "lander" | "multitool" | "suit"`
- `UpgradeId` — union of all 26 upgrade ID strings
- `NumericUpgradeDefinition` — interface with `id`, `category`, `label`, `description`, `baseCost`, `maxLevel`, `valuesByLevel`
- `UpgradeLevels` — `Partial<Record<UpgradeId, number>>`
- `UPGRADE_DEFINITIONS` — loaded from JSON, keyed by id
- `CURRENT_PLAYER_UPGRADE_LEVELS` — all zeros (no purchase flow yet)
- `getUpgradeValue(id, levels)` — resolve numeric value for a level
- `getCurrentUpgradeValue(id)` — resolve from current player state
- `getUpgradeCost(id, level)` — `baseCost * level`
- `getUpgradesByCategory(category)` — filter definitions by category
- `getShuttleThrusterEfficiencyModifiers(levels)` — returns same multiplier for thrust/brake/rcs from `shuttleThrusterEfficiency`

### Old → New ID mapping

| Old ID | New ID | Notes |
|--------|--------|-------|
| `shuttleFuelUpgrade` | `shuttleSystemsEfficiency` | Same values (3, 2, 1, 0) |
| `shuttleBoosterEfficiencyUpgrade` | `shuttleThrusterEfficiency` | Unified — one multiplier for all thruster groups |
| `shuttleBrakeEfficiencyUpgrade` | *(removed, folded into `shuttleThrusterEfficiency`)* | |
| `shuttleThrustersEfficiencyUpgrade` | *(removed, folded into `shuttleThrusterEfficiency`)* | |
| `heatShieldResistance` | `shuttleHeatResistance` | Same values |
| `heatShieldArmor` | `shuttleHull` | Repurposed as hull HP multiplier |

### Consumers to update

- `src/lib/shuttleBaseFuelDrain.ts` — use `shuttleSystemsEfficiency`
- `src/three/ShuttleController.ts` — use unified `shuttleThrusterEfficiency`
- `src/views/MapViewController.ts` — update import references
- `src/lib/missions/missionDifficulty.ts` — works as-is (iterates all upgrade keys)
- `src/lib/__tests__/upgrades.spec.ts` — rewrite for new IDs
- `src/lib/__tests__/shuttleBaseFuelDrain.spec.ts` — update ID references

### Items to remove

Remove 4 upgrade items from `src/data/inventory/items.json`:
- `thruster-boost`
- `hull-reinforcement`
- `fuel-tank-expansion`
- `cargo-bay-expansion`

Remove `"upgrade"` category handling from `src/lib/inventory/catalog.ts` if any special-case logic exists.

## Out of Scope

- Spaceport purchase UI / ship console
- Player upgrade persistence (localStorage / save system)
- Unlock prerequisites or tech-tree gating
- Visual indicators for upgrade levels on the ship model
