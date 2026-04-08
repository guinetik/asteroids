import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EnemyDirector } from '../enemyDirector'

// Mock the enemy-types.json import
vi.mock('@/data/fps/enemy-types.json', () => ({
  default: {
    bacteriophage: {
      maxHp: 75,
      hitRadius: 1.5,
      speed: 8,
      aggroRadius: 40,
      leashRadius: 60,
      agitateRadius: 10,
      wanderRadius: 15,
      wanderSpeed: 2,
      contactDamage: 15,
      contactRadius: 2.0,
      contactCooldown: 1.0,
    },
  },
}))

describe('EnemyDirector', () => {
  let director: EnemyDirector

  beforeEach(() => {
    director = new EnemyDirector()
  })

  // --- Spawning ---

  it('should spawn an enemy and return a handle', () => {
    const handle = director.spawn('bacteriophage', 10, 0, 10)
    expect(handle).toBeDefined()
    expect(handle.enemy.alive).toBe(true)
    expect(handle.enemy.maxHp).toBe(75)
    expect(handle.type).toBe('bacteriophage')
  })

  it('should assign unique IDs to spawned enemies', () => {
    const h1 = director.spawn('bacteriophage', 0, 0, 0)
    const h2 = director.spawn('bacteriophage', 10, 0, 10)
    expect(h1.id).not.toBe(h2.id)
  })

  it('should give each spawned enemy its own config copy', () => {
    const h1 = director.spawn('bacteriophage', 0, 0, 0)
    const h2 = director.spawn('bacteriophage', 10, 0, 10)

    h1.config.contactDamage = 999

    expect(h2.config.contactDamage).toBe(15)
  })

  it('should track all alive enemies', () => {
    director.spawn('bacteriophage', 0, 0, 0)
    director.spawn('bacteriophage', 10, 0, 10)
    expect(director.enemies.length).toBe(2)
  })

  it('should throw on unknown enemy type', () => {
    expect(() => director.spawn('unknown', 0, 0, 0)).toThrow('Unknown enemy type')
  })

  // --- Despawning ---

  it('should despawn an enemy by handle', () => {
    const handle = director.spawn('bacteriophage', 0, 0, 0)
    director.despawn(handle)
    expect(director.enemies.length).toBe(0)
  })

  it('should despawn all enemies', () => {
    director.spawn('bacteriophage', 0, 0, 0)
    director.spawn('bacteriophage', 10, 0, 10)
    director.despawnAll()
    expect(director.enemies.length).toBe(0)
  })

  // --- Tick + movement ---

  it('should move enemies toward player when in aggro range', () => {
    const handle = director.spawn('bacteriophage', 0, 0, 0)
    director.setPlayerPosition(20, 0, 0)
    director.tick(0.016)
    expect(handle.enemy.position.x).toBeGreaterThan(0)
  })

  it('should NOT move enemies toward player when out of range', () => {
    const handle = director.spawn('bacteriophage', 0, 0, 0)
    director.setPlayerPosition(999, 0, 999)
    const startX = handle.enemy.position.x
    director.tick(0.016)
    const moved = Math.abs(handle.enemy.position.x - startX)
    expect(moved).toBeLessThan(1)
  })

  // --- Contact damage ---

  it('should fire contact damage when player touches enemy', () => {
    const onContact = vi.fn()
    director.onContactDamage = onContact
    const handle = director.spawn('bacteriophage', 0, 0, 0)
    director.setPlayerPosition(0, 0, 0)
    director.tick(0.016)
    expect(onContact).toHaveBeenCalledWith(handle, 15)
  })

  it('should NOT fire contact damage when player is far away', () => {
    const onContact = vi.fn()
    director.onContactDamage = onContact
    director.spawn('bacteriophage', 0, 0, 0)
    director.setPlayerPosition(100, 0, 100)
    director.tick(0.016)
    expect(onContact).not.toHaveBeenCalled()
  })

  it('should NOT fire contact damage when player is vertically separated', () => {
    const onContact = vi.fn()
    director.onContactDamage = onContact
    director.spawn('bacteriophage', 0, 0, 0)
    director.setPlayerPosition(0, 3, 0)
    director.tick(0.016)
    expect(onContact).not.toHaveBeenCalled()
  })

  it('should respect contact cooldown', () => {
    const onContact = vi.fn()
    director.onContactDamage = onContact
    director.spawn('bacteriophage', 0, 0, 0)
    director.setPlayerPosition(0, 0, 0)
    director.tick(0.016)
    director.tick(0.016)
    expect(onContact).toHaveBeenCalledTimes(1)
  })

  it('should fire contact damage again after cooldown expires', () => {
    const onContact = vi.fn()
    director.onContactDamage = onContact
    director.spawn('bacteriophage', 0, 0, 0)
    director.setPlayerPosition(0, 0, 0)
    director.tick(0.016)
    director.tick(1.1)
    expect(onContact).toHaveBeenCalledTimes(2)
  })

  // --- Dead enemies ---

  it('should skip dead enemies during tick', () => {
    const handle = director.spawn('bacteriophage', 0, 0, 0)
    handle.enemy.takeDamage(999)
    director.setPlayerPosition(0, 0, 0)
    const onContact = vi.fn()
    director.onContactDamage = onContact
    director.tick(0.016)
    expect(onContact).not.toHaveBeenCalled()
  })
})
