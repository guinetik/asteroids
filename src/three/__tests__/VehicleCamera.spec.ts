import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { VehicleCamera, type VehicleCameraConfig } from '../VehicleCamera'

const TEST_CAMERA_CONFIG: VehicleCameraConfig = {
  idleOffset: new THREE.Vector3(4, 2, 0),
  lerpSpeed: 1,
  idleTimeout: 0.1,
  minY: -Infinity,
  fov: 60,
}

function createCamera(): { camera: VehicleCamera; target: THREE.Object3D } {
  const host = document.createElement('div')
  const camera = new VehicleCamera(TEST_CAMERA_CONFIG, host)
  const target = new THREE.Object3D()
  target.position.set(1, 2, 3)
  camera.setTarget(target)
  return { camera, target }
}

describe('VehicleCamera', () => {
  it('keeps manual camera framing after idle time passes', () => {
    const { camera } = createCamera()
    const manualPosition = new THREE.Vector3(10, 8, 6)
    camera.camera.position.copy(manualPosition)

    camera.tick(1)

    expect(camera.camera.position.x).toBeCloseTo(manualPosition.x)
    expect(camera.camera.position.y).toBeCloseTo(manualPosition.y)
    expect(camera.camera.position.z).toBeCloseTo(manualPosition.z)
    camera.dispose()
  })

  it('resets to chase framing only when requested', () => {
    const { camera, target } = createCamera()
    camera.camera.position.set(10, 8, 6)

    camera.resetToIdle()

    const expected = target.position.clone().add(TEST_CAMERA_CONFIG.idleOffset)
    expect(camera.camera.position.x).toBeCloseTo(expected.x)
    expect(camera.camera.position.y).toBeCloseTo(expected.y)
    expect(camera.camera.position.z).toBeCloseTo(expected.z)
    camera.dispose()
  })
})
