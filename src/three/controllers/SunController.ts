/**
 * Controls the sun: rotates the star mesh and updates shader time.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-map-view-design.md
 */
import type { SunData } from '@/lib/planets/types'
import { ROTATION_SPEED_DIVISOR } from '@/lib/planets/constants'
import { createSunMesh, type SunMeshResult } from '@/three/meshes/createSunMesh'
import type * as THREE from 'three'

/** Simulation time to shader time divisor (1 year = 365.25 days). */
const SHADER_TIME_DIVISOR = 365.25

/**
 * Manages the sun mesh, point light, and corona sprite.
 * Updates rotation and shader time each frame.
 */
export class SunController {
  private readonly sunResult: SunMeshResult
  private readonly rotationSpeed: number

  constructor(sunData: SunData) {
    this.sunResult = createSunMesh(sunData)
    this.rotationSpeed = sunData.rotationSpeed
  }

  /** The sun's scene group (mesh + light + corona). */
  get group(): THREE.Group {
    return this.sunResult.group
  }

  /** The sun's point light. */
  get light(): THREE.PointLight {
    return this.sunResult.light
  }

  tick(dt: number, simTime: number): void {
    const shaderTime = simTime / SHADER_TIME_DIVISOR

    // Update shader time
    if (this.sunResult.uniforms.uTime) {
      this.sunResult.uniforms.uTime.value = shaderTime
    }

    // Self-rotation
    this.sunResult.mesh.rotation.y = (simTime * 0.05) / ROTATION_SPEED_DIVISOR
  }

  dispose(): void {
    this.sunResult.group.traverse((child) => {
      if ('geometry' in child) {
        (child as THREE.Mesh).geometry?.dispose()
      }
      if ('material' in child) {
        const mat = (child as THREE.Mesh).material
        if (Array.isArray(mat)) {
          mat.forEach(m => m.dispose())
        } else if (mat) {
          (mat as THREE.Material).dispose()
        }
      }
    })
    this.sunResult.coronaTexture.dispose()
  }
}
