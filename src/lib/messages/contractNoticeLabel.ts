/**
 * Derives the label text for the cyan /map contract notification pill.
 *
 * Maps the four authored `contractMessageKind` values onto three short,
 * generic player-facing strings:
 *   - `intro`                → `"NEW CONTRACT OFFER"`
 *   - `brief` / `step`       → `"CONTRACT UPDATED"`
 *   - `completion`           → `"CONTRACT COMPLETE"`
 *
 * The pill intentionally omits the contract name — the full name lives in
 * the mail reader that opens on click, and keeping the label short prevents
 * the pill from growing wider than its navbar siblings.
 *
 * @author guinetik
 * @date 2026-04-23
 * @spec docs/superpowers/specs/2026-04-23-contract-notification-channel-design.md
 */

import type { ShipMessageReadable } from '@/lib/messages/messageTypes'

/** Label used for `intro` messages; the generic offer copy per spec. */
const OFFER_LABEL = 'NEW CONTRACT OFFER'
/** Label used for `brief` and `step` messages — any in-progress update. */
const UPDATED_LABEL = 'CONTRACT UPDATED'
/** Label used for `completion` messages. */
const COMPLETE_LABEL = 'CONTRACT COMPLETE'

/**
 * Compute the cyan /map pill label for a contract-origin message.
 *
 * @param message - Readable ship message; must have `contractMessageKind` set.
 * @returns The uppercase label to render in the pill.
 */
export function contractNoticeLabel(message: ShipMessageReadable): string {
  const kind = message.contractMessageKind
  if (kind === 'intro') return OFFER_LABEL
  if (kind === 'completion') return COMPLETE_LABEL
  return UPDATED_LABEL
}
