# Telescope Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `telescope_alignment` EVA minigame end-to-end — a Vue overlay where the player tunes four knobs against a blurred/chromatic/misaligned eyepiece image, locks in at ≥95% quality, and claims the mission reward.

**Architecture:** Thin `TelescopeAlignmentMiniGame` class implements the `OrbitalMiniGame` contract (`presentation: 'overlay'`); all knob state + UI lives in `TelescopeAlignmentCanvas.vue` which the existing `EvaMinigameOverlay.vue` dispatcher branches to. Pure quality math lives in `src/lib/minigame/telescopeAlignment/quality.ts` with Vitest coverage; the canvas reads per-target imagery from `src/data/minigames/telescope-targets.json` keyed by mission id.

**Tech Stack:** Vue 3 SFC, TypeScript (strict, `noUncheckedIndexedAccess`), Tailwind v4 + `@apply`, Vitest, `requestAnimationFrame` loop, CSS filters (`blur`, `drop-shadow`, `mix-blend-mode: screen`).

**Spec:** `docs/superpowers/specs/2026-04-19-telescope-alignment-design.md`
**Prototype reference:** `docs/inspo/TelescopeMinigame.jsx` (React — layout + feel source of truth)
**Substrate prerequisite (already merged):** `docs/superpowers/specs/2026-04-19-eva-minigame-wiring-design.md`

---

## File Map

### Created
- `src/lib/minigame/telescopeAlignment/constants.ts` — tuning knobs (MAX_*, LOCK_THRESHOLD, STEP_*, DRIFT_*, COLOR palette)
- `src/lib/minigame/telescopeAlignment/types.ts` — `KnobState`, `DriftConfig`, `TelescopeTarget` types
- `src/lib/minigame/telescopeAlignment/quality.ts` — pure `computeQuality` + `perKnobQuality` + LED color bucket
- `src/lib/minigame/telescopeAlignment/drift.ts` — pure `computeDrift(time, config)` sine wobble
- `src/lib/minigame/telescopeAlignment/TelescopeAlignmentMiniGame.ts` — `OrbitalMiniGame` bridge class
- `src/lib/minigame/telescopeAlignment/__tests__/quality.spec.ts` — Vitest coverage of quality + LED math
- `src/lib/minigame/telescopeAlignment/__tests__/drift.spec.ts` — Vitest coverage for drift amplitude cap
- `src/lib/minigame/telescopeAlignment/__tests__/TelescopeAlignmentMiniGame.spec.ts` — idempotency of `complete()`
- `src/data/minigames/telescope-targets.json` — six mission-id → image + label + caption entries
- `src/lib/minigame/telescopeAlignment/targets.ts` — typed accessor over the JSON with fallback
- `src/lib/minigame/telescopeAlignment/__tests__/targets.spec.ts` — fallback + lookup tests
- `src/components/TelescopeAlignmentCanvas.vue` — full overlay SFC (knobs, eyepiece, quality bar, lock-in)
- `public/minigames/telescope/*.jpg` — six source images (fetched during Task 8; licenses in `docs/credits.md`)

### Modified
- `src/lib/minigame/orbitalMiniGameFactory.ts` — add `case 'telescope_alignment'`
- `src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts` — cover telescope branch
- `src/components/EvaMinigameOverlay.vue` — add `v-if` branch rendering `TelescopeAlignmentCanvas`
- `docs/credits.md` — append attribution block for the six telescope images

---

## Conventions (read first)

**Code style:** no semicolons, single quotes, 2-space indent, 100-char line width. TypeScript strict + `noUncheckedIndexedAccess`.

**TSDoc:** every exported function, class, interface, type alias, and constant needs a TSDoc block. File-level header pattern:

```ts
/**
 * Brief description.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-19-telescope-alignment-design.md
 */
```

**No magic numbers** — every numeric literal referenced at runtime goes through `constants.ts`.

**Test runner:** Vitest. Run a single file with `bun test:unit src/path/to/file.spec.ts`.

**Before committing every task, run and expect clean:**
```bash
bun run type-check
bun lint
bun test:unit
```
(`bun lint` runs oxlint then ESLint with `--max-warnings 0`. ESLint enforces `jsdoc/require-jsdoc` as an error on `src/**/*.ts` except `__tests__`.)

---

## Task 1: Constants + types module

**Files:**
- Create: `src/lib/minigame/telescopeAlignment/constants.ts`
- Create: `src/lib/minigame/telescopeAlignment/types.ts`

- [ ] **Step 1: Write `constants.ts`**

```ts
/**
 * Tuning constants for the telescope alignment minigame. Every numeric used
 * by the class, the quality math, and the canvas component is declared here
 * — no magic numbers leak to callers.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-19-telescope-alignment-design.md
 */

/** Maximum blur radius in px — clamps `focus` knob range to [0, MAX_FOCUS]. */
export const MAX_FOCUS = 16

/** Maximum chromatic aberration offset in px — clamps `chroma` to [0, MAX_CHROMA]. */
export const MAX_CHROMA = 12

/** Maximum pointing offset in px per axis — `azimuth` and `elevation` live in [-MAX_POINTING, +MAX_POINTING]. */
export const MAX_POINTING = 60

/** Quality threshold at which the lock-in prompt lights up. */
export const LOCK_THRESHOLD = 0.95

/** Coarse adjustment step applied on a plain key press. */
export const STEP_COARSE = 1.0

/** Multiplier applied to STEP_COARSE when Shift is held for fine adjust. */
export const STEP_FINE_MUL = 0.25

/** Coarse step for pointing axes (larger range than focus/chroma). */
export const STEP_POINTING = 2.5

/** Weight applied to focus error in the quality formula. */
export const QUALITY_WEIGHT_FOCUS = 0.3

/** Weight applied to chroma error in the quality formula. */
export const QUALITY_WEIGHT_CHROMA = 0.25

/** Weight applied to pointing error in the quality formula. */
export const QUALITY_WEIGHT_POINTING = 0.45

/** LED turns green when per-knob quality >= this threshold. */
export const LED_GREEN_THRESHOLD = 0.85

/** LED is amber between this threshold and LED_GREEN_THRESHOLD; red below. */
export const LED_AMBER_THRESHOLD = 0.4

/** Maximum drift amplitude as a fraction of a knob's range. Drift alone cannot break LOCK_THRESHOLD. */
export const DRIFT_AMP_PCT = 0.015

/** Lock-in animation duration in ms — knobs animate to zero over this span. */
export const LOCK_ANIMATION_MS = 400

/** Caption fade-in duration in ms after lock-in completes. */
export const CAPTION_FADE_MS = 1200

/** Diameter of the eyepiece clip-path circle in px. */
export const EYEPIECE_DIAMETER_PX = 780

/** Per-axis drift oscillator frequency (Hz) and phase offset. */
export const DRIFT_FOCUS = { freq: 0.73, phase: 0.0, amp: 0.012 } as const

/** Chromatic aberration drift oscillator. */
export const DRIFT_CHROMA = { freq: 1.03, phase: 1.5, amp: DRIFT_AMP_PCT } as const

/** Azimuth drift oscillator. */
export const DRIFT_AZIMUTH = { freq: 0.61, phase: 2.7, amp: DRIFT_AMP_PCT } as const

/** Elevation drift oscillator. */
export const DRIFT_ELEVATION = { freq: 0.82, phase: 4.1, amp: DRIFT_AMP_PCT } as const

/** Shared palette used by the canvas — matches spec §2.4 and prototype inline palette. */
export const COLOR = {
  /** Deep panel background. */
  bg: '#05070c',
  /** Secondary panel fill. */
  panel: '#0a0f1a',
  /** Primary text. */
  text: '#cffafe',
  /** Primary cyan stroke. */
  cyan: '#22d3ee',
  /** Hover/focus cyan stroke. */
  cyanBright: '#7dd3fc',
  /** Dim cyan for inactive chrome. */
  cyanDim: 'rgba(103, 232, 249, 0.5)',
  /** Border rule color. */
  border: 'rgba(34, 211, 238, 0.25)',
  /** Success / locked-in green. */
  green: '#34d399',
  /** Warning amber. */
  amber: '#fbbf24',
  /** Error / high-error red. */
  red: '#f87171',
} as const
```

- [ ] **Step 2: Write `types.ts`**

```ts
/**
 * Shared types for the telescope alignment minigame.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-19-telescope-alignment-design.md
 */

/** Current values of all four alignment knobs in their native units (px). */
export interface KnobState {
  /** Focus knob value in [0, MAX_FOCUS]. Raw blur radius. */
  focus: number
  /** Chromatic aberration knob value in [0, MAX_CHROMA]. Channel split in px. */
  chroma: number
  /** Azimuth (horizontal) pointing offset in [-MAX_POINTING, +MAX_POINTING]. */
  azimuth: number
  /** Elevation (vertical) pointing offset in [-MAX_POINTING, +MAX_POINTING]. */
  elevation: number
}

/** Parameters of one axis's ambient drift sinusoid. */
export interface DriftConfig {
  /** Oscillator frequency in Hz. */
  freq: number
  /** Phase offset in radians so each axis wobbles independently. */
  phase: number
  /** Amplitude as a fraction of the knob's range. */
  amp: number
}

/** Static info about a telescope target shown in the eyepiece. */
export interface TelescopeTarget {
  /** Public image filename under `/minigames/telescope/`. */
  image: string
  /** Large label shown above the eyepiece — e.g. `JWST L2 — DEEP FIELD`. */
  label: string
  /** Flavor caption faded in after lock-in. */
  caption: string
}

/** LED color bucket assigned to a per-knob quality band. */
export type LedColor = 'red' | 'amber' | 'green'
```

