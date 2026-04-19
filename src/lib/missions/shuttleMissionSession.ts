/**
 * Shuttle mission session management.
 *
 * Creates and manages the mission board state: offering missions
 * from planet pools, accepting, completing minigames, and delivering
 * for credit rewards. Pure functions — no side effects.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-shuttle-missions-design.md
 */
import type {
  ShuttleMissionBoard,
  ActiveShuttleMission,
  GeneratedAsteroidMission,
  ActiveVisitRelayMission,
} from './types'
import { getEvaMissionPool } from './evaMissionPools'
import { getPlanet } from '@/lib/planets/catalog'
import type { PlayerProfile } from '@/lib/player/types'
import type { Inventory } from '@/lib/inventory/types'
import type { UpgradeLevels } from '@/lib/upgrades'
import { getMissionPool } from './shuttleMissionPools'
import { getGatherItemForPlanet } from './planetOrbitalConfig'
import { canAccessPlanet } from './planetAccessRequirements'
import { addItem, removeItem, canFitItem } from '@/lib/inventory/inventory'
import { addCredits } from '@/lib/player/profile'

/** Minimum restock timer duration in seconds. */
const RESTOCK_MIN_S = 120

/** Maximum restock timer duration in seconds. */
const RESTOCK_MAX_S = 240

/** Lower bound applied to the planet-distance reward multiplier (inner planets floor here). */
const EVA_REWARD_MULTIPLIER_FLOOR = 0.85

/** Absolute minimum payout (credits) for any offered EVA mission after scaling. */
const EVA_MIN_REWARD = 1000

/** Credit rounding step — scaled EVA rewards snap to this granularity for readability. */
const EVA_REWARD_ROUND_STEP = 50

/**
 * Reward multiplier for an EVA mission offered at a given planet. Scales with
 * the planet's distance from the Sun (semi-major axis, AU) using a sqrt curve
 * — inner planets stay close to baseline, outer planets pay substantially
 * more to reflect the extra travel and operating difficulty.
 *
 * @param planetId - Giver planet id.
 * @returns Multiplier applied to the template's base reward.
 */
function planetRewardMultiplier(planetId: string): number {
  try {
    const planet = getPlanet(planetId)
    const raw = Math.sqrt(planet.orbit.semiMajorAxis)
    return Math.max(EVA_REWARD_MULTIPLIER_FLOOR, raw)
  } catch {
    return 1
  }
}

/**
 * Apply distance scaling + minimum floor + 50 CR rounding to an EVA mission's
 * base reward.
 *
 * @param baseReward - Template's stored reward (Earth-equivalent baseline).
 * @param planetId - Giver planet id used to derive the multiplier.
 */
function computeScaledEvaReward(baseReward: number, planetId: string): number {
  const scaled = baseReward * planetRewardMultiplier(planetId)
  const floored = Math.max(EVA_MIN_REWARD, scaled)
  return Math.round(floored / EVA_REWARD_ROUND_STEP) * EVA_REWARD_ROUND_STEP
}

/**
 * Generate a random restock duration between min and max.
 *
 * @returns Duration in seconds.
 */
function randomRestockDuration(): number {
  return RESTOCK_MIN_S + Math.random() * (RESTOCK_MAX_S - RESTOCK_MIN_S)
}

/**
 * Create a new empty mission board.
 *
 * @returns An empty ShuttleMissionBoard.
 */
export function createMissionBoard(): ShuttleMissionBoard {
  return {
    offeredMission: null,
    offeringPlanet: null,
    restockTimer: null,
    activeMissions: [],
    offeredAsteroidMission: null,
    activeAsteroidMission: null,
    asteroidRestockTimer: null,
    offeredEvaMission: null,
    offeringEvaPlanet: null,
    evaRestockTimer: null,
    activeEvaMissions: [],
  }
}

