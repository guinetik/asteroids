/**
 * Signal-quality math for relay repair. Pure — no DOM, no state. Key
 * invariant: quality cannot reach `LOCK_THRESHOLD` without the sink being
 * reached, which gates the E lock-in. Tested explicitly.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-relay-repair-design.md
 */
import {
  IDEAL_PATH_LENGTH,
  QUALITY_CAP_WITHOUT_SINK,
  QUALITY_SCALE,
} from './constants'

/**
 * Compute signal quality in [0, 1]. Returns 1 when the wave reaches the
 * sink; otherwise scales from the active-cell count capped at
 * `QUALITY_CAP_WITHOUT_SINK`.
 *
 * @param activeCellCount - Number of cells carrying at least one active port.
 * @param sinkReached - True if one of the wave exits is the sink.
 * @returns Quality in [0, 1].
 */
export function computeQuality(activeCellCount: number, sinkReached: boolean): number {
  if (sinkReached) return 1
  return Math.min(
    QUALITY_CAP_WITHOUT_SINK,
    (activeCellCount / IDEAL_PATH_LENGTH) * QUALITY_SCALE,
  )
}
