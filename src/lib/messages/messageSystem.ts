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
  ShipMessageInboxRow,
  ShipMessageInboxRowStatus,
  ShipMessageReadable,
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

/** Max characters for inbox list preview text (single line / first paragraph). */
const SHIP_MESSAGE_INBOX_PREVIEW_MAX_CHARS = 100

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

  /**
   * Inbox rows for messages that have actually been delivered (a persisted record exists).
   * Undelivered catalog entries are omitted so the list does not show “locked” placeholders.
   * Order: priority high → low, then id.
   */
  listInboxRows(): ShipMessageInboxRow[] {
    const defs = [...this.definitions.values()].filter((def) => this.records[def.id] !== undefined)
    defs.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      return a.id.localeCompare(b.id)
    })

    return defs.map((def) => {
      const record = this.records[def.id]!
      const rawPreview = def.body[0] ?? def.subject
      const preview =
        rawPreview.length > SHIP_MESSAGE_INBOX_PREVIEW_MAX_CHARS
          ? `${rawPreview.slice(0, SHIP_MESSAGE_INBOX_PREVIEW_MAX_CHARS)}…`
          : rawPreview
      const status: ShipMessageInboxRowStatus = record.status
      return {
        id: def.id,
        from: def.from,
        subject: def.subject,
        sentAt: def.sentAt,
        preview,
        status,
        isUnread: record.status === 'pending',
      }
    })
  }

  /**
   * Returns the full message for the inbox reader, or null if it was never received (`locked`).
   * Dismissed messages remain readable as archives.
   *
   * @param id - Message definition id
   */
  getReadableShipMessage(id: string): ShipMessageReadable | null {
    const record = this.records[id]
    const def = this.definitions.get(id)
    if (!def || !record) return null
    return {
      ...def,
      inboxStatus: record.status,
    }
  }

  /** Writes the current record map through the persistence adapter. */
  private persist(): void {
    this.persistence.save(this.records)
  }
}
