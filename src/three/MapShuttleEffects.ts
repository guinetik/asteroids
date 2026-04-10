import type { Tickable } from '@/lib/Tickable'
import { MAP_VIEW_CONTROLLER_CONFIG as MAP_CONFIG } from '@/lib/map/mapViewControllerConfig'
import { ParticleEmitter } from '@/three/ParticleEmitter'
import { TemperatureEffectController } from '@/three/TemperatureEffectController'
import { ThrusterEffectController } from '@/three/ThrusterEffectController'
import { ShuttleController } from '@/three/ShuttleController'
import type { MapSceneObjects } from '@/three/MapSceneSetup'
import * as THREE from 'three'

export class MapShuttleEffects {
  readonly thrusterController: ThrusterEffectController
  readonly temperatureEffects: TemperatureEffectController
  readonly explosionEmitter: ParticleEmitter

  constructor(sceneObjects: MapSceneObjects, shuttleController: ShuttleController) {
    this.thrusterController = new ThrusterEffectController(shuttleController)
    sceneObjects.scene.add(this.thrusterController.thrustPoints)
    sceneObjects.scene.add(this.thrusterController.brakePoints)
    sceneObjects.scene.add(this.thrusterController.rcsPoints)

    this.temperatureEffects = new TemperatureEffectController()
    shuttleController.group.add(this.temperatureEffects.fireEmitter.points)
    shuttleController.group.add(this.temperatureEffects.frostEmitter.points)

    this.explosionEmitter = new ParticleEmitter({
      poolSize: 200,
      color: new THREE.Color(0xff6622),
      size: Math.max(1, 6 * MAP_CONFIG.MAP_SHUTTLE_SCALE),
      lifetime: 1.5,
      spread: 8 * MAP_CONFIG.MAP_SHUTTLE_SCALE,
      opacity: 0.9,
    })
    sceneObjects.scene.add(this.explosionEmitter.points)
  }

  getTickables(): Tickable[] {
    return [this.thrusterController, this.temperatureEffects, this.explosionEmitter]
  }

  setTemperature(temperature: number): void {
    this.temperatureEffects.setTemperature(temperature)
  }

  emitExplosion(position: THREE.Vector3, count: number = 150): void {
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.5,
        (Math.random() - 0.5) * 2,
      ).multiplyScalar(MAP_CONFIG.MAP_SHUTTLE_SCALE * 3)
      this.explosionEmitter.emit(position, dir)
    }
  }

  dispose(): void {
    this.thrusterController.dispose()
    this.temperatureEffects.dispose()
  }
}
