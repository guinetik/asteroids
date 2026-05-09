/**
 * Type definitions for the habitat observatory's curated sky-atlas targets.
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-05-09-habitat-observatory-design.md
 */

/**
 * One curated entry shown in the observatory dialog's sidebar. Loaded
 * statically from `src/data/observatory/targets.json` and validated by
 * `__tests__/targets.spec.ts`.
 */
export interface ObservatoryTarget {
  /** Stable kebab-case id, e.g. `'sgr-a-star'`. Used as Vue key + telemetry. */
  readonly id: string
  /** Display name shown in the sidebar. e.g. `'Sagittarius A*'`. */
  readonly label: string
  /** Right ascension, sexagesimal `'hh mm ss[.s]'`. e.g. `'17 45 40.04'`. */
  readonly ra: string
  /** Declination, sexagesimal with sign `'±dd mm ss[.s]'`. e.g. `'-29 00 28.1'`. */
  readonly dec: string
  /** Field of view in degrees, must be in `(0, 60]`. e.g. `5.0`. */
  readonly fovDeg: number
  /** Aladin survey id, e.g. `'P/Mellinger/color'`. */
  readonly survey: string
  /** Ship-AI flavor text, ~40-80 words. Plain text, no markup. */
  readonly blurb: string
}