- [ ] **Step 3: Type-check + lint**

```bash
bun run type-check && bun lint
```
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/minigame/telescopeAlignment/constants.ts src/lib/minigame/telescopeAlignment/types.ts
git commit -m "feat(telescope): constants and types for alignment minigame"
```

---

## Task 2: Quality math (pure + tested)

**Files:**
- Create: `src/lib/minigame/telescopeAlignment/quality.ts`
- Create: `src/lib/minigame/telescopeAlignment/__tests__/quality.spec.ts`

- [ ] **Step 1: Write the failing tests first**

`src/lib/minigame/telescopeAlignment/__tests__/quality.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  computeQuality,
  perKnobQuality,
  ledColor,
} from '../quality'
import {
  MAX_FOCUS,
  MAX_CHROMA,
  MAX_POINTING,
  QUALITY_WEIGHT_FOCUS,
  QUALITY_WEIGHT_CHROMA,
  QUALITY_WEIGHT_POINTING,
  LED_AMBER_THRESHOLD,
  LED_GREEN_THRESHOLD,
} from '../constants'

describe('computeQuality', () => {
  it('returns 1 when all knobs are zero', () => {
    expect(computeQuality({ focus: 0, chroma: 0, azimuth: 0, elevation: 0 })).toBeCloseTo(1, 6)
  })

  it('returns 1 - weight when only focus is maxed', () => {
    const q = computeQuality({ focus: MAX_FOCUS, chroma: 0, azimuth: 0, elevation: 0 })
    expect(q).toBeCloseTo(1 - QUALITY_WEIGHT_FOCUS, 6)
  })

  it('returns 1 - weight when only chroma is maxed', () => {
    const q = computeQuality({ focus: 0, chroma: MAX_CHROMA, azimuth: 0, elevation: 0 })
    expect(q).toBeCloseTo(1 - QUALITY_WEIGHT_CHROMA, 6)
  })

  it('returns 1 - weight when both pointing axes are maxed (vector length == sqrt(2))', () => {
    const q = computeQuality({
      focus: 0,
      chroma: 0,
      azimuth: MAX_POINTING,
      elevation: MAX_POINTING,
    })
    expect(q).toBeCloseTo(1 - QUALITY_WEIGHT_POINTING, 6)
  })

  it('treats negative and positive knob values identically (abs)', () => {
    const pos = computeQuality({ focus: 4, chroma: 3, azimuth: 15, elevation: -22 })
    const neg = computeQuality({ focus: 4, chroma: 3, azimuth: -15, elevation: 22 })
    expect(pos).toBeCloseTo(neg, 6)
  })

  it('clamps to [0, 1]', () => {
    const q = computeQuality({
      focus: MAX_FOCUS * 10,
      chroma: MAX_CHROMA * 10,
      azimuth: MAX_POINTING * 10,
      elevation: MAX_POINTING * 10,
    })
    expect(q).toBeGreaterThanOrEqual(0)
    expect(q).toBeLessThanOrEqual(1)
  })
})

describe('perKnobQuality', () => {
  it('returns 1 at value 0', () => {
    expect(perKnobQuality(0, MAX_FOCUS)).toBe(1)
  })

  it('returns 0 at value max', () => {
    expect(perKnobQuality(MAX_FOCUS, MAX_FOCUS)).toBe(0)
  })

  it('is symmetric around zero', () => {
    expect(perKnobQuality(-10, MAX_POINTING)).toBeCloseTo(
      perKnobQuality(10, MAX_POINTING),
      6,
    )
  })

  it('returns 1 for zero-range inputs (no division by zero)', () => {
    expect(perKnobQuality(0, 0)).toBe(1)
  })
})

describe('ledColor', () => {
  it('returns red below the amber threshold', () => {
    expect(ledColor(LED_AMBER_THRESHOLD - 0.001)).toBe('red')
    expect(ledColor(0)).toBe('red')
  })

  it('returns amber in [amber, green) band', () => {
    expect(ledColor(LED_AMBER_THRESHOLD)).toBe('amber')
    expect(ledColor(LED_GREEN_THRESHOLD - 0.001)).toBe('amber')
  })

  it('returns green at or above the green threshold', () => {
    expect(ledColor(LED_GREEN_THRESHOLD)).toBe('green')
    expect(ledColor(1)).toBe('green')
  })
})
```

- [ ] **Step 2: Run tests — they should fail because `quality.ts` doesn't exist**

```bash
bun test:unit src/lib/minigame/telescopeAlignment/__tests__/quality.spec.ts
```
Expected: FAIL — "Cannot find module '../quality'".

- [ ] **Step 3: Implement `quality.ts`**

```ts
/**
 * Pure quality math for telescope alignment — no DOM, no RAF, no state.
 * Safe to call from both the class and the canvas component. Unit tested in
 * `__tests__/quality.spec.ts`.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-19-telescope-alignment-design.md
 */
import {
  MAX_FOCUS,
  MAX_CHROMA,
  MAX_POINTING,
  QUALITY_WEIGHT_FOCUS,
  QUALITY_WEIGHT_CHROMA,
  QUALITY_WEIGHT_POINTING,
  LED_AMBER_THRESHOLD,
  LED_GREEN_THRESHOLD,
} from './constants'
import type { KnobState, LedColor } from './types'

/**
 * Compute overall alignment quality in [0, 1] from the four knob values.
 * Pointing error is weighted highest because visual misalignment dominates
 * the player's read of "off".
 *
 * @param knobs - Current knob state.
 * @returns Weighted quality where 1 means perfectly aligned.
 */
export function computeQuality(knobs: KnobState): number {
  const focusErr = Math.abs(knobs.focus) / MAX_FOCUS
  const chromaErr = Math.abs(knobs.chroma) / MAX_CHROMA
  const axNorm = Math.abs(knobs.azimuth) / MAX_POINTING
  const ayNorm = Math.abs(knobs.elevation) / MAX_POINTING
  const pointingErr = Math.sqrt(axNorm * axNorm + ayNorm * ayNorm) / Math.SQRT2
  const weighted =
    QUALITY_WEIGHT_FOCUS * focusErr +
    QUALITY_WEIGHT_CHROMA * chromaErr +
    QUALITY_WEIGHT_POINTING * pointingErr
  return clamp01(1 - weighted)
}

/**
 * Compute the per-knob quality used for LED + mini-bar.
 *
 * @param value - Raw knob value (may be negative for pointing axes).
 * @param max - Maximum absolute value the knob reaches.
 * @returns Quality in [0, 1]; 1 when centered, 0 at max deflection.
 */
export function perKnobQuality(value: number, max: number): number {
  if (max <= 0) return 1
  return clamp01(1 - Math.abs(value) / max)
}

/**
 * Map a per-knob quality band to its LED color bucket.
 *
 * @param quality - Per-knob quality in [0, 1].
 * @returns The LED color bucket.
 */
export function ledColor(quality: number): LedColor {
  if (quality >= LED_GREEN_THRESHOLD) return 'green'
  if (quality >= LED_AMBER_THRESHOLD) return 'amber'
  return 'red'
}

/**
 * Clamp a value to the [0, 1] range.
 *
 * @param v - Input value.
 * @returns Clamped value.
 */
function clamp01(v: number): number {
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}
```

- [ ] **Step 4: Run tests — they should pass**

```bash
bun test:unit src/lib/minigame/telescopeAlignment/__tests__/quality.spec.ts
```
Expected: PASS, 10+ tests green.

- [ ] **Step 5: Type-check + full lint**

```bash
bun run type-check && bun lint
```
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/minigame/telescopeAlignment/quality.ts src/lib/minigame/telescopeAlignment/__tests__/quality.spec.ts
git commit -m "feat(telescope): pure quality + LED math with tests"
```

---

## Task 3: Drift math (pure + tested)

