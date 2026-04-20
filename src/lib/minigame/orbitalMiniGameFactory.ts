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
import { SatelliteServicingMiniGame } from './satelliteServicing/SatelliteServicingMiniGame'
import { TelescopeAlignmentMiniGame } from './telescopeAlignment/TelescopeAlignmentMiniGame'
import type { ActiveVisitRelayMission } from '@/lib/missions/types'

/**
 * Create an orbital minigame for the given mission and minigame type.
 *
 * @param missionId - The shuttle mission id.
 * @param minigameType - The minigame type from planet-orbital-config.json or EVA mission template.
 * @param targetGas - The gather quantity from the mission template.
 * @param planetId - The target planet id (used by probe-deploy and similar minigames).
 * @param mission - The active EVA mission, when the caller is on the EVA path. Gather-mission callers omit.
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
  mission?: ActiveVisitRelayMission,
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
    case 'telescope_alignment':
      return new TelescopeAlignmentMiniGame(missionId)
    case 'satellite_servicing': {
      const broken = mission?.brokenComponents
      if (!broken || broken.length === 0) {
        // No damage state rolled (non-satellite POI, or no manifest) — fall back
        // to the default stub so the EVA flow stays playable.
        return new DefaultOrbitalMiniGame(missionId)
      }
      return new SatelliteServicingMiniGame(missionId, broken)
    }
    default:
      return new DefaultOrbitalMiniGame(missionId)
  }
}
