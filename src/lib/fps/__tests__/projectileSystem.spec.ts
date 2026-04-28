import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { ProjectileSystem, SCIENCE_ENEMY_FREEZE_SECONDS } from '../projectileSystem'
import { Heightmap } from '@/lib/terrain/heightmap'
import { Enemy } from '../enemy'

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

  it('applies the science enemy effect only on the first hit per enemy', () => {
    const scene = new THREE.Scene()
    const heightmap = new Heightmap(4, 100)
    const system = new ProjectileSystem(scene, heightmap)
    const enemy = new Enemy({ maxHp: 100, hitRadius: 2 })
    const onEnemyHit = vi.fn()

    enemy.position.set(20, 0, 0)
    system.addEnemy(enemy)
    system.setTerrainCollisionEnabled(false)
    system.onEnemyHit = onEnemyHit

    system.spawn(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Color(0xffffff),
      'science',
    )
    system.tick(0.11)

    expect(onEnemyHit).toHaveBeenCalledWith(enemy, expect.any(THREE.Vector3), 'science', true)
    expect(enemy.frozen).toBe(true)
    expect(enemy.hp).toBe(100)

    system.spawn(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Color(0xffffff),
      'science',
    )
    system.tick(0.11)

    expect(onEnemyHit).toHaveBeenLastCalledWith(enemy, expect.any(THREE.Vector3), 'science', false)
    enemy.tickStatus(SCIENCE_ENEMY_FREEZE_SECONDS)
    expect(enemy.frozen).toBe(false)
  })
})