/**
 * Offer a mission from a planet's pool. Picks 1 random mission from
 * the planet's pool, filtered to targets the player can safely reach
 * with their current upgrades. Does nothing if a restock timer is
 * running, the planet has no pool, or no missions pass the filter.
 *
 * @param board - Current mission board state.
 * @param planetId - Planet the player is docked at.
 * @param upgradeLevels - Current player upgrade levels for access filtering.
 * @returns Updated board with an offered mission (or unchanged).
 */
export function offerMission(
  board: ShuttleMissionBoard,
  planetId: string,
  upgradeLevels: UpgradeLevels = {},
): ShuttleMissionBoard {
  if (board.restockTimer) return board

  const pool = getMissionPool(planetId)
  if (!pool || pool.missions.length === 0) return board

  const accessible = pool.missions.filter((m) => canAccessPlanet(m.targetPlanet, upgradeLevels))
  if (accessible.length === 0) return board

  const index = Math.floor(Math.random() * accessible.length)
  const mission = accessible[index]!

  return {
    ...board,
    offeredMission: mission,
    offeringPlanet: planetId,
  }
}

/**
 * Accept the currently offered mission. Moves it to the active list
 * and starts a restock timer.
 *
 * @param board - Current mission board state.
 * @returns Updated board with mission accepted and timer started.
 */
export function acceptMission(board: ShuttleMissionBoard): ShuttleMissionBoard {
  if (!board.offeredMission || !board.offeringPlanet) return board

  const newActive: ActiveShuttleMission = {
    template: board.offeredMission,
    giverPlanet: board.offeringPlanet,
    status: 'active',
  }

  const total = randomRestockDuration()

  return {
    ...board,
    offeredMission: null,
    restockTimer: { remaining: total, total },
    activeMissions: [...board.activeMissions, newActive],
  }
}

/** Result of completing a mission minigame (board + inventory update). */
export interface CompleteMissionResult {
  /** Whether the operation succeeded. */
  ok: boolean
  /** Updated mission board. */
  board: ShuttleMissionBoard
  /** Updated inventory. */
  inventory: Inventory
  /** Explanation when ok is false. */
  reason?: string
}

/** Result of delivering a completed mission (board + inventory + profile update). */
export interface DeliverMissionResult {
  /** Whether the operation succeeded. */
  ok: boolean
  /** Updated mission board. */
  board: ShuttleMissionBoard
  /** Updated inventory. */
  inventory: Inventory
  /** Updated player profile. */
  profile: PlayerProfile
  /** Explanation when ok is false. */
  reason?: string
}

/**
 * Complete a mission's minigame at the target planet. Adds gathered
 * items to inventory and updates mission status to ready-to-deliver.
 *
 * @param board - Current mission board.
 * @param missionId - ID of the active mission to complete.
 * @param inventory - Player inventory.
 * @returns Result with updated board and inventory.
 */
export function completeMission(
  board: ShuttleMissionBoard,
  missionId: string,
  inventory: Inventory,
): CompleteMissionResult {
  const idx = board.activeMissions.findIndex((m) => m.template.id === missionId)
  if (idx === -1) {
    return { ok: false, board, inventory, reason: 'Mission not found' }
  }

  const mission = board.activeMissions[idx]!
  if (mission.status !== 'active') {
    return { ok: false, board, inventory, reason: 'Mission already completed' }
  }

  const gatherItem = getGatherItemForPlanet(mission.template.targetPlanet)
  if (!gatherItem) {
    return { ok: false, board, inventory, reason: 'No gather item configured for target planet' }
  }

  if (!canFitItem(inventory, gatherItem, mission.template.gatherQuantity)) {
    return { ok: false, board, inventory, reason: 'Cargo hold cannot fit gathered items' }
  }

  const addResult = addItem(inventory, gatherItem, mission.template.gatherQuantity)
  if (!addResult.ok) {
    return { ok: false, board, inventory, reason: addResult.reason }
  }

  const updatedMissions = [...board.activeMissions]
  updatedMissions[idx] = { ...mission, status: 'ready-to-deliver' }

  return {
    ok: true,
    board: { ...board, activeMissions: updatedMissions },
    inventory: addResult.inventory,
  }
}

