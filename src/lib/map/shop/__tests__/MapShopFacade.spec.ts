/**
 * Tests for {@link MapShopFacade} orbit lifecycle — shop session must reset when
 * orbit capture leaves the `orbiting` state so the next body gets a fresh session.
 *
 * @author guinetik
 * @date 2026-04-12
 * @spec docs/superpowers/specs/2026-04-06-planet-shop-system-design.md
 */
import { describe, expect, it } from 'vitest'
import { MapShopFacade } from '@/lib/map/shop/MapShopFacade'
import { createProfile } from '@/lib/player/profile'
import { createInventory } from '@/lib/inventory/inventory'

describe('MapShopFacade', () => {
  it('clears session when leaving orbit so the next planet gets its own shop', () => {
    const facade = new MapShopFacade()
    const profile = createProfile('Test')
    const inventory = createInventory()

    facade.updateOrbitState({
      orbitState: 'orbiting',
      targetName: 'Earth',
      targetPlanetId: 'earth',
      onShopButton: () => {},
      onShopState: () => {},
      profile,
      inventory,
    })
    expect(facade.session?.planetId).toBe('earth')

    facade.updateOrbitState({
      orbitState: 'free',
      targetName: null,
      targetPlanetId: null,
      onShopButton: () => {},
      onShopState: () => {},
      profile,
      inventory,
    })
    expect(facade.session).toBeNull()

    facade.updateOrbitState({
      orbitState: 'orbiting',
      targetName: 'Mars',
      targetPlanetId: 'mars',
      onShopButton: () => {},
      onShopState: () => {},
      profile,
      inventory,
    })
    expect(facade.session?.planetId).toBe('mars')
  })
})
