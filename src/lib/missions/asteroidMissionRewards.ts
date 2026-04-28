/**
 * Rewards and persistence when the player finishes an asteroid mission in-level.
 *
 * Shuttle-run missions are stored in localStorage until exfil; completing objectives
 * must grant CR, update profile stats, and clear the active mission so the map
 * board shows no stale “in transit” job.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/superpowers/specs/2026-04-06-asteroid-missions-design.md
 */
import type { GeneratedAsteroidMission } from '@/lib/missions/types'
import { addItem, createInventory } from '@/lib/inventory/inventory'
import { loadInventory, saveInventory } from '@/lib/inventory/inventoryStorage'
import {
  clearActiveMission,
  loadMissionBoard,
  saveMissionBoard,
  savePendingMapReturnWorld,
} from '@/lib/missions/missionStorage'
import {
  addCredits,
  loadProfile,
  recordAsteroidVisit,
  recordMissionComplete,
  saveProfile,
} from '@/lib/player/profile'
import { contractSystem } from '@/lib/contracts/runtime'

/**
 * Award mission payout, bump visit/completion stats, and remove the persisted active mission.
 *
 * Safe to call once per successful run. Ignores missing `localStorage` or profile (still clears
 * active mission storage so the player is not stuck in “in transit”).
 *
 * @param mission - mission completed in the level (same object as `loadActiveMission()`).
 * @param rewardMultiplier - Applied to {@link GeneratedAsteroidMission.totalReward} (e.g. science station).
 */
export function persistCompletedAsteroidMissionRewards(
  mission: GeneratedAsteroidMission,
  rewardMultiplier: number,
): void {
  if (typeof localStorage === 'undefined') return

  const profile = loadProfile()
  if (profile) {
    /**
     * Substitute per-objective `actualReward` (set by partial-credit minigames like DAN)
     * for the rolled `reward` while preserving the completion bonus baked into
     * `mission.totalReward = sum(reward) + completionBonus` at generation time.
     * Backing the bonus out of the difference is correct because no objective is
     * allowed to overpay above its rolled `reward`.
     */
    const rolledObjectiveTotal = mission.objectives.reduce((sum, o) => sum + o.reward, 0)
    const completionBonus = mission.totalReward - rolledObjectiveTotal
    const earnedObjectiveTotal = mission.objectives.reduce(
      (sum, o) => sum + (o.actualReward ?? o.reward),
      0,
    )
    const credits = Math.round((earnedObjectiveTotal + completionBonus) * rewardMultiplier)
    let next = addCredits(profile, credits)
    next = recordMissionComplete(next)
    next = recordAsteroidVisit(next, mission.asteroidId)
    saveProfile(next)
  }

  let inventory = loadInventory() ?? createInventory()
  for (const objective of mission.objectives) {
    if (objective.type !== 'collect' || !objective.collectItemId) continue
    const result = addItem(inventory, objective.collectItemId, 1)
    if (!result.ok) {
      console.warn(
        `[asteroidMissionRewards] Failed to grant collect reward "${objective.collectItemId}": ${result.reason ?? 'unknown error'}`,
      )
      continue
    }
    inventory = result.inventory
  }
  saveInventory(inventory)

  savePendingMapReturnWorld({
    worldX: mission.waypoint.worldX,
    worldZ: mission.waypoint.worldZ,
  })

  const board = loadMissionBoard()
  if (board) {
    const active = board.activeAsteroidMission
    if (active == null || active.id === mission.id) {
      saveMissionBoard({ ...board, activeAsteroidMission: null })
    }
  }

  clearActiveMission()

  contractSystem.notifyMissionCompleted({
    kind: 'asteroid',
    giverPlanetId: null,
    giverId: mission.giverId ?? null,
    targetPlanetId: null,
  })
}
