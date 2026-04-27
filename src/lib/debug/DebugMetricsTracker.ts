/**
 * Per-frame sampler that pumps Three.js renderer stats, frame timing, peak
 * spike tracking, runtime shader-compile detection, and per-tickable
 * profiling into the shared {@link debugMetrics} bag.
 *
 * Disables `renderer.info.autoReset` so draw / triangle counters accumulate
 * across every render pass the {@link LevelPostProcessing} composer fires —
 * otherwise the readout is just the final fullscreen quad.
 *
 * Registered at a priority strictly greater than {@link TICK_PRIORITY_RENDER}
 * so `renderer.info` reflects every pass that ran this frame; the manual
 * `renderer.info.reset()` runs at the *end* of this tick, so next frame's
 * passes start from zero.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/asteroid-lander-gdd.md
 */
import type * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { TickHandler } from '@/lib/TickHandler'
import { debugMetrics, resetDebugMetrics } from './debugMetrics'

/** Number of frames averaged for the FPS readout. */
const FPS_WINDOW_FRAMES = 30

/** Rolling window length (ms) used to compute peak frame ms. */
const PEAK_WINDOW_MS = 2000

/** Number of slowest tickables surfaced to the HUD. */
const TOP_TICKABLES_COUNT = 4

/** Bytes per megabyte for `performance.memory.usedJSHeapSize` conversion. */
const BYTES_PER_MB = 1024 * 1024

/**
 * Optional `performance.memory` shape exposed by Chromium browsers. Not part
 * of the standard Performance API, so we feature-detect at read time.
 */
interface ChromiumPerformanceMemory {
  /** Used JS heap size in bytes. */
  usedJSHeapSize: number
}

/** One entry in the rolling peak-frame window. */
interface PeakSample {
  /** `performance.now()` timestamp (ms) when the frame ended. */
  timestamp: number
  /** Frame duration in milliseconds. */
  ms: number
}

/**
 * Construction parameters for {@link DebugMetricsTracker}.
 */
export interface DebugMetricsTrackerParams {
  /** Renderer whose `info` block is sampled each frame. */
  renderer: THREE.WebGLRenderer
  /** Tick handler whose per-tickable timings should be surfaced to the HUD. */
  tickHandler: TickHandler
  /** Returns the live enemy count across all active minigames. */
  getEnemyCount: () => number
  /** Returns the live projectile count from the player projectile system. */
  getProjectileCount: () => number
}

/**
 * Tickable that copies live metrics into {@link debugMetrics} once per frame.
 *
 * @author guinetik
 * @date 2026-04-27
 */
export class DebugMetricsTracker implements Tickable {
  private readonly renderer: THREE.WebGLRenderer
  private readonly tickHandler: TickHandler
  private readonly getEnemyCount: () => number
  private readonly getProjectileCount: () => number
  private readonly fpsSamples: number[] = []
  private readonly peakSamples: PeakSample[] = []
  private lastProgramsCount = 0

  constructor(params: DebugMetricsTrackerParams) {
    this.renderer = params.renderer
    this.tickHandler = params.tickHandler
    this.getEnemyCount = params.getEnemyCount
    this.getProjectileCount = params.getProjectileCount

    this.renderer.info.autoReset = false
    this.tickHandler.setProfilingEnabled(true)
    debugMetrics.active = true
  }

  tick(dt: number): void {
    const frameMs = dt * 1000
    debugMetrics.frameMs = frameMs

    if (frameMs > 0) {
      const fps = 1000 / frameMs
      this.fpsSamples.push(fps)
      if (this.fpsSamples.length > FPS_WINDOW_FRAMES) this.fpsSamples.shift()
      let sum = 0
      for (const sample of this.fpsSamples) sum += sample
      debugMetrics.fps = sum / this.fpsSamples.length
    }

    const now = performance.now()
    this.peakSamples.push({ timestamp: now, ms: frameMs })
    while (this.peakSamples.length > 0 && now - this.peakSamples[0]!.timestamp > PEAK_WINDOW_MS) {
      this.peakSamples.shift()
    }
    let peak = 0
    for (const sample of this.peakSamples) {
      if (sample.ms > peak) peak = sample.ms
    }
    debugMetrics.peakFrameMs = peak

    const info = this.renderer.info
    debugMetrics.drawCalls = info.render.calls
    debugMetrics.triangles = info.render.triangles
    debugMetrics.geometries = info.memory.geometries
    debugMetrics.textures = info.memory.textures
    const programsCount = info.programs?.length ?? 0
    debugMetrics.programsDelta = programsCount - this.lastProgramsCount
    debugMetrics.programs = programsCount
    this.lastProgramsCount = programsCount

    debugMetrics.enemies = this.getEnemyCount()
    debugMetrics.projectiles = this.getProjectileCount()

    const memory = (performance as Performance & { memory?: ChromiumPerformanceMemory }).memory
    debugMetrics.memMB = memory ? memory.usedJSHeapSize / BYTES_PER_MB : Number.NaN

    this.updateTopTickables()

    info.reset()
  }

  /**
   * Mark metrics as inactive, restore renderer auto-reset, and disable
   * profiling on the tick handler. Call from the controller's dispose
   * path after unregistering this tickable.
   */
  dispose(): void {
    this.renderer.info.autoReset = true
    this.tickHandler.setProfilingEnabled(false)
    resetDebugMetrics()
  }

  /**
   * Sort the latest tick-handler samples by ms desc and copy the top N
   * into {@link debugMetrics.topTickables}. Excludes this tracker so the
   * HUD does not advertise its own self-cost.
   */
  private updateTopTickables(): void {
    const samples = this.tickHandler.getLastTickTimings()
    const out = debugMetrics.topTickables
    out.length = 0
    if (samples.length === 0) return

    const sorted = samples
      .filter((sample) => sample.name !== this.constructor.name)
      .slice()
      .sort((a, b) => b.ms - a.ms)

    const cap = Math.min(TOP_TICKABLES_COUNT, sorted.length)
    for (let i = 0; i < cap; i++) {
      const entry = sorted[i]!
      out.push({ name: entry.name, ms: entry.ms })
    }
  }
}
