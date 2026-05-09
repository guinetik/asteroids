/**
 * Cosmetics catalog validation + shipped counts vs design spec.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-30-pimp-my-shuttle-shop-design.md
 */
import { describe, expect, it } from 'vitest'
import {
  parseCosmeticShopCatalog,
  getCosmeticOptions,
  getPimpMyShuttleConfig,
  listAllCosmeticOptions,
} from '@/lib/cosmetics/catalog'
import { isPimpMyShuttleAvailable } from '@/lib/cosmetics/availability'
import type { CosmeticShopCatalog } from '@/lib/cosmetics/types'
import shippedCatalog from '@/data/cosmetics/pimp-my-shuttle.json'

function countCategory(catalog: CosmeticShopCatalog, category: string): number {
  return catalog.options.filter((o) => o.category === category).length
}

describe('cosmetics catalog', () => {
  it('parses shipped JSON with configured planet ids + premium tuning', () => {
    const config = getPimpMyShuttleConfig()
    expect(config.availablePlanetIds).toEqual(['mars', 'jupiter', 'saturn'])
    expect(config.premiumTrade.minimumPipBonus).toBe(2)
    expect(config.premiumTrade.visitMargin.minMultiplier).toBeGreaterThan(1)
    expect(config.premiumTrade.visitMargin.maxMultiplier).toBeGreaterThan(
      config.premiumTrade.visitMargin.minMultiplier,
    )
  })

  it('exposes expected option counts for each category', () => {
    const catalog = parseCosmeticShopCatalog(shippedCatalog as unknown)
    expect(countCategory(catalog, 'shuttle-paintjob')).toBe(7)
    expect(countCategory(catalog, 'lander-paintjob')).toBe(5)
    expect(countCategory(catalog, 'shuttle-thruster-trail')).toBe(4)
    expect(countCategory(catalog, 'lander-thruster-trail')).toBe(4)
    expect(countCategory(catalog, 'multitool-paintjob')).toBe(4)
    expect(countCategory(catalog, 'habitat-interior')).toBe(7)
    expect(countCategory(catalog, 'shuttle-title')).toBe(1)
    expect(countCategory(catalog, 'vehicle-flag')).toBeGreaterThanOrEqual(13)

    expect(listAllCosmeticOptions().length).toBe(catalog.options.length)
  })

  it('rejects malformed gradient stops', () => {
    expect(() =>
      parseCosmeticShopCatalog({
        id: 'x',
        label: 'x',
        theme: 'magenta',
        availablePlanetIds: ['mars'],
        premiumTrade: {
          acceptedCategories: ['trade-good'],
          minimumPipBonus: 2,
          visitMargin: { minMultiplier: 1.1, maxMultiplier: 1.2 },
        },
        options: [
          {
            id: 'bad',
            category: 'shuttle-paintjob',
            label: 'Bad',
            description: 'x',
            price: 1,
            gradientStops: ['#ffffff', '#gggggg'],
          },
        ],
      }),
    ).toThrow(/must match #rrggbb/)
  })

  it('rejects negative prices', () => {
    expect(() =>
      parseCosmeticShopCatalog({
        id: 'x',
        label: 'x',
        theme: 'magenta',
        availablePlanetIds: ['mars'],
        premiumTrade: {
          acceptedCategories: ['trade-good'],
          minimumPipBonus: 2,
          visitMargin: { minMultiplier: 1.1, maxMultiplier: 1.2 },
        },
        options: [
          {
            id: 'bad-price',
            category: 'shuttle-paintjob',
            label: 'Bad',
            description: 'x',
            price: -1,
            gradientStops: ['#ffffff', '#000000'],
          },
        ],
      }),
    ).toThrow(/price on 'bad-price'/)
  })

  it('flags eligible cosmetic shop planets', () => {
    expect(isPimpMyShuttleAvailable('mars')).toBe(true)
    expect(isPimpMyShuttleAvailable('jupiter')).toBe(true)
    expect(isPimpMyShuttleAvailable('saturn')).toBe(true)
    expect(isPimpMyShuttleAvailable('earth')).toBe(false)
    expect(isPimpMyShuttleAvailable('venus')).toBe(false)
  })

  it('parses optional finish profile blocks on shuttle paintjobs', () => {
    const catalog = parseCosmeticShopCatalog(shippedCatalog as unknown)
    const neonComet = catalog.options.find((o) => o.id === 'shuttle-paintjob-neon-comet')
    expect(neonComet?.finish?.default?.metalness).toBeCloseTo(0.65, 3)
    expect(neonComet?.finish?.trim?.roughness).toBeCloseTo(0.18, 3)
    expect(neonComet?.finish?.accent?.emissive).toBe('#ff44ff')
    const factoryStock = catalog.options.find(
      (o) => o.id === 'shuttle-paintjob-factory-stock',
    )
    expect(factoryStock?.finish).toBeUndefined()
  })

  it('parses engine-channel finish blocks on lander paintjobs', () => {
    const catalog = parseCosmeticShopCatalog(shippedCatalog as unknown)
    const dustAngel = catalog.options.find((o) => o.id === 'lander-paintjob-dust-angel')
    expect(dustAngel?.finish?.default?.roughness).toBeGreaterThan(0)
    expect(dustAngel?.finish?.engine?.emissive).toMatch(/^#[0-9a-f]{6}$/i)
    expect((dustAngel?.finish?.engine?.emissiveIntensity ?? 0) > 0).toBe(true)
    expect(dustAngel?.finish?.rim?.color).toMatch(/^#[0-9a-f]{6}$/i)
    const landerFactoryStock = catalog.options.find(
      (o) => o.id === 'lander-paintjob-factory-stock',
    )
    expect(landerFactoryStock?.finish).toBeUndefined()
  })

  it('rejects out-of-range metalness in finish profile', () => {
    expect(() =>
      parseCosmeticShopCatalog({
        id: 'x',
        label: 'x',
        theme: 'magenta',
        availablePlanetIds: ['mars'],
        premiumTrade: {
          acceptedCategories: ['trade-good'],
          minimumPipBonus: 2,
          visitMargin: { minMultiplier: 1.1, maxMultiplier: 1.2 },
        },
        options: [
          {
            id: 'bad-finish',
            category: 'shuttle-paintjob',
            label: 'Bad',
            description: 'x',
            price: 1,
            gradientStops: ['#ffffff', '#000000'],
            finish: { default: { metalness: 1.5 } },
          },
        ],
      }),
    ).toThrow(/finish\.default\.metalness must be a number in \[0, 1\]/)
  })

  it('rejects malformed emissive hex in finish profile', () => {
    expect(() =>
      parseCosmeticShopCatalog({
        id: 'x',
        label: 'x',
        theme: 'magenta',
        availablePlanetIds: ['mars'],
        premiumTrade: {
          acceptedCategories: ['trade-good'],
          minimumPipBonus: 2,
          visitMargin: { minMultiplier: 1.1, maxMultiplier: 1.2 },
        },
        options: [
          {
            id: 'bad-emissive',
            category: 'shuttle-paintjob',
            label: 'Bad',
            description: 'x',
            price: 1,
            gradientStops: ['#ffffff', '#000000'],
            finish: { accent: { emissive: 'not-hex' } },
          },
        ],
      }),
    ).toThrow(/finish\.accent\.emissive must match #rrggbb/)
  })

  it('parses optional rim block on shuttle paintjobs', () => {
    const catalog = parseCosmeticShopCatalog(shippedCatalog as unknown)
    const voidChrome = catalog.options.find(
      (o) => o.id === 'shuttle-paintjob-void-chrome',
    )
    expect(voidChrome?.finish?.rim?.color).toBe('#a78bfa')
    expect(typeof voidChrome?.finish?.rim?.intensity).toBe('number')
    expect((voidChrome?.finish?.rim?.intensity ?? -1) >= 0).toBe(true)
    expect((voidChrome?.finish?.rim?.power ?? 0) > 0).toBe(true)
    const factoryStock = catalog.options.find(
      (o) => o.id === 'shuttle-paintjob-factory-stock',
    )
    expect(factoryStock?.finish?.rim).toBeUndefined()
  })

  it('rejects out-of-range rim bias', () => {
    expect(() =>
      parseCosmeticShopCatalog({
        id: 'x',
        label: 'x',
        theme: 'magenta',
        availablePlanetIds: ['mars'],
        premiumTrade: {
          acceptedCategories: ['trade-good'],
          minimumPipBonus: 2,
          visitMargin: { minMultiplier: 1.1, maxMultiplier: 1.2 },
        },
        options: [
          {
            id: 'bad-rim',
            category: 'shuttle-paintjob',
            label: 'Bad',
            description: 'x',
            price: 1,
            gradientStops: ['#ffffff', '#000000'],
            finish: { rim: { bias: 1.5 } },
          },
        ],
      }),
    ).toThrow(/finish\.rim\.bias must be a number in \[-1, 1\]/)
  })

  it('rejects negative rim intensity', () => {
    expect(() =>
      parseCosmeticShopCatalog({
        id: 'x',
        label: 'x',
        theme: 'magenta',
        availablePlanetIds: ['mars'],
        premiumTrade: {
          acceptedCategories: ['trade-good'],
          minimumPipBonus: 2,
          visitMargin: { minMultiplier: 1.1, maxMultiplier: 1.2 },
        },
        options: [
          {
            id: 'bad-rim-intensity',
            category: 'shuttle-paintjob',
            label: 'Bad',
            description: 'x',
            price: 1,
            gradientStops: ['#ffffff', '#000000'],
            finish: { rim: { intensity: -0.1 } },
          },
        ],
      }),
    ).toThrow(/finish\.rim\.intensity must be a non-negative number/)
  })
})

describe('getCosmeticOptions', () => {
  it('returns rows for shuttle paint tab', () => {
    const rows = getCosmeticOptions('shuttle-paintjob')
    expect(rows.length).toBe(7)
    expect(rows[0]?.price).toBe(0)
    expect(rows[0]?.id).toContain('factory')
  })
})