**Files:**
- Create: `src/lib/minigame/telescopeAlignment/drift.ts`
- Create: `src/lib/minigame/telescopeAlignment/__tests__/drift.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { computeDrift } from '../drift'
import {
  MAX_FOCUS,
  MAX_POINTING,
  DRIFT_FOCUS,
  DRIFT_AZIMUTH,
  DRIFT_AMP_PCT,
} from '../constants'

describe('computeDrift', () => {
  it('returns zero drift at t=0 when phase aligns with sin(0)=0 for focus', () => {
    expect(computeDrift(0, DRIFT_FOCUS, MAX_FOCUS)).toBeCloseTo(0, 6)
  })

  it('never exceeds amp * range over 10 simulated seconds', () => {
    let maxSeen = 0
    for (let t = 0; t < 10; t += 0.016) {
      const d = Math.abs(computeDrift(t, DRIFT_AZIMUTH, MAX_POINTING))
      if (d > maxSeen) maxSeen = d
    }
    expect(maxSeen).toBeLessThanOrEqual(DRIFT_AMP_PCT * MAX_POINTING + 1e-9)
  })

  it('varies with time', () => {
    const a = computeDrift(0.25, DRIFT_AZIMUTH, MAX_POINTING)
    const b = computeDrift(0.75, DRIFT_AZIMUTH, MAX_POINTING)
    expect(a).not.toBe(b)
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
bun test:unit src/lib/minigame/telescopeAlignment/__tests__/drift.spec.ts
```
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `drift.ts`**

```ts
/**
 * Ambient drift for telescope alignment knobs. Each axis wobbles at its own
 * frequency so the player sees a constant gentle drift — defensible as the
 * "telescope is never perfectly still" flavor. Amplitude is bounded so drift
 * alone cannot push quality above LOCK_THRESHOLD from a losing state.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-19-telescope-alignment-design.md
 */
import type { DriftConfig } from './types'

/**
 * Compute the drift offset for one axis at a given time.
 *
 * @param time - Elapsed seconds since the overlay opened.
 * @param config - Drift oscillator parameters.
 * @param range - The knob's maximum value (used to scale amp to native units).
 * @returns Drift offset in the same units as the knob.
 */
export function computeDrift(time: number, config: DriftConfig, range: number): number {
  return Math.sin(time * config.freq + config.phase) * range * config.amp
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
bun test:unit src/lib/minigame/telescopeAlignment/__tests__/drift.spec.ts
```
Expected: PASS.

- [ ] **Step 5: Type-check + lint**

```bash
bun run type-check && bun lint
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/minigame/telescopeAlignment/drift.ts src/lib/minigame/telescopeAlignment/__tests__/drift.spec.ts
git commit -m "feat(telescope): ambient drift oscillator with amplitude test"
```

---

## Task 4: `TelescopeAlignmentMiniGame` class

**Files:**
- Create: `src/lib/minigame/telescopeAlignment/TelescopeAlignmentMiniGame.ts`
- Create: `src/lib/minigame/telescopeAlignment/__tests__/TelescopeAlignmentMiniGame.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, vi } from 'vitest'
import { TelescopeAlignmentMiniGame } from '../TelescopeAlignmentMiniGame'

describe('TelescopeAlignmentMiniGame', () => {
  it('starts in active status with three steps, second step active', () => {
    const g = new TelescopeAlignmentMiniGame('earth_l2_observatory_phasing')
    expect(g.status).toBe('active')
    expect(g.steps).toHaveLength(3)
    expect(g.steps[0]?.complete).toBe(true)
    expect(g.steps[1]?.active).toBe(true)
    expect(g.steps[2]?.active).toBe(false)
  })

  it('advertises overlay presentation', () => {
    const g = new TelescopeAlignmentMiniGame('m1')
    expect(g.presentation).toBe('overlay')
  })

  it('reports progress based on reported quality (0..100)', () => {
    const g = new TelescopeAlignmentMiniGame('m1')
    g.reportQuality(0.5)
    expect(g.progressCurrent).toBe(50)
    expect(g.progressTotal).toBe(100)
  })

  it('complete() transitions to completed and fires onComplete exactly once', () => {
    const g = new TelescopeAlignmentMiniGame('m1')
    const spy = vi.fn()
    g.onComplete = spy
    g.complete()
    g.complete()
    expect(g.status).toBe('completed')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('m1')
  })

  it('complete() marks the active step done and fires onStepChange', () => {
    const g = new TelescopeAlignmentMiniGame('m1')
    const stepSpy = vi.fn()
    g.onStepChange = stepSpy
    g.complete()
    expect(g.steps[1]?.complete).toBe(true)
    expect(g.steps[2]?.complete).toBe(true)
    expect(stepSpy).toHaveBeenCalledTimes(1)
  })

  it('tick is a no-op and does not change status', () => {
    const g = new TelescopeAlignmentMiniGame('m1')
    g.tick(0.016, {
      shipPosition: { x: 0, y: 0, z: 0 },
      orbitState: 'orbiting',
      orbitedPlanetId: 'earth',
      distanceToPlanet: 100,
    })
    expect(g.status).toBe('active')
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
bun test:unit src/lib/minigame/telescopeAlignment/__tests__/TelescopeAlignmentMiniGame.spec.ts
```
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the class**

```ts
/**
 * Telescope alignment minigame — Vue-overlay-presented. This class is the
 * `OrbitalMiniGame` contract bridge; all knob state, RAF loop, and rendering
 * live in `TelescopeAlignmentCanvas.vue`. The canvas reports current quality
 * via `reportQuality` so HUD code can read `progressCurrent` without
 * reaching into the component.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-19-telescope-alignment-design.md
 */
import type {
  OrbitalMiniGame,
  OrbitalMiniGameContext,
  OrbitalMiniGameEvents,
  OrbitalMiniGameStatus,
  OrbitalMiniGameStep,
} from '../OrbitalMiniGame'

/**
 * Telescope alignment minigame. See file header for architecture notes.
 *
 * @author guinetik
 * @date 2026-04-20
 */
export class TelescopeAlignmentMiniGame implements OrbitalMiniGame, OrbitalMiniGameEvents {
  /** The shuttle mission id this minigame tracks. */
  readonly missionId: string

  /** Telescope renders inside a Vue overlay. */
  readonly presentation = 'overlay' as const

  private _status: OrbitalMiniGameStatus = 'active'
  private readonly _steps: OrbitalMiniGameStep[] = [
    { label: 'Approach Optical Bay', complete: true, active: false },
    { label: 'Calibrate Optics', complete: false, active: true },
    { label: 'Lock In Target', complete: false, active: false },
  ]
  private _quality = 0

  /** Minigame completed — fires with mission id. Set by host. */
  onComplete: ((missionId: string) => void) | null = null
  /** Steps changed — fires with updated steps for reactivity. Set by host. */
  onStepChange: ((steps: readonly OrbitalMiniGameStep[]) => void) | null = null

  /**
   * Create a new telescope alignment minigame.
   *
   * @param missionId - shuttle mission id
   */
  constructor(missionId: string) {
    this.missionId = missionId
  }

  /** Current minigame status. */
  get status(): OrbitalMiniGameStatus {
    return this._status
  }

  /** Ordered steps for the tracker HUD. */
  get steps(): readonly OrbitalMiniGameStep[] {
    return this._steps
  }

  /** Progress numerator — latest quality rounded to an integer percent. */
  get progressCurrent(): number {
    return Math.round(this._quality * 100)
  }

  /** Progress denominator — always 100 (percent scale). */
  get progressTotal(): number {
    return 100
  }

  /**
   * Per-frame update. No-op — the canvas drives all state via `reportQuality`.
   *
   * @param _dt - Delta time (unused).
   * @param _ctx - Map scene context (unused).
   */
  tick(_dt: number, _ctx: OrbitalMiniGameContext): void {
    // No-op — canvas-driven.
  }

  /**
   * Called by the canvas each tick with the current quality so the HUD tracker
   * can display progress without reaching into component state.
   *
   * @param quality - Current quality in [0, 1].
   */
  reportQuality(quality: number): void {
    if (this._status !== 'active') return
    this._quality = quality
  }

  /**
   * Finalize the minigame. Idempotent — subsequent calls are ignored.
   */
  complete(): void {
    if (this._status !== 'active') return
    const calibrate = this._steps[1]
    const lockIn = this._steps[2]
    if (calibrate) {
      calibrate.complete = true
      calibrate.active = false
    }
    if (lockIn) {
      lockIn.complete = true
      lockIn.active = false
    }
    this._status = 'completed'
    this.onStepChange?.(this._steps)
    this.onComplete?.(this.missionId)
  }

  /** Clean up resources — no-op. */
  dispose(): void {
    // No resources held; canvas manages its own RAF + listener teardown.
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
bun test:unit src/lib/minigame/telescopeAlignment/__tests__/TelescopeAlignmentMiniGame.spec.ts
```
Expected: PASS.

- [ ] **Step 5: Type-check + lint**

```bash
bun run type-check && bun lint
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/minigame/telescopeAlignment/TelescopeAlignmentMiniGame.ts src/lib/minigame/telescopeAlignment/__tests__/TelescopeAlignmentMiniGame.spec.ts
git commit -m "feat(telescope): OrbitalMiniGame bridge class"
```

---

## Task 5: Targets JSON + typed accessor

**Files:**
- Create: `src/data/minigames/telescope-targets.json`
- Create: `src/lib/minigame/telescopeAlignment/targets.ts`
- Create: `src/lib/minigame/telescopeAlignment/__tests__/targets.spec.ts`

