import { describe, it, expect, beforeEach } from 'vitest'
import { FpsCamera } from '../FpsCamera'
import type { FpsCameraConfig } from '../FpsCamera'
import * as THREE from 'three'

const TEST_CONFIG: FpsCameraConfig = {
  eyeHeight: 1.7,
  sensitivity: 0.002,
  pitchClamp: 1.48,
  fov: 75,
}

describe('FpsCamera', () => {
  let cam: FpsCamera
  let target: THREE.Object3D

  beforeEach(() => {
    cam = new FpsCamera(TEST_CONFIG)
    target = new THREE.Object3D()
    target.position.set(10, 5, 20)
    cam.setTarget(target)
  })

  it('camera position tracks target plus eye height', () => {
    cam.tick(0.016)
    expect(cam.camera.position.x).toBe(10)
    expect(cam.camera.position.y).toBeCloseTo(5 + 1.7)
    expect(cam.camera.position.z).toBe(20)
  })

  it('applyMouseDelta rotates yaw on deltaX', () => {
    cam.applyMouseDelta(100, 0)
    cam.tick(0.016)
    expect(cam.yaw).not.toBe(0)
  })

  it('applyMouseDelta rotates pitch on deltaY', () => {
    cam.applyMouseDelta(0, 100)
    cam.tick(0.016)
    expect(cam.pitch).not.toBe(0)
  })

  it('pitch is clamped to pitchClamp', () => {
    cam.applyMouseDelta(0, -99999)
    cam.tick(0.016)
    expect(cam.pitch).toBeCloseTo(TEST_CONFIG.pitchClamp, 1)
  })

  it('getForwardXZ returns unit vector on XZ plane', () => {
    cam.applyMouseDelta(0, 50) // pitch down — should NOT affect forwardXZ
    cam.tick(0.016)
    const fwd = cam.getForwardXZ()
    expect(fwd.length()).toBeCloseTo(1, 3)
  })

  it('getRightXZ returns vector perpendicular to forwardXZ', () => {
    cam.tick(0.016)
    const fwd = cam.getForwardXZ()
    const right = cam.getRightXZ()
    const dot = fwd.x * right.x + fwd.y * right.y
    expect(dot).toBeCloseTo(0, 3)
  })
})
