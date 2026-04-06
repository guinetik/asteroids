/**
 * Shared runtime instance for shipboard messages.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-startup-message-system-design.md
 */
import { SHIP_MESSAGE_CATALOG } from './messageCatalog'
import { MessageSystem } from './messageSystem'

/** App-wide ship message runtime shared by views and controllers. */
export const shipMessageSystem = new MessageSystem(SHIP_MESSAGE_CATALOG)
