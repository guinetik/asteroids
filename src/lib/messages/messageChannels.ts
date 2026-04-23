/**
 * Domain predicates that partition `ShipMessageDefinition`s into UI channels.
 *
 * Used by the /map view to derive independent active-message state for the
 * regular inbox (blue pill) and contract-origin (cyan pill) notification
 * channels. Kept in `src/lib/messages/` so other consumers (HUDs, tests,
 * future controllers) can reuse the same partition without redefining it.
 *
 * @author guinetik
 * @date 2026-04-23
 * @spec docs/superpowers/specs/2026-04-23-contract-notification-channel-design.md
 */

import type { ShipMessageDefinition } from '@/lib/messages/messageTypes'

/**
 * True when the definition belongs to the regular inbox channel (no
 * `contractMessageKind` tag). Contract messages never satisfy this predicate.
 *
 * @param definition - Authored ship message definition.
 */
export function isInboxMessage(definition: ShipMessageDefinition): boolean {
  return definition.contractMessageKind === undefined
}

/**
 * True when the definition was authored by the contract system (i.e. has a
 * `contractMessageKind`). Complements {@link isInboxMessage} — the two
 * predicates partition the full message catalog with no overlap.
 *
 * @param definition - Authored ship message definition.
 */
export function isContractMessage(definition: ShipMessageDefinition): boolean {
  return definition.contractMessageKind !== undefined
}
