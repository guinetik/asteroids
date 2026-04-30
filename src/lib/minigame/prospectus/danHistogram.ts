/**
 * Procedural DAN neutron-flux histogram. Deterministic per seed string —
 * used by the prospectus overlay's DAN summary canvas.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-29-jovian-prospectus-minigame-design.md
 */
import { hashSeed } from '@/lib/missions/asteroidMissionGenerator'
import { mulberry32 } from '@/lib/minigame/relayRepair/rng'

/** Number of bins in the default histogram. */
export const DEFAULT_HISTOGRAM_BIN_COUNT = 24

/** Center of the primary volatile peak as a fraction of the bin range. */
const PRIMARY_PEAK_CENTER = 0.35

/** Center of the secondary volatile peak as a fraction of the bin range. */
const SECONDARY_PEAK_CENTER = 0.72

/** Width of each peak (in bin-fraction units). */
const PEAK_WIDTH = 0.09

/** Primary peak amplitude in normalized flux. */
const PRIMARY_PEAK_AMPLITUDE = 0.78

/** Secondary peak amplitude in normalized flux. */
const SECONDARY_PEAK_AMPLITUDE = 0.45

/** Per-bin noise amplitude in normalized flux. */
const NOISE_AMPLITUDE = 0.06

/**
 * Sample a deterministic DAN histogram (normalized flux per bin).
 *
 * @param seedString - Stable seed (e.g. `'hektor-dan'`).
 * @param binCount - Number of histogram bins.
 * @returns Array of `binCount` values in `[0, 1]`.
 */
export function generateDanHistogram(
  seedString: string,
  binCount: number = DEFAULT_HISTOGRAM_BIN_COUNT,
): number[] {
  const next = mulberry32((hashSeed(seedString) ^ 0x9e3779b9) >>> 0)
  const out: number[] = Array.from({ length: binCount })
  for (let i = 0; i < binCount; i++) {
    const x = i / (binCount - 1)
    const primary =
      PRIMARY_PEAK_AMPLITUDE *
      Math.exp(-Math.pow(x - PRIMARY_PEAK_CENTER, 2) / (2 * PEAK_WIDTH * PEAK_WIDTH))
    const secondary =
      SECONDARY_PEAK_AMPLITUDE *
      Math.exp(-Math.pow(x - SECONDARY_PEAK_CENTER, 2) / (2 * PEAK_WIDTH * PEAK_WIDTH))
    const noise = (next() - 0.5) * 2 * NOISE_AMPLITUDE
    out[i] = Math.max(0, Math.min(1, primary + secondary + noise))
  }
  return out
}
