<script setup lang="ts">
/**
 * ShipNet inbox program rendered inside the shuttle control terminal.
 *
 * Hosts the folder sidebar (driven by {@link MessageSystem.listFolders}), the per-folder
 * row list, and the message reader. When the selected message is a contract intro, the
 * reader injects {@link ContractAcceptCard} above the body so the player can accept or
 * decline directly from the mail UI.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-20-contracts-design.md
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { shipMessageSystem } from '@/lib/messages/runtime'
import { uiAudio } from '@/audio/UiAudioDirector'
import type {
  ShipMessageFolder,
  ShipMessageInboxRow,
  ShipMessageReadable,
} from '@/lib/messages/messageTypes'
import { buildMailFolderSections } from '@/lib/messages/mailFolderSections'
import {
  acceptContractWithRetroEval,
  contractSystem,
  onContractsChanged,
} from '@/lib/contracts/runtime'
import ShipMessageAudioPlayer from './ShipMessageAudioPlayer.vue'
import ContractAcceptCard from './ContractAcceptCard.vue'

const emit = defineEmits<{
  mailChanged: []
}>()

const props = defineProps<{
  /** Folder id to force-select when the mail program is opened via deep-link. */
  focusFolderId?: string
  /** Message id to force-select within {@link focusFolderId}. */
  focusMessageId?: string
}>()

const folders = ref<ShipMessageFolder[]>(shipMessageSystem.listFolders())
const rowsByFolderId = ref<Record<string, ShipMessageInboxRow[]>>({})
const expandedFolderIds = ref<Set<string>>(new Set())
const selectedId = ref<string | null>(null)
const selectedAudioAutoplayToken = ref(0)
const readerRefreshToken = ref(0)

function refreshFolders(): void {
  folders.value = shipMessageSystem.listFolders()
}

function refreshRowsByFolder(): void {
  rowsByFolderId.value = Object.fromEntries(
    folders.value.map((folder) => [folder.id, shipMessageSystem.listInboxRows(folder.id)]),
  )
}

function refreshAll(): void {
  refreshFolders()
  refreshRowsByFolder()
  readerRefreshToken.value += 1
}

const readable = computed<ShipMessageReadable | null>(() => {
  // Touch the token so this computed re-runs after `refreshAll()` increments it.
  void readerRefreshToken.value
  if (!selectedId.value) return null
  return shipMessageSystem.getReadableShipMessage(selectedId.value)
})

const activeContract = computed(() => {
  const r = readable.value
  if (!r || !r.contractId) return null
  if (r.contractMessageKind === undefined) return null
  const contract = contractSystem.getContract(r.contractId)
  if (!contract) return null
  return {
    contract,
    instance: contractSystem.getInstance(r.contractId),
  }
})

const sections = computed(() =>
  buildMailFolderSections({
    folders: folders.value,
    rowsByFolderId: rowsByFolderId.value,
    expandedFolderIds: expandedFolderIds.value,
    selectedMessageId: selectedId.value,
  }),
)

/**
 * The accept/decline card is intentionally surfaced only on the two
 * messages where the player can meaningfully act on the contract:
 *
 * - `brief` (the pinned active brief, delivered on accept) → renders
 *   above the body, since it's the live progress dossier the player
 *   returns to mid-run.
 * - `intro` while the contract is still `available` → renders below the
 *   body, so the accept/decline buttons sit at the natural reading
 *   end of the pitch.
 *
 * Step flavor messages and the completion message intentionally render
 * *no* card even when the contract is active/completed — those are
 * one-shot lore beats, not action surfaces, and stacking the live
 * progress card on top of every step retread visually duplicates the
 * pinned brief that's always one click away.
 */
const showContractCardAbove = computed(() => {
  if (!activeContract.value) return false
  return readable.value?.contractMessageKind === 'brief'
})

const showContractCardBelow = computed(() => {
  const entry = activeContract.value
  if (!entry) return false
  if (readable.value?.contractMessageKind !== 'intro') return false
  const status = entry.instance?.status ?? 'available'
  return status === 'available'
})

const canAcknowledgeSelected = computed(() => {
  const r = readable.value
  if (!r) return false
  if (r.inboxStatus === 'dismissed') return false
  if (r.pinned) return false
  return true
})

function statusLabel(row: ShipMessageInboxRow): string {
  if (row.status === 'locked') return 'Locked'
  if (row.status === 'pending') return 'Unread'
  if (row.status === 'shown') return 'Read'
  return 'Archived'
}

function openFolder(folderId: string): void {
  if (expandedFolderIds.value.has(folderId)) return
  expandedFolderIds.value = new Set([...expandedFolderIds.value, folderId])
}

