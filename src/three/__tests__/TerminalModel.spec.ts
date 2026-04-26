import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { TerminalModel } from '@/three/TerminalModel'
import type { WorldAabbCollider } from '@/lib/physics/worldCollision'

describe('TerminalModel', () => {
  it('renders as a tall matte kiosk with a large emissive display', () => {
    const terminal = new TerminalModel()

    const body = terminal.group.getObjectByName('survey-terminal-body') as THREE.Mesh
    const screen = terminal.group.getObjectByName('survey-terminal-screen') as THREE.Mesh
    const frame = terminal.group.getObjectByName('survey-terminal-screen-frame') as THREE.Mesh
    const base = terminal.group.getObjectByName('survey-terminal-base') as THREE.Mesh

    expect(body).toBeInstanceOf(THREE.Mesh)
    expect(screen).toBeInstanceOf(THREE.Mesh)
    expect(frame).toBeInstanceOf(THREE.Mesh)
    expect(base).toBeInstanceOf(THREE.Mesh)

    const bodyGeometry = body.geometry as THREE.BoxGeometry
    const screenGeometry = screen.geometry as THREE.PlaneGeometry
    const bodyMaterial = body.material as THREE.MeshStandardMaterial
    const screenMaterial = screen.material as THREE.MeshStandardMaterial

    expect(bodyGeometry.parameters.height).toBeGreaterThan(6)
    expect(bodyMaterial.metalness).toBeLessThan(0.2)
    expect(bodyMaterial.roughness).toBeGreaterThan(0.75)
    expect(screenGeometry.parameters.height).toBeLessThan(2)
    expect(screenGeometry.parameters.width).toBeLessThan(1.7)
    expect(screenMaterial.emissiveIntensity).toBeGreaterThan(0.7)
    expect(screen.position.y).toBeGreaterThan(4.3)
    expect(screen.position.z).toBeGreaterThan(frame.position.z)
    expect(base.position.y).toBeGreaterThan(0)

    terminal.dispose()
  })

  it('exposes a world-space AABB collider around the kiosk footprint', () => {
    const terminal = new TerminalModel()
    terminal.placeAt(12, 4, -7)

    const collider = terminal.createWorldCollider('terminal-test') as WorldAabbCollider
    const min = typeof collider.min === 'function' ? collider.min() : collider.min
    const max = typeof collider.max === 'function' ? collider.max() : collider.max

    expect(collider.id).toBe('terminal-test')
    expect(collider.kind).toBe('aabb')
    expect(min.x).toBeLessThan(12)
    expect(max.x).toBeGreaterThan(12)
    expect(min.y).toBe(4)
    expect(max.y).toBeGreaterThan(9)
    expect(min.z).toBeLessThan(-7)
    expect(max.z).toBeGreaterThan(-7)

    terminal.dispose()
  })

  it('cycles high-contrast futuristic symbols on the screen', () => {
    const terminal = new TerminalModel()
    const glyph = terminal.group.getObjectByName('survey-terminal-rotating-glyph') as THREE.Group

    expect(glyph).toBeInstanceOf(THREE.Group)
    expect(glyph.children.length).toBeGreaterThan(2)

    const firstSymbol = glyph.children[0]!
    const secondSymbol = glyph.children[1]!
    const ring = firstSymbol.children[0] as THREE.Mesh
    const material = ring.material as THREE.MeshBasicMaterial
    const ringGeometry = ring.geometry as THREE.TorusGeometry
    const beforeRotation = glyph.rotation.z

    expect(firstSymbol.visible).toBe(true)
    expect(secondSymbol.visible).toBe(false)
    expect(material.color.g).toBeLessThan(0.05)
    expect(material.color.b).toBeLessThan(0.2)
    expect(material.opacity).toBe(1)
    expect(material.blending).toBe(THREE.NormalBlending)
    expect(ringGeometry.parameters.tube).toBeGreaterThan(0.03)

    terminal.tick(0.8)

    expect(glyph.rotation.z).toBe(beforeRotation)
    expect(firstSymbol.visible).toBe(false)
    expect(secondSymbol.visible).toBe(true)

    terminal.dispose()
  })
})
