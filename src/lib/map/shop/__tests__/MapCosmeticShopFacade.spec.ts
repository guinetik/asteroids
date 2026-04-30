/**
 * Orbit-bound lifecycle for magenta cosmetic kiosk + premium multiplier roll context.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-30-pimp-my-shuttle-shop-design.md
 */
import { describe, expect, it } from 'vitest'
import type { PremiumTradeSession } from '@/lib/cosmetics/types'
import type { Inventory } from '@/lib/inventory/types'
import { createInventory } from '@/lib/inventory/inventory'
import { createProfile } from '@/lib/player/profile'
import type { PlayerProfile } from '@/lib/player/types'
import { MapCosmeticShopFacade } from '@/lib/map/shop/MapCosmeticShopFacade'

const ROLL_MARS_FIRST_VISIT = 1.25
const ROLL_MARS_IGNORED_ON_REPEAT = 2
const ROLL_MARS_SWITCH_OUT = 1.05
const ROLL_JUPITER_FRESH = 1.9
const ROLL_TRANSIT_PLACEHOLDER = 1.12
const ROLL_AFTER_CLEAR = 1.99
const ROLL_EMIT_DIALOG = 1.33
const ROLL_CLEAR_RESET = 1.41

describe('MapCosmeticShopFacade', () => {
  const profile = createProfile('Cosmetics Map')
  const inventory = createInventory()

  function marsOrbit(multiplierRoll: () => number) {
    return {
      orbitState: 'orbiting' as const,
      targetName: 'Mars',
      targetPlanetId: 'mars',
      onCosmeticShopButton: (_visible: boolean, _planetName: string): void => {},
      onCosmeticShopState: null as
        | ((
            session: PremiumTradeSession | null,
            snapshot: PlayerProfile,
            cargo: Inventory,
          ) => void)
        | null,
      profile,
      inventory,
      rollPremiumMultiplier: multiplierRoll,
    }
  }

  it('rolls a premium multiplier once per fresh eligible planet visit', () => {
    const facade = new MapCosmeticShopFacade()
    const first = facade.updateOrbitState(marsOrbit(() => ROLL_MARS_FIRST_VISIT))
    expect(first.openedEligiblePlanetId).toBe('mars')
    expect(facade.premiumSession?.premiumMultiplier).toBe(ROLL_MARS_FIRST_VISIT)

    const secondSameOrbit = facade.updateOrbitState(marsOrbit(() => ROLL_MARS_IGNORED_ON_REPEAT))
    expect(secondSameOrbit.openedEligiblePlanetId).toBeNull()
    expect(facade.premiumSession?.premiumMultiplier).toBe(ROLL_MARS_FIRST_VISIT)
  })

  it('rolls a new multiplier after switching magenta planets', () => {
    const facade = new MapCosmeticShopFacade()
    facade.updateOrbitState(marsOrbit(() => ROLL_MARS_SWITCH_OUT))

    const jupiterSweep = facade.updateOrbitState({
      ...marsOrbit(() => ROLL_JUPITER_FRESH),
      targetPlanetId: 'jupiter',
      targetName: 'Jupiter',
    })

    expect(jupiterSweep.openedEligiblePlanetId).toBe('jupiter')
    expect(facade.premiumSession?.planetId).toBe('jupiter')
    expect(facade.premiumSession?.premiumMultiplier).toBe(ROLL_JUPITER_FRESH)
  })

  it('clears the session when orbit leaves magenta eligibility', () => {
    const facade = new MapCosmeticShopFacade()
    facade.updateOrbitState(marsOrbit(() => ROLL_TRANSIT_PLACEHOLDER))
    facade.updateOrbitState({
      ...marsOrbit(() => ROLL_TRANSIT_PLACEHOLDER),
      orbitState: 'transit',
      targetPlanetId: null,
      targetName: null,
    })
    expect(facade.premiumSession).toBeNull()

    facade.updateOrbitState(marsOrbit(() => ROLL_AFTER_CLEAR))
    expect(facade.premiumSession?.premiumMultiplier).toBe(ROLL_AFTER_CLEAR)
  })

  it('emits rolled sessions only while the magenta dialog stays open', () => {
    const facade = new MapCosmeticShopFacade()
    facade.updateOrbitState(marsOrbit(() => ROLL_EMIT_DIALOG))

    let emitted: PremiumTradeSession | null | undefined

    facade.emitState((session) => {
      emitted = session
    }, profile, inventory)
    expect(emitted ?? null).toBeNull()

    facade.open((session) => {
      emitted = session
    }, profile, inventory)

    expect(emitted?.premiumMultiplier).toBe(ROLL_EMIT_DIALOG)

    facade.close()

    facade.emitState((session) => {
      emitted = session
    }, profile, inventory)
    expect(emitted ?? null).toBeNull()
  })

  it('hard-resets dialogs, callbacks, and session context', () => {
    const facade = new MapCosmeticShopFacade()

    facade.updateOrbitState(marsOrbit(() => ROLL_CLEAR_RESET))
    facade.open(() => {}, profile, inventory)

    let buttonDismissed = false
    let stateCleared = false
    facade.clear(
      (visible, _name) => {
        if (!visible) buttonDismissed = true
      },
      (session, _prof, _inv) => {
        if (session === null) stateCleared = true
      },
      profile,
      inventory,
    )

    expect(buttonDismissed).toBe(true)
    expect(stateCleared).toBe(true)
    expect(facade.premiumSession).toBeNull()
    expect(facade.dialogOpen).toBe(false)
  })
})
