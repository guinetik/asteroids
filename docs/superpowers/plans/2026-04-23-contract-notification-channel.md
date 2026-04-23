# Contract Notification Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the /map pending-message notice into two independent channels — a blue pill for regular inbox messages (existing behavior) and a cyan pill for contract-origin messages that deep-links into the shuttle-control mail program with the contract folder and target message pre-selected.

**Architecture:** View-layer split only. `MessageSystem` gains an optional filter predicate on `getActiveMessage()` / `getPendingMessageCount()` so `MapView.vue` can derive two active-message refs from the same underlying store. A new `MapContractNotice.vue` component renders the cyan pill. `ShuttleControlOverlay.vue` and `ShuttleControlProgramMail.vue` gain focus-folder / focus-message props so `MapView.vue` can deep-link into a specific contract message when the cyan pill is clicked.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, Vitest for unit tests, Bun as the runner. All pure-logic tests live alongside `src/lib/` modules.

**Reference spec:** `docs/superpowers/specs/2026-04-23-contract-notification-channel-design.md`

---

## File Structure

**Create:**
- `src/lib/messages/contractNoticeLabel.ts` — pure function mapping `ShipMessageReadable` → pill label string
- `src/lib/messages/__tests__/contractNoticeLabel.spec.ts` — unit tests for the helper
- `src/components/MapContractNotice.vue` — cyan pill component

**Modify:**
- `src/lib/messages/messageSystem.ts` — add optional filter predicate to `getActiveMessage` and `getPendingMessageCount`
- `src/lib/messages/__tests__/messageSystem.spec.ts` — cover the new filter overloads
- `src/audio/audioManifest.ts` — register `sfx.contract` audio id + definition
- `src/audio/__tests__/audioManifest.spec.ts` — extend expected-ids assertion
- `src/audio/UiAudioDirector.ts` — add `notifyContractUpdate()` method
- `src/components/shuttle-control/ShuttleControlProgramMail.vue` — add `focusFolderId` / `focusMessageId` props + watcher
- `src/components/ShuttleControlOverlay.vue` — add `mailFocusFolderId` / `mailFocusMessageId` props, forward to mail program
- `src/views/MapView.vue` — split active-message state into inbox + contract channels, mount `MapContractNotice`, wire deep-link click

---

## Task 1 — Contract notice label helper

**Files:**
- Create: `src/lib/messages/contractNoticeLabel.ts`
- Test: `src/lib/messages/__tests__/contractNoticeLabel.spec.ts`

Pure function that converts a contract-origin readable message + its contract display name into the pill label per the spec. Living in `src/lib/` keeps it trivially testable and framework-free.

- [ ] **Step 1.1 — Write the failing test**

File: `src/lib/messages/__tests__/contractNoticeLabel.spec.ts`

```ts
/**
 * Tests for contractNoticeLabel — the pure mapper that turns a contract-origin
 * ShipMessageReadable + its contract display name into the cyan /map pill text.
 */
import { describe, expect, it } from 'vitest'
import type { ShipMessageReadable } from '@/lib/messages/messageTypes'
import { contractNoticeLabel } from '@/lib/messages/contractNoticeLabel'

function makeReadable(
  overrides: Partial<ShipMessageReadable> & Pick<ShipMessageReadable, 'contractMessageKind'>,
): ShipMessageReadable {
  return {
    id: 'msg',
    from: 'Dispatcher',
    subject: 'Subject',
    sentAt: '2412.09.14',
    body: ['paragraph'],
    trigger: 'contract',
    delivery: 'inbox_prompt',
    priority: 0,
    inboxStatus: 'pending',
    contractId: 'gravity-surfer',
    ...overrides,
  }
}

describe('contractNoticeLabel', () => {
  it('returns the generic offer label for an intro message', () => {
    const label = contractNoticeLabel(
      makeReadable({ contractMessageKind: 'intro' }),
      'Gravity Surfer',
    )
    expect(label).toBe('NEW CONTRACT OFFER')
  })

  it('returns a named updated label for a brief (active dossier) message', () => {
    const label = contractNoticeLabel(
      makeReadable({ contractMessageKind: 'brief' }),
      'Gravity Surfer',
    )
    expect(label).toBe('CONTRACT UPDATED: Gravity Surfer')
  })

  it('returns a named updated label for a step flavor message', () => {
    const label = contractNoticeLabel(
      makeReadable({ contractMessageKind: 'step' }),
      'Gravity Surfer',
    )
    expect(label).toBe('CONTRACT UPDATED: Gravity Surfer')
  })

  it('returns a named complete label for a completion message', () => {
    const label = contractNoticeLabel(
      makeReadable({ contractMessageKind: 'completion' }),
      'Gravity Surfer',
    )
    expect(label).toBe('CONTRACT COMPLETE: Gravity Surfer')
  })

  it('falls back to a generic updated label when the contract name is missing', () => {
    const label = contractNoticeLabel(
      makeReadable({ contractMessageKind: 'step' }),
      null,
    )
    expect(label).toBe('CONTRACT UPDATED')
  })
})
```

