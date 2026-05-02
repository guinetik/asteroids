# Level run inventory baseline (2026-05-02)

## Goal

On asteroid levels, cargo picked up during a failed attempt should be lost, while items brought from the map stay. The cargo UI should show how much of each stack was collected on the current sortie.

## Model

- Capture a clone of persisted inventory when the level becomes playable (`init` after the prelude gate) and again after each in-place `restartLevel()` (new attempt floor).
- **Run gain** per item id: `max(0, currentQty - baselineQty)` using persisted stacks only.
- On **run failure** (lander destroyed, adrift, FPS death, rescue fail overlay, etc.), load current inventory, subtract all run gains relative to the snapshot, save, then show restart UX.
- Jettison during the run lowers current qty and therefore lowers displayed run gains; it does not restore baseline on death.

## Pure helpers

`src/lib/inventory/inventoryRunBaseline.ts` — `cloneInventory`, `inventoryQuantitiesGainedSince`, `stripInventoryGainedSinceBaseline`.

## Host wiring

`LevelViewController` holds `levelInventoryBaseline`, calls `revertPersistedInventoryRunGains()` from `failLanderRun`, `enterDead`, and `showDeathOverlay`, and exposes `getLevelRunInventoryGains()` for the Vue cargo panel.