/**
 * Deliver a completed mission at the giver planet. Removes gathered
 * items from inventory, awards credits, and removes the mission.
 *
 * @param board - Current mission board.
 * @param missionId - ID of the mission to deliver.
 * @param profile - Player profile.
 * @param inventory - Player inventory.
 * @param rewardMultiplier - Optional multiplier applied to the CR reward (default 1).
 * @returns Result with updated board, profile, and inventory.
 */
export function deliverMission(
  board: ShuttleMissionBoard,
  missionId: string,
  profile: PlayerProfile,
  inventory: Inventory,
  rewardMultiplier = 1,
): DeliverMissionResult {
  const idx = board.activeMissions.findIndex((m) => m.template.id === missionId)
  if (idx === -1) {
    return { ok: false, board, profile, inventory, reason: 'Mission not found' }
  }

  const mission = board.activeMissions[idx]!
  if (mission.status !== 'ready-to-deliver') {
    return { ok: false, board, profile, inventory, reason: 'Mission not ready for delivery' }
  }

  const gatherItem = getGatherItemForPlanet(mission.template.targetPlanet)
  if (!gatherItem) {
    return { ok: false, board, profile, inventory, reason: 'No gather item configured' }
  }

  const removeResult = removeItem(inventory, gatherItem, mission.template.gatherQuantity)
  if (!removeResult.ok) {
    return { ok: false, board, profile, inventory, reason: removeResult.reason }
  }

  const updatedProfile = addCredits(profile, Math.round(mission.template.reward * rewardMultiplier))
  const updatedMissions = board.activeMissions.filter((_, i) => i !== idx)

  return {
    ok: true,
    board: { ...board, activeMissions: updatedMissions },
    profile: updatedProfile,
    inventory: removeResult.inventory,
  }
}

/**
 * Tick the mission board restock timer.
 *
 * @param board - Current board state.
 * @param dt - Delta time in seconds.
 * @returns Updated board (same reference if nothing changed).
 */
export function tickMissionBoard(board: ShuttleMissionBoard, dt: number): ShuttleMissionBoard {
  if (!board.restockTimer) return board

  const remaining = board.restockTimer.remaining - dt
  if (remaining <= 0) {
    return { ...board, restockTimer: null }
  }

  return {
    ...board,
    restockTimer: { ...board.restockTimer, remaining },
  }
}

/**
 * Get active missions targeting a specific planet.
 * Used to decide if the mission button shows in OrbitPrompt.
 *
 * @param board - Current board state.
 * @param planetId - Target planet to filter by.
 * @returns Active missions where targetPlanet matches.
 */
export function getActiveMissionsForPlanet(
  board: ShuttleMissionBoard,
  planetId: string,
): ActiveShuttleMission[] {
  return board.activeMissions.filter(
    (m) => m.template.targetPlanet === planetId && m.status === 'active',
  )
}

/**
 * Get missions ready for delivery at a specific planet.
 *
 * @param board - Current board state.
 * @param planetId - Giver planet to filter by.
 * @returns Missions with status ready-to-deliver at this giver planet.
 */
export function getDeliverableMissions(
  board: ShuttleMissionBoard,
  planetId: string,
): ActiveShuttleMission[] {
  return board.activeMissions.filter(
    (m) => m.giverPlanet === planetId && m.status === 'ready-to-deliver',
  )
}

/**
 * Set the offered asteroid mission on the board.
 * Does nothing if a restock timer is running.
 *
 * @param board - Current board state.
 * @param mission - Generated asteroid mission to offer.
 * @returns Updated board.
 */
export function offerAsteroidMission(
  board: ShuttleMissionBoard,
  mission: GeneratedAsteroidMission,
): ShuttleMissionBoard {
  if (board.asteroidRestockTimer) return board
  return { ...board, offeredAsteroidMission: mission }
}

/**
 * Accept the offered asteroid mission. Moves it to active and starts restock timer.
 *
 * @param board - Current board state.
 * @returns Updated board.
 */
