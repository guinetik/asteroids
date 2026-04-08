import { describe, expect, it } from 'vitest'
import { ShaderMaterial } from 'three'
import { ThrusterWashController } from '../atmosphere/ThrusterWashController'

describe('ThrusterWashController', () => {
  it('renders wash dust as world-sized particles so it stays visible near rough terrain', () => {
    const wash = new ThrusterWashController([0.5, 0.48, 0.38])
    const material = wash.dustEmitter.points.material as ShaderMaterial

    expect(material.vertexShader).toContain('(300.0 / -mvPosition.z)')
  })

  it('uses a denser, smaller, grayer dust configuration for wash particles', () => {
    const wash = new ThrusterWashController([0.5, 0.48, 0.38])
    const material = wash.dustEmitter.points.material as ShaderMaterial
    const positionAttr = wash.dustEmitter.points.geometry.getAttribute('position')
    const baseSize = material.uniforms['uBaseSize']!.value as number
    const opacity = material.uniforms['uOpacity']!.value as number
    const color = material.uniforms['uColor']!.value as { x: number; y: number; z: number }

    expect(positionAttr.count).toBeGreaterThan(200)
    expect(baseSize).toBeLessThan(2.5)
    expect(opacity).toBeGreaterThan(0.35)
    expect(Math.max(color.x, color.y, color.z) - Math.min(color.x, color.y, color.z)).toBeLessThan(0.08)
  })
})
