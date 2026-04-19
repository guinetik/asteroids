# Shuttle map EVA — thermal lockout

Solar-map EVA (`EvaSession` in `MapViewController`) refuses egress while the shuttle is in unsafe thermal stress:

1. Hull temperature magnitude is strictly above **75%** on the −100…+100 gauge, **or**
2. The ship would take **hull damage from temperature** on the current frame (same rules as `ShipHealth.tick`: past `damageThreshold` without matching zone protection).

Radiation-only stress does not lock EVA. Logic lives in `ShipHealth.isEvaThermalBlocked` and is evaluated from `canEva` using the same `computeThermalCaps` inputs as the health tick.
