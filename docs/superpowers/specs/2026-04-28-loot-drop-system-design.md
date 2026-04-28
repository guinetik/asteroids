# Loot Drop System Design

**Date:** 2026-04-28  
**Author:** grok (with guinetik)  
**Status:** Approved for implementation  
**Spec for:** Generalized enemy loot beyond psychosphere (health, oxygen, RTG powerups)

## Intent

Decouple "enemy loot" from being exclusively psychosphere (contract-driven). Introduce three new immediate-effect powerup drops that enemies can spawn with weighted bias:

- **Health** — restores 10% HP (red visual, favored by Chimera)
- **Oxygen** — restores 25% O₂ (blue visual, favored by Spire)
- **RTG** — fully refills multitool RTG + all weapon thruster groups (yellow visual)

Psychosphere remains the only inventory + contract-gated drop. All drops use the same walk-over collection mechanic with colored bobbing emissive orbs and reactive HUD toasts. Higher difficulty (colored) enemies have higher drop chance.

This directly supports bunker wave combat and makes surface FPS more rewarding while preserving the existing Cinderline/Jovian Society contract flow.

## Scope

**In scope:**

- Generalized `LootSystem` (evolved from `DropSystem`)
- Data-driven drop tables with per-enemy bias + difficulty scaling
- Unified `LootPickupController` with type-specific colors
- Immediate effect handlers in `LevelViewController` (health, oxygen, RTG-multitool-only)
- Bunker scene compatibility (scene root switching for visuals)
- HUD toast variants + audio feedback
- Full test coverage and compliance with CLAUDE.md rules

**Out of scope (future iterations):**

- New inventory items for powerups (immediate effects only)
- Geometry variation beyond color/emissive (can extend later)
- Ammo, shield, or other new drop types
- Loot room chest integration (already exists in bunker)

## Architecture

### 1. Data (`src/data/loot/dropTables.json`)

```json
{
  "tables": {
    "bacteriophage": { "baseChance": 0.35, "difficultyMultiplier": 0.08, "biasedDrops": { "health": 0.15, "oxygen": 0.25, "rtg": 0.20, "psychosphere": 0.40 } },
    "spire": { "baseChance": 0.40, "difficultyMultiplier": 0.10, "biasedDrops": { "health": 0.10, "oxygen": 0.45, "rtg": 0.20, "psychosphere": 0.25 } },
    "chimera": { "baseChance": 0.45, "difficultyMultiplier": 0.12, "biasedDrops": { "health": 0.50, "oxygen": 0.15, "rtg": 0.15, "psychosphere": 0.20 } }
  }
}
```

Weighted random selection per enemy type. Psychosphere still respects active `collect-drops` contracts.

### 2. Domain (`src/lib/fps/lootSystem.ts`)

- `type LootType = 'psychosphere' | 'health' | 'oxygen' | 'rtg'`
- `LootSystem` replaces/extends `DropSystem`
- `trySpawnLoot(enemyType: string, position: Vec3, difficulty: number)` — rolls chance + bias
- `tick(dt, playerPosition)` — collection (cylindrical XZ test preserved)
- Callbacks: `onPowerupCollected(type: LootType)` for immediate effects, existing path for psychosphere

### 3. Visuals (`src/three/LootPickupController.ts`)

- Single controller managing all types
- Color mapping: Health=`0xff4444`, Oxygen=`0x4488ff`, RTG=`0xffdd44`, Psychosphere=`0x6affc8`
- Same bob + rotation animation
- Accepts dynamic scene root (for bunker vs surface)

### 4. Bridge & Effects (`LevelViewController.ts`)

- `applyLootEffect(type: LootType)`:
  - `health`: `playerController.heal(0.10)`
  - `oxygen`: `thrusterSystem.addFuel(o2Capacity * 0.25)`
  - `rtg`: `multiToolState.fullRefill()` (RTG + weapon thruster groups only)
  - `psychosphere`: existing `handlePickupCollected` path
- Update `installDropObserver` to use new `LootSystem`
- Scene root switching when entering/exiting bunker

### 5. HUD & Audio

- Extend `PickupToast.vue` with colored powerup variant
- New audio cues via `LevelAudioDirector` (`notifyPowerupCollected(type)`)

## Bunker Integration

The existing `installEnemySpawnObserver` + `addDeathListener` pattern in `BunkerSceneController` and `BunkerMinigame` works without change. The only adaptation is making `LootPickupController` accept a dynamic scene root so pickups render correctly inside the bunker sub-scene (`geometry.root`).

## Implementation Order

(See separate implementation plan after spec approval.)

1. Create `dropTables.json` + types
2. Refactor `DropSystem` → `LootSystem`
3. Build `LootPickupController`
4. Add effect handlers + scene switching in `LevelViewController`
5. Update bunker/surface observers
6. Extend toasts + audio
7. Tests, lint, type-check

## Success Criteria

- All 4 drop types appear with correct bias and frequency
- Immediate effects feel responsive (no inventory step for health/O2/RTG)
- Bunker waves drop loot correctly with colored visuals
- Existing psychosphere + Cinderline contracts unchanged
- `bun run type-check`, `bun lint`, `bun test:unit` all pass
- No magic numbers, full TSDoc, follows controller + data-driven patterns

---

**Design document written.**

This matches everything we discussed. Please review `docs/superpowers/specs/2026-04-28-loot-drop-system-design.md`.

If it looks good, say the word and I'll invoke the writing-plans skill to break this into a detailed, executable implementation plan (with todos), then we can start coding together. 

Ready when you are.