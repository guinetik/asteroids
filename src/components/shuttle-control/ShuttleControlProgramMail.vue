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
import { computed, onUnmounted, ref } from 'vue'
import { shipMessageSystem } from '@/lib/messages/runtime'
import {
  DEFAULT_INBOX_FOLDER_ID,
  type ShipMessageFolder,
  type ShipMessageInboxRow,
  type ShipMessageReadable,
} from '@/lib/messages/messageTypes'
import { acceptContractWithRetroEval, contractSystem, onContractsChanged } from '@/lib/contracts/runtime'
import ShipMessageAudioPlayer from './ShipMessageAudioPlayer.vue'
import ContractAcceptCard from './ContractAcceptCard.vue'

const emit = defineEmits<{
  mailChanged: []
}>()

const folders = ref<ShipMessageFolder[]>(shipMessageSystem.listFolders())
const selectedFolderId = ref<string>(DEFAULT_INBOX_FOLDER_ID)
const rows = ref<ShipMessageInboxRow[]>(shipMessageSystem.listInboxRows(selectedFolderId.value))
const selectedId = ref<string | null>(null)
const selectedAudioAutoplayToken = ref(0)
const readerRefreshToken = ref(0)

function refreshFolders(): void {
  folders.value = shipMessageSystem.listFolders()
}

function refreshRows(): void {
  rows.value = shipMessageSystem.listInboxRows(selectedFolderId.value)
}

function refreshAll(): void {
  refreshFolders()
  refreshRows()
  readerRefreshToken.value += 1
}

const readable = computed<ShipMessageReadable | null>(() => {
  readerRefreshToken.value
  if (!selectedId.value) return null
  return shipMessageSystem.getReadableShipMessage(selectedId.value)
})

const activeContract = computed(() => {
  const r = readable.value
  if (!r || !r.contractId) return null
  if (r.contractMessageKind !== 'intro') return null
  const contract = contractSystem.getContract(r.contractId)
  if (!contract) return null
  return {
    contract,
    instance: contractSystem.getInstance(r.contractId),
  }
})

function statusLabel(row: ShipMessageInboxRow): string {
  if (row.status === 'locked') return 'Locked'
  if (row.status === 'pending') return 'Unread'
  if (row.status === 'shown') return 'Read'
  return 'Archived'
}

function selectFolder(folderId: string): void {
  if (selectedFolderId.value === folderId) return
  selectedFolderId.value = folderId
  selectedId.value = null
  refreshRows()
  const firstRow = rows.value[0]
  if (firstRow) selectRow(firstRow.id)
}

