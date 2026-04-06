/**
 * Trigger-driven shipboard message state machine.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-startup-message-system-design.md
 */
import { loadMessageRecords, saveMessageRecords } from './messageStorage'
import type {
  ActiveShipMessage,
  ShipMessageDefinition,
  ShipMessageRecord,
  ShipMessageTrigger,
} from './messageTypes'

/**
 * Persistence adapter for ship message records; swap in tests or custom backends.
 */
export interface MessagePersistence {
  /**
   * Loads the persisted message record map keyed by message id.
   *
   * @returns Id-keyed records, or an empty object when nothing is stored
   */
  load(): Record<string, ShipMessageRecord>
  /**
   * Persists the full message record map, replacing any previous snapshot.
   *
   * @param records - Complete id-keyed record map to store
   */
  save(records: Record<string, ShipMessageRecord>): void
}

/** Default persistence using `loadMessageRecords` / `saveMessageRecords` and localStorage. */
const defaultPersistence: MessagePersistence = {
  load: () => loadMessageRecords(),
  save: (records) => saveMessageRecords(records),
}

/**
 * Owns message definitions, persisted lifecycle records, and active-message selection.
 */
export class MessageSystem {
  private readonly definitions: Map<string, ShipMessageDefinition>
  private readonly persistence: MessagePersistence
  private records: Record<string, ShipMessageRecord>

  /**
   * @param definitions - Static catalog entries this system may surface
   * @param persistence - Optional persistence; defaults to localStorage-backed adapter
   */
  constructor(
    definitions: ShipMessageDefinition[],
    persistence: MessagePersistence = defaultPersistence,
  ) {
    this.definitions = new Map(definitions.map((definition) => [definition.id, definition]))
    this.persistence = persistence
    this.records = persistence.load()
  }

  /**
   * Notifies the system that a gameplay trigger occurred so matching messages can activate.
   *
   * Eligible definitions share the trigger, are not `dismissed`, and have no record yet. At most
   * one new `pending` record is created per call: the highest-priority eligible definition.
   *
   * @param trigger - Symbolic trigger id (e.g. `map_start_earth_orbit`)
   */
  notifyTrigger(trigger: ShipMessageTrigger): void {
    const candidates = [...this.definitions.values()].filter((d) => d.trigger === trigger)
    candidates.sort((left, right) => right.priority - left.priority)

    for (const definition of candidates) {
      const record = this.records[definition.id]
      if (record?.status === 'dismissed') continue
      if (record) continue

      this.records[definition.id] = {
        id: definition.id,
        status: 'pending',
        shownAt: null,
        dismissedAt: null,
      }
      break
    }

    this.persist()
  }

  /**
   * Returns the highest-priority non-dismissed message, or null when none are active.
   */
  getActiveMessage(): ActiveShipMessage | null {
    const activeRecords = Object.values(this.records)
      .filter((record) => record.status === 'pending' || record.status === 'shown')
      .sort((left, right) => {
        const leftPriority = this.definitions.get(left.id)?.priority ?? 0
        const rightPriority = this.definitions.get(right.id)?.priority ?? 0
        return rightPriority - leftPriority
      })

    const record = activeRecords[0]
    if (!record) return null

    const definition = this.definitions.get(record.id)
    if (!definition) return null

    if (record.status !== 'pending' && record.status !== 'shown') return null

    return {
      ...definition,
      status: record.status,
    }
  }

  /**
   * Marks a pending message as shown, typically after the UI has displayed it.
   *
   * @param id - Message id to update
   * @param shownAt - ISO time of first show; defaults to now
   */
  markShown(id: string, shownAt: string = new Date().toISOString()): void {
    const record = this.records[id]
    if (!record || record.status !== 'pending') return

    this.records[id] = {
      ...record,
      status: 'shown',
      shownAt,
    }
    this.persist()
  }

  /**
   * Dismisses a message so it will not be selected again; state is persisted.
   *
   * @param id - Message id to dismiss
   * @param dismissedAt - ISO time of dismissal; defaults to now
   */
  dismiss(id: string, dismissedAt: string = new Date().toISOString()): void {
    const record = this.records[id]
    if (!record) return

    this.records[id] = {
      ...record,
      status: 'dismissed',
      dismissedAt,
    }
    this.persist()
  }

  /**
   * Returns the persisted record for a message id, if any.
   *
   * @param id - Message id to look up
   */
  getRecord(id: string): ShipMessageRecord | null {
    return this.records[id] ?? null
  }

  /** Returns how many messages are still pending and unopened. */
  getPendingMessageCount(): number {
    return Object.values(this.records).filter((record) => record.status === 'pending').length
  }

  /** Writes the current record map through the persistence adapter. */
  private persist(): void {
    this.persistence.save(this.records)
  }
}