- [ ] **Step 1: Write the JSON (real data; placeholder images are filled in by Task 8)**

`src/data/minigames/telescope-targets.json`:

```json
{
  "mercury_corona_monitor": {
    "image": "sol_corona.jpg",
    "label": "SOL \u2014 CORONAL LIMB",
    "caption": "prominence arc, ~400,000 km \u00b7 SDO/AIA 304 \u00b7 0341 UTC"
  },
  "earth_l2_observatory_phasing": {
    "image": "deep_field.jpg",
    "label": "JWST L2 \u2014 DEEP FIELD",
    "caption": "NIRCam \u00b7 5.6 \u03bcm composite \u00b7 F444W / F356W / F200W"
  },
  "mars_phobos_astrometry": {
    "image": "m13_cluster.jpg",
    "label": "HST \u2014 M13 GLOBULAR",
    "caption": "ACS/WFC \u00b7 330,000 stars \u00b7 25,000 ly"
  },
  "jupiter_europa_plume_spectro": {
    "image": "europa_plume.jpg",
    "label": "EUROPA \u2014 PLUME EMISSION",
    "caption": "Hubble STIS \u00b7 H\u2082O vapor \u00b7 south polar region"
  },
  "saturn_enceladus_plume_spectro": {
    "image": "enceladus_plume.jpg",
    "label": "ENCELADUS \u2014 CRYO PLUME",
    "caption": "Cassini ISS \u00b7 back-lit, south pole"
  },
  "neptune_triton_exoplanet_watch": {
    "image": "exoplanet_field.jpg",
    "label": "TRITON \u2014 TRANSIT FIELD",
    "caption": "HAT-P-7 analog \u00b7 TESS cadence \u00b7 2 min"
  }
}
```

- [ ] **Step 2: Write failing tests**

`src/lib/minigame/telescopeAlignment/__tests__/targets.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getTelescopeTarget, FALLBACK_TARGET } from '../targets'

describe('getTelescopeTarget', () => {
  it('returns the registered target for a known mission id', () => {
    const t = getTelescopeTarget('earth_l2_observatory_phasing')
    expect(t.image).toBe('deep_field.jpg')
    expect(t.label).toContain('JWST')
    expect(t.caption.length).toBeGreaterThan(0)
  })

  it('returns the fallback target for unknown mission ids', () => {
    const t = getTelescopeTarget('not_a_real_mission')
    expect(t).toBe(FALLBACK_TARGET)
  })

  it('fallback target points at the deep-field image', () => {
    expect(FALLBACK_TARGET.image).toBe('deep_field.jpg')
  })
})
```

- [ ] **Step 3: Run — expect fail**

```bash
bun test:unit src/lib/minigame/telescopeAlignment/__tests__/targets.spec.ts
```
Expected: FAIL — module missing.

- [ ] **Step 4: Implement the accessor with `satisfies` for compile-time validation**

`src/lib/minigame/telescopeAlignment/targets.ts`:

```ts
/**
 * Typed accessor over `telescope-targets.json`. Keyed by EVA mission id. Use
 * `satisfies` so missing or malformed fields fail compile, and hand callers
 * a readonly view. Unknown ids fall back to a neutral deep-field entry so
 * the overlay is always renderable.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-19-telescope-alignment-design.md
 */
import rawTargets from '@/data/minigames/telescope-targets.json'
import type { TelescopeTarget } from './types'

/** Fallback target used for unregistered mission ids (e.g. legacy earth spec alias). */
export const FALLBACK_TARGET: TelescopeTarget = {
  image: 'deep_field.jpg',
  label: 'DEEP FIELD — ARCHIVAL',
  caption: 'archival composite · no target metadata available',
}

const TARGETS: Record<string, TelescopeTarget> = rawTargets satisfies Record<
  string,
  TelescopeTarget
>

/**
 * Look up the telescope target for a given EVA mission id.
 *
 * @param missionId - EVA mission id (matches keys in the JSON).
 * @returns Registered target, or {@link FALLBACK_TARGET} when unknown.
 */
export function getTelescopeTarget(missionId: string): TelescopeTarget {
  return TARGETS[missionId] ?? FALLBACK_TARGET
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
bun test:unit src/lib/minigame/telescopeAlignment/__tests__/targets.spec.ts
```
Expected: PASS.

- [ ] **Step 6: Type-check + lint**

```bash
bun run type-check && bun lint
```
Expected: clean. If the `.json` import is flagged, confirm `resolveJsonModule` is already enabled project-wide (it is — other data JSONs load the same way).

- [ ] **Step 7: Commit**

```bash
git add src/data/minigames/telescope-targets.json src/lib/minigame/telescopeAlignment/targets.ts src/lib/minigame/telescopeAlignment/__tests__/targets.spec.ts
git commit -m "feat(telescope): target JSON + typed accessor with fallback"
```

---

## Task 6: Register in factory + overlay dispatcher

**Files:**
- Modify: `src/lib/minigame/orbitalMiniGameFactory.ts`
- Modify: `src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts`
- Modify: `src/components/EvaMinigameOverlay.vue`

- [ ] **Step 1: Extend the factory test first**

Open `src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts` and add:

```ts
import { TelescopeAlignmentMiniGame } from '../telescopeAlignment/TelescopeAlignmentMiniGame'

// inside the existing describe block:
it('creates a TelescopeAlignmentMiniGame for telescope_alignment', () => {
  const g = createOrbitalMiniGame('earth_l2_observatory_phasing', 'telescope_alignment', 0)
  expect(g).toBeInstanceOf(TelescopeAlignmentMiniGame)
  expect(g.presentation).toBe('overlay')
})
```

(If the existing test file doesn't already import `createOrbitalMiniGame` and describe-block it, follow the pattern in the existing tests — don't restructure.)

- [ ] **Step 2: Run — expect fail**

```bash
bun test:unit src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts
```
Expected: FAIL — factory returns `DefaultOrbitalMiniGame`.

- [ ] **Step 3: Add the case to the factory**

Edit `src/lib/minigame/orbitalMiniGameFactory.ts`:

```ts
// new import, alphabetized-ish with the other minigame imports:
import { TelescopeAlignmentMiniGame } from './telescopeAlignment/TelescopeAlignmentMiniGame'

// inside the switch, above the default:
    case 'telescope_alignment':
      return new TelescopeAlignmentMiniGame(missionId)
```

- [ ] **Step 4: Run tests — expect pass**

```bash
bun test:unit src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts
```
Expected: PASS.

- [ ] **Step 5: Wire the overlay branch with a placeholder canvas**

Create a minimal placeholder `src/components/TelescopeAlignmentCanvas.vue` so the dispatch works end-to-end before Task 7 builds out the UI:

```vue
<!--
  TelescopeAlignmentCanvas.vue

  Placeholder dispatch target for `telescope_alignment`. Full UI lands in
  subsequent tasks — for now this renders a card with a completion button
  so the EVA reward loop is exercised.

  @author guinetik
  @date 2026-04-20
  @spec docs/superpowers/specs/2026-04-19-telescope-alignment-design.md
-->
<script setup lang="ts">
import type { ActiveVisitRelayMission } from '@/lib/missions/types'
import type { TelescopeAlignmentMiniGame } from '@/lib/minigame/telescopeAlignment/TelescopeAlignmentMiniGame'

const props = defineProps<{
  /** The EVA mission opening this overlay. */
  mission: ActiveVisitRelayMission
  /** Active telescope minigame instance. */
  minigame: TelescopeAlignmentMiniGame
}>()

const emit = defineEmits<{
  /** User completed the minigame. */
  complete: []
  /** User dismissed the overlay. */
  close: []
}>()

/** Temporary complete handler — replaced by lock-in in Task 11. */
function handleComplete(): void {
  props.minigame.complete()
  emit('complete')
}
</script>

<template>
  <div class="telescope-placeholder">
    <h2>{{ mission.template.name }}</h2>
    <p>Telescope alignment minigame — WIP placeholder.</p>
    <div class="telescope-placeholder__actions">
      <button type="button" @click="handleComplete">Complete (WIP)</button>
      <button type="button" @click="emit('close')">Close</button>
    </div>
  </div>
</template>

<style scoped>
.telescope-placeholder {
  @apply absolute inset-0 grid place-items-center bg-slate-950/90 text-cyan-100 font-mono;
}
.telescope-placeholder__actions {
  @apply mt-4 flex gap-3;
}
.telescope-placeholder button {
  @apply px-4 py-2 border border-cyan-400/40 rounded text-cyan-100 hover:bg-cyan-400/10;
}
</style>
```

- [ ] **Step 6: Branch the dispatcher**

Edit `src/components/EvaMinigameOverlay.vue`:

1. Add imports inside `<script setup lang="ts">`:

