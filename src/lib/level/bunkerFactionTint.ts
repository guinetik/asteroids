/**
 * Shared faction-tint resolver for bunker missions.
 *
 * Used by both the minigame setup (for the antechamber/interior hatch
 * tint passed into {@link BunkerMinigame.create}) and the level view
 * controller (for the surface hatch prop spawned on the asteroid).
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */

/**
 * Faction tints used by bunker missions, keyed by giver id. Falls back to
 * white for unknown givers so visuals stay intact when a future mission
 * arrives without a tint registered.
 */
export const BUNKER_FACTION_TINTS: Record<string, number> = {
  cinderline: 0xff5a1a,
  'lucas-maverick': 0x22d3a8,
  'martian-marines-bunker': 0x7afca7,
  'jovian-society': 0x5cc8ff,
}

/** Fallback tint hex used when a giver id is missing or unrecognised. */
export const BUNKER_FALLBACK_TINT = 0xffffff

/**
 * Resolve a faction tint hex from a giver id. Returns
 * {@link BUNKER_FALLBACK_TINT} when the id is missing or unknown.
 *
 * @param giverId - Giver id from the active mission.
 * @returns Hex color used to tint bunker hatches/surfaces.
 */
export function tintForGiver(giverId: string | undefined): number {
  if (!giverId) return BUNKER_FALLBACK_TINT
  return BUNKER_FACTION_TINTS[giverId] ?? BUNKER_FALLBACK_TINT
}
