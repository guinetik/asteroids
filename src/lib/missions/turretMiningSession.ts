/**
 * Turret mining mission session — pure offer / accept / tick / progress helpers.
 *
 * Parallels `shuttleMissionSession.ts` (planetary + EVA flows) for the mining
 * mission kind. Boards are immutable inputs; every function returns a new
 * board. Progress and readiness are derived from current cargo inventory at
 * read time — no per-commit event tracking. The player just needs the right
 * ore in the hold when they dock at the giver planet.
 *
 * @author guinetik
 * @date 2026-04-22
 * @spec docs/superpowers/specs/2026-04-22-turret-mining-missions-design.md
 */
import type { Inventory } from '@/lib/inventory/types'
import { getStack } from '@/lib/inventory/inventory'
import type {
  ActiveTurretMiningMission,
  MiningOreCategory,
  ShuttleMissionBoard,
} from './types'
import { getTurretMiningPool } from './turretMiningPools'

/** Main-belt ore ids that count toward an `'any'` mining mission. */
export const MAIN_BELT_ORE_IDS: readonly string[] = [
  'olivine',
  'magnetite',
  'pyroxene',
  'iron-nickel-alloy',
]

/** Restock timer range in seconds — matches planetary + EVA cadence. */
const RESTOCK_MIN_S = 120

/** Restock timer range in seconds — matches planetary + EVA cadence. */
const RESTOCK_MAX_S = 240

/**
 * Whether an ore id is a main-belt ore (olivine, magnetite, pyroxene, iron-nickel-alloy).
 *
 * Used by {@link computeMiningProgressKg} to gate `'any'`-tier contracts so they
 * only count main-belt cargo — kuiper ices are hard-specific and must be targeted
 * explicitly.
 *
 * @param itemId - Inventory catalog id.
 * @returns True if `itemId` is part of the main-belt ore set.
 */
export function isMainBeltOre(itemId: string): boolean {
  return MAIN_BELT_ORE_IDS.includes(itemId)
}

/**
 * Return whether a mining mission's `oreCategory` matches a given ore item id.
 *
 * @param category - Mission's declared ore category.
 * @param itemId - Inventory item id to test.
 * @returns True when the ore should count toward the mission's progress.
 */
export function matchesMiningOreCategory(category: MiningOreCategory, itemId: string): boolean {
  if (category === 'any') return isMainBeltOre(itemId)
  return category === itemId
}

/**
 * Total kg of matching ore currently in cargo for a given mining mission.
 *
 * For specific-ore missions: the quantity of that one item. For `'any'` missions:
 * the sum across all {@link MAIN_BELT_ORE_IDS} stacks.
 *
 * @param inventory - Current shuttle inventory.
 * @param mission - The active mining mission to measure against.
 * @returns Kilograms of matching ore present in cargo (uncapped — may exceed `targetKg`).
 */
export function computeMiningProgressKg(
  inventory: Inventory,
  mission: ActiveTurretMiningMission,
): number {
  const category = mission.template.oreCategory
  if (category === 'any') {
    let total = 0
    for (const itemId of MAIN_BELT_ORE_IDS) {
      const stack = getStack(inventory, itemId)
      if (stack) total += stack.quantity
    }
    return total
  }
  const stack = getStack(inventory, category)
  return stack ? stack.quantity : 0
}

/**
 * Whether a mission can be delivered right now given the current inventory.
 *
 * @param inventory - Current shuttle inventory.
 * @param mission - The active mining mission.
 * @returns True when cargo holds at least `targetKg` of matching ore.
 */
export function isMiningMissionReady(
  inventory: Inventory,
  mission: ActiveTurretMiningMission,
): boolean {
  return computeMiningProgressKg(inventory, mission) >= mission.template.targetKg
}

/**
 * Random restock duration in seconds — matches shuttleMissionSession behavior.
 *
 * @returns Duration in seconds between {@link RESTOCK_MIN_S} and {@link RESTOCK_MAX_S}.
 */
function randomMiningRestockDuration(): number {
  return RESTOCK_MIN_S + Math.random() * (RESTOCK_MAX_S - RESTOCK_MIN_S)
}

/**
 * Offer a mining mission from a giver planet's pool. No-op when a restock
 * timer is already running, the planet has no pool, or every mission in the
 * pool is already active.
 *
 * @param board - Current mission board state.
 * @param planetId - Planet the player is docked at.
 * @returns Updated board with an offered mining mission (or unchanged).
 */
export function offerTurretMiningMission(
  board: ShuttleMissionBoard,
  planetId: string,
): ShuttleMissionBoard {
  if (board.miningRestockTimer) return board
  const pool = getTurretMiningPool(planetId)
  if (!pool || pool.missions.length === 0) return board

  const activeIds = new Set(board.activeMiningMissions.map((m) => m.template.id))
  const candidates = pool.missions.filter((m) => !activeIds.has(m.id))
  if (candidates.length === 0) return board

  const idx = Math.floor(Math.random() * candidates.length)
  const chosen = candidates[idx]!

  return {
    ...board,
    offeredMiningMission: chosen,
    offeringMiningPlanet: planetId,
  }
}

/**
 * Accept the currently offered mining mission. Moves it to the active list
 * and starts a restock timer. No-op if nothing is offered.
 *
 * @param board - Current mission board state.
 * @returns Updated board with the mission accepted and timer started.
 */
export function takeTurretMiningMission(board: ShuttleMissionBoard): ShuttleMissionBoard {
  if (!board.offeredMiningMission || !board.offeringMiningPlanet) return board

  const pool = getTurretMiningPool(board.offeringMiningPlanet)
  if (!pool) return board

  const newActive: ActiveTurretMiningMission = {
    template: board.offeredMiningMission,
    giverPlanet: board.offeringMiningPlanet,
    giverId: pool.giverId,
  }

  const total = randomMiningRestockDuration()
  return {
    ...board,
    offeredMiningMission: null,
    offeringMiningPlanet: null,
    miningRestockTimer: { remaining: total, total },
    activeMiningMissions: [...board.activeMiningMissions, newActive],
  }
}

/**
 * Tick the mining mission restock timer.
 *
 * @param board - Current board state.
 * @param dt - Delta time in seconds.
 * @returns Updated board (same reference if nothing changed).
 */
export function tickTurretMiningRestock(
  board: ShuttleMissionBoard,
  dt: number,
): ShuttleMissionBoard {
  if (!board.miningRestockTimer) return board
  const remaining = board.miningRestockTimer.remaining - dt
  if (remaining <= 0) {
    return { ...board, miningRestockTimer: null }
  }
  return {
    ...board,
    miningRestockTimer: { ...board.miningRestockTimer, remaining },
  }
}
