/**
 * Renders an asteroid belt as an InstancedMesh of small icosahedrons.
 * Distributes particles with power-law sizing and Kirkwood gap rejection.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-map-view-design.md
 */
import * as THREE from 'three'
import type { AsteroidBelt } from '@/lib/planets/types'
import { ORBIT_SCALE } from '@/lib/planets/constants'

/** Per-instance data for tumble animation. */
interface ParticleData {
  axis: THREE.Vector3
  speed: number
}

/**
 * Instanced asteroid belt with Kirkwood gap rejection sampling.
 */
export class AsteroidBeltController {
  readonly group: THREE.Group
  private readonly instancedMesh: THREE.InstancedMesh
  private readonly particles: ParticleData[] = []
  private readonly orbitalSpeed: number
  private readonly tmpMatrix = new THREE.Matrix4()
  private readonly tmpQuat = new THREE.Quaternion()

  constructor(belt: AsteroidBelt) {
    this.group = new THREE.Group()
    this.orbitalSpeed = belt.orbitalSpeed

    const geometry = new THREE.IcosahedronGeometry(1, 0)
    const material = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.9,
      metalness: 0.1,
      emissive: belt.emissiveColor
        ? new THREE.Color(belt.emissiveColor[0], belt.emissiveColor[1], belt.emissiveColor[2])
        : new THREE.Color(0x000000),
      emissiveIntensity: belt.emissiveColor ? 0.3 : 0,
    })

    const count = belt.maxParticles
    this.instancedMesh = new THREE.InstancedMesh(geometry, material, count)

    const innerR = belt.innerRadius * ORBIT_SCALE
    const outerR = belt.outerRadius * ORBIT_SCALE
    const [minSize, maxSize] = belt.sizeRange
    const matrix = new THREE.Matrix4()

    for (let i = 0; i < count; i++) {
      // Radius with Kirkwood gap rejection
      let radius: number
      let attempts = 0
      do {
        radius = innerR + Math.random() * (outerR - innerR)
        attempts++
      } while (attempts < 20 && this.isInGap(radius, innerR, outerR, belt))

      // Angle
      const angle = Math.random() * Math.PI * 2

      // Vertical spread (Gaussian-like via Box-Muller)
      const u1 = Math.random()
      const u2 = Math.random()
      const gaussY = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2)
      const height = gaussY * belt.thickness * ORBIT_SCALE * 0.3

      // Size (power-law distribution)
      const sizeT = Math.pow(Math.random(), belt.sizeExponent)
      const size = (minSize + sizeT * (maxSize - minSize)) * ORBIT_SCALE

      // Position
      const x = radius * Math.cos(angle)
      const z = radius * Math.sin(angle)

      matrix.makeScale(size, size, size)
      matrix.setPosition(x, height, z)
      this.instancedMesh.setMatrixAt(i, matrix)

      // Tumble data
      this.particles.push({
        axis: new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5,
        ).normalize(),
        speed: (Math.random() * 0.5 + 0.5) * belt.tumbleSpeed,
      })
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true
    this.group.add(this.instancedMesh)
  }

  tick(dt: number, simTime: number): void {
    // Slow orbital drift
    this.group.rotation.y += this.orbitalSpeed * dt

    // Per-instance tumble
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]!
      this.instancedMesh.getMatrixAt(i, this.tmpMatrix)
      const pos = new THREE.Vector3()
      const scale = new THREE.Vector3()
      this.tmpMatrix.decompose(pos, this.tmpQuat, scale)
      this.tmpQuat.multiply(
        new THREE.Quaternion().setFromAxisAngle(p.axis, p.speed * dt),
      )
      this.tmpMatrix.compose(pos, this.tmpQuat, scale)
      this.instancedMesh.setMatrixAt(i, this.tmpMatrix)
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true
  }

  dispose(): void {
    this.instancedMesh.geometry.dispose()
    ;(this.instancedMesh.material as THREE.Material).dispose()
  }

  private isInGap(radius: number, innerR: number, outerR: number, belt: AsteroidBelt): boolean {
    const normalized = (radius - innerR) / (outerR - innerR)
    for (const gap of belt.kirkwoodGaps) {
      const halfWidth = gap.width / 2
      if (normalized >= gap.position - halfWidth && normalized <= gap.position + halfWidth) {
        return true
      }
    }
    return false
  }
}
