# Shuttle and lander hull persistence

Player profile (`localStorage`, key `asteroid-lander-profile`) now stores:

- **`shuttleHullHp`** — Solar map shuttle hull after temperature, radiation, and impact damage. Missing or invalid values are treated as full hull on load.
- **`landerHullHp`** — Lander hull between asteroid missions. Values `≤ 0` are ignored on load so a destroyed lander does not start the next mission at 0 HP.

Shuttle HP is restored when the map controller constructs `ShipHealth`, then kept in sync via debounced writes (200 ms) on `ShipHealth.onHpChanged`. Map dispose flushes once more.

Lander HP is applied in `LevelViewController` after the lander loads, with debounced saves on damage/repair. Completing a mission (transition to map), restarting the level, or disposing the level flushes to storage.

## Shop

- **Shuttle hull repair** — Unchanged: Earth orbit only, uses `REPAIR_COST` credits; sets shuttle hull to 100% and updates `shuttleHullHp`.
- **Lander hull repair** — Available at every trading post for `LANDER_REPAIR_COST` credits (see `shopSession.ts`); sets `landerHullHp` to the current upgraded maximum (no lander instance on the map).