- [ ] **Step 1.2 — Run the failing test**

Run: `bun test:unit src/lib/messages/__tests__/contractNoticeLabel.spec.ts`

Expected: FAIL — `Cannot find module '@/lib/messages/contractNoticeLabel'`.

- [ ] **Step 1.3 — Create the helper**

File: `src/lib/messages/contractNoticeLabel.ts`

```ts
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

/** Pill label returned when no contract name is available. */
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
```

- [ ] **Step 1.4 — Run tests to verify they pass**

Run: `bun test:unit src/lib/messages/__tests__/contractNoticeLabel.spec.ts`

Expected: PASS — all 5 tests green.

- [ ] **Step 1.5 — Commit**

```bash
git add src/lib/messages/contractNoticeLabel.ts src/lib/messages/__tests__/contractNoticeLabel.spec.ts
git commit -m "feat(messages): contractNoticeLabel helper for /map notification pill"
```

---

## Task 2 — `MessageSystem` filter overloads

**Files:**
- Modify: `src/lib/messages/messageSystem.ts`
- Modify: `src/lib/messages/__tests__/messageSystem.spec.ts`

Extend the two query methods with an optional predicate so `MapView.vue` can split active-message state into inbox vs contract channels without reaching into records.

- [ ] **Step 2.1 — Add failing tests**

Append the following `describe` blocks to `src/lib/messages/__tests__/messageSystem.spec.ts` (below the existing `getPendingMessageCount` block). If an import for `ShipMessageDefinition` is not already in scope in this file, add it to the existing type-only import.

```ts
describe('MessageSystem.getActiveMessage (filtered)', () => {
  it('returns the head of the subset matching the predicate', () => {
    const system = buildSystemWithTwoMessages() // re-use the spec's existing helper
    // Assumes buildSystemWithTwoMessages seeds:
    //   - id 'high-priority', priority 10, contractId undefined
    //   - id 'contract-one',  priority  5, contractId 'foo'
    system.fireTrigger('map_start_earth_orbit') // activates high-priority
    system.fireTrigger('contract')              // activates contract-one

    const inbox = system.getActiveMessage((def) => def.contractId === undefined)
    const contract = system.getActiveMessage((def) => def.contractId !== undefined)

    expect(inbox?.id).toBe('high-priority')
    expect(contract?.id).toBe('contract-one')
  })

  it('returns null when no record matches the predicate', () => {
    const system = buildSystemWithTwoMessages()
    system.fireTrigger('map_start_earth_orbit')

    const contract = system.getActiveMessage((def) => def.contractId !== undefined)
    expect(contract).toBeNull()
  })
})

describe('MessageSystem.getPendingMessageCount (filtered)', () => {
  it('counts only records whose definition matches the predicate', () => {
    const system = buildSystemWithTwoMessages()
    system.fireTrigger('map_start_earth_orbit')
    system.fireTrigger('contract')

    expect(system.getPendingMessageCount((def) => def.contractId === undefined)).toBe(1)
    expect(system.getPendingMessageCount((def) => def.contractId !== undefined)).toBe(1)
    expect(system.getPendingMessageCount()).toBe(2) // unfiltered still works
  })
})
```

