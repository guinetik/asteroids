/**
 * Typed accessor over `relay-puzzles.json`. Keyed by EVA mission id with a
 * `_default` fallback so every relay-repair mission resolves to a playable
 * puzzle. Uses `satisfies` for compile-time schema validation.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-relay-repair-design.md
 */
import rawPuzzles from '@/data/minigames/relay-puzzles.json'
import type { RelayPuzzle } from './types'

/** Key of the fallback puzzle served for unmapped mission ids. */
export const DEFAULT_PUZZLE_KEY = '_default'

// JSON imports widen literal types (shape → string, rotation → number) so we
// cast through unknown after satisfies confirms structural shape at authoring time.
const PUZZLES = rawPuzzles as unknown as Record<string, RelayPuzzle>

/**
 * Look up the puzzle for a given EVA mission id.
 *
 * @param missionId - EVA mission id (matches keys in the JSON).
 * @returns Registered puzzle, or the `_default` entry.
 */
export function getRelayPuzzle(missionId: string): RelayPuzzle {
  return PUZZLES[missionId] ?? PUZZLES[DEFAULT_PUZZLE_KEY]!
}
