/**
 * Pipe-node shape rotation tables and direction helpers. Pure data — no DOM
 * or framework dependencies. Values mirror `docs/inspo/RelayRepairMinigame.jsx`
 * lines 82–93 verbatim.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-relay-repair-design.md
 */
import type { Direction, Rotation, Shape } from './types'

/** Port lists for each shape × rotation. Index 0 is canonical. */
export const SHAPE_ROTATIONS: Readonly<Record<Shape, readonly (readonly Direction[])[]>> = {
  I: [
    ['E', 'W'],
    ['N', 'S'],
    ['E', 'W'],
    ['N', 'S'],
  ],
  L: [
    ['N', 'E'],
    ['E', 'S'],
    ['S', 'W'],
    ['W', 'N'],
  ],
  T: [
    ['N', 'E', 'S'],
    ['E', 'S', 'W'],
    ['S', 'W', 'N'],
    ['W', 'N', 'E'],
  ],
} as const

/** Opposite direction of each cardinal. */
export const OPPOSITE: Readonly<Record<Direction, Direction>> = {
  N: 'S',
  S: 'N',
  E: 'W',
  W: 'E',
} as const

/** Row/col delta for each cardinal. */
export const DIR_DELTA: Readonly<Record<Direction, readonly [number, number]>> = {
  N: [-1, 0],
  E: [0, 1],
  S: [1, 0],
  W: [0, -1],
} as const

/**
 * Get the active port list for a shape at a given rotation. Rotation is
 * normalized to [0, 4) so callers can freely increment the visual rotation
 * across multiple turns without wrapping manually.
 *
 * @param shape - Shape family.
 * @param rotation - Discrete rotation index; normalized via mod-4.
 * @returns The port list at that rotation.
 */
export function getPorts(shape: Shape, rotation: Rotation): readonly Direction[] {
  const idx = (((rotation % 4) + 4) % 4) as 0 | 1 | 2 | 3
  return SHAPE_ROTATIONS[shape][idx]!
}
