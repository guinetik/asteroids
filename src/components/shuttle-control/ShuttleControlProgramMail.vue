<script setup lang="ts">
import { computed, ref } from 'vue'
import { shipMessageSystem } from '@/lib/messages/runtime'
import type { ShipMessageInboxRow, ShipMessageReadable } from '@/lib/messages/messageTypes'
import ShipMessageAudioPlayer from './ShipMessageAudioPlayer.vue'

const emit = defineEmits<{
  mailChanged: []
}>()

const rows = ref<ShipMessageInboxRow[]>(shipMessageSystem.listInboxRows())
const selectedId = ref<string | null>(null)
const selectedAudioAutoplayToken = ref(0)

function refreshRows(): void {
  rows.value = shipMessageSystem.listInboxRows()
}

const readable = computed<ShipMessageReadable | null>(() => {
  if (!selectedId.value) return null
  return shipMessageSystem.getReadableShipMessage(selectedId.value)
})

function statusLabel(row: ShipMessageInboxRow): string {
  if (row.status === 'locked') return 'Locked'
  if (row.status === 'pending') return 'Unread'
  if (row.status === 'shown') return 'Read'
  return 'Archived'
}

function selectRow(id: string, options: { autoplayAudio?: boolean } = {}): void {
  selectedId.value = id
  if (options.autoplayAudio) {
    selectedAudioAutoplayToken.value += 1
  }
  const record = shipMessageSystem.getRecord(id)
  if (record?.status === 'pending') {
    shipMessageSystem.markShown(id)
    refreshRows()
    emit('mailChanged')
  }
}

function dismissSelected(): void {
  if (!selectedId.value) return
  const r = shipMessageSystem.getReadableShipMessage(selectedId.value)
  if (!r || r.inboxStatus === 'dismissed') return
  shipMessageSystem.dismiss(selectedId.value)
  refreshRows()
  emit('mailChanged')
}

function inboxStatusDisplay(msg: ShipMessageReadable): string {
  if (msg.inboxStatus === 'dismissed') return 'Archived'
  if (msg.inboxStatus === 'pending') return 'Unread'
  return 'Read'
}

refreshRows()
const firstRow = rows.value[0]
if (firstRow) {
  selectRow(firstRow.id)
}
</script>

<template>
  <div class="shuttle-mail-program">
    <div class="shuttle-mail-program__folder">
      <div class="shuttle-mail-program__folder-title">ShipNet</div>
      <div class="shuttle-mail-program__folder-active">Inbox</div>
      <p class="shuttle-mail-program__folder-hint">
        Messages arrive as you fly. Archived mail stays readable here.
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
          <h2 class="shuttle-mail-program__reader-subject">{{ readable.subject }}</h2>
          <div class="shuttle-mail-program__reader-meta">
            <span><span class="shuttle-mail-program__reader-label">From</span> {{ readable.from }}</span>
            <span><span class="shuttle-mail-program__reader-label">Date</span> {{ readable.sentAt }}</span>
            <span
              ><span class="shuttle-mail-program__reader-label">Status</span>
              {{ inboxStatusDisplay(readable) }}</span
            >
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
        <footer v-if="readable.inboxStatus !== 'dismissed'" class="shuttle-mail-program__reader-footer">
          <button type="button" class="ship-message-card__button" @click="dismissSelected">
            Archive
          </button>
          <span class="ship-message-card__hint">Removes from orbit alerts; stays in this inbox</span>
        </footer>
      </template>
    </div>
  </div>
</template>

<style scoped>
.shuttle-mail-program__audio-divider {
  margin: 18px 0 20px;
  border-top: 1px solid rgba(177, 228, 214, 0.16);
}
</style>
