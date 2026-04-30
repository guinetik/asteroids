/**
 * Procedural photometry lightcurve sampler. Deterministic per seed string —
 * used by the prospectus overlay's photometry summary canvas.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-29-jovian-prospectus-minigame-design.md
 */
import { hashSeed } from '@/lib/missions/asteroidMissionGenerator'
import { mulberry32 } from '@/lib/minigame/relayRepair/rng'

/** Number of samples in the default lightcurve render. */
export const DEFAULT_LIGHTCURVE_SAMPLE_COUNT = 64

/** Base-period frequency in cycles across the sample window. */
const PRIMARY_FREQUENCY_CYCLES = 1.5

/** Secondary harmonic frequency multiplier (added richness). */
const SECONDARY_FREQUENCY_MULT = 3.1

/** Primary lobe amplitude in normalized magnitude. */
const PRIMARY_AMPLITUDE = 0.32

/** Secondary lobe amplitude in normalized magnitude. */
const SECONDARY_AMPLITUDE = 0.12

/** Per-sample noise amplitude in normalized magnitude. */
const NOISE_AMPLITUDE = 0.04

/** Mid-baseline of the curve in normalized magnitude. */
const BASELINE = 0.5

/**
 * Sample a deterministic photometric lightcurve.
 *
 * @param seedString - Stable seed (e.g. `'hektor-photometry'`).
 * @param sampleCount - Number of samples to produce.
 * @returns Array of `sampleCount` values in `[0, 1]`.
 */
export function generatePhotometryLightcurve(
  seedString: string,
  sampleCount: number = DEFAULT_LIGHTCURVE_SAMPLE_COUNT,
): number[] {
  const seed = hashSeed(seedString)
  const next = mulberry32((seed ^ 0x9e3779b9) >>> 0)
  const phase = next() * Math.PI * 2
  const out: number[] = Array.from({ length: sampleCount })
  for (let i = 0; i < sampleCount; i++) {
    const t = (i / sampleCount) * Math.PI * 2
    const primary = Math.sin(t * PRIMARY_FREQUENCY_CYCLES + phase) * PRIMARY_AMPLITUDE
    const secondary = Math.cos(t * SECONDARY_FREQUENCY_MULT) * SECONDARY_AMPLITUDE
    const noise = (next() - 0.5) * 2 * NOISE_AMPLITUDE
    out[i] = Math.max(0, Math.min(1, BASELINE + primary + secondary + noise))
  }
  return out
}
