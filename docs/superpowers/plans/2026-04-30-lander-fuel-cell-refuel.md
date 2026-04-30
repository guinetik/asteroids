# Lander Fuel Cell Refuel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Level view consume lander `fuel-cell` inventory to refuel the active lander.

**Architecture:** Keep inventory math in a pure `src/lib/level/landerFuelCell.ts` helper. Let
`LevelViewController` perform storage and lander side effects, while `LevelView` and `LanderHud`
only bind count and click events.

**Tech Stack:** Vue 3, TypeScript, Vitest, existing inventory and thruster systems.

---

### Task 1: Pure Fuel Cell Helper

**Files:**
- Create: `src/lib/level/landerFuelCell.ts`
- Test: `src/lib/level/__tests__/landerFuelCell.spec.ts`

- [ ] Write failing tests for consuming one `fuel-cell`, failing with no `fuel-cell`, and counting
      remaining cells.
- [ ] Run `bun test:unit src/lib/level/__tests__/landerFuelCell.spec.ts` and confirm the new tests
      fail before implementation.
- [ ] Implement the pure helper using `consumeItem`, `getStack`, and `LANDER_FUEL_ID`.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Level Controller Wiring

**Files:**
- Modify: `src/views/LevelViewController.ts`
- Modify: `src/views/LevelView.vue`

- [ ] Add an `onLanderFuelCellCount` callback to the controller and emit the current persisted
      `fuel-cell` count after init and successful consumption.
- [ ] Add `useLanderFuelCell()` to load inventory, consume one cell, persist, and add 50% lander
      capacity to the active lander fuel tank.
- [ ] In `LevelView`, store `landerFuelCellCount`, refresh it after pickups/jettison, and call the
      controller when the HUD emits `useFuelCell`.

### Task 3: HUD Button

**Files:**
- Modify: `src/components/LanderHud.vue`

- [ ] Add `fuelCellCount?: number` prop and `useFuelCell` emit.
- [ ] Render the same `REFUEL (n)` button as `ShuttleHud` when count is positive and fuel is below
      80%.

### Task 4: Verification

- [ ] Run `bun run lint`.
- [ ] Run `bun run type-check`.
- [ ] Run `bun run test:unit`.
