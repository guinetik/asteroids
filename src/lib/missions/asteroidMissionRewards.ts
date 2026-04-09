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
import { clearActiveMission, savePendingMapReturnWorld } from '@/lib/missions/missionStorage'
import {
  addCredits,
  loadProfile,
  recordAsteroidVisit,
  recordMissionComplete,
  saveProfile,
} from '@/lib/player/profile'

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
    const credits = Math.round(mission.totalReward * rewardMultiplier)
    let next = addCredits(profile, credits)
    next = recordMissionComplete(next)
    next = recordAsteroidVisit(next, mission.asteroidId)
    saveProfile(next)
  }

  savePendingMapReturnWorld({
    worldX: mission.waypoint.worldX,
    worldZ: mission.waypoint.worldZ,
  })
  clearActiveMission()
}
