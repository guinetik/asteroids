/**
 * Orbital minigame factory.
 *
 * Dispatches on the minigameType string from planet-orbital-config.json
 * to create the appropriate OrbitalMiniGame implementation.
 *
 * @author guinetik
 * @date 2026-04-10
 * @spec docs/superpowers/specs/2026-04-10-orbital-minigame-design.md
 */
import type { OrbitalMiniGame } from './OrbitalMiniGame'
import { DefaultOrbitalMiniGame } from './DefaultOrbitalMiniGame'
import { GasCollectionMiniGame } from './gasCollection/GasCollectionMiniGame'
import { IceHarvestMiniGame } from './iceHarvest/IceHarvestMiniGame'
import { MaintenanceMiniGame } from './maintenance/MaintenanceMiniGame'
import { LogisticsRouteMiniGame } from './logistics/LogisticsRouteMiniGame'
import { ProbeDeployMiniGame } from './probeDeploy/ProbeDeployMiniGame'
import type { ActiveVisitRelayMission } from '@/lib/missions/types'

/**
 * Create an orbital minigame for the given mission and minigame type.
 *
 * @param missionId - The shuttle mission id.
 * @param minigameType - The minigame type from planet-orbital-config.json or EVA mission template.
 * @param targetGas - The gather quantity from the mission template.
 * @param planetId - The target planet id (used by probe-deploy and similar minigames).
 * @param _mission - The active EVA mission, when the caller is on the EVA path. Gather-mission callers omit.
 * @returns A new OrbitalMiniGame instance.
 *
 * @author guinetik
 * @date 2026-04-10
 */
export function createOrbitalMiniGame(
  missionId: string,
  minigameType: string,
  targetGas: number,
  planetId?: string,
  // `_mission` is reserved for EVA minigames (satellite_servicing) that read
  // mission-level data like brokenComponents. All current cases ignore it.
  _mission?: ActiveVisitRelayMission,
): OrbitalMiniGame {
  switch (minigameType) {
    case 'gas-collection':
      return new GasCollectionMiniGame(missionId, targetGas)
    case 'ice-harvest':
      return new IceHarvestMiniGame(missionId, targetGas)
    case 'maintenance':
      return new MaintenanceMiniGame(missionId, targetGas)
    case 'chemistry':
      return new GasCollectionMiniGame(missionId, targetGas)
    case 'logistics':
      return new LogisticsRouteMiniGame(missionId, targetGas)
    case 'probe-deploy':
      return new ProbeDeployMiniGame(missionId, targetGas, planetId ?? 'mercury')
    default:
      return new DefaultOrbitalMiniGame(missionId)
  }
}
