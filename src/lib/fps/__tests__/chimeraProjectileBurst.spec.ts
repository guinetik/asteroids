import { describe, expect, it, vi } from 'vitest'
import { spawnChimeraProjectileBurst } from '../chimeraProjectileBurst'

describe('spawnChimeraProjectileBurst', () => {
  it('schedules three projectiles in quick succession along the aim direction', () => {
    const spawnBurst = vi.fn()

    spawnChimeraProjectileBurst({
      originX: 0,
      originY: 2,
      originZ: 0,
      targetX: 0,
      targetY: 2,
      targetZ: 10,
      projectileSpeed: 18,
      projectileDamage: 7,
      spawnBurst,
    })

    expect(spawnBurst).toHaveBeenCalledOnce()
    expect(spawnBurst.mock.calls[0]).toEqual([0, 2, 0, 0, 0, 1, 18, 7, 3, 0.06])
  })
})
