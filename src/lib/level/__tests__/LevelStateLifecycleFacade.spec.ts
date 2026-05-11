import { describe, expect, it, vi } from 'vitest'
import { Group, PerspectiveCamera } from 'three'
import { LevelStateLifecycleFacade } from '../LevelStateLifecycleFacade'
import type {
  LevelEvaLifecycleDeps,
  LevelLanderLifecycleDeps,
  LevelStateLifecycleSceneDeps,
} from '../LevelStateLifecycleFacade'

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
      tickHandler: tickHandler as unknown as LevelStateLifecycleSceneDeps['tickHandler'],
      sceneManager: sceneManager as unknown as LevelStateLifecycleSceneDeps['sceneManager'],
      postProcessing: postProcessing as unknown as LevelStateLifecycleSceneDeps['postProcessing'],
      priorities: { physics: 100, render: 300 },
    }
    const lander = {
      landerController: landerController as unknown as LevelLanderLifecycleDeps['landerController'],
      vehicleCamera: vehicleCamera as unknown as LevelLanderLifecycleDeps['vehicleCamera'],
      landerExplosion: landerExplosion as unknown as LevelLanderLifecycleDeps['landerExplosion'],
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
      tickHandler: tickHandler as unknown as LevelStateLifecycleSceneDeps['tickHandler'],
      sceneManager: {
        setCamera: vi.fn(),
        setActiveCamera: vi.fn(),
      } as unknown as LevelStateLifecycleSceneDeps['sceneManager'],
      postProcessing: {
        setCamera: vi.fn(),
      } as unknown as LevelStateLifecycleSceneDeps['postProcessing'],
      priorities: { physics: 100, render: 300 },
    }

    const eva = {
      playerController: {
        group: new Group(),
      } as unknown as LevelEvaLifecycleDeps['playerController'],
      fpsCamera: {
        setHelmetLit: vi.fn(),
      } as unknown as LevelEvaLifecycleDeps['fpsCamera'],
      multiToolState: {} as unknown as LevelEvaLifecycleDeps['multiToolState'],
      multiTool: {
        setVisible: vi.fn(),
      } as unknown as LevelEvaLifecycleDeps['multiTool'],
      projectileSystem: {} as unknown as LevelEvaLifecycleDeps['projectileSystem'],
      impactEmitter: {} as unknown as LevelEvaLifecycleDeps['impactEmitter'],
      tractorEmitter: {} as unknown as LevelEvaLifecycleDeps['tractorEmitter'],
      surfaceRocks: {} as unknown as LevelEvaLifecycleDeps['surfaceRocks'],
      onClearRockTarget: vi.fn(),
    }

    facade.exitEva(scene, eva)
    expect(eva.playerController.group.visible).toBe(false)
    expect(eva.fpsCamera.setHelmetLit).toHaveBeenCalledWith(false)
    expect(eva.onClearRockTarget).toHaveBeenCalledTimes(1)

    tickHandler.unregister.mockClear()
    facade.enterDead(scene, eva)
    // dead path unregisters everything except fpsCamera
    expect(tickHandler.unregister).not.toHaveBeenCalledWith(eva.fpsCamera)
    expect(eva.multiTool.setVisible).toHaveBeenCalledWith(false)
  })
})
