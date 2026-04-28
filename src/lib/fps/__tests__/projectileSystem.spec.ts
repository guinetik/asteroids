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

  describe('DAN neutron particle cascade', () => {
    function setupSystem(): { system: ProjectileSystem; scene: THREE.Scene } {
      const scene = new THREE.Scene()
      const heightmap = new Heightmap(4, 100)
      const system = new ProjectileSystem(scene, heightmap)
      system.setTerrainCollisionEnabled(false)
      return { system, scene }
    }

    it('captures a DAN particle along the SCI bolt path and despawns it', () => {
      const { system } = setupSystem()
      const onScienceDanParticleHit = vi.fn()
      const onScienceRockHit = vi.fn()
      system.onScienceDanParticleHit = onScienceDanParticleHit
      system.onScienceRockHit = onScienceRockHit
      system.addDanParticle({ spawnIndex: 7, cx: 15, cy: 0, cz: 0, radius: 0.7 })

      system.spawn(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 0, 0),
        new THREE.Color(0xffffff),
        'science',
      )
      system.tick(0.11)

      expect(onScienceDanParticleHit).toHaveBeenCalledTimes(1)
      expect(onScienceDanParticleHit).toHaveBeenCalledWith(7, expect.any(THREE.Vector3))
      expect(onScienceRockHit).not.toHaveBeenCalled()
    })

    it('weapon (LASER) bolts pass through DAN particles without firing the callback', () => {
      const { system } = setupSystem()
      const onScienceDanParticleHit = vi.fn()
      system.onScienceDanParticleHit = onScienceDanParticleHit
      system.addDanParticle({ spawnIndex: 1, cx: 15, cy: 0, cz: 0, radius: 0.7 })

      system.spawn(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 0, 0),
        new THREE.Color(0xffffff),
        'weapon',
      )
      system.tick(0.11)

      expect(onScienceDanParticleHit).not.toHaveBeenCalled()
    })

    it('drill bolts pass through DAN particles without firing the callback', () => {
      const { system } = setupSystem()
      const onScienceDanParticleHit = vi.fn()
      system.onScienceDanParticleHit = onScienceDanParticleHit
      system.addDanParticle({ spawnIndex: 2, cx: 15, cy: 0, cz: 0, radius: 0.7 })

      system.spawn(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 0, 0),
        new THREE.Color(0xffffff),
        'drill',
      )
      system.tick(0.11)

      expect(onScienceDanParticleHit).not.toHaveBeenCalled()
    })

    it('hits a DAN particle even when a rock is also along the SCI bolt path', () => {
      const { system } = setupSystem()
      const onScienceDanParticleHit = vi.fn()
      const onScienceRockHit = vi.fn()
      system.onScienceDanParticleHit = onScienceDanParticleHit
      system.onScienceRockHit = onScienceRockHit
      // Particle at 14, rock at 18 — both along the path. Particle wins.
      system.addDanParticle({ spawnIndex: 5, cx: 14, cy: 0, cz: 0, radius: 0.7 })
      system.addRock({ spawnIndex: 99, cx: 18, cy: 0, cz: 0, radius: 1.5 })

      system.spawn(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 0, 0),
        new THREE.Color(0xffffff),
        'science',
      )
      system.tick(0.11)

      expect(onScienceDanParticleHit).toHaveBeenCalledTimes(1)
      expect(onScienceDanParticleHit).toHaveBeenCalledWith(5, expect.any(THREE.Vector3))
      expect(onScienceRockHit).not.toHaveBeenCalled()
    })

    it('removeDanParticle makes subsequent bolts pass through that location', () => {
      const { system } = setupSystem()
      const onScienceDanParticleHit = vi.fn()
      system.onScienceDanParticleHit = onScienceDanParticleHit
      system.addDanParticle({ spawnIndex: 3, cx: 15, cy: 0, cz: 0, radius: 0.7 })
      system.removeDanParticle(3)

      system.spawn(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 0, 0),
        new THREE.Color(0xffffff),
        'science',
      )
      system.tick(0.11)

      expect(onScienceDanParticleHit).not.toHaveBeenCalled()
    })

    it('emits an impact callback with kind=dan_particle on capture', () => {
      const { system } = setupSystem()
      const onImpact = vi.fn()
      system.onImpact = onImpact
      system.addDanParticle({ spawnIndex: 4, cx: 15, cy: 0, cz: 0, radius: 0.7 })

      system.spawn(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 0, 0),
        new THREE.Color(0xffffff),
        'science',
      )
      system.tick(0.11)

      expect(onImpact).toHaveBeenCalledTimes(1)
      const ctx = onImpact.mock.calls[0]![1]
      expect(ctx.boltKind).toBe('science')
      expect(ctx.kind).toBe('dan_particle')
    })
  })
})
