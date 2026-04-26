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
import type { ActiveTurretMiningMission, MiningOreCategory, ShuttleMissionBoard } from './types'
import { MAIN_BELT_ORE_IDS } from './turretMiningSession'
import { contractSystem } from '@/lib/contracts/runtime'
import { getTurretMiningPool } from './turretMiningPools'

/** Outcome of delivering one mining mission. */
export interface TurretMiningDeliveryResult {
  /** True when the mission was delivered (ore consumed + credits awarded). */
  ok: boolean
  /** Board with the delivered mission removed (or unchanged on failure). */
  board: ShuttleMissionBoard
  /** Inventory with ore consumed (or unchanged on failure). */
  inventory: Inventory
  /** Profile with credits added (or unchanged on failure). */
  profile: PlayerProfile
  /** The mission that was delivered (or null on failure). */
  mission: ActiveTurretMiningMission | null
  /** Credits awarded after the multiplier (0 on failure). */
  creditsEarned: number
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
 * Deliver one mining mission by template id, if the player is docked at its
 * giver planet and cargo holds enough ore. Consumes the ore, awards credits
 * (with `rewardMultiplier` applied and rounded), removes the mission from
 * the active list, and fires the contract-completion event.
 *
 * @param board - Current mission board.
 * @param missionId - Template id of the mission to deliver.
 * @param planetId - Planet the player is docked at — must equal the mission's giver.
 * @param inventory - Player inventory.
 * @param profile - Player profile; credits on success.
 * @param rewardMultiplier - Science Station bonus (1.0 at level 0).
 * @returns `ok: true` with updated state on success, or `ok: false` with input
 *   refs preserved on shortfall / wrong-planet / unknown-id.
 */
export function deliverTurretMiningMission(
  board: ShuttleMissionBoard,
  missionId: string,
  planetId: string,
  inventory: Inventory,
  profile: PlayerProfile,
  rewardMultiplier: number,
): TurretMiningDeliveryResult {
  const idx = board.activeMiningMissions.findIndex((m) => m.template.id === missionId)
  if (idx === -1) {
    return { ok: false, board, inventory, profile, mission: null, creditsEarned: 0 }
  }
  const mission = board.activeMiningMissions[idx]!
  if (mission.giverPlanet !== planetId) {
    return { ok: false, board, inventory, profile, mission: null, creditsEarned: 0 }
  }
  const drain = drainForCategory(inventory, mission.template.oreCategory, mission.template.targetKg)
  if (!drain.ok) {
    return { ok: false, board, inventory, profile, mission: null, creditsEarned: 0 }
  }
  const creditsEarned = Math.round(mission.template.reward * rewardMultiplier)
  const nextProfile = addCredits(profile, creditsEarned)
  const nextActives = board.activeMiningMissions.filter((_, i) => i !== idx)
  const giverId = mission.giverId ?? getTurretMiningPool(mission.giverPlanet)?.giverId ?? null
  contractSystem.notifyMissionCompleted({
    kind: 'mining',
    giverPlanetId: mission.giverPlanet,
    giverId,
    targetPlanetId: null,
  })
  return {
    ok: true,
    board: { ...board, activeMiningMissions: nextActives },
    inventory: drain.inventory,
    profile: nextProfile,
    mission,
    creditsEarned,
  }
}
