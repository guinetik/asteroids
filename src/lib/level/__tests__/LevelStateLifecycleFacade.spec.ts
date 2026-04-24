import { describe, expect, it, vi } from 'vitest'
import { Group, PerspectiveCamera } from 'three'
import { LevelStateLifecycleFacade } from '../LevelStateLifecycleFacade'

describe('LevelStateLifecycleFacade', () => {
  it('enters and exits lander runtime with tick/camera choreography', () => {
    const facade = new LevelStateLifecycleFacade()
    const tickHandler = { register: vi.fn(), unregister: vi.fn() }
    const sceneManager = { setCamera: vi.fn(), setActiveCamera: vi.fn() }
    const postProcessing = { setCamera: vi.fn() }

    const vehicleCamera = {
      controls: { enabled: false },
      camera: new PerspectiveCamera(),
    }
    const landerController = {
      flameEmitter: { reset: vi.fn() },
      rcsEmitters: new Map([['a', { reset: vi.fn() }]]),
    }
    const landerExplosion = {}

    const scene = {
      tickHandler: tickHandler as any,
      sceneManager: sceneManager as any,
      postProcessing: postProcessing as any,
      priorities: { physics: 100, render: 300 },
    }
    const lander = {
      landerController: landerController as any,
      vehicleCamera: vehicleCamera as any,
      landerExplosion: landerExplosion as any,
    }

    facade.enterLander(scene, lander)
    expect(tickHandler.register).toHaveBeenCalledTimes(3)
    expect(vehicleCamera.controls.enabled).toBe(true)
    expect(sceneManager.setCamera).toHaveBeenCalledWith(vehicleCamera)
    expect(sceneManager.setActiveCamera).toHaveBeenCalledWith(null)
    expect(postProcessing.setCamera).toHaveBeenCalledWith(vehicleCamera.camera)

    facade.exitLander(scene, lander)
    expect(tickHandler.unregister).toHaveBeenCalledTimes(3)
    expect(vehicleCamera.controls.enabled).toBe(false)
    expect(landerController.flameEmitter.reset).toHaveBeenCalledTimes(1)
    expect(landerController.rcsEmitters.get('a')?.reset).toHaveBeenCalledTimes(1)
  })

  it('exits EVA and dead runtime while preserving fps camera registration on dead', () => {
    const facade = new LevelStateLifecycleFacade()
    const tickHandler = { register: vi.fn(), unregister: vi.fn() }
    const scene = {
      tickHandler: tickHandler as any,
      sceneManager: { setCamera: vi.fn(), setActiveCamera: vi.fn() } as any,
      postProcessing: { setCamera: vi.fn() } as any,
      priorities: { physics: 100, render: 300 },
    }

    const eva = {
      playerController: { group: new Group() } as any,
      fpsCamera: { helmetLightRig: { visible: true } } as any,
      multiToolState: {} as any,
      multiTool: { setVisible: vi.fn() } as any,
      projectileSystem: {} as any,
      impactEmitter: {} as any,
      tractorEmitter: {} as any,
      surfaceRocks: {} as any,
      onClearRockTarget: vi.fn(),
    }

    facade.exitEva(scene, eva)
    expect(eva.playerController.group.visible).toBe(false)
    expect(eva.fpsCamera.helmetLightRig.visible).toBe(false)
    expect(eva.onClearRockTarget).toHaveBeenCalledTimes(1)

    tickHandler.unregister.mockClear()
    facade.enterDead(scene, eva)
    // dead path unregisters everything except fpsCamera
    expect(tickHandler.unregister).not.toHaveBeenCalledWith(eva.fpsCamera)
    expect(eva.multiTool.setVisible).toHaveBeenCalledWith(false)
  })
})
