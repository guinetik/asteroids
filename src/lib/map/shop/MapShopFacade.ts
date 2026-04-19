import {
  buyTradeGood,
  createShopSession,
  LANDER_FUEL_COST,
  LANDER_FUEL_ID,
  REFUEL_COST,
  REPAIR_COST,
  RESERVE_FUEL_COST,
  RESERVE_FUEL_ID,
  sellTradeGood,
  tickShopSession,
} from '@/lib/shop/shopSession'
import type { ShopSession } from '@/lib/shop/tradeTypes'
import type { PlayerProfile } from '@/lib/player/types'
import type { Inventory } from '@/lib/inventory/types'
import { addItem } from '@/lib/inventory/inventory'
import { spendCredits } from '@/lib/player/profile'

/** Planet trade shop session, fuel/repair purchases, and HUD callbacks. */
export class MapShopFacade {
  session: ShopSession | null = null
  dialogOpen = false

  tick(dt: number): void {
    if (this.session) {
      this.session = tickShopSession(this.session, dt)
    }
  }

  updateOrbitState(params: {
    orbitState: string
    targetName: string | null
    targetPlanetId: string | null
    onShopButton: ((visible: boolean, planetName: string) => void) | null
    onShopState:
      | ((session: ShopSession | null, profile: PlayerProfile, inventory: Inventory) => void)
      | null
    profile: PlayerProfile
    inventory: Inventory
  }): { openedPlanetId: string | null } {
    const { orbitState, targetName, targetPlanetId, onShopButton, onShopState, profile, inventory } =
      params

    if (orbitState === 'orbiting' && targetName && targetPlanetId && !this.session) {
      this.session = createShopSession(targetPlanetId)
      onShopButton?.(true, targetName)
      return { openedPlanetId: targetPlanetId }
    }

    if (orbitState !== 'orbiting' && this.session) {
      this.session = null
      this.dialogOpen = false
      onShopButton?.(false, '')
      onShopState?.(null, profile, inventory)
    }

    return { openedPlanetId: null }
  }

  emitState(
    onShopState:
      | ((session: ShopSession | null, profile: PlayerProfile, inventory: Inventory) => void)
      | null,
    profile: PlayerProfile,
    inventory: Inventory,
  ): void {
    onShopState?.(this.dialogOpen ? this.session : null, profile, inventory)
  }

  open(onShopState: ((session: ShopSession | null, profile: PlayerProfile, inventory: Inventory) => void) | null, profile: PlayerProfile, inventory: Inventory): void {
    if (!this.session) return
    this.dialogOpen = true
    this.emitState(onShopState, profile, inventory)
  }

  close(): void {
    this.dialogOpen = false
  }

  clear(
    onShopButton: ((visible: boolean, planetName: string) => void) | null,
    onShopState:
      | ((session: ShopSession | null, profile: PlayerProfile, inventory: Inventory) => void)
      | null,
    profile: PlayerProfile,
    inventory: Inventory,
  ): void {
    this.session = null
    this.dialogOpen = false
    onShopButton?.(false, '')
    onShopState?.(null, profile, inventory)
  }

  buyTradeGood(
    slotIndex: number,
    quantity: number,
    profile: PlayerProfile,
    inventory: Inventory,
  ): { ok: boolean; profile: PlayerProfile; inventory: Inventory } {
    if (!this.session) return { ok: false, profile, inventory }
    const result = buyTradeGood(this.session, profile, inventory, slotIndex, quantity)
    if (!result.ok) return { ok: false, profile, inventory }
    this.session = result.session
    return { ok: true, profile: result.profile, inventory: result.inventory }
  }

  sellTradeGood(
    itemId: string,
    quantity: number,
    profile: PlayerProfile,
    inventory: Inventory,
  ): { ok: boolean; profile: PlayerProfile; inventory: Inventory } {
    if (!this.session) return { ok: false, profile, inventory }
    const result = sellTradeGood(this.session, profile, inventory, itemId, quantity)
    if (!result.ok) return { ok: false, profile, inventory }
    return { ok: true, profile: result.profile, inventory: result.inventory }
  }

  refuel(profile: PlayerProfile): { ok: boolean; profile: PlayerProfile } {
    const updated = spendCredits(profile, REFUEL_COST)
    if (!updated) return { ok: false, profile }
    return { ok: true, profile: updated }
  }

  buyReserveFuel(
    profile: PlayerProfile,
    inventory: Inventory,
  ): { ok: boolean; profile: PlayerProfile; inventory: Inventory } {
    if (!this.session) return { ok: false, profile, inventory }
    const updated = spendCredits(profile, RESERVE_FUEL_COST)
    if (!updated) return { ok: false, profile, inventory }
    const addResult = addItem(inventory, RESERVE_FUEL_ID, 1)
    if (!addResult.ok) return { ok: false, profile, inventory }
    return { ok: true, profile: updated, inventory: addResult.inventory }
  }

  buyLanderFuel(
    profile: PlayerProfile,
    inventory: Inventory,
  ): { ok: boolean; profile: PlayerProfile; inventory: Inventory } {
    if (!this.session) return { ok: false, profile, inventory }
    const updated = spendCredits(profile, LANDER_FUEL_COST)
    if (!updated) return { ok: false, profile, inventory }
    const addResult = addItem(inventory, LANDER_FUEL_ID, 1)
    if (!addResult.ok) return { ok: false, profile, inventory }
    return { ok: true, profile: updated, inventory: addResult.inventory }
  }

  repairHull(profile: PlayerProfile): { ok: boolean; profile: PlayerProfile } {
    const updated = spendCredits(profile, REPAIR_COST)
    if (!updated) return { ok: false, profile }
    return { ok: true, profile: updated }
  }
}
