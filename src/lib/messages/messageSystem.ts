/**
 * Trigger-driven shipboard message state machine.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-startup-message-system-design.md
 */
import { Timer } from '@/lib/Timer'
import { loadMessageRecords, saveMessageRecords } from './messageStorage'
import type {
  ActiveShipMessage,
  ShipMessageDefinition,
  ShipMessageFolder,
  ShipMessageInboxRow,
  ShipMessageInboxRowStatus,
  ShipMessageReadable,
  ShipMessageRecord,
  ShipMessageTrigger,
} from './messageTypes'
import { DEFAULT_INBOX_FOLDER_ID, DEFAULT_INBOX_FOLDER_LABEL } from './messageTypes'

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
 * Optional hooks for embedding {@link MessageSystem} in the app shell (e.g. Vue refresh after
 * delayed follow-up delivery).
 */
export interface MessageSystemHooks {
  /**
   * Called after new follow-up message records are written (including after a delayed dismiss).
   */
  onFollowUpsEnqueued?: () => void
  /**
   * Called immediately after a message is archived/dismissed. Receivers can fan out to other
   * subsystems (e.g. {@link ContractSystem.notifyMessageArchived}) without coupling them
   * directly to the inbox UI.
   *
   * @param messageId - Id of the message that was archived.
   */
  onMessageArchived?: (messageId: string) => void
}

/**
 * Owns message definitions, persisted lifecycle records, and active-message selection.
 */
export class MessageSystem {
  private readonly definitions: Map<string, ShipMessageDefinition>
  private readonly persistence: MessagePersistence
  private readonly hooks: MessageSystemHooks
  private records: Record<string, ShipMessageRecord>
  private readonly archiveListeners = new Set<(id: string) => void>()

  /**
   * @param definitions - Static catalog entries this system may surface
   * @param persistence - Optional persistence; defaults to localStorage-backed adapter
   * @param hooks - Optional callbacks for UI sync when messages are delivered asynchronously
   */
  constructor(
    definitions: ShipMessageDefinition[],
    persistence: MessagePersistence = defaultPersistence,
    hooks: MessageSystemHooks = {},
  ) {
    this.definitions = new Map(definitions.map((definition) => [definition.id, definition]))
    this.persistence = persistence
    this.hooks = hooks
    this.records = persistence.load()
  }

