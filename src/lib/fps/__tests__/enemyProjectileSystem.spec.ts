import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EnemyProjectileSystem } from '../enemyProjectileSystem'

describe('EnemyProjectileSystem', () => {
  let system: EnemyProjectileSystem

  beforeEach(() => {
    system = new EnemyProjectileSystem()
  })

  it('should spawn a projectile', () => {
    system.spawn(0, 5, 0, 1, 0, 0, 30, 10)
    expect(system.projectileCount).toBe(1)
  })

  it('should move projectiles along their direction', () => {
    const onMove = vi.fn()
    system.onProjectileMove = onMove
    system.spawn(0, 5, 0, 1, 0, 0, 30, 10)
    system.tick(0.1)
    expect(onMove).toHaveBeenCalled()
    const [_id, x] = onMove.mock.calls[0]!
    expect(x).toBeCloseTo(3, 0)
  })

  it('should fire onPlayerHit when projectile reaches player', () => {
    const onHit = vi.fn()
    system.onPlayerHit = onHit
    system.setPlayerPosition(5, 5, 0)
    system.spawn(0, 5, 0, 1, 0, 0, 100, 10)
    system.tick(0.1)
    expect(onHit).toHaveBeenCalledWith(10, 0, 0)
  })

  it('should NOT hit player when projectile is far away', () => {
    const onHit = vi.fn()
    system.onPlayerHit = onHit
    system.setPlayerPosition(100, 5, 100)
    system.spawn(0, 5, 0, 1, 0, 0, 30, 10)
    system.tick(0.1)
    expect(onHit).not.toHaveBeenCalled()
  })

  it('should remove projectile after hitting player', () => {
    system.onPlayerHit = vi.fn()
    system.setPlayerPosition(3, 5, 0)
    system.spawn(0, 5, 0, 1, 0, 0, 100, 10)
    system.tick(0.1)
    expect(system.projectileCount).toBe(0)
  })

  it('should expire projectiles after max lifetime', () => {
    system.spawn(0, 5, 0, 1, 0, 0, 30, 10)
    system.tick(5)
    expect(system.projectileCount).toBe(0)
  })

  it('should fire onProjectileRemoved when projectile expires', () => {
    const onRemove = vi.fn()
    system.onProjectileRemoved = onRemove
    system.spawn(0, 5, 0, 1, 0, 0, 30, 10)
    system.tick(5)
    expect(onRemove).toHaveBeenCalled()
  })

  it('should clear all projectiles on dispose', () => {
    system.spawn(0, 5, 0, 1, 0, 0, 30, 10)
    system.spawn(10, 5, 0, -1, 0, 0, 30, 10)
    system.dispose()
    expect(system.projectileCount).toBe(0)
  })
})