function selectRow(id: string, options: { autoplayAudio?: boolean } = {}): void {
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
const firstRow = rows.value[0]
if (firstRow) {
  selectRow(firstRow.id)
}
</script>

<template>
  <div class="shuttle-mail-program">
    <div class="shuttle-mail-program__folder">
      <div class="shuttle-mail-program__folder-title">ShipNet</div>
      <div class="shuttle-mail-program__folder-list" role="list">
        <button
          v-for="folder in folders"
          :key="folder.id"
          type="button"
          class="shuttle-mail-program__folder-entry"
          :class="{ 'shuttle-mail-program__folder-entry--active': selectedFolderId === folder.id }"
          role="listitem"
          @click="selectFolder(folder.id)"
        >
          <span class="shuttle-mail-program__folder-label">{{ folder.label }}</span>
          <span
            v-if="folder.unread > 0"
            class="shuttle-mail-program__folder-badge"
            :title="`${folder.unread} unread`"
          >
            {{ folder.unread }}
          </span>
        </button>
      </div>
      <p class="shuttle-mail-program__folder-hint">
        Messages arrive as you fly. Archived mail stays readable here. Contract folders appear when offered.
      </p>
    </div>

    <div class="shuttle-mail-program__list" role="listbox" :aria-label="'Ship messages'">
      <button
        v-for="row in rows"
        :key="row.id"
        type="button"
        role="option"
        class="shuttle-mail-program__row"
        :class="{
          'shuttle-mail-program__row--active': selectedId === row.id,
          'shuttle-mail-program__row--unread': row.isUnread,
          'shuttle-mail-program__row--locked': row.status === 'locked',
        }"
        :aria-selected="selectedId === row.id"
        @click="selectRow(row.id, { autoplayAudio: true })"
      >
        <span class="shuttle-mail-program__row-from">{{ row.from }}</span>
        <span class="shuttle-mail-program__row-subject">{{ row.subject }}</span>
        <span class="shuttle-mail-program__row-meta">{{ row.sentAt }} · {{ statusLabel(row) }}</span>
        <span class="shuttle-mail-program__row-preview">{{ row.preview }}</span>
      </button>
      <p v-if="rows.length === 0" class="shuttle-mail-program__row-empty">
        No messages in this folder yet.
      </p>
    </div>

    <div class="shuttle-mail-program__reader">
      <template v-if="!selectedId">
        <p class="shuttle-mail-program__reader-empty">Select a message</p>
      </template>
      <template v-else-if="!readable">
        <p class="shuttle-mail-program__reader-empty">
          This message has not been delivered yet. It will appear after the matching in-flight event.
        </p>
      </template>
      <template v-else>
        <header class="shuttle-mail-program__reader-header">
          <div class="shuttle-mail-program__reader-header-row">
            <div class="shuttle-mail-program__reader-header-text">
              <h2 class="shuttle-mail-program__reader-subject">{{ readable.subject }}</h2>
              <div class="shuttle-mail-program__reader-meta">
                <span
                  ><span class="shuttle-mail-program__reader-label">From</span>
                  {{ readable.from }}</span
                >
                <span
                  ><span class="shuttle-mail-program__reader-label">Date</span>
                  {{ readable.sentAt }}</span
                >
                <span
                  ><span class="shuttle-mail-program__reader-label">Status</span>
                  {{ inboxStatusDisplay(readable) }}</span
                >
              </div>
            </div>
            <div
              v-if="readable.inboxStatus !== 'dismissed'"
              class="shuttle-mail-program__reader-action"
            >
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
          </div>
        </header>
        <ShipMessageAudioPlayer
          v-if="readable.audioUrl"
          :key="readable.id"
          :message-id="readable.id"
          :audio-url="readable.audioUrl"
          :autoplay-token="selectedAudioAutoplayToken"
        />
        <div v-if="readable.audioUrl" class="shuttle-mail-program__audio-divider" aria-hidden="true" />
        <div class="shuttle-mail-program__reader-body">
          <p v-for="(paragraph, index) in readable.body" :key="`${readable.id}-${index}`">
            {{ paragraph }}
          </p>
        </div>
        <ContractAcceptCard
          v-if="activeContract"
          :contract="activeContract.contract"
          :instance="activeContract.instance"
          @accept="acceptContract"
          @decline="declineContract"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.shuttle-mail-program__audio-divider {
  margin: 18px 0 20px;
  border-top: 1px solid rgba(177, 228, 214, 0.16);
}

.shuttle-mail-program__folder-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}

.shuttle-mail-program__folder-entry {
  display: flex;
  justify-content: space-between;
  align-items: center;
  appearance: none;
  background: transparent;
  border: 1px solid transparent;
  color: inherit;
  padding: 8px 10px;
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
  transition: background 120ms ease, border-color 120ms ease;
}

.shuttle-mail-program__folder-entry:hover {
  background: rgba(177, 228, 214, 0.08);
}

.shuttle-mail-program__folder-entry--active {
  background: rgba(106, 232, 196, 0.18);
  border-color: rgba(106, 232, 196, 0.4);
  color: #6ae8c4;
}

.shuttle-mail-program__folder-label {
  flex: 1;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.shuttle-mail-program__folder-badge {
  background: rgba(106, 232, 196, 0.28);
  color: #062b27;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.shuttle-mail-program__row-empty {
  margin: 12px;
  font-size: 12px;
  color: rgba(177, 228, 214, 0.55);
  font-style: italic;
}
</style>
