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

  it('exposes cat-food listing only on Earth and Mars', () => {
    const facade = new MapShopFacade()
    const profile = createProfile('Test')
    const inventory = createInventory()

    const openAt = (planetId: string, name: string): readonly string[] => {
      facade.updateOrbitState({
        orbitState: 'free',
        targetName: null,
        targetPlanetId: null,
        onShopButton: () => {},
        onShopState: () => {},
        profile,
        inventory,
      })
      facade.updateOrbitState({
        orbitState: 'orbiting',
        targetName: name,
        targetPlanetId: planetId,
        onShopButton: () => {},
        onShopState: () => {},
        profile,
        inventory,
      })
      return facade.availableListings.map((l) => l.itemId)
    }

    expect(openAt('earth', 'Earth')).toContain('cat-food')
    expect(openAt('mars', 'Mars')).toContain('cat-food')
    expect(openAt('jupiter', 'Jupiter')).not.toContain('cat-food')
  })

  it('keeps universal listings (no allowlist) available everywhere', () => {
    const facade = new MapShopFacade()
    const profile = createProfile('Test')
    const inventory = createInventory()

    facade.updateOrbitState({
      orbitState: 'orbiting',
      targetName: 'Jupiter',
      targetPlanetId: 'jupiter',
      onShopButton: () => {},
      onShopState: () => {},
      profile,
      inventory,
    })
    const ids = facade.availableListings.map((l) => l.itemId)
    expect(ids).toContain('shuttle-fuel-cell')
    expect(ids).toContain('fuel-cell')
  })
})
