import type { Tickable } from '@/lib/Tickable'
import type { VibeJamParams } from '@/lib/portal'
import { AmbientSpaceController } from '@/three/AmbientSpaceController'
import { PortalBoundarySystem } from '@/three/PortalBoundarySystem'
import type { MapSceneObjects } from '@/three/MapSceneSetup'
import * as THREE from 'three'

/** Wires ambient lighting and portal boundaries around the shuttle play space. */
export interface MapSceneEnvironmentOptions {
  sceneObjects: MapSceneObjects
  shuttleGroup: THREE.Group
  shuttlePosition: THREE.Vector3
  camera: THREE.PerspectiveCamera
  boundarySize: number
  getShuttleState: () => Partial<VibeJamParams>
}

/** Ambient space fill + boundary walls for the Vibe Jam asteroid arena. */
export class MapSceneEnvironment {
  readonly ambientSpace: AmbientSpaceController
  readonly boundarySystem: PortalBoundarySystem

  constructor(options: MapSceneEnvironmentOptions) {
    const { sceneObjects, shuttleGroup, shuttlePosition, camera, boundarySize, getShuttleState } =
      options

    this.ambientSpace = new AmbientSpaceController(sceneObjects.scene)
    this.ambientSpace.attach(shuttleGroup)
    this.ambientSpace.setCamera(camera)

    this.boundarySystem = new PortalBoundarySystem(boundarySize, shuttlePosition, getShuttleState)
    for (const wall of this.boundarySystem.walls) {
      sceneObjects.scene.add(wall)
    }
  }

  getTickables(): Tickable[] {
    return [this.ambientSpace, this.boundarySystem]
  }

  setAmbientActive(active: boolean): void {
    this.ambientSpace.setActive(active)
  }

  setMapIntroSuppressed(suppressed: boolean): void {
    this.ambientSpace.setMapIntroSuppressed(suppressed)
  }

  toggleAmbient(): boolean {
    return this.ambientSpace.toggle()
  }

  get ambientVisible(): boolean {
    return this.ambientSpace.isVisible
  }

  dispose(): void {
    this.ambientSpace.dispose()
    this.boundarySystem.dispose()
  }
}
