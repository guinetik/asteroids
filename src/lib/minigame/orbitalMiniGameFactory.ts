/**
 * Orbital minigame factory.
 *
 * Dispatches on the minigameType string from planet-orbital-config.json
 * to create the appropriate OrbitalMiniGame implementation. All types
 * currently fall through to DefaultOrbitalMiniGame.
 *
 * @author guinetik
 * @date 2026-04-10
 * @spec docs/superpowers/specs/2026-04-10-orbital-minigame-design.md
 */
import type { OrbitalMiniGame } from './OrbitalMiniGame'
import { DefaultOrbitalMiniGame } from './DefaultOrbitalMiniGame'

/**
 * Create an orbital minigame for the given mission and minigame type.
 *
 * @param missionId - The shuttle mission id.
 * @param minigameType - The minigame type from planet-orbital-config.json.
 * @returns A new OrbitalMiniGame instance.
 *
 * @author guinetik
 * @date 2026-04-10
 */
export function createOrbitalMiniGame(missionId: string, minigameType: string): OrbitalMiniGame {
  switch (minigameType) {
    case 'gas-collection':
    case 'probe-deploy':
    case 'logistics':
    case 'chemistry':
    case 'ice-harvest':
    case 'maintenance':
    default:
      return new DefaultOrbitalMiniGame(missionId)
  }
}
