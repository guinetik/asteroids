/**
 * Tests for slingshot charge orbit camera blending.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-map-shuttle-player-design.md
 */
import { describe, expect, it } from 'vitest'
import {
  buildSlingshotChargeCameraConfig,
  MAP_ORBIT_CHARGE_CAMERA_CONFIG,
} from '../slingshotChargeCamera'
import { MAP_ORBIT_CAMERA_CONFIG } from '../VehicleCamera'

describe('buildSlingshotChargeCameraConfig', () => {
  it('returns the default orbit camera at zero charge', () => {
    const config = buildSlingshotChargeCameraConfig(0)

    expect(config.idleOffset.x).toBeCloseTo(MAP_ORBIT_CAMERA_CONFIG.idleOffset.x, 5)
    expect(config.idleOffset.y).toBeCloseTo(MAP_ORBIT_CAMERA_CONFIG.idleOffset.y, 5)
    expect(config.idleOffset.z).toBeCloseTo(MAP_ORBIT_CAMERA_CONFIG.idleOffset.z, 5)
    expect(config.fov).toBeCloseTo(MAP_ORBIT_CAMERA_CONFIG.fov, 5)
    expect(config.maxDistance).toBeCloseTo(MAP_ORBIT_CAMERA_CONFIG.maxDistance!, 5)
  })

  it('returns the close third-person camera at full charge', () => {
    const config = buildSlingshotChargeCameraConfig(1)

    expect(config.idleOffset.x).toBeCloseTo(MAP_ORBIT_CHARGE_CAMERA_CONFIG.idleOffset.x, 5)
    expect(config.idleOffset.y).toBeCloseTo(MAP_ORBIT_CHARGE_CAMERA_CONFIG.idleOffset.y, 5)
    expect(config.idleOffset.z).toBeCloseTo(MAP_ORBIT_CHARGE_CAMERA_CONFIG.idleOffset.z, 5)
    expect(config.fov).toBeCloseTo(MAP_ORBIT_CHARGE_CAMERA_CONFIG.fov, 5)
    expect(config.maxDistance).toBeCloseTo(MAP_ORBIT_CHARGE_CAMERA_CONFIG.maxDistance!, 5)
  })

  it('interpolates smoothly through the charge window', () => {
    const config = buildSlingshotChargeCameraConfig(0.5)

    expect(config.idleOffset.x).toBeCloseTo(-0.7, 5)
    expect(config.idleOffset.y).toBeCloseTo(3.35, 5)
    expect(config.idleOffset.z).toBeCloseTo(0, 5)
    expect(config.fov).toBeCloseTo(49, 5)
    expect(config.maxDistance).toBeCloseTo(120, 5)
  })

  it('clamps charge outside the valid range', () => {
    const low = buildSlingshotChargeCameraConfig(-1)
    const high = buildSlingshotChargeCameraConfig(2)

    expect(low.idleOffset.y).toBeCloseTo(MAP_ORBIT_CAMERA_CONFIG.idleOffset.y, 5)
    expect(high.idleOffset.y).toBeCloseTo(MAP_ORBIT_CHARGE_CAMERA_CONFIG.idleOffset.y, 5)
  })
})
