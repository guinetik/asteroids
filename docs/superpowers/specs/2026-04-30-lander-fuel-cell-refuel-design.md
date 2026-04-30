# Lander Fuel Cell Refuel Design

## Goal

Replicate the Map view reserve-fuel button in the Level view so players can spend one lander
`fuel-cell` from cargo to restore lander fuel during lander flight.

## Behavior

The Level lander HUD shows `REFUEL (n)` when the active lander has less than 80% fuel and the
persisted inventory contains at least one `fuel-cell`. Pressing the button consumes one `fuel-cell`,
persists the updated inventory, and adds 50% of the lander's fuel capacity through the existing
`ThrusterSystem.addFuel()` clamp.

## Architecture

Inventory consumption lives in a small pure helper under `src/lib/level/` so it can be unit-tested
without booting the Three.js level scene. `LevelViewController` owns the side effects: loading and
saving inventory, adding fuel to the live lander, and emitting the remaining count to Vue. `LevelView`
passes that count into `LanderHud`, and `LanderHud` mirrors the `ShuttleHud` button behavior.

## Testing

Add focused Vitest coverage for the pure helper: successful consume, no-cell failure, and remaining
count calculation. Full acceptance remains `bun run lint`, `bun run type-check`, and
`bun run test:unit`.
