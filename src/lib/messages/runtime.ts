/**
 * Shared runtime instance for shipboard messages.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-startup-message-system-design.md
 */
import { SHIP_MESSAGE_CATALOG } from './messageCatalog'
import { MessageSystem } from './messageSystem'

/** Notified when delayed dismiss follow-ups create new inbox records (e.g. Vue `refreshActiveMessage`). */
let followUpDeliveryListener: (() => void) | null = null

/**
 * Registers a listener for follow-up messages delivered after a wall-clock delay.
 * Pass `null` to clear (e.g. on view unmount).
 *
 * @param listener - Callback or null
 */
export function setShipMessageFollowUpDeliveryListener(listener: (() => void) | null): void {
  followUpDeliveryListener = listener
}

/** App-wide ship message runtime shared by views and controllers. */
export const shipMessageSystem = new MessageSystem(SHIP_MESSAGE_CATALOG, undefined, {
  onFollowUpsEnqueued: () => followUpDeliveryListener?.(),
})
