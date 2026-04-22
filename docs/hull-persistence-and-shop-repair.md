# Shuttle and lander hull persistence

Player profile (`localStorage`, key `asteroid-lander-profile`) now stores:

- **`shuttleHullHp`** — Solar map shuttle hull after temperature, radiation, and impact damage. Missing or invalid values are treated as full hull on load.
- **`landerHullHp`** — Lander hull between asteroid missions. Values `≤ 0` are ignored on load so a destroyed lander does not start the next mission at 0 HP.

Shuttle HP is restored when the map controller constructs `ShipHealth`, then kept in sync via **throttled** writes (at most every 200 ms) on `ShipHealth.onHpChanged`. Pure debouncing would never persist while hull damage changes HP every frame (e.g. cold soak at Neptune). The map also flushes on `pagehide` (refresh / tab exit) and on dispose.

Lander HP is applied in `LevelViewController` after the lander loads, with the same throttle + `pagehide` flush pattern. Completing a mission (transition to map), restarting the level, or disposing the level also writes to storage.

## Shop

- **Shuttle hull repair** — Available at every trading post for `REPAIR_COST` credits; sets shuttle hull to 100% and updates `shuttleHullHp`.
- **Lander hull repair** — Same stations, `LANDER_REPAIR_COST` credits; sets `landerHullHp` to the current upgraded maximum (no lander instance on the map).
