/**
 * Builds a FpsPlayerConfig with suit upgrade multipliers baked in.
 *
 * Called once per FPS session start so all five suit upgrades are
 * applied to the base JSON values before the player controller is
 * constructed. Keeps upgrade scaling out of the controller itself.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/superpowers/specs/2026-04-07-upgrade-system-design.md
 */
import playerConfigJson from '@/data/fps/player-config.json'
import type { FpsPlayerConfig } from '@/three/FpsPlayerController'
import { getCurrentUpgradeValue } from '@/lib/upgrades'

/** Baseline sprint-capacity boost applied before suit stamina upgrades. */
const BASE_SPRINT_CAPACITY_MULTIPLIER = 2

/**
 * Build a {@link FpsPlayerConfig} with all five suit upgrade multipliers applied.
 *
 * Multipliers applied:
 * - `suitArmor`             → `health.maxHp`
 * - `suitMobility`          → `movement.maxSpeed`, `maxSprintSpeed`, `jumpForce`
 * - `suitO2Capacity`        → `o2.fuelCapacity`
 * - `suitStaminaCapacity`   → `o2.thrusters.sprint.capacity`, `jump.capacity`
 * - `suitStaminaEfficiency` → `o2.thrusters.sprint.burnRate` and
 *   `sprint.fuelCostPerRecharge` (lower scale = less drain / less O2 to recharge)
 *
 * @returns A new config object — the base JSON is not mutated.
 */
export function buildFpsPlayerConfig(): FpsPlayerConfig {
  const base = playerConfigJson as FpsPlayerConfig
  const o2Capacity = getCurrentUpgradeValue('suitO2Capacity')
  const staminaCapacity = getCurrentUpgradeValue('suitStaminaCapacity')
  const staminaEfficiency = getCurrentUpgradeValue('suitStaminaEfficiency')
  const mobility = getCurrentUpgradeValue('suitMobility')
  const armor = getCurrentUpgradeValue('suitArmor')

  return {
    ...base,
    health: {
      ...base.health,
      maxHp: base.health.maxHp * armor,
    },
    movement: {
      ...base.movement,
      maxSpeed: base.movement.maxSpeed * mobility,
      maxSprintSpeed: base.movement.maxSprintSpeed * mobility,
      jumpForce: base.movement.jumpForce * mobility,
    },
    o2: {
      ...base.o2,
      fuelCapacity: base.o2.fuelCapacity * o2Capacity,
      thrusters: {
        sprint: {
          ...base.o2.thrusters.sprint,
          capacity:
            base.o2.thrusters.sprint.capacity * BASE_SPRINT_CAPACITY_MULTIPLIER * staminaCapacity,
          burnRate: base.o2.thrusters.sprint.burnRate * staminaEfficiency,
          fuelCostPerRecharge:
            base.o2.thrusters.sprint.fuelCostPerRecharge * staminaEfficiency,
        },
        jump: {
          ...base.o2.thrusters.jump,
          capacity: base.o2.thrusters.jump.capacity * staminaCapacity,
        },
      },
    },
  }
}
