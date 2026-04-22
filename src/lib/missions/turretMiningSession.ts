/**
 * Turret mining mission session — pure offer / accept / tick / progress helpers.
 *
 * Parallels `shuttleMissionSession.ts` (planetary + EVA flows) for the mining
 * mission kind. Boards are immutable inputs; every function returns a new
 * board. Progress recording is driven by the existing `onResourcePickup`
 * callback from `TurretSessionController` — this module never touches the
 * turret directly.
 *
 * @author guinetik
 * @date 2026-04-22
 * @spec docs/superpowers/specs/2026-04-22-turret-mining-missions-design.md
 */
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
 * Used by {@link recordTurretMiningProgress} to gate `'any'`-tier contracts so they only
 * credit main-belt pickups — kuiper ices are hard-specific and must be targeted explicitly.
 *
 * @param itemId - Inventory catalog id.
 * @returns True if `itemId` is part of the main-belt ore set.
 */
export function isMainBeltOre(itemId: string): boolean {
  return MAIN_BELT_ORE_IDS.includes(itemId)
}

/**
 * Return whether a mining mission's `oreCategory` matches a given extracted ore.
 *
 * @param category - Mission's declared ore category.
 * @param itemId - Extracted inventory item id.
 * @returns True when the ore should count toward the mission's progress.
 */
export function matchesMiningOreCategory(category: MiningOreCategory, itemId: string): boolean {
  if (category === 'any') return isMainBeltOre(itemId)
  return category === itemId
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

  const newActive: ActiveTurretMiningMission = {
    template: board.offeredMiningMission,
    giverPlanet: board.offeringMiningPlanet,
    minedKg: 0,
    status: 'active',
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

/**
 * Record mining progress against every matching active mining mission.
 * Called on each whole-kg turret commit via the `onResourcePickup` hook in
 * `MapViewController`.
 *
 * @param board - Current mission board state.
 * @param itemId - Extracted inventory item id.
 * @param kg - Kilograms committed this tick (whole units).
 * @returns Updated board; missions that crossed `targetKg` flip to `ready-to-deliver`.
 */
export function recordTurretMiningProgress(
  board: ShuttleMissionBoard,
  itemId: string,
  kg: number,
): ShuttleMissionBoard {
  if (board.activeMiningMissions.length === 0) return board
  let changed = false
  const nextActives = board.activeMiningMissions.map((active) => {
    if (active.status === 'ready-to-deliver') return active
    if (!matchesMiningOreCategory(active.template.oreCategory, itemId)) return active
    const minedKg = active.minedKg + kg
    const status: ActiveTurretMiningMission['status'] =
      minedKg >= active.template.targetKg ? 'ready-to-deliver' : 'active'
    changed = true
    return { ...active, minedKg, status }
  })
  if (!changed) return board
  return { ...board, activeMiningMissions: nextActives }
}

/**
 * Get all active mining missions ready for delivery at a specific giver planet.
 *
 * @param board - Current board state.
 * @param planetId - Giver planet to filter by.
 * @returns Missions with `status === 'ready-to-deliver'` where `giverPlanet` matches.
 */
export function getReadyTurretMiningMissions(
  board: ShuttleMissionBoard,
  planetId: string,
): ActiveTurretMiningMission[] {
  return board.activeMiningMissions.filter(
    (m) => m.giverPlanet === planetId && m.status === 'ready-to-deliver',
  )
}
