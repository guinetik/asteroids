/**
 * Core types for the shipboard message system.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-startup-message-system-design.md
 */

/** Gameplay trigger ids that can surface shipboard messages. */
export type ShipMessageTrigger =
  | 'map_start_earth_orbit'
  | 'map_leave_earth_distance'
  | 'map_brake_used'
  | 'map_main_thruster_depleted'
  | 'mission_start'
  | 'map_venus_orbit_warning'
  | 'map_first_slingshot'
  | 'viroid_envoy_initial_contact'
  | 'viroid_envoy_ceres_rendezvous'
  /** Reserved scripted delivery — never routed through {@link MessageSystem.notifyTrigger}; `enqueueById` only. */
  | 'map_cosmetic_shop_intro_scripted'
  /** Reserved scripted delivery — Carmen's first letter after the Finch contract closes; `enqueueById` only. */
  | 'carmen_finch_followup_scripted'
  /** Reserved scripted delivery — Marta + Jay heads-ups chained off the USC gravity surfing offer; `enqueueOnDismiss` only. */
  | 'gravity_surfing_offer_followup_scripted'
  /** Reserved scripted delivery — Jay's celebration after the player installs the Gravity Surfing Module; `enqueueById` only. */
  | 'gravity_surfing_installed_scripted'
  /** Reserved scripted delivery — Marta's cat-care check-in after the welcome journey completes; `enqueueById` only. */
  | 'welcome_journey_completed_scripted'
  | 'contract'

/** Built-in inbox folder id used by all general ship comms (default sidebar entry). */
export const DEFAULT_INBOX_FOLDER_ID = 'inbox'

/** Display label for the default inbox folder shown in the mail sidebar. */
export const DEFAULT_INBOX_FOLDER_LABEL = 'Inbox'

/** Delivery behavior for a shipboard message. */
export type ShipMessageDelivery = 'blocking_intro' | 'inbox_prompt'

/** Persisted lifecycle state for a shipboard message. */
export type ShipMessageStatus = 'pending' | 'shown' | 'dismissed'

/** Static message definition authored in code. */
export interface ShipMessageDefinition {
  /** Stable id used for persistence and future quest references. */
  id: string
  /** Sender label shown in the reader header. */
  from: string
  /** Subject line shown in the reader header. */
  subject: string
  /** Lore-facing date string shown in the reader header. */
  sentAt: string
  /** Paragraphs rendered in the message body. */
  body: string[]
  /** Optional voice log bundled with the message and played through the comms channel. */
  audioUrl?: string
  /** Optional message ids to enqueue when this message is archived/dismissed (acknowledged). */
  enqueueOnDismiss?: string[]
  /**
   * Seconds to wait after dismiss before {@link enqueueOnDismiss} messages are delivered.
   * Omitted or `0` = immediate (same frame as {@link MessageSystem.dismiss} persistence).
   */
  enqueueOnDismissDelaySeconds?: number
  /** Gameplay trigger that makes this message eligible. */
  trigger: ShipMessageTrigger
  /** Whether the message blocks onboarding or simply arrives as a prompt. */
  delivery: ShipMessageDelivery
  /** Higher numbers win when multiple messages are active. */
  priority: number
  /**
   * Optional inbox folder id; defaults to {@link DEFAULT_INBOX_FOLDER_ID} when omitted.
   * Contracts route their messages to a folder named after the contract id.
   */
  folderId?: string
  /**
   * Display label for {@link folderId}. Only required for non-default folders;
   * the first message that registers a folder defines its label.
   */
  folderLabel?: string
  /**
   * When set, marks this message as a contract-related entry. The mail reader
   * uses this to surface accept/decline controls and progress callouts.
   */
  contractId?: string
  /**
   * Per-contract role for this message:
   *   - `'intro'` — offer message with Accept/Decline buttons in the reader
   *   - `'brief'` — pinned active-contract dossier, always visible at top of the folder
   *   - `'step'` — flavor text dropped when a step unlocks
   *   - `'completion'` — celebratory message dropped when the contract finishes
   * Undefined for plain catalog messages.
   */
  contractMessageKind?: 'intro' | 'brief' | 'step' | 'completion'
  /** Index into {@link Contract.steps} for `contractMessageKind === 'step'` messages. */
  contractStepIndex?: number
  /**
   * When true, the inbox list pins this message above all non-pinned rows in the
   * same folder. Used by contract briefs so the active dossier stays at the top
   * of its folder regardless of arrival order.
   */
  pinned?: boolean
}

/** Persisted runtime state for one message. */
export interface ShipMessageRecord {
  /** Stable id matching the static definition. */
  id: string
  /** Current lifecycle state. */
  status: ShipMessageStatus
  /**
   * ISO timestamp when this message first arrived in the inbox (record created).
   * Omitted on saves from older builds until {@link MessageSystem} fills it during load migration.
   */
  receivedAt?: string
  /** ISO timestamp for first time shown, or null when never shown. */
  shownAt: string | null
  /** ISO timestamp for dismissal, or null when still active. */
  dismissedAt: string | null
}

/** Message returned to the UI when it should currently be shown. */
export interface ActiveShipMessage extends ShipMessageDefinition {
  /** Current runtime lifecycle state. */
  status: Extract<ShipMessageStatus, 'pending' | 'shown'>
}

/**
 * Row in the shuttle terminal mail list — one row per catalog message, `locked` until a record exists.
 */
export type ShipMessageInboxRowStatus = ShipMessageStatus | 'locked'

/**
 * One line in the ShipNet inbox (Outlook-style list + reader).
 *
 * @author guinetik
 * @date 2026-04-07
 */
export interface ShipMessageInboxRow {
  /** Definition id. */
  id: string
  /** Sender line from the definition. */
  from: string
  /** Subject line. */
  subject: string
  /** Lore date string. */
  sentAt: string
  /** Short excerpt for the list pane. */
  preview: string
  /** `locked` until the trigger has created a persisted record. */
  status: ShipMessageInboxRowStatus
  /** True when the message is pending (never opened in any UI). */
  isUnread: boolean
  /** Folder id this row belongs to. Defaults to {@link DEFAULT_INBOX_FOLDER_ID}. */
  folderId: string
  /** Optional contract id when this row was authored by the contract system. */
  contractId?: string
  /** True when the message should sort above all non-pinned rows in its folder. */
  pinned: boolean
}

/** One folder entry surfaced in the mail sidebar. */
export interface ShipMessageFolder {
  /** Stable id used to filter inbox rows. */
  id: string
  /** Sidebar label (e.g. `"Inbox"` or `"Space Cowboys, Inc."`). */
  label: string
  /** Total rows currently in the folder (records exist for them). */
  total: number
  /** Subset of {@link total} that is still `pending`. */
  unread: number
}

/**
 * Full message body for the inbox reader, including archive (`dismissed`) state.
 *
 * @author guinetik
 * @date 2026-04-07
 */
export interface ShipMessageReadable extends ShipMessageDefinition {
  /** Persisted lifecycle for reader chrome (dismissed = archived but still readable). */
  inboxStatus: ShipMessageStatus
}
