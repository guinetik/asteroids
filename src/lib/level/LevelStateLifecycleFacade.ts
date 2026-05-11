/**
 * Shared state enter/exit runtime choreography for the level controller.
 *
 * Focused on tick registration, camera routing, and view-model visibility for
 * lander/EVA/dead transitions. Gameplay semantics (mission announce, pointer
 * lock, audio, overlays) remain owned by {@link views.LevelViewController}.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
import type { Tickable } from '@/lib/Tickable'
import type { TickHandler } from '@/lib/TickHandler'
import type { SceneManager } from '@/three/SceneManager'
import type { LevelPostProcessing } from '@/three/atmosphere/LevelPostProcessing'
import type { LanderController } from '@/three/LanderController'
import type { VehicleCamera } from '@/three/VehicleCamera'
import type { LanderExplosion } from '@/three/LanderExplosion'
import type { FpsPlayerController } from '@/three/FpsPlayerController'
import type { FpsCamera } from '@/three/FpsCamera'
import type { MultiToolController } from '@/three/MultiToolController'
import type { MultiToolState } from '@/lib/fps/multiToolState'
import type { ProjectileSystem } from '@/lib/fps/projectileSystem'
import type { ParticleEmitter } from '@/three/ParticleEmitter'
import type { SurfaceRockController } from '@/three/controllers/SurfaceRockController'

/** Priority bundle for state runtime tick registration. */
export interface LevelStateLifecyclePriorities {
  /** Base physics priority. */
  physics: number
  /** Base render priority. */
  render: number
}

/** Shared scene dependencies needed by lifecycle transitions. */
export interface LevelStateLifecycleSceneDeps {
  /** Global tick registry. */
  tickHandler: TickHandler
  /** Scene/camera owner. */
  sceneManager: SceneManager
  /** Optional post-processing wrapper that tracks active camera. */
  postProcessing: LevelPostProcessing | null
  /** Tick priorities used by this runtime bundle. */
  priorities: LevelStateLifecyclePriorities
}

/** Lander runtime dependencies for enter/exit choreography. */
export interface LevelLanderLifecycleDeps {
  /** Lander controller. */
  landerController: LanderController
  /** Third-person vehicle camera wrapper. */
  vehicleCamera: VehicleCamera
  /** Lander explosion effect. */
  landerExplosion: LanderExplosion
}

/** EVA runtime dependencies for enter/exit choreography. */
export interface LevelEvaLifecycleDeps {
  /** FPS player controller. */
  playerController: FpsPlayerController
  /** FPS camera wrapper. */
  fpsCamera: FpsCamera
  /** Multi-tool runtime state. */
  multiToolState: MultiToolState
  /** Multi-tool view-model controller. */
  multiTool: MultiToolController
  /** Projectile simulation. */
  projectileSystem: ProjectileSystem
  /** Shared impact emitter. */
  impactEmitter: ParticleEmitter
  /** Optional tractor emitter. */
  tractorEmitter: ParticleEmitter | null
  /** Optional surface-rock flash tickable. */
  surfaceRocks: SurfaceRockController | null
  /** Clear current HUD rock-target when leaving EVA/entering dead. */
  onClearRockTarget: () => void
}

