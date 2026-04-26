/**
 * Throttled per-enemy terrain-tilt sampler.
 *
 * Calling `Heightmap.normalAt` every frame for every enemy is one of the
 * cheap-but-not-free chunks of the FPS scene budget (4× `heightAt` per
 * sample). Visual tilt is indistinguishable at 15 Hz vs 60 Hz, so we
 * cache the last sample per enemy id and only resample when the enemy
 * has moved more than `RESAMPLE_DIST_M` since the last sample.
 *
 * @author guinetik
 * @date 2026-04-18
 * @spec docs/superpowers/specs/2026-04-18-fps-perf-fixes-design.md
 */
import type { Heightmap } from '@/lib/terrain/heightmap'

/** Resample when enemy XZ has moved more than this distance from the last sample. */
const RESAMPLE_DIST_M = 0.5
const RESAMPLE_DIST_SQ = RESAMPLE_DIST_M * RESAMPLE_DIST_M

/** Cached terrain sample for one enemy: last XZ position and derived tilt angles. */
interface TiltSample {
  x: number
  z: number
  rotX: number
  rotZ: number
}

/**
 * Per-enemy terrain tilt cache. One instance per scene (minigame /
 * view controller), keyed by enemy handle id.
 *
 * @author guinetik
 * @date 2026-04-18
 * @spec docs/superpowers/specs/2026-04-18-fps-perf-fixes-design.md
 */
export class EnemyTiltCache {
  private readonly heightmap: Heightmap
  private readonly samples = new Map<number, TiltSample>()

  /**
   * @param heightmap - Terrain heightmap to sample normals from.
   */
  constructor(heightmap: Heightmap) {
    this.heightmap = heightmap
  }

  /**
   * Apply the cached terrain tilt rotation to `target.rotation.x/z`.
   * Resamples the heightmap normal only when the enemy XZ position has
   * moved more than ~0.5 m since the last sample.
   *
   * @param id - Enemy handle id used as the cache key.
   * @param x - Enemy world X position.
   * @param z - Enemy world Z position.
   * @param target - Object whose `rotation.x` / `rotation.z` should be set.
   */
  applyTilt(
    id: number,
    x: number,
    z: number,
    target: { rotation: { x: number; z: number } },
  ): void {
    let sample = this.samples.get(id)
    if (!sample) {
      sample = { x, z, rotX: 0, rotZ: 0 }
      this.resample(sample, x, z)
      this.samples.set(id, sample)
    } else {
      const dx = x - sample.x
      const dz = z - sample.z
      if (dx * dx + dz * dz > RESAMPLE_DIST_SQ) {
        this.resample(sample, x, z)
      }
    }
    target.rotation.x = sample.rotX
    target.rotation.z = sample.rotZ
  }

  /**
   * Drop a cached sample (call when the enemy is despawned).
   *
   * @param id - Enemy handle id.
   */
  release(id: number): void {
    this.samples.delete(id)
  }

  /** Drop every cached sample. */
  clear(): void {
    this.samples.clear()
  }

  private resample(sample: TiltSample, x: number, z: number): void {
    const n = this.heightmap.normalAt(x, z)
    sample.x = x
    sample.z = z
    sample.rotX = Math.atan2(n.z, n.y)
    sample.rotZ = Math.atan2(-n.x, n.y)
  }
}