```ts
import { computed } from 'vue'
import TelescopeAlignmentCanvas from '@/components/TelescopeAlignmentCanvas.vue'
import { TelescopeAlignmentMiniGame } from '@/lib/minigame/telescopeAlignment/TelescopeAlignmentMiniGame'
```

2. Add a typed type guard:

```ts
/** Narrow the generic minigame to a telescope instance for the canvas prop. */
const telescopeMinigame = computed(() =>
  props.minigame instanceof TelescopeAlignmentMiniGame ? props.minigame : null,
)
```

3. Add the branch before the existing `<div class="mission-minigame-card">` default card:

```vue
<TelescopeAlignmentCanvas
  v-if="telescopeMinigame"
  :mission="mission"
  :minigame="telescopeMinigame"
  @complete="emit('complete')"
  @close="emit('close')"
/>
<div v-else class="mission-minigame-card">
  <!-- existing card markup unchanged -->
</div>
```

Preserve the existing card body exactly as-is; only add the new `v-if` branch + `v-else` wrapper.

- [ ] **Step 7: Full checks**

```bash
bun run type-check && bun lint && bun test:unit
```
Expected: all green.

- [ ] **Step 8: Manual sanity check**

Run `bun dev`, start a telescope EVA (`earth_l2_observatory_phasing` via `/map`), reach the POI terminal, confirm the placeholder card shows + "Complete (WIP)" pays reward + closes overlay + EVA resumes.

- [ ] **Step 9: Commit**

```bash
git add src/lib/minigame/orbitalMiniGameFactory.ts src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts src/components/TelescopeAlignmentCanvas.vue src/components/EvaMinigameOverlay.vue
git commit -m "feat(telescope): factory case + overlay dispatch with placeholder canvas"
```

---

## Task 7: Static overlay layout (no interactivity)

**Files:**
- Modify: `src/components/TelescopeAlignmentCanvas.vue`

Replace the placeholder with the full structural layout. No knob state, no RAF, no image filters — just frame + static knob SVGs + static quality bar at 0%. Pixel layout matches `docs/inspo/TelescopeMinigame.jsx` within ±10 px.

- [ ] **Step 1: Rewrite the SFC shell**

```vue
<!--
  TelescopeAlignmentCanvas.vue

  Overlay canvas for the telescope alignment minigame. Structured as a fixed
  full-viewport panel with: status bar, eyepiece (blurred / chromatic /
  offset image), four knob slots, 2D pointing indicator, signal-quality bar,
  controls hint row. Interactivity lands in Task 8; image rendering in
  Task 9; drift + lock-in in Task 10.

  @author guinetik
  @date 2026-04-20
  @spec docs/superpowers/specs/2026-04-19-telescope-alignment-design.md
-->
<script setup lang="ts">
import type { ActiveVisitRelayMission } from '@/lib/missions/types'
import type { TelescopeAlignmentMiniGame } from '@/lib/minigame/telescopeAlignment/TelescopeAlignmentMiniGame'
import { getTelescopeTarget } from '@/lib/minigame/telescopeAlignment/targets'

const props = defineProps<{
  /** The EVA mission opening this overlay. */
  mission: ActiveVisitRelayMission
  /** Active telescope minigame instance. */
  minigame: TelescopeAlignmentMiniGame
}>()

const emit = defineEmits<{
  /** User completed the minigame. */
  complete: []
  /** User dismissed the overlay. */
  close: []
}>()

const target = getTelescopeTarget(props.mission.template.id)

/** Placeholder handler until lock-in ships in Task 10. */
function handleTempComplete(): void {
  props.minigame.complete()
  emit('complete')
}
</script>

<template>
  <div class="telescope-overlay">
    <div class="telescope-status">
      <span class="telescope-status__location">{{ target.label }}</span>
      <span class="telescope-status__mission">{{ mission.template.name }}</span>
      <span class="telescope-status__state">CALIBRATING</span>
    </div>

    <div class="telescope-body">
      <div class="telescope-eyepiece" aria-label="Telescope eyepiece">
        <div class="telescope-eyepiece__placeholder" />
      </div>

      <div class="telescope-knobs">
        <div class="telescope-knob">
          <div class="telescope-knob__dial" data-axis="focus" />
          <div class="telescope-knob__label">FOCUS · Q/W</div>
          <div class="telescope-knob__bar"><span style="width: 0%;" /></div>
        </div>
        <div class="telescope-knob">
          <div class="telescope-knob__dial" data-axis="chroma" />
          <div class="telescope-knob__label">CHROMA · A/S</div>
          <div class="telescope-knob__bar"><span style="width: 0%;" /></div>
        </div>
        <div class="telescope-pointing">
          <div class="telescope-pointing__crosshair" />
          <div class="telescope-pointing__caption">OFF</div>
        </div>
        <div class="telescope-knob">
          <div class="telescope-knob__dial" data-axis="azimuth" />
          <div class="telescope-knob__label">AZIMUTH · Z/X</div>
          <div class="telescope-knob__bar"><span style="width: 0%;" /></div>
        </div>
        <div class="telescope-knob">
          <div class="telescope-knob__dial" data-axis="elevation" />
          <div class="telescope-knob__label">ELEVATION · C/V</div>
          <div class="telescope-knob__bar"><span style="width: 0%;" /></div>
        </div>
      </div>
    </div>

    <div class="telescope-quality">
      <div class="telescope-quality__label">SIGNAL QUALITY</div>
      <div class="telescope-quality__bar"><span style="width: 0%;" /></div>
      <div class="telescope-quality__pct">0%</div>
    </div>

    <div class="telescope-hints">
      <span>Q/W FOCUS</span>
      <span>A/S CHROMA</span>
      <span>Z/X AZ</span>
      <span>C/V EL</span>
      <span>SHIFT · FINE</span>
      <span>E · LOCK IN (≥95%)</span>
      <span>ESC · ABORT</span>
    </div>

    <button type="button" class="telescope-temp-complete" @click="handleTempComplete">
      (WIP) Complete
    </button>
    <button type="button" class="telescope-close" @click="emit('close')">Close</button>
  </div>
</template>

<style scoped>
.telescope-overlay {
  @apply fixed inset-0 z-50 flex flex-col gap-4 p-6 font-mono text-cyan-100;
  background-color: #05070c;
}
.telescope-status {
  @apply flex justify-between items-center border border-cyan-400/25 px-4 py-2 text-sm tracking-widest;
}
.telescope-body {
  @apply flex-1 grid gap-4;
  grid-template-columns: 1fr 360px;
}
.telescope-eyepiece {
  @apply relative rounded-full overflow-hidden border border-cyan-400/25 self-center justify-self-center;
  width: 780px;
  height: 780px;
  max-width: 80vmin;
  max-height: 80vmin;
  aspect-ratio: 1 / 1;
}
.telescope-eyepiece__placeholder {
  @apply absolute inset-0;
  background: radial-gradient(circle at 50% 50%, #1e293b 0%, #05070c 80%);
}
.telescope-knobs {
  @apply flex flex-col gap-3;
}
.telescope-knob {
  @apply flex flex-col gap-1 border border-cyan-400/25 p-2 rounded-sm;
}
.telescope-knob__dial {
  @apply w-18 h-18 border border-cyan-400/40 rounded-full self-center;
}
.telescope-knob__label {
  @apply text-xs tracking-widest text-center;
}
.telescope-knob__bar {
  @apply h-1 bg-cyan-400/10;
}
.telescope-knob__bar span {
  @apply block h-full bg-cyan-400;
}
.telescope-pointing {
  @apply flex flex-col items-center gap-1 border border-cyan-400/25 p-2 rounded-sm;
}
.telescope-pointing__crosshair {
  @apply w-18 h-18 border border-cyan-400/40;
}
.telescope-pointing__caption {
  @apply text-xs tracking-widest;
}
.telescope-quality {
  @apply flex items-center gap-3 border border-cyan-400/25 px-4 py-2 text-sm;
}
.telescope-quality__bar {
  @apply flex-1 h-2 bg-cyan-400/10;
}
.telescope-quality__bar span {
  @apply block h-full bg-cyan-400;
}
.telescope-hints {
  @apply flex flex-wrap gap-4 text-xs tracking-widest text-cyan-200/70;
}
.telescope-temp-complete,
.telescope-close {
  @apply absolute top-4 right-4 px-3 py-1 border border-cyan-400/40 rounded text-cyan-100;
}
.telescope-close {
  right: 140px;
}
</style>
```

- [ ] **Step 2: Visual QA**

Run `bun dev`, open the telescope overlay, confirm status bar, eyepiece circle, five knob slots (with pointing box center-slot), quality bar, and hint row all render without overflow at 1920×1080 and 1440×900.

- [ ] **Step 3: Full checks**

```bash
bun run type-check && bun lint && bun test:unit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/TelescopeAlignmentCanvas.vue
git commit -m "feat(telescope): static overlay layout"
```

---

## Task 8: Knob interactivity + quality wiring

**Files:**
- Modify: `src/components/TelescopeAlignmentCanvas.vue`

