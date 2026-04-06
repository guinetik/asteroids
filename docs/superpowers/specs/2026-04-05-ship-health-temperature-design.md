# Ship Health & Temperature System

**Date:** 2026-04-05  
**Status:** Draft

## Goal

Add hull HP and a temperature gauge to the map view shuttle. Temperature drifts based on solar distance — too close = overheating, too far = freezing. Extreme temperatures and radiation tick hull damage. Earth orbit is the safe harbor.

## Temperature Model

Single-axis temperature: -100 (frozen) through 0 (nominal) to +100 (overheated).

Temperature is driven by the shuttle's distance from the Sun. The solar system is divided into three zones based on orbital distance:

| Zone | Range (from Sun) | Temperature drift |
|------|-------------------|-------------------|
| Hot | 0 → `hotBoundary` (Venus orbit) | Drifts toward +100 |
| Safe (goldilocks) | `hotBoundary` → `coldBoundary` (Jupiter orbit) | Drifts toward 0 |
| Cold | `coldBoundary` → ∞ | Drifts toward -100 |

Temperature drifts at `tempDriftRate` per second toward the zone's target. It doesn't snap — flying from Earth toward the Sun gradually heats you up. Returning to the safe zone gradually cools you back down.

Zone boundaries are defined as orbital distances in world units (post-ORBIT_SCALE). Approximate values:
- Venus orbit: ~36 units (72 AU * 0.5)
- Jupiter orbit: ~390 units (778 AU * 0.5)

### Temperature → Hull Damage

Damage only ticks when temperature exceeds threshold values:
- `|temp| > damageThreshold` (e.g. 60): hull takes damage
- Damage rate scales linearly: `(|temp| - threshold) / (100 - threshold) * maxTempDamage`
- At temp ±100: full `maxTempDamage` per second

### Radiation → Hull Damage

Uses existing gravity proximity (0–1). Damage ticks when `proximity > radiationThreshold` (e.g. 0.3):
- Rate: `(proximity - threshold) / (1 - threshold) * maxRadiationDamage`
- Stacks with heat damage near the Sun

## Hull HP

- Starts at `maxHp` (e.g. 100)
- Reduced by temperature damage and radiation damage
- HP ≤ 0 → death overlay with cause:
  - If temperature > damageThreshold: "Hull Overheated"
  - If temperature < -damageThreshold: "Hull Frozen"
  - If radiation proximity > radiationThreshold: "Radiation Exposure"
  - Priority: radiation > heat > cold (if multiple active, show the highest damage source)

### Healing

- Earth orbit: HP regenerates at `healRate` per second
- Earth orbit: temperature drifts toward 0 (safe zone behavior)
- Other planet orbits: temperature follows zone rules but no HP regen

## HUD

### Hull HP Bar
- Position: above the FUEL bar (top left)
- Same visual style as fuel bar: colored fill, label "HULL"
- Color: green > 50%, yellow > 20%, red ≤ 20%

### Temperature Gauge
- Position: below the position HUD (top center)
- **Hidden when temperature is in safe range** (`|temp| < displayThreshold`, e.g. 20)
- Horizontal bar with label:
  - Hot side: red fill growing right, label "OVERHEATING"
  - Cold side: blue fill growing left, label "FREEZING"
- Shows numeric value (e.g. "+73°" or "-45°")

## Files

### New
| File | Purpose |
|------|---------|
| `src/lib/shipHealth.ts` | Pure domain logic: HP, temperature, damage ticking, zone detection |
| `src/lib/__tests__/shipHealth.spec.ts` | Tests for temperature drift, damage, healing, death |
| `src/data/shuttle/ship-health.json` | Tuning: HP, thresholds, rates, zone boundaries |

### Modified
| File | Change |
|------|--------|
| `src/components/ShuttleHud.vue` | Add hull HP bar (above fuel) and temperature gauge (below position) |
| `src/assets/css/main.css` | Hull bar and temperature gauge Tailwind classes |
| `src/views/MapViewController.ts` | Create ShipHealth, tick it per frame, feed distance/proximity, emit to telemetry |
| `src/views/MapView.vue` | No change needed — telemetry reactive state already flows to ShuttleHud |
| `src/lib/ShuttleTelemetry.ts` | Add hp, maxHp, temperature, temperatureVisible fields |

## Config (`ship-health.json`)

```json
{
  "maxHp": 100,
  "healRate": 10,
  "hotBoundary": 40,
  "coldBoundary": 350,
  "tempDriftRate": 8,
  "damageThreshold": 60,
  "maxTempDamage": 5,
  "radiationThreshold": 0.3,
  "maxRadiationDamage": 15,
  "displayThreshold": 20
}
```

## Out of Scope

- Asteroid collision damage (future — depends on asteroid collision detection)
- Planet crash instant death (future — depends on planet collision)
- Ship upgrades / heat shields / radiation shielding
- Visual effects for heat/cold (screen tinting, frost overlay)