  /**
   * Register additional message definitions after construction.
   *
   * Used by subsystems (e.g. {@link ContractSystem}) that need to inject their own
   * authored messages into the same inbox without re-creating the singleton.
   * Existing ids are not overwritten; the first registration wins.
   *
   * @param definitions - Extra message definitions to merge into the catalog.
   */
  registerDefinitions(definitions: readonly ShipMessageDefinition[]): void {
    for (const definition of definitions) {
      if (this.definitions.has(definition.id)) continue
      this.definitions.set(definition.id, definition)
    }
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
   * Force-deliver a specific authored message by id.
   *
   * Used for dev tools or scripted narrative beats that should enqueue one exact
   * inbox item without introducing a new gameplay trigger.
   *
   * @param id - Catalog message id to enqueue.
   * @returns True when a new pending record was created.
   */
  enqueueById(id: string): boolean {
    const definition = this.definitions.get(id)
    if (!definition) return false

    const record = this.records[id]
    if (record?.status === 'dismissed') return false
    if (record) return false

    this.records[id] = {
      id,
      status: 'pending',
      shownAt: null,
      dismissedAt: null,
    }
    this.persist()
    return true
  }

  /**
   * Returns the highest-priority non-dismissed message, or null when none are active.
   *
   * @param filter - Optional predicate run against each candidate's
   *                 {@link ShipMessageDefinition}. Only records whose definition
   *                 satisfies the predicate are considered. Use this to split
   *                 active-message state into independent UI channels (inbox vs
   *                 contract).
   */
  getActiveMessage(
    filter?: (definition: ShipMessageDefinition) => boolean,
  ): ActiveShipMessage | null {
    const activeRecords = Object.values(this.records)
      .filter((record) => record.status === 'pending' || record.status === 'shown')
      .filter((record) => {
        if (!filter) return true
        const def = this.definitions.get(record.id)
        return def ? filter(def) : false
      })
      .sort((left, right) => {
        const leftUnread = left.status === 'pending' ? 1 : 0
        const rightUnread = right.status === 'pending' ? 1 : 0
        if (rightUnread !== leftUnread) return rightUnread - leftUnread
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
    this.enqueueFollowUpsOnDismiss(id)
    this.persist()
    this.hooks.onMessageArchived?.(id)
    for (const listener of this.archiveListeners) {
      try {
        listener(id)
      } catch {
        // listeners must not break the system; swallow to keep other subscribers alive
      }
    }
  }

  /**
   * Subscribe to message archive events. Listeners run after persistence completes
   * and after `enqueueOnDismiss` follow-ups are scheduled.
   *
   * @param listener - Callback invoked with the just-archived message id.
   * @returns Unsubscribe function.
   */
  onMessageArchived(listener: (id: string) => void): () => void {
    this.archiveListeners.add(listener)
    return () => this.archiveListeners.delete(listener)
  }

  /**
   * Returns the persisted record for a message id, if any.
   *
   * @param id - Message id to look up
   */
  getRecord(id: string): ShipMessageRecord | null {
    return this.records[id] ?? null
  }

  /**
   * Returns how many messages are still pending and unopened.
   *
   * @param filter - Optional predicate run against each candidate's
   *                 {@link ShipMessageDefinition}. When supplied, only pending
   *                 records whose definition satisfies the predicate are
   *                 counted.
   */
  getPendingMessageCount(filter?: (definition: ShipMessageDefinition) => boolean): number {
    return Object.values(this.records).filter((record) => {
      if (record.status !== 'pending') return false
      if (!filter) return true
      const def = this.definitions.get(record.id)
      return def ? filter(def) : false
    }).length
  }

  /**
   * Inbox rows for messages that have actually been delivered (a persisted record exists).
   * Undelivered catalog entries are omitted so the list does not show “locked” placeholders.
   * Order: priority high → low, then id.
   *
   * @param folderId - When provided, only rows belonging to this folder are returned.
   *                   Use {@link DEFAULT_INBOX_FOLDER_ID} for the standard inbox.
   */
  listInboxRows(folderId?: string): ShipMessageInboxRow[] {
    const defs = [...this.definitions.values()].filter((def) => {
      if (this.records[def.id] === undefined) return false
      if (folderId === undefined) return true
      return this.folderIdOf(def) === folderId
    })
    defs.sort((a, b) => {
      const pinnedDelta = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
      if (pinnedDelta !== 0) return pinnedDelta
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
      const row: ShipMessageInboxRow = {
        id: def.id,
        from: def.from,
        subject: def.subject,
        sentAt: def.sentAt,
        preview,
        status,
        isUnread: record.status === 'pending',
        folderId: this.folderIdOf(def),
        pinned: def.pinned === true,
      }
      if (def.contractId) row.contractId = def.contractId
      return row
    })
  }

  /**
   * Returns one entry per inbox folder that currently has at least one delivered row.
   *
   * The default inbox is always present, even when empty, so the sidebar never collapses
   * to nothing during a fresh save.
   */
  listFolders(): ShipMessageFolder[] {
    const totals = new Map<string, { label: string; total: number; unread: number }>()
    totals.set(DEFAULT_INBOX_FOLDER_ID, {
      label: DEFAULT_INBOX_FOLDER_LABEL,
      total: 0,
      unread: 0,
    })

    for (const def of this.definitions.values()) {
      const record = this.records[def.id]
      if (!record) continue
      const folderId = this.folderIdOf(def)
      const existing = totals.get(folderId)
      if (existing) {
        existing.total += 1
        if (record.status === 'pending') existing.unread += 1
        if (folderId !== DEFAULT_INBOX_FOLDER_ID && def.folderLabel) {
          existing.label = def.folderLabel
        }
      } else {
        totals.set(folderId, {
          label: def.folderLabel ?? folderId,
          total: 1,
          unread: record.status === 'pending' ? 1 : 0,
        })
      }
    }

    return [...totals.entries()]
      .map(([id, value]) => ({ id, label: value.label, total: value.total, unread: value.unread }))
      .sort((a, b) => {
        if (a.id === DEFAULT_INBOX_FOLDER_ID) return -1
        if (b.id === DEFAULT_INBOX_FOLDER_ID) return 1
        return a.label.localeCompare(b.label)
      })
  }

  /**
   * Resolve the folder id for a definition, defaulting to the standard inbox.
   *
   * @param def - Catalog message definition.
   */
  private folderIdOf(def: ShipMessageDefinition): string {
    return def.folderId ?? DEFAULT_INBOX_FOLDER_ID
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

  /** Enqueues any authored follow-up messages unlocked by dismissing/archiving the given message. */
  private enqueueFollowUpsOnDismiss(id: string): void {
    const definition = this.definitions.get(id)
    if (!definition?.enqueueOnDismiss?.length) return

    const delaySec = definition.enqueueOnDismissDelaySeconds ?? 0
    const nextIds = definition.enqueueOnDismiss

    if (delaySec > 0) {
      Timer.after(delaySec, () => {
        this.enqueueFollowUpIds(nextIds)
      })
      return
    }

    this.enqueueFollowUpIds(nextIds)
  }

  /**
   * Creates pending records for the given catalog ids when none exist yet.
   *
   * @param nextIds - Follow-up message ids from a parent definition
   */
  private enqueueFollowUpIds(nextIds: readonly string[]): void {
    let added = false
    for (const nextId of nextIds) {
      const nextDefinition = this.definitions.get(nextId)
      if (!nextDefinition) continue

      const nextRecord = this.records[nextId]
      if (nextRecord?.status === 'dismissed') continue
      if (nextRecord) continue

      this.records[nextId] = {
        id: nextId,
        status: 'pending',
        shownAt: null,
        dismissedAt: null,
      }
      added = true
    }
    if (added) {
      this.persist()
      this.hooks.onFollowUpsEnqueued?.()
    }
  }
}
