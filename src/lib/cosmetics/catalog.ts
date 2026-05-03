/**
 * Load and validate `pimp-my-shuttle.json` for the cosmetics shop.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-30-pimp-my-shuttle-shop-design.md
 */

import type {
  CosmeticCategory,
  CosmeticFinishChannel,
  CosmeticFinishProfile,
  CosmeticOptionData,
  CosmeticRim,
  CosmeticShopCatalog,
  CosmeticShopConfig,
} from './types'

import rawCatalog from '@/data/cosmetics/pimp-my-shuttle.json'

const COSMETIC_CATEGORY_SET: ReadonlySet<string> = new Set<string>([
  'shuttle-paintjob',
  'lander-paintjob',
  'shuttle-title',
  'vehicle-flag',
  'shuttle-thruster-trail',
  'lander-thruster-trail',
  'multitool-paintjob',
])

/** Legal CSS hex color `#rrggbb` (validation is case-insensitive). */
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/

/** Channel keys recognised inside a {@link CosmeticFinishProfile}. */
const FINISH_CHANNEL_KEYS = ['default', 'primary', 'secondary', 'trim', 'accent'] as const

/** Numeric finish fields with `0..1` clamping (`metalness`, `roughness`). */
const FINISH_UNIT_FIELDS = ['metalness', 'roughness'] as const

/** Numeric finish fields that only need to be `>= 0` (`envMapIntensity`, `emissiveIntensity`). */
const FINISH_NON_NEGATIVE_FIELDS = ['envMapIntensity', 'emissiveIntensity'] as const

let cachedCatalog: CosmeticShopCatalog | null = null

/**
 * Returns true when value is a finite number strictly greater than zero.
 *
 * @param value - Unknown JSON number.
 */
function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/**
 * Catalog prices may be zero for bundled defaults (factory stock / no pennant).
 *
 * @param value - Unknown JSON number.
 */
function isNonNegativeFiniteCatalogPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/**
 * Returns true when the string looks like a cosmetic category id.
 *
 * @param value - Unknown string candidate.
 */
function isCosmeticCategory(value: string): value is CosmeticCategory {
  return COSMETIC_CATEGORY_SET.has(value)
}

/**
 * Validate premium trade JSON object.
 *
 * @param raw - Unknown `premiumTrade` field.
 */
function parsePremiumTrade(raw: unknown): CosmeticShopCatalog['premiumTrade'] {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('cosmetics catalog: premiumTrade must be an object')
  }
  const p = raw as Record<string, unknown>
  const accepted = p['acceptedCategories']
  if (!Array.isArray(accepted) || accepted.some((c) => typeof c !== 'string' || c.trim() === '')) {
    throw new Error('cosmetics catalog: premiumTrade.acceptedCategories must be a string array')
  }
  const pipBonus = p['minimumPipBonus']
  if (typeof pipBonus !== 'number' || !Number.isInteger(pipBonus) || pipBonus < 0) {
    throw new Error(
      'cosmetics catalog: premiumTrade.minimumPipBonus must be a non-negative integer',
    )
  }
  const margin = p['visitMargin']
  if (margin === null || typeof margin !== 'object' || Array.isArray(margin)) {
    throw new Error('cosmetics catalog: premiumTrade.visitMargin must be an object')
  }
  const m = margin as Record<string, unknown>
  const minM = m['minMultiplier']
  const maxM = m['maxMultiplier']
  if (!isPositiveFiniteNumber(minM) || !isPositiveFiniteNumber(maxM)) {
    throw new Error('cosmetics catalog: visit margin multipliers must be positive finite numbers')
  }
  if (minM > maxM) {
    throw new Error('cosmetics catalog: visitMargin.minMultiplier cannot exceed maxMultiplier')
  }
  if (minM <= 1) {
    throw new Error('cosmetics catalog: premium minMultiplier must be greater than 1')
  }
  return {
    acceptedCategories: accepted as string[],
    minimumPipBonus: pipBonus,
    visitMargin: { minMultiplier: minM, maxMultiplier: maxM },
  }
}

/**
 * Parse and validate a single option row.
 *
 * @param raw - Unknown option object.
 * @param ids - Id set used to detect duplicates while parsing.
 */