If `buildSystemWithTwoMessages` does not already exist in the spec file, inspect the existing `describe` blocks for the helper they use (search for `new MessageSystem(`) and reuse it. If each existing test inlines its own fixtures, define a local helper at the top of the new blocks that constructs a `MessageSystem` seeded with one non-contract definition (trigger: `'map_start_earth_orbit'`, priority: 10) and one contract-tagged definition (trigger: `'contract'`, priority: 5, `contractId: 'foo'`, `contractMessageKind: 'intro'`).

- [ ] **Step 2.2 — Run the failing tests**

Run: `bun test:unit src/lib/messages/__tests__/messageSystem.spec.ts`

Expected: FAIL — `system.getActiveMessage` / `getPendingMessageCount` reject the predicate argument (type error) or ignore it, causing the asserted ids to be wrong.

- [ ] **Step 2.3 — Implement the filter on `getActiveMessage`**

File: `src/lib/messages/messageSystem.ts`

Replace the `getActiveMessage` method (currently around line 169) with:

```ts
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
```

Ensure `ShipMessageDefinition` is already imported at the top of the file; if not, add it to the existing `messageTypes` import.

- [ ] **Step 2.4 — Implement the filter on `getPendingMessageCount`**

File: `src/lib/messages/messageSystem.ts`

Replace the `getPendingMessageCount` method (currently around line 262) with:

```ts
  /**
   * Returns how many messages are still pending and unopened.
   *
   * @param filter - Optional predicate run against each candidate's
   *                 {@link ShipMessageDefinition}. When supplied, only pending
   *                 records whose definition satisfies the predicate are
   *                 counted.
   */
  getPendingMessageCount(
    filter?: (definition: ShipMessageDefinition) => boolean,
  ): number {
    return Object.values(this.records).filter((record) => {
      if (record.status !== 'pending') return false
      if (!filter) return true
      const def = this.definitions.get(record.id)
      return def ? filter(def) : false
    }).length
  }
```

- [ ] **Step 2.5 — Run the tests to verify they pass**

Run: `bun test:unit src/lib/messages/__tests__/messageSystem.spec.ts`

Expected: PASS — all new filter tests green, existing tests still green.

- [ ] **Step 2.6 — Commit**

```bash
git add src/lib/messages/messageSystem.ts src/lib/messages/__tests__/messageSystem.spec.ts
git commit -m "feat(messages): optional filter predicate on getActiveMessage/getPendingMessageCount"
```

---

## Task 3 — Register `sfx.contract` audio

**Files:**
- Modify: `src/audio/audioManifest.ts`
- Modify: `src/audio/__tests__/audioManifest.spec.ts`
- Modify: `src/audio/UiAudioDirector.ts`

The asset already lives at `public/sound/sfx.contract.mp3`. We register it and add a director method.

- [ ] **Step 3.1 — Extend the manifest test**

File: `src/audio/__tests__/audioManifest.spec.ts`

Open the file and locate the expected-ids array (search for `'sfx.inbox'`). Insert `'sfx.contract'` immediately after `'sfx.inbox'`:

```ts
      'sfx.inbox',
      'sfx.contract',
```

- [ ] **Step 3.2 — Run the failing test**

Run: `bun test:unit src/audio/__tests__/audioManifest.spec.ts`

Expected: FAIL — `'sfx.contract'` missing from the exported `AUDIO_SOUND_IDS` array.

- [ ] **Step 3.3 — Register the sound id**

File: `src/audio/audioManifest.ts`

In the `AUDIO_SOUND_IDS` array, insert `'sfx.contract'` immediately after `'sfx.inbox'` (around line 38):

```ts
  'sfx.inbox',
  'sfx.contract',
```

Then locate the `'sfx.inbox'` entry in the definitions record (around line 254) and add a matching entry below it. Copy the shape of `sfx.inbox` — category, load, mode, volume — and substitute the new id/src:

```ts
  'sfx.contract': {
    id: 'sfx.contract',
    src: '/sound/sfx.contract.mp3',
    category: 'sfx' satisfies AudioCategory,
    load: 'eager',
    mode: 'restart',
    volume: 0.8,
  },
```

