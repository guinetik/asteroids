/**
 * Centralises every bloom + camera-light tweak the map view performs.
 *
 * The map has three overlapping bloom regimes:
 *   1. Normal/inspect base — set by the inspect-toggle resolver.
 *   2. EVA override       — snapshot + replace while first-person EVA is active.
 *   3. Orbit clamp        — ramp down bloom + camera fill when the constant-screen-size
 *                           shuttle scaler has pushed the ship well above its map scale,
 *                           so close zooms onto the player's own hull stay readable.
 *
 * The controller owns the `UnrealBloomPass` + camera-fill-light references and exposes
 * intention-named methods; callers no longer need to reach into `sceneObjects.composer.passes`
 * or remember the clamp lerp curve.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-05-map-shuttle-player-design.md
 */
import * as THREE from 'three'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import {
  MAP_BLOOM_STRENGTH,
  MAP_BLOOM_THRESHOLD,
  MAP_CAMERA_LIGHT_BASE_INTENSITY,
  MAP_INSPECT_BLOOM_STRENGTH,
  MAP_INSPECT_BLOOM_THRESHOLD,
  ORBIT_BLOOM_CLAMP_OVERSCALE_END,
  ORBIT_BLOOM_CLAMP_OVERSCALE_START,
  ORBIT_BLOOM_CLAMP_STRENGTH,
  ORBIT_BLOOM_CLAMP_THRESHOLD,
  EVA_MAP_BLOOM_STRENGTH,
  EVA_MAP_BLOOM_THRESHOLD,
} from '@/lib/map/eva/evaMapConstants'

/**
 * Minimal subset of `MapSceneObjects` the bloom controller needs to reach the bloom pass
 * and the camera-attached fill light. Declared explicitly so tests can stub these without
 * constructing a full EffectComposer.
 */
export interface MapBloomHost {
  /** Post-processing composer whose passes include an `UnrealBloomPass`. */
  composer: EffectComposer
  /** Camera-attached fill light whose intensity we ramp against the clamp. */
  cameraLight: THREE.Light
}

/** Inputs for {@link MapBloomController.applyOrbitClamp}. */
export interface MapBloomClampInput {
  /** Shuttle scale / base scale ratio (1.0 = at baseline map scale). */
  overscale: number
  /** Whether inspect camera is active (different base bloom values). */
  inspectMode: boolean
}

/**
 * Bloom + camera-fill-light coordinator for the map view.
 *
 * Construction is cheap — the controller caches nothing; resolving the bloom pass on
 * every call keeps it resilient to composer rebuilds and sidesteps the ordering churn
 * of `sceneObjects` becoming available later than controller instantiation.
 */
export class MapBloomController {
  /**
   * Snapshot of bloom values taken when {@link setEvaOverride}(true) runs.
   * `null` outside EVA; non-null while the EVA override is in effect — also serves
   * as the "clamp is disabled" flag for {@link applyOrbitClamp}.
   */
  private preEvaState: { threshold: number; strength: number } | null = null

  constructor(private host: MapBloomHost | null = null) {}

  /** Attach (or replace) the host. Call once the EffectComposer is ready. */
  setHost(host: MapBloomHost | null): void {
    this.host = host
  }

  /** Whether the EVA bloom override is currently applied. */
  get isEvaOverrideActive(): boolean {
    return this.preEvaState !== null
  }

  /**
   * Snapshot + swap bloom when EVA begins, or restore the snapshot when it ends.
   * Idempotent: calling `setEvaOverride(true)` twice keeps the original snapshot;
   * calling `setEvaOverride(false)` outside EVA is a no-op.
   *
   * @param active - True on EVA enter; false on EVA exit.
   */
  setEvaOverride(active: boolean): void {
    const bloomPass = this.resolveBloomPass()
    if (!bloomPass) return

    if (active) {
      if (!this.preEvaState) {
        this.preEvaState = {
          threshold: bloomPass.threshold,
          strength: bloomPass.strength,
        }
      }
      bloomPass.threshold = EVA_MAP_BLOOM_THRESHOLD
      bloomPass.strength = EVA_MAP_BLOOM_STRENGTH
      return
    }

    if (this.preEvaState) {
      bloomPass.threshold = this.preEvaState.threshold
      bloomPass.strength = this.preEvaState.strength
      this.preEvaState = null
    }
  }

  /**
   * Push raw bloom values straight to the pass. Used by the inspect toggle which
   * resolves its own (threshold, strength) pair outside the clamp curve.
   */
  setRawBloom(threshold: number, strength: number): void {
    const bloomPass = this.resolveBloomPass()
    if (!bloomPass) return
    bloomPass.threshold = threshold
    bloomPass.strength = strength
  }

  /**
   * Ramp bloom + camera fill down as the shuttle is scaled up past baseline.
   *
   * Skipped entirely while the EVA override is active — EVA owns its own bloom
   * regime until it calls `setEvaOverride(false)`.
   *
   * Below {@link ORBIT_BLOOM_CLAMP_OVERSCALE_START}: bloom returns to the inspect/
   * normal baseline, fill light returns to {@link MAP_CAMERA_LIGHT_BASE_INTENSITY}.
   *
   * Above that: smoothstep-lerp into {@link ORBIT_BLOOM_CLAMP_THRESHOLD} / _STRENGTH,
   * fill light lerps to 0.
   *
   * @param input - Overscale + inspect-mode flag.
   */
  applyOrbitClamp(input: MapBloomClampInput): void {
    if (this.preEvaState) return
    const bloomPass = this.resolveBloomPass()
    if (!bloomPass) return

    const baseThreshold = input.inspectMode ? MAP_INSPECT_BLOOM_THRESHOLD : MAP_BLOOM_THRESHOLD
    const baseStrength = input.inspectMode ? MAP_INSPECT_BLOOM_STRENGTH : MAP_BLOOM_STRENGTH
    const cameraLight = this.host?.cameraLight ?? null

    if (input.overscale <= ORBIT_BLOOM_CLAMP_OVERSCALE_START) {
      bloomPass.threshold = baseThreshold
      bloomPass.strength = baseStrength
      if (cameraLight) {
        cameraLight.intensity = MAP_CAMERA_LIGHT_BASE_INTENSITY
      }
      return
    }

    const clampT = THREE.MathUtils.smoothstep(
      input.overscale,
      ORBIT_BLOOM_CLAMP_OVERSCALE_START,
      ORBIT_BLOOM_CLAMP_OVERSCALE_END,
    )
    bloomPass.threshold = THREE.MathUtils.lerp(baseThreshold, ORBIT_BLOOM_CLAMP_THRESHOLD, clampT)
    bloomPass.strength = THREE.MathUtils.lerp(baseStrength, ORBIT_BLOOM_CLAMP_STRENGTH, clampT)
    if (cameraLight) {
      cameraLight.intensity = THREE.MathUtils.lerp(MAP_CAMERA_LIGHT_BASE_INTENSITY, 0, clampT)
    }
  }

  /** Walk `composer.passes` for the first UnrealBloomPass; `null` when none is mounted. */
  private resolveBloomPass(): UnrealBloomPass | null {
    const composer = this.host?.composer
    if (!composer) return null
    for (const pass of composer.passes) {
      if (pass instanceof UnrealBloomPass) return pass
    }
    return null
  }
}
