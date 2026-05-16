/**
 * Pure timing helpers for station startup intro presentation.
 *
 * @author guinetik
 * @date 2026-05-16
 * @spec docs/superpowers/specs/2026-05-16-station-startup-intro-design.md
 */

/** Smoothstep polynomial edge coefficient. */
const SMOOTHSTEP_EDGE_FACTOR = 3
/** Smoothstep polynomial curve coefficient. */
const SMOOTHSTEP_CURVE_FACTOR = 2

/** Timing knobs for the station startup intro, in seconds. */
export interface StationStartupIntroTiming {
  /** Total intro duration before normal station controls unlock. */
  duration: number
  /** Seconds for the black fade to reach transparent. */
  fadeInDuration: number
  /** Seconds for the auto-walk from entrance offset to spawn. */
  walkDuration: number
}

/** Timing knobs for the post-intro briefing fade, in seconds. */
export interface StationBriefingFadeTiming {
  /** Seconds for the briefing HUD to fade out once the player moves. */
  duration: number
}

/** Presentation state derived from station startup intro elapsed time. */
export interface StationStartupIntroState {
  /** Black overlay opacity in `[0, 1]`, where `1` is fully black. */
  fadeOpacity: number
  /** Smoothed auto-walk progress in `[0, 1]`. */
  walkProgress: number
  /** Whether the station briefing HUD should be visible. */
  hudVisible: boolean
  /** Whether letterbox bars should be visible. */
  letterboxVisible: boolean
  /** Whether the intro has finished and controls may unlock. */
  complete: boolean
}

/** Presentation state for the post-intro briefing HUD fade. */
export interface StationBriefingFadeState {
  /** HUD opacity in `[0, 1]`. */
  opacity: number
  /** Whether the fade has finished and the briefing can unmount. */
  complete: boolean
}

/**
 * Compute station startup intro presentation state from elapsed time.
 *
 * @param elapsedSeconds - Seconds since the startup intro began.
 * @param timing - Duration knobs for fade, walk, HUD, and completion.
 * @returns Derived presentation state for Vue and the station controller.
 */
export function computeStationStartupIntroState(
  elapsedSeconds: number,
  timing: StationStartupIntroTiming,
): StationStartupIntroState {
  const safeElapsed = Math.max(0, elapsedSeconds)
  const fadeProgress = ratio(safeElapsed, timing.fadeInDuration)
  const walkLinearProgress = ratio(safeElapsed, timing.walkDuration)
  return {
    fadeOpacity: 1 - fadeProgress,
    walkProgress: smoothstep(walkLinearProgress),
    hudVisible: true,
    letterboxVisible: safeElapsed < timing.duration,
    complete: safeElapsed >= timing.duration,
  }
}

/**
 * Compute briefing fade after the player first starts moving. A `null`
 * elapsed value means the movement trigger has not fired yet.
 *
 * @param elapsedSeconds - Seconds since movement began, or `null` before movement.
 * @param timing - Fade timing knobs.
 * @returns Briefing opacity and completion state.
 */
export function computeStationBriefingFadeState(
  elapsedSeconds: number | null,
  timing: StationBriefingFadeTiming,
): StationBriefingFadeState {
  if (elapsedSeconds === null) {
    return { opacity: 1, complete: false }
  }
  const progress = ratio(Math.max(0, elapsedSeconds), timing.duration)
  return {
    opacity: 1 - progress,
    complete: progress >= 1,
  }
}

/**
 * Clamp a duration ratio to the normalized `[0, 1]` interval.
 *
 * @param elapsedSeconds - Elapsed seconds.
 * @param durationSeconds - Duration denominator in seconds.
 * @returns Normalized ratio.
 */
function ratio(elapsedSeconds: number, durationSeconds: number): number {
  if (durationSeconds <= 0) return 1
  return Math.min(1, Math.max(0, elapsedSeconds / durationSeconds))
}

/**
 * Smooth a normalized value using the standard smoothstep polynomial.
 *
 * @param value - Normalized input value.
 * @returns Smoothed normalized output.
 */
function smoothstep(value: number): number {
  const t = Math.min(1, Math.max(0, value))
  return t * t * (SMOOTHSTEP_EDGE_FACTOR - SMOOTHSTEP_CURVE_FACTOR * t)
}
