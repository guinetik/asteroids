/**
 * Controls a single planet system: the planet mesh, its moons, ring,
 * and orbit lines. Updates Keplerian positions each frame.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-map-view-design.md
 */
import * as THREE from 'three'
import type { Planet, OrbitalElements } from '@/lib/planets/types'
import type { GravitySource } from '@/lib/physics/gravity'
import { orbitalPosition3D } from '@/lib/planets/orbit'
import {
  ORBIT_SCALE,
  SIZE_SCALE,
  ROTATION_SPEED_DIVISOR,
  MOON_ORBIT_SPEED_DIVISOR,
} from '@/lib/planets/constants'
import { createPlanetMesh, type PlanetMeshResult } from '@/three/meshes/createPlanetMesh'
import { createMoonMesh, type MoonMeshResult } from '@/three/meshes/createMoonMesh'
import { createRingMesh } from '@/three/meshes/createRingMesh'
import { createOrbitLine, MOON_ORBIT_OPACITY } from '@/three/meshes/createOrbitLine'

/** Simulation time to shader time divisor. */
const SHADER_TIME_DIVISOR = 365.25

/**
 * Moon orbit semi-major axis scale factor.
 * Moon orbits in the JSON are in the same pixel units as planet displayRadii,
 * so they scale with SIZE_SCALE and are divided by this to fit the scene.
 */
const MOON_ORBIT_SCALE_DIVISOR = 350

/** Internal moon tracking. */
interface MoonEntry {
  meshResult: MoonMeshResult
  orbit: OrbitalElements
}

/**
 * Manages a planet, its moons, optional ring, and orbit lines.
 */
export class PlanetSystemController implements GravitySource {
  /** The moving group (planet + moons + ring). */
  readonly group: THREE.Group

  /** Mass in solar masses (M☉). */
  readonly mass: number

  /** Orbit lines for the planet and moons (added to scene root, not the group). */
  readonly orbitLines: THREE.LineLoop[]

  private readonly planetMesh: PlanetMeshResult
  private readonly planet: Planet
  private readonly scaledOrbit: OrbitalElements
  private readonly moonEntries: MoonEntry[] = []
  private readonly ringUniforms: Record<string, THREE.IUniform> | null = null

  /**
   * @param planet - Planet definition from the catalog
   * @param initialPhase - Optional starting position as fraction of orbit (0-1).
   *   0 = periapsis, 0.5 = opposite side. If omitted, randomized.
   */
  constructor(planet: Planet, initialPhase?: number) {
    this.planet = planet
    this.mass = planet.mass
    this.group = new THREE.Group()
    this.orbitLines = []

    // Planet mesh
    this.planetMesh = createPlanetMesh(planet)
    this.group.add(this.planetMesh.mesh)

    // Scale orbit for scene
    const phase = initialPhase ?? Math.random()
    const epoch = -phase * planet.orbit.period
    this.scaledOrbit = {
      ...planet.orbit,
      semiMajorAxis: planet.orbit.semiMajorAxis * ORBIT_SCALE,
      epoch,
    }

    // Planet orbit line
    const planetOrbitLine = createOrbitLine(this.scaledOrbit)
    this.orbitLines.push(planetOrbitLine)

    // Ring (attached to planet mesh so it tilts with axial tilt)
    if (planet.ring) {
      const ringMesh = createRingMesh(planet.ring, planet.displayRadius)
      this.planetMesh.mesh.add(ringMesh)
      this.ringUniforms = (ringMesh.material as THREE.ShaderMaterial).uniforms
    }

    // Moons
    for (const moon of planet.moons) {
      const meshResult = createMoonMesh(moon)
      this.group.add(meshResult.mesh)

      const moonEpoch = -Math.random() * moon.orbit.period
      const scaledMoonOrbit: OrbitalElements = {
        ...moon.orbit,
        semiMajorAxis: (moon.orbit.semiMajorAxis * SIZE_SCALE) / MOON_ORBIT_SCALE_DIVISOR,
        epoch: moonEpoch,
      }

      // Moon orbit line (relative to planet group)
      const moonOrbitLine = createOrbitLine(scaledMoonOrbit, MOON_ORBIT_OPACITY)
      this.group.add(moonOrbitLine)

      this.moonEntries.push({ meshResult, orbit: scaledMoonOrbit })
    }

    // Set initial position
    const initialPos = orbitalPosition3D(this.scaledOrbit, 0)
    this.group.position.set(initialPos.x, initialPos.z, initialPos.y)
  }

  getWorldX(): number {
    return this.group.position.x
  }

  getWorldZ(): number {
    return this.group.position.z
  }

  /**
   * Compute the world-space position of a moon by its index in the planet's moon array.
   *
   * @param moonIndex - Index into the planet definition's `moons` array
   * @param target - Vector3 to write into (avoids allocation per frame)
   * @returns The target vector, or null if the index is out of range
   *
   * @author guinetik
   * @date 2026-04-09
   */
  getMoonWorldPosition(moonIndex: number, target: THREE.Vector3): THREE.Vector3 | null {
    const entry = this.moonEntries[moonIndex]
    if (!entry) return null
    entry.meshResult.mesh.getWorldPosition(target)
    return target
  }

  tick(dt: number, simTime: number): void {
    const shaderTime = simTime / SHADER_TIME_DIVISOR

    // Orbital position
    const pos = orbitalPosition3D(this.scaledOrbit, simTime)
    this.group.position.set(pos.x, pos.z, pos.y)

    // Self-rotation
    this.planetMesh.mesh.rotation.y =
      (simTime * this.planet.rotationSpeed) / ROTATION_SPEED_DIVISOR

    // Shader time
    if (this.planetMesh.uniforms.uTime) {
      this.planetMesh.uniforms.uTime.value = shaderTime
    }

    // Ring shader time
    if (this.ringUniforms?.uTime) {
      this.ringUniforms.uTime.value = shaderTime
    }

    // Moons
    for (const moon of this.moonEntries) {
      const moonPos = orbitalPosition3D(moon.orbit, simTime / MOON_ORBIT_SPEED_DIVISOR)
      moon.meshResult.mesh.position.set(moonPos.x, moonPos.z, moonPos.y)
      moon.meshResult.mesh.rotation.y = (simTime * 0.15) / ROTATION_SPEED_DIVISOR

      if (moon.meshResult.uniforms.uTime) {
        moon.meshResult.uniforms.uTime.value = shaderTime
      }
    }
  }

  dispose(): void {
    this.planetMesh.dispose()
    const disposeMesh = (obj: THREE.Object3D) => {
      obj.traverse((child) => {
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
    }
    disposeMesh(this.group)
    for (const line of this.orbitLines) {
      line.geometry.dispose()
      ;(line.material as THREE.Material).dispose()
    }
  }
}
