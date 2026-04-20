/**
 * Apply a deterministic misrotation roll to a solved relay puzzle. Produces
 * a new `Cell[]` with exactly `WRONG_CELLS_BY_TIER[tier]` cells bumped
 * 1–3 rotations CW from the base state. Deterministic — same mission id +
 * tier always produces the same output. Every misrotation is invertible
 * so the rolled puzzle is always solvable.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-relay-repair-design.md
 */
import { WRONG_CELLS_BY_TIER, type RelayDifficultyTier } from './difficulty'
import { hashString, mulberry32 } from './rng'
import type { Cell, Rotation } from './types'

/**
 * Roll a deterministic wrong-cell set on top of a solved base puzzle.
 *
 * @param base - Solved base cells (from the JSON).
 * @param missionId - EVA mission id used to seed the PRNG.
 * @param tier - Difficulty tier (1/2/3) from `getRelayDifficulty`.
 * @returns A new `Cell[]` with N cells misrotated; base cells untouched.
 */
export function applyRelayDifficulty(
  base: readonly Cell[],
  missionId: string,
  tier: RelayDifficultyTier,
): Cell[] {
  const wrongCount = Math.min(WRONG_CELLS_BY_TIER[tier], base.length)
  const rng = mulberry32(hashString(missionId))
  const indices = Array.from({ length: base.length }, (_, i) => i)
  // Fisher-Yates partial shuffle — first `wrongCount` entries become the picks.
  for (let i = 0; i < wrongCount; i++) {
    const j = i + Math.floor(rng() * (indices.length - i))
    const a = indices[i]!
    const b = indices[j]!
    indices[i] = b
    indices[j] = a
  }
  const picks = new Set(indices.slice(0, wrongCount))
  return base.map((cell, idx) => {
    if (!picks.has(idx)) return { ...cell }
    // Bump rotation by 1, 2, or 3 — never 0, which would leave it unchanged.
    const bump = 1 + Math.floor(rng() * 3)
    const nextRotation = (((cell.rotation + bump) % 4) + 4) % 4
    return {
      ...cell,
      rotation: nextRotation as Rotation,
      visualRotation: cell.visualRotation + bump,
    }
  })
}