export function acceptAsteroidMission(board: ShuttleMissionBoard): ShuttleMissionBoard {
  if (!board.offeredAsteroidMission) return board

  const total = randomRestockDuration()
  return {
    ...board,
    offeredAsteroidMission: null,
    activeAsteroidMission: { ...board.offeredAsteroidMission, status: 'accepted' },
    asteroidRestockTimer: { remaining: total, total },
  }
}

/**
 * Mark the active asteroid mission as in-transit (player pressed E at waypoint).
 *
 * @param board - Current board state.
 * @returns Updated board.
 */
export function beginAsteroidMission(board: ShuttleMissionBoard): ShuttleMissionBoard {
  if (!board.activeAsteroidMission || board.activeAsteroidMission.status !== 'accepted') return board
  return {
    ...board,
    activeAsteroidMission: { ...board.activeAsteroidMission, status: 'in-transit' },
  }
}

/**
 * Tick the asteroid mission restock timer.
 *
 * @param board - Current board state.
 * @param dt - Delta time in seconds.
 * @returns Updated board.
 */
export function tickAsteroidMissionBoard(board: ShuttleMissionBoard, dt: number): ShuttleMissionBoard {
  if (!board.asteroidRestockTimer) return board

  const remaining = board.asteroidRestockTimer.remaining - dt
  if (remaining <= 0) {
    return { ...board, asteroidRestockTimer: null }
  }

  return {
    ...board,
    asteroidRestockTimer: { ...board.asteroidRestockTimer, remaining },
  }
}

/**
 * Offer an EVA mission from the docked planet's pool. No-op if restocking,
 * already offering, or the planet has no EVA pool.
 *
 * @param board - Current mission board state.
 * @param planetId - Planet the player is docked at.
 * @returns Updated board with an offered EVA mission (or unchanged).
 */
export function offerEvaMission(
  board: ShuttleMissionBoard,
  planetId: string,
): ShuttleMissionBoard {
  if (board.evaRestockTimer) return board
  if (board.offeredEvaMission && board.offeringEvaPlanet === planetId) return board

  const pool = getEvaMissionPool(planetId)
  if (!pool || pool.missions.length === 0) return board

  const index = Math.floor(Math.random() * pool.missions.length)
  const chosen = pool.missions[index]!
  const scaledMission = {
    ...chosen,
    reward: computeScaledEvaReward(chosen.reward, planetId),
  }

  return {
    ...board,
    offeredEvaMission: scaledMission,
    offeringEvaPlanet: planetId,
  }
}

/**
 * Accept the currently offered EVA mission. Moves it to the active list and
 * starts a restock timer.
 *
 * @param board - Current mission board state.
 * @returns Updated board with the EVA mission accepted and timer started.
 */
export function acceptEvaMission(board: ShuttleMissionBoard): ShuttleMissionBoard {
  if (!board.offeredEvaMission || !board.offeringEvaPlanet) return board

  const newActive: ActiveVisitRelayMission = {
    template: board.offeredEvaMission,
    giverPlanet: board.offeringEvaPlanet,
    status: 'active',
  }

  const total = randomRestockDuration()

  return {
    ...board,
    offeredEvaMission: null,
    offeringEvaPlanet: null,
    evaRestockTimer: { remaining: total, total },
    activeEvaMissions: [...board.activeEvaMissions, newActive],
  }
}

/**
 * Tick the EVA mission restock timer.
 *
 * @param board - Current board state.
 * @param dt - Delta time in seconds.
 * @returns Updated board (same reference if nothing changed).
 */
export function tickEvaMissionBoard(board: ShuttleMissionBoard, dt: number): ShuttleMissionBoard {
  if (!board.evaRestockTimer) return board

  const remaining = board.evaRestockTimer.remaining - dt
  if (remaining <= 0) {
    return { ...board, evaRestockTimer: null }
  }

  return {
    ...board,
    evaRestockTimer: { ...board.evaRestockTimer, remaining },
  }
}
