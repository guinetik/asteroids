import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { ProjectileSystem } from '../projectileSystem'
import { Heightmap } from '@/lib/terrain/heightmap'

describe('ProjectileSystem', () => {
  it('does not emit terrain impacts while terrain collision is disabled', () => {
    const scene = new THREE.Scene()
    const heightmap = new Heightmap(4, 100)
    const system = new ProjectileSystem(scene, heightmap)
    const onImpact = vi.fn()
    system.onImpact = onImpact
    system.setTerrainCollisionEnabled(false)

    system.spawn(
      new THREE.Vector3(0, 10, 0),
      new THREE.Vector3(0, -1, 0),
      new THREE.Color(0xffffff),
      'weapon',
    )
    system.tick(0.1)

    expect(onImpact).not.toHaveBeenCalled()
    expect(system.projectileCount).toBe(1)
  })
})
