/**
 * Factory for MultiToolConfig with upgrade multipliers applied.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/superpowers/specs/2026-04-07-upgrade-system-design.md
 */
import multiToolConfigJson from '@/data/fps/multitool-config.json'
import type { MultiToolConfig } from '@/lib/fps/multiToolState'
import { getCurrentUpgradeValue } from '@/lib/upgrades'

/** Baseline drill-capacity boost applied before multitool upgrades. */
const BASE_DRILL_CAPACITY_MULTIPLIER = 5

/**
 * Build a {@link MultiToolConfig} with multitool upgrade multipliers applied.
 *
 * Reads the base JSON config and scales RTG capacity, RTG burst amount, and
 * per-mode burn rates according to the current player upgrade levels.
 *
 * @returns The scaled MultiToolConfig ready for use in a MultiToolState.
 */
export function buildMultiToolConfig(): MultiToolConfig {
  const base = multiToolConfigJson as MultiToolConfig
  const efficiency = getCurrentUpgradeValue('multitoolEfficiency')
  const rtgCapacity = getCurrentUpgradeValue('multitoolRtgCapacity')
  const rtgCharge = getCurrentUpgradeValue('multitoolRtgCharge')
  return {
    ...base,
    rtg: {
      ...base.rtg,
      fuelCapacity: base.rtg.fuelCapacity * rtgCapacity,
      burstAmount: base.rtg.burstAmount * rtgCharge,
      thrusters: {
        drill: {
          ...base.rtg.thrusters.drill,
          capacity: base.rtg.thrusters.drill.capacity * BASE_DRILL_CAPACITY_MULTIPLIER,
          burnRate: base.rtg.thrusters.drill.burnRate * efficiency,
        },
        weapon: { ...base.rtg.thrusters.weapon, burnRate: base.rtg.thrusters.weapon.burnRate * efficiency },
        heal: { ...base.rtg.thrusters.heal, burnRate: base.rtg.thrusters.heal.burnRate * efficiency },
      },
    },
  }
}
