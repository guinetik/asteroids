/**
 * Derives the label text for the cyan /map contract notification pill.
 *
 * Maps the four authored `contractMessageKind` values onto three player-facing
 * strings per the spec:
 *   - `intro`      → `"NEW CONTRACT OFFER"` (generic, no contract name)
 *   - `brief`/`step` → `"CONTRACT UPDATED: <name>"`
 *   - `completion` → `"CONTRACT COMPLETE: <name>"`
 *
 * When `contractName` is null (contract lookup failed), the named labels drop
 * the suffix and render the generic form so the pill never prints `undefined`.
 *
 * @author guinetik
 * @date 2026-04-23
 * @spec docs/superpowers/specs/2026-04-23-contract-notification-channel-design.md
 */

import type { ShipMessageReadable } from '@/lib/messages/messageTypes'

/** Label used for `intro` messages; the generic offer copy per spec. */
const GENERIC_OFFER_LABEL = 'NEW CONTRACT OFFER'
const GENERIC_UPDATED_LABEL = 'CONTRACT UPDATED'
const GENERIC_COMPLETE_LABEL = 'CONTRACT COMPLETE'

/**
 * Compute the cyan /map pill label for a contract-origin message.
 *
 * @param message - Readable ship message; must have `contractMessageKind` set.
 * @param contractName - Display name from `Contract.inboxName`, or `null` when
 *                       the contract lookup failed (defensive fallback).
 * @returns The uppercase label to render in the pill.
 */
export function contractNoticeLabel(
  message: ShipMessageReadable,
  contractName: string | null,
): string {
  const kind = message.contractMessageKind
  if (kind === 'intro') return GENERIC_OFFER_LABEL
  if (kind === 'completion') {
    return contractName ? `${GENERIC_COMPLETE_LABEL}: ${contractName}` : GENERIC_COMPLETE_LABEL
  }
  return contractName ? `${GENERIC_UPDATED_LABEL}: ${contractName}` : GENERIC_UPDATED_LABEL
}