/**
 * Encapsulates repetitive enter/exit state runtime choreography.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export class LevelStateLifecycleFacade {
  /**
   * Enter lander runtime: register lander tickables and route active camera.
   *
   * @param scene - Scene + tick dependencies.
   * @param lander - Lander runtime dependencies.
   */
  enterLander(scene: LevelStateLifecycleSceneDeps, lander: LevelLanderLifecycleDeps): void {
    scene.tickHandler.register(lander.landerController, scene.priorities.physics)
    scene.tickHandler.register(lander.vehicleCamera, scene.priorities.render - 2)
    scene.tickHandler.register(lander.landerExplosion, scene.priorities.physics + 3)
    lander.vehicleCamera.controls.enabled = true
    scene.sceneManager.setCamera(lander.vehicleCamera)
    scene.sceneManager.setActiveCamera(null)
    if (scene.postProcessing) {
      scene.postProcessing.setCamera(lander.vehicleCamera.camera)
    }
  }

  /**
   * Exit lander runtime: unregister lander tickables and stop leftover thruster particles.
   *
   * @param scene - Scene + tick dependencies.
   * @param lander - Lander runtime dependencies.
   */
  exitLander(scene: LevelStateLifecycleSceneDeps, lander: LevelLanderLifecycleDeps): void {
    scene.tickHandler.unregister(lander.landerController)
    scene.tickHandler.unregister(lander.vehicleCamera)
    scene.tickHandler.unregister(lander.landerExplosion)
    lander.vehicleCamera.controls.enabled = false
    lander.landerController.flameEmitter.reset()
    for (const emitter of lander.landerController.rcsEmitters.values()) {
      emitter.reset()
    }
  }

  /**
   * Enter EVA runtime: show FPS view-model, register EVA tickables, and switch camera.
   *
   * @param scene - Scene + tick dependencies.
   * @param eva - EVA runtime dependencies.
   */
  enterEva(scene: LevelStateLifecycleSceneDeps, eva: LevelEvaLifecycleDeps): void {
    eva.playerController.group.visible = true
    eva.multiTool.setVisible(true)

    scene.tickHandler.register(eva.playerController, scene.priorities.physics)
    scene.tickHandler.register(eva.multiToolState, scene.priorities.physics + 1)
    scene.tickHandler.register(eva.projectileSystem, scene.priorities.physics + 2)
    scene.tickHandler.register(eva.impactEmitter, scene.priorities.physics + 3)
    this.registerOptional(scene.tickHandler, eva.tractorEmitter, scene.priorities.physics + 3)
    this.registerOptional(scene.tickHandler, eva.surfaceRocks, scene.priorities.physics + 3)
    scene.tickHandler.register(eva.fpsCamera, scene.priorities.render - 2)
    scene.tickHandler.register(eva.multiTool, scene.priorities.render - 2)
    eva.fpsCamera.setHelmetLit(true)

    eva.fpsCamera.setTarget(eva.playerController.group)
    scene.sceneManager.setActiveCamera(eva.fpsCamera.camera)
    scene.sceneManager.setCamera(null)
    if (scene.postProcessing) {
      scene.postProcessing.setCamera(eva.fpsCamera.camera)
    }
  }

  /**
   * Exit EVA runtime: hide FPS view-model and unregister EVA tickables.
   *
   * @param scene - Scene + tick dependencies.
   * @param eva - EVA runtime dependencies.
   */
  exitEva(scene: LevelStateLifecycleSceneDeps, eva: LevelEvaLifecycleDeps): void {
    eva.playerController.group.visible = false
    eva.multiTool.setVisible(false)

    scene.tickHandler.unregister(eva.playerController)
    scene.tickHandler.unregister(eva.multiToolState)
    scene.tickHandler.unregister(eva.projectileSystem)
    scene.tickHandler.unregister(eva.impactEmitter)
    this.unregisterOptional(scene.tickHandler, eva.tractorEmitter)
    this.unregisterOptional(scene.tickHandler, eva.surfaceRocks)
    eva.onClearRockTarget()
    scene.tickHandler.unregister(eva.fpsCamera)
    scene.tickHandler.unregister(eva.multiTool)
    eva.fpsCamera.setHelmetLit(false)
  }

  /**
   * Enter dead runtime from EVA: keeps FPS camera active but stops player/tool simulation.
   *
   * @param scene - Scene + tick dependencies.
   * @param eva - EVA runtime dependencies.
   */
  enterDead(scene: LevelStateLifecycleSceneDeps, eva: LevelEvaLifecycleDeps): void {
    scene.tickHandler.unregister(eva.playerController)
    scene.tickHandler.unregister(eva.multiToolState)
    scene.tickHandler.unregister(eva.projectileSystem)
    scene.tickHandler.unregister(eva.impactEmitter)
    this.unregisterOptional(scene.tickHandler, eva.tractorEmitter)
    this.unregisterOptional(scene.tickHandler, eva.surfaceRocks)
    eva.onClearRockTarget()
    scene.tickHandler.unregister(eva.multiTool)
    eva.fpsCamera.setHelmetLit(false)
    eva.multiTool.setVisible(false)
  }

  /**
   * Register an optional tickable if present.
   *
   * @param tickHandler - Tick registry.
   * @param tickable - Optional runtime tickable.
   * @param priority - Tick priority slot.
   */
  private registerOptional(
    tickHandler: TickHandler,
    tickable: Tickable | null,
    priority: number,
  ): void {
    if (!tickable) return
    tickHandler.register(tickable, priority)
  }

  /**
   * Unregister an optional tickable if present.
   *
   * @param tickHandler - Tick registry.
   * @param tickable - Optional runtime tickable.
   */
  private unregisterOptional(tickHandler: TickHandler, tickable: Tickable | null): void {
    if (!tickable) return
    tickHandler.unregister(tickable)
  }
}
