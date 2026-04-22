/**
 * Helpers for orbital minigames that render a canvas inside
 * {@link components.MissionMiniGameOverlay}.
 *
 * @author guinetik
 * @date 2026-04-22
 */

import type { OrbitalMiniGame } from './OrbitalMiniGame'
import { GasCollectionMiniGame } from './gasCollection/GasCollectionMiniGame'
import { IceHarvestMiniGame } from './iceHarvest/IceHarvestMiniGame'
import { LogisticsRouteMiniGame } from './logistics/LogisticsRouteMiniGame'
import { MaintenanceMiniGame } from './maintenance/MaintenanceMiniGame'
import { ProbeDeployMiniGame } from './probeDeploy/ProbeDeployMiniGame'

/**
 * Returns true when the minigame uses a fullscreen canvas (not the default
 * button-completion card).
 *
 * @param minigame - Active orbital minigame, or null when none.
 */
export function isCanvasOrbitalMinigame(minigame: OrbitalMiniGame | null): boolean {
  if (!minigame) return false
  return (
    minigame instanceof GasCollectionMiniGame
    || minigame instanceof IceHarvestMiniGame
    || minigame instanceof MaintenanceMiniGame
    || minigame instanceof LogisticsRouteMiniGame
    || minigame instanceof ProbeDeployMiniGame
  )
}