Make the overlay live: knob state, keyboard input, quality bar updates, per-knob LED + mini-bar updates, 2D pointing indicator. No drift yet; no image filters yet. Each keypress adjusts the relevant knob and re-evaluates quality.

- [ ] **Step 1: Extend the `<script setup>` with reactive state**

Below the existing imports, add:

```ts
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import {
  MAX_FOCUS,
  MAX_CHROMA,
  MAX_POINTING,
  LOCK_THRESHOLD,
  STEP_COARSE,
  STEP_POINTING,
  STEP_FINE_MUL,
} from '@/lib/minigame/telescopeAlignment/constants'
import { computeQuality, perKnobQuality, ledColor } from '@/lib/minigame/telescopeAlignment/quality'
import type { KnobState } from '@/lib/minigame/telescopeAlignment/types'

/** Randomize an initial unsigned knob value in [0.4, 1.0] of its range. */
function rollUnsigned(range: number): number {
  return range * (0.4 + Math.random() * 0.6)
}
/** Randomize an initial signed knob value in +/-[0.4, 1.0] of its range. */
function rollSigned(range: number): number {
  return (Math.random() < 0.5 ? -1 : 1) * rollUnsigned(range)
}

const knobs = reactive<KnobState>({
  focus: rollUnsigned(MAX_FOCUS),
  chroma: rollUnsigned(MAX_CHROMA),
  azimuth: rollSigned(MAX_POINTING),
  elevation: rollSigned(MAX_POINTING),
})

const quality = computed(() => computeQuality(knobs))
const qualityPct = computed(() => Math.round(quality.value * 100))
const canLock = computed(() => quality.value >= LOCK_THRESHOLD)

const focusQ = computed(() => perKnobQuality(knobs.focus, MAX_FOCUS))
const chromaQ = computed(() => perKnobQuality(knobs.chroma, MAX_CHROMA))
const azQ = computed(() => perKnobQuality(knobs.azimuth, MAX_POINTING))
const elQ = computed(() => perKnobQuality(knobs.elevation, MAX_POINTING))

const focusLed = computed(() => ledColor(focusQ.value))
const chromaLed = computed(() => ledColor(chromaQ.value))
const azLed = computed(() => ledColor(azQ.value))
const elLed = computed(() => ledColor(elQ.value))

const pointingDistNorm = computed(() => {
  const ax = knobs.azimuth / MAX_POINTING
  const ay = knobs.elevation / MAX_POINTING
  return Math.min(1, Math.sqrt(ax * ax + ay * ay) / Math.SQRT2)
})
const pointingCentered = computed(() => pointingDistNorm.value < 0.05)
const pointingDotX = computed(() => 50 + (knobs.azimuth / MAX_POINTING) * 45)
const pointingDotY = computed(() => 50 + (knobs.elevation / MAX_POINTING) * 45)

/** Report every quality change up to the minigame instance so HUD can read progressCurrent. */
const stopReport = ref<(() => void) | null>(null)

/** Adjust a knob in a given direction (coarse, optionally fine). */
function adjust(axis: keyof KnobState, dir: -1 | 1, fine: boolean): void {
  const step = (axis === 'azimuth' || axis === 'elevation' ? STEP_POINTING : STEP_COARSE) *
    (fine ? STEP_FINE_MUL : 1)
  const next = knobs[axis] + dir * step
  if (axis === 'focus') knobs.focus = Math.max(0, Math.min(MAX_FOCUS, next))
  else if (axis === 'chroma') knobs.chroma = Math.max(0, Math.min(MAX_CHROMA, next))
  else if (axis === 'azimuth') knobs.azimuth = Math.max(-MAX_POINTING, Math.min(MAX_POINTING, next))
  else knobs.elevation = Math.max(-MAX_POINTING, Math.min(MAX_POINTING, next))
  props.minigame.reportQuality(computeQuality(knobs))
}

function onKeyDown(e: KeyboardEvent): void {
  const k = e.key.toLowerCase()
  const fine = e.shiftKey
  switch (k) {
    case 'q': e.preventDefault(); adjust('focus', -1, fine); break
    case 'w': e.preventDefault(); adjust('focus', +1, fine); break
    case 'a': e.preventDefault(); adjust('chroma', -1, fine); break
    case 's': e.preventDefault(); adjust('chroma', +1, fine); break
    case 'z': e.preventDefault(); adjust('azimuth', -1, fine); break
    case 'x': e.preventDefault(); adjust('azimuth', +1, fine); break
    case 'c': e.preventDefault(); adjust('elevation', -1, fine); break
    case 'v': e.preventDefault(); adjust('elevation', +1, fine); break
    default: break
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  props.minigame.reportQuality(quality.value)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  stopReport.value?.()
})
```

- [ ] **Step 2: Bind the template to the reactive state**

Update the knob mini-bar widths + LED colors + pointing crosshair + quality bar in the template:

```vue
<!-- FOCUS block -->
<div class="telescope-knob">
  <div class="telescope-knob__dial" :class="`led-${focusLed}`" data-axis="focus" />
  <div class="telescope-knob__label">FOCUS · Q/W</div>
  <div class="telescope-knob__bar">
    <span :style="{ width: `${Math.round(focusQ * 100)}%` }" :class="`bar-${focusLed}`" />
  </div>
</div>
<!-- CHROMA, AZIMUTH, ELEVATION: mirror the above, substituting the relevant refs. -->

<!-- POINTING -->
<div class="telescope-pointing">
  <div class="telescope-pointing__crosshair">
    <span
      class="telescope-pointing__dot"
      :style="{ left: `${pointingDotX}%`, top: `${pointingDotY}%` }"
    />
  </div>
  <div class="telescope-pointing__caption">
    {{ pointingCentered ? 'CENTERED' : `${Math.round(pointingDistNorm * 100)}% OFF` }}
  </div>
</div>

<!-- QUALITY -->
<div class="telescope-quality">
  <div class="telescope-quality__label">SIGNAL QUALITY</div>
  <div class="telescope-quality__bar">
    <span :style="{ width: `${qualityPct}%` }" :class="canLock ? 'bar-green' : 'bar-amber'" />
  </div>
  <div class="telescope-quality__pct">{{ qualityPct }}%</div>
</div>

<!-- STATUS text -->
<span class="telescope-status__state">{{ canLock ? 'SIGNAL LOCK AVAILABLE' : 'CALIBRATING' }}</span>
```

Add bar + LED color utility classes to the `<style scoped>` block:

```css
.bar-red { @apply bg-red-400; }
.bar-amber { @apply bg-amber-400; }
.bar-green { @apply bg-emerald-400; }
.led-red { border-color: #f87171; }
.led-amber { border-color: #fbbf24; }
.led-green { border-color: #34d399; }
.telescope-pointing__crosshair { @apply relative; }
.telescope-pointing__dot {
  @apply absolute w-2 h-2 rounded-full bg-cyan-300;
  transform: translate(-50%, -50%);
}
```

Repeat the knob block markup for chroma / azimuth / elevation substituting the appropriate refs — the four knob blocks each have their own section.

- [ ] **Step 3: Manual QA**

Run `bun dev`. Load a telescope EVA. Confirm:
- Pressing `Q` lowers focus value (blur LED goes red→amber→green), `W` raises it.
- Shift held halves the step size (visible as smaller quality bar movements).
- Pointing dot tracks `(azimuth, elevation)` within its crosshair box.
- Quality bar turns green at ≥95%.
- Status text reads "SIGNAL LOCK AVAILABLE" at ≥95%.

- [ ] **Step 4: Full checks**

```bash
bun run type-check && bun lint && bun test:unit
```

- [ ] **Step 5: Commit**

```bash
git add src/components/TelescopeAlignmentCanvas.vue
git commit -m "feat(telescope): knob interactivity + live quality + LEDs + pointing dot"
```

---

## Task 9: Eyepiece image + filter stack + per-mission target

**Files:**
- Modify: `src/components/TelescopeAlignmentCanvas.vue`
- Create: `public/minigames/telescope/deep_field.jpg` (and optionally the other five if licenses are confirmed; otherwise temporarily copy `deep_field.jpg` to each filename)
- Modify: `docs/credits.md` — attribution block

For this pass, ship at least `deep_field.jpg` (NASA/STScI JWST SMACS 0723 composite is public-domain) so every mission — registered or not — resolves to a real image via the Task 5 fallback. Additional targets can be populated under the same filenames later without further code changes.

- [ ] **Step 1: Drop the image(s) into `public/`**

