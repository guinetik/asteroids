/**
 * Shared debug metrics bag — populated each frame by {@link DebugMetricsTracker}
 * and read by the {@link DebugHud} Vue overlay. Plain mutable fields so the
 * tracker can poke them every frame without any reactivity overhead; the HUD
 * polls on its own throttled interval.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/asteroid-lander-gdd.md
 */

/** URL query parameter that activates the debug HUD. */
export const DEBUG_HUD_QUERY_PARAM = 'debug'

/**
 * One row of the "top tickables" breakdown — the slowest registered tickable
 * by wall-clock ms over the most recently profiled frame.
 */
export interface DebugTickableSample {
  /** Class name of the tickable. */
  name: string
  /** Wall-clock ms spent inside its `tick()` last frame. */
  ms: number
}

/**
 * Live frame metrics shared between the per-frame tracker and the polling
 * HUD overlay. All fields are zero when no scene is active.
 */
export interface DebugMetrics {
  /** True when a tracker is currently writing to the bag. */
  active: boolean
  /** Smoothed frames-per-second over a rolling window. */
  fps: number
  /** Most recent frame delta in milliseconds. */
  frameMs: number
  /** Worst frame delta in milliseconds over a rolling time window. */
  peakFrameMs: number
  /** Used JS heap in megabytes. NaN when the browser does not expose it. */
  memMB: number
  /** WebGL draw calls submitted across all render passes in the previous frame. */
  drawCalls: number
  /** Triangles submitted across all render passes in the previous frame. */
  triangles: number
  /** Live geometry count tracked by the renderer. */
  geometries: number
  /** Live texture count tracked by the renderer. */
  textures: number
  /** Compiled shader program count tracked by the renderer. */
  programs: number
  /**
   * Change in compiled shader program count since the previous frame. A
   * non-zero value during gameplay indicates a runtime shader compile,
   * which typically causes a multi-hundred-millisecond stall.
   */
  programsDelta: number
  /** Live enemy count summed across active minigames (0 when no combat minigame is active). */
  enemies: number
  /** Live projectile count from the player projectile system. */
  projectiles: number
  /** Top N slowest tickables from the most recent profiled frame, ordered by ms desc. */
  topTickables: DebugTickableSample[]
}

/**
 * Singleton metrics bag. Mutated in place each frame by the tracker. Never
 * reassign the reference — the HUD reads through the same module export.
 */
export const debugMetrics: DebugMetrics = {
  active: false,
  fps: 0,
  frameMs: 0,
  peakFrameMs: 0,
  memMB: Number.NaN,
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
  programsDelta: 0,
  enemies: 0,
  projectiles: 0,
  topTickables: [],
}

/**
 * Check the current URL for {@link DEBUG_HUD_QUERY_PARAM}=1. Returns false
 * outside of a browser context so SSR / unit tests stay clean.
 *
 * @returns True when the debug HUD should be wired up for this page load.
 */
export function isDebugHudEnabled(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  const value = params.get(DEBUG_HUD_QUERY_PARAM)
  return value === '1' || value === 'true'
}

/**
 * Reset the metrics bag back to its idle state. Called when a tracker is
 * disposed so the HUD does not keep displaying stale numbers.
 */
export function resetDebugMetrics(): void {
  debugMetrics.active = false
  debugMetrics.fps = 0
  debugMetrics.frameMs = 0
  debugMetrics.peakFrameMs = 0
  debugMetrics.memMB = Number.NaN
  debugMetrics.drawCalls = 0
  debugMetrics.triangles = 0
  debugMetrics.geometries = 0
  debugMetrics.textures = 0
  debugMetrics.programs = 0
  debugMetrics.programsDelta = 0
  debugMetrics.enemies = 0
  debugMetrics.projectiles = 0
  debugMetrics.topTickables.length = 0
}
