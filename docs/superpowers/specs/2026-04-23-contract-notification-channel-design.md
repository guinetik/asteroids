# Contract Notification Channel Design

> Spec for splitting the /map pending-message notice into two channels:
> regular inbox messages vs contract-related messages. Authored 2026-04-23.

## Overview

The tactical map (`MapView.vue`) currently surfaces every pending ship message
through a single blue pill (`map-message-notice`) that opens the generic
`ShipMessageDialog` modal. Players sometimes miss that a given message is a
contract intro, step update, or completion — they dismiss it and forget to
open the ShipNet inbox to act on it.

This design adds a second notification channel dedicated to contract-origin
messages. Contract messages show a **cyan** pill with a kind-specific label
that, on click, opens `ShuttleControlOverlay` on the mail program with the
contract folder and the target message pre-selected.

The two channels are independent and can render simultaneously (stacked).

## Why this design

- **Visual disambiguation.** Cyan vs blue makes "this is a contract" readable
  at a glance, so the player can't miss that a long-running contract just
  advanced.
- **Direct deep-link to context.** Clicking a contract notification lands the
  player inside the inbox, on the right folder, with the message open and the
  `ContractAcceptCard` visible when applicable — no extra navigation.
- **View-layer split only.** `MessageSystem` stays untouched. The split is a
  UI concern, driven by the existing `contractMessageKind` field on
  `ShipMessageReadable`. Adding a second channel does not leak into the
  domain layer.
- **Mirrors existing behavior.** Today the blue notice renders even while
  `ShuttleControlOverlay` is open, and clicking it auto-clears. The cyan
  channel follows the same rule — we do not special-case overlay state.

## Decisions

| Decision                              | Choice                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------- |
| Pill stacking when both pending       | Two independent pills; cyan above blue                                    |
| Label by `contractMessageKind`        | `brief` → `NEW CONTRACT OFFER`; step-flavor → `CONTRACT UPDATED: <name>`; completion → `CONTRACT COMPLETE: <name>` |
| Click behavior                        | Open `ShuttleControlOverlay` on mail tab, pre-select folder + message, mark shown, pill clears immediately |
| Overlay-already-open case             | No special handling — click still selects folder + message, pill clears   |
| Arrival audio                         | Distinct `sfx.contract` cue via new `UiAudioDirector.notifyContractUpdate()` |
| Styling                               | Single cyan color (no per-kind hue variant)                               |
| Contract messages in blue count       | Excluded — a contract message drives only the cyan pill, never the blue  |

## Components

### New — `src/components/MapContractNotice.vue`

Thin presentational component. Mirrors `map-message-notice` layout so users
recognize the shape.

- **Props**
  - `label: string` — pre-computed pill text (e.g. `"CONTRACT UPDATED: Gravity Surfer"`)
- **Emits**
  - `click` — consumer handles deep-link
- **Styling** — cyan palette (`#6ae8c4` primary, matches
  `ShuttleControlProgramMail.vue` accents). Same size/position/typography as
  `map-message-notice`. Inset left-border accent
  (`box-shadow: inset 3px 0 0 #6ae8c4`) for continuity with the pinned-brief
  row treatment.

### Updated — `src/views/MapView.vue`

- Replace single `activeMessage` pointer with:
  - `activeInboxMessage` — first pending message whose `contractMessageKind` is `undefined`
  - `activeContractMessage` — first pending message with a defined `contractMessageKind`
- `pendingMessageCount` becomes `pendingInboxCount` (excludes contract messages).
  The existing blue pill binds to `activeInboxMessage` + `pendingInboxCount`.
- `ShipMessageDialog` binds only to `activeInboxMessage` — contract messages
  no longer open the generic modal on /map.
- Render `<MapContractNotice>` when `activeContractMessage !== null`,
  above the blue pill in the same bottom-right cluster.
- New `contractNoticeLabel(readable)` helper — pure, extracted to
  `src/lib/messages/contractNoticeLabel.ts` so it can be unit-tested.
- New handler `openContractMessage(messageId)`:
  1. Look up `readable = shipMessageSystem.getReadableShipMessage(messageId)`;
     derive `folderId = readable.contractId` (contract folder id equals
     contract id, per the contracts spec).
  2. Set deep-link refs `mailFocusFolderId = folderId`,
     `mailFocusMessageId = messageId`.
  3. Set `shuttleControlVisible = true` with
     `programToSelectOnOpen: 'mail'`.
  4. Call `shipMessageSystem.markShown(messageId)` — `activeContractMessage`
     recomputes to `null`, pill unmounts.

