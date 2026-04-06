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
  /** Gameplay trigger that makes this message eligible. */
  trigger: ShipMessageTrigger
  /** Whether the message blocks onboarding or simply arrives as a prompt. */
  delivery: ShipMessageDelivery
  /** Higher numbers win when multiple messages are active. */
  priority: number
}

/** Persisted runtime state for one message. */
export interface ShipMessageRecord {
  /** Stable id matching the static definition. */
  id: string
  /** Current lifecycle state. */
  status: ShipMessageStatus
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
