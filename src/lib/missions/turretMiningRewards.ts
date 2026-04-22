/**
 * Dock-time delivery for turret mining missions.
 *
 * Consumes the required ore from inventory, credits the player, removes the
 * mission from the active list, and fires a `contractSystem` completion
 * event. For `'any'`-tier missions, main-belt ore stacks are drained in the
 * order declared by {@link MAIN_BELT_ORE_IDS}.
 *
 * @author guinetik
 * @date 2026-04-22
 * @spec docs/superpowers/specs/2026-04-22-turret-mining-missions-design.md
 */
import type { Inventory } from '@/lib/inventory/types'
import { getStack, removeItem } from '@/lib/inventory/inventory'
import type { PlayerProfile } from '@/lib/player/types'
import { addCredits } from '@/lib/player/profile'
import type {
  ActiveTurretMiningMission,
  MiningOreCategory,
  ShuttleMissionBoard,
} from './types'
import { MAIN_BELT_ORE_IDS } from './turretMiningSession'
import { contractSystem } from '@/lib/contracts/runtime'

/** Outcome of delivering mining missions at a giver planet dock. */
export interface TurretMiningDeliveryResult {
  /** Board with successfully-delivered missions removed from `activeMiningMissions`. */
  board: ShuttleMissionBoard
  /** Inventory with ore consumed. Same reference as input when nothing delivered. */
  inventory: Inventory
  /** Profile with credits added. Same reference as input when nothing delivered. */
  profile: PlayerProfile
  /** Missions successfully delivered this call. */
  delivered: ActiveTurretMiningMission[]
}

/**
 * Try to remove `targetKg` across main-belt stacks in catalog order.
 *
 * Pure: returns `ok: false` + original inventory when the available total
 * is below `targetKg`; otherwise returns the reduced inventory with whole-kg
 * removals chained through `removeItem`.
 *
 * @param inventory - Starting inventory.
 * @param targetKg - Total kilograms required.
 * @returns Either a successful drain or a failure with the untouched inventory.
 */
function drainAnyMainBelt(
  inventory: Inventory,
  targetKg: number,
): { ok: true; inventory: Inventory } | { ok: false; inventory: Inventory } {
  let available = 0
  for (const itemId of MAIN_BELT_ORE_IDS) {
    const stack = getStack(inventory, itemId)
    if (stack) available += stack.quantity
  }
  if (available < targetKg) return { ok: false, inventory }

  let remaining = targetKg
  let working = inventory
  for (const itemId of MAIN_BELT_ORE_IDS) {
    if (remaining <= 0) break
    const stack = getStack(working, itemId)
    if (!stack) continue
    const take = Math.min(stack.quantity, remaining)
    const result = removeItem(working, itemId, take)
    if (!result.ok) return { ok: false, inventory }
    working = result.inventory
    remaining -= take
  }
  return { ok: true, inventory: working }
}

/**
 * Attempt to remove the ore required by a mission.
 *
 * @param inventory - Starting inventory.
 * @param category - Mission's ore category.
 * @param targetKg - Quantity required.
 * @returns Either a successful drain or a failure with the untouched inventory.
 */
function drainForCategory(
  inventory: Inventory,
  category: MiningOreCategory,
  targetKg: number,
): { ok: true; inventory: Inventory } | { ok: false; inventory: Inventory } {
  if (category === 'any') return drainAnyMainBelt(inventory, targetKg)
  const stack = getStack(inventory, category)
  if (!stack || stack.quantity < targetKg) return { ok: false, inventory }
  const result = removeItem(inventory, category, targetKg)
  if (!result.ok) return { ok: false, inventory }
  return { ok: true, inventory: result.inventory }
}

/**
 * Deliver every mining mission that is ready-to-deliver at the given giver planet.
 *
 * Each eligible mission consumes its required ore from inventory in a single
 * pass; a shortfall on any mission leaves that mission in place with the
 * inventory unmodified for it (other missions may still deliver). Credits
 * are awarded per successful delivery with `rewardMultiplier` (Science
 * Station) applied and rounded.
 *
 * @param board - Current mission board.
 * @param planetId - Giver planet the player just docked at.
 * @param inventory - Player inventory.
 * @param profile - Player profile; credits on success.
 * @param rewardMultiplier - Science Station bonus (1.0 at level 0).
 * @returns Updated board / inventory / profile + list of delivered missions.
 */
export function deliverTurretMiningMissions(
  board: ShuttleMissionBoard,
  planetId: string,
  inventory: Inventory,
  profile: PlayerProfile,
  rewardMultiplier: number,
): TurretMiningDeliveryResult {
  const delivered: ActiveTurretMiningMission[] = []
  let workingInventory = inventory
  let workingProfile = profile

  const nextActives: ActiveTurretMiningMission[] = []
  for (const mission of board.activeMiningMissions) {
    if (mission.giverPlanet !== planetId) {
      nextActives.push(mission)
      continue
    }
    const drain = drainForCategory(
      workingInventory,
      mission.template.oreCategory,
      mission.template.targetKg,
    )
    if (!drain.ok) {
      nextActives.push(mission) // keep mission; player can try again after mining more.
      continue
    }
    workingInventory = drain.inventory
    const creditsEarned = Math.round(mission.template.reward * rewardMultiplier)
    workingProfile = addCredits(workingProfile, creditsEarned)
    delivered.push(mission)
    contractSystem.notifyMissionCompleted({
      kind: 'mining',
      giverPlanetId: mission.giverPlanet,
      giverId: null,
      targetPlanetId: null,
    })
  }

  if (delivered.length === 0) {
    return { board, inventory, profile, delivered }
  }

  return {
    board: { ...board, activeMiningMissions: nextActives },
    inventory: workingInventory,
    profile: workingProfile,
    delivered,
  }
}