### Updated — `src/components/ShuttleControlOverlay.vue`

- New props:
  - `mailFocusFolderId?: string` — folder to select on open
  - `mailFocusMessageId?: string` — message id to select on open
- Pass-through to `ShuttleControlProgramMail` via
  `:focus-folder-id` / `:focus-message-id` bindings.
- The parent (`MapView.vue`) clears the refs after one tick to make the
  deep-link a one-shot (so re-opening the overlay later doesn't re-select
  the same message unexpectedly).

### Updated — `src/components/shuttle-control/ShuttleControlProgramMail.vue`

- New props `focusFolderId?: string`, `focusMessageId?: string`.
- `watch(() => [focusFolderId, focusMessageId])`: if both set,
  1. `selectedFolderId.value = focusFolderId`
  2. `refreshRows()`
  3. `selectRow(focusMessageId, { autoplayAudio: true })`
- Existing `selectRow` handles the rest — marks shown, refreshes the reader,
  shows `ContractAcceptCard` when `showContractCardAbove` computes true.

### Updated — `src/views/MapViewController.ts`

- No structural change. The controller already emits UI state that
  `MapView.vue` consumes to flip `shuttleControlVisible`; we reuse that path.

## Audio

- Add `sfx.contract` to the manifest in `src/audio/audioManifest.ts`:
  ```ts
  'sfx.contract': {
    id: 'sfx.contract',
    src: '/sound/sfx.contract.mp3',
  }
  ```
  Include `'sfx.contract'` in the id union array at the top of the file.
- Add `notifyContractUpdate()` in `src/audio/UiAudioDirector.ts`:
  ```ts
  notifyContractUpdate(): void {
    this.audio.play('sfx.contract', { volume: 0.7 })
  }
  ```
- `MapView.vue` routes arrival sounds by kind: contract arrivals call
  `notifyContractUpdate()`, everything else keeps `notifyInboxMessage()`.

## Data flow

1. **Arrival.** `shipMessageSystem.onMessageActivated` fires. `MapView.vue`
   recomputes both active refs. If the newly activated message has
   `contractMessageKind !== undefined`, play `notifyContractUpdate()`;
   otherwise `notifyInboxMessage()` (existing behavior).
2. **Render.** Zero, one, or two pills render based on the two active refs.
3. **Click cyan pill.** `openContractMessage(messageId)` executes the
   four-step sequence above. `ShuttleControlOverlay` mounts (or stays
   mounted) with the mail tab active and the deep-link props set.
4. **Mail program receives focus props.** Watcher selects the folder and
   then the row. Existing `selectRow` path marks shown, autoplays audio,
   renders the `ContractAcceptCard` above or below the body per
   `showContractCardAbove`.
5. **Pill clearance.** `activeContractMessage` recomputes to `null` because
   `markShown` moved the record out of `pending`. The cyan pill unmounts.
6. **Click blue pill.** Unchanged — opens `ShipMessageDialog` modal.

## Testing

Per `CLAUDE.md` ground rules, tests focus on pure/stateless logic.

- `src/lib/messages/__tests__/contractNoticeLabel.spec.ts` — given a
  `ShipMessageReadable` with each `contractMessageKind` value and a
  contract name, assert the label string matches
  `NEW CONTRACT OFFER` / `CONTRACT UPDATED: X` / `CONTRACT COMPLETE: X`.
- `src/audio/__tests__/audioManifest.spec.ts` — extend the expected-ids
  assertion to include `'sfx.contract'`.
- No Vue/Three.js behavior tests. The split computeds themselves are
  trivial filter predicates — coverage comes from the label helper test.

## Merge criteria

Per `CLAUDE.md`:

1. `bun run type-check` — no TypeScript errors
2. `bun run lint` — oxlint 0 errors, ESLint 0 errors / 0 warnings,
   TSDoc on every new export (`MapContractNotice` props, `contractNoticeLabel`,
   `notifyContractUpdate`, new overlay and mail-program props)
3. `bun run test:unit` — all Vitest tests green, including the new label spec
   and the updated audio-manifest spec

## Out of scope

- Changes to `MessageSystem` internals or folder routing logic
- Changes to `ContractSystem` event model
- Changes to the `ContractAcceptCard` component
- Generalising the notification channel system beyond "inbox" and "contract"
- Persisting notification state across sessions — pending state already
  persists via `shipMessageSystem`, nothing new required here
