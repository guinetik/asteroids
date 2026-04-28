/**
 * Unit tests for bunker enemy visual palette variants.
 *
 * @author guinetik
 * @date 2026-04-28
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { Enemy } from '@/lib/fps/enemy'
import { BacteriophageController } from '@/three/BacteriophageController'
import { ChimeraWalkerController } from '@/three/ChimeraWalkerController'
import { SpireController } from '@/three/SpireController'

const CYAN_SILHOUETTE = 0x00d8f0
const MAGENTA_FEATURE = 0xff3dad
const AMBER_SILHOUETTE = 0xffa629
const MEDIUM_CYAN_FEATURE = 0x00ffcc
const HARD_MAGENTA_SILHOUETTE = 0xb000ff
const HARD_AMBER_FEATURE = 0xff9d00
const RED_FEATURE = 0xff2200

describe('enemy visual palettes', () => {
  it('uses cyan silhouettes with magenta features for default corona enemies', () => {
    const spire = new SpireController(createEnemy(), { visualTier: 'default' })

    expect(shaderColors(spire.group)).toEqual(
      expect.arrayContaining([CYAN_SILHOUETTE, MAGENTA_FEATURE]),
    )

    spire.dispose()
  })

  it('uses amber silhouettes with cyan features for medium bunker variants', () => {
    const phage = new BacteriophageController(createEnemy(), { visualTier: 'medium' })

    expect(shaderColors(phage.group)).toEqual(
      expect.arrayContaining([AMBER_SILHOUETTE, MEDIUM_CYAN_FEATURE]),
    )

    phage.dispose()
  })

  it('uses magenta-violet silhouettes with amber features for hard bunker variants', () => {
    const phage = new BacteriophageController(createEnemy(), { visualTier: 'hard' })

    expect(shaderColors(phage.group)).toEqual(
      expect.arrayContaining([HARD_MAGENTA_SILHOUETTE, HARD_AMBER_FEATURE]),
    )

    phage.dispose()
  })

  it('keeps the default walker cyan with red feature accents', () => {
    const chimera = new ChimeraWalkerController(createEnemy(), { visualTier: 'default' })

    expect(shaderColors(chimera.group)).toEqual(expect.arrayContaining([CYAN_SILHOUETTE]))
    expect(basicMaterialColors(chimera.group)).toEqual(expect.arrayContaining([RED_FEATURE]))

    chimera.dispose()
  })
})

/**
 * Create a bare enemy entity for visual-controller tests.
 */
function createEnemy(): Enemy {
  return new Enemy({ maxHp: 100, hitRadius: 1 })
}

/**
 * Collect TRON shader primary colors from an object tree.
 *
 * @param root - Root object to inspect.
 */
function shaderColors(root: THREE.Object3D): number[] {
  const colors: number[] = []
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      if (!(material instanceof THREE.ShaderMaterial)) continue
      const color = material.uniforms['uColor']?.value
      if (color instanceof THREE.Color) colors.push(color.getHex())
    }
  })
  return colors
}

/**
 * Collect basic material colors from an object tree.
 *
 * @param root - Root object to inspect.
 */
function basicMaterialColors(root: THREE.Object3D): number[] {
  const colors: number[] = []
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      if (material instanceof THREE.MeshBasicMaterial) colors.push(material.color.getHex())
    }
  })
  return colors
}