function parseOption(raw: unknown, ids: Set<string>): CosmeticOptionData {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('cosmetics catalog: each option must be an object')
  }
  const row = raw as Record<string, unknown>
  const id = row['id']
  const category = row['category']
  const label = row['label']
  const description = row['description']
  const price = row['price']
  const stopsRaw = row['gradientStops']

  if (typeof id !== 'string' || id.trim() === '') throw new Error('cosmetics catalog: option id')
  if (ids.has(id)) throw new Error(`cosmetics catalog: duplicate option id '${id}'`)
  ids.add(id)
  if (typeof category !== 'string' || !isCosmeticCategory(category)) {
    throw new Error(`cosmetics catalog: invalid category on '${id}'`)
  }
  if (typeof label !== 'string' || label.trim() === '')
    throw new Error(`cosmetics catalog: label on '${id}'`)
  if (typeof description !== 'string') throw new Error(`cosmetics catalog: description on '${id}'`)
  if (!isNonNegativeFiniteCatalogPrice(price))
    throw new Error(`cosmetics catalog: price on '${id}'`)
  if (!Array.isArray(stopsRaw) || stopsRaw.length < 2) {
    throw new Error(`cosmetics catalog: gradientStops on '${id}' need at least two colors`)
  }
  const gradientStops = stopsRaw.map((s, idx) => {
    if (typeof s !== 'string' || !HEX_COLOR_RE.test(s)) {
      throw new Error(`cosmetics catalog: gradientStops[${idx}] on '${id}' must match #rrggbb`)
    }
    return s
  })

  const emoji = row['emoji']
  if (emoji !== undefined && typeof emoji !== 'string') {
    throw new Error(`cosmetics catalog: emoji on '${id}' must be a string when set`)
  }

  const finish = parseFinishProfile(row['finish'], id)

  return {
    id,
    category,
    label,
    description,
    price,
    gradientStops,
    ...(emoji !== undefined ? { emoji } : {}),
    ...(finish !== undefined ? { finish } : {}),
  }
}

/**
 * Validate the optional `finish` block on a paint row. Returns `undefined` when
 * the field is absent or empty; throws on malformed shape so the catalog import
 * fails loudly during boot.
 *
 * @param raw - Raw `finish` value from JSON.
 * @param optionId - Owning option id (used in error messages).
 */
function parseFinishProfile(
  raw: unknown,
  optionId: string,
): CosmeticFinishProfile | undefined {
  if (raw === undefined) return undefined
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`cosmetics catalog: finish on '${optionId}' must be an object`)
  }
  const obj = raw as Record<string, unknown>
  const out: { -readonly [K in keyof CosmeticFinishProfile]: CosmeticFinishProfile[K] } = {}
  for (const key of FINISH_CHANNEL_KEYS) {
    const channelRaw = obj[key]
    if (channelRaw === undefined) continue
    out[key] = parseFinishChannel(channelRaw, `${optionId}.finish.${key}`)
  }
  if (obj['rim'] !== undefined) {
    out.rim = parseFinishRim(obj['rim'], `${optionId}.finish.rim`)
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * Validate the optional `rim` block on a finish profile. Strength + power use
 * `>= 0`; bias is `[-1, 1]`; color must be `#rrggbb`.
 *
 * @param raw - Raw rim value from JSON.
 * @param path - Dot path used in error messages.
 */
function parseFinishRim(raw: unknown, path: string): CosmeticRim {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`cosmetics catalog: ${path} must be an object`)
  }
  const rim = raw as Record<string, unknown>
  const out: { -readonly [K in keyof CosmeticRim]: CosmeticRim[K] } = {}
  if (rim['color'] !== undefined) {
    const color = rim['color']
    if (typeof color !== 'string' || !HEX_COLOR_RE.test(color)) {
      throw new Error(`cosmetics catalog: ${path}.color must match #rrggbb`)
    }
    out.color = color
  }
  for (const key of ['intensity', 'power'] as const) {
    const value = rim[key]
    if (value === undefined) continue
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`cosmetics catalog: ${path}.${key} must be a non-negative number`)
    }
    out[key] = value
  }
  const bias = rim['bias']
  if (bias !== undefined) {
    if (typeof bias !== 'number' || !Number.isFinite(bias) || bias < -1 || bias > 1) {
      throw new Error(`cosmetics catalog: ${path}.bias must be a number in [-1, 1]`)
    }
    out.bias = bias
  }
  return out
}

/**
 * Validate one channel block inside a finish profile.
 *
 * @param raw - Raw channel value from JSON.
 * @param path - Dot path used in error messages (`<id>.finish.<channel>`).
 */
