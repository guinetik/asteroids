/**
 * Helpers for orbit-camera charge zoom during slingshot aiming.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-map-shuttle-player-design.md
 */
import * as THREE from 'three'
import {
  MAP_ORBIT_CAMERA_CONFIG,
  MAP_CAMERA_CONFIG,
  type VehicleCameraConfig,
} from './VehicleCamera'

/**
 * Full-charge camera preset: closer third-person framing behind the shuttle.
 *
 * Inherits {@link MAP_ORBIT_CAMERA_CONFIG.minYRelativeToTarget} so the floor follows the
 * planet's Y on inclined orbits — see the docs on `MAP_ORBIT_CAMERA_CONFIG` for the
 * Neptune/Pluto bug this prevents.
 */
export const MAP_ORBIT_CHARGE_CAMERA_CONFIG: VehicleCameraConfig = {
  idleOffset: new THREE.Vector3(-1.4, 0.7, 0),
  lerpSpeed: MAP_ORBIT_CAMERA_CONFIG.lerpSpeed,
  idleTimeout: MAP_ORBIT_CAMERA_CONFIG.idleTimeout,
  minY: MAP_ORBIT_CAMERA_CONFIG.minY,
  minYRelativeToTarget: MAP_ORBIT_CAMERA_CONFIG.minYRelativeToTarget,
  fov: 48,
  maxDistance: MAP_ORBIT_CAMERA_CONFIG.maxDistance,
  dampingFactor: MAP_ORBIT_CAMERA_CONFIG.dampingFactor,
  preserveDragInertia: MAP_ORBIT_CAMERA_CONFIG.preserveDragInertia,
}

/** Duration of the orbit → free-flight camera blend after slingshot release. */
const SLINGSHOT_EXIT_CAMERA_DURATION_SEC = 1.0

export { SLINGSHOT_EXIT_CAMERA_DURATION_SEC }

/**
 * Blend orbit camera toward free-flight chase framing after slingshot release.
 *
 * @param progress - Exit blend progress in the `[0, 1]` range (0 = orbit, 1 = free-flight).
 * @returns Camera config interpolated between orbit and free-flight framing.
 */
export function buildSlingshotExitCameraConfig(progress: number): VehicleCameraConfig {
  const t = Math.max(0, Math.min(1, progress))

  return {
    idleOffset: MAP_ORBIT_CAMERA_CONFIG.idleOffset.clone().lerp(MAP_CAMERA_CONFIG.idleOffset, t),
    lerpSpeed: THREE.MathUtils.lerp(
      MAP_ORBIT_CAMERA_CONFIG.lerpSpeed,
      MAP_CAMERA_CONFIG.lerpSpeed,
      t,
    ),
    idleTimeout: 0,
    minY: lerpFiniteFloor(MAP_ORBIT_CAMERA_CONFIG.minY, MAP_CAMERA_CONFIG.minY, t),
    /**
     * Orbit framing keeps the camera floor relative to the planet (see
     * {@link MAP_ORBIT_CAMERA_CONFIG}); free-flight has no floor at all. Ramp the relative
     * floor toward a value low enough to be a no-op as the blend completes.
     */
    minYRelativeToTarget: THREE.MathUtils.lerp(
      MAP_ORBIT_CAMERA_CONFIG.minYRelativeToTarget ?? 0,
      -1000,
      t,
    ),
    fov: THREE.MathUtils.lerp(MAP_ORBIT_CAMERA_CONFIG.fov, MAP_CAMERA_CONFIG.fov, t),
    maxDistance: MAP_CAMERA_CONFIG.maxDistance,
  }
}

/**
 * Lerp two `minY` floors while replacing `-Infinity` with a sentinel low number so the
 * mix doesn't produce `NaN`. Free-flight uses `-Infinity`; the orbit preset now uses
 * `-Infinity` too (the floor is supplied by `minYRelativeToTarget`), but the sentinel
 * keeps the helper safe if either side is later changed.
 */
function lerpFiniteFloor(a: number, b: number, t: number): number {
  const safe = (v: number): number => (v === -Infinity ? -1000 : v)
  return THREE.MathUtils.lerp(safe(a), safe(b), t)
}

/**
 * Blend the orbit camera into a closer third-person framing while charging.
 *
 * @param chargeLevel - Current slingshot charge in the `[0, 1]` range.
 * @returns Camera config interpolated between orbit and full-charge framing.
 */
export function buildSlingshotChargeCameraConfig(chargeLevel: number): VehicleCameraConfig {
  const charge = Math.max(0, Math.min(1, chargeLevel))

  return {
    idleOffset: MAP_ORBIT_CAMERA_CONFIG.idleOffset
      .clone()
      .lerp(MAP_ORBIT_CHARGE_CAMERA_CONFIG.idleOffset, charge),
    lerpSpeed: THREE.MathUtils.lerp(
      MAP_ORBIT_CAMERA_CONFIG.lerpSpeed,
      MAP_ORBIT_CHARGE_CAMERA_CONFIG.lerpSpeed,
      charge,
    ),
    idleTimeout: THREE.MathUtils.lerp(
      MAP_ORBIT_CAMERA_CONFIG.idleTimeout,
      MAP_ORBIT_CHARGE_CAMERA_CONFIG.idleTimeout,
      charge,
    ),
    minY: lerpFiniteFloor(
      MAP_ORBIT_CAMERA_CONFIG.minY,
      MAP_ORBIT_CHARGE_CAMERA_CONFIG.minY,
      charge,
    ),
    minYRelativeToTarget: THREE.MathUtils.lerp(
      MAP_ORBIT_CAMERA_CONFIG.minYRelativeToTarget ?? 0,
      MAP_ORBIT_CHARGE_CAMERA_CONFIG.minYRelativeToTarget ?? 0,
      charge,
    ),
    fov: THREE.MathUtils.lerp(
      MAP_ORBIT_CAMERA_CONFIG.fov,
      MAP_ORBIT_CHARGE_CAMERA_CONFIG.fov,
      charge,
    ),
    maxDistance: THREE.MathUtils.lerp(
      MAP_ORBIT_CAMERA_CONFIG.maxDistance ?? 0,
      MAP_ORBIT_CHARGE_CAMERA_CONFIG.maxDistance ?? 0,
      charge,
    ),
    dampingFactor: THREE.MathUtils.lerp(
      MAP_ORBIT_CAMERA_CONFIG.dampingFactor ?? 0.1,
      MAP_ORBIT_CHARGE_CAMERA_CONFIG.dampingFactor ?? 0.1,
      charge,
    ),
    preserveDragInertia: MAP_ORBIT_CHARGE_CAMERA_CONFIG.preserveDragInertia,
  }
}