function toggleFolder(folderId: string): void {
  uiAudio.notifyButtonClick()
  const next = new Set(expandedFolderIds.value)
  if (next.has(folderId)) {
    next.delete(folderId)
  } else {
    next.add(folderId)
  }
  expandedFolderIds.value = next
}

function selectRow(id: string, options: { autoplayAudio?: boolean } = {}): void {
  uiAudio.notifyConfirm()
  selectedId.value = id
  if (options.autoplayAudio) {
    selectedAudioAutoplayToken.value += 1
  }
  const record = shipMessageSystem.getRecord(id)
  if (record?.status === 'pending') {
    shipMessageSystem.markShown(id)
    refreshAll()
    emit('mailChanged')
  }
}

function dismissSelected(): void {
  if (!selectedId.value) return
  const r = shipMessageSystem.getReadableShipMessage(selectedId.value)
  if (!r || r.inboxStatus === 'dismissed') return
  uiAudio.notifyScanComplete()
  shipMessageSystem.dismiss(selectedId.value)
  refreshAll()
  emit('mailChanged')
}

function acceptContract(contractId: string): void {
  acceptContractWithRetroEval(contractId)
  refreshAll()
  emit('mailChanged')
}

function declineContract(contractId: string): void {
  contractSystem.declineContract(contractId)
  refreshAll()
  emit('mailChanged')
}

function inboxStatusDisplay(msg: ShipMessageReadable): string {
  if (msg.inboxStatus === 'dismissed') return 'Archived'
  if (msg.inboxStatus === 'pending') return 'Unread'
  return 'Read'
}

const unsubscribeContracts = onContractsChanged(() => {
  refreshAll()
  emit('mailChanged')
})

onUnmounted(() => {
  unsubscribeContracts()
})

refreshAll()

watch(
  () => [props.focusFolderId, props.focusMessageId] as const,
  ([folderId, messageId]) => {
    if (!folderId || !messageId) return
    openFolder(folderId)
    selectRow(messageId, { autoplayAudio: true })
  },
  { immediate: true },
)
</script>

