# Radiation Zone Protection — Design

**Date:** 2026-04-23
**Status:** Draft
**Author:** guinetik
**Related:** [Ship Health & Temperature](./2026-04-05-ship-health-temperature-design.md)

## Goal

Replace the current "radiation = damage multiplier" model with **zone-based radiation
protection**, mirroring the existing thermal-cap pattern. Players who buy
`shuttleRadiationResistance` Lvl 1 should be able to **park in Mercury orbit
indefinitely** without taking radiation damage. Pushing closer to the Sun should
demand higher upgrade tiers.

## Problem

Today (`src/lib/shipHealth.ts:296-303`), radiation damage is computed from
`radiationProximity` (a 0–1 gravity-well proximity to the Sun) and scaled by a
multiplier `radiationArmor`:

```ts
if (radiationProximity > config.radiationThreshold) {
  const ratio = (radiationProximity - config.radiationThreshold) /
                (1 - config.radiationThreshold)
  radDamage = ratio * config.maxRadiationDamage * radiationArmor * dt
}
```

`shuttleRadiationResistance` levels are `[1.0, 0.7, 0.45, 0.25]`. At Lvl 1 the
player still takes **70 %** of normal damage, so Mercury orbit is still lethal —
just slower. There is no notion of a safe zone for radiation, unlike thermal,
which has fully working zone-based caps in `MapViewController.computeThermalCaps`.

## Model

### Three radiation zones, by sun distance

| Zone | Sun-distance band (catalog units, pre-`ORBIT_SCALE`) | Real-world analogue |
|---|---|---|
| **0** | `sunDist >= radiationZone1Boundary` | Earth-side, no radiation |
| **1** | `radiationZone2Boundary <= sunDist < radiationZone1Boundary` | Inside Venus orbit, around Mercury |
| **2** | `radiationZone3Boundary <= sunDist < radiationZone2Boundary` | Past Mercury, deeper into the Sun's well |
| **3** | `sunDist < radiationZone3Boundary` | Sun proximity (innermost) |

Default boundaries (catalog units; `ORBIT_SCALE` is applied at construction time
in `MapViewController` like the existing thermal boundaries):

```json
{
  "radiationZone1Boundary": 0.55,
  "radiationZone2Boundary": 0.35,
  "radiationZone3Boundary": 0.25
}
```

Mercury sits at `semiMajorAxis = 0.387` (`src/data/planets/planetarium.json`),
which lands cleanly in **Zone 1** with the proposed defaults. Zone 2 engages
just inside Mercury's orbit (so "moving further in" immediately demands Lvl 2
for full immunity), and Zone 3 is aligned with `heatZone3Boundary` (`0.25`) so
the lethal radiation band coincides with the deepest heat band — the player's
intuition that "Sun proximity" is uniformly hostile is preserved across both
damage paths.

### Tier-gap protection

Player owns `shuttleRadiationResistance` at level `L ∈ {0, 1, 2, 3}`. For a given
zone `Z ∈ {1, 2, 3}` we compute the **tier gap** = `Z - L` (clamped at zero):

| Tier gap | Meaning | Damage multiplier |
|---|---|---|
| `≤ 0` (`L >= Z`) | Fully shielded | `0` (immune) |
| `1` (`L === Z - 1`) | One tier under-leveled | `0.5` (partial — "burn less severely") |
| `≥ 2` (`L <= Z - 2`) | Two or more tiers under-leveled | `1.0` (full damage) |

Zone 0 always yields zero damage regardless of level. Implementation lives in
the pure helper `getRadiationArmor(level, zone)` so the same rule can be reused
by HUD telemetry and audio cadence.

### Damage rate

When damage applies, the per-second rate scales with zone severity:

```
radDamage = maxRadiationDamage × (zone / 3) × armor × dt
```

So full-damage hits are:

| Zone | Lvl 0 (full) | Lvl Z-1 (partial) | Lvl ≥ Z (immune) |
|---|---|---|---|
| 1 | 5 dmg/s | 2.5 dmg/s | 0 |
| 2 | 10 dmg/s | 5 dmg/s | 0 |
| 3 | 15 dmg/s | 7.5 dmg/s | 0 |

(`maxRadiationDamage` stays at the existing `15`.)

### Decision matrix

| Zone | Lvl 0 | Lvl 1 | Lvl 2 | Lvl 3 |
|---|---|---|---|---|
| 1 (Mercury orbit area) | 2.5 dmg/s (partial) | **0** | 0 | 0 |
| 2 (Mercury → Sun) | 10 dmg/s (full) | 5 dmg/s (partial) | **0** | 0 |
| 3 (Sun proximity) | 15 dmg/s (full) | 15 dmg/s (full) | 7.5 dmg/s (partial) | **0** |

This matches the user brief: "lvl 1 = Mercury orbit safe (immune); going deeper
with lvl 1 you burn (partial in Zone 2); lvl 2 burns less severely closer to
the Sun (partial in Zone 3); lvl 3 lets you orbit the Sun freely (immune in
Zone 3)." Zone 1 with no upgrade is intentionally a slow chip rather than a
hard fail — Mercury orbit is the gentlest radiation band.

### Death cause

`getDeathCause()` returns `'Radiation Exposure'` when the active zone is `>= 1`
**and** the protection rule is *not* immune for the current level. This means
killing yourself with thermal damage in Zone 0 still reports the correct
thermal cause.

## Public API impact

`ShipHealth.tick()` signature change:

```diff
 tick(
   dt: number,
   sunDistance: number,
-  radiationProximity: number,
   healing = false,
   heatResistance = 1,
   heatArmor = 1,
   coldResistance = 1,
   coldArmor = 1,
-  radiationArmor = 1,
+  radiationLevel = 0,
   heatTempCap = MAX_TEMPERATURE,
   coldTempCap = MIN_TEMPERATURE,
 ): void
```

`radiationProximity` is removed. The shuttle's gravity proximity is still used by
the gravity warning HUD and `GravityDistortionPass` — those are unaffected.
Radiation now derives its zone purely from `sunDistance`, identical in spirit to
the existing thermal-cap path.

`MapViewController` stops passing `getCurrentUpgradeValue('shuttleRadiationResistance')`
(the multiplier) and instead passes
`CURRENT_PLAYER_UPGRADE_LEVELS.shuttleRadiationResistance ?? 0` (the raw level).

`shuttleRadiationResistance` description in `upgrades.json` is rewritten:

> "Lvl 1: survives Mercury orbit. Lvl 2: survives between Mercury and Sun. Lvl 3: survives Sun proximity."

`valuesByLevel` stays in the JSON (the upgrade-cost helpers consume `baseCost`,
not `valuesByLevel`), but the runtime no longer reads it for radiation. We keep
the array for catalog parity with other shuttle upgrades.

## Out of scope (Phase 2)

- HUD warning banner (mirroring `GravityWarning.vue` for active radiation
  exposure with intensity-based pulse).
- `sfx.geiger` — declarative manifest entry + cadence-modulated playback driven
  by current zone + remaining health.
- Map overlay rings showing radiation zone bands (similar to the thermal zone
  bands in `mapThermalZones.ts`).

## Acceptance criteria

1. Parking the shuttle in Mercury orbit at `shuttleRadiationResistance` Lvl 1
   results in zero radiation damage (HP stays at max indefinitely).
2. Parking inside Mercury (Zone 2) at Lvl 1 burns at 5 dmg/s.
3. Parking at Sun proximity (Zone 3) at Lvl 3 results in zero damage.
4. Parking at Sun proximity at Lvl 2 burns at 7.5 dmg/s (partial).
5. Death in any radiation zone reports cause `'Radiation Exposure'`.
6. Existing thermal behaviour, gravity warning, gravity distortion shader,
   healing, and EVA thermal lockout are unchanged.
