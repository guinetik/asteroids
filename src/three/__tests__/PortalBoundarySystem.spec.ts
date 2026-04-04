import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { PortalBoundarySystem } from '../PortalBoundarySystem'

describe('PortalBoundarySystem', () => {
  it('creates 4 walls', () => {
    const pos = new THREE.Vector3(0, 0, 0)
    const system = new PortalBoundarySystem(4000, pos, () => ({}))
    expect(system.walls).toHaveLength(4)
  })

  it('walls are invisible when shuttle is at center', () => {
    const pos = new THREE.Vector3(0, 0, 0)
    const system = new PortalBoundarySystem(4000, pos, () => ({}))
    system.tick(0.016)

    for (const wall of system.walls) {
      const mat = wall.material as THREE.LineBasicMaterial
      expect(mat.opacity).toBe(0)
    }
  })

  it('wall fades in when shuttle is within visibility distance', () => {
    const pos = new THREE.Vector3(1700, 0, 0) // 300 units from east wall (x=2000)
    const system = new PortalBoundarySystem(4000, pos, () => ({}))
    system.tick(0.016)

    // East wall (x=+2000) should be visible
    const eastWall = system.walls.find((w) => {
      const mesh = w as THREE.LineSegments
      return mesh.position.x === 2000
    })!
    const mat = eastWall.material as THREE.LineBasicMaterial
    expect(mat.opacity).toBeGreaterThan(0)
  })

  it('calls onDepart when shuttle crosses boundary', () => {
    const pos = new THREE.Vector3(2001, 0, 0) // past east wall
    const onDepart = vi.fn()
    const system = new PortalBoundarySystem(4000, pos, () => ({ speed: 50 }))
    system.onDepart = onDepart
    system.tick(0.016)

    expect(onDepart).toHaveBeenCalledOnce()
    expect(onDepart).toHaveBeenCalledWith({ speed: 50 })
  })

  it('does not call onDepart when shuttle is inside bounds', () => {
    const pos = new THREE.Vector3(1999, 0, 0) // just inside
    const onDepart = vi.fn()
    const system = new PortalBoundarySystem(4000, pos, () => ({ speed: 50 }))
    system.onDepart = onDepart
    system.tick(0.016)

    expect(onDepart).not.toHaveBeenCalled()
  })

  it('detects crossing on all 4 axes', () => {
    const crossings = [
      new THREE.Vector3(2001, 0, 0),
      new THREE.Vector3(-2001, 0, 0),
      new THREE.Vector3(0, 0, 2001),
      new THREE.Vector3(0, 0, -2001),
    ]

    for (const crossPos of crossings) {
      const onDepart = vi.fn()
      const system = new PortalBoundarySystem(4000, crossPos, () => ({}))
      system.onDepart = onDepart
      system.tick(0.016)
      expect(onDepart).toHaveBeenCalledOnce()
    }
  })
})
