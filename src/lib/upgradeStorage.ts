/**
 * localStorage persistence for player upgrade levels (27 data-driven upgrades).
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/superpowers/specs/2026-04-07-upgrade-system-design.md
 */
import upgradesData from '@/data/upgrades.json'

/** Schema version for JSON blobs in localStorage. */
export const PLAYER_UPGRADES_STORAGE_SCHEMA_VERSION = 1

/** localStorage key for persisted upgrade levels. */
export const PLAYER_UPGRADES_STORAGE_KEY = 'asteroid-lander-player-upgrades'

/** Known upgrade ids from catalog JSON (used to validate stored keys). */
const KNOWN_UPGRADE_IDS = new Set(
  (upgradesData as readonly { id: string }[]).map((row) => row.id),
)

/** Wire format written to localStorage. */
interface StoredPlayerUpgradesPayload {
  /** Schema version; bumped when the shape changes. */
  v: number
  /** Map of upgrade id → level (0..maxLevel). */
  levels: Record<string, number>
}

/**
 * Load persisted upgrade levels from localStorage.
 *
 * @returns Parsed level map, or null if missing or invalid.
 */
export function loadStoredPlayerUpgrades(): Record<string, number> | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(PLAYER_UPGRADES_STORAGE_KEY)
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw) as StoredPlayerUpgradesPayload
    if (parsed.v !== PLAYER_UPGRADES_STORAGE_SCHEMA_VERSION) return null
    if (!parsed.levels || typeof parsed.levels !== 'object') return null
    return parsed.levels
  } catch {
    return null
  }
}

/**
 * Persist upgrade levels to localStorage.
 *
 * @param levels - Full map of upgrade id → level.
 */
export function saveStoredPlayerUpgrades(levels: Record<string, number>): void {
  if (typeof localStorage === 'undefined') return
  const payload: StoredPlayerUpgradesPayload = {
    v: PLAYER_UPGRADES_STORAGE_SCHEMA_VERSION,
    levels: { ...levels },
  }
  localStorage.setItem(PLAYER_UPGRADES_STORAGE_KEY, JSON.stringify(payload))
}

/**
 * Remove persisted upgrades (e.g. tests or full reset flows).
 */
export function clearStoredPlayerUpgrades(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(PLAYER_UPGRADES_STORAGE_KEY)
}

/**
 * True when the string is a known upgrade id from the catalog.
 *
 * @param id - Candidate id from storage.
 */
export function isKnownUpgradeId(id: string): boolean {
  return KNOWN_UPGRADE_IDS.has(id)
}
