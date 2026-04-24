import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { MapBloomController, type MapBloomHost } from '../MapBloomController'
import {
  EVA_MAP_BLOOM_STRENGTH,
  EVA_MAP_BLOOM_THRESHOLD,
  MAP_BLOOM_STRENGTH,
  MAP_BLOOM_THRESHOLD,
  MAP_CAMERA_LIGHT_BASE_INTENSITY,
  MAP_INSPECT_BLOOM_STRENGTH,
  MAP_INSPECT_BLOOM_THRESHOLD,
  ORBIT_BLOOM_CLAMP_OVERSCALE_END,
  ORBIT_BLOOM_CLAMP_OVERSCALE_START,
  ORBIT_BLOOM_CLAMP_STRENGTH,
  ORBIT_BLOOM_CLAMP_THRESHOLD,
} from '@/lib/map/eva/evaMapConstants'

/** Minimal composer stub — the controller only reads `.passes`. */
function buildHost(): { host: MapBloomHost; bloomPass: UnrealBloomPass; cameraLight: THREE.Light } {
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.5, 0.3, 0.2)
  bloomPass.threshold = 0.3
  bloomPass.strength = 0.5
  const cameraLight = new THREE.PointLight(0xffffff, MAP_CAMERA_LIGHT_BASE_INTENSITY)
  const host = {
    composer: { passes: [bloomPass] } as unknown as MapBloomHost['composer'],
    cameraLight,
  }
  return { host, bloomPass, cameraLight }
}

describe('MapBloomController.setEvaOverride', () => {
  it('snapshots and replaces bloom on EVA enter, then restores on exit', () => {
    const { host, bloomPass } = buildHost()
    const controller = new MapBloomController(host)

    controller.setEvaOverride(true)
    expect(bloomPass.threshold).toBeCloseTo(EVA_MAP_BLOOM_THRESHOLD, 5)
    expect(bloomPass.strength).toBeCloseTo(EVA_MAP_BLOOM_STRENGTH, 5)
    expect(controller.isEvaOverrideActive).toBe(true)

    controller.setEvaOverride(false)
    expect(bloomPass.threshold).toBeCloseTo(0.3, 5)
    expect(bloomPass.strength).toBeCloseTo(0.5, 5)
    expect(controller.isEvaOverrideActive).toBe(false)
  })

  it('is idempotent — repeated enter() keeps the original snapshot', () => {
    const { host, bloomPass } = buildHost()
    const controller = new MapBloomController(host)
    controller.setEvaOverride(true)
    bloomPass.threshold = 99 // simulate noise while EVA is active
    controller.setEvaOverride(true) // should NOT overwrite the original snapshot with 99
    controller.setEvaOverride(false)
    expect(bloomPass.threshold).toBeCloseTo(0.3, 5)
  })

  it('exit without a prior enter is a no-op', () => {
    const { host, bloomPass } = buildHost()
    const controller = new MapBloomController(host)
    controller.setEvaOverride(false)
    expect(bloomPass.threshold).toBeCloseTo(0.3, 5)
    expect(bloomPass.strength).toBeCloseTo(0.5, 5)
  })
})

describe('MapBloomController.applyOrbitClamp', () => {
  let ctx: ReturnType<typeof buildHost>
  let controller: MapBloomController

  beforeEach(() => {
    ctx = buildHost()
    controller = new MapBloomController(ctx.host)
  })

  it('returns bloom to the normal base below the clamp start overscale', () => {
    controller.applyOrbitClamp({ overscale: ORBIT_BLOOM_CLAMP_OVERSCALE_START - 0.01, inspectMode: false })
    expect(ctx.bloomPass.threshold).toBeCloseTo(MAP_BLOOM_THRESHOLD, 5)
    expect(ctx.bloomPass.strength).toBeCloseTo(MAP_BLOOM_STRENGTH, 5)
    expect(ctx.cameraLight.intensity).toBeCloseTo(MAP_CAMERA_LIGHT_BASE_INTENSITY, 5)
  })

  it('uses the inspect base when inspect mode is on', () => {
    controller.applyOrbitClamp({ overscale: 0.5, inspectMode: true })
    expect(ctx.bloomPass.threshold).toBeCloseTo(MAP_INSPECT_BLOOM_THRESHOLD, 5)
    expect(ctx.bloomPass.strength).toBeCloseTo(MAP_INSPECT_BLOOM_STRENGTH, 5)
  })

  it('saturates at the clamp max when overscale is past the end point', () => {
    controller.applyOrbitClamp({ overscale: ORBIT_BLOOM_CLAMP_OVERSCALE_END + 1, inspectMode: false })
    expect(ctx.bloomPass.threshold).toBeCloseTo(ORBIT_BLOOM_CLAMP_THRESHOLD, 5)
    expect(ctx.bloomPass.strength).toBeCloseTo(ORBIT_BLOOM_CLAMP_STRENGTH, 5)
    expect(ctx.cameraLight.intensity).toBeCloseTo(0, 5)
  })

  it('is skipped while the EVA override is active', () => {
    controller.setEvaOverride(true)
    controller.applyOrbitClamp({ overscale: ORBIT_BLOOM_CLAMP_OVERSCALE_END + 1, inspectMode: false })
    // Still at EVA override values.
    expect(ctx.bloomPass.threshold).toBeCloseTo(EVA_MAP_BLOOM_THRESHOLD, 5)
    expect(ctx.bloomPass.strength).toBeCloseTo(EVA_MAP_BLOOM_STRENGTH, 5)
  })
})

describe('MapBloomController.setRawBloom', () => {
  it('writes threshold + strength directly to the pass', () => {
    const ctx = buildHost()
    const controller = new MapBloomController(ctx.host)
    controller.setRawBloom(1.23, 0.11)
    expect(ctx.bloomPass.threshold).toBeCloseTo(1.23, 5)
    expect(ctx.bloomPass.strength).toBeCloseTo(0.11, 5)
  })

  it('is a safe no-op when no host is attached', () => {
    const controller = new MapBloomController(null)
    expect(() => controller.setRawBloom(1, 2)).not.toThrow()
  })
})