<template>
  <div class="shuttle-mail-program">
    <div class="shuttle-mail-program__content">
      <div class="shuttle-mail-program__list" aria-label="Ship messages">
        <section
          v-for="section in sections"
          :key="section.folder.id"
          class="shuttle-mail-program__section"
          :class="{
            'shuttle-mail-program__section--expanded': section.isExpanded,
          }"
        >
          <button
            type="button"
            class="shuttle-mail-program__section-header"
            :aria-expanded="section.isExpanded"
            @click="toggleFolder(section.folder.id)"
          >
            <span class="shuttle-mail-program__section-title">
              <span class="shuttle-mail-program__section-chevron" aria-hidden="true">
                {{ section.isExpanded ? 'v' : '>' }}
              </span>
              {{ section.folder.label }}
            </span>
            <span class="shuttle-mail-program__section-meta">
              {{ section.folder.total }} {{ section.folder.total === 1 ? 'message' : 'messages' }}
            </span>
            <span
              v-if="section.folder.unread > 0"
              class="shuttle-mail-program__section-badge"
              :title="`${section.folder.unread} unread`"
            >
              {{ section.folder.unread }}
            </span>
          </button>

          <div
            v-if="section.isExpanded"
            class="shuttle-mail-program__section-rows"
            role="listbox"
            :aria-label="`${section.folder.label} messages`"
          >
            <button
              v-for="row in section.rows"
              :key="row.id"
              type="button"
              role="option"
              class="shuttle-mail-program__row"
              :class="{
                'shuttle-mail-program__row--active': selectedId === row.id,
                'shuttle-mail-program__row--unread': row.isUnread,
                'shuttle-mail-program__row--locked': row.status === 'locked',
                'shuttle-mail-program__row--pinned': row.pinned,
              }"
              :aria-selected="selectedId === row.id"
              @click="selectRow(row.id, { autoplayAudio: true })"
            >
              <span class="shuttle-mail-program__row-from">
                <span v-if="row.pinned" class="shuttle-mail-program__row-pin" aria-hidden="true">
                  📌
                </span>
                {{ row.from }}
              </span>
              <span class="shuttle-mail-program__row-subject">{{ row.subject }}</span>
              <span class="shuttle-mail-program__row-meta">
                <span v-if="row.pinned">Pinned · </span>{{ row.sentAt }} · {{ statusLabel(row) }}
              </span>
              <span class="shuttle-mail-program__row-preview">{{ row.preview }}</span>
            </button>
            <p v-if="section.rows.length === 0" class="shuttle-mail-program__row-empty">
              No messages in this folder yet.
            </p>
          </div>
        </section>
      </div>

      <div class="shuttle-mail-program__reader">
        <template v-if="!selectedId">
          <p class="shuttle-mail-program__reader-empty">Select a message</p>
        </template>
        <template v-else-if="!readable">
          <p class="shuttle-mail-program__reader-empty">
            This message has not been delivered yet. It will appear after the matching in-flight
            event.
          </p>
        </template>
        <template v-else>
          <header class="shuttle-mail-program__reader-header">
            <div class="shuttle-mail-program__reader-header-row">
              <div class="shuttle-mail-program__reader-header-text">
                <h2 class="shuttle-mail-program__reader-subject">{{ readable.subject }}</h2>
                <div class="shuttle-mail-program__reader-meta">
                  <div class="shuttle-mail-program__reader-meta-row">
                    <span class="shuttle-mail-program__reader-label">From</span>
                    <span class="shuttle-mail-program__reader-value">{{ readable.from }}</span>
                  </div>
                  <div class="shuttle-mail-program__reader-meta-row">
                    <span class="shuttle-mail-program__reader-label">Date</span>
                    <span class="shuttle-mail-program__reader-value">{{ readable.sentAt }}</span>
                  </div>
                  <div class="shuttle-mail-program__reader-meta-row">
                    <span class="shuttle-mail-program__reader-label">Status</span>
                    <span class="shuttle-mail-program__reader-value">{{
                      inboxStatusDisplay(readable)
                    }}</span>
                  </div>
                </div>
              </div>
              <div v-if="canAcknowledgeSelected" class="shuttle-mail-program__reader-action">
                <button
                  type="button"
                  class="shuttle-mail-program__acknowledge-button"
                  @click="dismissSelected"
                >
                  Acknowledge
                </button>
                <span class="shuttle-mail-program__acknowledge-hint">
                  Acknowledge to clear the alert and unlock follow-ups
                </span>
              </div>
              <div
                v-else-if="readable.pinned"
                class="shuttle-mail-program__reader-pinned"
                title="Pinned active brief — stays at the top of this folder"
              >
                <span aria-hidden="true">📌</span> Pinned brief
              </div>
            </div>
          </header>
          <ShipMessageAudioPlayer
            v-if="readable.audioUrl"
            :key="readable.id"
            :message-id="readable.id"
            :audio-url="readable.audioUrl"
            :autoplay-token="selectedAudioAutoplayToken"
          />
          <div
            v-if="readable.audioUrl"
            class="shuttle-mail-program__audio-divider"
            aria-hidden="true"
          />
          <ContractAcceptCard
            v-if="activeContract && showContractCardAbove"
            :contract="activeContract.contract"
            :instance="activeContract.instance"
            @accept="acceptContract"
            @decline="declineContract"
          />
          <div class="shuttle-mail-program__reader-body">
            <p v-for="(paragraph, index) in readable.body" :key="`${readable.id}-${index}`">
              {{ paragraph }}
            </p>
          </div>
          <ContractAcceptCard
            v-if="activeContract && showContractCardBelow"
            :contract="activeContract.contract"
            :instance="activeContract.instance"
            @accept="acceptContract"
            @decline="declineContract"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shuttle-mail-program {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: rgba(220, 248, 240, 0.9);
  overflow: hidden;
}

.shuttle-mail-program__content {
  display: grid;
  grid-template-columns: 320px 1fr;
  flex: 1;
  overflow: hidden;
}

.shuttle-mail-program__list {
  border-right: 1px solid rgba(106, 232, 196, 0.15);
  overflow-y: auto;
  background: rgba(106, 232, 196, 0.01);
}

.shuttle-mail-program__section {
  border-bottom: 1px solid rgba(106, 232, 196, 0.12);
}

.shuttle-mail-program__section-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 10px;
  align-items: center;
  appearance: none;
  width: 100%;
  background: rgba(106, 232, 196, 0.025);
  border: none;
  color: rgba(220, 248, 240, 0.82);
  padding: 14px 16px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background 120ms ease,
    color 120ms ease;
}

.shuttle-mail-program__section-header:hover {
  color: #b1e4d6;
  background: rgba(106, 232, 196, 0.07);
}

.shuttle-mail-program__section--expanded .shuttle-mail-program__section-header {
  background: rgba(106, 232, 196, 0.055);
}

.shuttle-mail-program__section-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  color: #6ae8c4;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.shuttle-mail-program__section-chevron {
  width: 12px;
  color: rgba(106, 232, 196, 0.7);
  font-size: 12px;
}