(If `sfx.inbox` uses different `load` / `mode` / `volume` / `effects` keys, mirror those exactly — the goal is behavior parity with the existing inbox cue. If unclear, re-read the `sfx.inbox` entry in the same file and copy it verbatim, then edit only `id` and `src`.)

- [ ] **Step 3.4 — Add the director method**

File: `src/audio/UiAudioDirector.ts`

Immediately after the existing `notifyInboxMessage()` method (around line 195), add:

```ts
  /**
   * A contract-origin ship message has arrived. Distinct cue from the regular
   * inbox ping so players instantly recognise a contract update on the /map.
   */
  notifyContractUpdate(): void {
    this.audio.play('sfx.contract', { volume: 0.7 })
  }
```

- [ ] **Step 3.5 — Run all audio tests to verify**

Run: `bun test:unit src/audio`

Expected: PASS.

- [ ] **Step 3.6 — Commit**

```bash
git add src/audio/audioManifest.ts src/audio/__tests__/audioManifest.spec.ts src/audio/UiAudioDirector.ts
git commit -m "feat(audio): register sfx.contract and notifyContractUpdate cue"
```

---

## Task 4 — `MapContractNotice.vue` component

**Files:**
- Create: `src/components/MapContractNotice.vue`

Thin presentational component that mirrors the shape of the existing `map-message-notice` pill in cyan. No tests — pure presentational (per the project's ground rule that tests focus on `src/lib/`).

- [ ] **Step 4.1 — Create the component**

File: `src/components/MapContractNotice.vue`

```vue
<script setup lang="ts">
/**
 * Cyan tactical-map notification pill for contract-origin ship messages.
 *
 * Sibling of the blue `map-message-notice` rendered in {@link MapView.vue}.
 * Consumers compute the label through {@link contractNoticeLabel} and handle
 * the `click` event by deep-linking `ShuttleControlOverlay` into the contract
 * folder + target message.
 *
 * @author guinetik
 * @date 2026-04-23
 * @spec docs/superpowers/specs/2026-04-23-contract-notification-channel-design.md
 */
import { uiAudio } from '@/audio/UiAudioDirector'

defineProps<{
  /** Pre-computed pill text (e.g. `"CONTRACT UPDATED: Gravity Surfer"`). */
  label: string
}>()

const emit = defineEmits<{
  click: []
}>()

function onClick(): void {
  uiAudio.notifyConfirm()
  emit('click')
}
</script>

<template>
  <div class="map-contract-notice">
    <button type="button" class="map-contract-notice__button" @click="onClick">
      {{ label }}
    </button>
  </div>
</template>

<style scoped>
.map-contract-notice {
  pointer-events: auto;
}

.map-contract-notice__button {
  appearance: none;
  background: rgba(106, 232, 196, 0.12);
  border: 1px solid rgba(106, 232, 196, 0.5);
  color: #6ae8c4;
  padding: 10px 18px;
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
  border-radius: 2px;
  box-shadow: inset 3px 0 0 #6ae8c4, 0 0 18px rgba(106, 232, 196, 0.25);
  transition: background 120ms ease, box-shadow 120ms ease;
}

.map-contract-notice__button:hover {
  background: rgba(106, 232, 196, 0.22);
  box-shadow: inset 3px 0 0 #6ae8c4, 0 0 24px rgba(106, 232, 196, 0.4);
}
</style>
```

- [ ] **Step 4.2 — Type-check to confirm**

Run: `bun run type-check`

Expected: PASS — no new TS errors (component is unused so far but must type-check cleanly).

- [ ] **Step 4.3 — Commit**

```bash
git add src/components/MapContractNotice.vue
git commit -m "feat(ui): cyan MapContractNotice pill for contract-origin messages"
```

---

## Task 5 — Focus props on `ShuttleControlProgramMail.vue`

**Files:**
- Modify: `src/components/shuttle-control/ShuttleControlProgramMail.vue`

Accept `focusFolderId` and `focusMessageId` props and, when both appear in one update, jump the inbox to that folder and select that message. The parent clears the refs after the jump so the deep-link is one-shot.

- [ ] **Step 5.1 — Extend the `defineEmits` / props block and add a watcher**

File: `src/components/shuttle-control/ShuttleControlProgramMail.vue`

At the top of the `<script setup>`, replace the existing `import { computed, onUnmounted, ref } from 'vue'` line with:

```ts
import { computed, onUnmounted, ref, watch } from 'vue'
```

Below the existing `defineEmits` call, add a `defineProps` block (this file currently has no props — the new props are the first). If there is already a `defineProps` call, extend it rather than introduce a second:

```ts
const props = defineProps<{
  /** Folder id to force-select when the mail program is opened via deep-link. */
  focusFolderId?: string
  /** Message id to force-select within {@link focusFolderId}. */
  focusMessageId?: string
}>()
```

Then, immediately after `refreshAll()` is called at the end of the script (currently the last non-comment line in `<script setup>`), add:

```ts
watch(
  () => [props.focusFolderId, props.focusMessageId] as const,
  ([folderId, messageId]) => {
    if (!folderId || !messageId) return
    if (selectedFolderId.value !== folderId) {
      selectedFolderId.value = folderId
      refreshRows()
    }
    selectRow(messageId, { autoplayAudio: true })
  },
  { immediate: true },
)
```

`{ immediate: true }` handles the case where the component is freshly mounted with props already set (overlay opening with deep-link on first render).

- [ ] **Step 5.2 — Type-check**

Run: `bun run type-check`

Expected: PASS.

- [ ] **Step 5.3 — Commit**

```bash
git add src/components/shuttle-control/ShuttleControlProgramMail.vue
git commit -m "feat(mail): focusFolderId/focusMessageId props for deep-link selection"
```

---

## Task 6 — Focus forwarding on `ShuttleControlOverlay.vue`

**Files:**
- Modify: `src/components/ShuttleControlOverlay.vue`

Accept the two deep-link props and pass them through to the mail program.

- [ ] **Step 6.1 — Add the props**

File: `src/components/ShuttleControlOverlay.vue`

In the `defineProps` block (around line 20), add after `programToSelectOnOpen`:

```ts
  /** Deep-link: folder id to pre-select in the mail program when the overlay opens. */
  mailFocusFolderId?: string
  /** Deep-link: message id to pre-select within {@link mailFocusFolderId}. */
  mailFocusMessageId?: string
```

- [ ] **Step 6.2 — Forward the props to the mail program**

In the `<template>` section, locate the `<component :is="activeProgram" ... />` usage (if dynamic) or the direct `<ShuttleControlProgramMail ... />` usage. Ensure the mail program receives the new props. If the overlay uses a dynamic `<component>` with shared props, add a `v-if`-branched passthrough that only forwards the focus props when the active screen is `mail`:

```vue
<ShuttleControlProgramMail
  v-if="activeScreen === 'mail'"
  :focus-folder-id="mailFocusFolderId"
  :focus-message-id="mailFocusMessageId"
  @mail-changed="onMailProgramChanged"
/>
<component
  v-else
  :is="activeProgram"
  ...
/>
```

Preserve whatever other bindings the mail program already receives in the original usage — inspect the current template before editing and copy them onto the new explicit `<ShuttleControlProgramMail>` element.

If the overlay already renders `<ShuttleControlProgramMail>` directly (not via `<component>`), simply add `:focus-folder-id` and `:focus-message-id` bindings alongside the existing ones.

- [ ] **Step 6.3 — Type-check**

Run: `bun run type-check`

Expected: PASS.

- [ ] **Step 6.4 — Commit**

```bash
git add src/components/ShuttleControlOverlay.vue
git commit -m "feat(overlay): forward mailFocusFolderId/MessageId to mail program"
```

---

## Task 7 — Two-channel wiring in `MapView.vue`

**Files:**
- Modify: `src/views/MapView.vue`

Split the active-message state into two channels, mount `MapContractNotice`, route arrival audio by kind, and deep-link the shuttle-control overlay when the cyan pill is clicked.

- [ ] **Step 7.1 — Add imports**

At the top of the `<script setup>` block, alongside existing imports:

```ts
import MapContractNotice from '@/components/MapContractNotice.vue'
import { contractNoticeLabel } from '@/lib/messages/contractNoticeLabel'
import { contractSystem } from '@/lib/contracts/runtime'
```

- [ ] **Step 7.2 — Replace single active-message state with two channels**

Locate (around lines 105–107):

```ts
const activeMessage = ref<ActiveShipMessage | null>(null)
const pendingMessageCount = ref(0)
const messageDialogVisible = ref(false)
```

Replace with:

```ts
const activeInboxMessage = ref<ActiveShipMessage | null>(null)
const activeContractMessage = ref<ActiveShipMessage | null>(null)
const pendingInboxCount = ref(0)
const messageDialogVisible = ref(false)

const INBOX_FILTER = (def: { contractMessageKind?: string }): boolean =>
  def.contractMessageKind === undefined
const CONTRACT_FILTER = (def: { contractMessageKind?: string }): boolean =>
  def.contractMessageKind !== undefined
```

(The filter type annotation intentionally uses a minimal shape so the helper does not require an extra `ShipMessageDefinition` import here; `MessageSystem` accepts any predicate compatible with its full signature.)

- [ ] **Step 7.3 — Rewrite `refreshActiveMessage`**

Replace the entire `refreshActiveMessage` function (currently around lines 122–137) with:

```ts
function refreshActiveMessage(): void {
  const prevInboxCount = pendingInboxCount.value
  const prevContractId = activeContractMessage.value?.id ?? null

  // Inbox channel — do not swap the dialog out from under the user.
  if ((messageDialogVisible.value || mapIntro.messageDialogVisible) && activeInboxMessage.value) {
    pendingInboxCount.value = shipMessageSystem.getPendingMessageCount(INBOX_FILTER)
  } else {
    activeInboxMessage.value = shipMessageSystem.getActiveMessage(INBOX_FILTER)
    pendingInboxCount.value = shipMessageSystem.getPendingMessageCount(INBOX_FILTER)
    if (!activeInboxMessage.value) {
      messageDialogVisible.value = false
    }
  }
  if (pendingInboxCount.value > prevInboxCount) uiAudio.notifyInboxMessage()

  // Contract channel — independent from the inbox dialog state.
  const nextContract = shipMessageSystem.getActiveMessage(CONTRACT_FILTER)
  activeContractMessage.value = nextContract
  const nextContractId = nextContract?.id ?? null
  if (nextContractId && nextContractId !== prevContractId) {
    uiAudio.notifyContractUpdate()
  }
}
```

- [ ] **Step 7.4 — Update `openMessage` and `dismissActiveMessage` to reference `activeInboxMessage`**

Replace the `openMessage` and `dismissActiveMessage` functions (currently around lines 139–163) with:

```ts
function openMessage(): void {
  uiAudio.notifyConfirm()
  if (activeInboxMessage.value?.status === 'pending') {
    shipMessageSystem.markShown(activeInboxMessage.value.id)
    activeInboxMessage.value = { ...activeInboxMessage.value, status: 'shown' }
    pendingInboxCount.value = shipMessageSystem.getPendingMessageCount(INBOX_FILTER)
  }
  messageAudioAutoplayToken.value += 1

  if (mapIntro.controlsLocked) {
    viewController.openIntroMessage()
  } else {
    messageDialogVisible.value = true
  }
}

function dismissActiveMessage(): void {
  if (!activeInboxMessage.value) return
  shipMessageSystem.dismiss(activeInboxMessage.value.id)
  if (mapIntro.controlsLocked) {
    viewController.completeIntroMessage()
  }
  messageDialogVisible.value = false
  refreshActiveMessage()
}
```

- [ ] **Step 7.5 — Update `messagePromptLabel`**

Replace the existing `messagePromptLabel` function (currently around lines 165–169) with:

```ts
function messagePromptLabel(): string {
  return pendingInboxCount.value === 1
    ? 'You have 1 new message'
    : `You have ${pendingInboxCount.value} new messages`
}
```

- [ ] **Step 7.6 — Add the contract-pill label computed and click handler**

Add below `messagePromptLabel`:

```ts
const contractNoticePill = computed<string | null>(() => {
  const readable = activeContractMessage.value
  if (!readable) return null
  const contractId = readable.contractId
  if (!contractId) return null
  const contract = contractSystem.getContract(contractId)
  return contractNoticeLabel(
    { ...readable, inboxStatus: readable.status },
    contract?.inboxName ?? null,
  )
})

/** Deep-link state forwarded to ShuttleControlOverlay when the cyan pill is clicked. */
const shuttleControlMailFocusFolderId = ref<string | undefined>(undefined)
const shuttleControlMailFocusMessageId = ref<string | undefined>(undefined)

function openContractMessage(): void {
  const readable = activeContractMessage.value
  if (!readable?.contractId) return
  uiAudio.notifyConfirm()
  shuttleControlMailFocusFolderId.value = readable.contractId
  shuttleControlMailFocusMessageId.value = readable.id
  shuttleControlProgramOnOpen.value = 'mail'
  shuttleControlVisible.value = true
  if (readable.status === 'pending') {
    shipMessageSystem.markShown(readable.id)
  }
  refreshActiveMessage()
}
```

Also extend the existing `watch(shuttleControlVisible, ...)` around line 245. Replace it with:

```ts
watch(shuttleControlVisible, (visible) => {
  if (!visible) {
    shuttleControlProgramOnOpen.value = undefined
    shuttleControlMailFocusFolderId.value = undefined
    shuttleControlMailFocusMessageId.value = undefined
  }
})
```

- [ ] **Step 7.7 — Update references to `activeMessage` and `pendingMessageCount` in the template**

Search the template for every `activeMessage` and `pendingMessageCount` occurrence and update:

- `activeMessage` → `activeInboxMessage` everywhere it appears
- `pendingMessageCount` → `pendingInboxCount` everywhere it appears

Specifically audit:
- Line ~1313 (`v-if="mapIntro.messagePromptVisible && activeMessage"`)
- Lines ~1322–1346 (the `map-message-notice` + `ShipMessageDialog` block)

- [ ] **Step 7.8 — Mount the cyan pill in the template**

Immediately after the closing `</div>` of the existing `map-message-notice` block (around line 1340, just before `<ShipMessageDialog ... />`), add:

```vue
<MapContractNotice
  v-if="
    !mapOverlay.visible &&
    !mapIntro.controlsLocked &&
    !earthStartupOrbitHudSuppressed &&
    contractNoticePill &&
    activeContractMessage
  "
  :label="contractNoticePill"
  @click="openContractMessage"
/>
```

Position: the cyan pill should sit visually **above** the blue pill. If the pills share a stacking container, ensure CSS puts the cyan one first in flex/DOM order. If they render as independent absolute-positioned elements, no change is needed — the `MapContractNotice` above still renders atop the blue one if it is emitted above the blue one in the DOM. Verify by inspecting the existing `map-message-notice` CSS (`scss` block in `MapView.vue`).

- [ ] **Step 7.9 — Forward the focus refs to `ShuttleControlOverlay`**

Locate the `<ShuttleControlOverlay ... />` usage (around line 1402). Add two new bindings alongside the existing ones:

```vue
<ShuttleControlOverlay
  :visible="shuttleControlVisible"
  ...
  :program-to-select-on-open="shuttleControlProgramOnOpen"
  :mail-focus-folder-id="shuttleControlMailFocusFolderId"
  :mail-focus-message-id="shuttleControlMailFocusMessageId"
  ...
/>
```

Preserve all existing bindings.

- [ ] **Step 7.10 — Type-check and lint**

Run:
```bash
bun run type-check
```
Expected: PASS.

Run:
```bash
bun run lint
```
Expected: PASS — oxlint 0 errors, ESLint 0 errors / 0 warnings. If TSDoc errors surface for the new props or functions, add `/** ... */` blocks matching the style of neighboring code.

- [ ] **Step 7.11 — Commit**

```bash
git add src/views/MapView.vue
git commit -m "feat(map): split inbox/contract notification channels with cyan pill"
```

---

## Task 8 — Full verification

**Files:** (no edits)

Final gate aligned with `CLAUDE.md` merge criteria.

- [ ] **Step 8.1 — Run type-check**

Run: `bun run type-check`

Expected: PASS.

- [ ] **Step 8.2 — Run lint**

Run: `bun run lint`

Expected: oxlint 0 errors, ESLint 0 errors / 0 warnings.

- [ ] **Step 8.3 — Run the full test suite**

Run: `bun run test:unit`

Expected: all Vitest tests green, including the two new specs:
- `src/lib/messages/__tests__/contractNoticeLabel.spec.ts`
- `src/lib/messages/__tests__/messageSystem.spec.ts` (new `describe` blocks)

And the updated audio manifest spec.

- [ ] **Step 8.4 — Manual smoke (dev server)**

Per `CLAUDE.md`'s UI-change rule: start the dev server and verify the feature in a browser.

```bash
bun dev
```

Check:
1. Receive a regular (non-contract) ship message → blue pill appears, click opens `ShipMessageDialog`, dismiss clears pill.
2. Trigger a contract message (any intro / step / completion). Cyan pill appears with the correct label. Distinct `sfx.contract` cue plays on arrival.
3. Click the cyan pill → `ShuttleControlOverlay` opens on the mail tab, the contract folder is selected, the target message is highlighted, `ContractAcceptCard` renders when applicable. Cyan pill disappears.
4. With both channels pending simultaneously, both pills render; clicking one does not affect the other.
5. Close shuttle-control overlay without acknowledging a still-pinned brief → pill state remains consistent (brief is `shown`, not `pending`, so cyan pill stays gone).

Report any regression against these expectations before declaring the task complete.

---

## Self-Review

**Spec coverage:**
- Architecture (view-layer split only): Tasks 2, 7 ✓
- Two stacked pills: Task 7.8 ✓
- Label by kind (`NEW CONTRACT OFFER` / `CONTRACT UPDATED: X` / `CONTRACT COMPLETE: X`): Task 1 ✓
- Click deep-links ShuttleControlOverlay: Tasks 5, 6, 7.6, 7.9 ✓
- No special-case for overlay-open: Task 7 ✓ (handler runs regardless of `shuttleControlVisible`)
- Distinct `sfx.contract` cue: Task 3 ✓
- Single cyan color (no per-kind hue): Task 4 ✓
- Contract messages excluded from blue count: Task 7.2, 7.5 ✓ (filter-based)
- `MapContractNotice.vue`: Task 4 ✓
- Focus props on mail program + overlay: Tasks 5, 6 ✓
- `contractNoticeLabel` helper in `src/lib/messages/`: Task 1 ✓
- Audio manifest test + contractNoticeLabel test: Tasks 1, 3 ✓
- Merge criteria gate: Task 8 ✓

**Placeholder scan:** No TBDs. Every code step has the full code. Every command step has the exact command and expected output. File paths are exact.

**Type consistency:**
- `activeInboxMessage` / `activeContractMessage` referenced consistently across Tasks 7.2–7.9
- `pendingInboxCount` referenced consistently (replaced `pendingMessageCount` everywhere in Task 7.7)
- `shuttleControlMailFocusFolderId` / `shuttleControlMailFocusMessageId` introduced in Task 7.6, forwarded in Task 7.9, cleared in Task 7.6
- `mailFocusFolderId` / `mailFocusMessageId` on `ShuttleControlOverlay` (Task 6.1) match the kebab-case bindings in Task 7.9 (`:mail-focus-folder-id` / `:mail-focus-message-id`)
- `focusFolderId` / `focusMessageId` on `ShuttleControlProgramMail` (Task 5.1) match the kebab-case bindings in Task 6.2 (`:focus-folder-id` / `:focus-message-id`)
- `notifyContractUpdate()` defined in Task 3.4, called in Task 7.3
- `contractNoticeLabel(message, contractName)` signature matches its usage in Task 7.6