From a suitable public-domain source (e.g. https://webbtelescope.org archival imagery, STScI press-release assets, NASA JWST image gallery), download a 2048² JPEG (≈400 KB) and save as `public/minigames/telescope/deep_field.jpg`. For any other target filenames referenced in the JSON (`sol_corona.jpg`, `m13_cluster.jpg`, `europa_plume.jpg`, `enceladus_plume.jpg`, `exoplanet_field.jpg`), either source them similarly or copy `deep_field.jpg` in place so the overlay never 404s. Document each asset's source + license in `docs/credits.md`:

```markdown
## Telescope minigame imagery

All telescope target images are public domain or CC BY, sourced from NASA / ESA / STScI archives.

- `public/minigames/telescope/deep_field.jpg` — NASA/STScI, JWST NIRCam SMACS 0723 composite (public domain).
- `public/minigames/telescope/sol_corona.jpg` — NASA/SDO AIA 304 Å (public domain).
- `public/minigames/telescope/m13_cluster.jpg` — NASA/ESA Hubble ACS/WFC, M13 (public domain).
- `public/minigames/telescope/europa_plume.jpg` — NASA/ESA/STScI HST STIS Europa plume (public domain).
- `public/minigames/telescope/enceladus_plume.jpg` — NASA/JPL/Space Science Institute, Cassini ISS (public domain).
- `public/minigames/telescope/exoplanet_field.jpg` — NASA TESS full-frame archival star field (public domain).
```

- [ ] **Step 2: Wire the image into the eyepiece template**

Replace the `telescope-eyepiece__placeholder` block with three stacked `<img>` layers for chromatic separation:

```vue
<div class="telescope-eyepiece" aria-label="Telescope eyepiece">
  <img
    class="telescope-eyepiece__img telescope-eyepiece__img--r"
    :src="`/minigames/telescope/${target.image}`"
    :alt="target.label"
    :style="eyepieceImageStyle('r')"
  />
  <img
    class="telescope-eyepiece__img telescope-eyepiece__img--g"
    :src="`/minigames/telescope/${target.image}`"
    :alt=""
    aria-hidden="true"
    :style="eyepieceImageStyle('g')"
  />
  <img
    class="telescope-eyepiece__img telescope-eyepiece__img--b"
    :src="`/minigames/telescope/${target.image}`"
    :alt=""
    aria-hidden="true"
    :style="eyepieceImageStyle('b')"
  />
</div>
```

- [ ] **Step 3: Compute the per-channel filter style**

Add to `<script setup>`:

```ts
/** CSS for one chromatic-aberration layer: base blur + channel-offset translate. */
function eyepieceImageStyle(channel: 'r' | 'g' | 'b'): Record<string, string> {
  const sign = channel === 'r' ? -1 : channel === 'b' ? 1 : 0
  const dx = knobs.chroma * sign + knobs.azimuth
  const dy = knobs.elevation
  return {
    filter: `blur(${Math.max(0, knobs.focus).toFixed(2)}px)`,
    transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`,
  }
}
```

Add channel-specific CSS (R / G / B blend stacking):

```css
.telescope-eyepiece__img {
  @apply absolute inset-0 w-full h-full object-cover;
  mix-blend-mode: screen;
  pointer-events: none;
}
.telescope-eyepiece__img--r { filter: hue-rotate(0deg); }
.telescope-eyepiece__img--g { filter: hue-rotate(0deg); }
.telescope-eyepiece__img--b { filter: hue-rotate(0deg); }
```

Channel tint is applied via three stacked images with `mix-blend-mode: screen` — the three translate offsets produce the visible chromatic fringe at high `chroma` values.

- [ ] **Step 4: Manual QA**

Run `bun dev`, load a telescope EVA:
- Image visible through the eyepiece circle.
- Dialing focus ↑ visibly increases blur.
- Dialing chroma ↑ visibly separates RGB fringe.
- Az/El translate the image off-center within the clip circle.
- At all knobs near zero the image reads pristine.

- [ ] **Step 5: Full checks**

```bash
bun run type-check && bun lint && bun test:unit
```

- [ ] **Step 6: Commit**

```bash
git add src/components/TelescopeAlignmentCanvas.vue public/minigames/telescope docs/credits.md
git commit -m "feat(telescope): eyepiece image stack + chromatic filter + target imagery"
```

---

## Task 10: Ambient drift RAF loop

**Files:**
- Modify: `src/components/TelescopeAlignmentCanvas.vue`

Wire a bounded sine-wobble to each displayed knob value so the quality bar gently pulses even without player input. Drift is additive on the display layer only — the player's raw knob state is unchanged. This keeps `computeQuality` fed from drifted display values so the visible "signal" matches what the player sees.

- [ ] **Step 1: Add a time accumulator + RAF loop**

In `<script setup>`:

```ts
import { MAX_FOCUS, MAX_CHROMA, MAX_POINTING,
  DRIFT_FOCUS, DRIFT_CHROMA, DRIFT_AZIMUTH, DRIFT_ELEVATION,
  /* existing imports retained */ } from '@/lib/minigame/telescopeAlignment/constants'
import { computeDrift } from '@/lib/minigame/telescopeAlignment/drift'

const driftTime = ref(0)
let rafId = 0
let lastTs = 0

/** RAF loop — advance drift time, recompute displayed knob values, push quality. */
function tick(ts: number): void {
  if (lastTs === 0) lastTs = ts
  const dt = (ts - lastTs) / 1000
  lastTs = ts
  driftTime.value += dt
  // Push the drifted quality so the HUD tracker sees ambient motion.
  props.minigame.reportQuality(computeQuality(displayedKnobs.value))
  rafId = requestAnimationFrame(tick)
}

const displayedKnobs = computed<KnobState>(() => ({
  focus: Math.max(0, knobs.focus + computeDrift(driftTime.value, DRIFT_FOCUS, MAX_FOCUS)),
  chroma: Math.max(0, knobs.chroma + computeDrift(driftTime.value, DRIFT_CHROMA, MAX_CHROMA)),
  azimuth: knobs.azimuth + computeDrift(driftTime.value, DRIFT_AZIMUTH, MAX_POINTING),
  elevation: knobs.elevation + computeDrift(driftTime.value, DRIFT_ELEVATION, MAX_POINTING),
}))
```

- [ ] **Step 2: Swap the view-layer references to `displayedKnobs`**

Every `computed()` that currently reads from `knobs` for display (`quality`, `focusQ`, `chromaQ`, `azQ`, `elQ`, `pointingDotX`, `pointingDotY`, `pointingDistNorm`) now reads from `displayedKnobs.value` instead. `adjust()` still mutates raw `knobs` — the player's intent isn't drifted.

Update `eyepieceImageStyle` to read from `displayedKnobs.value` so the image wobbles visibly.

- [ ] **Step 3: Start/stop the RAF**

```ts
onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  rafId = requestAnimationFrame(tick)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  cancelAnimationFrame(rafId)
})
```

- [ ] **Step 4: Manual QA**

- With no input, image and quality bar both show gentle ambient motion.
- Drift alone never pushes quality from 94% to 95%+ (the spec's invariant — drift amp is bounded at 1.5% of each axis).
- Adjusting a knob still snaps quality accordingly.

- [ ] **Step 5: Full checks**

```bash
bun run type-check && bun lint && bun test:unit
```

- [ ] **Step 6: Commit**

```bash
git add src/components/TelescopeAlignmentCanvas.vue
git commit -m "feat(telescope): ambient drift RAF loop on displayed knob values"
```

---

## Task 11: Lock-in, caption fade, ESC abort

**Files:**
- Modify: `src/components/TelescopeAlignmentCanvas.vue`

Wire `E` (at `canLock`) + ESC (abort). Lock-in animates knob values to zero over `LOCK_ANIMATION_MS`, fades in the caption, then calls `minigame.complete()` + emits `complete`. ESC emits `close`.

- [ ] **Step 1: Add lock state + handlers**

In `<script setup>`:

```ts
import { LOCK_ANIMATION_MS, CAPTION_FADE_MS } from '@/lib/minigame/telescopeAlignment/constants'

type LockState = 'calibrating' | 'locking' | 'locked'
const lockState = ref<LockState>('calibrating')

/** Ease-out-cubic for the knob-zeroing animation. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/** Kick off the lock-in sequence at time t0. */
function handleLockIn(): void {
  if (!canLock.value || lockState.value !== 'calibrating') return
  lockState.value = 'locking'
  const start = performance.now()
  const initial: KnobState = { ...knobs }
  function step(now: number): void {
    const tNorm = Math.min(1, (now - start) / LOCK_ANIMATION_MS)
    const k = 1 - easeOutCubic(tNorm)
    knobs.focus = initial.focus * k
    knobs.chroma = initial.chroma * k
    knobs.azimuth = initial.azimuth * k
    knobs.elevation = initial.elevation * k
    if (tNorm < 1) {
      requestAnimationFrame(step)
    } else {
      lockState.value = 'locked'
      props.minigame.complete()
      // Let the caption fade read before the host closes the overlay.
      setTimeout(() => emit('complete'), CAPTION_FADE_MS)
    }
  }
  requestAnimationFrame(step)
}

// Extend onKeyDown:
//   case 'e': if (canLock.value) { e.preventDefault(); handleLockIn() } break
//   case 'escape': e.preventDefault(); emit('close'); break
```

- [ ] **Step 2: Show the caption when locked**

Add to the template, layered above the eyepiece:

```vue
<transition name="telescope-caption">
  <div v-if="lockState === 'locked'" class="telescope-caption">
    <div class="telescope-caption__label">{{ target.label }}</div>
    <div class="telescope-caption__body">{{ target.caption }}</div>
  </div>
