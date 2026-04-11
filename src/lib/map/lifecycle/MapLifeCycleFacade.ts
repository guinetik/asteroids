import * as THREE from 'three'
import type { PlayerProfile } from '@/lib/player/types'
import type { Inventory } from '@/lib/inventory/types'
import type { ShipHealth } from '@/lib/shipHealth'
import type { VehicleCamera } from '@/three/VehicleCamera'
import { MAP_DEATH_CAMERA_CONFIG } from '@/three/VehicleCamera'
import type { ShuttleController } from '@/three/ShuttleController'
import type { PlanetSystemController } from '@/three/controllers/PlanetSystemController'
import type { MapSceneVisuals } from '@/three/MapSceneVisuals'
import type { MapShuttleEffects } from '@/three/MapShuttleEffects'
import type { EmissiveMaterial } from '@/lib/map/mapViewControllerHelpers'
import type { MapOrbitFacade } from '@/lib/map/orbit/MapOrbitFacade'
import { useAudio } from '@/audio/useAudio'

interface TriggerDeathDeps {
  shuttleController: ShuttleController
  shuttleEffects: MapShuttleEffects | null
  vehicleCamera: VehicleCamera | null
  onDeathOverlay: ((visible: boolean, cause: string) => void) | null
  isEmissiveMaterial: (material: THREE.Material) => material is EmissiveMaterial
}

interface RespawnDeps {
  shuttleController: ShuttleController
  vehicleCamera: VehicleCamera | null
  sceneVisuals: MapSceneVisuals | null
  shipHealth: ShipHealth | null
  orbitFacade: MapOrbitFacade
  earthController: PlanetSystemController | null
  isEmissiveMaterial: (material: THREE.Material) => material is EmissiveMaterial
}

export class MapLifeCycleFacade {
  /**
   * Snapshot profile and replace hold contents after a map death.
   * Credits are preserved; inventory is rebuilt by `createRespawnInventory` (starter fuel only).
   */
  buildRespawnPlayerState(
    playerProfile: PlayerProfile,
    createRespawnInventory: () => Inventory,
  ): { playerProfile: PlayerProfile; playerInventory: Inventory } {
    return {
      playerProfile: { ...playerProfile },
      playerInventory: createRespawnInventory(),
    }
  }

  triggerDeath(cause: string, deps: TriggerDeathDeps): void {
    const { shuttleController, shuttleEffects, vehicleCamera, onDeathOverlay, isEmissiveMaterial } =
      deps
    const isCold = cause === 'Hull Frozen' || cause === 'Adrift'

    if (isCold) {
      shuttleController.group.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !child.material) return
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        for (const material of materials) {
          if (!isEmissiveMaterial(material)) continue
          material.emissive.set(0x4488ff)
          material.emissiveIntensity = 0.6
        }
      })
    } else {
      shuttleEffects?.emitExplosion(shuttleController.position.clone())
      shuttleController.group.visible = false
    }

    shuttleController.setInputEnabled(false)
    shuttleController.freeze()
    vehicleCamera?.setConfig(MAP_DEATH_CAMERA_CONFIG)
    onDeathOverlay?.(true, cause)

    // Cut all in-flight sounds immediately — sfx (thrusters, slingshot, etc.)
    // and the anomaly ambient which may still be looping if the event hadn't expired.
    const audio = useAudio()
    audio.stopCategory('sfx')
    audio.stopSound('ambient.anomaly')
  }

  respawnAtEarth({
    shuttleController,
    vehicleCamera,
    sceneVisuals,
    shipHealth,
    orbitFacade,
    earthController,
    isEmissiveMaterial,
  }: RespawnDeps): boolean {
    if (!earthController) return false

    shuttleController.resetDeath()
    shuttleController.group.visible = true
    shuttleController.group.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) return
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of materials) {
        if (!isEmissiveMaterial(material) || material.emissiveIntensity <= 0) continue
        material.emissive.set(0x000000)
        material.emissiveIntensity = 0
      }
    })
    shuttleController.freeze()
    shuttleController.setInputEnabled(false)

    orbitFacade.beginForcedOrbit(earthController.getWorldX(), earthController.getWorldZ(), {
      shuttleController,
      vehicleCamera,
      sceneVisuals,
    })

    shipHealth?.reset()
    return true
  }
}
