/**
 * Cosmetics purchase rules (CR spend path + ownership shortcuts).
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-30-pimp-my-shuttle-shop-design.md
 */
import { describe, expect, it } from 'vitest'
import { addCredits, createProfile } from '@/lib/player/profile'
import {
  applyOwnedCosmetic,
  purchaseCosmeticOption,
  purchaseShuttleTitle,
} from '@/lib/cosmetics/purchase'
import { getCosmeticOptions, SHUTTLE_TITLE_SERVICE_OPTION_ID } from '@/lib/cosmetics/catalog'
import type { CosmeticPurchaseResult, ShuttleTitlePurchaseResult } from '@/lib/cosmetics/types'
import { getPlayerCosmetics } from '@/lib/cosmetics/profileCosmetics'

type PurchasedCosmetic = Extract<CosmeticPurchaseResult, { ok: true }>
type RenamedShuttle = Extract<ShuttleTitlePurchaseResult, { ok: true }>

describe('cosmetic purchases', () => {
  it('charges credits on first paint unlock and rejects re-applying the active shader', () => {
    const starter = createProfile('Shopper')
    const defaultId = starter.cosmetics!.shuttlePaintjobId
    const target = getCosmeticOptions('shuttle-paintjob').find((row) => row.id !== defaultId)
    expect(target).toBeTruthy()

    let profile = addCredits(starter, 250_000)
    const balanceBefore = profile.credits
    const bought = purchaseCosmeticOption(profile, target!.id)
    expect(bought.ok).toBe(true)
    profile = (bought as PurchasedCosmetic).profile
    expect(profile.credits).toBe(balanceBefore - target!.price)
    expect(profile.achievementStats.lifetimeCreditsSpent).toBeGreaterThanOrEqual(target!.price)

    const redo = purchaseCosmeticOption(profile, target!.id)
    expect(redo).toMatchObject({ ok: false, reason: 'already-active' })
  })

  it('free-applies a previously-owned shuttle paint selection', () => {
    let profile = addCredits(createProfile('Painter'), 250_000)
    const rows = getCosmeticOptions('shuttle-paintjob')
    const starterId = profile.cosmetics!.shuttlePaintjobId
    const other = rows.find((row) => row.id !== starterId)
    expect(other).toBeTruthy()

    const buy = purchaseCosmeticOption(profile, other!.id)
    expect(buy.ok).toBe(true)
    profile = (buy as PurchasedCosmetic).profile
    const creditsAfterBuy = profile.credits

    const revert = applyOwnedCosmetic(profile, starterId)
    expect(revert.ok).toBe(true)
    expect((revert as PurchasedCosmetic).profile.credits).toBe(creditsAfterBuy)
    expect((revert as PurchasedCosmetic).profile.cosmetics!.shuttlePaintjobId).toBe(starterId)
  })
  it('rejects broke profiles without mutating credits', () => {
    const broke = createProfile('Broke')
    const defaultId = broke.cosmetics!.shuttlePaintjobId
    const expensive = getCosmeticOptions('shuttle-paintjob').find(
      (row) => row.price > broke.credits && row.id !== defaultId,
    )
    expect(expensive).toBeTruthy()
    const res = purchaseCosmeticOption(broke, expensive!.id)
    expect(res).toMatchObject({ ok: false, reason: 'insufficient-credits' })
    expect(res.profile.credits).toBe(broke.credits)
  })

  it('charges rename fees only when normalized title changes', () => {
    let profile = addCredits(createProfile('Renamer'), 50_000)
    const first = purchaseShuttleTitle(profile, 'Ion Belle')
    expect(first.ok).toBe(true)
    profile = (first as RenamedShuttle).profile

    const dup = purchaseShuttleTitle(profile, 'Ion Belle')
    expect(dup).toMatchObject({ ok: false, reason: 'already-active' })

    const blank = purchaseShuttleTitle(profile, '   ')
    expect(blank).toMatchObject({ ok: false, reason: 'invalid-title' })
  })

  it('unlocks bundled zero-credit options without debit', () => {
    const rows = getCosmeticOptions('multitool-paintjob')
    const factoryId = rows[0]?.id
    const paidAlternate = rows.find((row) => row.price > 0)
    expect(factoryId).toBeTruthy()
    expect(rows[0]?.price).toBe(0)
    expect(paidAlternate).toBeTruthy()

    let profile = createProfile('ZeroUnlock')
    const baseline = profile.credits

    const strippedCosmetics = {
      ...getPlayerCosmetics(profile),
      ownedOptionIds: getPlayerCosmetics(profile).ownedOptionIds.filter((id) => id !== factoryId),
      multitoolPaintjobId: paidAlternate!.id,
    }

    profile = { ...profile, cosmetics: strippedCosmetics }

    const snag = purchaseCosmeticOption(profile, factoryId!)
    expect(snag.ok).toBe(true)
    profile = (snag as PurchasedCosmetic).profile

    expect(profile.credits).toBe(baseline)
    expect(profile.cosmetics!.ownedOptionIds).toContain(factoryId!)
  })

  it('routes title registry rows away from generic cosmetic purchase', () => {
    const blocked = purchaseCosmeticOption(createProfile('X'), SHUTTLE_TITLE_SERVICE_OPTION_ID)
    expect(blocked).toMatchObject({ ok: false, reason: 'shuttle-title-use-rename' })
  })
})