function parseFinishChannel(raw: unknown, path: string): CosmeticFinishChannel {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`cosmetics catalog: ${path} must be an object`)
  }
  const channel = raw as Record<string, unknown>
  const out: { -readonly [K in keyof CosmeticFinishChannel]: CosmeticFinishChannel[K] } = {}
  for (const key of FINISH_UNIT_FIELDS) {
    const value = channel[key]
    if (value === undefined) continue
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`cosmetics catalog: ${path}.${key} must be a number in [0, 1]`)
    }
    out[key] = value
  }
  for (const key of FINISH_NON_NEGATIVE_FIELDS) {
    const value = channel[key]
    if (value === undefined) continue
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`cosmetics catalog: ${path}.${key} must be a non-negative number`)
    }
    out[key] = value
  }
  const emissive = channel['emissive']
  if (emissive !== undefined) {
    if (typeof emissive !== 'string' || !HEX_COLOR_RE.test(emissive)) {
      throw new Error(`cosmetics catalog: ${path}.emissive must match #rrggbb`)
    }
    out.emissive = emissive
  }
  return out
}

/**
 * Parse unknown JSON into {@link CosmeticShopCatalog} or throw with a helpful message.
 *
 * @param data - Parsed JSON root.
 */
export function parseCosmeticShopCatalog(data: unknown): CosmeticShopCatalog {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('cosmetics catalog: root must be an object')
  }
  const root = data as Record<string, unknown>
  const id = root['id']
  const label = root['label']
  const theme = root['theme']
  const planets = root['availablePlanetIds']
  const premium = root['premiumTrade']
  const optionsRaw = root['options']

  if (typeof id !== 'string' || id.trim() === '') throw new Error('cosmetics catalog: id')
  if (typeof label !== 'string' || label.trim() === '') throw new Error('cosmetics catalog: label')
  if (typeof theme !== 'string' || theme.trim() === '') throw new Error('cosmetics catalog: theme')

  if (!Array.isArray(planets) || planets.length === 0) {
    throw new Error('cosmetics catalog: availablePlanetIds must be a non-empty array')
  }
  const availablePlanetIds = planets.map((planetId, idx) => {
    if (typeof planetId !== 'string' || planetId.trim() === '') {
      throw new Error(`cosmetics catalog: availablePlanetIds[${idx}] invalid`)
    }
    return planetId
  })

  const ids = new Set<string>()
  if (!Array.isArray(optionsRaw)) throw new Error('cosmetics catalog: options must be an array')
  const options = optionsRaw.map((row) => parseOption(row, ids))

  return {
    id,
    label,
    theme,
    availablePlanetIds,
    premiumTrade: parsePremiumTrade(premium),
    options,
  }
}

/** Lazily validate and memoize the shipped cosmetics catalog import. */
function getValidatedCatalog(): CosmeticShopCatalog {
  if (cachedCatalog) return cachedCatalog
  cachedCatalog = parseCosmeticShopCatalog(rawCatalog as unknown)
  return cachedCatalog
}

/**
 * Lightweight shop descriptor + premium tuning without iterating all option rows.
 */
export function getPimpMyShuttleConfig(): CosmeticShopConfig {
  const c = getValidatedCatalog()
  return {
    id: c.id,
    label: c.label,
    theme: c.theme,
    availablePlanetIds: c.availablePlanetIds,
    premiumTrade: c.premiumTrade,
  }
}

/**
 * Returns every validated option rows for optional test introspection.
 */
export function listAllCosmeticOptions(): readonly CosmeticOptionData[] {
  return getValidatedCatalog().options
}

/**
 * Rows filtered to a UI tab/category.
 *
 * @param category - Cosmetic category discriminator.
 */
export function getCosmeticOptions(category: CosmeticCategory): readonly CosmeticOptionData[] {
  return getValidatedCatalog().options.filter((option) => option.category === category)
}

/**
 * Find a catalog row by id when present.
 *
 * @param optionId - Cosmetic option id (`shuttle-paintjob-neon-comet`, …).
 */
export function findCosmeticOptionById(optionId: string): CosmeticOptionData | undefined {
  return getValidatedCatalog().options.find((option) => option.id === optionId)
}

/** Catalog row id used for hull title rename pricing (`shuttle-title-registry`). */
export const SHUTTLE_TITLE_SERVICE_OPTION_ID = 'shuttle-title-registry'
