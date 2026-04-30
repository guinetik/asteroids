/**
 * Magenta cosmetics shop kiosk — orbit-bound premium cargo session distinct from yellow trade HUD.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-30-pimp-my-shuttle-shop-design.md
 */
import { createPremiumTradeSession } from '@/lib/cosmetics/premiumTrade'
import type { PremiumTradeSession } from '@/lib/cosmetics/types'
import { isPimpMyShuttleAvailable } from '@/lib/cosmetics/availability'
import type { PlayerProfile } from '@/lib/player/types'
import type { Inventory } from '@/lib/inventory/types'

/** State for P key cosmetic dialog + premium trade roll while orbiting Mars/Jupiter/Saturn. */
export class MapCosmeticShopFacade {
  /** Premium multiplier context for the current eligible orbit visit. */
  premiumSession: PremiumTradeSession | null = null
  /** Whether the magenta dialog is showing. */
  dialogOpen = false
  /** Planet id used to detect planet changes while still eligible. */
  private sessionPlanetKey: string | null = null

  /**
   * Create or clear the premium session when orbit eligibility changes.
   *
   * @param params - Orbit snapshot + UI callbacks.
   * @returns Eligible planet id when a fresh premium roll was created this call.
   */
  updateOrbitState(params: {
    orbitState: string
    targetName: string | null
    targetPlanetId: string | null
    onCosmeticShopButton: ((visible: boolean, planetName: string) => void) | null
    onCosmeticShopState:
      | ((
          session: PremiumTradeSession | null,
          profile: PlayerProfile,
          inventory: Inventory,
        ) => void)
      | null
    profile: PlayerProfile
    inventory: Inventory
    rollPremiumMultiplier?: () => number
  }): { openedEligiblePlanetId: string | null } {
    const {
      orbitState,
      targetName,
      targetPlanetId,
      onCosmeticShopButton,
      onCosmeticShopState,
      profile,
      inventory,
      rollPremiumMultiplier,
    } = params

    const eligible =
      orbitState === 'orbiting' &&
      Boolean(targetPlanetId) &&
      isPimpMyShuttleAvailable(targetPlanetId)

    if (eligible && targetPlanetId) {
      const reopenedNewPlanet = this.sessionPlanetKey !== targetPlanetId
      if (reopenedNewPlanet) {
        this.premiumSession = createPremiumTradeSession(targetPlanetId, rollPremiumMultiplier)
        this.sessionPlanetKey = targetPlanetId
      }
      onCosmeticShopButton?.(true, targetName ?? targetPlanetId)
      return { openedEligiblePlanetId: reopenedNewPlanet ? targetPlanetId : null }
    }

    if (this.sessionPlanetKey !== null || this.premiumSession !== null) {
      this.premiumSession = null
      this.sessionPlanetKey = null
      this.dialogOpen = false
      onCosmeticShopButton?.(false, '')
      onCosmeticShopState?.(null, profile, inventory)
    }

    return { openedEligiblePlanetId: null }
  }

  /**
   * Push the latest profile/inventory into listeners when the dialog should reflect new prices.
   */
  emitState(
    onCosmeticShopState:
      | ((
          session: PremiumTradeSession | null,
          profile: PlayerProfile,
          inventory: Inventory,
        ) => void)
      | null,
    profile: PlayerProfile,
    inventory: Inventory,
  ): void {
    onCosmeticShopState?.(this.dialogOpen ? this.premiumSession : null, profile, inventory)
  }

  /**
   * Open the cosmetic dialog (P key) while a premium session exists.
   */
  open(
    onCosmeticShopState:
      | ((
          session: PremiumTradeSession | null,
          profile: PlayerProfile,
          inventory: Inventory,
        ) => void)
      | null,
    profile: PlayerProfile,
    inventory: Inventory,
  ): void {
    if (!this.premiumSession) return
    this.dialogOpen = true
    this.emitState(onCosmeticShopState, profile, inventory)
  }

  /** Close without clearing the underlying premium visit roll. */
  close(): void {
    this.dialogOpen = false
  }

  /**
   * Hard reset on death / profile rebuild — mirrors {@link MapShopFacade.clear}.
   */
  clear(
    onCosmeticShopButton: ((visible: boolean, planetName: string) => void) | null,
    onCosmeticShopState:
      | ((
          session: PremiumTradeSession | null,
          profile: PlayerProfile,
          inventory: Inventory,
        ) => void)
      | null,
    profile: PlayerProfile,
    inventory: Inventory,
  ): void {
    this.premiumSession = null
    this.sessionPlanetKey = null
    this.dialogOpen = false
    onCosmeticShopButton?.(false, '')
    onCosmeticShopState?.(null, profile, inventory)
  }
}
