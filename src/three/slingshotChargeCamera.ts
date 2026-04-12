/**
 * Helpers for orbit-camera charge zoom during slingshot aiming.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-map-shuttle-player-design.md
 */
import * as THREE from 'three'
import { MAP_ORBIT_CAMERA_CONFIG, type VehicleCameraConfig } from './VehicleCamera'

/** Full-charge camera preset: closer third-person framing behind the shuttle. */
export const MAP_ORBIT_CHARGE_CAMERA_CONFIG: VehicleCameraConfig = {
  idleOffset: new THREE.Vector3(-1.4, 0.7, 0),
  lerpSpeed: MAP_ORBIT_CAMERA_CONFIG.lerpSpeed,
  idleTimeout: MAP_ORBIT_CAMERA_CONFIG.idleTimeout,
  minY: MAP_ORBIT_CAMERA_CONFIG.minY,
  fov: 48,
  maxDistance: 40,
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
    idleOffset: MAP_ORBIT_CAMERA_CONFIG.idleOffset.clone().lerp(
      MAP_ORBIT_CHARGE_CAMERA_CONFIG.idleOffset,
      charge,
    ),
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
    minY: THREE.MathUtils.lerp(
      MAP_ORBIT_CAMERA_CONFIG.minY,
      MAP_ORBIT_CHARGE_CAMERA_CONFIG.minY,
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
  }
}