</transition>
```

Styles:

```css
.telescope-caption {
  @apply absolute inset-x-0 bottom-20 mx-auto w-fit border border-emerald-400/60 bg-slate-950/80 px-6 py-3 text-center tracking-widest;
}
.telescope-caption__label { @apply text-emerald-200; }
.telescope-caption__body { @apply text-cyan-100/80 text-xs; }
.telescope-caption-enter-active {
  transition: opacity 1200ms ease-in;
}
.telescope-caption-enter-from { opacity: 0; }
.telescope-caption-enter-to { opacity: 1; }
```

Also: update the status text to reflect `lockState`:

```ts
const statusText = computed(() => {
  if (lockState.value === 'locked') return 'CAPTURE COMPLETE'
  if (lockState.value === 'locking') return 'LOCKING IN'
  return canLock.value ? 'SIGNAL LOCK AVAILABLE' : 'CALIBRATING'
})
```

Bind in template: `<span class="telescope-status__state">{{ statusText }}</span>`.

Disable further knob input while `lockState !== 'calibrating'` — wrap the body of `onKeyDown` after `const fine = …` with `if (lockState.value !== 'calibrating' && k !== 'escape') return`.

- [ ] **Step 3: Remove the WIP buttons**

Delete `<button class="telescope-temp-complete">` and `<button class="telescope-close">` — the dispatcher (`EvaMinigameOverlay`) already owns ESC; the temp complete button is no longer needed.

- [ ] **Step 4: Manual QA**

- Dial quality to ≥95%, press `E`, see knobs animate to zero, caption fade in, reward paid, overlay closes, EVA resumes.
- Press `E` below 95% — nothing happens.
- Press `Esc` at any point — overlay closes without payout, EVA resumes.
- Rapid mash `E` during the 400ms lock — only one `complete()` fires (the class is idempotent; the component guards via `lockState`).

- [ ] **Step 5: Full checks**

```bash
bun run type-check && bun lint && bun test:unit
```

- [ ] **Step 6: Commit**

```bash
git add src/components/TelescopeAlignmentCanvas.vue
git commit -m "feat(telescope): lock-in animation + caption fade + ESC abort"
```

---

## Task 12: Polish — tactile knob states + accessibility

**Files:**
- Modify: `src/components/TelescopeAlignmentCanvas.vue`

Finishing pass: key-pulse flash on each knob when its bound key fires, visible focus ring on the overlay root for keyboard users, `aria-label` on each knob dial.

- [ ] **Step 1: Wire key-pulse state**

```ts
const pulse = reactive({ focus: 0, chroma: 0, azimuth: 0, elevation: 0 })

/** Pulse a knob's stroke for ~180ms. */
function pulseKnob(axis: keyof KnobState): void {
  pulse[axis] = performance.now()
}

// inside onKeyDown after each adjust call, call pulseKnob with the same axis.
```

Derived class in the template:

```ts
const isPulsing = (axis: keyof KnobState) =>
  performance.now() - pulse[axis] < 180
```

Apply via `:class="{ 'knob-pulse': isPulsing('focus') }"` on the dial. Drive reactivity off `driftTime` (which already ticks at RAF rate) — the existing RAF loop forces re-render.

- [ ] **Step 2: Add the pulse CSS**

```css
.knob-pulse { border-color: #7dd3fc; box-shadow: 0 0 6px rgba(125, 211, 252, 0.9); }
```

- [ ] **Step 3: Add aria labels + focusable root**

```vue
<div
  class="telescope-overlay"
  role="dialog"
  aria-label="Telescope alignment"
  tabindex="0"
>
```

Add `aria-label` to each dial:

```vue
<div class="telescope-knob__dial" aria-label="Focus knob" :class="`led-${focusLed}`" />
```

(Repeat per knob with the relevant label.)

- [ ] **Step 4: Manual QA**

- Pressing `W` flashes the focus dial border cyan-bright for a beat.
- Tabbing into the overlay shows a visible outline.
- Screen-reader spot check: each knob announces its purpose.

- [ ] **Step 5: Full checks**

```bash
bun run type-check && bun lint && bun test:unit
```

- [ ] **Step 6: Commit**

```bash
git add src/components/TelescopeAlignmentCanvas.vue
git commit -m "feat(telescope): tactile key-pulse + a11y labels + focus ring"
```

---

## Task 13: End-to-end QA pass

No code change — structured manual verification across the six telescope-capable mission slots.

- [ ] **Step 1: Confirm mission availability**

Only `earth_l2_observatory_phasing` currently exists in `src/data/shuttle-missions/eva/earth.json`. The other five mission ids referenced by the spec (`mercury_corona_monitor`, etc.) are reserved by the targets JSON but unshipped. Note: this is expected — the targets file anticipates future content.

- [ ] **Step 2: Run the Earth mission**

1. `bun dev`
2. Open `/map`, accept the L2 Observatory mission from the mission board.
3. Fly to Earth, orbit, EVA out, dock with the telescope POI.
4. Open overlay → confirm JWST deep-field image + `JWST L2 — DEEP FIELD` label.
5. Tune to ≥95%, press `E`, watch lock-in + caption.
6. Confirm reward (+350 CR) paid, overlay closes, EVA resumes.

- [ ] **Step 3: Run abort path**

Re-accept the mission, open the overlay, press `Esc` at ~40% quality. Overlay closes without reward. EVA resumes.

- [ ] **Step 4: Confirm fallback**

Temporarily edit `src/data/shuttle-missions/eva/earth.json`, change `"id"` of the telescope mission to something not in the targets JSON (e.g. `earth_l2_observatory_phasing_x`), restart dev server, confirm overlay opens with `FALLBACK_TARGET` content (label `DEEP FIELD — ARCHIVAL`). Revert the change.

- [ ] **Step 5: Run final checks**

```bash
bun run type-check && bun lint && bun test:unit
```
Expected: all green.

- [ ] **Step 6: Final commit (tagging the feature)**

No source changes — this is a sanity commit documenting QA sign-off:

```bash
git commit --allow-empty -m "chore(telescope): end-to-end QA pass complete"
```

---

## Self-Review

**Spec coverage (spec §sections → tasks):**

- Goals §"Port the React prototype" → Tasks 4, 7–12 together deliver the port.
- Goals §"Match the prototype's feel" → Tasks 8 (interactivity), 9 (image stack), 10 (drift), 11 (lock-in).
- Goals §"Six real telescope images" → Task 9 covers sourcing + wiring; Task 5 wires the JSON lookup.
- Goals §"Inherit EVA's O2 as global timer — no per-minigame countdown" → Achieved by default; we ship no timer anywhere.
- Goals §"Wire cleanly into existing reward chain" → Task 6 (factory + overlay dispatch).
- Non-Goals — audio, quality bonus, gamepad, mobile — all excluded as specified.
- Player Flow §1–9 → Tasks 6 (dispatch), 8 (knobs), 10 (drift), 11 (lock + ESC).
- Data Model §`TelescopeAlignmentMiniGame` → Task 4.
- Data Model §`TelescopeAlignmentCanvas.vue` → Tasks 7–12.
- Data Model §image-per-mission JSON → Task 5.
- Systems §quality formula → Task 2 (exact weights, unit tests).
- Systems §ambient drift → Tasks 3 + 10 (bounded amplitude proved in `drift.spec.ts`).
- Systems §per-knob LEDs + mini-bars → Tasks 2 (buckets) + 8 (rendering).
- Systems §2D pointing indicator → Task 8.
- Systems §tactile knob states → Task 12.
- Systems §eyepiece rendering (blur + chroma split + translate) → Task 9.
- Systems §lock-in transition + caption → Task 11.
- Asset Sourcing §six images + credits → Task 9.
- Implementation Order Phases T1–T6 → Tasks 1–12 map 1:1 (T1→6, T2→7, T3→8, T4→9, T5→10+11, T6→12).
- Testing §pure unit tests → Tasks 2 + 3 + 4 + 5.
- Testing §manual in-browser → Task 13.

**Placeholder scan:** No `TBD`, `TODO`, `implement later`, or "similar to Task N" references. Each code step shows the exact code.

**Type consistency:** `KnobState` used consistently across Tasks 1–11. `TelescopeTarget` consistent in Tasks 1, 5, 7, 11. `computeQuality`/`perKnobQuality`/`ledColor` names consistent Tasks 2→8→10. `TelescopeAlignmentMiniGame.reportQuality` defined in Task 4 and called in Tasks 8, 10 (same signature). `presentation = 'overlay' as const` matches the `OrbitalMiniGame` interface in `src/lib/minigame/OrbitalMiniGame.ts`.

No gaps. Plan is ready.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-04-20-telescope-alignment.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, spec then code-quality review between tasks, fast iteration.

**2. Inline Execution** — batch execution in this session via executing-plans.

Which approach?
