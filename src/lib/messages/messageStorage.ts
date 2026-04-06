/**
 * localStorage persistence for shipboard message state.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-startup-message-system-design.md
 */
import type { ShipMessageRecord } from './messageTypes'

/** Versioned localStorage key for persisted ship messages. */
export const SHIP_MESSAGE_STORAGE_KEY = 'asteroid-lander-ship-messages-v1'

/**
 * Saves the full message-record map to localStorage as JSON.
 *
 * @param records - Message id keyed record map to persist
 */
export function saveMessageRecords(records: Record<string, ShipMessageRecord>): void {
  localStorage.setItem(SHIP_MESSAGE_STORAGE_KEY, JSON.stringify(records))
}

/**
 * Loads all persisted message records from localStorage.
 *
 * @returns Parsed record map, or an empty object when absent or corrupt JSON
 */
export function loadMessageRecords(): Record<string, ShipMessageRecord> {
  const raw = localStorage.getItem(SHIP_MESSAGE_STORAGE_KEY)
  if (raw === null) return {}

  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
      return {}
    }

    return parsed as Record<string, ShipMessageRecord>
  } catch {
    return {}
  }
}