.shuttle-mail-program__section-meta {
  color: rgba(177, 228, 214, 0.42);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.shuttle-mail-program__section-badge {
  grid-column: 2;
  justify-self: end;
  background: rgba(106, 232, 196, 0.2);
  color: #6ae8c4;
  border-radius: 2px;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 600;
}

.shuttle-mail-program__section-rows {
  border-top: 1px solid rgba(106, 232, 196, 0.08);
}

.shuttle-mail-program__row {
  display: flex;
  flex-direction: column;
  appearance: none;
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(106, 232, 196, 0.08);
  color: inherit;
  padding: 16px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  width: 100%;
  transition: background 120ms ease;
}

.shuttle-mail-program__row:hover {
  background: rgba(106, 232, 196, 0.05);
}

.shuttle-mail-program__row--active {
  background:
    radial-gradient(circle at 18% 0%, rgba(106, 232, 196, 0.16), transparent 58%),
    rgba(106, 232, 196, 0.07);
  box-shadow:
    inset 0 0 0 1px rgba(106, 232, 196, 0.42),
    0 0 18px rgba(106, 232, 196, 0.08);
}

.shuttle-mail-program__row--unread {
  background: rgba(106, 232, 196, 0.03);
}

.shuttle-mail-program__row--unread .shuttle-mail-program__row-subject {
  color: #6ae8c4;
  font-weight: 600;
}

.shuttle-mail-program__row--pinned {
  background: rgba(106, 232, 196, 0.04);
  border-bottom: 1px solid rgba(106, 232, 196, 0.25);
  box-shadow: inset 3px 0 0 rgba(106, 232, 196, 0.5);
}

.shuttle-mail-program__row--pinned:hover {
  background: rgba(106, 232, 196, 0.09);
}

.shuttle-mail-program__row--pinned.shuttle-mail-program__row--active {
  box-shadow:
    inset 0 0 0 1px rgba(106, 232, 196, 0.5),
    0 0 18px rgba(106, 232, 196, 0.1);
}

.shuttle-mail-program__row--pinned .shuttle-mail-program__row-subject {
  color: #6ae8c4;
  font-weight: 600;
}

.shuttle-mail-program__row-pin {
  display: inline-block;
  margin-right: 6px;
  font-size: 11px;
  filter: hue-rotate(120deg) saturate(0.8);
}

.shuttle-mail-program__row-from {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(177, 228, 214, 0.5);
  margin-bottom: 6px;
}

.shuttle-mail-program__row-subject {
  font-size: 14px;
  margin-bottom: 8px;
  line-height: 1.3;
}

.shuttle-mail-program__row-meta {
  font-size: 10px;
  color: rgba(177, 228, 214, 0.4);
  margin-bottom: 8px;
}

.shuttle-mail-program__row-preview {
  font-size: 12px;
  color: rgba(177, 228, 214, 0.5);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
}

.shuttle-mail-program__row-empty {
  padding: 24px;
  font-size: 12px;
  color: rgba(177, 228, 214, 0.4);
  text-align: center;
  font-style: italic;
}

.shuttle-mail-program__reader {
  padding: 24px 32px;
  overflow-y: auto;
}

.shuttle-mail-program__reader-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(177, 228, 214, 0.3);
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.shuttle-mail-program__reader-header {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(106, 232, 196, 0.15);
}

.shuttle-mail-program__reader-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
}

.shuttle-mail-program__reader-subject {
  font-size: 20px;
  color: #6ae8c4;
  margin: 0 0 16px 0;
  font-weight: 400;
  letter-spacing: 0.02em;
}

.shuttle-mail-program__reader-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  color: rgba(177, 228, 214, 0.8);
}

.shuttle-mail-program__reader-meta-row {
  display: flex;
  align-items: center;
}

.shuttle-mail-program__reader-label {
  color: rgba(177, 228, 214, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 10px;
  width: 64px;
  flex-shrink: 0;
}

.shuttle-mail-program__reader-value {
  flex: 1;
}

.shuttle-mail-program__reader-action {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.shuttle-mail-program__acknowledge-button {
  appearance: none;
  background: rgba(106, 232, 196, 0.08);
  border: 1px solid rgba(106, 232, 196, 0.3);
  color: #6ae8c4;
  padding: 6px 12px;
  font-family: inherit;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: all 120ms ease;
  border-radius: 2px;
}

.shuttle-mail-program__acknowledge-button:hover {
  background: rgba(106, 232, 196, 0.2);
  border-color: #6ae8c4;
}

.shuttle-mail-program__acknowledge-hint {
  font-size: 10px;
  color: rgba(177, 228, 214, 0.4);
  max-width: 150px;
  text-align: right;
  line-height: 1.3;
}

.shuttle-mail-program__audio-divider {
  margin: 24px 0;
  border-top: 1px solid rgba(106, 232, 196, 0.15);
}

.shuttle-mail-program__reader-body {
  font-size: 14px;
  line-height: 1.6;
  color: rgba(220, 248, 240, 0.9);
  max-width: 65ch;
}

.shuttle-mail-program__reader-body p {
  margin: 0 0 16px 0;
}

.shuttle-mail-program__reader-body p:last-child {
  margin-bottom: 0;
}
</style>
