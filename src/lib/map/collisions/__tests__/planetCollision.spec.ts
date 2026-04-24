import { describe, it, expect } from 'vitest'
import { findPlanetCollision, type PlanetCollisionSample } from '../planetCollision'
import { SIZE_SCALE } from '@/lib/planets/constants'
import { MAP_SHUTTLE_COLLISION_RADIUS } from '@/lib/map/mapViewControllerConfig'

const earth: PlanetCollisionSample = {
  name: 'Earth',
  displayRadius: 1,
  worldX: 100,
  worldZ: 0,
}

describe('findPlanetCollision', () => {
  it('returns null when the ship is far from every planet', () => {
    expect(findPlanetCollision(0, 0, [earth])).toBeNull()
  })

  it('returns the planet name when the ship is inside the combined radius', () => {
    const hit = findPlanetCollision(100, 0, [earth])
    expect(hit?.planetName).toBe('Earth')
  })

  it('respects SIZE_SCALE when computing the collision radius', () => {
    const collisionRadius = earth.displayRadius * SIZE_SCALE + MAP_SHUTTLE_COLLISION_RADIUS
    // Just inside the boundary → hit.
    expect(findPlanetCollision(100 + collisionRadius * 0.99, 0, [earth])).not.toBeNull()
    // Just outside → miss.
    expect(findPlanetCollision(100 + collisionRadius * 1.01, 0, [earth])).toBeNull()
  })

  it('returns the first colliding planet when multiple overlap', () => {
    const mars: PlanetCollisionSample = { name: 'Mars', displayRadius: 1, worldX: 0, worldZ: 0 }
    const result = findPlanetCollision(0, 0, [mars, earth])
    expect(result?.planetName).toBe('Mars')
  })
})
